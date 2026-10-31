(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Baca dan tulis fail Excel (.xlsx) tanpa pustaka luar. xlsx = zip berisi XML.
  // Tulis: entri zip "stored" (tanpa mampatan). Baca: stored atau deflate (DecompressionStream).

  // ---------- zip ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = (s) => new TextEncoder().encode(s);

  TT.zipStore = (files) => {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, x) => a + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(e.buffer)]);
    const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0;
    for (const x of all) { out.set(x, p); p += x.length; }
    return out;
  };

  const inflateRaw = async (u8) => {
    if (typeof root.DecompressionStream !== 'function') throw new Error('Pelayar ini tidak dapat membuka fail Excel termampat. Kemas kini pelayar atau simpan sebagai CSV.');
    const ds = new root.DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  TT.zipRead = async (buf) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eo = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('Bukan fail Excel (.xlsx) yang sah.');
    const n = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true);
    const out = new Map(), dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      out.set(name, { method, data: u8.subarray(ds, ds + csize) });
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: [...out.keys()],
      text: async (name) => {
        const e = out.get(name); if (!e) return null;
        const raw = e.method === 0 ? e.data : e.method === 8 ? await inflateRaw(e.data) : null;
        if (!raw) throw new Error('Format mampatan fail tidak disokong.');
        return dec.decode(raw);
      }
    };
  };

  // ---------- xml ringkas ----------
  const unxml = (s) => String(s).replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()] ||
    (e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(+e.slice(1)))));
  const xml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unxml(m[1]) : ''; };
  const texts = (frag) => { let t = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m; while ((m = re.exec(frag))) t += unxml(m[1]); return t; };
  const colIdx = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const colName = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };

  // { sheets: [{ name, rows: [[nilai...]] }] }. Nilai: teks atau nombor.
  TT.xlsxRead = async (buf) => {
    const z = await TT.zipRead(buf);
    const wb = await z.text('xl/workbook.xml');
    if (!wb) throw new Error('Fail ini bukan buku kerja Excel (.xlsx).');
    const rels = (await z.text('xl/_rels/workbook.xml.rels')) || '';
    const target = new Map(); (rels.match(/<Relationship\b[^>]*>/g) || []).forEach((r) => target.set(attr(r, 'Id'), attr(r, 'Target')));
    const sst = []; const ss = await z.text('xl/sharedStrings.xml');
    if (ss) (ss.match(/<si>[\s\S]*?<\/si>/g) || []).forEach((si) => sst.push(texts(si)));
    const sheets = [];
    for (const tag of wb.match(/<sheet\b[^>]*>/g) || []) {
      const name = attr(tag, 'name'), rid = attr(tag, 'r:id');
      let t = target.get(rid) || ''; t = t.replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t;
      const x = await z.text(t); if (x == null) continue;
      const rows = [];
      for (const rm of x.match(/<row\b[^>]*>[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []) {
        const ri = (+attr(rm.slice(0, rm.indexOf('>') + 1), 'r') || rows.length + 1) - 1, row = [];
        const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm, ci = 0;
        while ((cm = cre.exec(rm))) {
          const a = cm[1], body = cm[2] || '', ref = attr('<c ' + a + '>', 'r'), type = attr('<c ' + a + '>', 't');
          const i = ref ? colIdx(ref) : ci; ci = i + 1;
          const v = /<v>([\s\S]*?)<\/v>/.exec(body);
          let val = '';
          if (type === 's') val = v ? sst[+v[1]] || '' : '';
          else if (type === 'inlineStr') val = texts(body);
          else if (type === 'str' || type === 'e') val = v ? unxml(v[1]) : '';
          else if (type === 'b') val = v ? v[1] === '1' : '';
          else if (v) { const n = Number(v[1]); val = Number.isFinite(n) ? n : unxml(v[1]); }
          row[i] = val;
        }
        for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
        rows[ri] = row;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      sheets.push({ name, rows });
    }
    return { sheets };
  };

  // sheets: [{ name, rows, widths?, title? }] -> Uint8Array .xlsx. Baris pertama ditebalkan jika head = true.
  TT.xlsxWrite = (sheets) => {
    const used = new Set();
    const safe = (n, i) => {
      let x = String(n || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
      let y = x, k = 2; while (used.has(y.toLowerCase())) { const suf = ` (${k++})`; y = x.slice(0, 31 - suf.length) + suf; }
      used.add(y.toLowerCase()); return y;
    };
    const names = sheets.map((s, i) => safe(s.name, i));
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      // gaya: 0 biasa (balut teks, atas), 1 tebal (tajuk)
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="1" applyFont="1"/><xf fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf></cellXfs></styleSheet>' }
    ];
    sheets.forEach((sh, i) => {
      const width = sh.widths || [];
      const cols = width.length ? '<cols>' + width.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
      const merges = (sh.merges || []).map((m) => `<mergeCell ref="${m}"/>`).join('');
      const rows = (sh.rows || []).map((r, ri) => `<row r="${ri + 1}"${sh.heights && sh.heights[ri] ? ` ht="${sh.heights[ri]}" customHeight="1"` : ''}>` + r.map((v, ci) => {
        if (v == null || v === '') return '';
        const ref = colName(ci) + (ri + 1), st = (sh.bold || []).includes(ri) ? ' s="1"' : sh.grid && ri >= (sh.gridFrom || 0) ? ' s="2"' : '';
        return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      }).join('') + '</row>').join('');
      files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData>${merges ? `<mergeCells count="${(sh.merges || []).length}">${merges}</mergeCells>` : ''}</worksheet>` });
    });
    return TT.zipStore(files);
  };
  TT.xlsxColName = colName;

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
