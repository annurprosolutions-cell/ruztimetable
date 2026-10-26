// Rakam app Jadual Sekolah sebenar untuk video demo. Hasil: shots/*.png + shots/manifest.js
// (kedudukan elemen penting dalam piksel CSS, supaya kamera video boleh zoom tepat).
// App dihidangkan dari pelayan tempatan dengan Google, Sheets dan Drive dimock (kod aliran sebenar app, bukan skrin palsu),
// jadi skrin log masuk, tetapan awal, simpanan Sheets dan pautan guru dirakam daripada aliran yang sama seperti pengguna sebenar.
import { chromium } from 'playwright';
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { fakeSheets } = require('../tests/helpers/fake-sheets.js');
const here = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(here, '..');
const OUT = path.join(here, 'shots');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIXED = new Date('2026-10-26T07:45:00+08:00'); // Isnin, 7:45 pagi
const M = {};

// ---------- pelayan statik + Google tiruan ----------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const TOKEN = 'tok-video', EMAIL = 'pentadbir@smkcontohjaya.edu.my';
const fake = fakeSheets(TOKEN);
const shared = new Set();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (route, body) => route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(body) });

async function mocks(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript((tok) => {
    window.print = () => {};
    window.google = { accounts: { oauth2: {
      initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: tok, expires_in: 3600 }), 300) }),
      revoke: (t, cb) => { if (cb) cb(); }
    } } };
  }, TOKEN);
  await page.route('https://sheets.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = await fake.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
    return route.fulfill({ status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(await r.json()) });
  });
  await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: cors }) : json(route, { email: EMAIL })));
  await page.route('https://www.googleapis.com/drive/v3/**', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const pm = u.pathname.match(/\/files\/([^/]+)\/permissions$/);
    if (pm && req.method() === 'POST') { shared.add(pm[1]); return json(route, { id: 'anyoneWithLink' }); }
    if (u.pathname.endsWith('/files')) return json(route, { files: [] });
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  await page.route('https://docs.google.com/spreadsheets/d/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3], book = fake.db.get(id);
    if (!book || !shared.has(id)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/html' }, cors), body: '<!DOCTYPE html><html></html>' });
    const csv = (book.tabs.get('Data') || []).map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/csv' }, cors), body: csv });
  });
}

const browser = await chromium.launch();

async function open(viewport, dsf, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY', serviceWorkers: 'block' });
  if (opts.notify) await ctx.grantPermissions(['notifications'], { origin: BASE.slice(0, -1) });
  const p = await ctx.newPage();
  if (opts.init) await p.addInitScript(opts.init);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.clock.setFixedTime(FIXED);
  await mocks(p);
  await p.goto(BASE + (opts.url || 'index.html'));
  p.errors = errors;
  return p;
}

async function shot(p, name, tags, opts = {}) {
  await p.evaluate(() => {
    document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0);
    // pill Google Sheets: autosimpan ambil 2.5 saat; rakaman ditunjuk selepas selesai
    if (window.UI && UI.sync && UI.sync.linked && UI.sync.linked()) { clearTimeout(UI.sync.timer); UI.sync.setStatus('saved', 'Disimpan'); }
    // Chromium headless sentiasa papar tarikh mm/dd/yyyy; pengguna Malaysia nampak dd/mm/yyyy.
    // Tukar untuk gambar sahaja, dipulihkan selepas screenshot supaya borang masih berfungsi.
    document.querySelectorAll('input[type=date]').forEach((i) => {
      const v = i.value; i.dataset.origDate = v; i.type = 'text';
      if (v) i.value = v.split('-').reverse().join('/'); else i.placeholder = 'dd/mm/yyyy';
    });
  });
  await p.waitForTimeout(150);
  const info = await p.evaluate((tags) => {
    const rects = {};
    for (const [k, sel] of Object.entries(tags)) {
      const el = document.querySelector(sel);
      if (!el) { rects[k] = null; continue; }
      const r = el.getBoundingClientRect();
      rects[k] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    return { w: document.documentElement.clientWidth, h: innerHeight, rects };
  }, tags);
  await p.screenshot({ path: path.join(OUT, name + '.png') });
  await p.evaluate(() => document.querySelectorAll('input[data-orig-date]').forEach((i) => {
    i.type = 'date'; i.value = i.dataset.origDate; i.removeAttribute('placeholder'); delete i.dataset.origDate;
  }));
  M[name] = Object.assign(info, { mobile: !!opts.mobile });
  const miss = Object.keys(info.rects).filter((k) => !info.rects[k]);
  console.log('shot', name, `${info.w}x${info.h}`, miss.length ? 'TIADA: ' + miss.join(',') : '');
}
const tag = (p, fn, arg) => p.evaluate(fn, arg);

