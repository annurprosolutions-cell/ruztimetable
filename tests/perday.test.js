// Masa ikut hari: jam waktu berbeza setiap hari (contoh sesi petang) dan waktu "tiada kelas" pada hari tertentu.
const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/relief.js');
require('../js/insights.js');
require('../js/brand.js');
require('../js/access.js');
require('../js/sheets.js');

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// 10 waktu 30 minit, rehat 20 minit selepas waktu 5, mula pada jam `start`
const day = (start) => {
  const out = []; let t = start;
  for (let i = 1; i <= 10; i++) {
    out.push({ label: String(i), start: hm(t), end: hm(t + 30), type: 'lesson' }); t += 30;
    if (i === 5) { out.push({ label: 'Rehat', start: hm(t), end: hm(t + 20), type: 'break' }); t += 20; }
  }
  return out;
};
const times = (ps) => ps.map((p) => ({ start: p.start, end: p.end }));

// pola sekolah dalam contoh sebenar: Isnin mula 11:30, Selasa 11:10, Rabu 06:50 pagi, Khamis 11:30 (waktu 1 tiada kelas),
// Jumaat 12:10 (waktu 1-2 tiada kelas)
function school() {
  const s = TT.newState();
  s.periods = day(11 * 60 + 30); s.dayLimits = [10, 10, 10, 10, 10];
  s.school.perDayTime = true;
  s.dayTimes = { 1: times(day(11 * 60 + 10)), 2: times(day(6 * 60 + 50)), 4: times(day(12 * 60 + 10)) };
  s.dayOff = { 3: [0], 4: [0, 1] };
  s.subjects = ['BM', 'BI', 'MT', 'SN', 'PJ'].map((x) => ({ id: x.toLowerCase(), name: x, short: x, color: '#2563eb' }));
  s.teachers = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => ({ id: 't' + x, name: 'Guru ' + x, short: x, dept: '', subjectIds: [], maxPerDay: 9, maxPerWeek: 40, unavailable: {} }));
  s.classes = [{ id: 'c1', name: '1 Inovatif', level: '1' }, { id: 'c2', name: '1 Kreatif', level: '1' }, { id: 'c3', name: '2 Inovatif', level: '2' }];
  const L = (id, c, sub, t, n, d) => ({ id, classIds: [c], subjectId: sub, teacherIds: [t], perWeek: n, doubles: d || 0 });
  s.lessons = [];
  ['c1', 'c2', 'c3'].forEach((c, i) => {
    s.lessons.push(L(c + 'bm', c, 'bm', ['tA', 'tB', 'tC'][i], 10, 1), L(c + 'bi', c, 'bi', ['tB', 'tC', 'tA'][i], 8), L(c + 'mt', c, 'mt', ['tD', 'tE', 'tF'][i], 9),
      L(c + 'sn', c, 'sn', ['tE', 'tF', 'tD'][i], 6), L(c + 'pj', c, 'pj', ['tF', 'tD', 'tE'][i], 4));
  });
  return TT.migrate(s);
}

test('masa ikut hari: jam dan waktu tiada kelas ikut hari, masa asas kekal tanpa hari', () => {
  const s = school();
  assert.strictEqual(TT.slots(s, 0)[0].start, '11:30', 'tanpa hari: masa asas');
  assert.strictEqual(TT.slots(s, 0, 0)[0].start, '11:30', 'Isnin tiada tetapan: ikut asas');
  assert.strictEqual(TT.slots(s, 0, 1)[0].start, '11:10');
  assert.strictEqual(TT.slots(s, 0, 2)[0].start, '06:50');
  assert.strictEqual(TT.slots(s, 0, 2)[9].end, '12:10');
  assert.deepStrictEqual(TT.slots(s, 0, 4).map((x) => x.off), [true, true, false, false, false, false, false, false, false, false]);
  assert.ok(TT.slots(s, 0, 2)[5].breakBefore, 'rehat kekal di kedudukan yang sama');
  // suis dimatikan: semua hari ikut masa asas dan tiada waktu ditutup
  const off = JSON.parse(JSON.stringify(s)); off.school.perDayTime = false;
  assert.strictEqual(TT.slots(off, 0, 2)[0].start, '11:30');
  assert.ok(!TT.slots(off, 0, 4)[0].off);
  const tm = TT.timeModel(s);
  assert.strictEqual(tm.multi, false, 'satu set: semakan bertindih ikut nombor waktu');
  assert.deepStrictEqual([tm.sets[0].open[3][0], tm.sets[0].open[3][1], tm.sets[0].open[4][1], tm.sets[0].open[0][0]], [false, true, false, true]);
});

