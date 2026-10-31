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

test('tiada lesen dan percubaan dimatikan: ditolak dengan sebab', async () => {
  const r = await (await check(mkEnv({ TRIAL_DAYS: '0' }), 'good')).json();
  assert.deepStrictEqual([r.ok, r.reason], [false, 'tiada']);
});

test('percubaan percuma 14 hari: bermula pada semakan pertama, sekali sahaja, tiada tempoh ihsan', async () => {
  const env = mkEnv({ BUY_URL: 'https://beli.test/form' });
  const r = await (await check(env, 'good')).json();
  assert.deepStrictEqual([r.ok, r.plan, r.expires, r.daysLeft, r.buyUrl], [true, 'percubaan', '2026-11-08', 13, 'https://beli.test/form']);
  assert.strictEqual(await env.LICENSES.get('trial:admin@smkcontoh.edu.my'), '2026-10-26');
  // selepas tamat: ditolak terus (tiada 7 hari ihsan) dan tidak dimulakan semula
  const later = (days) => handle(new Request('https://w.test/check', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer good' } }), env, { now: NOW + days * 864e5, fetch: google(TOKENS) }).then((x) => x.json());
  assert.strictEqual((await later(13)).ok, true);
  const end = await later(14);
  assert.deepStrictEqual([end.ok, end.reason], [false, 'percubaan-tamat']);
  await env.LICENSES.delete('email:admin@smkcontoh.edu.my');
  assert.deepStrictEqual([(await later(20)).ok, (await later(20)).reason], [false, 'tiada'], 'percubaan tidak diberi dua kali');
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


// ---------- bayaran BCL ----------
const BCL_KEY = 'k-' + 'x'.repeat(30);
const bclEnv = (extra) => mkEnv(Object.assign({ BCL_WEBHOOK_KEY: BCL_KEY, BCL_API_TOKEN: 'api-tok', BCL_API_URL: 'https://bcl.test/api', BCL_FORM_ID: '777' }, extra));
// API BCL tiruan: pesanan dan statusnya
const bclApi = (orders, calls) => async (url, init) => {
  calls && calls.push({ url, auth: init && init.headers && init.headers.authorization, ua: init && init.headers && init.headers['user-agent'] });
  const m = String(url).match(/\/transactions\/([^/?]+)$/);
  const o = m && orders[decodeURIComponent(m[1])];
  return o ? { ok: true, json: async () => ({ success: true, data: o }) } : { ok: false, status: 404, json: async () => ({ success: false }) };
};
const hook = (env, body, fetchFn, now = NOW, key = BCL_KEY) => handle(new Request('https://w.test/bcl/' + key, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { now, fetch: fetchFn }).then((r) => r.json());
const sale = (order, item, amount, extra) => ({
  event: 'payment-success',
  data: Object.assign({ formable_type: 'payment_form', formable_id: 777, record_type: 'Transaction', record_id: order,
    main_data: { order_number: order, payer_email: 'Pembayar@Gmail.com', transaction_type: 'live', subtotal_amount: amount, fee_amount: '1.00', amount: (parseFloat(amount) + 1).toFixed(2), status: 3, is_paid: 1, items: [{ item, quantity: 1, amount }] },
    custom_fields_data: { 'Nama sekolah': 'SK Contoh', 'E-mel akaun Google untuk log masuk': 'Admin@SMKContoh.edu.my' } }, extra)
});

test('BCL: URL webhook mesti ada kunci rahsia', async () => {
  const env = bclEnv();
  const r = await handle(new Request('https://w.test/bcl/salah', { method: 'POST', body: '{}' }), env, { now: NOW });
  assert.strictEqual(r.status, 404);
  const none = await handle(new Request('https://w.test/bcl/' + BCL_KEY, { method: 'POST', body: '{}' }), mkEnv(), { now: NOW });
  assert.strictEqual(none.status, 404, 'tanpa BCL_WEBHOOK_KEY, endpoint tiada');
});

test('BCL tahunan: disahkan dengan API, lesen 12 bulan untuk e-mel log masuk (bukan e-mel pembayar), sekali sahaja', async () => {
  const env = bclEnv(), calls = [];
  const api = bclApi({ 'LINK-1': { order_number: 'LINK-1', status: 'success', status_code: 3, amount: 201, items: [{ name: 'Langganan Tahunan', amount: 200 }] } }, calls);
  const r = await hook(env, sale('LINK-1', 'Langganan Tahunan', '200.00'), api);
  assert.deepStrictEqual([r.ok, r.email, r.months, r.expires], [true, 'admin@smkcontoh.edu.my', 12, '2027-10-26']);
  assert.deepStrictEqual(JSON.parse(await env.LICENSES.get('email:admin@smkcontoh.edu.my')), { school: 'SK Contoh', plan: 'tahunan', expires: '2027-10-26' });
  assert.strictEqual(calls[0].url, 'https://bcl.test/api/transactions/LINK-1');
  assert.strictEqual(calls[0].auth, 'Bearer api-tok');
  assert.ok(calls[0].ua && !/curl|python/i.test(calls[0].ua), 'User-Agent sendiri');
  const again = await hook(env, sale('LINK-1', 'Langganan Tahunan', '200.00'), api);
  assert.strictEqual(again.duplicate, true);
  const chk = await (await check(env, 'good')).json();
  assert.deepStrictEqual([chk.ok, chk.plan, chk.expires], [true, 'tahunan', '2027-10-26']);
});

test('BCL: format respons API sebenar (data.main_data, is_paid boolean, medan borang dari API)', async () => {
  const env = bclEnv();
  const api = async () => ({ ok: true, json: async () => ({ success: true, data: { record_type: 'Transaction', record_id: 'LINK-7', main_data: { order_number: 'LINK-7', status: 3, is_paid: true, amount: 201, subtotal_amount: 200, items: [{ item: 'Pakej sekolah', option: 'Tahunan' }] }, custom_fields_data: { emel_google: 'api@moe-dl.edu.my' } } }) });
  const body = sale('LINK-7', 'Pakej sekolah', '200.00'); body.data.custom_fields_data = { emel_google: 'palsu@x.com' };
  const r = await hook(env, body, api);
  assert.deepStrictEqual([r.ok, r.email, r.months], [true, 'api@moe-dl.edu.my', 12], 'e-mel diambil daripada API, bukan webhook');
});

test('BCL bulanan: dilanjutkan dari tarikh tamat semasa (termasuk baki percubaan)', async () => {
  const env = bclEnv();
  await check(env, 'good'); // percubaan hingga 2026-11-08
  const api = bclApi({ 'LINK-2': { order_number: 'LINK-2', status_code: 3, amount: 21, items: [{ name: 'Langganan Bulanan', amount: 20 }] }, 'LINK-3': { order_number: 'LINK-3', status_code: 3, amount: 21, items: [{ name: 'Langganan Bulanan', amount: 20 }] } });
  assert.strictEqual((await hook(env, sale('LINK-2', 'Langganan Bulanan', '20.00'), api)).expires, '2026-12-08');
  assert.strictEqual((await hook(env, sale('LINK-3', 'Langganan Bulanan', '20.00'), api)).expires, '2027-01-08');
});

test('BCL: webhook palsu ditolak (pesanan tiada / belum dibayar / jumlah lain / borang lain / ujian)', async () => {
  const env = bclEnv();
  const api = bclApi({ 'LINK-9': { order_number: 'LINK-9', status: 'pending', status_code: 1, amount: 201 }, 'LINK-8': { order_number: 'LINK-8', status_code: 3, amount: 21 } });
  assert.strictEqual((await hook(env, sale('LINK-404', 'Tahunan', '200.00'), api)).reason, 'api-404');
  assert.strictEqual((await hook(env, sale('LINK-9', 'Tahunan', '200.00'), api)).reason, 'belum-dibayar');
  assert.strictEqual((await hook(env, sale('LINK-8', 'Tahunan', '200.00'), api)).reason, 'jumlah-tidak-sepadan');
  assert.strictEqual((await hook(env, sale('LINK-8', 'Tahunan', '200.00', { formable_id: 1 }), api)).ignored, 'borang-lain');
  const t = sale('LINK-8', 'Bulanan', '20.00'); t.data.main_data.transaction_type = 'test';
  assert.strictEqual((await hook(env, t, api)).ignored, 'transaksi-ujian');
  assert.strictEqual(await env.LICENSES.get('email:admin@smkcontoh.edu.my'), null);
  const noTok = bclEnv({ BCL_API_TOKEN: '' });
  assert.strictEqual((await hook(noTok, sale('LINK-8', 'Bulanan', '20.00'), api)).reason, 'tiada-token-api');
});

test('BCL auto-debit bulanan: mandat simpan e-mel, setiap potongan berjaya tambah sebulan, potongan gagal diabaikan', async () => {
  const env = bclEnv();
  const enrol = { event: 'payment-success', data: { formable_id: 777, record_type: 'DirectDebit', record_id: 'LINK-50', main_data: { order_number: 'LINK-50', payer_email: 'bapa@gmail.com', approval_status: 'Approved', frequency_mode: 'MT', transaction_type: 'live' }, custom_fields_data: { 'Emel Google (log masuk)': 'guru@moe-dl.edu.my' } } };
  assert.deepStrictEqual(await hook(env, enrol, bclApi({})), { ok: true, mandate: 'LINK-50', email: 'guru@moe-dl.edu.my' });
  const ded = (ref, status, cycle) => ({ event: 'direct-debit', data: { form_id: 777, record_type: 'DirectDebitDeduction', record_id: 'LINK-50', main_data: { order_number: ref, amount: '21.50', status, cycle } } });
  assert.strictEqual((await hook(env, ded('1-1', 3, 1), bclApi({}))).expires, '2026-11-26');
  assert.strictEqual((await hook(env, ded('1-1', 3, 1), bclApi({}))).duplicate, true);
  assert.strictEqual((await hook(env, ded('1-2', 2, 2), bclApi({}))).ignored, 'potongan-gagal');
  assert.strictEqual((await hook(env, ded('1-3', 3, 2), bclApi({}))).expires, '2026-12-26');
});

test('pilih e-mel dan bulan: medan borang, jumlah, bulan kalendar', async () => {
  const { pickEmail, planMonths, addMonths } = await import('../worker/index.mjs');
  assert.strictEqual(pickEmail({ 'Nama': 'Ali', 'Emel login Google': ' X@Y.COM ' }, 'p@q.com'), 'x@y.com');
  assert.strictEqual(pickEmail({ 'Nama': 'Ali' }, 'P@Q.com'), 'p@q.com');
  assert.strictEqual(planMonths([{ item: 'Pakej', option: 'Tahunan' }], '200', {}), 12);
  assert.strictEqual(planMonths([{ item: 'Pakej' }], '240.00', {}), 12);
  assert.strictEqual(planMonths([{ item: 'Pakej' }], '20.00', {}), 1);
  assert.strictEqual(addMonths('2027-01-31', 1), '2027-02-28');
  assert.strictEqual(addMonths('2026-10-26', 12), '2027-10-26');
});

test('admin: senarai lalai hanya lesen, ?semua=1 termasuk rekod bayaran', async () => {
  const env = bclEnv();
  await check(env, 'good');
  const list = await (await adminReq(env, 'GET', '/admin/licenses')).json();
  assert.ok(list.licenses.every((x) => /^(email|domain):/.test(x.key)));
  const all = await (await adminReq(env, 'GET', '/admin/licenses?semua=1')).json();
  assert.ok(all.licenses.some((x) => x.key.startsWith('trial:')));
});
