const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/import.js');
require('../js/template.js');
require('../js/ascdb.js');

// fail tiruan berbentuk eksport Excel aSc (nama rekaan)
const HEAD = ['Guru', 'Kelas', 'Kumpulan', 'Subjek', 'Panjang', 'Bil. Pelajaran/Minggu', 'Bilik tersedia', 'Kitaran'];
const L = (g, k, kp, s, p, n) => [g, k, kp, s, p, String(n), 'Bilik Kelas', ' Semua minggu'];
const sheets = () => [
  { name: 'Pelajaran', rows: [HEAD,
    L('Tanpa guru', '1 ALFA,1 BETA', 'Seluruh kelas,Seluruh kelas', 'R', 'Single', 1),
    L('Tanpa guru', '1 ALFA,1 BETA', 'Seluruh kelas,Seluruh kelas', 'PERH', 'Single', 1),
    L('ALI BIN ABU', 'Tanpa kelas', '', 'GPM', 'Double', 5),
    L('ALI BIN ABU', '1 ALFA', 'Seluruh kelas', 'BM', 'Double', 2),
    L('ALI BIN ABU', '1 ALFA', 'Seluruh kelas', 'BM', 'Single', 1),
    L('SITI BINTI AHMAD,LIM MEI LING', '1 BETA', 'Seluruh kelas', 'RBT', 'Double', 2),
    L('KUMAR A/L RAJU', '1 ALFA,1 BETA', 'Seluruh kelas,Seluruh kelas', 'SK', 'Triple', 1),
    L('ALI BIN ABU', '1 ALFA,1 BETA', 'Boys,Boys', 'PJPK', 'Double', 1),
    L('SITI BINTI AHMAD', '1 BETA,1 ALFA', 'Girls,Girls', 'PJPK', 'Double', 1),
    L('USTAZ HAFIZ', '1 ALFA', 'ISLAM', 'PI', 'Double', 2),
    L('USTAZAH AINA', '1 BETA', 'ISLAM ', 'PI', 'Double', 2),
    L('LIM MEI LING', '1 ALFA,1 BETA', 'BUKAN ISLAM ,BUKAN ISLAM', 'PM', 'Double', 2),
    L('KUMAR A/L RAJU', '2 ALFA', 'ISLAM', 'PI', 'Single', 1),
    L('KUMAR A/L RAJU', '2 ALFA', 'BUKAN ISLAM', 'PM', 'Single', 1)
  ] },
  { name: 'Kelas', rows: [['Kelas', 'Singkatan', 'Masa Off'], ['1 ALFA', '1 A', ''], ['1 BETA', '1 B', ''], ['2 ALFA', '2 A', '']] },
  { name: 'Bilik', rows: [['', 'Nama', 'Singkatan', 'Jenis']] },
  { name: 'Subjek', rows: [['', 'Subjek', 'Singkatan'], ['', 'BAHASA MELAYU', 'BM'], ['', 'RBT', 'RBT'], ['', 'SAINS KOMPUTER ', 'SK'], ['', 'PJPK', 'PJPK'], ['', 'PI', 'PI'], ['', 'PM', 'PM'], ['', 'R', 'R'], ['', 'GPM', 'GPM']] },
  { name: 'Guru', rows: [['', 'Nama', 'Singkatan', 'Guru kelas', 'Kebenaran', 'Kontrak', 'Masa Lapang', 'Masa Off'],
    ['', 'ALI BIN ABU', 'ALI', '1 A', '', '10', '-', 'ISNIN: 11-14'], ['', 'SITI BINTI AHMAD', 'SITI', '', '', '8', '-', ''], ['', 'LIM MEI LING', 'LIM', '', '', '6', '-', ''],
    ['', 'KUMAR A/L RAJU', 'KUMAR', '', '', '6', '-', ''], ['', 'USTAZ HAFIZ', 'HAFIZ', '', '', '4', '-', ''], ['', 'USTAZAH AINA', 'AINA', '', '', '4', '-', ''], ['', 'PN ROSNAH', 'ROS', '', '', '0', '-', '']] },
  { name: 'Kontrak', rows: [['Guru', 'Kelas', 'Kumpulan', 'Subjek', 'Panjang', 'Bil. Pelajaran/Minggu'], ['ALI BIN ABU', '', '', '', '', '10']] }
];
const find = (d, subj, cls) => d.lessons.filter((l) => l.subject === subj && (!cls || l.classes.join('+') === cls));

