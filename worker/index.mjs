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
      if (n === 'stats:cache' || n.startsWith('slugof:')) continue;
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
