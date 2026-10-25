const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/license.js');

const NOW = Date.parse('2026-10-26T00:00:00Z');
const ok = (extra) => ({ body: Object.assign({ ok: true, reason: 'ok', email: 'a@b.my', school: 'SMK', expires: '2027-01-31', daysLeft: 97 }, extra) });

test('semakan dimatikan (tiada licenseUrl): dibenarkan', () => {
  assert.deepStrictEqual(TT.licenseDecision({ disabled: true }), { allowed: true, state: 'off', message: '', cache: null });
});

test('lesen sah: dibenarkan dan cache disimpan; amaran bila hampir tamat', () => {
  let d = TT.licenseDecision({ result: ok(), now: NOW });
  assert.deepStrictEqual([d.allowed, d.state, d.school], [true, 'ok', 'SMK']);
  assert.strictEqual(d.cache.checkedAt, NOW);
  d = TT.licenseDecision({ result: ok({ daysLeft: 5 }), now: NOW });
  assert.deepStrictEqual([d.state, d.message], ['warn', 'Lesen tamat dalam 5 hari.']);
  d = TT.licenseDecision({ result: ok({ reason: 'tamat-tempoh-ihsan', daysLeft: -3 }), now: NOW });
  assert.strictEqual(d.allowed, true);
  assert.match(d.message, /ihsan berakhir dalam 4 hari/);
});

test('ditolak: tiada lesen / tamat, mesej BM, tidak dibenarkan', () => {
  let d = TT.licenseDecision({ result: { body: { ok: false, reason: 'tiada', email: 'a@b.my' } }, now: NOW });
  assert.deepStrictEqual([d.allowed, d.state], [false, 'denied']);
  assert.match(d.message, /belum berlesen/);
  d = TT.licenseDecision({ result: { body: { ok: false, reason: 'tamat' } }, now: NOW });
  assert.match(d.message, /telah tamat/);
  assert.match(d.message, /masih boleh digunakan/);
});

test('pelayan tidak dapat dihubungi: cache segar dibenarkan, cache lama atau e-mel lain tidak', () => {
  const cache = { email: 'a@b.my', ok: true, checkedAt: NOW - 3 * 864e5, school: 'SMK', expires: '' };
  let d = TT.licenseDecision({ error: new Error('x'), cache, email: 'a@b.my', now: NOW });
  assert.deepStrictEqual([d.allowed, d.state], [true, 'cached']);
  d = TT.licenseDecision({ error: new Error('x'), cache: Object.assign({}, cache, { checkedAt: NOW - 9 * 864e5 }), email: 'a@b.my', now: NOW });
  assert.deepStrictEqual([d.allowed, d.state], [false, 'unreachable']);
  d = TT.licenseDecision({ error: new Error('x'), cache, email: 'lain@b.my', now: NOW });
  assert.strictEqual(d.allowed, false);
  d = TT.licenseDecision({ error: new Error('x'), cache: Object.assign({}, cache, { ok: false }), email: 'a@b.my', now: NOW });
  assert.strictEqual(d.allowed, false, 'cache penolakan tidak boleh melepaskan');
});

test('fetchLicense: URL, pengepala, dan ralat', async () => {
  const seen = [];
  const f = async (u, i) => { seen.push([u, i.method, i.headers.Authorization]); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const r = await TT.fetchLicense('https://w.test/', 'tok', f);
  assert.deepStrictEqual(seen[0], ['https://w.test/check', 'POST', 'Bearer tok']);
  assert.strictEqual(r.body.ok, true);
  const denied = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, reason: 'tiada' }) });
  assert.strictEqual((await TT.fetchLicense('https://w.test', 't', denied)).body.reason, 'tiada');
  const broken = async () => ({ ok: false, status: 500, json: async () => { throw new Error('bukan json'); } });
  await assert.rejects(TT.fetchLicense('https://w.test', 't', broken), (e) => e.status === 500);
});
