const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/survey.js');
const { createEnv } = require('./helpers/appscript-mock.js');

const ID = 'abcDEF123456';
const part1 = () => ({ peranan: 'penyelaras', jenis: 'sm', bil_guru: 'g3', bil_kelas: 'k3', susun_siapa: 'pk', susun_alat: ['excel', 'asc'], susun_masa: 'm3',
  susah: ['sekatan', 'bertindih'], rel_maklum: 'hubungi_pic', rel_bila: 'pagi_awal', rel_agih_siapa: 'penyelaras', rel_agih_cara: ['whatsapp'], rel_masa: 'r2',
  rel_kriteria: ['subjek', 'kenal_kelas'], rel_guru_isi: 'perlu', google_jenis: 'delima', google_sekat: 'tidak', beli_siapa: 'pengetua' });
const part2 = () => ({ tugas: { jana: 'sendiri', rekod: 'sendiri', agih: 'bantuan', slip: 'tidak_cuba' }, mudah: 4, keliru: 'tiada', hilang: 'permohonan cuti',
  guru_lihat: 'sendiri', notif: ['app', 'whatsapp'], drive_selesa: 5, harga: { terlalu_murah: 500, murah: 1200, mahal_ok: 2500, terlalu_mahal: 5000 }, nps: 9, mula: 'sebelum_sesi' });

test('skema: ID soalan unik, pilihan lengkap, showIf merujuk soalan sedia ada', () => {
  const ids = new Set();
  for (const s of TT.SURVEY.sections) for (const q of s.questions) {
    assert.ok(!ids.has(q.id), 'ID berganda ' + q.id); ids.add(q.id);
    if (q.type === 'single' || q.type === 'multi') assert.ok(q.options.length >= 2, q.id);
    if (q.type === 'matrix') assert.ok(q.rows.length && q.options.length, q.id);
    if (q.type === 'numbers') assert.ok(q.fields.length === 4, q.id);
    if (q.showIf) assert.ok(TT.surveyQuestion(q.showIf.id), q.id);
  }
  const keys = TT.surveySchema().columns.map((c) => c.key);
  assert.strictEqual(new Set(keys).size, keys.length, 'kunci lajur berganda');
  assert.ok(!TT.SURVEY.sections.some((s) => /penutup/i.test(s.id + s.title)), 'bahagian Penutup sudah dibuang');
  assert.ok(!keys.some((k) => /nama|telefon|emel_?responden/.test(k)), 'tiada medan maklumat peribadi');
});

test('skema: bahagian 1 sebelum demo tidak bertanya tentang pengalaman demo', () => {
  const p1 = TT.surveySections(1).flatMap((s) => s.questions.map((q) => q.id));
  for (const id of ['tugas', 'mudah', 'nps', 'harga', 'guru_lihat', 'drive_selesa']) assert.ok(!p1.includes(id), id + ' patut dalam bahagian 2');
  assert.ok(TT.surveySections(2).flatMap((s) => s.questions.map((q) => q.id)).includes('nps'));
});

test('semakan: soalan wajib, had pilihan, lain-lain wajib dinyatakan', () => {
  const empty = TT.surveyValidate(1, {});
  assert.ok(empty.errors.peranan && empty.errors.susah && empty.errors.rel_guru_isi);
  assert.ok(!empty.errors.sesi && !empty.errors.rel_peraturan, 'soalan pilihan tidak wajib');
  assert.strictEqual(empty.first, 'peranan');
  assert.deepStrictEqual(TT.surveyValidate(1, part1()).errors, {});
  const tiga = Object.assign(part1(), { susah: ['sekatan', 'bertindih', 'gabung', 'bilik'] });
  assert.match(TT.surveyValidate(1, tiga).errors.susah, /sehingga 3/);
  const lain = Object.assign(part1(), { peranan: 'lain' });
  assert.match(TT.surveyValidate(1, lain).errors.peranan, /lain-lain/);
  assert.deepStrictEqual(TT.surveyValidate(1, Object.assign(lain, { peranan_lain: 'Guru tahun 1' })).errors, {});
});

