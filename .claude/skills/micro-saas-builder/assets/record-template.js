// TEMPLAT daripada Annur Time Table (tools/manual/record.js). Sesuaikan sebelum guna:
//  - ROOT, SITE (domain sebenar app), laluan worker lesen dan helper fake Sheets (assets/fake-sheets.js)
//  - seedState(): cara app anda mencipta data demo dan sesi pentadbir
//  - scenes: lihat assets/scenes-example.js (selector data-act ikut app anda)

// Rakam video panduan (~1 minit setiap fungsi) dan gambar skrin untuk manual pengguna.
// App sebenar dijalankan secara setempat; Google, Sheets dan Worker lesen disimulasi (tiada data sebenar disentuh).
//
//   node tools/manual/record.js                  -> gambar skrin + video, semua babak
//   node tools/manual/record.js --shots          -> gambar skrin sahaja (pantas)
//   node tools/manual/record.js --videos V06,V09 -> video babak tertentu sahaja
//   OUT=/laluan/keluaran node tools/manual/record.js
//
// Keluaran: <OUT>/shots/*.jpg dan <OUT>/video/*.mp4 (perlu ffmpeg dalam PATH).
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { fakeSheets } = require('./fake-sheets.js');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'tools/manual/out'));
const FIXED = new Date('2026-11-02T07:45:00+08:00'); // Isnin
const EMAIL = 'pentadbir@moe-dl.edu.my';
const args = process.argv.slice(2);
const pick = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1].split(',') : []); };
const ONLY_SHOTS = args.includes('--shots');
const VIDS = pick('--videos');
const PAR = +(process.env.PAR || 1); // rakam satu demi satu: rakaman serentak berebut CPU dan menambah jeda kaku dalam video

// ---------------- laman app dihidang terus dari repo di bawah alamat sebenar (tiada rangkaian) ----------------
// /s/<nama>: index.html dengan <base href="/"> disuntik, sama seperti edge/worker.js
const SITE = 'https://annurtimetable.com/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
async function site(ctx) {
  await ctx.route(/^https:\/\/annurtimetable\.com\//, (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    const pretty = /^\/s\/[^/]+\/?$/.test(p);
    if (p === '/' || pretty) p = '/index.html';
    else if (!path.extname(p) && fs.existsSync(path.join(ROOT, p + '.html'))) p += '.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f);
    if (pretty) body = body.toString('utf8').replace('<head>', '<head>\n<base href="/">');
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
  });
}

