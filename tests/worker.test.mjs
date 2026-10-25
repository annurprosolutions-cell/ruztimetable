import test from 'node:test';
import assert from 'node:assert';
import { handle, evaluate } from '../worker/index.mjs';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list() { return { keys: [...this.m.keys()].map((name) => ({ name })), list_complete: true }; }
}
const ORIGIN = 'https://app.test';
const CID = 'cid.apps.googleusercontent.com';
const mkEnv = (extra) => Object.assign({ LICENSES: new KV(), ADMIN_TOKEN: 'rahsia-admin', GOOGLE_CLIENT_ID: CID, ALLOWED_ORIGINS: ORIGIN }, extra);
const NOW = Date.parse('2026-10-26T00:00:00Z');
const google = (tokens) => async (url) => {
  const t = new URL(url).searchParams.get('access_token');
  const v = tokens[t];
  return v ? { ok: true, json: async () => v } : { ok: false, json: async () => ({ error: 'invalid_token' }) };
};
const TOKENS = {
  good: { email: 'Admin@SMKContoh.edu.my', email_verified: 'true', aud: CID },
  other: { email: 'orang@lain.com', email_verified: 'true', aud: CID },
  foreign: { email: 'admin@smkcontoh.edu.my', email_verified: 'true', aud: 'app-lain.apps.googleusercontent.com' },
  unverified: { email: 'admin@smkcontoh.edu.my', email_verified: 'false', aud: CID }
};
const check = (env, token, origin = ORIGIN) => handle(new Request('https://w.test/check', { method: 'POST', headers: Object.assign({ origin }, token ? { authorization: 'Bearer ' + token } : {}) }), env, { now: NOW, fetch: google(TOKENS) });
const adminReq = (env, method, path, body, token = 'rahsia-admin') => handle(new Request('https://w.test' + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { now: NOW });

test('evaluate: tarikh luput, tempoh ihsan, tiada lesen', () => {
  assert.deepStrictEqual(evaluate(null, NOW, 7), { ok: false, reason: 'tiada' });
  assert.strictEqual(evaluate({ expires: '2026-10-31' }, NOW, 7).daysLeft, 5);
  assert.strictEqual(evaluate({ expires: '2026-10-26' }, NOW, 7).reason, 'ok');
  assert.strictEqual(evaluate({ expires: '2026-10-22' }, NOW, 7).reason, 'tamat-tempoh-ihsan');
  assert.strictEqual(evaluate({ expires: '2026-10-18' }, NOW, 7).ok, false);
  assert.strictEqual(evaluate({ school: 'x' }, NOW, 7).ok, true); // tanpa tarikh luput = tidak luput
});

test('admin menambah lesen e-mel dan domain; semakan berjaya (huruf besar kecil tak dikira)', async () => {
  const env = mkEnv();
  assert.strictEqual((await adminReq(env, 'POST', '/admin/licenses', { email: 'admin@smkcontoh.edu.my', school: 'SMK Contoh', plan: 'pilot', expires: '2027-01-31' })).status, 200);
  let r = await (await check(env, 'good')).json();
  assert.deepStrictEqual([r.ok, r.school, r.plan, r.via, r.email], [true, 'SMK Contoh', 'pilot', 'email:admin@smkcontoh.edu.my', 'admin@smkcontoh.edu.my']);
  await adminReq(env, 'POST', '/admin/licenses', { domain: 'lain.com', school: 'Sekolah Lain' });
  r = await (await check(env, 'other')).json();
  assert.deepStrictEqual([r.ok, r.via, r.daysLeft], [true, 'domain:lain.com', null]);
});

test('tiada lesen: ditolak dengan sebab', async () => {
  const r = await (await check(mkEnv(), 'good')).json();
  assert.deepStrictEqual([r.ok, r.reason], [false, 'tiada']);
});

test('lesen tamat melebihi tempoh ihsan ditolak', async () => {
  const env = mkEnv();
  await adminReq(env, 'POST', '/admin/licenses', { email: 'admin@smkcontoh.edu.my', expires: '2026-10-01' });
  const r = await (await check(env, 'good')).json();
  assert.deepStrictEqual([r.ok, r.reason], [false, 'tamat']);
  env.GRACE_DAYS = '30';
  assert.strictEqual((await (await check(env, 'good')).json()).ok, true);
});

test('token palsu, tanpa token, aud app lain, e-mel belum disahkan: semua ditolak', async () => {
  const env = mkEnv();
  await adminReq(env, 'POST', '/admin/licenses', { email: 'admin@smkcontoh.edu.my' });
  assert.strictEqual((await check(env, 'entah')).status, 401);
  assert.strictEqual((await check(env, null)).status, 401);
  assert.strictEqual((await check(env, 'foreign')).status, 401);
  assert.strictEqual((await check(env, 'unverified')).status, 401);
});

test('asal (origin) tidak disenaraikan ditolak; preflight CORS', async () => {
  const env = mkEnv();
  assert.strictEqual((await check(env, 'good', 'https://jahat.test')).status, 403);
  const pf = await handle(new Request('https://w.test/check', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env);
  assert.strictEqual(pf.status, 204);
  assert.strictEqual(pf.headers.get('access-control-allow-origin'), ORIGIN);
  const ok = await check(env, 'good');
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), ORIGIN);
});

test('admin: perlu token betul, validasi input, senarai dan padam', async () => {
  const env = mkEnv();
  assert.strictEqual((await adminReq(env, 'GET', '/admin/licenses', null, 'salah')).status, 401);
  assert.strictEqual((await adminReq(mkEnv({ ADMIN_TOKEN: '' }), 'GET', '/admin/licenses', null, '')).status, 401);
  assert.strictEqual((await adminReq(env, 'POST', '/admin/licenses', { email: 'bukan-emel' })).status, 400);
  assert.strictEqual((await adminReq(env, 'POST', '/admin/licenses', { email: 'a@b.my', expires: '31/01/2027' })).status, 400);
  await adminReq(env, 'POST', '/admin/licenses', { email: 'a@b.my', school: 'S', expires: '2027-01-31' });
  const list = await (await adminReq(env, 'GET', '/admin/licenses')).json();
  assert.strictEqual(list.licenses.length, 1);
  assert.strictEqual(list.licenses[0].value.school, 'S');
  await adminReq(env, 'DELETE', '/admin/licenses?key=' + encodeURIComponent('email:a@b.my'));
  assert.strictEqual((await (await adminReq(env, 'GET', '/admin/licenses')).json()).licenses.length, 0);
});

test('Google tidak dapat dihubungi: 502, bukan lulus senyap', async () => {
  const env = mkEnv();
  const r = await handle(new Request('https://w.test/check', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer good' } }), env, { now: NOW, fetch: async () => { throw new Error('rangkaian'); } });
  assert.strictEqual(r.status, 502);
});