test('semakan: soalan bersyarat hanya dipaparkan bila aSc atau Winjaws dipilih', () => {
  const q = TT.surveyQuestion('asc_sebab');
  assert.ok(TT.surveyVisible(q, { susun_alat: ['excel', 'winjaws'] }));
  assert.ok(!TT.surveyVisible(q, { susun_alat: ['excel'] }));
  assert.ok(!TT.surveyVisible(q, {}));
  assert.ok(!('asc_sebab' in TT.surveyAnswers(1, Object.assign(part1(), { susun_alat: ['excel'], asc_sebab: 'tersembunyi' }))), 'jawapan soalan tersembunyi dibuang');
  assert.ok('asc_sebab' in TT.surveyAnswers(1, Object.assign(part1(), { asc_sebab: 'mahal' })));
});

test('semakan bahagian 2: matriks, skala, harga mesti menaik', () => {
  assert.deepStrictEqual(TT.surveyValidate(2, part2()).errors, {});
  const e = TT.surveyValidate(2, Object.assign(part2(), { tugas: { jana: 'sendiri' }, keliru: ' ', nps: 11 }));
  assert.ok(e.errors.tugas && e.errors.keliru && e.errors.nps);
  const turun = Object.assign(part2(), { harga: { terlalu_murah: 500, murah: 400, mahal_ok: 2500, terlalu_mahal: 5000 } });
  assert.match(TT.surveyValidate(2, turun).errors.harga, /meningkat/);
  const neg = Object.assign(part2(), { harga: { terlalu_murah: -1, murah: 2, mahal_ok: 3, terlalu_mahal: 4 } });
  assert.ok(TT.surveyValidate(2, neg).errors.harga);
});

test('payload: dirata, bahagian betul, tiada jawapan bahagian lain', () => {
  const p = TT.surveyPayload(2, Object.assign(part1(), part2()), { id: ID });
  assert.strictEqual(p.part, 2);
  assert.strictEqual(p.answers.tugas_jana, 'sendiri');
  assert.strictEqual(p.answers.harga_murah, 1200);
  assert.strictEqual(p.answers.nps, 9);
  assert.ok(!('peranan' in p.answers), 'jawapan bahagian 1 tidak dihantar dalam bahagian 2');
});

test('Code.gs sepadan dengan js/survey.js (jalankan node tools/gen-appscript.js jika gagal)', () => {
  const env = createEnv();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.api.SCHEMA)), JSON.parse(JSON.stringify(TT.surveySchema())));
});

test('Apps Script: sediakan sheet, tajuk dua baris, idempotent, menu', () => {
  const env = createEnv();
  env.api.onOpen();
  assert.strictEqual(env.menus[0].title, 'Survey Jadual Sekolah');
  env.api.sediakanSheet();
  const s = env.sheets.get('Jawapan');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.grid[0])), JSON.parse(JSON.stringify(env.cols())));
  assert.strictEqual(s.grid[1].length, env.cols().length);
  assert.strictEqual(s.frozen, 2);
  assert.ok(env.sheets.get('Ringkasan'));
  env.api.sediakanSheet();
  assert.strictEqual(env.sheets.size, 2);
});

test('Apps Script: bahagian 1 ditambah sebagai baris baharu, jawapan ditukar kepada teks pilihan', () => {
  const env = createEnv();
  const r = env.post(TT.surveyPayload(1, part1(), { id: ID, ua: 'Mozilla/5.0 (Linux; Android 14)', dur: 321.7 }));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.baru, true); assert.strictEqual(r.baris, 3);
  const row = env.row(0);
  assert.strictEqual(row.meta_id, ID);
  assert.match(row.meta_masa1, /^2026-10-27 12:00:00$/, 'waktu Malaysia');
  assert.strictEqual(row.meta_dur1, 322);
  assert.strictEqual(row.peranan, 'Penyelaras jadual / relief');
  assert.strictEqual(row.susun_alat, 'Excel / Google Sheet | aSc Timetables');
  assert.strictEqual(row.susah, 'Terlalu banyak sekatan guru | Elak guru atau bilik bertindih', 'susunan keutamaan dikekalkan');
  assert.strictEqual(row.meta_masa2, '');
});

