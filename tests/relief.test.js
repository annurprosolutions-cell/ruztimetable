const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');

const MON = '2026-10-26'; // Isnin
const SUN = '2026-10-25'; // Ahad

function setup() {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 0 }).placements; // tanpa fasa masa supaya hasil tetap pada mesin perlahan
  return s;
}
const T = (s, short) => s.teachers.find((t) => t.short === short);

test('hujung minggu tiada relief', () => {
  const s = setup();
  s.absences.push({ id: 'a', date: SUN, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  assert.strictEqual(TT.dateToDay(s, SUN), -1);
  assert.deepStrictEqual(TT.reliefNeeds(s, SUN), []);
});

test('mod Ahad-Khamis: Ahad ialah hari persekolahan', () => {
  const s = setup(); s.school.weekMode = 'sun-thu';
  assert.strictEqual(TT.dateToDay(s, SUN), 0);
  assert.strictEqual(TT.dateToDay(s, '2026-10-30'), -1); // Jumaat
});

test('keperluan relief sepadan dengan waktu mengajar guru pada hari itu', () => {
  const s = setup(); const amy = T(s, 'AMY');
  s.absences.push({ id: 'a', date: MON, teacherId: amy.id, from: null, to: null, reason: 'MC' });
  const needs = TT.reliefNeeds(s, MON);
  const grid = TT.teacherGrid(s).get(amy.id)[0];
  const expected = grid.filter(Boolean).length;
  assert.strictEqual(needs.reduce((a, n) => a + n.periods.length, 0), expected);
});

test('ketidakhadiran separa hanya melibatkan waktu dalam julat', () => {
  const s = setup(); const amy = T(s, 'AMY');
  s.absences.push({ id: 'a', date: MON, teacherId: amy.id, from: 2, to: 4, reason: 'Kursus / Bengkel' });
  for (const n of TT.reliefNeeds(s, MON)) n.periods.forEach((p) => assert.ok(p >= 2 && p <= 4));
});

test('auto relief: calon sentiasa kosong, tiada bertindih, patuh had harian', () => {
  const s = setup();
  ['AMY', 'KMR', 'ZKA', 'FRI', 'ASQ'].forEach((c, i) => s.absences.push({ id: 'a' + i, date: MON, teacherId: T(s, c).id, from: null, to: null, reason: 'MC' }));
  const r = TT.autoRelief(s, MON);
  assert.ok(r.assigned > 0);
  const grid = TT.teacherGrid(s), perTeacherP = new Map();
  for (const rec of s.reliefs.filter((x) => x.status === 'assigned')) {
    assert.notStrictEqual(rec.reliefTeacherId, rec.absentTeacherId);
    assert.ok(!['AMY', 'KMR', 'ZKA', 'FRI', 'ASQ'].some((c) => T(s, c).id === rec.reliefTeacherId), 'guru tidak hadir dijadikan relief');
    for (const p of rec.periods) {
      assert.strictEqual(grid.get(rec.reliefTeacherId)[0][p], null, 'relief pada waktu mengajar sendiri');
      const k = rec.reliefTeacherId + '|' + p; assert.ok(!perTeacherP.has(k), 'relief bertindih'); perTeacherP.set(k, 1);
    }
  }
  const perDay = new Map();
  s.reliefs.forEach((x) => perDay.set(x.reliefTeacherId, (perDay.get(x.reliefTeacherId) || 0) + x.periods.length));
  for (const n of perDay.values()) assert.ok(n <= s.settings.relief.maxPerDay);
  assert.strictEqual(r.assigned + r.unresolved.length, TT.reliefNeeds(s, MON).length);
});

test('kesaksamaan: guru yang sudah banyak relief bulan ini dikemukakan lewat', () => {
  const s = setup(); const amy = T(s, 'AMY');
  s.absences.push({ id: 'a', date: MON, teacherId: amy.id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON)[0];
  const before = TT.reliefCandidates(s, need);
  const top = before[0].teacher;
  for (let i = 0; i < 6; i++) s.reliefs.push({ id: 'h' + i, key: 'x' + i, date: '2026-10-0' + (i + 1), lessonId: need.lessonId, classIds: [], periods: [1, 2], status: 'assigned', reliefTeacherId: top.id, absentTeacherId: 'z' });
  const after = TT.reliefCandidates(s, need);
  assert.notStrictEqual(after[0].teacher.id, top.id);
  assert.ok(after.findIndex((c) => c.teacher.id === top.id) > 0);
});

test('guru dikecualikan relief tidak dicadangkan', () => {
  const s = setup(); const amy = T(s, 'AMY'); T(s, 'PNR').noRelief = true;
  s.absences.push({ id: 'a', date: MON, teacherId: amy.id, from: null, to: null, reason: 'MC' });
  for (const n of TT.reliefNeeds(s, MON)) assert.ok(!TT.reliefCandidates(s, n).some((c) => c.teacher.short === 'PNR'));
});

test('padam ketidakhadiran + sync membuang rekod relief', () => {
  const s = setup(); const amy = T(s, 'AMY');
  s.absences.push({ id: 'a', date: MON, teacherId: amy.id, from: null, to: null, reason: 'MC' });
  TT.autoRelief(s, MON); assert.ok(s.reliefs.length > 0);
  s.absences = []; TT.reliefSync(s, MON);
  assert.strictEqual(s.reliefs.length, 0);
});

test('statistik dan mesej WhatsApp', () => {
  const s = setup();
  s.absences.push({ id: 'a', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  TT.autoRelief(s, MON);
  const st = TT.reliefStats(s, '2026-10-01', '2026-10-31');
  assert.strictEqual(st.summary.total, TT.reliefNeeds(s, MON).reduce((a, n) => a + n.periods.length, 0) - st.summary.uncovered - st.summary.kendiri);
  const msg = TT.reliefMessage(s, MON);
  assert.match(msg, /26\/10\/2026/); assert.match(msg, /Aminah Yusof/);
});

test('kesaksamaan sebulan: relief tersebar sama rata dan semua keperluan dapat guru', () => {
  const s = setup();
  let rnd = 99; const r = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const days = TT.schoolDays(s, '2026-11-02', '2026-11-27');
  let unresolved = 0, id = 0;
  for (const d of days) {
    const k = 2 + ((r() * 3) | 0);
    s.teachers.slice().sort(() => r() - 0.5).slice(0, k).forEach((t) => s.absences.push({ id: 'a' + id++, date: d, teacherId: t.id, from: null, to: null, reason: 'MC' }));
    unresolved += TT.autoRelief(s, d).unresolved.length;
  }
  const st = TT.reliefStats(s, '2026-11-01', '2026-11-30');
  assert.strictEqual(unresolved, 0);
  assert.ok(st.summary.total > 150, `jumlah relief ${st.summary.total}`);
  assert.ok(st.summary.sd < 2.5, `sisihan piawai ${st.summary.sd}`);
  assert.ok(st.summary.max - Math.min(...st.rows.map((x) => x.periods)) <= 7, 'jurang terlalu besar');
});
