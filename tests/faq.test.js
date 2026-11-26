const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/faq.js');

const top = (q, o) => (TT.faqSearch(q, o)[0] || { entry: {} }).entry.id;
const ids = (q, o) => TT.faqSearch(q, o).map((r) => r.entry.id);

test('pangkalan FAQ: id unik, tiada entri kosong, pautan panduan sah', () => {
  const seen = new Set();
  for (const e of TT.faq) {
    assert.ok(!seen.has(e.id), 'id bertindih ' + e.id); seen.add(e.id);
    assert.ok(e.q && e.a && e.tags && e.topic, 'entri tidak lengkap ' + e.id);
    if (e.link) assert.match(e.link, /^#[a-z0-9]+$/);
  }
  assert.ok(TT.faq.length >= 40);
});

test('soalan sebenar pengguna dijawab oleh entri yang betul', () => {
  const Q = [
    ['sekolah kami dua sesi, nak setting waktu kat mana?', 'dua-sesi'],
    ['sek saya ada 4 waktu rehat yang berbeza ppki tahun 4 tahun 5 tahun 6', 'rehat-berbeza'],
    ['pembentukan karakter 15 minit nak lock jadual', 'karakter-15'],
    ['macam mana nak set perhimpunan hari isnin', 'perhimpunan'],
    ['apa yang dimaksudkan dengan berganda?', 'berganda-apa'],
    ['BM 10 waktu nak jadikan 4 waktu double dan 2 waktu single', 'berganda-bil'],
    ['pj selang sehari untuk setiap kelas', 'pj-selang'],
    ['maksimum empat mata pelajaran berbeza sehari untuk tahun 1 2 dan 3', 'had-subjek-sehari'],
    ['boleh ke admin lantik admin lain guna email dia', 'admin-lain'],
    ['relief 2 waktu nak bagi guru berlainan mengganti', 'relief-pecah'],
    ['guru jadi 3 waktu straight kelas sendiri tambah relief', 'relief-berturut'],
    ['jenis cuti untuk relief boleh edit penambahan atau pengurangan', 'jenis-cuti'],
    ['ralat 47 waktu tetapi jadual cuma ada 38 slot selepas import', 'kapasiti-import'],
    ['apa jadi bila lesen tamat', 'lesen-tamat'],
    ['lupa password admin', 'lupa-kata-laluan'],
    ['macam mana import dari aSc', 'import-asc']
  ];
  for (const [q, want] of Q) assert.strictEqual(top(q), want, `"${q}" -> ${top(q)} (mahu ${want}); ${ids(q).join(', ')}`);
});

test('soalan tidak berkaitan tidak dipadankan secara paksa', () => {
  assert.deepStrictEqual(ids('resipi nasi lemak enak'), []);
  assert.deepStrictEqual(ids('asdf qwer'), []);
  assert.deepStrictEqual(ids(''), []);
  assert.deepStrictEqual(ids('   !!! '), []);
});

test('guru hanya nampak entri untuk guru', () => {
  const g = ids('pasang app notifikasi telefon', { guruOnly: true });
  assert.ok(g.length > 0 && g.every((id) => TT.faq.find((e) => e.id === id).guru));
  assert.deepStrictEqual(ids('lantik admin', { guruOnly: true }).filter((x) => x === 'admin-lain'), []);
});

test('had keputusan dan topik', () => {
  assert.ok(TT.faqSearch('relief guru', { limit: 3 }).length <= 3);
  const topics = TT.faqTopics(false);
  assert.ok(topics.length >= 6 && topics.every(([, a]) => a.length));
  assert.ok(TT.faqTopics(true).every(([, a]) => a.every((e) => e.guru)));
});
