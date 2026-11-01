import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { SLUG_RESERVED, slugCheck } from '../worker/index.mjs';
const require = createRequire(import.meta.url);
const TT = require('../js/core.js');
require('../js/brand.js'); require('../js/relief.js'); require('../js/sample.js'); require('../js/sheets.js'); require('../js/slug.js');

test('nama pautan: peraturan app dan Worker sama (senarai dikhaskan dan semakan)', () => {
  assert.deepStrictEqual([...TT.SLUG_RESERVED].sort(), [...SLUG_RESERVED].sort(), 'js/slug.js dan worker/index.mjs mesti selaras');
  for (const v of ['smkwakanda', 'SMK-Wakanda', 'ab', 'a'.repeat(31), 'smk wakanda', 'admin', 'xn--x', '-ab', 'ab-', 'a--b', '', null, 'smk_a']) {
    const a = TT.slugCheck(v), b = slugCheck(v);
    assert.strictEqual(a.slug, b.slug, String(v));
    assert.strictEqual(!!a.problem, !!b.problem, String(v));
  }
});

test('nama pautan: baca nama daripada laluan alamat', () => {
  assert.strictEqual(TT.slugFromPath('/s/smkwakanda'), 'smkwakanda');
  assert.strictEqual(TT.slugFromPath('/s/SMK-Wakanda/'), 'smk-wakanda');
  for (const p of ['/', '/s', '/s/', '/s/ab', '/s/a/b', '/privasi', '/x/s/smkwakanda', '/s/smk_wakanda', '/s/' + 'a'.repeat(31), '', undefined]) assert.strictEqual(TT.slugFromPath(p), '', String(p));
});

test('nama pautan: panggilan Worker dan mesej ralat untuk pentadbir', async () => {
  const calls = [];
  const fetchFn = (resp) => async (url, init) => { calls.push([url, init]); return { ok: resp.ok, status: resp.status, json: async () => resp.body }; };
  assert.deepStrictEqual(await TT.fetchSlug('https://w.test/', 'smkwakanda', fetchFn({ ok: true, status: 200, body: { ok: true, gid: 'g'.repeat(44) } })), { ok: true, gid: 'g'.repeat(44) });
  assert.strictEqual(calls[0][0], 'https://w.test/slug/smkwakanda');
  await TT.claimSlug('https://w.test', 'tok', { slug: 'x', gid: 'y' }, fetchFn({ ok: true, status: 200, body: { ok: true, slug: 'x' } }));
  assert.deepStrictEqual([calls[1][0], calls[1][1].method, calls[1][1].headers.Authorization], ['https://w.test/slug', 'POST', 'Bearer tok']);
  await TT.releaseSlug('https://w.test', 'tok', fetchFn({ ok: true, status: 200, body: { ok: true } }));
  assert.strictEqual(calls[2][1].method, 'DELETE');
  const err = async (r) => { try { await TT.fetchSlug('https://w.test', 'x', fetchFn(r)); } catch (e) { return e; } };
  const e404 = await err({ ok: false, status: 404, body: { ok: false, reason: 'lesen-tamat' } });
  assert.deepStrictEqual([e404.status, e404.reason], [404, 'lesen-tamat']);
  assert.match(TT.slugErrorText({ reason: 'perlu-langganan' }), /langganan berbayar/);
  assert.match(TT.slugErrorText({ reason: 'telah-digunakan' }), /sekolah lain/);
  assert.match(TT.slugErrorText({ reason: 'terlalu-kerap', daysLeft: 21 }), /21 hari/);
  assert.match(TT.slugErrorText({ reason: 'nama-tidak-sah', message: 'Nama mesti 3 hingga 30 aksara.' }), /3 hingga 30/);
  assert.match(TT.slugErrorText({}), /Tidak dapat menghubungi/);
});

test('nama pautan disimpan dalam Google Sheet dan dibuang jika tidak sah', () => {
  const s = TT.sample(); s.school.guruSlug = 'smk-wakanda';
  const tabs = JSON.parse(JSON.stringify(TT.toSheets(s, {})));
  assert.strictEqual(TT.fromSheets(tabs).school.guruSlug, 'smk-wakanda');
  tabs.Sekolah.find((r) => r[0] === 'nama_pautan_guru')[1] = 'Nama <Tidak> Sah';
  assert.strictEqual(TT.fromSheets(tabs).school.guruSlug, '');
  assert.strictEqual(TT.migrate({ school: {}, teachers: [], lessons: [], classes: [] }).school.guruSlug, '');
});