test('Apps Script: hantar semula atau bahagian 2 mengemas kini baris sama, tiada baris berganda', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, part1(), { id: ID }));
  const lagi = env.post(TT.surveyPayload(1, Object.assign(part1(), { peranan: 'pk' }), { id: ID }));
  assert.strictEqual(lagi.baru, false);
  assert.strictEqual(env.rows().length, 1);
  assert.strictEqual(env.row(0).peranan, 'Penolong Kanan / Pentadbiran');
  env.setNow(Date.UTC(2026, 9, 27, 4, 30, 0));
  env.post(TT.surveyPayload(2, part2(), { id: ID, dur: 100 }));
  assert.strictEqual(env.rows().length, 1);
  const row = env.row(0);
  assert.strictEqual(row.nps, 9); assert.strictEqual(row.harga_murah, 1200);
  assert.strictEqual(row.tugas_agih, 'Berjaya, perlu bantuan atau lama');
  assert.strictEqual(row.peranan, 'Penolong Kanan / Pentadbiran', 'jawapan bahagian 1 kekal');
  assert.strictEqual(row.meta_masa1, '2026-10-27 12:00:00'); assert.strictEqual(row.meta_masa2, '2026-10-27 12:30:00');
  env.post(TT.surveyPayload(1, part1(), { id: 'orangLain1234' }));
  assert.strictEqual(env.rows().length, 2);
});

test('Apps Script: bahagian 2 tanpa bahagian 1 menjadi baris baharu', () => {
  const env = createEnv();
  assert.strictEqual(env.post(TT.surveyPayload(2, part2(), { id: ID })).baru, true);
  assert.strictEqual(env.row(0).mula, 'Sebelum sesi persekolahan baharu');
});

test('Apps Script: permintaan tidak sah ditolak dan tiada baris ditulis', () => {
  const env = createEnv();
  const ok = (extra) => Object.assign(TT.surveyPayload(1, part1(), { id: ID }), extra);
  assert.strictEqual(env.post('bukan json').error, 'json_tidak_sah');
  assert.strictEqual(env.post('').error, 'kosong');
  assert.strictEqual(env.post(ok({ id: 'pendek' })).error, 'id_tidak_sah');
  assert.strictEqual(env.post(ok({ id: "x'; DROP TABLE" })).error, 'id_tidak_sah');
  assert.strictEqual(env.post(ok({ part: 3 })).error, 'bahagian_tidak_sah');
  assert.strictEqual(env.post(ok({ hp: 'http://spam' })).error, 'ditolak');
  assert.strictEqual(env.post(ok({ answers: [1, 2] })).error, 'jawapan_tidak_sah');
  assert.strictEqual(env.post('[1]').error, 'format_tidak_sah');
  assert.strictEqual(env.post(ok({ answers: { keliru: 'x'.repeat(40000) } })).error, 'terlalu_besar');
  assert.strictEqual(env.rows().length, 0);
});

test('Apps Script: kunci SURVEY_KEY diperiksa bila ditetapkan', () => {
  const env = createEnv({ props: { SURVEY_KEY: 'rahsia-1' } });
  assert.strictEqual(env.post(TT.surveyPayload(1, part1(), { id: ID })).error, 'kunci_salah');
  assert.strictEqual(env.post(TT.surveyPayload(1, part1(), { id: ID, key: 'rahsia-1' })).ok, true);
});

