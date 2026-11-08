import test from 'node:test';
import assert from 'node:assert';
import { handle } from '../worker/index.mjs';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list() { return { keys: [...this.m.keys()].map((name) => ({ name })), list_complete: true }; }
}
const NOW = Date.parse('2026-11-08T02:00:00Z'), ORIGIN = 'https://annurtimetable.com';
const mkEnv = (x) => Object.assign({ LICENSES: new KV(), ADMIN_TOKEN: 'tok', ALLOWED_ORIGINS: ORIGIN }, x);
const hit = (env, e, origin = ORIGIN, now = NOW) => handle(new Request('https://w.test/hit', { method: 'POST', headers: Object.assign({ 'content-type': 'text/plain' }, origin ? { origin } : {}), body: JSON.stringify({ e }) }), env, { now });
const ov = async (env, now = NOW) => (await handle(new Request('https://w.test/admin/overview', { headers: { authorization: 'Bearer tok' } }), env, { now })).json();

test('/hit: kira kejadian sale page, abaikan asal lain dan kejadian tidak sah', async () => {
  const env = mkEnv();
  for (const e of ['view', 'view', 'demo', 'trial', 'buy', 'wa']) assert.strictEqual((await hit(env, e)).status, 204);
  assert.strictEqual((await hit(env, 'salah')).status, 400);
  await hit(env, 'view', 'https://jahat.test'); await hit(env, 'view', null);
  const rec = JSON.parse(await env.LICENSES.get('hit:2026-11-08'));
  assert.deepStrictEqual(rec, { view: 2, demo: 1, trial: 1, buy: 1, wa: 1, n: 6 });
});

test('/hit: had tulis sehari melindungi kuota KV', async () => {
  const env = mkEnv({ HITS_MAX_DAY: '3' });
  for (let i = 0; i < 6; i++) await hit(env, 'view');
  assert.strictEqual(JSON.parse(await env.LICENSES.get('hit:2026-11-08')).view, 3);
  // hari baharu bermula semula
  await hit(env, 'view', ORIGIN, NOW + 864e5);
  assert.strictEqual(JSON.parse(await env.LICENSES.get('hit:2026-11-09')).view, 1);
});

test('overview: jumlah kaunter 7 dan 30 hari, tidak mengganggu senarai lesen', async () => {
  const env = mkEnv();
  await hit(env, 'view'); await hit(env, 'demo');
  await hit(env, 'view', ORIGIN, NOW - 10 * 864e5);
  await hit(env, 'trial', ORIGIN, NOW - 40 * 864e5);
  const o = await ov(env);
  assert.deepStrictEqual([o.hits.d7.view, o.hits.d7.demo, o.hits.d30.view, o.hits.d30.trial], [1, 1, 2, 0]);
  assert.strictEqual(o.licences.length, 0);
  assert.strictEqual(o.logs.length, 0);
});
