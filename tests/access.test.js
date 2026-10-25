const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/insights.js');
require('../js/brand.js');
require('../js/sheets.js');
require('../js/access.js');

const MON = '2026-10-26';
const withData = () => {
  const s = TT.sample();
  s.placements = TT.generate(s, { seed: 2, improveMs: 50 }).placements;
  s.absences.push({ id: 'ab1', date: MON, teacherId: s.teachers[0].id, from: null, to: null, reason: 'Sakit', note: 'MC 2 hari' });
  return s;
};

test('kata laluan: hash berbeza setiap kali, sah hanya untuk kata laluan yang betul', async () => {
  const a = await TT.hashPassword('rahsia123', 1000), b = await TT.hashPassword('rahsia123', 1000);
  assert.ok(TT.validHash(a)); assert.notStrictEqual(a, b);
  assert.strictEqual(await TT.verifyPassword('rahsia123', a), true);
  assert.strictEqual(await TT.verifyPassword('rahsia124', a), false);
  assert.strictEqual(await TT.verifyPassword('rahsia123', 'bukan-hash'), false);
  assert.strictEqual(await TT.verifyPassword('rahsia123', null), false);
  assert.ok(!a.includes('rahsia'));
});

test('kata laluan: syarat panjang dan pengesahan', () => {
  assert.match(TT.passwordProblem('12345'), /sekurang-kurangnya/);
  assert.match(TT.passwordProblem('123456', '123457'), /tidak sama/);
  assert.strictEqual(TT.passwordProblem('123456', '123456'), '');
});

test('sesi: sah 30 hari, peranan mesti admin atau guru', () => {
  const now = Date.UTC(2026, 9, 26);
  const s = TT.newSession('guru', now);
  assert.ok(TT.sessionValid(s, now + 29 * 864e5));
  assert.ok(!TT.sessionValid(s, now + 31 * 864e5));
  assert.ok(!TT.sessionValid({ role: 'hacker', until: now + 1e9 }, now));
  assert.ok(!TT.sessionValid(null, now));
});

test('hash kata laluan dan pautan guru kekal melalui Google Sheets', async () => {
  const s = withData();
  s.auth = { admin: await TT.hashPassword('rahsia123', 1000) };
  s.school.guruSheet = 'g'.repeat(30);
  const back = TT.fromSheets(TT.toSheets(s));
  assert.deepStrictEqual(back.auth, s.auth);
  assert.strictEqual(back.school.guruSheet, s.school.guruSheet);
  const none = TT.fromSheets(TT.toSheets(TT.sample()));
  assert.strictEqual(none.auth, null);
});

test('data guru: tiada kata laluan, sebab cuti atau rekod lama', async () => {
  const s = withData();
  s.auth = { admin: await TT.hashPassword('x123456', 1000) };
  s.absences.push({ id: 'old', date: '2026-01-05', teacherId: s.teachers[1].id, from: null, to: null, reason: 'Kursus', note: '' });
  const g = TT.guruSnapshot(s, MON, { at: 'x', master: 'm'.repeat(30) });
  assert.strictEqual(g.auth, undefined);
  assert.ok(g.absences.every((a) => a.reason === 'Tidak hadir' && a.note === ''));
  assert.ok(!g.absences.some((a) => a.id === 'old'));
  assert.strictEqual(JSON.stringify(g).includes('MC 2 hari'), false);
  assert.strictEqual(g.placements.length, s.placements.length);
  assert.strictEqual(g.published.master, 'm'.repeat(30));
  assert.ok(s.auth && s.absences.find((a) => a.id === 'ab1').note === 'MC 2 hari', 'data asal tidak berubah');
});

test('data guru: pecah ikut had sel, CSV gviz diurai semula dengan tepat', () => {
  const s = withData();
  s.school.name = 'SMK "Petik", Koma\nBaris';
  const rows = TT.packBlob(TT.guruSnapshot(s, MON));
  assert.ok(rows.length >= 2 && rows.every((r) => r[0].length <= 40000));
  const csv = rows.map((r) => '"' + r[0].replace(/"/g, '""') + '"').join('\n');
  const back = TT.unpackBlob(TT.parseCSV(csv));
  assert.strictEqual(back.school.name, s.school.name);
  assert.strictEqual(back.teachers.length, s.teachers.length);
  assert.throws(() => TT.unpackBlob([['bukan']]), /bukan data guru/);
});

test('fetchGuru: halaman log masuk Google (belum dikongsi) dikenal pasti', async () => {
  const html = async () => ({ ok: true, text: async () => '<!DOCTYPE html><html>Sign in</html>' });
  await assert.rejects(TT.fetchGuru('a'.repeat(30), html), /dikongsi/);
  const off = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(TT.fetchGuru('a'.repeat(30), off), (e) => e.offline === true);
  const s = withData();
  const csv = TT.packBlob(TT.guruSnapshot(s, MON)).map((r) => '"' + r[0].replace(/"/g, '""') + '"').join('\n');
  let url = '';
  const ok = async (u) => { url = u; return { ok: true, text: async () => csv }; };
  const got = await TT.fetchGuru('a'.repeat(30), ok);
  assert.strictEqual(got.teachers.length, 18);
  assert.match(url, /\/gviz\/tq\?tqx=out:csv&headers=0&sheet=Data/);
});

test('guruIdFrom: pautan app, pautan Sheet atau ID', () => {
  const id = 'AbC_d-1234567890123456789';
  assert.strictEqual(TT.guruIdFrom(`https://x.github.io/ruztimetable/?g=${id}`), id);
  assert.strictEqual(TT.guruIdFrom(`https://docs.google.com/spreadsheets/d/${id}/edit`), id);
  assert.strictEqual(TT.guruIdFrom(id), id);
  assert.strictEqual(TT.guruIdFrom('hello'), '');
});

test('notifikasi: hanya relief baharu untuk guru itu, dari hari ini ke hadapan', () => {
  const s = withData();
  const tid = s.teachers[2].id, other = s.teachers[3].id;
  const base = { lessonId: s.lessons[0].id, classIds: [s.classes[0].id], subjectId: s.subjects[0].id, status: 'assigned', note: '' };
  s.reliefs = [
    Object.assign({ id: 'r1', key: 'k1', date: MON, periods: [1], reliefTeacherId: tid, absentTeacherId: other }, base),
    Object.assign({ id: 'r0', key: 'k0', date: '2026-10-20', periods: [1], reliefTeacherId: tid, absentTeacherId: other }, base)
  ];
  const seen = TT.reliefKeys(s, tid, MON);
  assert.strictEqual(seen.length, 1);
  s.reliefs.push(Object.assign({ id: 'r2', key: 'k2', date: '2026-10-28', periods: [2, 3], reliefTeacherId: tid, absentTeacherId: other }, base));
  s.reliefs.push(Object.assign({ id: 'r3', key: 'k3', date: '2026-10-28', periods: [4], reliefTeacherId: other, absentTeacherId: tid }, base));
  const fresh = TT.newReliefs(s, tid, MON, seen);
  assert.deepStrictEqual(fresh.map((r) => r.id), ['r2']);
  const n = TT.reliefNotice(s, fresh);
  assert.strictEqual(n.title, 'Tugas relief baharu');
  assert.match(n.body, /Rabu 28 Okt/);
});
