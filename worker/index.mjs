// Pelayan lesen Jadual Sekolah (Cloudflare Worker + KV).
// Aplikasi menghantar token akses Google; Worker mengesahkannya dengan Google, kemudian
// menyemak sama ada e-mel (atau domain e-mel) itu berlesen. Tiada data jadual melalui sini.
//
// KV `LICENSES`:   "email:cikgu@sekolah.edu.my" atau "domain:moe-dl.edu.my"
//                  -> {"school":"SMK Contoh","plan":"pilot","expires":"2027-01-31"}
// Rahsia:          ADMIN_TOKEN
// Pemboleh ubah:   GOOGLE_CLIENT_ID, ALLOWED_ORIGINS (dipisah koma), GRACE_DAYS (lalai 7)

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
  if (-left <= graceDays) return Object.assign(out, { ok: true, reason: 'tamat-tempoh-ihsan', daysLeft: left });
  return Object.assign(out, { ok: false, reason: 'tamat', daysLeft: left });
}

async function admin(req, env, url) {
  if (!env.ADMIN_TOKEN || !safeEqual(bearer(req), env.ADMIN_TOKEN)) return json({ error: 'tidak dibenarkan' }, 401);
  if (req.method === 'GET') {
    const out = [];
    let cursor;
    do {
      const page = await env.LICENSES.list({ cursor });
      for (const k of page.keys) out.push({ key: k.name, value: JSON.parse((await env.LICENSES.get(k.name)) || '{}') });
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
  if (url.pathname === '/check' && req.method === 'POST') {
    if (!cors) return json({ error: 'asal tidak dibenarkan' }, 403);
    const token = bearer(req);
    if (!token) return json({ ok: false, reason: 'tiada-token' }, 401, cors);
    let who;
    try { who = await verifyGoogle(token, env, fetchFn); } catch (e) { return json({ ok: false, reason: 'google-gagal' }, 502, cors); }
    if (!who) return json({ ok: false, reason: 'token-tidak-sah' }, 401, cors);
    const grace = Number.isFinite(+env.GRACE_DAYS) && env.GRACE_DAYS !== undefined && env.GRACE_DAYS !== '' ? +env.GRACE_DAYS : 7;
    const r = evaluate(await findLicense(env, who.email), now, grace);
    return json(Object.assign({ email: who.email }, r), 200, cors);
  }
  return json({ error: 'tidak dijumpai' }, 404);
}

export default { fetch: (req, env) => handle(req, env) };
