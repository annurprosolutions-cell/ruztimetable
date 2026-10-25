// Pelayan Google Sheets palsu untuk ujian: meniru endpoint yang digunakan oleh TT.SheetStore.
// RAW kekalkan teks sebagai teks, sel kosong di hujung baris dibuang, julat tab tiada = 400.
function fakeSheets(token) {
  const db = new Map(); let seq = 0; const calls = [];
  const resp = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const parseRange = (book, r) => {
    const m = decodeURIComponent(r).match(/^'([^']+)'(?:!A(\d+)(?::Z)?)?$/);
    if (!m || !book.tabs.has(m[1])) return null;
    return { tab: m[1], row: m[2] ? +m[2] : 1 };
  };
  const trim = (rows) => {
    const out = rows.map((r) => { const x = r.slice(); while (x.length && (x[x.length - 1] === '' || x[x.length - 1] == null)) x.pop(); return x.map((c) => (c == null ? '' : c)); });
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  };
  async function fetch(url, init) {
    calls.push(init.method + ' ' + url.replace('https://sheets.googleapis.com/v4/spreadsheets', ''));
    const auth = init.headers.Authorization || init.headers.authorization;
    if (auth !== 'Bearer ' + token) return resp(401, { error: { message: 'Invalid Credentials' } });
    const body = init.body ? JSON.parse(init.body) : null;
    const u = new URL(url);
    const path = u.pathname.replace('/v4/spreadsheets', '');
    if (path === '' && init.method === 'POST') {
      const id = 'sheet' + (++seq) + 'x'.repeat(30);
      db.set(id, { title: body.properties.title, tabs: new Map(body.sheets.map((s) => [s.properties.title, []])) });
      return resp(200, { spreadsheetId: id, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' });
    }
    const m = path.match(/^\/([^/:]+)(.*)$/); const book = db.get(m[1]);
    if (!book) return resp(404, { error: { message: 'Requested entity was not found.' } });
    const rest = m[2];
    if (rest === '' && init.method === 'GET') return resp(200, { properties: { title: book.title }, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + m[1] + '/edit', sheets: [...book.tabs.keys()].map((t) => ({ properties: { title: t } })) });
    if (rest === ':batchUpdate') { body.requests.forEach((q) => book.tabs.set(q.addSheet.properties.title, [])); return resp(200, {}); }
    if (rest === '/values:batchUpdate') {
      if (body.valueInputOption !== 'RAW') return resp(400, { error: { message: 'valueInputOption mesti RAW' } });
      for (const d of body.data) {
        const r = parseRange(book, d.range); if (!r) return resp(400, { error: { message: 'Unable to parse range: ' + d.range } });
        const rows = book.tabs.get(r.tab);
        d.values.forEach((row, i) => { const cur = rows[r.row - 1 + i] || []; row.forEach((v, j) => { cur[j] = v; }); rows[r.row - 1 + i] = cur; });
      }
      return resp(200, {});
    }
    if (rest === '/values:batchClear') {
      for (const rg of body.ranges) { const r = parseRange(book, rg); if (!r) return resp(400, { error: { message: 'bad range' } }); book.tabs.get(r.tab).length = Math.min(book.tabs.get(r.tab).length, r.row - 1); }
      return resp(200, {});
    }
    if (rest === '/values:batchGet') {
      const out = [];
      for (const rg of u.searchParams.getAll('ranges')) { const r = parseRange(book, rg); if (!r) return resp(400, { error: { message: 'Unable to parse range: ' + rg } }); out.push({ range: rg, values: trim(book.tabs.get(r.tab)) }); }
      return resp(200, { valueRanges: out });
    }
    const vm = rest.match(/^\/values\/([^?]+)$/);
    if (vm) { const r = parseRange(book, vm[1]); if (!r) return resp(400, { error: { message: 'Unable to parse range' } }); return resp(200, { values: trim(book.tabs.get(r.tab)) }); }
    return resp(500, { error: { message: 'tidak disokong: ' + rest } });
  }
  return { fetch, db, calls };
}

module.exports = { fakeSheets };
