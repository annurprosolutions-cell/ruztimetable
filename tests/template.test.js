// Templat import Excel: tajuk tetap, rujukan nama/kod, ralat dengan nombor baris, eksport dan import semula.
const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/xlsx.js');
require('../js/import.js');
require('../js/template.js');
require('../js/sample.js');

const sheetsOf = (list) => list.map((x) => ({ name: x.name, rows: x.rows }));
// helaian templat sebenar yang dihantar ke Excel dan dibaca semula (pusingan penuh .xlsx)
const roundTrip = async (list) => (await TT.xlsxRead(TT.xlsxWrite(list).buffer.slice(0))).sheets;

const fill = () => [
  { name: 'Arahan', rows: [['Templat']] },
  { name: 'Guru', rows: [['Nama Guru', 'Kod', 'Panitia', 'Jawatan', 'Had Waktu Sehari', 'Had Waktu Seminggu'],
    ['(contoh) Cikgu Contoh', 'CCT', '', '', 7, 36],
    ['Aminah binti Ali', 'AMA', 'Sains', 'GB', 6, 30], ['Kumar a/l Rajan', 'KUM', 'Matematik', '', '', ''], ['Lim Mei Ling', '', 'Bahasa', '', 20, '']] },
  { name: 'Subjek', rows: [['Nama Subjek', 'Kod', 'Subjek Berat'], ['Matematik', 'MT', 'YA'], ['Pendidikan Jasmani', 'PJ', ''], ['Sains', 'SN', '']] },
  { name: 'Kelas', rows: [['Nama Kelas', 'Tahun / Tingkatan', 'Guru Kelas'], ['1 Amanah', '1', 'AMA'], ['1 Bestari', '', 'Tiada Orang'], ['2 Amanah', 'Tahun 2', '']] },
  { name: 'Bilik', rows: [['Nama Bilik', 'Jenis'], ['Makmal Sains', 'Makmal']] },
  { name: 'Pelajaran', rows: [['Kelas', 'Subjek', 'Guru', 'Waktu Seminggu', 'Waktu Berganda', 'Bilik'],
    ['(contoh) 1 Amanah', 'Matematik', 'Kumar a/l Rajan', 5, 0, ''],
    ['1 Amanah', 'Matematik', 'Kumar a/l Rajan', 5, 1, ''],
    ['1 amanah ; 1 Bestari', 'PJ', 'Lim Mei Ling', 2, 1, ''],
    ['2 Amanah', 'Sains', 'AMA', 3, '', 'makmal sains'],
    ['3 Tiada', 'Matematik', 'Kumar a/l Rajan', 5, 0, ''],
    ['2 Amanah', 'Bahasa', 'Kumar a/l Rajan', 5, 0, ''],
    ['2 Amanah', 'Matematik', 'Guru Hilang', 5, 0, ''],
    ['2 Amanah', 'Matematik', 'Kumar a/l Rajan', 'banyak', 0, ''],
    ['2 Amanah', 'Matematik', 'Kumar a/l Rajan', 3, 2, ''],
    ['2 Amanah', 'Matematik', '', 4, 0, ''],
    ['1 Amanah', 'Matematik', 'KUM', 5, 1, ''],
    ['2 Amanah', 'Sains', 'Lim Mei Ling', 2, 0, 'Bilik Tiada']] }
];

