// Pelayan lesen Jadual Sekolah (Cloudflare Worker + KV).
// Aplikasi menghantar token akses Google; Worker mengesahkannya dengan Google, kemudian
// menyemak sama ada e-mel (atau domain e-mel) itu berlesen. Tiada data jadual melalui sini.
//
// KV `LICENSES`:   "email:cikgu@sekolah.edu.my" atau "domain:moe-dl.edu.my"
//                  -> {"school":"SMK Contoh","plan":"tahunan","expires":"2027-01-31"}
//                  "trial:<email>"   percubaan sudah diberi (sekali sahaja setiap e-mel)
//                  "bcl:<order>"     bayaran BCL sudah diproses (elak berganda)
//                  "mandate:<order>" e-mel bagi mandat auto-debit bulanan
//                  "slug:<nama>"     pautan guru cantik /s/<nama> -> {gid, owner, school, claimedAt, changedAt}
//                  "slugof:<email>"  nama yang dituntut oleh e-mel itu (satu nama setiap e-mel)
// Rahsia:          ADMIN_TOKEN, BCL_WEBHOOK_KEY (token rawak dalam URL webhook), BCL_API_TOKEN
// Pemboleh ubah:   GOOGLE_CLIENT_ID, ALLOWED_ORIGINS (dipisah koma), GRACE_DAYS (lalai 7), TRIAL_DAYS (lalai 14),
//                  BCL_API_URL (lalai https://api.bcl.my/v1), BCL_FORM_ID (pilihan: hanya terima borang ini), YEARLY_MIN_AMOUNT (lalai 150)
//                  STATS_MIN (lalai 5: bilangan langganan hanya dipapar awam bila sampai had ini), STATS_TTL (saat cache, lalai 3600),
//                  STATS_EXCLUDE (e-mel atau domain dipisah koma yang tidak dikira, contoh akaun pemilik sendiri)
//                  GET /stats (awam): {paid|null, trial, min}; kunci cache "stats:cache"
//                  OWNER_EMAILS (e-mel pemilik dipisah koma: boleh guna dashboard /admin/ dengan log masuk Google), PRICE_MONTH (20), PRICE_YEAR (200)
//                  GET /admin/overview: semua rekod + ringkasan prestasi; POST /admin/licenses {merge:true,...}: ubah sekolah, pelan atau tarikh sahaja
//                  SITE_URL (lalai https://annurtimetable.com): pautan kanonik artikel. /admin/articles (GET/POST/DELETE, /preview, /image); awam /artikel/, /artikel/<slug>/, sitemap.xml, feed.xml

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
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', vary: 'Origin' };
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
// tambah bulan kalendar. `day` = hari dalam bulan yang dikekalkan (hari bayaran pertama), supaya 30 Nov + 1 bulan x 3
// ialah 30 Dis, 30 Jan, 28 Feb, 30 Mac (bukan 28 Mac); bulan pendek dikecilkan kepada hari terakhir bulan itu.
export const addMonths = (iso, n, day) => {
  const [y, m, d] = iso.split('-').map(Number), want = Math.max(d, day | 0);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(want, last));
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
// bulan langganan = jumlah (bulan setiap unit x kuantiti). Nama produk menyebut tahun -> 12, bulan -> 1. Jika tiada nama yang
// dikenali (cuba senarai pilihan `alt` dahulu, contoh item dalam webhook), ikut jumlah bayaran: RM150 ke atas = 12, jika tidak 1.
const unitMonths = (it) => {
  const text = [it.item, it.name, it.option, it.sku].filter(Boolean).join(' ');
  return /tahun|year|annual|12 ?bulan/i.test(text) ? 12 : /bulan|month/i.test(text) ? 1 : 0;
};
const sumMonths = (items) => {
  let total = 0;
  for (const it of items || []) { const u = unitMonths(it || {}); if (u) total += u * Math.min(120, Math.max(1, parseInt(it.quantity, 10) || 1)); }
  return total;
};
export function planMonths(items, amount, env, alt) {
  return sumMonths(items) || sumMonths(alt) || (parseFloat(amount) >= numEnv(env.YEARLY_MIN_AMOUNT, 150) ? 12 : 1);
}