// ---------- logo sekolah contoh (dimuat naik melalui borang tetapan awal sebenar) ----------
const LOGO = path.join(OUT, '_logo.png');
{
  const lp = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await lp.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f4c4a"/></linearGradient></defs>
    <circle cx="128" cy="128" r="120" fill="url(#g)"/><circle cx="128" cy="128" r="104" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>
    <path d="M58 100c24-8 50-6 70 8 20-14 46-16 70-8v82c-24-8-50-6-70 8-20-14-46-16-70-8z" fill="#fff"/><path d="M128 108v82" stroke="#0f766e" stroke-width="6"/>
    <path d="M128 50l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z" fill="#fde68a"/></svg></body>`);
  await lp.screenshot({ path: LOGO, omitBackground: true });
  await lp.close();
}

// ================= pentadbir (desktop) =================
const p = await open({ width: 1280, height: 1200 }, 2);
await p.waitForSelector('.gate');
const CARD = '.gate-card';

// 1. Masuk: peranan, Google, tetapan awal
await shot(p, 'gate-role', { card: CARD, admin: '[data-act="gateGo"][data-s="admin"]', guru: '[data-act="gateGo"][data-s="guru"]', brand: '.gbrand' });
await p.click('[data-act="gateGo"][data-s="admin"]');
await shot(p, 'gate-google', { card: CARD, btn: '[data-act="gateGoogle"]' });
await p.click('[data-act="gateGoogle"]');
await p.waitForSelector('#wName');
await p.fill('#wName', 'SMK Contoh Jaya');
await p.click('[data-act="gateColor"][data-c="#0f766e"]');
await p.setInputFiles('input[data-chg="gateLogo"]', LOGO);
await p.waitForSelector('.wlogo img');
await shot(p, 'wiz-sekolah', { card: CARD, name: '#wName', week: '#wWeek', color: '.swatches', logo: '.wlogo', next: '[data-act="gateNext"]' });
await p.click('[data-act="gateNext"]');
await p.fill('#wPw', 'rahsia123'); await p.fill('#wPw2', 'rahsia123');
await shot(p, 'wiz-pw', { card: CARD, pw: '#wPw', pw2: '#wPw2', next: '[data-act="gateNext"]' });
await p.click('[data-act="gateNext"]');
await shot(p, 'wiz-data', { card: CARD, opts: '.gradio', next: '[data-act="gateNext"]' });
await p.click('[data-act="gateNext"]');
await p.waitForSelector('header.topbar');
await p.waitForFunction(() => UI.sync.status === 'saved' && UI.state.school.guruSheet);
await p.evaluate(() => { UI.prefs.name = 'Pn. Rohana'; UI.prefs.lastBackup = '2026-10-24T10:00:00Z'; UI.savePrefs(); UI.page = 'utama'; UI.render(); });

// 2. Tetapan waktu
await p.evaluate(() => { UI.page = 'tetapan'; UI.setTab = 'waktu'; UI.render(); });
await tag(p, () => {
  const c = document.querySelectorAll('main .card'); c[1].dataset.shot = 'waktu'; c[2].dataset.shot = 'hari';
  document.querySelector('input[data-chg="dayLimit"][data-i="4"]').closest('label').dataset.shot = 'jumaat';
});
await shot(p, 'tetapan', { waktu: '[data-shot=waktu]', hari: '[data-shot=hari]', jumaat: '[data-shot=jumaat]', gen: 'button[data-act="periodGen"]', head: '.phead' });

// 3. Data
await p.evaluate(() => { UI.page = 'data'; UI.dataTab = 'guru'; UI.render(); });
await shot(p, 'data-guru', { bulk: 'button[data-act="bulk"]', table: 'main .tbl', tabs: '.phead .seg.sub', metric: '.phead .metric' });
await p.click('button[data-act="bulk"]');
await p.fill('#theForm textarea[name="text"]', 'Rahimah Salleh, RHS, Bahasa\nGanesh Kumar, GKR, Matematik\nWong Siew Lan, WSL, Sains\nFauziah Hamid, FZH, Kemanusiaan\nMohd Faiz Ramli, MFR, Sukan');
await shot(p, 'data-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
await p.click('.dlg-f button[data-act="modalClose"]');
// slot "tidak boleh" bagi seorang guru
await p.click('button[data-act="add-guru"]');
await p.fill('#theForm input[name="name"]', 'Rahimah Salleh');
await p.click('button.lnk[data-act="availCol"][data-d="4"]');
await p.click('td.av[data-k="0-0"]');
await p.click('td.av[data-k="2-5"]');
await shot(p, 'data-guru-form', { dlg: '.dialog', grid: 'table.avail', jumaat: 'button.lnk[data-act="availCol"][data-d="4"]', simpan: 'button[data-act="formSave"]' });
await p.click('.dlg-f button[data-act="modalClose"]');
await p.evaluate(() => { UI.dataTab = 'pelajaran'; UI.render(); });
await p.click('button[data-act="add-pelajaran"]');
const pm = await p.evaluate(() => UI.state.subjects.find((s) => s.short === 'PI/PM').id);
await p.selectOption('#wzSubj', pm);
await p.fill('#wzPer', '4');
await p.fill('#wzDbl', '1');
await p.check('input[name="wzMode"][value="gabung"]');
await tag(p, () => {
  const s = UI.state, cls = s.classes.filter((c) => c.level === 1).map((c) => c.id), t = s.teachers.filter((x) => ['UHF', 'USM', 'PNR'].includes(x.short)).map((x) => x.id);
  document.querySelectorAll('[data-wz-gc]').forEach((i) => { i.checked = cls.includes(i.value); });
  document.querySelectorAll('[data-wz-gt]').forEach((i) => { i.checked = t.includes(i.value); });
  document.querySelector('input[name="wzMode"][value="gabung"]').closest('.fld').dataset.shot = 'mode';
});
await shot(p, 'data-wizard', { dlg: '.dialog', mode: '[data-shot=mode]', gabung: '#wzGabung', tambah: 'button[data-act="wzSave"]' });
await p.click('.dlg-f button[data-act="modalClose"]');

// 4. Jana
await p.setViewportSize({ width: 1280, height: 1450 });
await p.evaluate(() => { UI.page = 'jadual'; UI.view = { type: 'class', id: null }; UI.render(); });
await shot(p, 'jadual-kosong', { jana: 'button[data-act="generate"]', chip: '.toolbar-card .chip-s', grid: 'table.grid', side: '.tt-side', head: '.phead' });
await p.click('button[data-act="generate"]');
await p.selectOption('#gEffort', '6000');
await tag(p, () => { document.querySelector('#gEffort').closest('.fld').dataset.shot = 'effort'; });
await shot(p, 'jadual-opsyen', { dlg: '.dialog', effort: '[data-shot=effort]', mula: 'button[data-act="genStart"]' });
await p.click('.dlg-f button[data-act="modalClose"]');
const prog = [[6, 'Meletakkan waktu: 14/243'], [27, 'Meletakkan waktu: 131/243'], [50, 'Meletakkan waktu: 243/243'], [72, 'Memperbaiki susunan (kurangkan waktu kosong guru)...'], [96, 'Memperbaiki susunan (kurangkan waktu kosong guru)...']];
for (const [i, [pct, txt]] of prog.entries()) {
  await p.evaluate(({ pct, txt }) => {
    UI.modalOpen('Menjana jadual', '<div class="prog"><div id="gbar"></div></div><p id="gtxt" class="hint"></p>', '<button class="btn">Batal</button>');
    const g = document.getElementById('gbar'); g.style.transition = 'none'; g.style.width = pct + '%';
    document.getElementById('gtxt').textContent = txt;
  }, { pct, txt });
  await shot(p, 'prog-' + (i + 1), { dlg: '.dialog', bar: '.prog' });
}
await p.evaluate(() => UI.modalClose());
await p.evaluate(() => {
  const r = TT.generate(UI.state, { seed: 7, improveMs: 3000 });
  UI.state.placements = r.placements; UI.lastGen = Object.assign({ at: '2026-10-26T07:44:00+08:00', mode: 'worker' }, r);
  UI.save(); UI.render();
});
await shot(p, 'jadual-siap', { chip: '.toolbar-card .chip-s', metric: '.phead .metric', grid: 'table.grid', banner: '.banner', jana: 'button[data-act="generate"]', head: '.phead', tabs: '.phead .seg.sub' });

// 5. Laras: seret dalam paparan guru (banyak slot kosong, petak hijau jelas)
await p.evaluate(() => { UI.view = { type: 'teacher', id: UI.state.teachers.find((t) => t.short === 'AMY').id }; UI.render(); });
const mv = await p.evaluate(() => {
  const s = UI.state, empties = [...document.querySelectorAll('td.cell.empty[data-day]:not(.unav)')];
  let best = null, bestScore = -1;
  for (const td of document.querySelectorAll('td.cell.filled[data-unit]')) {
    const u = td.dataset.unit, pl = s.placements.find((x) => x.unit === u);
    if (pl.len !== 1) continue;
    const ok = empties.filter((e) => TT.checkPlacement(s, u, +e.dataset.day, +e.dataset.p).ok);
    for (const e of ok) {
      const dd = Math.abs(+e.dataset.day - pl.day), dp = Math.abs(+e.dataset.p - pl.start);
      const sc = ok.length * 2 + (dd >= 1 && dd <= 2 ? 10 : 0) - dp * 2;
      if (sc > bestScore) { bestScore = sc; best = { u, day: +e.dataset.day, p: +e.dataset.p, ok: ok.map((x) => [x.dataset.day, x.dataset.p]) }; }
    }
  }
  return best;
});
const srcSel = `td.cell.filled[data-unit="${mv.u}"]`, dstSel = `td.cell.empty[data-day="${mv.day}"][data-p="${mv.p}"]`;
await shot(p, 'jadual-guru', { src: srcSel, dst: dstSel, grid: 'table.grid', head: '.phead' });
await p.evaluate(({ mv, srcSel }) => {
  document.querySelector(srcSel).classList.add('dragging');
  mv.ok.forEach(([d, pp]) => document.querySelector(`td.cell.empty[data-day="${d}"][data-p="${pp}"]`).classList.add('ok'));
}, { mv, srcSel });
await shot(p, 'jadual-drag', { src: srcSel, dst: dstSel, grid: 'table.grid' });
await p.evaluate((mv) => { TT.applyMove(UI.state, mv.u, mv.day, mv.p); TT.toggleLock(UI.state, mv.u); UI.save(); UI.render(); }, mv);
await shot(p, 'jadual-lepas', { moved: srcSel, lock: `${srcSel} .cbtn`, grid: 'table.grid' });
// paparan induk dan cetak
await p.evaluate(() => { UI.view = { type: 'mclass', id: null }; UI.render(); });
await shot(p, 'jadual-induk', { tabs: '.phead .seg.sub', print: 'button[data-act="printView"]', grid: 'table.grid.master', head: '.phead' });

// 6. Relief
await p.setViewportSize({ width: 1280, height: 1300 });
await p.evaluate(() => { UI.page = 'relief'; UI.relief.tab = 'harian'; UI.relief.date = '2026-10-26'; UI.render(); });
await shot(p, 'relief-kosong', { tambah: '.toolbar button[data-act="absenceAdd"]', head: '.phead', date: 'input[data-chg="reliefDate"]' });
await p.click('.toolbar button[data-act="absenceAdd"]');
const amy = await p.evaluate(() => UI.state.teachers.find((t) => t.short === 'AMY').id);
await p.selectOption('#theForm select[name="teacherId"]', amy);
await tag(p, () => {
  const f = document.getElementById('theForm');
  f.querySelector('[name="teacherId"]').closest('.fld').dataset.shot = 'guru';
  f.querySelector('[name="reason"]').closest('.fld').dataset.shot = 'sebab';
});
await shot(p, 'relief-borang', { dlg: '.dialog', guru: '[data-shot=guru]', sebab: '[data-shot=sebab]', simpan: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await p.evaluate(() => {
  const s = UI.state;
  s.absences.push({ id: 'zka', date: '2026-10-26', teacherId: s.teachers.find((t) => t.short === 'ZKA').id, from: 2, to: 5, reason: 'Kursus / Bengkel', note: '' });
  UI.save(); UI.render();
});
await shot(p, 'relief-perlu', { auto: 'button[data-act="reliefAuto"]', table: 'table.relief', head: '.phead', metric: '.phead .metric' });
await p.click('button[data-act="reliefAuto"]');
await tag(p, () => { const rows = document.querySelectorAll('table.relief tbody tr'); rows[0].dataset.shot = 'r1'; rows[1].dataset.shot = 'r2'; });
await shot(p, 'relief-agih', { table: 'table.relief', r1: '[data-shot=r1]', r2: '[data-shot=r2]', why: 'table.relief .why', metric: '.phead .metric', sel: 'table.relief select' });
// slip dan senarai agihan (paparan cetak)
await p.setViewportSize({ width: 1100, height: 1000 });
await p.evaluate(() => UI.actions.reliefPrint());
await p.emulateMedia({ media: 'print' });
await shot(p, 'relief-slip', { sheet: '#printArea .sheet', slips: '#printArea .slips', slip: '#printArea .slip' });
await p.emulateMedia({ media: null });
await p.evaluate(() => { document.body.classList.remove('printing'); document.getElementById('printArea').innerHTML = ''; });
await p.setViewportSize({ width: 1280, height: 1300 });
await p.evaluate(() => { UI.page = 'relief'; UI.render(); });
await p.click('button[data-act="reliefMsg"]');
await shot(p, 'relief-wa', { dlg: '.dialog', ta: '#waText', salin: 'button[data-act="copyMsg"]' });
await p.click('.dlg-f button[data-act="modalClose"]');

// 7. Pantau: sejarah Oktober supaya kalendar dan statistik bermakna
await p.evaluate(() => {
  const s = UI.state;
  let rnd = 11; const r = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const reasons = ['MC', 'Kursus / Bengkel', 'Urusan Rasmi', 'Cuti Rehat', 'MC'];
  TT.schoolDays(s, '2026-10-01', '2026-10-23').forEach((d, i) => {
    const k = 1 + ((r() * 3) | 0);
    s.teachers.slice().sort(() => r() - 0.5).slice(0, k).forEach((t, j) => s.absences.push({ id: `h${i}_${j}`, date: d, teacherId: t.id, from: null, to: null, reason: reasons[(r() * reasons.length) | 0], note: '' }));
    TT.autoRelief(s, d);
  });
  s.absences.push({ id: 'esok', date: '2026-10-27', teacherId: s.teachers.find((t) => t.short === 'KMR').id, from: null, to: null, reason: 'Kursus / Bengkel', note: '' });
  UI.save(); UI.relief.tab = 'kalendar'; UI.relief.month = '2026-10'; UI.render();
});
await tag(p, () => { const c = [...document.querySelectorAll('.mday')].find((x) => x.textContent.includes('BELUM')); if (c) c.dataset.shot = 'belum'; });
await shot(p, 'relief-kalendar', { legend: '.legend-chips', now: '.mday.now', belum: '[data-shot=belum]', cal: '.mcal', head: '.phead' });
await p.evaluate(() => { UI.relief.tab = 'statistik'; UI.relief.from = '2026-10-01'; UI.relief.to = '2026-10-31'; UI.render(); });
await tag(p, () => { document.querySelectorAll('.stats .stat')[3].dataset.shot = 'sd'; });
await shot(p, 'relief-stats', { tiles: '.stats', sd: '[data-shot=sd]', table: 'main section.card .tbl', metric: '.phead .metric' });
await p.setViewportSize({ width: 1280, height: 1300 });
await p.evaluate(() => { UI.page = 'laporan'; UI.render(); });
await tag(p, () => { const c = document.querySelectorAll('main > section.card'); c[1].dataset.shot = 'semakan'; c[2].dataset.shot = 'cetak'; c[3].dataset.shot = 'beban'; });
await shot(p, 'laporan', { head: '.phead', metric: '.phead .metric', semakan: '[data-shot=semakan]', cetak: '[data-shot=cetak]', beban: '[data-shot=beban]', csv: 'button[data-act="exportCsv"]' });

// 8. Pentadbir: dashboard, peranan, simpanan Google Sheets dan pautan guru
await p.setViewportSize({ width: 1280, height: 1150 });
await p.evaluate(() => { UI.page = 'utama'; UI.render(); });
await shot(p, 'dash-admin', { summary: '.summary', gauge: 'svg.gauge', today: '.card.dark.today', acts: '.acts', heat: '.heat', top: '.topbar', role: 'button.role' });
await p.evaluate(() => { UI.menu = 'role'; UI.render(); });
await shot(p, 'role-menu', { role: 'button.role', menu: '.menu', admin: '.menu .mi:nth-of-type(1)', guru: '.menu .mi:nth-of-type(2)', top: '.topbar' });
await p.evaluate(() => { UI.menu = null; });
await p.evaluate(async () => { await UI.sync.push(true); UI.page = 'tetapan'; UI.setTab = 'storan'; UI.render(); });
await tag(p, () => {
  const c = document.querySelectorAll('main > section.card'); c[1].dataset.shot = 'sheet'; c[2].dataset.shot = 'guru'; c[3].dataset.shot = 'backup';
  // alamat pelayan tempatan dan ID ujian tidak sesuai ditayang: papar contoh pautan sebenar yang boleh dibaca
  document.querySelector('.linkbox input').value = 'https://annurprosolutions-cell.github.io/ruztimetable/?g=1Qw8ZkT3mXe0aLpRv5NcB2YdUhJf7GsIoA9tEiMnKx4b';
});
await shot(p, 'storan', { pill: '#syncPill', sheet: '[data-shot=sheet]', guru: '[data-shot=guru]', link: '.linkbox', copy: '.linkbox button', wa: '.linkbox a.btn', backup: '[data-shot=backup]', head: '.phead' });

// kandungan sebenar Google Sheet sekolah (untuk adegan "data dalam Sheet sendiri")
const gid = await p.evaluate(() => UI.state.school.guruSheet);
const sheetId = [...fake.db.keys()].find((k) => k !== gid);
const book = fake.db.get(sheetId);
// lajur yang boleh dibaca manusia sahaja (bukan ID dalaman)
const pick = (rows, names, n) => {
  const h = rows[0].map(String), idx = names.map((x) => h.indexOf(x)).filter((i) => i >= 0);
  return rows.slice(0, n).map((r) => idx.map((i) => (r[i] == null ? '' : String(r[i])).slice(0, 30)));
};
fs.writeFileSync(path.join(OUT, 'sheet.js'), 'window.SHEET = ' + JSON.stringify({
  title: book.title, tabs: [...book.tabs.keys()],
  guru: pick(book.tabs.get('Guru'), ['nama', 'kod', 'panitia', 'had_sehari', 'had_seminggu', 'kecuali_relief'], 10),
  jadual: pick(book.tabs.get('Jadual'), ['hari (rujukan)', 'masa (rujukan)', 'pelajaran (rujukan)', 'panjang', 'dikunci'], 10)
}) + ';\n');
const dbg = { sheetId, gid, tabs: [...book.tabs.keys()] };
console.log('sheet', dbg);

// ================= guru (telefon) =================
// pautan guru sebenar: pergi ke ?g=<ID Sheet Data Guru>, pilih nama, baca sahaja
const me = await p.evaluate(() => UI.state.reliefs.find((x) => x.date === '2026-10-26' && x.status === 'assigned').reliefTeacherId);
const meName = await p.evaluate((id) => UI.state.teachers.find((t) => t.id === id).name, me);
// pelayar tanpa kepala menyekat notifikasi; tunjuk keadaan "belum dihidupkan" seperti telefon sebenar
const g = await open({ width: 412, height: 1500 }, 3, { url: 'index.html?g=' + gid, init: () => { Object.defineProperty(Notification, 'permission', { get: () => 'default' }); } });
await g.waitForSelector('.gate .pickbtn');
await g.fill('#gQ', meName.split(' ')[0].toLowerCase().slice(0, 3)).catch(() => {});
await shot(g, 'guru-gate', { card: CARD, list: '.gpick', first: '.gpick .pickbtn:not([hidden])', top: '.gbrand' }, { mobile: true });
await g.click(`.gate .pickbtn[data-id="${me}"]`);
await g.waitForSelector('header.topbar');
await g.evaluate(() => { UI.pwa.ios = true; UI.render(); });
await shot(g, 'guru-dash', { alert: '.alert', slip: '.alert button', today: '.card.dark.today', rel: '.drow.rel', top: '.topbar', pwa: '.card.pwa', install: '.card.pwa button[data-act="install"]', notify: '.card.pwa button[data-act="notifyEnable"]' }, { mobile: true });
await g.evaluate(() => { UI.page = 'jadualku'; UI.render(); });
await shot(g, 'guru-jadual', { head: '.phead', grid: 'table.grid', print: 'button[data-act="printMine"]' }, { mobile: true });
await g.evaluate(() => { UI.page = 'reliefku'; UI.render(); });
await shot(g, 'guru-relief', { head: '.phead', first: 'main > section.card:nth-of-type(2)', fair: '.fair' }, { mobile: true });

const errs = [...p.errors, ...g.errors];
fs.writeFileSync(path.join(OUT, 'manifest.js'), 'window.MANIFEST = ' + JSON.stringify(M, null, 1) + ';\n');
await browser.close();
server.close();
console.log('siap:', Object.keys(M).length, 'shot', errs.length ? 'RALAT HALAMAN: ' + errs.join(' | ') : '');
