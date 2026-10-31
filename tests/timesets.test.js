const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/relief.js');

// Sekolah rendah: Tahap 1 rehat 09:40, Tahap 2 rehat 10:10. Waktu 30 minit.
const P = (rows) => rows.map(([label, start, end, type]) => ({ label, start, end, type: type || 'lesson' }));
const T1 = P([['1', '07:40', '08:10'], ['2', '08:10', '08:40'], ['3', '08:40', '09:10'], ['4', '09:10', '09:40'], ['Rehat', '09:40', '10:10', 'break'],
  ['5', '10:10', '10:40'], ['6', '10:40', '11:10'], ['7', '11:10', '11:40'], ['8', '11:40', '12:10'], ['9', '12:10', '12:40'], ['10', '12:40', '13:10']]);
const T2 = P([['1', '07:40', '08:10'], ['2', '08:10', '08:40'], ['3', '08:40', '09:10'], ['4', '09:10', '09:40'], ['5', '09:40', '10:10'], ['Rehat', '10:10', '10:40', 'break'],
  ['6', '10:40', '11:10'], ['7', '11:10', '11:40'], ['8', '11:40', '12:10'], ['9', '12:10', '12:40'], ['10', '12:40', '13:10'], ['11', '13:10', '13:40']]);

function school() {
  const s = TT.newState();
  s.school.multiTime = true; s.school.mainSetName = 'Tahap 2';
  s.periods = T2; s.dayLimits = [11, 11, 9, 9, 8];
  s.timeSets = [{ id: 'ts1', name: 'Tahap 1', periods: T1, dayLimits: [10, 10, 10, 9, 8] }];
  s.subjects = [{ id: 'bm', name: 'BM', short: 'BM', color: '#e11d48' }, { id: 'mt', name: 'MT', short: 'MT', color: '#2563eb' }, { id: 'pi', name: 'PI', short: 'PI', color: '#059669' }];
  s.teachers = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => ({ id: 't' + x, name: 'Guru ' + x, short: x, dept: '', subjectIds: [], maxPerDay: 8, maxPerWeek: 36, unavailable: {} }));
  s.classes = [
    { id: 'c1', name: '1 Amanah', level: '1', timeSet: 'ts1' }, { id: 'c2', name: '2 Amanah', level: '2', timeSet: 'ts1' },
    { id: 'c4', name: '4 Amanah', level: '4', timeSet: '' }, { id: 'c5', name: '5 Amanah', level: '5', timeSet: '' }
  ];
  // guru A dan B mengajar kedua-dua tahap: inilah kes yang mesti disemak ikut masa sebenar
  const L = (id, cls, sub, tch, n, d) => ({ id, classIds: [cls], subjectId: sub, teacherIds: [tch], perWeek: n, doubles: d || 0 });
  s.lessons = [
    L('l1', 'c1', 'bm', 'tA', 10, 1), L('l2', 'c2', 'bm', 'tA', 8), L('l3', 'c4', 'bm', 'tA', 6), L('l4', 'c5', 'bm', 'tB', 6),
    L('l5', 'c1', 'mt', 'tB', 8), L('l6', 'c2', 'mt', 'tC', 8), L('l7', 'c4', 'mt', 'tB', 6, 1), L('l8', 'c5', 'mt', 'tC', 6),
    L('l9', 'c1', 'pi', 'tD', 6), L('l10', 'c2', 'pi', 'tD', 6), L('l11', 'c4', 'pi', 'tE', 6), L('l12', 'c5', 'pi', 'tF', 6)
  ];
  return TT.migrate(s);
}

const overlaps = (s, a, b) => {
  const tm = TT.timeModel(s), m = TT.maps(s);
  const ka = TT.lessonSetIdx(s, m.lesson.get(a.lessonId)), kb = TT.lessonSetIdx(s, m.lesson.get(b.lessonId));
  if (a.day !== b.day) return false;
  const [a0, a1] = TT.atomRange(tm, ka, a.start, a.len), [b0, b1] = TT.atomRange(tm, kb, b.start, b.len);
  return a0 < b1 && b0 < a1;
};

test('model masa: atom 30 minit, waktu sama indeks tetapi masa berbeza tidak bertindih', () => {
  const s = school(), tm = TT.timeModel(s);
  assert.strictEqual(tm.multi, true);
  assert.deepStrictEqual(tm.bad, []);
  assert.strictEqual(tm.A, 12); // 07:40 hingga 13:40 dalam blok 30 minit
  // Tahap 1 waktu ke-5 (10:10-10:40) dan Tahap 2 waktu ke-5 (09:40-10:10): indeks sama, masa berlainan
  assert.notDeepStrictEqual(tm.span[1][4], tm.span[0][4]);
  assert.strictEqual(tm.atoms[tm.span[1][4][0]].start, '10:10');
  assert.strictEqual(tm.atoms[tm.span[0][4][0]].start, '09:40');
});

test('satu set: model masa sama dengan waktu (tingkah laku asal)', () => {
  const s = school(); s.school.multiTime = false;
  const tm = TT.timeModel(s);
  assert.strictEqual(tm.multi, false);
  assert.strictEqual(tm.A, TT.slots(s).length);
  assert.ok(tm.span[0].every((x, p) => x[0] === p && x[1] === p + 1));
  assert.strictEqual(TT.classSetIdx(s, s.classes[0]), 0, 'set tambahan diabaikan bila pilihan dimatikan');
});

