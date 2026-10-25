const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');

test('sampel: semakan awal tiada ralat', () => {
  const s = TT.sample();
  assert.deepStrictEqual(TT.precheck(s).filter((x) => x.sev === 'error'), []);
});

test('jana jadual sampel: semua unit diletak, tiada konflik', () => {
  const s = TT.sample();
  const r = TT.generate(s, { seed: 7, improveMs: 1500 });
  assert.strictEqual(r.unplaced.length, 0, JSON.stringify(r.unplaced.slice(0, 3)));
  s.placements = r.placements;
  const v = TT.validate(s);
  assert.deepStrictEqual(v.issues.filter((x) => x.sev === 'error'), []);
  assert.strictEqual(r.placements.length, TT.buildUnits(s).length);
});

test('beberapa seed berbeza semuanya berjaya', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = TT.sample();
    const r = TT.generate(s, { seed, improveMs: 400 });
    s.placements = r.placements;
    assert.strictEqual(r.unplaced.length, 0, `seed ${seed}`);
    assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), [], `seed ${seed}`);
  }
});

test('fasa penambahbaikan menurunkan kos', () => {
  const s = TT.sample();
  const a = TT.generate(s, { seed: 11, improveMs: 0 });
  const b = TT.generate(s, { seed: 11, improveMs: 3000 });
  assert.ok(b.metrics.cost < a.metrics.cost, `${a.metrics.cost} -> ${b.metrics.cost}`);
});

test('penempatan dikunci dikekalkan', () => {
  const s = TT.sample();
  const r1 = TT.generate(s, { seed: 3, improveMs: 200 });
  s.placements = r1.placements;
  const pick = s.placements.slice(0, 20); pick.forEach((p) => { p.locked = true; });
  const snap = pick.map((p) => [p.unit, p.day, p.start]);
  const r2 = TT.generate(s, { seed: 99, improveMs: 500 });
  const m = new Map(r2.placements.map((p) => [p.unit, p]));
  for (const [u, d, st] of snap) { assert.strictEqual(m.get(u).day, d); assert.strictEqual(m.get(u).start, st); }
});

test('guru tidak sedia tidak diletakkan pada slot dilarang', () => {
  const s = TT.sample();
  const r = TT.generate(s, { seed: 5, improveMs: 300 });
  s.placements = r.placements;
  const kmr = s.teachers.find((t) => t.short === 'KMR');
  const lessons = new Set(s.lessons.filter((l) => l.teacherIds.includes(kmr.id)).map((l) => l.id));
  assert.ok(!s.placements.some((p) => lessons.has(p.lessonId) && p.day === 0 && p.start === 0));
});

test('data mustahil: dilapor sebagai belum diletak dengan sebab', () => {
  const s = TT.sample();
  const t = s.teachers[0];
  for (let d = 0; d < 5; d++) for (let p = 0; p < 8; p++) t.unavailable[`${d}-${p}`] = true;
  const r = TT.generate(s, { seed: 1, improveMs: 100 });
  assert.ok(r.unplaced.length > 0);
  assert.ok(r.unplaced[0].reason.length > 0);
  assert.ok(TT.precheck(s).some((x) => x.sev === 'error'));
});

test('applyMove: alih ke slot kosong dan tukar tempat', () => {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 2, improveMs: 200 }).placements;
  const pl = s.placements.find((p) => p.len === 1);
  // cari slot kosong yang sah untuk kelas ini, jika ada
  let moved = 0;
  for (let d = 0; d < 5 && !moved; d++) for (let p = 0; p < 8 && !moved; p++) {
    if (TT.checkPlacement(s, pl.unit, d, p).ok && (d !== pl.day || p !== pl.start)) {
      assert.ok(TT.applyMove(s, pl.unit, d, p).ok); moved = 1;
    }
  }
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
});

test('applyMove tidak merosakkan jadual walau cubaan rawak', () => {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 8, improveMs: 200 }).placements;
  let rnd = 12345; const r = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let swaps = 0;
  for (let i = 0; i < 400; i++) {
    const pl = s.placements[(r() * s.placements.length) | 0];
    const res = TT.applyMove(s, pl.unit, (r() * 5) | 0, (r() * 8) | 0);
    if (res.swapped) swaps++;
    assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), [], `iterasi ${i}`);
  }
  assert.ok(swaps > 0, 'tiada tukar tempat berlaku, ujian tidak menguji laluan swap');
});

test('applyMove: seret unit belum diletak ke slot diduduki mengeluarkan unit penghalang', () => {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 6, improveMs: 100 }).placements;
  const victim = s.placements.find((p) => p.len === 1);
  TT.unplace(s, victim.unit);
  // cari unit lain bagi kelas sama yang boleh ditukar ke slot victim
  const lesson = s.lessons.find((l) => l.id === victim.lessonId);
  const others = s.placements.filter((p) => p.len === 1 && s.lessons.find((l) => l.id === p.lessonId).classIds[0] === lesson.classIds[0]);
  const before = s.placements.length;
  const r = TT.applyMove(s, victim.unit, others[0].day, others[0].start);
  if (r.ok && r.swapped) assert.strictEqual(s.placements.length, before);
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
});