test('Apps Script: nilai tidak sah dibuang, bukan dipercayai', () => {
  const env = createEnv();
  const answers = { peranan: 'hacker', jenis: 'sm', susun_alat: ['excel', 'excel', 'bukan_ada', 'asc'], keliru_x: 'tiada lajur ini', mudah: 4, nps: 99,
    tugas_jana: 'sendiri', harga_murah: -5, harga_mahal_ok: 'abc', harga_terlalu_mahal: 1e9, ubah_sebab: '=HYPERLINK("http://jahat","klik")', rel_peraturan: '  has  \u0007kawalan ', peranan_lain: 'x' };
  const r = env.post({ v: 1, part: 1, id: ID, key: '', hp: '', ua: 'ua', dur: 5, answers });
  assert.strictEqual(r.ok, true);
  const row = env.row(0);
  assert.strictEqual(row.peranan, '', 'pilihan tidak wujud dibuang');
  assert.strictEqual(row.jenis, 'Sekolah menengah kerajaan');
  assert.strictEqual(row.susun_alat, 'Excel / Google Sheet | aSc Timetables', 'pendua dan tidak sah dibuang');
  assert.strictEqual(row.nps, '', 'nps itu bahagian 2');
  assert.strictEqual(row.mudah, '', 'lajur bahagian lain dibuang');
  assert.strictEqual(row.ubah_sebab, "'=HYPERLINK(\"http://jahat\",\"klik\")", 'formula dilumpuhkan');
  assert.strictEqual(row.rel_peraturan, 'has  kawalan');
  assert.ok(r.dibuang >= 6, 'dibuang: ' + r.dibuang);
  const env2 = createEnv();
  env2.post({ v: 1, part: 2, id: ID, key: '', hp: '', ua: '', dur: 1, answers: { nps: 7.5, mudah: 'x', harga_murah: -5, harga_murah2: 1, harga_mahal_ok: 'abc', harga_terlalu_mahal: 1e9, tugas_jana: 'bukan', keliru: 'x'.repeat(1700) } });
  const r2 = env2.row(0);
  assert.strictEqual(r2.nps, ''); assert.strictEqual(r2.mudah, ''); assert.strictEqual(r2.harga_murah, ''); assert.strictEqual(r2.harga_mahal_ok, '');
  assert.strictEqual(r2.harga_terlalu_mahal, ''); assert.strictEqual(r2.tugas_jana, '');
  assert.strictEqual(r2.keliru.length, 1500, 'teks dipotong');
});

test('Apps Script: lajur teks ditetapkan sebagai teks supaya tidak jadi tarikh', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, Object.assign(part1(), { ubah_sebab: '1/2' }), { id: ID }));
  const col = env.cols().indexOf('ubah_sebab') + 1;
  assert.strictEqual(env.sheets.get('Jawapan').formats.get(`3,${col}`), '@');
});

test('Apps Script: had kadar permintaan dan kunci sibuk', () => {
  const env = createEnv();
  let ditolak = 0;
  for (let i = 0; i < 125; i++) if (env.post(TT.surveyPayload(1, part1(), { id: 'resp' + String(i).padStart(8, '0') })).error === 'terlalu_kerap') ditolak++;
  assert.strictEqual(ditolak, 5);
  env.setNow(Date.UTC(2026, 9, 27, 4, 5, 0));
  assert.strictEqual(env.post(TT.surveyPayload(1, part1(), { id: 'lepas12345678' })).ok, true, 'had direset setiap minit');
  const sibuk = createEnv({ lockBusy: true });
  assert.strictEqual(sibuk.post(TT.surveyPayload(1, part1(), { id: ID })).error, 'sibuk');
});

test('Apps Script: doGet tidak mendedahkan data', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, part1(), { id: ID }));
  const g = env.get();
  assert.deepStrictEqual(Object.keys(g).sort(), ['layanan', 'ok', 'versi']);
});