test('kenal pasti pangkalan data aSc; templat dan senarai biasa tidak dikira', () => {
  assert.strictEqual(TT.isAscDb(sheets()), true);
  assert.strictEqual(TT.isAscDb(TT.templateSheets(null, false)), false);
  assert.strictEqual(TT.isAscDb([{ name: 'Kelas', rows: [['Kelas', 'KOD'], ['1 A', '1A']] }]), false);
  assert.strictEqual(TT.parseAscDb([{ name: 'Guru', rows: [['Nama']] }]).isAsc, false);
});

test('senarai guru, kelas, subjek dan guru kelas', () => {
  const d = TT.parseAscDb(sheets());
  assert.deepStrictEqual(d.classes.map((c) => c.name), ['1 ALFA', '1 BETA', '2 ALFA']);
  assert.deepStrictEqual(d.classes.map((c) => c.level), ['1', '1', '2']);
  assert.strictEqual(d.classes[0].homeroom, 'ALI BIN ABU');
  assert.strictEqual(d.teachers.length, 7);
  assert.strictEqual(d.teachers.find((t) => t.name === 'KUMAR A/L RAJU').code, 'KUMAR');
  assert.ok(!d.subjects.some((x) => x.name === 'R' || x.name === 'GPM'), 'subjek rehat/tugas tidak diimport');
  assert.ok(d.subjects.some((x) => x.name === 'BAHASA MELAYU' && x.code === 'BM'));
  assert.deepStrictEqual(d.skipped, ['Kontrak']);
  assert.deepStrictEqual(d.errors, []);
});

test('pelajaran: kad digabung, guru berkongsi dipecah, Triple jadi berganda + tunggal', () => {
  const d = TT.parseAscDb(sheets());
  const bm = find(d, 'BAHASA MELAYU');
  assert.strictEqual(bm.length, 1);
  assert.deepStrictEqual([bm[0].perWeek, bm[0].doubles, bm[0].classes, bm[0].teachers], [5, 2, ['1 ALFA'], ['ALI BIN ABU']]);
  const rbt = find(d, 'RBT')[0];
  assert.deepStrictEqual(rbt.teachers, ['SITI BINTI AHMAD', 'LIM MEI LING']);
  const sk = find(d, 'SAINS KOMPUTER')[0];
  assert.deepStrictEqual([sk.perWeek, sk.doubles, sk.classes], [3, 1, ['1 ALFA', '1 BETA']]);
});

test('kumpulan serentak digabung: PJK lelaki/perempuan dan PI/PM', () => {
  const d = TT.parseAscDb(sheets());
  const pj = find(d, 'PJPK');
  assert.strictEqual(pj.length, 1);
  assert.deepStrictEqual([pj[0].classes.sort(), pj[0].teachers.sort(), pj[0].perWeek, pj[0].doubles], [['1 ALFA', '1 BETA'], ['ALI BIN ABU', 'SITI BINTI AHMAD'], 2, 1]);
  const pipm = d.lessons.filter((l) => l.subject === 'PI/PM');
  assert.strictEqual(pipm.length, 1);
  const a = pipm.find((l) => l.classes.includes('1 ALFA'));
  assert.deepStrictEqual([a.classes.sort(), a.teachers.sort(), a.perWeek, a.doubles], [['1 ALFA', '1 BETA'], ['LIM MEI LING', 'USTAZ HAFIZ', 'USTAZAH AINA'], 4, 2]);
  assert.ok(d.subjects.some((x) => x.name === 'PI/PM'));
  assert.ok(!d.lessons.some((l) => (l.subject === 'PI' || l.subject === 'PM') && l.classes.includes('1 ALFA')), 'PI dan PM 1 ALFA digabung');
});

test('guru yang sama mengajar dua kumpulan: kekal dua pelajaran (tidak boleh serentak)', () => {
  const d = TT.parseAscDb(sheets());
  const two = d.lessons.filter((l) => l.classes.join() === '2 ALFA');
  assert.deepStrictEqual(two.map((l) => l.subject).sort(), ['PI', 'PM']);
  assert.ok(two.every((l) => l.teachers.join() === 'KUMAR A/L RAJU'));
});

test('komponen yang guru bertindih secara tidak langsung tidak digabung dan diberi amaran', () => {
  const sh = sheets();
  // PM gabungan 3 ALFA+3 BETA oleh guru yang juga mengajar PI 3 BETA: PI 3 ALFA -> PM -> PI 3 BETA tidak boleh serentak
  sh[0].rows.push(L('USTAZ HAFIZ', '3 ALFA', 'ISLAM', 'PI', 'Double', 1), L('LIM MEI LING', '3 BETA', 'ISLAM', 'PI', 'Double', 1), L('ZAKI BIN ZAIN', '3 ALFA,3 BETA', 'BUKAN ISLAM,BUKAN ISLAM', 'PM', 'Double', 1), L('LIM MEI LING', '3 ALFA', 'ISLAM', 'PI', 'Double', 1));
  sh[1].rows.push(['3 ALFA', '3 A', ''], ['3 BETA', '3 B', '']);
  const d = TT.parseAscDb(sh);
  assert.ok(d.warnings.some((w) => /tidak digabung/.test(w.msg)));
  assert.ok(!d.lessons.some((l) => l.subject === 'PI/PM' && l.classes.includes('3 ALFA')));
});

