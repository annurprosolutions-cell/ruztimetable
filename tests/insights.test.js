const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/insights.js');

const MON = '2026-10-26';
const T = (s, short) => s.teachers.find((t) => t.short === short);
function setup() {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 300 }).placements;
  return s;
}

test('monthGrid: Oktober 2026 (Isnin-Jumaat) bermula Khamis 1hb', () => {
  const s = TT.newState();
  const g = TT.monthGrid(s, '2026-10');
  assert.deepStrictEqual(g[0], [null, null, null, '2026-10-01', '2026-10-02']);
  assert.strictEqual(g.length, 5);
  assert.strictEqual(g.flat().filter(Boolean).length, 22);
  assert.deepStrictEqual(g[4], ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
});

test('monthGrid: mod Ahad-Khamis', () => {
  const s = TT.newState(); s.school.weekMode = 'sun-thu';
  const g = TT.monthGrid(s, '2026-10');
  assert.deepStrictEqual(g[0], [null, null, null, null, '2026-10-01']); // Khamis = lajur terakhir
  assert.deepStrictEqual(g[1], ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
});

test('label tarikh dan bulan', () => {
  assert.strictEqual(TT.weekdayOf(MON), 'Isnin');
  assert.strictEqual(TT.shortDate('2026-08-03'), '3 Ogo');
  assert.strictEqual(TT.monthLabel('2026-10'), 'Oktober 2026');
  assert.strictEqual(TT.addMonths('2026-12', 1), '2027-01');
  assert.strictEqual(TT.addMonths('2026-01', -1), '2025-12');
});

test('actionItems: data kosong cadang muat contoh', () => {
  const items = TT.actionItems(TT.newState(), MON, {});
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].go.act, 'loadSample');
});

test('actionItems: jadual belum dijana dan backup', () => {
  const s = TT.sample();
  const items = TT.actionItems(s, MON, { lastBackup: null, sheetLinked: false });
  assert.ok(items.some((i) => i.title === 'Jadual belum dijana' && i.go.page === 'jadual'));
  assert.ok(items.some((i) => i.go.act === 'exportJson'));
  assert.ok(!TT.actionItems(s, MON, { sheetLinked: true }).some((i) => i.go.act === 'exportJson'));
  assert.ok(!TT.actionItems(s, MON, { lastBackup: '2026-10-24T10:00:00Z' }).some((i) => i.go.act === 'exportJson'));
});

test('actionItems: relief hari ini muncul, hilang selepas diagih', () => {
  const s = setup();
  assert.ok(!TT.actionItems(s, MON, { sheetLinked: true }).length, JSON.stringify(TT.actionItems(s, MON, { sheetLinked: true })));
  s.absences.push({ id: 'a', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  s.absences.push({ id: 'b', date: '2026-10-28', teacherId: T(s, 'KMR').id, from: null, to: null, reason: 'Kursus / Bengkel' });
  let items = TT.actionItems(s, MON, { sheetLinked: true });
  assert.strictEqual(items[0].sev, 'hari-ini');
  assert.strictEqual(items[0].go.date, MON);
  assert.ok(items.some((i) => i.sev === 'perhatian' && i.go.date === '2026-10-28'));
  TT.autoRelief(s, MON); TT.autoRelief(s, '2026-10-28');
  items = TT.actionItems(s, MON, { sheetLinked: true });
  assert.ok(!items.some((i) => i.go.page === 'relief'));
});

test('actionItems: konflik dikesan sebagai kritikal', () => {
  const s = setup();
  const lesson = new Map(s.lessons.map((l) => [l.id, l]));
  const a = s.placements.find((p) => p.len === 1);
  const cls = lesson.get(a.lessonId).classIds[0];
  const b = s.placements.find((p) => p !== a && p.len === 1 && p.lessonId !== a.lessonId && lesson.get(p.lessonId).classIds.includes(cls));
  b.day = a.day; b.start = a.start; // dua pelajaran kelas yang sama pada waktu yang sama
  assert.ok(TT.validate(s).issues.some((i) => i.sev === 'error'));
  const items = TT.actionItems(s, MON, { sheetLinked: true });
  assert.strictEqual(items[0].sev, 'kritikal');
  assert.match(items[0].title, /konflik/);
});

test('reliefSummary dan teacherDay merangkumi tugas relief', () => {
  const s = setup();
  s.absences.push({ id: 'a', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  let sum = TT.reliefSummary(s, MON);
  assert.strictEqual(sum.status, 'pending');
  assert.ok(sum.open > 0 && sum.assigned === 0);
  TT.autoRelief(s, MON);
  sum = TT.reliefSummary(s, MON);
  assert.strictEqual(sum.status, 'done');
  assert.strictEqual(sum.assigned, sum.periods);
  const rec = s.reliefs.find((r) => r.status === 'assigned');
  const day = TT.teacherDay(s, rec.reliefTeacherId, MON);
  const rel = day.filter((x) => x.kind === 'relief');
  assert.ok(rel.length >= 1);
  assert.strictEqual(rel[0].forTeacher.short, 'AMY');
  for (let i = 1; i < day.length; i++) assert.ok(day[i - 1].p0 <= day[i].p0, 'tidak tersusun ikut waktu');
  // guru yang tidak hadir: kelas ditanda absent
  assert.ok(TT.teacherDay(s, T(s, 'AMY').id, MON).every((x) => x.kind === 'kelas' && x.absent));
  const heat = TT.monthReliefPeriods(s, '2026-10');
  assert.strictEqual(heat.get(MON), sum.assigned);
  assert.strictEqual(TT.monthReliefPeriods(s, '2026-10', rec.reliefTeacherId).get(MON), s.reliefs.filter((r) => r.reliefTeacherId === rec.reliefTeacherId).reduce((a, r) => a + r.periods.length, 0));
});

test('teacherActions: tugas relief guru dan makluman tidak hadir', () => {
  const s = setup();
  s.absences.push({ id: 'a', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  TT.autoRelief(s, MON);
  const rec = s.reliefs.find((r) => r.status === 'assigned');
  const items = TT.teacherActions(s, rec.reliefTeacherId, MON);
  assert.ok(items.length >= 1 && items[0].sev === 'hari-ini' && items[0].go.act === 'mySlip');
  const mine = TT.teacherActions(s, T(s, 'AMY').id, MON);
  assert.ok(mine.some((i) => i.title.includes('tidak hadir')));
});

test('hari bukan persekolahan: relief hari persekolahan seterusnya bertaraf segera', () => {
  const s = setup();
  s.absences.push({ id: 'a', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  const items = TT.actionItems(s, '2026-10-25', { sheetLinked: true }); // Ahad
  assert.strictEqual(items[0].sev, 'segera');
  assert.ok(TT.URGENT.includes(items[0].sev));
  assert.match(items[0].title, /Isnin 26 Okt/);
  TT.autoRelief(s, MON);
  const rec = s.reliefs.find((r) => r.status === 'assigned');
  assert.strictEqual(TT.teacherActions(s, rec.reliefTeacherId, '2026-10-25')[0].sev, 'segera');
});