test('templat: tajuk, contoh diabaikan, rujukan nama atau kod, ralat dengan nombor baris', () => {
  const r = TT.parseTemplate(fill(), TT.newState());
  assert.strictEqual(r.isTemplate, true);
  assert.deepStrictEqual(r.teachers.map((t) => t.name), ['Aminah binti Ali', 'Kumar a/l Rajan', 'Lim Mei Ling'], 'baris (contoh) diabaikan');
  assert.deepStrictEqual([r.teachers[0].dept, r.teachers[0].role, r.teachers[0].maxPerDay, r.teachers[0].maxPerWeek], ['Sains', 'GB', 6, 30]);
  assert.strictEqual(r.teachers[1].maxPerDay, null, 'kosong = lalai');
  assert.strictEqual(r.teachers[2].maxPerDay, null, 'had 20 sehari tidak sah, diabaikan');
  assert.ok(r.warnings.some((w) => w.sheet === 'Guru' && w.row === 5 && /Had waktu sehari/.test(w.msg)));
  assert.strictEqual(r.subjects[0].heavy, true);
  assert.deepStrictEqual(r.classes.map((c) => c.level), ['1', '1', '2'], 'tahun daripada nama atau lajur ("Tahun 2" jadi 2)');
  assert.strictEqual(r.classes[0].homeroom, 'AMA');
  assert.strictEqual(r.classes[1].homeroom, '', 'guru kelas tidak dijumpai diabaikan');
  assert.ok(r.warnings.some((w) => w.sheet === 'Kelas' && /Tiada Orang/.test(w.msg)));
  // baris Excel (tajuk = 1, contoh = 2): sah 3 (1 Amanah Matematik), 4 (gabungan PJ), 5 (Sains+bilik), 13 (bilik tiada, bilik diabaikan); 12 ialah pendua baris 3
  assert.deepStrictEqual(r.lessons.map((l) => l.row), [3, 4, 5, 13]);
  const gab = r.lessons.find((l) => l.row === 4);
  assert.deepStrictEqual([gab.classes, gab.subject, gab.teachers, gab.perWeek, gab.doubles], [['1 Amanah', '1 Bestari'], 'Pendidikan Jasmani', ['Lim Mei Ling'], 2, 1], 'kod subjek PJ, kelas ; dan huruf kecil dipadankan');
  assert.deepStrictEqual([r.lessons.find((l) => l.row === 5).teachers, r.lessons.find((l) => l.row === 5).room], [['Aminah binti Ali'], 'Makmal Sains'], 'guru ikut kod, bilik huruf kecil');
  const bad = (row, rx) => assert.ok(r.errors.some((e) => e.sheet === 'Pelajaran' && e.row === row && rx.test(e.msg)), `baris ${row} ${rx}: ${JSON.stringify(r.errors.filter((e) => e.row === row))}`);
  bad(6, /Kelas "3 Tiada" tiada/); bad(7, /Subjek "Bahasa" tiada/); bad(8, /Guru "Guru Hilang" tiada/);
  bad(9, /Waktu seminggu "banyak" tidak sah/); bad(10, /berganda terlalu banyak/); bad(11, /Guru kosong/);
  assert.ok(r.warnings.some((w) => w.sheet === 'Pelajaran' && w.row === 12 && /sama sudah ada/.test(w.msg)), 'pelajaran bertindih (guna kod guru) dikesan');
  assert.ok(r.warnings.some((w) => w.row === 13 && /Bilik Tiada/.test(w.msg)));
  assert.ok(r.errors.every((e) => e.row > 0));
});

test('templat: fail biasa (aSc) bukan templat; nama sedia ada boleh dirujuk dalam mod tambah', () => {
  assert.strictEqual(TT.parseTemplate([{ name: 'Guru', rows: [['Nama', 'KOD'], ['Ali', 'ALI']] }], TT.newState()).isTemplate, false);
  const s = TT.newState();
  s.teachers.push({ id: 't1', name: 'Siti Aminah', short: 'SAM' }); s.classes.push({ id: 'c1', name: '3 Amanah' }); s.subjects.push({ id: 's1', name: 'Sains', short: 'SN' });
  const r = TT.parseTemplate([{ name: 'Pelajaran', rows: [['Kelas', 'Subjek', 'Guru', 'Waktu Seminggu'], ['3 Amanah', 'Sains', 'SAM', 4], ['3 Amanah', 'Sains', 'Orang Lain', 4]] }], s);
  assert.strictEqual(r.isTemplate, true);
  assert.strictEqual(r.lessons.length, 1);
  assert.match(r.errors[0].msg, /Guru "Orang Lain" tiada/);
  assert.strictEqual(r.errors[0].row, 3);
});