test('validate: guru dua tahap bertindih ikut masa, bukan nombor waktu', () => {
  const s = school();
  // A mengajar 1 Amanah (Tahap 1) waktu 6 = 10:40-11:10 dan 4 Amanah (Tahap 2) waktu 6 = 10:40-11:10: bertindih
  s.placements = [{ unit: 'l2:0', lessonId: 'l2', len: 1, day: 0, start: 5 }, { unit: 'l3:0', lessonId: 'l3', len: 1, day: 0, start: 5 }];
  let errs = TT.validate(s).issues.filter((i) => i.sev === 'error');
  assert.strictEqual(errs.length, 1, JSON.stringify(errs));
  assert.match(errs[0].msg, /Guru A bertindih pada Isnin 10:40-11:10/);
  // waktu ke-5 kedua-dua set: indeks sama tetapi 10:10 lawan 09:40, jadi sah
  s.placements = [{ unit: 'l2:0', lessonId: 'l2', len: 1, day: 0, start: 4 }, { unit: 'l3:0', lessonId: 'l3', len: 1, day: 0, start: 4 }];
  errs = TT.validate(s).issues.filter((i) => i.sev === 'error');
  assert.deepStrictEqual(errs, []);
});

test('checkPlacement dan applyMove menghormati masa sebenar merentas set', () => {
  const s = school();
  s.placements = [{ unit: 'l3:0', lessonId: 'l3', len: 1, day: 1, start: 5, locked: false }];
  const r = TT.checkPlacement(s, 'l2:0', 1, 5);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /Guru Guru A sudah mengajar/);
  assert.strictEqual(TT.checkPlacement(s, 'l2:0', 1, 4).ok, true);
});

test('jana: semua diletak, tiada bertindih masa guru, had hari setiap set dipatuhi', () => {
  const s = school();
  assert.deepStrictEqual(TT.precheck(s).filter((x) => x.sev === 'error'), []);
  const r = TT.generate(s, { seed: 3, improveMs: 300 });
  assert.strictEqual(r.unplaced.length, 0, JSON.stringify(r.unplaced.slice(0, 3)));
  s.placements = r.placements;
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
  const m = TT.maps(s);
  // semakan bebas: pasangan penempatan guru A tiada yang bertindih masa
  const mine = s.placements.filter((p) => m.lesson.get(p.lessonId).teacherIds.includes('tA'));
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) assert.ok(!overlaps(s, mine[i], mine[j]), `${mine[i].unit} / ${mine[j].unit}`);
  // Tahap 1 Jumaat hanya 8 waktu, Tahap 2 Rabu hanya 9
  for (const p of s.placements) {
    const k = TT.lessonSetIdx(s, m.lesson.get(p.lessonId));
    assert.ok(p.start + p.len <= TT.dayLimits(s, k)[p.day]);
  }
});

test('pelajaran gabungan merentas set ditolak oleh precheck dan enjin', () => {
  const s = school();
  s.lessons.push({ id: 'lx', classIds: ['c1', 'c4'], subjectId: 'pi', teacherIds: ['tE'], perWeek: 1, doubles: 0 });
  assert.ok(TT.precheck(s).some((x) => x.sev === 'error' && /set waktu berlainan/.test(x.msg)));
  const r = TT.generate(s, { seed: 1, improveMs: 0 });
  assert.ok(r.unplaced.some((u) => u.lessonId === 'lx' && /set waktu/.test(u.reason)));
});

test('masa rosak dalam set dilapor', () => {
  const s = school();
  s.timeSets[0].periods[0].end = '07:00';
  assert.ok(TT.precheck(s).some((x) => x.sev === 'error' && /masa tidak sah/.test(x.msg)));
});

test('sekatan serentak: mesyuarat Rabu waktu 8-11 untuk semua guru, jana tidak meletak pada masa itu', () => {
  const s = school();
  s.blocks = [{ id: 'b1', name: 'Mesyuarat guru', days: [2], from: 7, to: 10, teacherIds: [], dept: '' }];
  TT.migrate(s);
  const r = TT.generate(s, { seed: 5, improveMs: 200 });
  s.placements = r.placements;
  const tm = TT.timeModel(s), m = TT.maps(s);
  const [b0] = tm.span[0][7]; // 11:40 masa set utama
  for (const p of s.placements) {
    if (p.day !== 2) continue;
    const [a0, a1] = TT.atomRange(tm, TT.lessonSetIdx(s, m.lesson.get(p.lessonId)), p.start, p.len);
    assert.ok(a1 <= b0, `${p.unit} jatuh dalam waktu mesyuarat`);
  }
  assert.deepStrictEqual(TT.validate(s).issues.filter((x) => x.sev === 'error'), []);
  // letak manual pada waktu mesyuarat ditolak dengan nama sekatan
  s.placements = [];
  const c = TT.checkPlacement(s, 'l3:0', 2, 8);
  assert.strictEqual(c.ok, false);
  assert.match(c.reason, /Mesyuarat guru/);
});

test('sekatan ikut panitia hanya kena guru panitia itu', () => {
  const s = school();
  s.teachers[0].dept = 'Bahasa';
  s.blocks = [{ id: 'b', name: 'Panitia BM', days: [0], from: 0, to: 1, teacherIds: [], dept: 'Bahasa' }];
  assert.deepStrictEqual(Object.keys(TT.teacherUnavail(s, s.teachers[0])).sort(), ['0-0', '0-1']);
  assert.deepStrictEqual(TT.teacherUnavail(s, s.teachers[1]), {});
});