test('masa ikut hari: penjana tidak meletak pada waktu tiada kelas, semakan dan seret menolak', () => {
  const s = school();
  const r = TT.generate(s, { seed: 3, improveMs: 0 });
  s.placements = r.placements;
  assert.strictEqual(r.placements.reduce((a, p) => a + p.len, 0), 3 * 37, 'semua 37 waktu setiap kelas diletak');
  for (const p of s.placements) for (let j = 0; j < p.len; j++) {
    const q = p.start + j;
    assert.ok(!((p.day === 3 && q === 0) || (p.day === 4 && q <= 1)), `${p.unit} jatuh pada waktu tiada kelas`);
  }
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
  const u = s.placements.find((p) => p.len === 1);
  const chk = TT.checkPlacement(s, u.unit, 4, 0, new Set([u.unit]));
  assert.strictEqual(chk.ok, false);
  assert.match(chk.reason, /Tiada kelas/);
  // letak paksa pada waktu tiada kelas: validate mengesan
  const bad = JSON.parse(JSON.stringify(s)); bad.placements.find((p) => p.unit === u.unit).day = 4; bad.placements.find((p) => p.unit === u.unit).start = 0;
  assert.ok(TT.validate(bad).issues.some((x) => x.sev === 'error' && /tiada kelas/.test(x.msg)));
  // kapasiti precheck kira waktu terbuka sahaja (50 - 3 = 47 slot)
  const big = school(); big.lessons[0].perWeek = 30;
  assert.ok(TT.precheck(big).some((x) => /1 Inovatif/.test(x.msg)), 'beban melebihi 47 slot terbuka dikesan');
});

test('masa ikut hari: mesej relief, Sheet Jadual dan jadual guru guna jam hari itu', () => {
  const s = school();
  s.placements = TT.generate(s, { seed: 3, improveMs: 0 }).placements;
  // Rabu 04/11/2026
  const pl = s.placements.find((p) => p.day === 2 && p.start === 0);
  const l = s.lessons.find((x) => x.id === pl.lessonId);
  s.absences = [{ id: 'a1', date: '2026-11-04', teacherId: l.teacherIds[0], from: null, to: null, reason: 'MC' }];
  const msg = TT.reliefMessage(s, '2026-11-04');
  assert.ok(msg.includes('06:50-'), 'jam Rabu dalam mesej WhatsApp');
  assert.ok(!msg.includes('11:30-12:00'), 'bukan jam Isnin');
  const tabs = TT.toSheets(s, {});
  const row = tabs.Jadual.find((r) => r[0] === pl.unit);
  assert.match(String(row[7]), /^06:50/, 'masa (rujukan) dalam Sheet ikut hari');
  const td = TT.teacherDay(s, l.teacherIds[0], '2026-11-04');
  assert.strictEqual(td[0].start, '06:50');
});

test('masa ikut hari: disimpan dan dimuat semula daripada Google Sheets', () => {
  const s = school();
  const back = TT.fromSheets(JSON.parse(JSON.stringify(TT.toSheets(s, {}))));
  assert.strictEqual(back.school.perDayTime, true);
  assert.deepStrictEqual(back.dayTimes, s.dayTimes);
  assert.deepStrictEqual(back.dayOff, s.dayOff);
  assert.strictEqual(TT.slots(back, 0, 2)[0].start, '06:50');
});

test('masa ikut hari + set berbilang: guru dua set disemak ikut masa sebenar setiap hari', () => {
  const s = school();
  // set kedua: Isnin jam sama, tetapi Rabu bermula 15 minit lewat (waktu sama indeks bertindih separuh)
  s.school.multiTime = true;
  s.timeSets = [{ id: 'ts1', name: 'Tahap 2', periods: day(11 * 60 + 30), dayLimits: [10, 10, 10, 10, 10], dayTimes: { 2: times(day(7 * 60 + 5)) }, dayOff: {} }];
  s.classes[2].timeSet = 'ts1';
  TT.migrate(s);
  const tm = TT.timeModel(s);
  assert.strictEqual(tm.multi, true);
  // Isnin: waktu 1 kedua-dua set sama masa; Rabu: berbeza
  assert.deepStrictEqual(TT.atomRange(tm, 0, 0, 1, 0), TT.atomRange(tm, 1, 0, 1, 0));
  assert.notDeepStrictEqual(TT.atomRange(tm, 0, 0, 1, 2), TT.atomRange(tm, 1, 0, 1, 2));
  const [a0, a1] = TT.atomRange(tm, 0, 0, 1, 2), [b0, b1] = TT.atomRange(tm, 1, 0, 1, 2);
  assert.ok(a0 < b1 && b0 < a1, '06:50-07:20 bertindih dengan 07:05-07:35');
  s.placements = TT.generate(s, { seed: 4, improveMs: 0 }).placements;
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
  // tiada guru dua tempat pada masa yang sama, ikut jam setiap hari
  const m = TT.maps(s);
  for (const p of s.placements) for (const q of s.placements) {
    if (p === q || p.day !== q.day) continue;
    const lp = m.lesson.get(p.lessonId), lq = m.lesson.get(q.lessonId);
    if (!lp.teacherIds.some((t) => lq.teacherIds.includes(t))) continue;
    const [x0, x1] = TT.atomRange(tm, TT.lessonSetIdx(s, lp), p.start, p.len, p.day), [y0, y1] = TT.atomRange(tm, TT.lessonSetIdx(s, lq), q.start, q.len, q.day);
    assert.ok(!(x0 < y1 && y0 < x1), `${p.unit} dan ${q.unit} bertindih`);
  }
});
