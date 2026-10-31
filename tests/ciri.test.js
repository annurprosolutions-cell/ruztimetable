const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/brand.js');
require('../js/sheets.js');
require('../js/xlsx.js');
require('../js/import.js');
require('../js/archive.js');

const MON = '2026-10-26';

// ---------- Excel ----------
// tukar zip "stored" kepada zip "deflate" seperti fail Excel sebenar (aSc / Microsoft Excel)
function deflateZip(stored) {
  const dv = new DataView(stored.buffer, stored.byteOffset, stored.byteLength), files = [];
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const n = dv.getUint16(p + 26, true), size = dv.getUint32(p + 18, true);
    files.push({ name: Buffer.from(stored.subarray(p + 30, p + 30 + n)), data: Buffer.from(stored.subarray(p + 30 + n, p + 30 + n + size)) });
    p += 30 + n + size;
  }
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const comp = zlib.deflateRawSync(f.data), crc = zlib.crc32 ? zlib.crc32(f.data) : 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(f.name.length, 26);
    parts.push(h, f.name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(f.name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, f.name); off += 30 + f.name.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat(parts.concat([cd, e])));
}

test('xlsx: tulis dan baca semula (teks khas, nombor, nama tab tidak sah, nama berganda)', async () => {
  const u8 = TT.xlsxWrite([
    { name: 'Guru: A/B', rows: [['Nama', 'Kod', 'Waktu'], ['Ali & <Abu> "bin"', 'ALI', 26], ['', 'X\nY', 3.5]], bold: [0] },
    { name: 'Guru: A/B', rows: [['tab kedua']] }
  ]);
  const r = await TT.xlsxRead(u8);
  assert.deepStrictEqual(r.sheets.map((x) => x.name), ['Guru  A B', 'Guru  A B (2)']);
  assert.deepStrictEqual(r.sheets[0].rows, [['Nama', 'Kod', 'Waktu'], ['Ali & <Abu> "bin"', 'ALI', 26], ['', 'X\nY', 3.5]]);
});

test('xlsx: baca fail termampat (deflate) seperti eksport Excel sebenar', async () => {
  const stored = TT.xlsxWrite([{ name: '1Kelas', rows: [['', 'NAMA KELAS DAN KOD 2026'], [], ['BIL', 'Kelas', 'KOD'], [1, '1 IBNU SINA', '1 IBS']] }]);
  const r = await TT.xlsxRead(deflateZip(stored));
  assert.strictEqual(r.sheets[0].rows[3][1], '1 IBNU SINA');
  await assert.rejects(TT.xlsxRead(new Uint8Array([1, 2, 3])), /Bukan fail Excel/);
});

// ---------- import aSc ----------
const ASC = [
  { name: '1Kelas', rows: [['', 'NAMA KELAS DAN KOD 2026', ''], [], ['BIL ', 'Kelas', 'KOD'], [1, '1 IBNU SINA', '1 IBS'], [2, '1 IBNU KHALDUN', '1 IBK'], [3, 'TINGKATAN 4 SAINS', '4S'], [4, '', ''], [5, '1 IBNU SINA', 'dup']] },
  { name: '2Subjek', rows: [['MATA PELAJARAN', 'KOD', 'Jumlah'], ['BAHASA MELAYU', 'BM', 168], ['MATEMATIK', 'MAT', 144]] },
  { name: '3Guru', rows: [['BIL', 'NAMA', 'KOD'], [1, 'AMINAH BINTI YUSOF', 'AMY'], [2, 'KAMARUL BIN ALI', '']] },
  { name: '4Bilik', rows: [['NAMA BILIK', 'KOD'], ['MAKMAL SAINS 1', 'MS1'], ['BENGKEL RBT', 'RBT']] },
  { name: 'Nota', rows: [['catatan sahaja']] }
];

test('import aSc: kenal pasti tab ikut tajuk, abaikan baris tajuk dokumen, kosong dan berganda', () => {
  const d = TT.importLists(ASC);
  assert.deepStrictEqual(d.classes.map((c) => [c.name, c.code, c.level]), [['1 IBNU SINA', '1 IBS', '1'], ['1 IBNU KHALDUN', '1 IBK', '1'], ['TINGKATAN 4 SAINS', '4S', '4']]);
  assert.deepStrictEqual(d.subjects.map((x) => x.code), ['BM', 'MAT']);
  assert.deepStrictEqual(d.teachers.map((x) => x.name), ['AMINAH BINTI YUSOF', 'KAMARUL BIN ALI']);
  assert.deepStrictEqual(d.rooms.map((x) => x.code), ['MS1', 'RBT']);
  assert.deepStrictEqual(d.skipped, ['Nota']);
});

