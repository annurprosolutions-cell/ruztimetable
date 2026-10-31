(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // ---------- kata laluan pentadbir (PBKDF2-SHA256, WebCrypto) ----------
  // Hanya menghalang orang lain membuka paparan pentadbir pada peranti/pautan yang sama.
  // Ia bukan kawalan akses data: data sebenar dilindungi oleh akaun Google pemilik Sheet.
  const ITER = 120000;
  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

  async function derive(pw, salt, iter) {
    const c = subtle(); if (!c) throw new Error('Pelayar ini tidak menyokong WebCrypto. Buka app melalui https.');
    const key = await c.importKey('raw', new TextEncoder().encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
    return hex(await c.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  }
  TT.PW_MIN = 6;
  TT.passwordProblem = (pw, again) => {
    if (String(pw || '').length < TT.PW_MIN) return `Kata laluan sekurang-kurangnya ${TT.PW_MIN} aksara.`;
    if (again != null && pw !== again) return 'Kedua-dua kata laluan tidak sama.';
    return '';
  };
  TT.hashPassword = async (pw, iter) => {
    iter = iter || ITER;
    const salt = new Uint8Array(16); root.crypto.getRandomValues(salt);
    return `pbkdf2-sha256$${iter}$${hex(salt)}$${await derive(pw, salt, iter)}`;
  };
  TT.validHash = (h) => /^pbkdf2-sha256\$\d{4,7}\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(String(h || ''));
  TT.verifyPassword = async (pw, stored) => {
    if (!TT.validHash(stored)) return false;
    const [, iter, salt, want] = stored.split('$');
    const got = await derive(pw, unhex(salt), Number(iter));
    let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  };

  // ---------- sesi peranti ----------
  TT.SESSION_DAYS = 30;
  TT.newSession = (role, now) => ({ role, at: now, until: now + TT.SESSION_DAYS * 864e5 });
  TT.sessionValid = (ses, now) => !!(ses && (ses.role === 'admin' || ses.role === 'guru') && ses.until > now);

  // ---------- data guru (salinan baca sahaja yang dikongsi melalui pautan) ----------
  // Buang perkara yang guru tak perlu: kata laluan, sebab/catatan cuti, rekod relief lama.
  TT.GURU_FORMAT = 'jadual-guru-v1';
  TT.guruSnapshot = (s, today, meta) => {
    const from = TT.addDays(today, -62);
    const c = JSON.parse(JSON.stringify(s));
    delete c.auth;
    c.school = { name: s.school.name, weekMode: s.school.weekMode, logo: s.school.logo, color: s.school.color, multiTime: !!s.school.multiTime, mainSetName: s.school.mainSetName };
    c.absences = s.absences.filter((a) => a.date >= from).map((a) => ({ id: a.id, date: a.date, teacherId: a.teacherId, from: a.from, to: a.to, reason: 'Tidak hadir', note: '' }));
    c.reliefs = s.reliefs.filter((r) => r.date >= from);
    c.published = Object.assign({ at: '', master: '' }, meta || {});
    return c;
  };

  // satu sel Google Sheets maksimum 50,000 aksara: pecahkan JSON kepada beberapa baris
  const CHUNK = 40000;
  TT.packBlob = (obj) => {
    const txt = JSON.stringify(obj), rows = [[TT.GURU_FORMAT]];
    for (let i = 0; i < txt.length; i += CHUNK) rows.push([txt.slice(i, i + CHUNK)]);
    return rows;
  };
  TT.unpackBlob = (rows) => {
    const cells = (rows || []).map((r) => String((r && r[0]) || ''));
    if (cells[0] !== TT.GURU_FORMAT) throw new Error('Pautan ini bukan data guru Jadual Sekolah.');
    return JSON.parse(cells.slice(1).join(''));
  };

  // pengurai CSV ringkas (RFC 4180): petikan berganda, koma dan baris baharu dalam sel
  TT.parseCSV = (text) => {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };

  // Sheet yang dikongsi "sesiapa dengan pautan" boleh dibaca tanpa log masuk (CORS dibenarkan oleh Google)
  TT.guruCsvUrl = (id) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&headers=0&sheet=Data`;
  TT.fetchGuru = async (id, fetchFn) => {
    let res;
    try { res = await fetchFn(TT.guruCsvUrl(id) + '&t=' + Date.now(), { cache: 'no-store' }); } catch (e) {
      const err = new Error('Tiada sambungan internet. Memaparkan salinan terakhir.'); err.offline = true; throw err;
    }
    const text = res.ok ? await res.text() : '';
    // Sheet yang belum dikongsi memulangkan halaman log masuk Google (HTML), bukan CSV
    if (!res.ok || /^\s*</.test(text)) throw new Error('Data guru tidak dapat dibuka. Minta pentadbir pastikan Sheet "Data Guru" dikongsi: Sesiapa yang mempunyai pautan, Pemapar.');
    const data = TT.unpackBlob(TT.parseCSV(text));
    return TT.migrate(data);
  };
  TT.guruIdFrom = (text) => {
    const x = String(text || '').trim();
    const m = x.match(/[?&]g=([a-zA-Z0-9_-]{20,})/) || x.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{20,}$/.test(x) ? x : '';
  };

  // ---------- notifikasi: tugas relief baharu untuk seorang guru ----------
  const relKey = (r) => `${r.date}|${r.periods.join(',')}|${(r.classIds || []).join(',')}`;
  TT.myReliefs = (s, tid, today) => s.reliefs.filter((r) => r.status === 'assigned' && r.reliefTeacherId === tid && r.date >= today);
  TT.newReliefs = (s, tid, today, seen) => {
    const known = new Set(seen || []);
    return TT.myReliefs(s, tid, today).filter((r) => !known.has(relKey(r)));
  };
  TT.reliefKeys = (s, tid, today) => TT.myReliefs(s, tid, today).map(relKey);
  TT.reliefNotice = (s, list) => {
    const m = TT.maps(s);
    const one = (r) => {
      const sub = (m.subject.get(r.subjectId) || {}).short || '', slots = TT.slots(s, TT.setOfClasses(s, r.classIds));
      const a = slots[r.periods[0]], b = slots[r.periods[r.periods.length - 1]] || a;
      return `${TT.weekdayOf(r.date)} ${TT.shortDate(r.date)}${a ? ' ' + a.start + '-' + b.end : ''} · ${TT.classNames(s, r.classIds)}${sub ? ' ' + sub : ''}`;
    };
    return { title: list.length === 1 ? 'Tugas relief baharu' : `${list.length} tugas relief baharu`, body: list.slice(0, 3).map(one).join('\n') + (list.length > 3 ? `\n+${list.length - 3} lagi` : '') };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
