// Pelayan lesen Jadual Sekolah (Cloudflare Worker + KV).
// Aplikasi menghantar token akses Google; Worker mengesahkannya dengan Google, kemudian
// menyemak sama ada e-mel (atau domain e-mel) itu berlesen. Tiada data jadual melalui sini.
//
// KV `LICENSES`:   "email:cikgu@sekolah.edu.my" atau "domain:moe-dl.edu.my"
//                  -> {"school":"SMK Contoh","plan":"tahunan","expires":"2027-01-31"}
//                  "trial:<email>"   percubaan sudah diberi (sekali sahaja setiap e-mel)
//                  "bcl:<order>"     bayaran BCL sudah diproses (elak berganda)
//                  "mandate:<order>" e-mel bagi mandat auto-debit bulanan
// Rahsia:          ADMIN_TOKEN, BCL_WEBHOOK_KEY (token rawak dalam URL webhook), BCL_API_TOKEN
// Pemboleh ubah:   GOOGLE_CLIENT_ID, ALLOWED_ORIGINS (dipisah koma), GRACE_DAYS (lalai 7), TRIAL_DAYS (lalai 14),
//                  BCL_API_URL (lalai https://api.bcl.my/v1), BCL_FORM_ID (pilihan: hanya terima borang ini), YEARLY_MIN_AMOUNT (lalai 150)

const json = (body, status, extra) => new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}) });

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const bearer = (req) => { const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i); return m ? m[1] : ''; };
const today = (now) => new Date(now).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function corsHeaders(req, env) {
  const origin = req.headers.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' };
}

