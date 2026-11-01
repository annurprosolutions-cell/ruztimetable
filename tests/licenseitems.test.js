const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/insights.js');

const TODAY = '2026-10-26';
const st = (lic) => TT.licenseStatus(lic, TODAY);
const item = (lic, buy = true) => TT.licenseItem(st(lic), buy);

test('status lesen: percubaan, berbayar, tempoh ihsan, tamat, ditolak, tanpa tarikh', () => {
  assert.strictEqual(st(null), null);
  assert.strictEqual(st({ ok: true, plan: 'tahunan' }), null, 'tiada tarikh luput = tiada notis');
  assert.deepStrictEqual(st({ ok: false, message: 'x' }), { state: 'denied', message: 'x' });
  assert.deepStrictEqual([st({ ok: true, plan: 'percubaan', expires: '2026-10-28' }).state, st({ ok: true, plan: 'percubaan', expires: '2026-10-28' }).daysLeft], ['trial', 2]);
  assert.strictEqual(st({ ok: true, plan: 'tahunan', expires: '2027-10-26' }).state, 'paid');
  const g = st({ ok: true, plan: 'bulanan', expires: '2026-10-22' });
  assert.deepStrictEqual([g.state, g.graceLeft], ['grace', 3]);
  assert.strictEqual(st({ ok: true, plan: 'bulanan', expires: '2026-10-18' }).state, 'expired', 'lebih 7 hari selepas tamat');
  assert.strictEqual(st({ ok: true, plan: 'percubaan', expires: '2026-10-25' }).state, 'expired', 'percubaan tiada tempoh ihsan');
});

test('item perlu tindakan: tahap kecemasan ikut baki hari', () => {
  const sev = (lic) => (item(lic) || {}).sev;
  // percubaan: hari tinggal = baki + 1 (hari tamat masih boleh guna)
  assert.deepStrictEqual([sev({ ok: true, plan: 'percubaan', expires: '2026-11-08' }), item({ ok: true, plan: 'percubaan', expires: '2026-11-08' }).title], ['info', 'Percubaan percuma: 14 hari lagi']);
  assert.deepStrictEqual([sev({ ok: true, plan: 'percubaan', expires: '2026-11-02' }), sev({ ok: true, plan: 'percubaan', expires: '2026-11-01' })], ['info', 'perhatian'], '8 hari = makluman, 7 hari = perhatian');
  assert.deepStrictEqual([sev({ ok: true, plan: 'percubaan', expires: '2026-10-28' }), item({ ok: true, plan: 'percubaan', expires: '2026-10-28' }).title], ['segera', 'Percubaan percuma: 3 hari lagi']);
  assert.strictEqual(item({ ok: true, plan: 'percubaan', expires: '2026-10-26' }).title, 'Percubaan percuma: 1 hari lagi');
  // berbayar: senyap sehingga 14 hari terakhir
  assert.strictEqual(item({ ok: true, plan: 'tahunan', expires: '2027-01-01' }), null);
  assert.strictEqual(item({ ok: true, plan: 'tahunan', expires: '2026-11-10' }), null, '15 hari lagi: senyap');
  assert.deepStrictEqual([sev({ ok: true, plan: 'tahunan', expires: '2026-11-09' }), sev({ ok: true, plan: 'bulanan', expires: '2026-11-08' })], ['perhatian', 'perhatian'], '14 hari lagi: notis bermula');
  assert.strictEqual(sev({ ok: true, plan: 'bulanan', expires: '2026-10-29' }), 'segera');
  assert.strictEqual(item({ ok: true, plan: 'bulanan', expires: '2026-10-26' }).title, 'Lesen tamat hari ini');
  assert.deepStrictEqual([item({ ok: true, plan: 'bulanan', expires: '2026-10-22' }).sev, item({ ok: true, plan: 'bulanan', expires: '2026-10-22' }).title], ['segera', 'Lesen tamat, tempoh ihsan tinggal 3 hari']);
  // tamat dan ditolak: kritikal
  const exp = item({ ok: true, plan: 'percubaan', expires: '2026-10-20' });
  assert.deepStrictEqual([exp.sev, exp.title, exp.btn], ['kritikal', 'Percubaan percuma telah tamat', 'Langgan']);
  assert.deepStrictEqual([item({ ok: true, plan: 'bulanan', expires: '2026-10-01' }).title, item({ ok: true, plan: 'bulanan', expires: '2026-10-01' }).btn], ['Lesen telah tamat', 'Perbaharui']);
  assert.strictEqual(item({ ok: false }).sev, 'kritikal');
});

test('butang: buka borang langganan jika ada pautan, jika tidak ke Tetapan > Storan', () => {
  assert.deepStrictEqual(item({ ok: true, plan: 'percubaan', expires: '2026-10-28' }, true).go, { act: 'openBuy' });
  assert.deepStrictEqual(item({ ok: true, plan: 'percubaan', expires: '2026-10-28' }, false).go, { act: 'archiveOpen' });
});

test('actionItems: item lesen muncul, terutamanya paling mendesak dahulu, juga sebelum ada data sekolah', () => {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 0 }).placements;
  const withLic = (license) => TT.actionItems(s, TODAY, { sheetLinked: true, lastBackup: TODAY, license, hasBuy: true });
  assert.ok(!withLic(null).some((i) => i.kind === 'lesen'));
  assert.ok(!withLic({ ok: true, plan: 'tahunan', expires: '2027-06-01' }).some((i) => i.kind === 'lesen'));
  const t = withLic({ ok: true, plan: 'percubaan', expires: '2026-10-28' });
  assert.strictEqual(t.filter((i) => i.kind === 'lesen').length, 1);
  assert.ok(TT.URGENT.includes(t.find((i) => i.kind === 'lesen').sev));
  const dead = withLic({ ok: false });
  assert.strictEqual(dead[0].kind, 'lesen', 'kritikal diutamakan');
  const empty = TT.newState();
  const e = TT.actionItems(empty, TODAY, { license: { ok: true, plan: 'percubaan', expires: '2026-11-08' }, hasBuy: true });
  assert.deepStrictEqual(e.map((i) => i.kind || i.title).sort(), ['Belum ada data sekolah', 'lesen'].sort());
});