// ---------------- Google + Sheets + Worker lesen tiruan (satu set bagi setiap babak) ----------------
async function backend(origin) {
  const fake = fakeSheets('tok-rec');
  const { handle } = await import(path.join(ROOT, 'worker/index.mjs'));
  const kv = new Map();
  const env = { LICENSES: { get: async (k) => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [...kv.keys()].map((name) => ({ name })), list_complete: true }) },
    ADMIN_TOKEN: 'adm', GOOGLE_CLIENT_ID: 'rakam.apps.googleusercontent.com', ALLOWED_ORIGINS: origin, TRIAL_DAYS: '14',
    BUY_URL: 'https://annurprosolutions1.bcl.my/form/jadual-sekolah-relief-system' };
  const tokeninfo = async () => ({ ok: true, json: async () => ({ email: EMAIL, email_verified: 'true', aud: 'rakam.apps.googleusercontent.com' }) });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };
  const shared = new Set();
  const json = (route, body) => route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(body) });
  const admin = (body) => handle(new Request('https://w.test/admin/licenses', { method: 'POST', headers: { authorization: 'Bearer adm', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
  const mocks = async (page) => {
    await page.route('**/config.js', async (route) => {
      const body = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8')
        .replace(/googleClientId: '[^']*'/, "googleClientId: 'rakam.apps.googleusercontent.com'")
        .replace(/licenseUrl: '[^']*'/, "licenseUrl: 'https://lesen.test'")
        .replace(/canonicalUrl: '[^']*'/, "canonicalUrl: ''");
      await route.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
    await page.addInitScript(() => {
      window.google = { accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'tok-rec', expires_in: 3600 }), 400) }),
        revoke: (t, cb) => { if (cb) cb(); }
      } } };
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com\/gsi|script\.google\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('https://sheets.googleapis.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const r = await fake.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
      return route.fulfill({ status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(await r.json()) });
    });
    await page.route('https://lesen.test/**', async (route) => {
      const r = route.request();
      const res = await handle(new Request(r.url(), { method: r.method(), headers: r.headers(), body: ['GET', 'HEAD', 'OPTIONS'].includes(r.method()) ? undefined : r.postData() }), env, { fetch: tokeninfo });
      const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
      return route.fulfill({ status: res.status, headers: h, body: await res.text() });
    });
    await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => (route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : json(route, { email: EMAIL })));
    await page.route('https://www.googleapis.com/drive/v3/**', async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const pm = u.pathname.match(/\/files\/([^/]+)\/permissions$/);
      if (pm && req.method() === 'POST') { shared.add(pm[1]); return json(route, { id: 'anyoneWithLink' }); }
      if (u.pathname.endsWith('/files')) return json(route, { files: [...fake.db.entries()].filter(([, v]) => v.title.includes('Jadual Sekolah')).map(([id, v]) => ({ id, name: v.title, modifiedTime: '2026-11-02T00:00:00Z' })) });
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.route('https://docs.google.com/spreadsheets/d/**', async (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[3], book = fake.db.get(id);
      if (!book || !shared.has(id)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/html' }, cors), body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
      const csv = (book.tabs.get('Data') || []).map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/csv' }, cors), body: csv });
    });
  };
  return { fake, env, kv, admin, mocks };
}

