const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');

const MON = '2026-10-26';
function setup() {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 0 }).placements;
  return s;
}
// guru yang ada pelajaran berganda (2 waktu) pada hari Isnin
function doubleTeacher(s) {
  const m = TT.maps(s);
  for (const pl of s.placements) {
    if (pl.day !== 0 || pl.len < 2) continue;
    const l = m.lesson.get(pl.lessonId);
    if (l && l.teacherIds.length === 1) return { t: s.teachers.find((x) => x.id === l.teacherIds[0]), pl };
  }
  return null;
}

test('lalai: pelajaran berganda ialah satu blok dua waktu untuk seorang guru', () => {
  const s = setup(); const d = doubleTeacher(s); assert.ok(d, 'sample ada pelajaran berganda');
  s.absences.push({ id: 'a', date: MON, teacherId: d.t.id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON).find((n) => n.unitId === d.pl.unit);
  assert.strictEqual(need.periods.length, 2);
  assert.strictEqual(need.key, need.base);
});

test('pecah waktu berganda: setiap waktu satu keperluan, diberi kepada guru berlainan', () => {
  const s = setup(); const d = doubleTeacher(s);
  s.settings.relief.splitDouble = true; s.settings.relief.maxPerDay = 0;
  s.absences.push({ id: 'a', date: MON, teacherId: d.t.id, from: null, to: null, reason: 'MC' });
  const parts = TT.reliefNeeds(s, MON).filter((n) => n.unitId === d.pl.unit);
  assert.strictEqual(parts.length, 2);
  assert.deepStrictEqual(parts.map((n) => n.periods.length), [1, 1]);
  assert.strictEqual(new Set(parts.map((n) => n.key)).size, 2);
  assert.strictEqual(new Set(parts.map((n) => n.base)).size, 1);
  TT.autoRelief(s, MON);
  const got = s.reliefs.filter((r) => r.unitId === d.pl.unit && r.status === 'assigned');
  assert.strictEqual(got.length, 2);
  assert.notStrictEqual(got[0].reliefTeacherId, got[1].reliefTeacherId, 'dua waktu, dua guru');
  // keputusan kekal selepas keperluan dijana semula (kunci stabil), dan sync tidak membuangnya
  TT.reliefSync(s, MON);
  assert.strictEqual(s.reliefs.filter((r) => r.unitId === d.pl.unit).length, 2);
});

test('guru yang sudah ambil waktu pertama dikemudiankan untuk waktu kedua, tetapi masih boleh dipilih manual', () => {
  const s = setup(); const d = doubleTeacher(s);
  s.settings.relief.splitDouble = true; s.settings.relief.maxPerDay = 0;
  s.absences.push({ id: 'a', date: MON, teacherId: d.t.id, from: null, to: null, reason: 'MC' });
  const [p1, p2] = TT.reliefNeeds(s, MON).filter((n) => n.unitId === d.pl.unit);
  const first = TT.reliefCandidates(s, p1)[0].teacher;
  TT.setRelief(s, p1, 'assigned', first.id);
  const c2 = TT.reliefCandidates(s, p2), idx = c2.findIndex((c) => c.teacher.id === first.id);
  if (idx >= 0) { assert.strictEqual(c2[idx].sib, true); assert.ok(c2.slice(0, idx).every((c) => !c.sib)); assert.strictEqual(idx, c2.length - 1, 'sib di hujung senarai'); }
  assert.notStrictEqual(c2[0].teacher.id, first.id);
});

test('relief yang sudah disimpan sebagai satu blok tidak dipecah selepas tetapan dihidupkan', () => {
  const s = setup(); const d = doubleTeacher(s); s.settings.relief.maxPerDay = 0;
  s.absences.push({ id: 'a', date: MON, teacherId: d.t.id, from: null, to: null, reason: 'MC' });
  const whole = TT.reliefNeeds(s, MON).find((n) => n.unitId === d.pl.unit);
  TT.setRelief(s, whole, 'assigned', TT.reliefCandidates(s, whole)[0].teacher.id);
  s.settings.relief.splitDouble = true;
  const again = TT.reliefNeeds(s, MON).filter((n) => n.unitId === d.pl.unit);
  assert.strictEqual(again.length, 1); assert.strictEqual(again[0].periods.length, 2);
  TT.reliefSync(s, MON);
  assert.strictEqual(s.reliefs.length, 1);
});

test('had waktu berturut-turut: kelas sendiri + relief tidak melebihi had', () => {
  for (const limit of [1, 2, 3]) {
    const s = setup(); s.settings.relief.splitDouble = true; s.settings.relief.maxPerDay = 0; s.settings.relief.maxStreak = limit;
    for (const t of s.teachers.slice(0, 4)) s.absences.push({ id: 'a' + t.id, date: MON, teacherId: t.id, from: null, to: null, reason: 'MC' });
    TT.autoRelief(s, MON);
    const tm = TT.timeModel(s), grid = TT.teacherGrid(s, tm), lim = tm.sets[0].limit[0], st = tm.sets[0];
    const assigned = s.reliefs.filter((r) => r.status === 'assigned');
    assert.ok(assigned.length > 0);
    for (const t of new Set(assigned.map((r) => r.reliefTeacherId))) {
      const busy = Array.from({ length: lim }, (_, p) => !!grid.get(t)[0][p] || assigned.some((r) => r.reliefTeacherId === t && r.periods.includes(p)));
      let run = 0, best = 0;
      for (let p = 0; p < lim; p++) { run = busy[p] ? (p > 0 && st.slots[p].breakBefore ? 1 : run + 1) : 0; best = Math.max(best, run); }
      // urutan yang sedia ada daripada kelas sendiri sahaja boleh melebihi had; yang diuji ialah relief tidak memanjangkannya
      const ownOnly = Array.from({ length: lim }, (_, p) => !!grid.get(t)[0][p]);
      let r2 = 0, b2 = 0;
      for (let p = 0; p < lim; p++) { r2 = ownOnly[p] ? (p > 0 && st.slots[p].breakBefore ? 1 : r2 + 1) : 0; b2 = Math.max(b2, r2); }
      assert.ok(best <= Math.max(limit, b2), `had ${limit}: guru ${t} berturut ${best} (sendiri ${b2})`);
    }
  }
});

test('had waktu berturut-turut menolak calon yang akan jadi 3 waktu berturut-turut', () => {
  const s = setup(); s.settings.relief.maxPerDay = 0;
  const d = doubleTeacher(s);
  s.absences.push({ id: 'a', date: MON, teacherId: d.t.id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON).find((n) => n.unitId === d.pl.unit); // 2 waktu
  const before = TT.reliefCandidates(s, need).length;
  s.settings.relief.maxStreak = 2; // blok sendiri sudah 2 waktu: calon yang mengajar bersebelahan jadi >2 ditolak
  const after = TT.reliefCandidates(s, need);
  const tm = TT.timeModel(s), grid = TT.teacherGrid(s, tm), p0 = need.periods[0], p1 = need.periods[1];
  assert.ok(after.length <= before);
  for (const c of after) {
    const g = grid.get(c.teacher.id)[need.day];
    const st = tm.sets[need.k];
    const left = p0 > 0 && !st.slots[p0].breakBefore && g[p0 - 1], right = p1 + 1 < st.limit[need.day] && !st.slots[p1 + 1].breakBefore && g[p1 + 1];
    assert.ok(!left && !right, 'calon tidak mengajar bersebelahan blok 2 waktu');
  }
});