test('Apps Script: ringkasan mengira pilihan, skala, harga dan NPS', () => {
  const env = createEnv();
  const nps = [10, 9, 9, 8, 6, 3];
  nps.forEach((n, i) => {
    const id = 'resp' + String(i).padStart(8, '0');
    env.post(TT.surveyPayload(1, Object.assign(part1(), i < 2 ? { peranan: 'pk' } : {}), { id }));
    env.post(TT.surveyPayload(2, Object.assign(part2(), { nps: n, harga: { terlalu_murah: 100, murah: 200 + i * 100, mahal_ok: 1000, terlalu_mahal: 2000 } }), { id }));
  });
  const n = env.api.kemasKiniRingkasan();
  assert.ok(n > 100);
  const rows = env.sheets.get('Ringkasan').grid;
  const find = (q, a) => rows.find((r) => r[0] === q && r[1] === a);
  assert.strictEqual(find('Jumlah responden', 'Bahagian 1 (sebelum demo)')[2], 6);
  assert.strictEqual(find('Jumlah responden', 'Bahagian 2 (selepas demo)')[2], 6);
  assert.strictEqual(find('Apakah peranan anda di sekolah?', 'Penolong Kanan / Pentadbiran')[2], 2);
  assert.strictEqual(find('Apakah peranan anda di sekolah?', 'Penyelaras jadual / relief')[3], 66.7);
  assert.strictEqual(find('Sejauh mana anda akan mencadangkan sistem ini kepada guru lain?', 'NPS (penyokong 9-10 tolak pengkritik 0-6)')[2], 17, '(3 penyokong - 2 pengkritik) / 6 responden = 16.7');
  assert.strictEqual(find('Bagi satu sekolah, berapa harga setahun yang anda rasa: Murah dan berpatutan', 'Median')[2], 450);
  assert.strictEqual(find('Bagaimana guru patut dimaklumkan tugas relief? (boleh pilih lebih daripada satu)', 'Notifikasi app di telefon')[2], 6);
  assert.strictEqual(find('Bagaimana guru patut dimaklumkan tugas relief? (boleh pilih lebih daripada satu)', 'E-mel')[2], 0);
});

test('Apps Script: hantarUjian dan padamBarisUjian hanya menyentuh baris ujian', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, part1(), { id: ID }));
  const hasil = env.api.hantarUjian();
  assert.ok(hasil.every((h) => h.ok), JSON.stringify(hasil));
  assert.strictEqual(env.rows().length, 2);
  assert.strictEqual(env.api.padamBarisUjian(), 1);
  assert.strictEqual(env.rows().length, 1);
  assert.strictEqual(env.row(0).meta_id, ID);
});

test('Apps Script: soalan baharu di hujung menambah lajur tanpa menjejaskan baris lama', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, part1(), { id: ID }));
  const sheet = env.sheets.get('Jawapan');
  const n = env.cols().length;
  // meniru Sheet lama yang dibuat sebelum 5 soalan terakhir ditambah
  for (let i = n - 5; i < n; i++) { sheet.grid[0][i] = ''; sheet.grid[1][i] = ''; }
  env.post(TT.surveyPayload(1, part1(), { id: 'orangBaru1234' }));
  assert.strictEqual(env.sheets.size, 1, 'tiada tab arkib dicipta untuk lajur tambahan');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sheet.grid[0])), JSON.parse(JSON.stringify(env.cols())), 'tajuk dilengkapkan');
  assert.strictEqual(env.rows().length, 2);
  assert.strictEqual(env.row(0).peranan, 'Penyelaras jadual / relief');
});

test('Apps Script: susunan lajur berubah: tab lama disimpan, tab baharu dicipta, tiada data rosak', () => {
  const env = createEnv();
  env.post(TT.surveyPayload(1, part1(), { id: ID }));
  const lama = env.sheets.get('Jawapan');
  const k = env.cols();
  [lama.grid[0][8], lama.grid[0][9]] = [lama.grid[0][9], lama.grid[0][8]]; // dua lajur bertukar tempat
  const r = env.post(TT.surveyPayload(1, part1(), { id: 'orangBaru1234' }));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.baris, 3);
  const names = [...env.sheets.keys()];
  assert.ok(names.includes('Jawapan') && names.some((n) => /^Jawapan \(lama /.test(n)), names.join());
  const arkib = env.sheets.get(names.find((n) => /^Jawapan \(lama /.test(n)));
  assert.strictEqual(arkib.grid[2][k.indexOf('meta_id')], ID, 'baris lama utuh dalam tab arkib');
  assert.strictEqual(env.rows().length, 1, 'tab Jawapan baharu hanya ada responden baharu');
  assert.strictEqual(env.row(0).meta_id, 'orangBaru1234');
});