test('templat: applyImport menambah senarai, guru kelas dan pelajaran; kemas kini bukan gandakan; langkau yang rujukannya tiada', () => {
  const s = TT.newState();
  const r = TT.parseTemplate(fill(), s);
  const n = TT.applyImport(s, r, 'add', ['classes', 'subjects', 'teachers', 'rooms', 'lessons']);
  assert.deepStrictEqual([n.teachers, n.subjects, n.classes, n.rooms], [3, 3, 3, 1]);
  assert.strictEqual(n.lessons, 4, 'empat pelajaran baharu (baris 3, 4, 5, 13; baris 12 ialah pendua)');
  const ama = s.teachers.find((t) => t.short === 'AMA');
  assert.deepStrictEqual([ama.dept, ama.role, ama.maxPerDay, ama.maxPerWeek], ['Sains', 'GB', 6, 30]);
  assert.strictEqual(s.teachers.find((t) => t.name === 'Lim Mei Ling').maxPerDay, 7, 'had kosong atau tidak sah guna lalai');
  assert.strictEqual(s.subjects.find((x) => x.short === 'MT').heavy, true);
  assert.strictEqual(s.classes.find((c) => c.name === '1 Amanah').homeroomId, ama.id, 'guru kelas dirujuk ikut kod');
  assert.strictEqual(s.classes.find((c) => c.name === '2 Amanah').level, '2');
  const pj = s.lessons.find((l) => l.classIds.length === 2);
  assert.deepStrictEqual([pj.perWeek, pj.doubles], [2, 1]);
  const sn = s.lessons.find((l) => s.subjects.find((x) => x.id === l.subjectId).short === 'SN' && l.roomId);
  assert.strictEqual(s.rooms.find((x) => x.id === sn.roomId).name, 'Makmal Sains');
  // import kali kedua: kemas kini bukan gandakan
  const r2 = TT.parseTemplate(fill(), s);
  r2.lessons[0].perWeek = 6;
  const n2 = TT.applyImport(s, r2, 'add', ['lessons']);
  assert.deepStrictEqual([n2.lessons, n2.lessonsUpdated], [0, 4]);
  assert.strictEqual(s.lessons.length, 4);
  assert.strictEqual(s.lessons.find((l) => l.perWeek === 6).perWeek, 6);
  // pelajaran sahaja tanpa senarai: rujukan tiada -> dilangkau
  const kosong = TT.newState();
  const n3 = TT.applyImport(kosong, r, 'add', ['lessons']);
  assert.deepStrictEqual([n3.lessons, n3.lessonsSkipped], [0, 4]);
  // mod ganti membuang pelajaran lama
  const n4 = TT.applyImport(s, r, 'replace', ['classes', 'subjects', 'teachers', 'rooms', 'lessons']);
  assert.strictEqual(s.lessons.length, 4);
  assert.strictEqual(n4.teachers, 3);
});

test('templat: eksport data sekolah ke templat kemudian import semula memberi data yang sama (melalui fail .xlsx sebenar)', async () => {
  const src = TT.migrate(JSON.parse(JSON.stringify(TT.sample())));
  assert.ok(src.lessons.length > 20, 'ada data contoh');
  const sheets = await roundTrip(TT.templateSheets(src, true));
  assert.deepStrictEqual(sheets.map((x) => x.name), ['Arahan', 'Guru', 'Subjek', 'Kelas', 'Bilik', 'Pelajaran']);
  const parsed = TT.parseTemplate(sheets, TT.newState());
  assert.deepStrictEqual(parsed.errors, [], 'eksport sendiri tiada ralat');
  const dst = TT.newState();
  TT.applyImport(dst, parsed, 'add', ['classes', 'subjects', 'teachers', 'rooms', 'lessons']);
  assert.strictEqual(dst.teachers.length, src.teachers.length);
  assert.strictEqual(dst.classes.length, src.classes.length);
  assert.strictEqual(dst.lessons.length, src.lessons.length);
  const total = (x) => x.lessons.reduce((a, l) => a + l.perWeek * l.classIds.length, 0);
  assert.strictEqual(total(dst), total(src), 'jumlah waktu seminggu sama');
  const nm = (x, l) => `${l.classIds.map((c) => x.classes.find((y) => y.id === c).name).sort().join('+')}|${x.subjects.find((y) => y.id === l.subjectId).name}|${l.teacherIds.map((t) => x.teachers.find((y) => y.id === t).name).sort().join('+')}|${l.perWeek}|${l.doubles || 0}`;
  assert.deepStrictEqual(dst.lessons.map((l) => nm(dst, l)).sort(), src.lessons.map((l) => nm(src, l)).sort());
  assert.deepStrictEqual(dst.teachers.map((t) => [t.name, t.short, t.maxPerDay]).sort(), src.teachers.map((t) => [t.name, t.short, t.maxPerDay]).sort());
});

test('templat: templat kosong boleh dibaca semula dan semua baris contoh diabaikan', async () => {
  const sheets = await roundTrip(TT.templateSheets(TT.newState(), false));
  const r = TT.parseTemplate(sheets, TT.newState());
  assert.strictEqual(r.isTemplate, true);
  assert.deepStrictEqual([r.teachers.length, r.subjects.length, r.classes.length, r.rooms.length, r.lessons.length, r.errors.length], [0, 0, 0, 0, 0, 0]);
  const g = sheets.find((x) => x.name === 'Arahan').rows.flat().join('\n');
  assert.match(g, /pisahkan dengan ;/);
  assert.deepStrictEqual(sheets.find((x) => x.name === 'Pelajaran').rows[0], TT.TEMPLATE_HEAD.pelajaran);
});