// semak token Google: mesti dikeluarkan kepada Client ID kita dan e-mel mesti disahkan
export async function verifyGoogle(token, env, fetchFn) {
  const res = await fetchFn('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.email || String(j.email_verified) !== 'true') return null;
  if (env.GOOGLE_CLIENT_ID && j.aud !== env.GOOGLE_CLIENT_ID && j.azp !== env.GOOGLE_CLIENT_ID) return null;
  return { email: String(j.email).toLowerCase() };
}

export async function findLicense(env, email) {
  const domain = email.split('@')[1] || '';
  for (const key of ['email:' + email, 'domain:' + domain]) {
    const raw = await env.LICENSES.get(key);
    if (raw) { try { return Object.assign({ key }, JSON.parse(raw)); } catch (e) { /* rekod rosak, cuba kunci seterusnya */ } }
  }
  return null;
}

export function evaluate(lic, now, graceDays) {
  if (!lic) return { ok: false, reason: 'tiada' };
  const out = { school: lic.school || '', plan: lic.plan || '', expires: lic.expires || '', via: lic.key };
  if (!lic.expires) return Object.assign(out, { ok: true, reason: 'ok', daysLeft: null });
  const left = daysBetween(today(now), lic.expires);
  if (left >= 0) return Object.assign(out, { ok: true, reason: 'ok', daysLeft: left });
  // tempoh ihsan untuk pelanggan yang lewat memperbaharui sahaja, bukan untuk percubaan
  if (lic.plan === PLAN_TRIAL) return Object.assign(out, { ok: false, reason: 'percubaan-tamat', daysLeft: left });
  if (-left <= graceDays) return Object.assign(out, { ok: true, reason: 'tamat-tempoh-ihsan', daysLeft: left });
  return Object.assign(out, { ok: false, reason: 'tamat', daysLeft: left });
}

// ---------- tarikh ----------
const PLAN_TRIAL = 'percubaan';
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// tambah bulan kalendar; 31 Jan + 1 bulan = 28/29 Feb
export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
};
const numEnv = (v, d) => (v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

// ---------- percubaan percuma: sekali sahaja bagi setiap e-mel ----------
export async function startTrial(env, email, now) {
  const days = numEnv(env.TRIAL_DAYS, 14);
  if (days <= 0 || await env.LICENSES.get('trial:' + email)) return null;
  const lic = { school: '', plan: PLAN_TRIAL, expires: addDays(today(now), days - 1), since: today(now) };
  await env.LICENSES.put('trial:' + email, today(now));
  await env.LICENSES.put('email:' + email, JSON.stringify(lic));
  return Object.assign({ key: 'email:' + email }, lic);
}

// ---------- bayaran BCL ----------
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// e-mel log masuk Google: medan borang yang namanya menyebut google/emel/log masuk, jika tiada, e-mel pembayar
export function pickEmail(custom, fallback) {
  const entries = Object.entries(custom || {}).map(([k, v]) => [k, String(v == null ? '' : v).trim().toLowerCase()]).filter(([, v]) => EMAIL.test(v));
  const hit = entries.find(([k]) => /google|login|log ?masuk|akaun|e-?mel|email/i.test(k)) || entries[0];
  const v = hit ? hit[1] : String(fallback || '').trim().toLowerCase();
  return EMAIL.test(v) ? v : '';
}
export function pickSchool(custom) {
  const e = Object.entries(custom || {}).find(([k, v]) => /sekolah|school|institusi/i.test(k) && String(v || '').trim());
  return e ? String(e[1]).trim().slice(0, 120) : '';
}
// bulan langganan: nama produk menyebut tahun -> 12, bulan -> 1, jika tidak ikut jumlah bayaran
export function planMonths(items, amount, env) {
  const text = (items || []).map((i) => [i.item, i.name, i.option, i.sku].filter(Boolean).join(' ')).join(' ');
  if (/tahun|year|annual|12 ?bulan/i.test(text)) return 12;
  if (/bulan|month/i.test(text)) return 1;
  return parseFloat(amount) >= numEnv(env.YEARLY_MIN_AMOUNT, 150) ? 12 : 1;
}

// lanjutkan lesen e-mel: dari tarikh tamat semasa jika masih aktif (termasuk baki percubaan), jika tidak dari hari ini
export async function extendLicense(env, email, months, school, now) {
  const key = 'email:' + email, t = today(now);
  let cur = null; try { cur = JSON.parse((await env.LICENSES.get(key)) || 'null'); } catch (e) { cur = null; }
  const base = cur && cur.expires && cur.expires >= t ? cur.expires : t;
  const lic = { school: school || (cur && cur.school) || '', plan: months >= 12 ? 'tahunan' : 'bulanan', expires: addMonths(base, months) };
  await env.LICENSES.put(key, JSON.stringify(lic));
  return Object.assign({ key }, lic);
}

// BCL tidak menandatangani webhook: sahkan setiap pesanan dengan API BCL sebelum memberi lesen
export async function verifyOrder(env, order, fetchFn) {
  if (!env.BCL_API_TOKEN) return env.BCL_TRUST_WEBHOOK === '1' ? { paid: true, trusted: true } : { paid: false, reason: 'tiada-token-api' };
  const base = String(env.BCL_API_URL || 'https://api.bcl.my/v1').replace(/\/$/, '');
  const res = await fetchFn(`${base}/transactions/${encodeURIComponent(order)}`, { headers: { authorization: 'Bearer ' + env.BCL_API_TOKEN, accept: 'application/json', 'user-agent': 'JadualSekolah-Lesen/1.0' } });
  if (!res.ok) return { paid: false, reason: 'api-' + res.status };
  let j; try { j = await res.json(); } catch (e) { return { paid: false, reason: 'api-bukan-json' }; }
  // GET /transactions/{order}: { success, data: { record_id, main_data: { status, is_paid, amount, items, ... }, custom_fields_data } }
  const d = (j && j.data) || j || {}, t = d.main_data || d;
  const code = Number(t.status_code != null ? t.status_code : t.status);
  const paid = code === 3 || t.is_paid === true || Number(t.is_paid) === 1 || /^(success|successful|approved|completed)$/i.test(String(t.status || ''));
  if (String(t.order_number || d.record_id || order) !== String(order)) return { paid: false, reason: 'pesanan-tidak-sepadan' };
  return { paid, amount: t.amount, items: t.items, payer_email: t.payer_email, custom: d.custom_fields_data || t.custom_fields_data || null };
}

const getJson = async (env, k) => { try { return JSON.parse((await env.LICENSES.get(k)) || 'null'); } catch (e) { return null; } };

export async function processBcl(body, env, o) {
  const ev = String((body && body.event) || ''), d = (body && body.data) || {}, md = d.main_data || {};
  const rid = String(d.record_id || md.order_number || '');
  if (!rid) return { ok: false, reason: 'tiada-rekod' };
  const formId = d.formable_id != null ? d.formable_id : d.form_id;
  if (env.BCL_FORM_ID && String(formId) !== String(env.BCL_FORM_ID)) return { ok: true, ignored: 'borang-lain' };
  if (md.transaction_type === 'test' && env.BCL_ACCEPT_TEST !== '1') return { ok: true, ignored: 'transaksi-ujian' };
  const school = pickSchool(d.custom_fields_data);

  // auto-debit: pendaftaran mandat diluluskan. Simpan e-mel; lesen dilanjutkan pada setiap potongan berjaya.
  if (ev === 'payment-success' && d.record_type === 'DirectDebit') {
    const email = pickEmail(d.custom_fields_data, md.payer_email);
    if (!email) return { ok: false, reason: 'tiada-emel' };
    await env.LICENSES.put('mandate:' + rid, JSON.stringify({ email, school, at: today(o.now), status: md.approval_status || '' }));
    return { ok: true, mandate: rid, email };
  }
  if (ev === 'direct-debit') {
    const ref = String(md.order_number || md.bayarcash_transaction_id || '');
    if (!ref) return { ok: false, reason: 'tiada-rujukan-potongan' };
    if (await env.LICENSES.get('bcl:dd:' + ref)) return { ok: true, duplicate: true };
    if (Number(md.status) !== 3) return { ok: true, ignored: 'potongan-gagal' };
    const m = await getJson(env, 'mandate:' + rid);
    const email = (m && m.email) || pickEmail(d.custom_fields_data, md.payer_email);
    if (!email) return { ok: false, reason: 'tiada-emel' };
    const lic = await extendLicense(env, email, 1, school || (m && m.school), o.now);
    await env.LICENSES.put('bcl:dd:' + ref, JSON.stringify({ email, mandate: rid, cycle: md.cycle || null, at: today(o.now), expires: lic.expires }));
    return { ok: true, email, months: 1, expires: lic.expires };
  }
  if (ev !== 'payment-success') return { ok: true, ignored: ev || 'tiada-event' };

  if (await env.LICENSES.get('bcl:' + rid)) return { ok: true, duplicate: true };
  const v = await verifyOrder(env, rid, o.fetch);
  if (!v.paid) return { ok: false, reason: v.reason || 'belum-dibayar' };
  // jumlah dalam webhook mesti sama dengan API (webhook palsu dengan pesanan lain ditolak)
  if (v.amount != null && md.amount != null && Math.abs(parseFloat(v.amount) - parseFloat(md.amount)) > 0.009 &&
      Math.abs(parseFloat(v.amount) - parseFloat(md.subtotal_amount)) > 0.009) return { ok: false, reason: 'jumlah-tidak-sepadan' };
  const email = pickEmail(v.custom || d.custom_fields_data, v.payer_email || md.payer_email);
  if (!email) return { ok: false, reason: 'tiada-emel' };
  const months = planMonths(v.items || md.items, md.subtotal_amount != null ? md.subtotal_amount : md.amount, env);
  const lic = await extendLicense(env, email, months, school, o.now);
  await env.LICENSES.put('bcl:' + rid, JSON.stringify({ email, months, at: today(o.now), expires: lic.expires }));
  return { ok: true, email, months, expires: lic.expires };
}

async function admin(req, env, url) {
  if (!env.ADMIN_TOKEN || !safeEqual(bearer(req), env.ADMIN_TOKEN)) return json({ error: 'tidak dibenarkan' }, 401);
  if (req.method === 'GET') {
    const out = [];
    let cursor;
    do {
      // lalai: lesen sahaja. ?semua=1 untuk rekod bayaran, mandat, percubaan dan log
      const all = url.searchParams.get('semua') === '1';
      const page = await env.LICENSES.list({ cursor });
      for (const k of page.keys) {
        if (!all && !/^(email|domain):/.test(k.name)) continue;
        const raw = (await env.LICENSES.get(k.name)) || '';
        let value; try { value = JSON.parse(raw || '{}'); } catch (e) { value = raw; }
        out.push({ key: k.name, value });
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return json({ licenses: out });
  }
  if (req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'JSON tidak sah' }, 400); }
    const id = String(b.email || b.domain || '').trim().toLowerCase();
    const kind = b.domain ? 'domain' : 'email';
    if (!id || (kind === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) || (kind === 'domain' && !/^[^@\s]+\.[^@\s]+$/.test(id))) return json({ error: 'email atau domain tidak sah' }, 400);
    if (b.expires && !/^\d{4}-\d{2}-\d{2}$/.test(b.expires)) return json({ error: 'expires mesti YYYY-MM-DD' }, 400);
    const key = kind + ':' + id;
    await env.LICENSES.put(key, JSON.stringify({ school: String(b.school || ''), plan: String(b.plan || 'pilot'), expires: b.expires || '' }));
    return json({ ok: true, key });
  }
  if (req.method === 'DELETE') {
    const key = url.searchParams.get('key');
    if (!key) return json({ error: 'key diperlukan' }, 400);
    await env.LICENSES.delete(key);
    return json({ ok: true });
  }
  return json({ error: 'kaedah tidak disokong' }, 405);
}