// ---------------- lapisan rakaman: kursor, riak klik, kapsyen, kad tajuk, sorotan ----------------
const OVERLAY = () => {
  if (window.top !== window) return;
  const css = `#rec-cur{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-80px,-80px)}
  #rec-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  .rec-rip{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid #f59e0b;z-index:2147483646;pointer-events:none;animation:recR .65s ease-out forwards}
  @keyframes recR{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}
  #rec-cap{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);max-width:86%;width:max-content;background:rgba(15,23,42,.92);color:#fff;font:600 21px/1.42 system-ui,-apple-system,"Segoe UI",sans-serif;padding:12px 22px;border-radius:14px;z-index:2147483645;pointer-events:none;text-align:center;opacity:0;transition:opacity .25s;box-shadow:0 8px 30px rgba(0,0,0,.3)}
  #rec-cap.on{opacity:1}
  #rec-title{position:fixed;inset:0;z-index:2147483644;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1d4ed8,#0f172a);color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;transition:opacity .6s}
  #rec-title .k{font-size:20px;opacity:.85;letter-spacing:.12em;text-transform:uppercase}
  #rec-title .t{font-size:48px;font-weight:800;margin:12px 40px;line-height:1.15}
  #rec-title .s{font-size:22px;opacity:.9;max-width:900px;margin:0 30px}
  #rec-title.off{opacity:0;pointer-events:none}
  #rec-hl{position:fixed;z-index:2147483643;pointer-events:none;border:4px solid #f59e0b;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);transition:all .35s;opacity:0}
  #rec-hl.on{opacity:1}
  html.rec-hide #rec-cur,html.rec-hide #rec-cap,html.rec-hide #rec-title,html.rec-hide #rec-hl,html.rec-hide .rec-rip{display:none!important}`;
  const mk = () => {
    if (document.getElementById('rec-cur')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'rec-cur';
    cur.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 11-6.6 1.2L16 21l-2.6 1.2-3.6-6.9L4 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const cap = document.createElement('div'); cap.id = 'rec-cap';
    const hl = document.createElement('div'); hl.id = 'rec-hl';
    document.documentElement.append(cur, cap, hl);
    const mv = (e) => { if (e.clientX || e.clientY) cur.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; };
    ['mousemove', 'dragover', 'drag', 'pointermove'].forEach((t) => window.addEventListener(t, mv, true));
    window.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'rec-rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  window.__rec = {
    cap: (t) => { mk(); const c = document.getElementById('rec-cap'); if (!t) { c.classList.remove('on'); return; } c.textContent = t; c.classList.add('on'); },
    title: (k, t, s) => {
      mk(); let el = document.getElementById('rec-title');
      if (!el) { el = document.createElement('div'); el.id = 'rec-title'; document.documentElement.appendChild(el); }
      el.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div><div class="s">${s || ''}</div>`; el.classList.remove('off');
    },
    titleOff: () => { const el = document.getElementById('rec-title'); if (el) el.classList.add('off'); },
    hl: (sel) => {
      mk(); const h = document.getElementById('rec-hl'), el = sel && document.querySelector(sel);
      if (!el) { h.classList.remove('on'); return; }
      const b = el.getBoundingClientRect(); Object.assign(h.style, { left: b.left - 6 + 'px', top: b.top - 6 + 'px', width: b.width + 12 + 'px', height: b.height + 12 + 'px' }); h.classList.add('on');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
};

// ---------------- pembantu babak ----------------
function helpers(pg, mode, name, log) {
  const video = mode === 'video';
  const W = (ms) => pg.waitForTimeout(video ? ms : Math.min(ms, 120));
  let cur = { x: 640, y: 380 };
  const loc = async (sel, t) => {
    const l = typeof sel === 'string' ? pg.locator(sel).first() : sel;
    await l.waitFor({ state: 'visible', timeout: t || 8000 });
    await l.scrollIntoViewIfNeeded().catch(() => {});
    return l;
  };
  const moveTo = async (x, y) => {
    if (!video) return;
    const steps = Math.max(10, Math.min(40, Math.round(Math.hypot(x - cur.x, y - cur.y) / 16)));
    await pg.mouse.move(x, y, { steps }); cur = { x, y };
  };
  const h = {
    pg, video, W,
    async say(text, ms) {
      if (!video) return;
      await pg.evaluate((t) => window.__rec && window.__rec.cap(t), text);
      await pg.waitForTimeout(ms != null ? ms : Math.max(2300, Math.round(text.length * 52)));
    },
    async quiet() { if (video) await pg.evaluate(() => window.__rec && window.__rec.cap('')); },
    async title(t, s) {
      if (!video) return;
      await pg.evaluate(([t, s]) => window.__rec.title('Annur Time Table · Panduan video', t, s), [t, s]);
      await pg.waitForTimeout(2700);
      await pg.evaluate(() => window.__rec.titleOff()); await pg.waitForTimeout(500);
    },
    async end(t) {
      if (!video) return;
      await h.quiet();
      await pg.evaluate((t) => window.__rec.title('Annur Time Table', t, 'annurtimetable.com · WhatsApp 011-2087 9149'), t || 'Selesai');
      await pg.waitForTimeout(2300);
    },
    async hl(sel, ms) {
      if (!video) return;
      try { await loc(sel, 1500); } catch (e) { return; }
      await pg.evaluate((s) => window.__rec.hl(s), sel); await pg.waitForTimeout(ms || 1500); await pg.evaluate(() => window.__rec.hl(null));
    },
    async click(sel, o) {
      o = o || {};
      try {
        const t0 = Date.now();
        const l = await loc(sel, o.timeout); const b = await l.boundingBox(); const t1 = Date.now();
        if (video && b) { await moveTo(b.x + b.width / 2, b.y + b.height / 2); await pg.waitForTimeout(280); await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        if (process.env.RECDEBUG) log(`  [${name}] klik ${sel}: cari ${t1 - t0} ms, gerak+klik ${Date.now() - t1} ms`);
        else await l.click();
        await W(o.after != null ? o.after : 800);
        return true;
      } catch (e) { log(`  ! [${name}] klik ${sel}: ${e.message.split('\n')[0]}`); return false; }
    },
    async hover(sel, ms) {
      if (!video) return;
      try { const l = await loc(sel, 2000); const b = await l.boundingBox(); if (b) await moveTo(b.x + b.width / 2, b.y + b.height / 2); await pg.waitForTimeout(ms || 800); } catch (e) { /* abaikan */ }
    },
    async type(sel, text, o) {
      try {
        const l = await loc(sel); await h.click(l, { after: 150 });
        await l.fill('');
        if (video) await l.pressSequentially(text, { delay: (o && o.delay) || 55 }); else await l.fill(text);
        await W(500); return true;
      } catch (e) { log(`  ! [${name}] taip ${sel}: ${e.message.split('\n')[0]}`); return false; }
    },
    async select(sel, value) {
      try { const l = await loc(sel); await h.hover(l, 300); await l.selectOption(value); await W(700); return true; } catch (e) { log(`  ! [${name}] pilih ${sel}: ${e.message.split('\n')[0]}`); return false; }
    },
    async nav(p) { return h.click(`nav button[data-p="${p}"]`, { after: 900 }); },
    async tab(scope, k) { return h.click(`button[data-act="tab"][data-scope="${scope}"][data-k="${k}"]`, { after: 850 }); },
    async scroll(y, ms) { await pg.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y); await W(ms || 1200); },
    async scrollTo(sel, ms) { try { await pg.locator(sel).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), null, { timeout: 2000 }); } catch (e) { log(`  ! [${name}] skrol ${sel}`); } await W(ms || 1200); },
    async scrollDlg(ms) { try { await pg.locator('.overlay .dlg-b').first().evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), null, { timeout: 2000 }); } catch (e) { /* abaikan */ } await W(ms || 1300); },
    async shot(file, o) {
      if (mode !== 'shot') return;
      o = o || {};
      await pg.waitForTimeout(o.wait || 450);
      const p = path.join(OUT, 'shots', file + '.jpg');
      try {
        if (o.el) await pg.locator(o.el).first().screenshot({ path: p, type: 'jpeg', quality: 82 });
        else await pg.screenshot({ path: p, type: 'jpeg', quality: 82, fullPage: !!o.full });
        log(`  shot ${file}`);
      } catch (e) { log(`  ! [${name}] gambar ${file}: ${e.message.split('\n')[0]}`); }
    },
    async printPreview(fn, ms, file) {
      // tunjuk susun atur cetakan sebenar (media print) tanpa dialog cetak pelayar
      await pg.evaluate(() => { window.print = () => {}; });
      await fn();
      await pg.waitForTimeout(500);
      await pg.emulateMedia({ media: 'print' });
      await pg.evaluate(() => window.scrollTo(0, 0));
      if (file) await h.shot(file);
      await W(ms || 4500);
      await pg.emulateMedia({ media: 'screen' });
      await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await W(600);
    },
    async confirmIf() { if (await pg.locator('[data-act="confirmYes"]').count()) await h.click('[data-act="confirmYes"]'); }
  };
  return h;
}

// ---------------- keadaan sekolah contoh (daripada mod demo) dengan sesi pentadbir ----------------
async function seedState(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Kuala_Lumpur', serviceWorkers: 'block' });
  await site(ctx);
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(FIXED);
  await pg.route(/fonts\.(googleapis|gstatic)\.com|script\.google\.com|accounts\.google\.com|lesen\.test|jadual-sekolah-lesen/, (r) => r.fulfill({ status: 200, body: '' }));
  await pg.addInitScript(() => { if (!localStorage.getItem('jadual-demo-prefs')) localStorage.setItem('jadual-demo-prefs', JSON.stringify({ survey: { id: 'x', p1: '2026-11-01T00:00:00.000Z', p2: '2026-11-01T00:00:00.000Z' } })); });
  await pg.goto(base + '?demo'); await pg.waitForSelector('header.topbar', { timeout: 60000 });
  await pg.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem('jadual-demo-v1'));
    st.auth = { admin: await TT.hashPassword('rahsia123') }; st.school.name = 'SMK Contoh Jaya';
    localStorage.setItem('jadual-sekolah-v1', JSON.stringify(st));
    localStorage.setItem('jadual-sekolah-prefs', JSON.stringify({ role: 'admin', me: null, name: 'Pentadbir', deviceId: 'drec', session: { role: 'admin', at: Date.now(), until: Date.now() + 30 * 864e5 }, lastBackup: new Date().toISOString() }));
    localStorage.removeItem('jadual-demo-v1'); localStorage.removeItem('jadual-demo-prefs');
  });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

// ---------------- babak ----------------
const SCENES = require('./scenes.js');

async function runScene(browser, base, seed, sc, mode, log) {
  const phone = !!sc.phone;
  const size = phone ? { width: 412, height: 860 } : { width: 1280, height: 720 };
  const opts = { viewport: size, timezoneId: 'Asia/Kuala_Lumpur', serviceWorkers: 'block', acceptDownloads: true, locale: 'ms-MY' };
  if (phone) Object.assign(opts, { isMobile: true, hasTouch: true, deviceScaleFactor: mode === 'shot' ? 2 : 1 });
  if (!sc.fresh) opts.storageState = seed;
  const vdir = path.join(OUT, 'raw', sc.id);
  if (mode === 'video') { fs.rmSync(vdir, { recursive: true, force: true }); opts.recordVideo = { dir: vdir, size }; }
  const be = await backend(new URL(base).origin);
  if (sc.licence) await be.admin(Object.assign({ email: EMAIL }, sc.licence));
  let url = base + (sc.path || '');
  if (sc.prep) url = await sc.prep({ browser, be, seed, base, FIXED, log, site });
  const ctx = await browser.newContext(opts);
  await site(ctx);
  const pg = await ctx.newPage();
  const t0 = Date.now();
  await pg.clock.setFixedTime(FIXED);
  await be.mocks(pg);
  if (mode === 'video') await pg.addInitScript(OVERLAY); // gambar skrin: tiada kursor/kapsyen
  pg.on('pageerror', (e) => log(`  ! [${sc.id}] ralat halaman: ${e.message}`));
  const h = helpers(pg, mode, sc.id, log);
  h.be = be; h.base = base; h.ctx = ctx; h.EMAIL = EMAIL;
  await pg.goto(url);
  if (sc.fresh) await pg.waitForSelector(sc.ready || '.gate', { timeout: 30000 }); else await pg.waitForSelector(sc.ready || 'header.topbar', { timeout: 30000 });
  await pg.waitForTimeout(400);
  const tStart = (Date.now() - t0) / 1000;
  try { await sc.run(h); } catch (e) { log(`  ! [${sc.id}] babak gagal: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  const video = pg.video();
  await ctx.close();
  if (mode === 'video' && video) {
    const raw = await video.path();
    const mp4 = path.join(OUT, 'video', sc.file + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, tStart - 0.15)), '-i', raw, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim();
    log(`  video ${sc.file}.mp4 (${(+dur).toFixed(0)} s)`);
  }
}

async function pool(items, n, fn) {
  const q = items.slice(); const run = async () => { while (q.length) { const x = q.shift(); await fn(x); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

(async () => {
  ['shots', 'video', 'raw'].forEach((d) => fs.mkdirSync(path.join(OUT, d), { recursive: true }));
  const base = SITE;
  const browser = await chromium.launch();
  const log = (m) => console.log(m);
  try {
    const seed = await seedState(browser, base);
    const list = SCENES.filter((s) => !VIDS || !VIDS.length || VIDS.includes(s.id));
    if (!VIDS) {
      console.log('Gambar skrin');
      for (const sc of SCENES) await runScene(browser, base, seed, sc, 'shot', log);
    }
    if (!ONLY_SHOTS) {
      console.log('Video');
      await pool(list, PAR, (sc) => runScene(browser, base, seed, sc, 'video', log));
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