test('import aSc: tambah tanpa berganda, ganti membuang pelajaran dan jadual', () => {
  const d = TT.importLists(ASC);
  // data contoh sudah ada "Bahasa Melayu", "Matematik", "Makmal Sains 1", "Bengkel RBT": nama sama (tanpa kira huruf besar) diabaikan
  assert.deepStrictEqual(TT.applyImport(TT.sample(), d, 'add'), { classes: 3, subjects: 0, teachers: 2, rooms: 0 });
  const s = TT.newState();
  const n = TT.applyImport(s, d, 'add');
  assert.deepStrictEqual(n, { classes: 3, subjects: 2, teachers: 2, rooms: 2 });
  assert.deepStrictEqual(TT.applyImport(s, d, 'add'), { classes: 0, subjects: 0, teachers: 0, rooms: 0 });
  const k = s.teachers.find((t) => t.name === 'KAMARUL BIN ALI');
  assert.strictEqual(k.short, 'KA', 'kod dijana daripada nama (tanpa bin/binti) jika tiada');
  assert.strictEqual(s.rooms.find((r) => r.name === 'MAKMAL SAINS 1').type, 'Makmal');
  const s2 = TT.sample();
  s2.placements = TT.generate(s2, { seed: 1, improveMs: 0 }).placements;
  TT.applyImport(s2, d, 'replace', ['classes', 'teachers']);
  assert.strictEqual(s2.classes.length, 3); assert.strictEqual(s2.teachers.length, 2);
  assert.strictEqual(s2.lessons.length, 0); assert.strictEqual(s2.placements.length, 0);
  assert.ok(s2.subjects.length > 2, 'senarai yang tidak dipilih kekal');
});

// ---------- relief: peraturan sekolah ----------
function reliefSchool() {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 4, improveMs: 0 }).placements;
  return s;
}
const T = (s, short) => s.teachers.find((t) => t.short === short);