export async function handle(req, env, opts) {
  opts = opts || {};
  const now = opts.now != null ? opts.now : Date.now();
  const fetchFn = opts.fetch || fetch;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/admin/licenses')) return admin(req, env, url);
  const cors = corsHeaders(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
  if (url.pathname === '/health') return json({ ok: true });
  // webhook BCL: https://<worker>/bcl/<BCL_WEBHOOK_KEY>. Jawab segera; kerja diteruskan di latar (waitUntil).
  if (url.pathname.startsWith('/bcl/')) {
    if (!env.BCL_WEBHOOK_KEY || !safeEqual(url.pathname.slice(5), env.BCL_WEBHOOK_KEY)) return json({ error: 'tidak dijumpai' }, 404);
    if (req.method !== 'POST') return json({ error: 'kaedah tidak disokong' }, 405);
    let body; try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'JSON tidak sah' }, 400); }
    const work = processBcl(body, env, { now, fetch: fetchFn }).then(async (r) => {
      // log ringkas untuk semakan pentadbir (dibuang automatik selepas 90 hari)
      try { await env.LICENSES.put(`log:${new Date(now).toISOString()}:${String((body.data || {}).record_id || '')}`, JSON.stringify({ event: body.event, result: r }), { expirationTtl: 90 * 864e2 }); } catch (e) { /* abaikan */ }
      return r;
    }, (e) => ({ ok: false, reason: 'ralat', message: String(e && e.message) }));
    if (opts.waitUntil) { opts.waitUntil(work); return json({ ok: true, received: true }); }
    return json(await work);
  }
  if (url.pathname === '/check' && req.method === 'POST') {
    if (!cors) return json({ error: 'asal tidak dibenarkan' }, 403);
    const token = bearer(req);
    if (!token) return json({ ok: false, reason: 'tiada-token' }, 401, cors);
    let who;
    try { who = await verifyGoogle(token, env, fetchFn); } catch (e) { return json({ ok: false, reason: 'google-gagal' }, 502, cors); }
    if (!who) return json({ ok: false, reason: 'token-tidak-sah' }, 401, cors);
    const grace = Number.isFinite(+env.GRACE_DAYS) && env.GRACE_DAYS !== undefined && env.GRACE_DAYS !== '' ? +env.GRACE_DAYS : 7;
    // tiada lesen: mulakan percubaan percuma (sekali sahaja bagi setiap e-mel)
    const lic = (await findLicense(env, who.email)) || (await startTrial(env, who.email, now));
    const r = evaluate(lic, now, grace);
    return json(Object.assign({ email: who.email, buyUrl: env.BUY_URL || '' }, r), 200, cors);
  }
  return json({ error: 'tidak dijumpai' }, 404);
}

export default { fetch: (req, env, ctx) => handle(req, env, { waitUntil: ctx && ctx.waitUntil ? (p) => ctx.waitUntil(p) : null }) };