test('laporan: rehat dan perhimpunan, tugas tanpa kelas, Triple, Masa Off', () => {
  const d = TT.parseAscDb(sheets());
  const all = d.warnings.map((w) => w.msg).join('\n');
  assert.match(all, /tanpa guru tidak diimport \(2\): R, PERH/);
  assert.match(all, /Sekatan serentak/);
  assert.match(all, /Tugas tanpa kelas tidak diimport \(1\): GPM/);
  assert.match(all, /1 kad 3 waktu \(Triple\)/);
  assert.match(all, /1 guru ada "Masa Off"/);
});

test('had guru ikut beban: minimum 7, beban tinggi dinaikkan, had seminggu tidak kurang daripada beban', () => {
  const sh = sheets();
  for (let i = 0; i < 9; i++) sh[0].rows.push(L('USTAZAH AINA', '1 BETA', 'Seluruh kelas', 'BM', 'Double', 2));
  sh[0].rows.push(L('USTAZAH AINA', '1 BETA', 'Seluruh kelas', 'BI', 'Double', 1));
  const d = TT.parseAscDb(sh), T = (n) => d.teachers.find((t) => t.name === n);
  assert.strictEqual(T('PN ROSNAH').maxPerDay, 7);
  assert.strictEqual(T('PN ROSNAH').maxPerWeek, 36);
  // AINA: BM 4 waktu (kad sama dijumlahkan) + BI 2 + PI/PM 4 = 10 -> 7; tambah beban untuk uji had tinggi
  const big = sheets(); big[0].rows.push(...Array.from({ length: 12 }, (_, i) => L('USTAZAH AINA', '1 BETA', 'Seluruh kelas', 'S' + i, 'Double', 2)));
  const d2 = TT.parseAscDb(big), aina = d2.teachers.find((t) => t.name === 'USTAZAH AINA');
  assert.strictEqual(aina.maxPerWeek, 52); // 48 + PI/PM 4
  assert.strictEqual(aina.maxPerDay, 13); // ceil(52/5)=11 + 2
  assert.ok(d2.warnings.some((w) => /had mengajar sehari lebih daripada 7 \(hingga 13\)/.test(w.msg)));
  const s = { classes: [], subjects: [], teachers: [], rooms: [], lessons: [], placements: [], absences: [], reliefs: [] };
  TT.applyImport(s, d2, 'add', ['classes', 'subjects', 'teachers', 'rooms', 'lessons']);
  const t = s.teachers.find((x) => x.name === 'USTAZAH AINA');
  assert.deepStrictEqual([t.maxPerDay, t.maxPerWeek], [13, 52]);
  // import semula ke data sedia ada (mod tambah): had dinaikkan, tidak diturunkan
  t.maxPerDay = 7; t.maxPerWeek = 36; const ros = s.teachers.find((x) => x.name === 'PN ROSNAH'); ros.maxPerDay = 9;
  TT.applyImport(s, d2, 'add', ['teachers']);
  assert.deepStrictEqual([t.maxPerDay, t.maxPerWeek, ros.maxPerDay], [13, 52, 9]);
});

test('diterap ke data sekolah: pelajaran, guru kelas dan subjek guru', () => {
  const d = TT.parseAscDb(sheets());
  const s = { classes: [], subjects: [], teachers: [], rooms: [], lessons: [], placements: [], absences: [], reliefs: [] };
  const n = TT.applyImport(s, d, 'add', ['classes', 'subjects', 'teachers', 'rooms', 'lessons']);
  assert.deepStrictEqual([n.classes, n.teachers, n.lessons, n.lessonsSkipped], [3, 7, d.lessons.length, 0]);
  const ali = s.teachers.find((t) => t.name === 'ALI BIN ABU');
  assert.strictEqual(s.classes.find((c) => c.name === '1 ALFA').homeroomId, ali.id);
  const subj = (id) => s.subjects.find((x) => x.id === id).name;
  assert.deepStrictEqual(ali.subjectIds.map(subj).sort(), ['BAHASA MELAYU', 'PJPK']);
  const pipm = s.lessons.find((l) => subj(l.subjectId) === 'PI/PM' && l.classIds.length === 2);
  assert.strictEqual(pipm.teacherIds.length, 3);
});
