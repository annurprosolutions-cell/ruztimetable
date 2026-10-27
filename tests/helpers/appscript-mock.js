// Jalankan appscript/Code.gs sebenar dalam vm Node dengan API Google Apps Script yang ditiru
// (SpreadsheetApp, ContentService, LockService, CacheService, PropertiesService, Utilities).
// Digunakan oleh ujian unit dan e2e: payload sebenar dari app dihantar ke doPost sebenar.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '../../appscript/Code.gs'), 'utf8');

function createSheet(name, onDelete, sheets_) {
  const grid = []; // grid[r][c] 0-berindeks, jarang
  const formats = new Map();
  const sheet = {
    name, grid, formats, frozen: 0, widths: {},
    getName: () => sheet.name,
    setName(n) { sheet.name = n; sheets_.rename(name, n, sheet); name = n; },
    getMaxRows: () => 1000,
    getLastRow() { let n = 0; grid.forEach((r, i) => { if (r && r.some((v) => v !== '' && v != null)) n = i + 1; }); return n; },
    getLastColumn() { let n = 0; grid.forEach((r) => { (r || []).forEach((v, j) => { if (v !== '' && v != null) n = Math.max(n, j + 1); }); }); return n; },
    getRange(r, c, nr = 1, nc = 1) {
      const rng = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (grid[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        getValue: () => { const v = (grid[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
        setValues: (vals) => {
          if (vals.length !== nr || vals.some((row) => row.length !== nc)) throw new Error(`setValues: dimensi ${vals.length}x${vals[0] && vals[0].length} bukan ${nr}x${nc}`);
          vals.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; }); });
          return rng;
        },
        setValue: (v) => { grid[r - 1] = grid[r - 1] || []; grid[r - 1][c - 1] = v; return rng; },
        setNumberFormat: (f) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) formats.set(`${r + i},${c + j}`, f); return rng; }
      };
      ['setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setVerticalAlignment', 'setHorizontalAlignment'].forEach((m) => { rng[m] = () => rng; });
      return rng;
    },
    setFrozenRows(n) { sheet.frozen = n; },
    setColumnWidth(i, w) { sheet.widths[i] = w; },
    clear() { grid.length = 0; formats.clear(); return sheet; },
    deleteRow(r) { grid.splice(r - 1, 1); if (onDelete) onDelete(r); }
  };
  return sheet;
}

function createEnv(opts = {}) {
  const sheets = new Map();
  const props = Object.assign({}, opts.props);
  const cache = new Map();
  let now = opts.now || Date.UTC(2026, 9, 27, 4, 0, 0);
  const menus = [];
  const registry = { rename(from, to, sh) { sheets.delete(from); sheets.set(to, sh); } };
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = createSheet(n, null, registry); sheets.set(n, s); return s; }
  };
  const FakeDate = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    JSON, Math, Number, String, Array, Object, isFinite, Date: FakeDate,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      getUi: () => ({ createMenu: (title) => { const m = { title, items: [], addItem(l, f) { m.items.push([l, f]); return m; }, addSeparator() { return m; }, addToUi() { menus.push(m); } }; return m; } })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ getContent: () => s, setMimeType() { return this; } })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !(opts.lockBusy), releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { cache.set(k, v); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      // waktu Malaysia (UTC+8), format yyyy-MM-dd HH:mm:ss
      formatDate: (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
    }
  };
  sandbox.Date = FakeDate;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;this.__api = { doPost, doGet, sediakanSheet, kemasKiniRingkasan, hantarUjian, padamBarisUjian, onOpen, SCHEMA, META, CFG };', ctx);
  const api = ctx.__api;
  return {
    api, sheets, props, menus, cache,
    setNow: (t) => { now = t; },
    post(body) { const res = api.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }); return JSON.parse(res.getContent()); },
    get() { return JSON.parse(api.doGet().getContent()); },
    rows() { const s = sheets.get('Jawapan'); return s ? s.grid.slice(2).filter((r) => r && r.length) : []; },
    cols() { return api.META.map((m) => m[0]).concat(api.SCHEMA.columns.map((c) => c.key)); },
    row(i) { const cols = this.cols(), r = this.rows()[i] || []; const o = {}; cols.forEach((k, j) => { o[k] = r[j] === undefined ? '' : r[j]; }); return o; }
  };
}

module.exports = { createEnv };