test('peraturan relief: jawatan dikecualikan, had seminggu, had jumlah sehari, mesti ada waktu kosong', () => {
  const s = reliefSchool();
  s.absences.push({ id: 'a1', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON)[0];
  const ids = () => TT.reliefCandidates(s, need).map((c) => c.teacher.id);
  const base = ids();
  assert.ok(base.length > 3);

  const pk = s.teachers.find((t) => t.id === base[0]);
  pk.role = 'PK';
  s.settings.relief.excludeRoles = 'GB, pk';
  assert.ok(!ids().includes(pk.id), 'jawatan dalam senarai pengecualian (tidak sensitif huruf)');
  s.settings.relief.excludeRoles = '';

  // had seminggu: guru yang sudah 2 waktu relief minggu ini tidak layak bila had 2
  const t2 = base[1];
  s.reliefs.push({ id: 'x1', key: 'k1', date: '2026-10-27', absentTeacherId: 'z', lessonId: s.lessons[0].id, classIds: [], periods: [0, 1], status: 'assigned', reliefTeacherId: t2 });
  s.settings.relief.maxPerWeek = 2;
  assert.ok(!ids().includes(t2), 'had seminggu');
  s.settings.relief.maxPerWeek = 3;
  assert.ok(ids().includes(t2) || TT.reliefCandidates(s, need).length < base.length, 'had 3 membenarkan semula');
  s.settings.relief.maxPerWeek = 0; s.reliefs = [];

  // had jumlah sehari: guru yang mengajar >= had hari itu tidak dicadangkan
  const tm = TT.timeModel(s), grid = TT.teacherGrid(s, tm), day = TT.dateToDay(s, MON);
  const teach = (id) => { const seen = new Set(); let n = 0; grid.get(id)[day].forEach((x) => { if (x && !seen.has(x)) { seen.add(x); n += x.len; } }); return n; };
  s.settings.relief.maxTeachDay = 5;
  for (const c of TT.reliefCandidates(s, need)) assert.ok(teach(c.teacher.id) + need.periods.length <= 5, c.teacher.name);
  s.settings.relief.maxTeachDay = 0;

  // mesti ada waktu kosong sebelum atau selepas
  s.settings.relief.needGap = true;
  const sl = TT.slots(s), p0 = need.periods[0], p1 = need.periods[need.periods.length - 1];
  for (const c of TT.reliefCandidates(s, need)) {
    const g = grid.get(c.teacher.id)[day];
    const before = p0 === 0 || sl[p0].breakBefore || !g[p0 - 1], after = p1 + 1 >= sl.length || sl[p1 + 1].breakBefore || !g[p1 + 1];
    assert.ok(before || after, c.teacher.name);
  }
});

test('sekatan serentak sentiasa dihormati untuk relief walaupun profil "tidak boleh" diabaikan', () => {
  const s = reliefSchool();
  s.absences.push({ id: 'a1', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON)[0], day = TT.dateToDay(s, MON);
  s.settings.relief.respectUnavailable = false;
  const all = TT.reliefCandidates(s, need).map((c) => c.teacher.id);
  s.blocks = [{ id: 'b', name: 'Mesyuarat', days: [day], from: need.periods[0], to: need.periods[need.periods.length - 1], teacherIds: [all[0]], dept: '' }];
  assert.ok(!TT.reliefCandidates(s, need).some((c) => c.teacher.id === all[0]));
});

test('gabung kelas: calon kelas lain yang sedang belajar, teks status menyebut kelas dan guru', () => {
  const s = reliefSchool();
  s.absences.push({ id: 'a1', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON)[0];
  const opts = TT.mergeCandidates(s, need);
  assert.ok(opts.length > 0);
  assert.ok(opts.every((o) => !need.classIds.includes(o.cls.id)));
  assert.ok(opts[0].sameLevel, 'tahap sama disenaraikan dahulu');
  TT.setRelief(s, need, 'gabung', null, '', opts[0].cls.id);
  const rec = TT.reliefRecord(s, need);
  assert.strictEqual(rec.mergeClassId, opts[0].cls.id);
  assert.match(TT.reliefStatusText(s, rec), new RegExp(`Gabung dengan ${opts[0].cls.name}`));
  assert.match(TT.reliefMessage(s, MON), /Gabung dengan/);
});

// ---------- arkib ----------
test('arkib: pilih rekod sebelum tarikh, tab ringkasan, buang hanya rekod lama', () => {
  const s = reliefSchool();
  const amy = T(s, 'AMY').id;
  ['2025-03-10', '2025-11-03', MON].forEach((d, i) => { s.absences.push({ id: 'a' + i, date: d, teacherId: amy, from: null, to: null, reason: 'MC' }); TT.autoRelief(s, d); });
  assert.strictEqual(TT.archiveDue(s, MON), true);
  assert.strictEqual(TT.archiveSuggest(s, MON), '2026-01-01');
  const p = TT.archivePick(s, '2026-01-01');
  assert.strictEqual(p.absences.length, 2);
  const tabs = TT.archiveTabs(s, p, '2026-01-01');
  assert.deepStrictEqual(Object.keys(tabs), ['Ringkasan', 'TidakHadir', 'Relief']);
  assert.strictEqual(tabs.TidakHadir.length, 3);
  assert.strictEqual(tabs.Relief.length, p.reliefs.length + 1);
  assert.ok(tabs.Ringkasan.some((r) => r[0] === 'Aminah Yusof' && r[3] === 2));
  const n = TT.archiveRemove(s, '2026-01-01');
  assert.strictEqual(n.absences, 2);
  assert.ok(s.absences.every((a) => a.date >= '2026-01-01') && s.reliefs.every((r) => r.date >= '2026-01-01'));
  assert.ok(TT.reliefNeeds(s, MON).length > 0, 'rekod semasa kekal');
  assert.strictEqual(TT.archiveDue(s, MON), false);
});

// ---------- Google Sheets: medan baharu ----------
test('Sheets: set waktu, sekatan, jawatan, peraturan relief, gabung kelas dan arkib kekal selepas simpan dan muat', () => {
  const s = reliefSchool();
  s.school.multiTime = true; s.school.mainSetName = 'Tahap 2';
  s.timeSets = [{ id: 'ts1', name: 'Tahap 1', periods: TT.defaultPeriods().slice(0, 6), dayLimits: [5, 5, 5, 5, 4] }];
  s.classes[0].timeSet = 'ts1';
  s.blocks = [{ id: 'b1', name: 'Kokurikulum', days: [2], from: 6, to: 7, teacherIds: [], dept: '' }];
  s.teachers[0].role = 'PK';
  Object.assign(s.settings.relief, { maxPerWeek: 4, maxTeachDay: 6, needGap: true, excludeRoles: 'GB, PK' });
  s.archives = [{ title: 'Arkib 2025', url: 'https://x', before: '2026-01-01', count: 10, at: '2026-01-02T00:00:00.000Z' }];
  s.absences.push({ id: 'a1', date: MON, teacherId: T(s, 'AMY').id, from: null, to: null, reason: 'MC' });
  const need = TT.reliefNeeds(s, MON)[0];
  TT.setRelief(s, need, 'gabung', null, '', s.classes[1].id);
  const back = TT.fromSheets(JSON.parse(JSON.stringify(TT.toSheets(s, {}))));
  assert.strictEqual(back.school.multiTime, true);
  assert.strictEqual(back.school.mainSetName, 'Tahap 2');
  assert.deepStrictEqual(back.timeSets, s.timeSets);
  assert.strictEqual(back.classes[0].timeSet, 'ts1');
  assert.deepStrictEqual(back.blocks, s.blocks);
  assert.strictEqual(back.teachers[0].role, 'PK');
  assert.strictEqual(back.settings.relief.excludeRoles, 'GB, PK');
  assert.strictEqual(back.settings.relief.needGap, true);
  assert.strictEqual(back.reliefs.find((r) => r.status === 'gabung').mergeClassId, s.classes[1].id);
  assert.deepStrictEqual(back.archives, s.archives);
});