// lanjutkan lesen e-mel: dari tarikh tamat semasa jika masih aktif (termasuk baki percubaan), jika tidak dari hari ini.
// `day` dalam rekod ialah hari dalam bulan yang dikekalkan (hari bayaran pertama).
export async function extendLicense(env, email, months, school, now) {
  const key = 'email:' + email, t = today(now);
  let cur = null; try { cur = JSON.parse((await env.LICENSES.get(key)) || 'null'); } catch (e) { cur = null; }
  const active = cur && cur.expires && cur.expires >= t, base = active ? cur.expires : t;
  const day = active && cur.day ? cur.day : +base.slice(8);
  const lic = { school: school || (cur && cur.school) || '', plan: months >= 12 ? 'tahunan' : 'bulanan', expires: addMonths(base, months, day), day };
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

// ---------- pautan guru cantik: /s/<nama> ----------
// Hanya pentadbir berlangganan (bukan percubaan) boleh menuntut nama; satu nama setiap e-mel. Nama boleh ditukar sekali
// dengan bebas, kemudian sekali setiap 30 hari. Pautan hanya berfungsi selagi lesen pemilik sah (termasuk tempoh ihsan).
export const SLUG_RESERVED = new Set(['www', 'app', 'api', 'admin', 'administrator', 'lesen', 'license', 'mail', 'email', 'ftp', 'static', 'assets',
  'demo', 'privasi', 'privacy', 'terms', 'bantuan', 'help', 'support', 'login', 'logout', 'signin', 'test', 'testing', 'staging', 'dev', 'root', 'null',
  'undefined', 'annurtimetable', 'annurpro', 'annurprosolutions', 'jadual', 'relief', 'guru', 'sekolah', 'school', 'kpm', 'moe', 'jpn', 'ppd', 'kementerian',
  'pendidikan', 'jabatan', 'pejabat', 'kerajaan', 'gov', 'polis', 'tentera', 'bank', 'delima', 'google']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RENAME_DAYS = 30;
export function slugCheck(raw) {
  const slug = String(raw == null ? '' : raw).trim().toLowerCase();
  if (slug.length < 3 || slug.length > 30) return { problem: 'Nama mesti 3 hingga 30 aksara.' };
  if (!SLUG_RE.test(slug)) return { problem: 'Hanya huruf kecil, nombor dan sempang, contoh smk-wakanda.' };
  if (SLUG_RESERVED.has(slug) || slug.startsWith('xn--')) return { problem: 'Nama ini dikhaskan. Pilih nama lain.' };
  return { slug };
}

async function slugRoute(req, env, url, cors, c) {
  const rest = decodeURIComponent(url.pathname.slice('/slug'.length)).replace(/^\//, '');
  const J = (b, st) => json(b, st, Object.assign({ 'cache-control': 'no-store' }, cors));
  // awam: terjemah nama kepada ID Sheet Data Guru
  if (req.method === 'GET') {
    const k = slugCheck(rest);
    if (!k.slug) return J({ ok: false, reason: 'tiada' }, 404);
    const rec = await getJson(env, 'slug:' + k.slug);
    if (!rec) return J({ ok: false, reason: 'tiada' }, 404);
    if (!evaluate(await findLicense(env, rec.owner), c.now, c.grace).ok) return J({ ok: false, reason: 'lesen-tamat' }, 404);
    return J({ ok: true, gid: rec.gid, school: rec.school || '' });
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return J({ error: 'kaedah tidak disokong' }, 405);
  const token = bearer(req);
  if (!token) return J({ ok: false, reason: 'tiada-token' }, 401);
  let who;
  try { who = await verifyGoogle(token, env, c.fetchFn); } catch (e) { return J({ ok: false, reason: 'google-gagal' }, 502); }
  if (!who) return J({ ok: false, reason: 'token-tidak-sah' }, 401);
  const email = who.email, ownerKey = 'slugof:' + email, mine = await getJson(env, ownerKey), t = today(c.now);

  if (req.method === 'DELETE') {
    if (mine && mine.slug) { await env.LICENSES.delete('slug:' + mine.slug); await env.LICENSES.delete(ownerKey); }
    return J({ ok: true });
  }

  let b; try { b = await req.json(); } catch (e) { return J({ ok: false, reason: 'json-tidak-sah' }, 400); }
  const lic = await findLicense(env, email), ev = evaluate(lic, c.now, c.grace);
  if (!ev.ok || lic.plan === PLAN_TRIAL) return J({ ok: false, reason: 'perlu-langganan' }, 403);
  const k = slugCheck(b && b.slug);
  if (!k.slug) return J({ ok: false, reason: 'nama-tidak-sah', message: k.problem }, 400);
  const gid = String((b && b.gid) || '');
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(gid)) return J({ ok: false, reason: 'gid-tidak-sah', message: 'ID Sheet Data Guru tidak sah.' }, 400);
  const existing = await getJson(env, 'slug:' + k.slug);
  if (existing && existing.owner !== email) return J({ ok: false, reason: 'telah-digunakan' }, 409);
  let changedAt = existing ? existing.changedAt || '' : '';
  if (mine && mine.slug && mine.slug !== k.slug) {
    const old = await getJson(env, 'slug:' + mine.slug);
    if (old && old.changedAt) {
      const left = RENAME_DAYS - daysBetween(old.changedAt, t);
      if (left > 0) return J({ ok: false, reason: 'terlalu-kerap', daysLeft: left }, 429);
    }
    await env.LICENSES.delete('slug:' + mine.slug);
    changedAt = t;
  }
  const rec = { gid, owner: email, school: String((b && b.school) || '').slice(0, 120), claimedAt: existing ? existing.claimedAt : t, changedAt };
  await env.LICENSES.put('slug:' + k.slug, JSON.stringify(rec));
  await env.LICENSES.put(ownerKey, JSON.stringify({ slug: k.slug }));
  return J({ ok: true, slug: k.slug });
}

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
    await env.LICENSES.put('bcl:dd:' + ref, JSON.stringify({ email, mandate: rid, cycle: md.cycle || null, amount: parseFloat(md.amount) || null, at: today(o.now), expires: lic.expires }));
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
  const months = planMonths(v.items, md.subtotal_amount != null ? md.subtotal_amount : md.amount, env, md.items);
  const lic = await extendLicense(env, email, months, school, o.now);
  await env.LICENSES.put('bcl:' + rid, JSON.stringify({ email, months, amount: parseFloat(v.amount != null ? v.amount : md.amount) || null, at: today(o.now), expires: lic.expires }));
  return { ok: true, email, months, expires: lic.expires };
}

// ---------- statistik awam (bilangan sahaja) ----------
// Langganan berbayar aktif (bukan percubaan, bukan pilot, bukan akaun dalam STATS_EXCLUDE) dan percubaan aktif.
// Lesen domain dikira satu. Keputusan dicache dalam KV selama STATS_TTL saat supaya pengunjung tidak mencetus bacaan KV berulang.
export async function computeStats(env, now) {
  const t = today(now);
  const skip = new Set(String(env.STATS_EXCLUDE || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  let paid = 0, trial = 0, cursor;
  do {
    const page = await env.LICENSES.list({ cursor });
    for (const k of page.keys) {
      const m = /^(email|domain):(.+)$/.exec(k.name);
      if (!m || skip.has(m[2].toLowerCase()) || (m[1] === 'email' && skip.has((m[2].split('@')[1] || '').toLowerCase()))) continue;
      let v; try { v = JSON.parse((await env.LICENSES.get(k.name)) || 'null'); } catch (e) { v = null; }
      if (!v || !v.expires || v.expires < t) continue;
      if (v.plan === PLAN_TRIAL) trial++; else if (v.plan !== 'pilot') paid++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { paid, trial };
}

export async function publicStats(env, now) {
  const ttl = Math.max(60, Number(env.STATS_TTL) || 3600) * 1000, min = Math.max(1, Number(env.STATS_MIN) || 5);
  let c = null; try { c = JSON.parse((await env.LICENSES.get('stats:cache')) || 'null'); } catch (e) { c = null; }
  if (!c || !(now - c.at < ttl)) {
    const x = await computeStats(env, now);
    c = { at: now, paid: x.paid, trial: x.trial };
    await env.LICENSES.put('stats:cache', JSON.stringify(c));
  }
  // bilangan langganan hanya didedahkan bila mencapai had; sebelum itu null
  return { paid: c.paid >= min ? c.paid : null, trial: c.trial, min };
}

// admin dibenarkan dengan ADMIN_TOKEN, atau token Google bagi e-mel dalam OWNER_EMAILS (dashboard /admin/ di laman app)
export async function adminAuth(req, env, fetchFn) {
  const tok = bearer(req);
  if (!tok) return null;
  if (env.ADMIN_TOKEN && safeEqual(tok, env.ADMIN_TOKEN)) return { by: 'token' };
  const owners = String(env.OWNER_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!owners.length) return null;
  const g = await verifyGoogle(tok, env, fetchFn).catch(() => null);
  return g && owners.includes(g.email) ? { by: g.email } : null;
}

// semua rekod untuk dashboard pemilik, dengan status dikira dan ringkasan prestasi
export async function overview(env, now) {
  const t = today(now), grace = numEnv(env.GRACE_DAYS, 7);
  const skip = new Set(String(env.STATS_EXCLUDE || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const priceM = numEnv(env.PRICE_MONTH, 20), priceY = numEnv(env.PRICE_YEAR, 200);
  const licences = [], trials = [], payments = [], debits = [], mandates = [], logs = [], slugs = [];
  let cursor;
  do {
    const page = await env.LICENSES.list({ cursor });
    for (const k of page.keys) {
      const n = k.name;
      if (n === 'stats:cache' || n.startsWith('slugof:') || /^art(idx$|:|img:|redir:)/.test(n)) continue;
      const raw = (await env.LICENSES.get(n)) || '';
      let v; try { v = JSON.parse(raw); } catch (e) { v = raw; }
      let m;
      if ((m = /^(email|domain):(.+)$/.exec(n))) {
        const ev = evaluate(Object.assign({ key: n }, v), now, grace), id = m[2].toLowerCase();
        licences.push({ key: n, kind: m[1], id, school: v.school || '', plan: v.plan || '', expires: v.expires || '', status: ev.reason, ok: !!ev.ok, daysLeft: ev.daysLeft == null ? null : ev.daysLeft,
          excluded: skip.has(id) || (m[1] === 'email' && skip.has(id.split('@')[1] || '')) });
      } else if (n.startsWith('trial:')) trials.push({ email: n.slice(6), date: typeof v === 'string' ? v : String(v) });
      else if (n.startsWith('bcl:dd:')) debits.push(Object.assign({ ref: n.slice(7) }, v));
      else if (n.startsWith('bcl:')) payments.push(Object.assign({ order: n.slice(4) }, v));
      else if (n.startsWith('mandate:')) mandates.push(Object.assign({ order: n.slice(8) }, v));
      else if (n.startsWith('log:')) logs.push(Object.assign({ key: n, at: n.slice(4, 28) }, typeof v === 'object' ? v : { raw: v }));
      else if (n.startsWith('slug:')) slugs.push(Object.assign({ slug: n.slice(5) }, v));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const live = licences.filter((l) => !l.excluded);
  const paid = (l) => l.plan && l.plan !== PLAN_TRIAL && l.plan !== 'pilot';
  const since = (n) => addDays(t, -n + 1);
  const paidEmails = new Set(licences.filter(paid).map((l) => l.id));
  const money = payments.concat(debits);
  const sum = (arr) => Math.round(arr.reduce((a, p) => a + (Number(p.amount) || 0), 0) * 100) / 100;
  const stats = {
    paidActive: live.filter((l) => paid(l) && l.status === 'ok').length,
    grace: live.filter((l) => l.status === 'tamat-tempoh-ihsan').length,
    trialActive: live.filter((l) => l.plan === PLAN_TRIAL && l.ok).length,
    expired: live.filter((l) => !l.ok).length,
    trialsTotal: trials.length,
    trials7: trials.filter((x) => x.date >= since(7)).length,
    trials30: trials.filter((x) => x.date >= since(30)).length,
    converted: trials.filter((x) => paidEmails.has(x.email)).length,
    mrr: Math.round(live.filter((l) => paid(l) && l.ok).reduce((a, l) => a + (l.plan === 'tahunan' ? priceY / 12 : l.plan === 'bulanan' ? priceM : 0), 0) * 100) / 100,
    payments30: money.filter((p) => p.at >= since(30)).length,
    revenue30: sum(money.filter((p) => p.at >= since(30))),
    revenueAll: sum(money),
    webhookFailed30: logs.filter((x) => x.at.slice(0, 10) >= since(30) && x.result && x.result.ok === false && !x.result.ignored).length
  };
  licences.sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
  logs.sort((a, b) => b.at.localeCompare(a.at));
  payments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { today: t, stats, licences, trials, payments, debits, mandates, logs: logs.slice(0, 200), slugs };
}

async function admin(req, env, url, now, fetchFn) {
  const who = await adminAuth(req, env, fetchFn);
  if (!who) return json({ error: 'tidak dibenarkan' }, 401);
  if (url.pathname === '/admin/overview') return req.method === 'GET' ? json(Object.assign({ by: who.by }, await overview(env, now))) : json({ error: 'kaedah tidak disokong' }, 405);
  if (url.pathname === '/admin/articles' || url.pathname.startsWith('/admin/articles/')) return articlesAdmin(req, env, url, now, who);
  if (url.pathname !== '/admin/licenses') return json({ error: 'tidak dijumpai' }, 404);
  if (req.method === 'GET') {
    const out = [];
    let cursor;
    do {
      // lalai: lesen sahaja. ?semua=1 untuk rekod bayaran, mandat, percubaan dan log
      const all = url.searchParams.get('semua') === '1';
      const page = await env.LICENSES.list({ cursor });
      for (const k of page.keys) {
        if (!all && !/^(email|domain):/.test(k.name)) continue;
        if (k.name.startsWith('artimg:')) continue;
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
    if (b.merge) {
      let cur = null; try { cur = JSON.parse((await env.LICENSES.get(key)) || 'null'); } catch (e) { cur = null; }
      if (!cur || typeof cur !== 'object') return json({ error: 'tiada rekod untuk dikemas kini' }, 404);
      const rec = Object.assign({}, cur);
      if (b.school != null) rec.school = String(b.school);
      if (b.plan) rec.plan = String(b.plan);
      if (b.expires) { rec.expires = b.expires; rec.day = +b.expires.slice(8); }
      await env.LICENSES.put(key, JSON.stringify(rec));
      return json({ ok: true, key, record: rec });
    }
    // addMonths: tambah bulan pada lesen sedia ada (dari tarikh tamat jika masih aktif, jika tidak dari hari ini), tanpa kira tarikh sendiri
    if (b.addMonths != null) {
      const n = Number(b.addMonths);
      if (!Number.isInteger(n) || n < 1 || n > 120) return json({ error: 'addMonths mesti nombor bulat 1 hingga 120' }, 400);
      let cur = null; try { cur = JSON.parse((await env.LICENSES.get(key)) || 'null'); } catch (e) { cur = null; }
      if (cur && !cur.expires) return json({ error: 'lesen ini tiada tarikh luput (tidak tamat), tiada apa untuk ditambah' }, 400);
      const t = today(now), active = cur && cur.expires >= t, base = active ? cur.expires : t, day = active && cur.day ? cur.day : +base.slice(8);
      const keep = cur && cur.plan && cur.plan !== PLAN_TRIAL ? cur.plan : n >= 12 ? 'tahunan' : 'bulanan';
      const rec = { school: String(b.school != null ? b.school : (cur && cur.school) || ''), plan: String(b.plan || keep), expires: addMonths(base, n, day), day };
      await env.LICENSES.put(key, JSON.stringify(rec));
      return json({ ok: true, key, expires: rec.expires, plan: rec.plan });
    }
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

// ---------- artikel (tab Artikel di /admin/, halaman awam /artikel/) ----------
// KV: "artidx" senarai ringkas semua artikel; "art:<slug>" rekod penuh (dengan 5 versi lama); "artredir:<lama>" -> slug baharu;
// "artimg:<id>" gambar {t: jenis, d: base64}. Halaman awam dijana di sini sebagai HTML penuh (boleh diindeks Google) dan
// dihidangkan di annurtimetable.com/artikel/ melalui edge/worker.js. SITE_URL (lalai https://annurtimetable.com) untuk pautan kanonik.
const ART_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ART_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ART_IMG_MAX = 1536 * 1024;
const ART_HISTORY = 5;
export const artSlugify = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// pautan dibenarkan: http(s), alamat dalam laman (/...), #, mailto. Selain itu (javascript:, data:) dibuang.
const okUrl = (u) => /^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(String(u || '').trim());

// Markdown ringkas yang selamat: semua teks di-escape dahulu, kemudian corak dikenal pasti. Tiada HTML mentah dibenarkan.
function mdInline(raw) {
  const keep = [];
  const hold = (html) => '\u0000' + (keep.push(html) - 1) + '\u0000';
  let s = escH(raw);
  s = s.replace(/`([^`]+)`/g, (m, c) => hold('<code>' + c + '</code>'));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => okUrl(src) ? hold('<img src="' + src + '" alt="' + alt + '" loading="lazy">') : alt);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => {
    if (!okUrl(href)) return txt;
    const ext = /^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?annurtimetable\.com/i.test(href);
    return hold('<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>') + txt + hold('</a>');
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}
export function markdown(src) {
  const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n'), out = [];
  let para = [], i = 0;
  const flush = () => { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } };
  while (i < lines.length) {
    const l = lines[i], t = l.trim();
    let m;
    if (!t) { flush(); i++; continue; }
    if (/^```/.test(t)) {
      flush(); const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      i++; out.push('<pre><code>' + escH(code.join('\n')) + '</code></pre>'); continue;
    }
    if ((m = /^(#{1,4})\s+(.+?)\s*#*$/.exec(t))) {
      flush(); const n = Math.max(2, m[1].length), id = artSlugify(m[2]);
      out.push('<h' + n + (id ? ' id="' + id + '"' : '') + '>' + mdInline(m[2]) + '</h' + n + '>'); i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>/.test(t)) {
      flush(); const q = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) q.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push('<blockquote>' + q.join('\n').split(/\n\s*\n/).map((p) => '<p>' + mdInline(p.replace(/\n/g, ' ')) + '</p>').join('') + '</blockquote>'); continue;
    }
    const ul = /^[-*+]\s+/, ol = /^\d+[.)]\s+/;
    if (ul.test(t) || ol.test(t)) {
      flush(); const re = ul.test(t) ? ul : ol, tag = re === ul ? 'ul' : 'ol', items = [];
      while (i < lines.length) {
        const x = lines[i].trim();
        if (re.test(x)) items.push(x.replace(re, ''));
        else if (x && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += ' ' + x;
        else break;
        i++;
      }
      out.push('<' + tag + '>' + items.map((x) => '<li>' + mdInline(x) + '</li>').join('') + '</' + tag + '>'); continue;
    }
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}
const plainText = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`|-]/g, ' ').replace(/\s+/g, ' ').trim();
export const readMinutes = (md) => Math.max(1, Math.round(plainText(md).split(' ').filter(Boolean).length / 200));
const artMeta = (a) => ({ slug: a.slug, title: a.title, desc: a.desc || '', cover: a.cover || '', tags: a.tags || [], status: a.status, date: a.date || '', updated: a.updated || '', minutes: readMinutes(a.body) });
export const artVisible = (a, now) => !!a && a.status === 'published' && (!a.date || a.date <= today(now));

async function artIndex(env) { const v = await getJson(env, 'artidx'); return Array.isArray(v) ? v : []; }
async function artIndexPut(env, list) {
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.updated).localeCompare(String(a.updated)));
  await env.LICENSES.put('artidx', JSON.stringify(list));
}

export async function articlesAdmin(req, env, url, now, who) {
  const rest = decodeURIComponent(url.pathname.slice('/admin/articles'.length)).replace(/^\/+/, '');
  if (rest === '' && req.method === 'GET') return json({ articles: await artIndex(env) });
  if (rest === 'preview' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'JSON tidak sah' }, 400); }
    return json({ html: markdown(String((b && b.body) || '').slice(0, 200000)), minutes: readMinutes(b && b.body) });
  }
  if (rest === 'image' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'JSON tidak sah' }, 400); }
    const type = String((b && b.type) || ''), data = String((b && b.data) || '').replace(/^data:[^,]*,/, '');
    if (!ART_IMG_TYPES.includes(type)) return json({ error: 'jenis gambar mesti JPG, PNG, WebP atau GIF' }, 400);
    if (!/^[A-Za-z0-9+/]+=*$/.test(data) || data.length * 3 / 4 > ART_IMG_MAX) return json({ error: 'gambar terlalu besar (had 1.5 MB) atau rosak' }, 400);
    const rnd = new Uint8Array(8); crypto.getRandomValues(rnd);
    const id = [...rnd].map((x) => x.toString(16).padStart(2, '0')).join('') + '.' + type.split('/')[1].replace('jpeg', 'jpg');
    await env.LICENSES.put('artimg:' + id, JSON.stringify({ t: type, d: data, at: today(now) }));
    return json({ ok: true, url: '/artikel/img/' + id });
  }
  if (rest === '' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch (e) { return json({ error: 'JSON tidak sah' }, 400); }
    b = b || {};
    const title = String(b.title || '').trim().slice(0, 150);
    if (!title) return json({ error: 'tajuk diperlukan' }, 400);
    const slug = String(b.slug || '').trim().toLowerCase() || artSlugify(title);
    if (!ART_SLUG.test(slug) || slug.length > 80) return json({ error: 'slug hanya huruf kecil, nombor dan sempang (contoh cara-agih-relief)' }, 400);
    if (slug === 'img' || slug === 'sitemap-xml' || slug === 'feed') return json({ error: 'slug ini dikhaskan' }, 400);
    const status = b.status === 'published' ? 'published' : 'draft';
    if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return json({ error: 'tarikh mesti YYYY-MM-DD' }, 400);
    const cover = String(b.cover || '').trim().slice(0, 500);
    if (cover && !okUrl(cover)) return json({ error: 'pautan gambar utama tidak sah' }, 400);
    const body = String(b.body || '');
    if (body.length > 200000) return json({ error: 'isi terlalu panjang' }, 400);
    const oldSlug = String(b.oldSlug || '').trim().toLowerCase();
    const cur = await getJson(env, 'art:' + (oldSlug || slug));
    if (oldSlug && !cur) return json({ error: 'artikel asal tiada (mungkin telah dipadam)' }, 404);
    if (!oldSlug && cur) return json({ error: 'slug sudah digunakan oleh artikel lain' }, 409);
    if (oldSlug && oldSlug !== slug && await env.LICENSES.get('art:' + slug)) return json({ error: 'slug sudah digunakan oleh artikel lain' }, 409);
    if (cur && b.base && cur.updated !== b.base) return json({ error: 'artikel ini telah diubah di tab atau peranti lain. Muat semula dahulu.', conflict: true }, 409);
    const stamp = new Date(now).toISOString();
    const history = cur ? [{ at: cur.updated, title: cur.title, desc: cur.desc, body: cur.body }].concat(cur.history || []).slice(0, ART_HISTORY) : [];
    const rec = {
      slug, title, desc: String(b.desc || '').trim().slice(0, 300), cover,
      tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 8),
      status, date: b.date || (cur && cur.date) || (status === 'published' ? today(now) : ''), body,
      created: (cur && cur.created) || stamp, updated: stamp, by: (who && who.by) || '', history
    };
    await env.LICENSES.put('art:' + slug, JSON.stringify(rec));
    let list = (await artIndex(env)).filter((x) => x.slug !== slug && x.slug !== oldSlug);
    list.push(artMeta(rec));
    if (oldSlug && oldSlug !== slug) {
      await env.LICENSES.delete('art:' + oldSlug);
      await env.LICENSES.put('artredir:' + oldSlug, slug);
    }
    await env.LICENSES.delete('artredir:' + slug);
    await artIndexPut(env, list);
    return json({ ok: true, article: rec });
  }
  if (rest && req.method === 'GET') {
    const a = await getJson(env, 'art:' + rest);
    return a ? json({ article: a }) : json({ error: 'tidak dijumpai' }, 404);
  }
  if (rest && req.method === 'DELETE') {
    await env.LICENSES.delete('art:' + rest);
    await artIndexPut(env, (await artIndex(env)).filter((x) => x.slug !== rest));
    return json({ ok: true });
  }
  return json({ error: 'kaedah tidak disokong' }, 405);
}

const dmyMs = (iso) => {
  if (!iso) return '';
  const b = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  return (+iso.slice(8, 10)) + ' ' + b[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
};
const ART_CSS = ':root{--ink:#0b1220;--mut:#51607a;--line:#e3e8f2;--soft:#f4f7fc;--brand:#1d4ed8;--brand2:#0b1b4d;--accent:#f59e0b}' +
  '*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:17px/1.75 Inter,"Segoe UI",system-ui,Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}' +
  'a{color:var(--brand)}img{max-width:100%;height:auto}' +
  '.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.95);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}' +
  '.top .in{max-width:1080px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:14px}' +
  '.logo{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink);text-decoration:none;font-size:16px}.logo img{width:34px;height:34px}' +
  '.top nav{margin-left:auto;display:flex;gap:16px;align-items:center;font-size:15px}.top nav a{color:var(--ink);text-decoration:none;font-weight:500}' +
  '.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:10px 18px;font-weight:700;text-decoration:none;font-size:15px;line-height:1.2}' +
  '.btn.p{background:var(--accent);color:#1b1200!important}.btn.o{border:1.5px solid var(--brand);color:var(--brand)}' +
  '.wrap{max-width:720px;margin:0 auto;padding:0 16px}' +
  '.hd{padding:44px 0 18px}.crumb{font-size:14px;color:var(--mut)}.crumb a{color:var(--mut)}' +
  'h1{font-size:clamp(30px,5vw,44px);line-height:1.15;letter-spacing:-.02em;margin:12px 0 14px}' +
  '.meta{color:var(--mut);font-size:15px;display:flex;gap:8px;flex-wrap:wrap}.tags{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}' +
  '.tags span{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px;color:var(--mut)}' +
  '.cover{margin:22px 0 6px;border-radius:18px;overflow:hidden;background:var(--soft)}.cover img{display:block;width:100%}' +
  '.body h2{font-size:26px;line-height:1.3;margin:38px 0 10px;letter-spacing:-.01em}.body h3{font-size:21px;margin:28px 0 8px}.body h4{font-size:18px;margin:22px 0 6px}' +
  '.body p{margin:0 0 18px}.body ul,.body ol{padding-left:24px;margin:0 0 18px}.body li{margin:4px 0}' +
  '.body blockquote{margin:22px 0;padding:14px 20px;border-left:4px solid var(--accent);background:#fffbeb;border-radius:0 14px 14px 0}.body blockquote p{margin:0}' +
  '.body img{border-radius:14px;display:block;margin:22px auto}.body hr{border:0;border-top:1px solid var(--line);margin:34px 0}' +
  '.body code{background:var(--soft);border-radius:6px;padding:1px 6px;font-size:.92em}.body pre{background:#0b1220;color:#e2e8f0;padding:16px;border-radius:14px;overflow:auto}.body pre code{background:none;padding:0}' +
  '.cta{margin:44px 0;padding:28px;border-radius:22px;background:linear-gradient(160deg,#0b1b4d,#0a1230);color:#fff;text-align:center}' +
  '.cta h2{margin:0 0 8px;font-size:24px;line-height:1.3}.cta p{margin:0 0 18px;color:#c3cfee}.cta .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.cta .btn.o{border-color:#9db4ff;color:#fff}' +
  '.list{display:grid;gap:18px;padding:10px 0 50px}.card{display:grid;grid-template-columns:220px 1fr;gap:18px;border:1px solid var(--line);border-radius:20px;overflow:hidden;text-decoration:none;color:var(--ink);transition:box-shadow .2s}' +
  '.card:hover{box-shadow:0 12px 30px rgba(15,23,42,.08)}.card .im{background:linear-gradient(135deg,#dbe6ff,#f4f7fc);min-height:150px;background-size:cover;background-position:center}' +
  '.card .tx{padding:18px 20px 18px 0}.card h2{font-size:21px;line-height:1.3;margin:0 0 6px}.card p{margin:0 0 8px;color:var(--mut);font-size:15.5px;line-height:1.6}.card small{color:var(--mut);font-size:13.5px}' +
  '.lead{color:var(--mut);margin:0 0 20px}.empty{color:var(--mut);padding:40px 0}' +
  'footer{border-top:1px solid var(--line);margin-top:30px;padding:26px 0;color:var(--mut);font-size:14px}footer .wrap{display:flex;gap:10px 20px;flex-wrap:wrap;justify-content:space-between;max-width:1080px}footer a{color:var(--mut)}' +
  '@media(max-width:640px){body{font-size:16.5px}.top nav a.hide{display:none}.card{grid-template-columns:1fr}.card .tx{padding:0 16px 16px}.card .im{min-height:160px}.hd{padding-top:28px}}';

function artPage(env, o) {
  const site = String(env.SITE_URL || 'https://annurtimetable.com').replace(/\/$/, '');
  const img = o.image ? (/^https?:/i.test(o.image) ? o.image : site + o.image) : site + '/icons/icon-512.png';
  return '<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escH(o.title) + '</title><meta name="description" content="' + escH(o.desc) + '">' +
    '<link rel="canonical" href="' + escH(site + o.path) + '"><link rel="icon" href="/brand/annurpro-icon-64.png">' +
    '<meta property="og:type" content="' + (o.article ? 'article' : 'website') + '"><meta property="og:title" content="' + escH(o.ogTitle || o.title) + '">' +
    '<meta property="og:description" content="' + escH(o.desc) + '"><meta property="og:url" content="' + escH(site + o.path) + '"><meta property="og:image" content="' + escH(img) + '">' +
    '<meta property="og:site_name" content="Annur Time Table"><meta name="twitter:card" content="summary_large_image">' +
    (o.noindex ? '<meta name="robots" content="noindex">' : '') +
    '<link rel="alternate" type="application/rss+xml" title="Artikel Annur Time Table" href="/artikel/feed.xml">' +
    (o.jsonld ? '<script type="application/ld+json">' + JSON.stringify(o.jsonld).replace(/</g, '\\u003c') + '</script>' : '') +
    '<style>' + ART_CSS + '</style></head><body>' +
    '<header class="top"><div class="in"><a class="logo" href="/salepage/"><img src="/brand/annurpro-icon-64.png" alt="" width="34" height="34">Annur Time Table</a>' +
    '<nav><a href="/artikel/">Artikel</a><a class="hide" href="/panduan/">Panduan</a><a class="btn p" href="/">Cuba percuma</a></nav></div></header>' +
    o.main +
    '<footer><div class="wrap"><span>Annur Time Table · AnnurPro Solutions</span><span><a href="/salepage/">Tentang sistem</a> · <a href="/panduan/">Panduan</a> · <a href="/privasi.html">Dasar privasi</a></span></div></footer></body></html>';
}
const ART_CTA = '<section class="cta"><h2>Cuba Annur Time Table percuma 14 hari</h2><p>Jana jadual waktu tanpa pertembungan dan agih guru ganti secara adil. Data kekal dalam Google Sheet sekolah sendiri.</p>' +
  '<div class="row"><a class="btn p" href="/">Mula percubaan percuma</a><a class="btn o" href="/salepage/">Lihat cara ia berfungsi</a></div></section>';
const htmlRes = (body, status, cache) => new Response(body, { status: status || 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache || 'public, max-age=60' } });
const notFound = (env) => htmlRes(artPage(env, { title: 'Artikel tidak dijumpai · Annur Time Table', desc: '', path: '/artikel/', noindex: true,
  main: '<main class="wrap"><div class="hd"><h1>Artikel tidak dijumpai</h1><p class="lead">Artikel ini mungkin telah dipindahkan atau belum diterbitkan.</p><p><a class="btn o" href="/artikel/">Lihat semua artikel</a></p></div></main>' }), 404, 'public, max-age=30');

export async function artikelPublic(req, env, url, now) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'kaedah tidak disokong' }, 405);
  const site = String(env.SITE_URL || 'https://annurtimetable.com').replace(/\/$/, '');
  const rest = decodeURIComponent(url.pathname.slice('/artikel'.length)).replace(/^\/+|\/+$/g, '');
  if (url.pathname === '/artikel') return new Response(null, { status: 301, headers: { location: '/artikel/' } });
  if (rest.startsWith('img/')) {
    const id = rest.slice(4);
    if (!/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(id)) return new Response('tidak dijumpai', { status: 404 });
    const v = await getJson(env, 'artimg:' + id);
    if (!v || !v.d) return new Response('tidak dijumpai', { status: 404 });
    const bin = atob(v.d), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Response(u8, { headers: { 'content-type': v.t, 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  const pub = (await artIndex(env)).filter((a) => artVisible(a, now));
  if (rest === 'sitemap.xml') {
    const urls = [['/artikel/', pub[0] ? pub[0].updated : '']].concat(pub.map((a) => ['/artikel/' + a.slug + '/', a.updated]));
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(([p, u]) => '<url><loc>' + escH(site + p) + '</loc>' + (u ? '<lastmod>' + escH(String(u).slice(0, 10)) + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n',
      { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
  if (rest === 'feed.xml') {
    const items = pub.slice(0, 30).map((a) => '<item><title>' + escH(a.title) + '</title><link>' + escH(site + '/artikel/' + a.slug + '/') + '</link><guid>' + escH(site + '/artikel/' + a.slug + '/') + '</guid>' +
      (a.date ? '<pubDate>' + new Date(a.date + 'T00:00:00+08:00').toUTCString() + '</pubDate>' : '') + '<description>' + escH(a.desc) + '</description></item>').join('');
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Artikel Annur Time Table</title><link>' + escH(site + '/artikel/') + '</link><description>Panduan jadual waktu dan relief untuk sekolah</description><language>ms</language>' + items + '</channel></rss>\n',
      { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
  if (!rest) {
    const cards = pub.map((a) => '<a class="card" href="/artikel/' + escH(a.slug) + '/"><div class="im"' + (a.cover ? ' style="background-image:url(\'' + escH(a.cover) + '\')"' : '') + '></div>' +
      '<div class="tx"><h2>' + escH(a.title) + '</h2><p>' + escH(a.desc) + '</p><small>' + escH(dmyMs(a.date)) + ' · ' + a.minutes + ' minit bacaan</small></div></a>').join('');
    return htmlRes(artPage(env, { title: 'Artikel · Annur Time Table', desc: 'Panduan praktikal jadual waktu, relief guru ganti dan pengurusan sekolah untuk penolong kanan dan penyelaras jadual.', path: '/artikel/',
      main: '<main class="wrap"><div class="hd"><div class="crumb"><a href="/salepage/">Annur Time Table</a> / Artikel</div><h1>Artikel</h1>' +
        '<p class="lead">Panduan praktikal jadual waktu dan relief guru ganti, untuk penolong kanan dan penyelaras jadual.</p></div>' +
        '<div class="list">' + (cards || '<p class="empty">Belum ada artikel diterbitkan.</p>') + '</div></main>' }));
  }
  const slug = rest.toLowerCase();
  if (!ART_SLUG.test(slug)) return notFound(env);
  const a = await getJson(env, 'art:' + slug);
  if (!artVisible(a, now)) {
    const to = await env.LICENSES.get('artredir:' + slug);
    return to ? new Response(null, { status: 301, headers: { location: '/artikel/' + to + '/' } }) : notFound(env);
  }
  if (!url.pathname.endsWith('/')) return new Response(null, { status: 301, headers: { location: '/artikel/' + slug + '/' } });
  const more = pub.filter((x) => x.slug !== slug).slice(0, 3);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.desc || '', datePublished: a.date || undefined, dateModified: String(a.updated || '').slice(0, 10) || undefined,
    image: a.cover ? (/^https?:/i.test(a.cover) ? a.cover : site + a.cover) : undefined, mainEntityOfPage: site + '/artikel/' + slug + '/',
    author: { '@type': 'Organization', name: 'AnnurPro Solutions' }, publisher: { '@type': 'Organization', name: 'AnnurPro Solutions', logo: { '@type': 'ImageObject', url: site + '/brand/annurpro-icon-256.png' } } };
  return htmlRes(artPage(env, { title: a.title + ' · Annur Time Table', ogTitle: a.title, desc: a.desc || plainText(a.body).slice(0, 160), path: '/artikel/' + slug + '/', image: a.cover, article: true, jsonld,
    main: '<main class="wrap"><article><div class="hd"><div class="crumb"><a href="/artikel/">Artikel</a></div><h1>' + escH(a.title) + '</h1>' +
      '<div class="meta"><span>' + escH(dmyMs(a.date)) + '</span><span>·</span><span>' + readMinutes(a.body) + ' minit bacaan</span></div>' +
      (a.tags && a.tags.length ? '<div class="tags">' + a.tags.map((t) => '<span>' + escH(t) + '</span>').join('') + '</div>' : '') +
      (a.cover ? '<div class="cover"><img src="' + escH(a.cover) + '" alt=""></div>' : '') + '</div>' +
      '<div class="body">' + markdown(a.body) + '</div></article>' + ART_CTA +
      (more.length ? '<h2 style="font-size:22px">Artikel lain</h2><div class="list">' + more.map((x) => '<a class="card" href="/artikel/' + escH(x.slug) + '/"><div class="im"' + (x.cover ? ' style="background-image:url(\'' + escH(x.cover) + '\')"' : '') + '></div><div class="tx"><h2>' + escH(x.title) + '</h2><p>' + escH(x.desc) + '</p><small>' + x.minutes + ' minit bacaan</small></div></a>').join('') + '</div>' : '') +
      '</main>' }));
}

export async function handle(req, env, opts) {
  opts = opts || {};
  const now = opts.now != null ? opts.now : Date.now();
  const fetchFn = opts.fetch || fetch;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/admin/')) {
    // dashboard di laman app memanggil dari asal lain: CORS hanya untuk ALLOWED_ORIGINS
    const ac = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: ac ? 204 : 403, headers: ac || {} });
    const res = await admin(req, env, url, now, fetchFn);
    if (ac) for (const [k, v] of Object.entries(ac)) res.headers.set(k, v);
    return res;
  }
  const cors = corsHeaders(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
  if (url.pathname === '/health') return json({ ok: true });
  if (url.pathname === '/artikel' || url.pathname.startsWith('/artikel/')) return artikelPublic(req, env, url, now);
  if (url.pathname === '/stats' && req.method === 'GET') {
    // awam dan tanpa data peribadi: bilangan sahaja
    return json(await publicStats(env, now), 200, { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600' });
  }
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
  if (url.pathname === '/slug' || url.pathname.startsWith('/slug/')) {
    if (!cors) return json({ error: 'asal tidak dibenarkan' }, 403);
    return slugRoute(req, env, url, cors, { now, fetchFn, grace: numEnv(env.GRACE_DAYS, 7) });
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
