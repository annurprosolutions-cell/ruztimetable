const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/brand.js');
require('../js/sheets.js');

const { fakeSheets } = require('./helpers/fake-sheets.js');

const sortKeys = (x) => Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {}) : x;
const canon = (s) => JSON.stringify(sortKeys(s));

function richState() {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 200 }).placements;
  s.placements[0].locked = true;
  const amy = s.teachers.find((t) => t.short === 'AMY');
  s.absences.push({ id: 'a1', date: '2026-10-26', teacherId: amy.id, from: null, to: null, reason: 'MC', note: '' });
  s.absences.push({ id: 'a2', date: '2026-10-27', teacherId: amy.id, from: 1, to: 3, reason: 'Kursus / Bengkel', note: 'Kursus PdPc, Bilik Mesyuarat' });
  TT.autoRelief(s, '2026-10-26'); TT.autoRelief(s, '2026-10-27');
  const any = TT.reliefNeeds(s, '2026-10-27')[0]; if (any) TT.setRelief(s, any, 'kendiri', null, 'tugasan buku teks');
  s.settings.relief.wFair = 9;
  s.school.weekMode = 'sun-thu';
  return s;
}
const original = (s) => TT.prunePlacements(TT.reconcile(TT.migrate(JSON.parse(JSON.stringify(s)))));

test('toSheets -> fromSheets mengekalkan semua data', () => {
  const s = richState();
  const tabs = TT.toSheets(s, { updatedAt: 'x' });
  assert.deepStrictEqual(Object.keys(tabs), TT.SHEET_TABS);
  const back = TT.fromSheets(JSON.parse(JSON.stringify(tabs)));
  assert.strictEqual(canon(back), canon(original(s)));
  assert.ok(back.reliefs.length > 0 && back.absences.length === 2);
});

test('fromSheets tahan suntingan manual dalam Sheets', () => {
  const s = richState();
  const tabs = JSON.parse(JSON.stringify(TT.toSheets(s, {})));
  tabs.Waktu[1][1] = 0.3125;                        // 07:30 sebagai pecahan hari
  tabs.TidakHadir[1][1] = 46321;                    // nombor siri tarikh
  tabs.TidakHadir[2][1] = '27/10/2026';             // format tempatan
  tabs.Subjek[1][4] = 'ya';
  tabs.Guru.push(['', '', '', '']);                 // baris kosong
  delete tabs.Relief;                               // tab dipadam
  const back = TT.fromSheets(tabs);
  assert.strictEqual(back.periods[0].start, '07:30');
  assert.strictEqual(back.absences[0].date, '2026-10-26');
  assert.strictEqual(back.absences[1].date, '2026-10-27');
  assert.strictEqual(back.subjects[0].heavy, true);
  assert.strictEqual(back.teachers.length, s.teachers.length);
  assert.deepStrictEqual(back.reliefs, []);
});

test('penukar nombor siri tarikh Sheets', () => {
  assert.strictEqual(TT._sheetParse.isoDate(46321), '2026-10-26');
  assert.strictEqual(TT._sheetParse.hhmm(0.5), '12:00');
  assert.strictEqual(TT._sheetParse.hhmm('7.05'), '07:05');
});

test('SheetStore: cipta, simpan, muat semula sama seperti asal', async () => {
  const fs = fakeSheets('tok');
  const store = new TT.SheetStore({ fetch: fs.fetch, token: async () => 'tok' });
  const s = richState();
  const { id, url } = await store.create('Jadual SMK Contoh Jaya');
  assert.match(url, /docs\.google\.com/);
  await store.save(id, s, { updatedAt: '2026-10-25T10:00:00.000Z', by: 'dev1', app: 'test' });
  const meta = await store.readMeta(id);
  assert.strictEqual(meta.dikemaskini, '2026-10-25T10:00:00.000Z');
  assert.strictEqual(meta.oleh, 'dev1');
  const { state, meta: m2, title } = await store.load(id);
  assert.strictEqual(title, 'Jadual SMK Contoh Jaya');
  assert.strictEqual(m2.format, 1);
  assert.strictEqual(canon(state), canon(original(s)));
});

test('SheetStore: data dikurangkan, baris lama dibuang; tab hilang dicipta semula', async () => {
  const fs = fakeSheets('tok');
  const store = new TT.SheetStore({ fetch: fs.fetch, token: async () => 'tok' });
  const s = richState();
  const { id } = await store.create('x');
  await store.save(id, s, {});
  fs.db.get(id).tabs.delete('Bilik');
  s.teachers = s.teachers.slice(0, 5); s.absences = []; s.reliefs = [];
  TT.reconcile(s);
  await store.save(id, s, {});
  assert.ok(fs.db.get(id).tabs.has('Bilik'));
  const { state } = await store.load(id);
  assert.strictEqual(state.teachers.length, 5);
  assert.strictEqual(state.absences.length, 0);
  assert.strictEqual(state.rooms.length, s.rooms.length);
});

test('SheetStore: ralat jelas untuk fail bukan Jadual, tiada akses, sesi tamat', async () => {
  const fs = fakeSheets('tok');
  const store = new TT.SheetStore({ fetch: fs.fetch, token: async () => 'tok' });
  const { id } = await store.create('x');
  fs.db.get(id).tabs = new Map([['Sheet1', []]]);
  await assert.rejects(store.load(id), (e) => e.status === 422);
  assert.deepStrictEqual(await store.readMeta(id), {}); // tab Meta tiada
  await assert.rejects(store.info('tiada' + 'x'.repeat(30)), (e) => e.status === 404);
  const bad = new TT.SheetStore({ fetch: fs.fetch, token: async () => 'salah' });
  await assert.rejects(bad.info(id), (e) => e.status === 401);
  const expired = new TT.SheetStore({ fetch: fs.fetch, token: async () => { const e = new Error('tamat'); e.status = 401; e.needsLogin = true; throw e; } });
  await assert.rejects(expired.save(id, TT.sample(), {}), (e) => e.needsLogin);
});

test('sheetIdFrom terima pautan atau ID', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-';
  assert.strictEqual(TT.sheetIdFrom(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.strictEqual(TT.sheetIdFrom(id), id);
  assert.strictEqual(TT.sheetIdFrom('bukan pautan'), '');
});
