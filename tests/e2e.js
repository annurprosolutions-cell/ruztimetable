// Ujian hujung-ke-hujung dalam Chromium. Jalankan: npm i playwright && node tests/e2e.js
// Jam pelayar ditetapkan pada Isnin 26/10/2026 07:45 (waktu Malaysia) supaya keputusan tidak bergantung pada tarikh sebenar.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const assert = require('assert');
const { fakeSheets } = require('./helpers/fake-sheets.js');
const { createEnv } = require('./helpers/appscript-mock.js');

const ROOT = path.resolve(__dirname, '..');
const FIXED = new Date('2026-10-26T07:45:00+08:00');
const MON = '2026-10-26';
const SHOTS = process.env.SHOTS || '';
const step = (m) => console.log('  ok  ' + m);

async function open(b, url, setup, extra) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1360, height: 1500 }, timezoneId: 'Asia/Kuala_Lumpur', acceptDownloads: true }, extra || {}));
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(FIXED);
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // ujian tidak boleh menulis ke Google Sheet sebenar: semua permintaan Apps Script digagalkan kecuali ujian survey memasang route sendiri
  await pg.route('https://script.google.com/**', (r) => r.abort());
  await pg.addInitScript(() => {
    window.print = () => { window.__printed = document.getElementById('printArea').innerHTML; window.dispatchEvent(new Event('afterprint')); };
  });
  if (setup) await setup(pg);
  await pg.goto(url);
  const st = () => pg.evaluate(() => JSON.parse(JSON.stringify(UI.state)));
  return { pg, ctx, errors, st };
}

async function adminAndGuru(b) {
  console.log('Pentadbir (file://)');
  const { pg, errors, st } = await open(b, 'file://' + path.join(ROOT, 'index.html'));
  const shot = (n) => (SHOTS ? pg.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);

  // kali pertama: skrin log masuk, tetapan awal pentadbir (tanpa Google kerana file://)
  assert.ok(await pg.locator('.gate').count());
  assert.strictEqual(await pg.locator('header.topbar').count(), 0);
  await pg.click('[data-act="gateGo"][data-s="admin"]');
  await pg.click('[data-act="gateNext"]');
  assert.match(await pg.textContent('.gate .err'), /nama sekolah/);
  await pg.fill('#wName', 'SMK Ujian');
  await pg.click('[data-act="gateNext"]');
  await pg.fill('#wPw', 'abc'); await pg.fill('#wPw2', 'abc');
  await pg.click('[data-act="gateNext"]');
  assert.match(await pg.textContent('.gate .err'), /sekurang-kurangnya/);
  await pg.fill('#wPw', 'rahsia123'); await pg.fill('#wPw2', 'rahsia123');
  await pg.click('[data-act="gateNext"]');
  await pg.check('input[name="wData"][value="kosong"]');
  await pg.click('[data-act="gateNext"]');
  await pg.waitForSelector('header.topbar');
  assert.strictEqual(await pg.evaluate(() => UI.page), 'data');
  assert.ok(await pg.evaluate(() => TT.validHash(UI.state.auth.admin) && !JSON.stringify(UI.state).includes('rahsia123')));
  step('skrin log masuk + tetapan awal: nama sekolah, kata laluan (disahkan, disimpan sebagai hash), mula kosong');

  await pg.click('nav button[data-p="utama"]');
  assert.ok(await pg.locator('.card.dark.today', { hasText: 'Selamat datang' }).count());
  await pg.click('.card.dark.today button[data-act="loadSample"]');
  assert.strictEqual((await st()).teachers.length, 18);
  assert.ok((await st()).auth, 'kata laluan kekal selepas muat data contoh');
  step('kad selamat datang + muat data contoh (kata laluan kekal)');

  await pg.click('nav button[data-p="jadual"]');
  await pg.click('button[data-act="generate"]');
  await pg.selectOption('#gEffort', '2000');
  await pg.click('button[data-act="genStart"]');
  await pg.waitForFunction(() => UI.lastGen && !document.querySelector('.overlay'), null, { timeout: 60000 });
  let s = await st();
  assert.strictEqual(s.placements.length, 243);
  assert.strictEqual(await pg.evaluate(() => TT.validate(UI.state).issues.filter((i) => i.sev === 'error').length), 0);
  assert.strictEqual(await pg.evaluate(() => UI._lastRunMode), 'worker');
  step('jana jadual dalam Web Worker: 243/243, tiada konflik');

  const mv = await pg.evaluate(() => {
    const s = UI.state, m = TT.maps(s), cls = UI.view.id;
    const mine = s.placements.filter((p) => m.lesson.get(p.lessonId).classIds.includes(cls));
    for (const e of document.querySelectorAll('td.cell.empty[data-day]')) for (const p of mine) {
      if (p.len === 1 && !p.locked && TT.checkPlacement(s, p.unit, +e.dataset.day, +e.dataset.p).ok) return { unit: p.unit, day: +e.dataset.day, p: +e.dataset.p };
    }
    return null;
  });
  assert.ok(mv, 'tiada gerakan sah');
  await pg.dragAndDrop(`td.cell.filled[data-unit="${mv.unit}"]`, `td.cell.empty[data-day="${mv.day}"][data-p="${mv.p}"]`);
  const moved = (await st()).placements.find((p) => p.unit === mv.unit);
  assert.deepStrictEqual([moved.day, moved.start], [mv.day, mv.p]);
  step('seret-dan-lepas ke petak kosong');

  await pg.click('button[data-act="tab"][data-k="teacher"]');
  const kmr = await pg.evaluate(() => UI.state.teachers.find((t) => t.short === 'KMR').id);
  await pg.selectOption('select[data-chg="viewId"]', kmr);
  const kmrUnit = await pg.evaluate(() => document.querySelector('td.cell.filled[data-unit]').dataset.unit);
  const snap = JSON.stringify((await st()).placements);
  await pg.dragAndDrop(`td.cell.filled[data-unit="${kmrUnit}"]`, 'td.cell.unav[data-day="0"][data-p="0"]');
  assert.strictEqual(JSON.stringify((await st()).placements), snap);
  assert.ok((await pg.locator('.toast.err').allTextContents()).some((t) => t.includes('tidak boleh mengajar')));
  step('gerakan ke slot "tidak boleh" ditolak');

  await pg.click('button[data-act="tab"][data-k="class"]');
  await pg.hover(`td.cell.filled[data-unit="${mv.unit}"]`);
  await pg.click(`td.cell.filled[data-unit="${mv.unit}"] button[data-act="lock"]`);
  assert.ok((await st()).placements.find((p) => p.unit === mv.unit).locked);
  await pg.click('button[data-act="tab"][data-k="mclass"]');
  assert.strictEqual(await pg.locator('table.grid.master').count(), 1);
  await pg.click('button[data-act="printView"]');
  await pg.waitForFunction(() => window.__printed && (window.__printed || '').includes('Jadual Induk'));
  await pg.click('nav button[data-p="laporan"]');
  await pg.click('button[data-act="printAll"][data-kind="class"]');
  await pg.waitForFunction(() => ((window.__printed || '').match(/class="sheet"/g) || []).length === 9);
  step('kunci, paparan induk, cetak semua kelas (9 helaian)');

  await pg.click('nav button[data-p="relief"]');
  assert.strictEqual(await pg.inputValue('input[data-chg="reliefDate"]'), MON);
  await pg.click('.toolbar button[data-act="absenceAdd"]');
  const amy = await pg.evaluate(() => UI.state.teachers.find((t) => t.short === 'AMY').id);
  await pg.selectOption('#theForm select[name="teacherId"]', amy);
  await pg.click('button[data-act="formSave"]');
  const need = await pg.locator('table.relief tbody tr').count();
  assert.ok(need > 0);
  await pg.click('button[data-act="reliefAuto"]');
  s = await st();
  assert.strictEqual(s.reliefs.filter((r) => r.status === 'assigned').length, need);
  await pg.locator('table.relief tbody tr').first().locator('select').selectOption('kendiri');
  assert.ok((await st()).reliefs.some((r) => r.status === 'kendiri'));
  await pg.click('button[data-act="reliefPrint"]');
  await pg.waitForFunction(() => (window.__printed || '').includes('SLIP GURU GANTI'));
  await pg.click('button[data-act="reliefMsg"]');
  const msg = await pg.inputValue('#waText');
  assert.ok(msg.includes('26/10/2026') && msg.includes('Aminah Yusof'));
  await pg.click('.dlg-f button[data-act="modalClose"]');
  step(`relief: ${need} blok diagih, tukar manual, slip, WhatsApp`);

  await pg.click('.toolbar button[data-act="absenceAdd"]');
  await pg.selectOption('#theForm select[name="teacherId"]', kmr);
  await pg.fill('#theForm input[name="date"]', '2026-10-30');
  await pg.fill('#theForm input[name="dateTo"]', '2026-11-03');
  await pg.click('button[data-act="formSave"]');
  assert.deepStrictEqual((await st()).absences.filter((a) => a.teacherId === kmr).map((a) => a.date).sort(), ['2026-10-30', '2026-11-02', '2026-11-03']);
  step('cuti berbilang hari melangkau hujung minggu');

  await pg.click('button[data-act="tab"][data-k="kalendar"]');
  const cell = pg.locator('.mday.now');
  assert.ok((await cell.textContent()).includes('SELESAI'));
  assert.ok(await pg.locator('.mday', { hasText: 'BELUM' }).count() >= 1); // 30/10 belum diagih
  await cell.click();
  assert.strictEqual(await pg.evaluate(() => UI.relief.tab), 'harian');
  await pg.click('button[data-act="tab"][data-k="statistik"]');
  assert.ok(await pg.locator('table.tbl tbody tr').count() >= 18);
  step('kalendar relief (SELESAI/BELUM, klik ke harian) + statistik');

  await pg.click('nav button[data-p="data"]');
  await pg.click('button[data-act="add-guru"]');
  await pg.fill('#theForm input[name="name"]', 'Cikgu Ujian Baharu');
  await pg.click('#theForm td.av[data-k="0-0"]');
  await pg.click('button[data-act="formSave"]');
  const nt = (await st()).teachers.find((t) => t.name === 'Cikgu Ujian Baharu');
  assert.ok(nt && nt.short && nt.unavailable['0-0']);
  await pg.click('button[data-act="tab"][data-k="pelajaran"]');
  const nL = (await st()).lessons.length;
  await pg.click('button[data-act="add-pelajaran"]');
  await pg.locator('[data-wz-cls]').first().check();
  await pg.click('button[data-act="wzSave"]');
  assert.strictEqual((await st()).lessons.length, nL + 1);
  step('data: tambah guru (slot tak boleh) dan pelajaran');

  await pg.click('nav button[data-p="tetapan"]');
  const png = Buffer.from(await pg.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d');
    const im = g.createImageData(600, 400); let x = 12345;
    for (let i = 0; i < im.data.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; im.data[i] = i % 4 === 3 ? 255 : (x >> 8) & 255; }
    g.putImageData(im, 0, 0);
    const b = await new Promise((r) => c.toBlob(r, 'image/png')); return [...new Uint8Array(await b.arrayBuffer())];
  }));
  assert.ok(png.length > 45000, 'logo ujian sengaja besar untuk menguji pengecilan');
  await pg.setInputFiles('#logoFile', { name: 'logo.png', mimeType: 'image/png', buffer: png });
  await pg.waitForFunction(() => TT.validLogo(UI.state.school.logo));
  assert.ok(await pg.evaluate(() => UI.state.school.logo.length) <= 45000);
  assert.ok(await pg.locator('.topbar .mark.logo img').count());
  assert.ok(await pg.evaluate(() => document.getElementById('favicon').href.startsWith('data:image/')));
  await pg.setInputFiles('#logoFile', { name: 'bukan.txt', mimeType: 'text/plain', buffer: Buffer.from('hai') });
  assert.ok((await pg.locator('.toast.err').allTextContents()).some((t) => t.includes('mesti imej')));
  await pg.click('button.swatch[data-c="#0f766e"]');
  assert.strictEqual(await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()), '#0f766e');
  assert.strictEqual((await st()).school.color, '#0f766e');
  await pg.click('nav button[data-p="jadual"]');
  await pg.click('button[data-act="printView"]');
  await pg.waitForFunction(() => /class="shead"><img/.test(window.__printed || ''));
  await pg.click('nav button[data-p="tetapan"]');
  step('branding: logo besar dikecilkan <=45k aksara, fail bukan imej ditolak, warna dan kepala cetakan');
  await pg.selectOption('select[data-chg="weekMode"]', 'sun-thu');
  assert.strictEqual((await st()).school.weekMode, 'sun-thu');
  await pg.selectOption('select[data-chg="weekMode"]', 'mon-fri');
  await pg.click('button[data-act="tab"][data-k="storan"]');
  assert.ok(await pg.locator('text=/belum diaktifkan|hanya berfungsi bila app dibuka/').count());
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.card button[data-act="exportJson"]')]);
  assert.match(dl.suggestedFilename(), /\.json$/);
  assert.ok(await pg.evaluate(() => UI.prefs.lastBackup));
  step('tetapan minggu, storan (Sheets tidak tersedia pada file://), eksport JSON');

  await pg.click('nav button[data-p="utama"]');
  assert.ok(await pg.locator('.card.dark.today h2', { hasText: 'Hari ini' }).count());
  assert.ok(await pg.locator('.card.dark.today .drow').count() >= 1);
  assert.ok(await pg.locator('svg.gauge').count());
  await shot('e2e-dash-admin');
  await pg.click('button[data-act="menu"][data-m="bell"]');
  assert.strictEqual(await pg.locator('.menu').count(), 1);
  await pg.click('main', { position: { x: 5, y: 5 } });
  assert.strictEqual(await pg.locator('.menu').count(), 0);
  step('dashboard pentadbir + menu notifikasi buka/tutup');

  const pp = await pg.context().newPage();
  await pp.goto('file://' + path.join(ROOT, 'privasi.html'));
  assert.ok((await pp.textContent('body')).includes('drive.file'));
  const noMail = /email:\s*''/.test(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'));
  assert.strictEqual(await pp.isVisible('#warn'), noMail, 'amaran e-mel sokongan kelihatan hanya bila config tiada e-mel');
  await pp.close();
  step('halaman privasi dimuat, amaran e-mel sokongan ikut config');

  await pg.reload();
  assert.strictEqual((await st()).teachers.length, 19);
  step('data kekal selepas muat semula');

  console.log('Guru');
  const rec = (await st()).reliefs.find((r) => r.status === 'assigned' && r.date === MON);
  const tname = await pg.evaluate((id) => UI.state.teachers.find((t) => t.id === id).name, rec.reliefTeacherId);
  await pg.click('button[data-act="menu"][data-m="role"]');
  await pg.click('button[data-act="setRole"][data-r="guru"]');
  assert.ok(await pg.locator('.pick').count());
  await pg.selectOption('select[data-chg="setMeSel"]', rec.reliefTeacherId);
  assert.ok((await pg.locator('.alert').textContent()).includes('tugas relief'));
  assert.ok(await pg.locator('.drow.rel').count() >= 1);
  assert.deepStrictEqual(await pg.locator('nav.seg.main button').allTextContents(), ['Utama', 'Jadual saya', 'Relief saya', 'Bantuan']);
  await shot('e2e-dash-guru');
  await pg.click('.alert button[data-act="mySlip"]');
  await pg.waitForFunction((n) => (window.__printed || '').includes('SLIP GURU GANTI') && (window.__printed || '').includes(n), tname);
  await pg.click('nav button[data-p="jadualku"]');
  assert.ok(await pg.locator('table.grid').count());
  await pg.click('button[data-act="printMine"]');
  await pg.waitForFunction(() => (window.__printed || '').includes('Jadual Waktu Guru'));
  await pg.click('nav button[data-p="reliefku"]');
  assert.ok(await pg.locator('.act-item').count() >= 1);
  await pg.click('button[data-act="tab"][data-k="sejarah"]');
  assert.ok(await pg.locator('table.tbl tbody tr').count() >= 1);
  await pg.click('nav button[data-p="bantuan"]');
  assert.ok(await pg.locator('details.faq').count() >= 5);
  await pg.setViewportSize({ width: 412, height: 900 });
  await pg.click('nav button[data-p="utama"]');
  const yR = (await pg.locator('.dash > .col-r').boundingBox()).y, yL = (await pg.locator('.dash > .col-l').boundingBox()).y;
  assert.ok(yR < yL, 'di telefon, "Hari ini" patut di atas');
  await pg.click('button[data-act="menu"][data-m="role"]');
  await pg.click('button[data-act="setRole"][data-r="admin"]');
  step('pratonton guru (pentadbir): dashboard, slip, jadual saya, relief saya, bantuan, susunan telefon');

  // log keluar: masuk semula perlu kata laluan
  await pg.setViewportSize({ width: 1360, height: 1500 });
  await pg.click('button.avatar');
  await pg.click('[data-act="logout"]');
  assert.ok(await pg.locator('.gate').count());
  await pg.reload();
  assert.ok(await pg.locator('.gate').count(), 'tiada sesi selepas log keluar');
  assert.ok((await pg.textContent('.gbrand')).includes('SMK Contoh Jaya'));
  await pg.click('[data-act="gateGo"][data-s="admin"]');
  await pg.fill('#gPw', 'salah123');
  await pg.click('[data-act="gatePw"]');
  await pg.waitForSelector('.gate .err');
  assert.match(await pg.textContent('.gate .err'), /salah/);
  await pg.fill('#gPw', 'rahsia123');
  await pg.press('#gPw', 'Enter');
  await pg.waitForSelector('header.topbar');
  step('log keluar, kata laluan salah ditolak, betul diterima (Enter)');

  // guru: tanpa kata laluan, pilih nama, baca sahaja
  await pg.click('button.avatar');
  await pg.click('[data-act="logout"]');
  await pg.click('[data-act="gateGo"][data-s="guru"]');
  await pg.fill('#gQ', 'aminah');
  assert.strictEqual(await pg.locator('.gate .pickbtn:visible').count(), 1);
  await pg.click('.gate .pickbtn:visible');
  await pg.waitForSelector('header.topbar');
  assert.deepStrictEqual(await pg.locator('nav.seg.main button').allTextContents(), ['Utama', 'Jadual saya', 'Relief saya', 'Bantuan']);
  const before = await pg.evaluate(() => localStorage.getItem(UI.KEY));
  await pg.evaluate(() => { UI.state.school.name = 'DIUBAH'; UI.save(); });
  assert.strictEqual(await pg.evaluate(() => localStorage.getItem(UI.KEY)), before, 'guru tidak boleh menulis data');
  await pg.click('button[data-act="menu"][data-m="role"]');
  assert.strictEqual(await pg.locator('[data-act="setRole"]').count(), 0);
  await pg.click('[data-act="adminLogin"]');
  assert.ok(await pg.locator('#gPw').count(), 'tukar ke pentadbir perlu kata laluan');
  await pg.click('[data-act="gateGo"][data-s="role"]');
  await pg.click('[data-act="gateGo"][data-s="guru"]');
  await pg.click('.gate .pickbtn >> nth=0');
  await pg.reload();
  assert.ok(await pg.locator('header.topbar').count(), 'sesi guru kekal selepas muat semula');
  assert.strictEqual(await pg.evaluate(() => UI.readOnly), true);
  step('guru: pilih nama (carian), menu terhad, baca sahaja, tukar ke pentadbir perlu kata laluan, sesi kekal');

  assert.deepStrictEqual(errors, []);
}

async function sheetsFlow(b) {
  console.log('Google Sheets (localhost, Google dimock)');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const fake = fakeSheets('tok-e2e');
  const { handle } = await import(path.join(ROOT, 'worker/index.mjs'));
  const lic = new Map();
  const licEnv = { LICENSES: { get: async (k) => lic.get(k) || null, put: async (k, v) => { lic.set(k, v); }, delete: async (k) => { lic.delete(k); }, list: async () => ({ keys: [...lic.keys()].map((name) => ({ name })), list_complete: true }) },
    ADMIN_TOKEN: 'adm', GOOGLE_CLIENT_ID: 'ujian.apps.googleusercontent.com', ALLOWED_ORIGINS: `http://127.0.0.1:${server.address().port}`, TRIAL_DAYS: '0' };
  const tokeninfo = async () => ({ ok: true, json: async () => ({ email: 'pentadbir@moe-dl.edu.my', email_verified: 'true', aud: 'ujian.apps.googleusercontent.com' }) });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  const shared = new Set();
  const json = (route, body) => route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(body) });
  // Google Drive (kongsi pautan, cari Sheet) dan gviz CSV awam untuk Data Guru
  const googleExtra = async (page) => {
    await page.route('https://www.googleapis.com/drive/v3/**', async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.headers().authorization !== 'Bearer tok-e2e') return route.fulfill({ status: 401, headers: cors, body: '{}' });
      const pm = u.pathname.match(/\/files\/([^/]+)\/permissions$/);
      if (pm && req.method() === 'POST') { shared.add(pm[1]); return json(route, { id: 'anyoneWithLink' }); }
      if (u.pathname.endsWith('/files')) return json(route, { files: [...fake.db.entries()].filter(([, v]) => v.title.includes('Jadual Sekolah')).map(([id, v]) => ({ id, name: v.title, modifiedTime: '2026-10-26T00:00:00Z' })) });
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.route('https://docs.google.com/spreadsheets/d/**', async (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[3], book = fake.db.get(id);
      if (!book || !shared.has(id)) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/html' }, cors), body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
      const csv = (book.tabs.get('Data') || []).map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/csv' }, cors), body: csv });
    });
  };
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const mocks = async (page) => {
      await page.route('**/config.js', async (route) => {
        const body = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace("googleClientId: ''", "googleClientId: 'ujian.apps.googleusercontent.com'").replace("licenseUrl: ''", "licenseUrl: 'https://lesen.test'");
        await route.fulfill({ status: 200, contentType: 'text/javascript', body });
      });
      await page.addInitScript(() => {
        window.google = { accounts: { oauth2: {
          initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'tok-e2e', expires_in: 3600 }), 20) }),
          revoke: (t, cb) => { if (cb) cb(); }
        } } };
      });
      await page.route('https://sheets.googleapis.com/**', async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const r = await fake.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
        return route.fulfill({ status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(await r.json()) });
      });
      await page.route('https://lesen.test/**', async (route) => {
        const r = route.request();
        const res = await handle(new Request(r.url(), { method: r.method(), headers: r.headers() }), licEnv, { fetch: tokeninfo });
        const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
        return route.fulfill({ status: res.status, headers: h, body: await res.text() });
      });
      await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => (route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ email: 'pentadbir@moe-dl.edu.my' }) })));
      await googleExtra(page);
    };
    // service worker disekat dalam ujian supaya mock rangkaian Playwright berkuat kuasa
    const NOSW = { serviceWorkers: 'block' };
    const { pg, errors, st } = await open(b, base + 'index.html', mocks, NOSW);
    // skrin log masuk: Google dahulu; belum berlesen -> teruskan tanpa Sheets
    await pg.click('[data-act="gateGo"][data-s="admin"]');
    await pg.click('[data-act="gateGoogle"]');
    await pg.waitForSelector('.gate .err');
    assert.match(await pg.textContent('.gate .err'), /belum berlesen/);
    await pg.click('[data-act="gateLocal"]');
    await pg.fill('#wName', 'SMK Awan'); await pg.click('[data-act="gateNext"]');
    await pg.fill('#wPw', 'rahsia123'); await pg.fill('#wPw2', 'rahsia123'); await pg.click('[data-act="gateNext"]');
    await pg.check('input[name="wData"][value="kosong"]'); await pg.click('[data-act="gateNext"]');
    await pg.waitForSelector('header.topbar');
    assert.strictEqual(fake.db.size, 0);
    step('log masuk: Google -> semakan lesen gagal -> teruskan setempat dengan tetapan awal');
    await pg.click('nav button[data-p="utama"]');
    await pg.click('.card.dark.today button[data-act="loadSample"]');
    await pg.evaluate(() => { UI.state.placements = TT.generate(UI.state, { seed: 2, improveMs: 100 }).placements; UI.save(); UI.render(); });
    await pg.click('nav button[data-p="tetapan"]');
    await pg.click('button[data-act="tab"][data-k="storan"]');
    await pg.evaluate(() => UI.sync.setStatus('off')); // status 'unlicensed' dari skrin log masuk; tunggu semakan baharu selesai
    await pg.click('button[data-act="syncSignIn"]');
    await pg.waitForFunction(() => UI.sync.signedIn());
    await pg.waitForSelector('text=pentadbir@moe-dl.edu.my', { timeout: 10000 });
    // belum berlesen: simpanan awan disekat, penggunaan tempatan tidak
    await pg.waitForFunction(() => UI.sync.status === 'unlicensed');
    assert.ok(await pg.locator('text=belum berlesen').count());
    assert.strictEqual(await pg.locator('button[data-act="syncCreate"]').count(), 0);
    assert.strictEqual(await pg.evaluate(() => UI.sync.licensed()), false);
    assert.strictEqual(await pg.locator('#syncPill').count(), 0);
    assert.strictEqual(fake.db.size, 0, 'tiada Sheet dicipta tanpa lesen');
    await pg.evaluate(() => UI.sync.push(true));
    assert.strictEqual(fake.db.size, 0);
    step('tanpa lesen: butang cipta Sheet tiada, push disekat, tiada Sheet dicipta');
    await handle(new Request('https://w.test/admin/licenses', { method: 'POST', headers: { authorization: 'Bearer adm', 'content-type': 'application/json' }, body: JSON.stringify({ domain: 'moe-dl.edu.my', school: 'SMK Pilot', plan: 'pilot', expires: '2027-12-31' }) }), licEnv);
    await pg.click('button[data-act="syncSignIn"]');
    await pg.waitForFunction(() => UI.sync.licensed());
    await pg.waitForSelector('text=SMK Pilot');
    step('lesen didaftar (domain), semak semula berjaya');
    await pg.click('button[data-act="syncCreate"]');
    await pg.waitForFunction(() => UI.prefs.sheet && UI.sync.status === 'saved');
    const book = [...fake.db.values()][0];
    assert.strictEqual(book.tabs.get('Guru').length, 19);
    assert.strictEqual(book.tabs.get('Jadual').length, 244);
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Disimpan');
    assert.ok(/^pbkdf2-sha256\$/.test(book.tabs.get('Sekolah').find((r) => r[0] === 'kata_laluan_pentadbir')[1]));
    step('log masuk (mock), cipta Sheet, data ditulis: 18 guru, 243 waktu, hash kata laluan');
    const gid = await pg.evaluate(() => UI.state.school.guruSheet);
    const gbook = fake.db.get(gid);
    assert.ok(gbook && gbook.title.includes('Jadual Guru'), 'Sheet Data Guru dicipta');
    assert.ok(shared.has(gid), 'Data Guru dikongsi melalui pautan');
    assert.ok(!shared.has([...fake.db.keys()][0]), 'Sheet utama kekal peribadi');
    const blob = gbook.tabs.get('Data').map((r) => r[0]);
    assert.strictEqual(blob[0], 'jadual-guru-v1');
    assert.ok(!blob.join('').includes('pbkdf2'), 'tiada hash kata laluan dalam Data Guru');
    assert.ok(await pg.locator('.linkbox input').count());
    const glink = await pg.inputValue('.linkbox input');
    assert.ok(glink.endsWith('?g=' + gid), glink);
    step('Sheet Data Guru: dicipta, dikongsi (pautan), tanpa hash, pautan guru dipaparkan');

    await pg.click('button[data-act="tab"][data-k="sekolah"]');
    await pg.fill('input[data-chg="schoolName"]', 'SMK Autosave');
    await pg.press('input[data-chg="schoolName"]', 'Tab');
    await pg.waitForFunction(() => UI.sync.status === 'pending');
    await pg.waitForFunction(() => UI.sync.status === 'saved', null, { timeout: 15000 });
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Autosave');
    step('autosave selepas perubahan (debounce 2.5s)');

    const meta = book.tabs.get('Meta');
    meta[2][1] = '2026-10-26T01:00:00.000Z'; meta[3][1] = 'peranti-lain';
    book.tabs.get('Sekolah')[1][1] = 'SMK Dari Sheet';
    await pg.fill('input[data-chg="schoolName"]', 'SMK Tempatan');
    await pg.press('input[data-chg="schoolName"]', 'Tab');
    await pg.waitForFunction(() => UI.sync.status === 'conflict', null, { timeout: 15000 });
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Dari Sheet', 'konflik tidak sepatutnya menulis ganti Sheet');
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Konflik data');
    await pg.click('button[data-act="tab"][data-k="storan"]');
    await pg.click('button[data-act="syncConflict"]');
    await pg.click('button[data-act="syncResolvePull"]');
    await pg.waitForFunction(() => UI.state.school.name === 'SMK Dari Sheet' && UI.sync.status === 'saved');
    assert.strictEqual((await st()).teachers.length, 18);
    step('konflik dari peranti lain dikesan, Sheet tidak ditulis ganti, muat dari Sheet');

    // ---- token Google tamat selepas ~1 jam: pill tidak boleh kekal "Disimpan" ----
    await pg.clock.setFixedTime(new Date(FIXED.getTime() + 2 * 3600e3));
    await pg.evaluate(() => UI.sync.checkSession());
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Sambung semula');
    await pg.evaluate(() => { UI.state.school.name = 'SMK Ubah Tanpa Sesi'; UI.save(); });
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Sambung untuk simpan');
    assert.notStrictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Ubah Tanpa Sesi', 'tiada penulisan tanpa token');
    await pg.click('#syncPill');
    await pg.waitForFunction(() => UI.sync.status === 'saved' && !UI.prefs.sheet.dirty);
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Ubah Tanpa Sesi', 'perubahan tertangguh dihantar selepas sambung semula');
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Disimpan');
    step('token tamat: pill jadi "Sambung untuk simpan", perubahan tertangguh dihantar selepas sambung semula');

    // ---- dua tab pada pelayar yang sama (deviceId sama): tulisan tab lain mesti dikesan ----
    const tab2 = await pg.context().newPage();
    const tab2Errors = [];
    tab2.on('pageerror', (e) => tab2Errors.push(e.message));
    await tab2.clock.setFixedTime(new Date(FIXED.getTime() + 2 * 3600e3));
    await tab2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await mocks(tab2);
    await tab2.goto(base + 'index.html');
    await tab2.waitForSelector('header.topbar');
    assert.strictEqual(await tab2.evaluate(() => UI.sync.signedIn()), true, 'tab kedua berkongsi token');
    await tab2.clock.setFixedTime(new Date(FIXED.getTime() + 2 * 3600e3 + 60e3)); // jam dibekukan: pastikan cap masa tulisan berbeza
    await tab2.evaluate(() => { UI.state.school.name = 'SMK Dari Tab Kedua'; UI.save(); });
    await tab2.waitForFunction(() => UI.sync.status === 'saved');
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Dari Tab Kedua');
    await pg.evaluate(() => UI.sync.refresh());
    await pg.waitForFunction(() => UI.state.school.name === 'SMK Dari Tab Kedua');
    assert.ok(await pg.locator('.toast', { hasText: 'dikemas kini daripada Google Sheets' }).count());
    await tab2.close();
    assert.deepStrictEqual(tab2Errors, []);
    step('dua tab, pelayar sama: tulisan tab kedua dikesan dan ditarik oleh tab pertama (tiada timpa senyap)');

    // ---- peranti lain menyimpan versi baharu: app menarik tanpa perlu klik ----
    const meta2 = book.tabs.get('Meta');
    meta2[2][1] = '2026-10-26T03:00:00.000Z'; meta2[3][1] = 'peranti-lain.aaaa';
    book.tabs.get('Sekolah')[1][1] = 'SMK Dari Peranti Lain';
    await pg.evaluate(() => UI.sync.refresh());
    await pg.waitForFunction(() => UI.state.school.name === 'SMK Dari Peranti Lain');
    // ada perubahan tempatan belum dihantar + Sheet lebih baharu: tanya, jangan timpa
    await pg.evaluate(() => { UI.prefs.sheet.auto = false; UI.state.school.name = 'SMK Perubahan Tempatan'; UI.save(); });
    meta2[2][1] = '2026-10-26T04:00:00.000Z'; meta2[3][1] = 'peranti-lain.bbbb';
    book.tabs.get('Sekolah')[1][1] = 'SMK Dari Peranti Lain 2';
    await pg.evaluate(() => UI.sync.refresh());
    await pg.waitForFunction(() => UI.sync.status === 'conflict');
    assert.match(await pg.textContent('.dlg-h h3'), /tidak selari/i);
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Dari Peranti Lain 2', 'Sheet tidak ditulis ganti');
    await pg.click('button[data-act="syncResolvePull"]');
    await pg.waitForFunction(() => UI.state.school.name === 'SMK Dari Peranti Lain 2' && UI.sync.status === 'saved');
    await pg.evaluate(async () => { UI.prefs.sheet.auto = true; UI.state.school.name = 'SMK Selari'; UI.save(); await UI.sync.push(true); });
    assert.strictEqual(book.tabs.get('Sekolah')[1][1], 'SMK Selari');
    step('Sheet lebih baharu: ditarik automatik; jika ada perubahan tempatan, dialog konflik (tiada timpa senyap)');

    // ---- guru di telefon: buka pautan, pilih nama, notifikasi relief baharu ----
    await pg.evaluate(() => UI.sync.push(true));
    await pg.waitForFunction(() => UI.sync.status === 'saved');
    const T = await pg.evaluate(() => UI.state.teachers.find((t) => t.short === 'KMR').id);
    const notes = [];
    const g = await open(b, glink, async (page) => {
      await googleExtra(page);
      await page.exposeFunction('__note', (t, body) => notes.push([t, body]));
      await page.addInitScript(() => {
        class N { constructor(t, o) { window.__note(t, (o && o.body) || ''); } }
        N.permission = 'granted'; N.requestPermission = async () => 'granted';
        window.Notification = N;
      });
    }, Object.assign({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true }, NOSW));
    await g.pg.waitForSelector('.gate .pickbtn');
    assert.ok((await g.pg.textContent('.gbrand')).includes('SMK Selari'));
    await g.pg.click(`.gate .pickbtn[data-id="${T}"]`);
    await g.pg.waitForSelector('header.topbar');
    assert.strictEqual(await g.pg.evaluate(() => UI.readOnly), true);
    assert.ok(!(await g.pg.evaluate(() => JSON.stringify(UI.state))).includes('pbkdf2'));
    await g.pg.click('.card.pwa button[data-act="notifyEnable"]');
    await g.pg.waitForFunction(() => UI.prefs.notify === true);
    assert.ok(notes.some(([t]) => t === 'Notifikasi dihidupkan'));
    step('guru (telefon): buka pautan tanpa log masuk, pilih nama, baca sahaja, hidupkan notifikasi');

    await pg.evaluate((tid) => {
      const s = UI.state, l = s.lessons.find((x) => !x.teacherIds.includes(tid));
      s.reliefs.push({ id: 'rx1', key: 'kx1', date: '2026-10-28', absentTeacherId: l.teacherIds[0], unitId: '', lessonId: l.id, classIds: l.classIds, subjectId: l.subjectId, periods: [2], status: 'assigned', reliefTeacherId: tid, note: '' });
      return UI.sync.push(true);
    }, T);
    await g.pg.evaluate(() => UI.guruTick(true));
    await g.pg.waitForFunction(() => UI.state.reliefs.some((r) => r.id === 'rx1'));
    assert.ok(notes.some(([t, body]) => t === 'Tugas relief baharu' && body.includes('Rabu 28 Okt')), JSON.stringify(notes));
    const n0 = notes.length;
    await g.pg.evaluate(() => UI.guruTick(true));
    assert.strictEqual(notes.length, n0, 'tiada notifikasi berulang');
    await g.pg.reload();
    await g.pg.waitForSelector('header.topbar');
    assert.deepStrictEqual(g.errors, []);
    await g.ctx.close();
    step('relief baharu diterbitkan -> guru dimaklumkan sekali (Rabu 28 Okt), sesi guru kekal selepas muat semula');

    // ---- pentadbir di peranti baharu: Google -> Sheet dijumpai automatik -> kata laluan ----
    const d = await open(b, base, mocks, NOSW);
    await d.pg.click('[data-act="gateGo"][data-s="admin"]');
    await d.pg.click('[data-act="gateGoogle"]');
    await d.pg.waitForSelector('#gPw');
    assert.ok((await d.pg.textContent('.gate')).includes('pentadbir@moe-dl.edu.my'));
    await d.pg.fill('#gPw', 'rahsia123');
    await d.pg.click('[data-act="gatePw"]');
    await d.pg.waitForSelector('header.topbar');
    assert.strictEqual((await d.st()).teachers.length, 18);
    assert.strictEqual(await d.pg.evaluate(() => UI.prefs.sheet.id), [...fake.db.keys()][0]);
    await d.pg.reload();
    assert.ok(await d.pg.locator('header.topbar').count(), 'sesi pentadbir kekal selepas muat semula');
    assert.strictEqual(await d.pg.evaluate(() => UI.sync.signedIn()), true, 'token Google kekal selepas muat semula');
    assert.strictEqual(await d.pg.locator('#syncPill').textContent(), 'Disimpan');
    assert.deepStrictEqual(d.errors, []);
    await d.ctx.close();
    step('peranti baharu: Google -> Sheet ditemui (Drive) -> kata laluan; sesi dan token kekal selepas muat semula');

    await pg.click('button[data-act="syncUnlink"]');
    await pg.click('button[data-act="confirmYes"]');
    assert.strictEqual(await pg.evaluate(() => UI.prefs.sheet), null);
    step('putuskan sambungan');
    assert.deepStrictEqual(errors, []);

    // ---- mod demo: terus masuk, data contoh sendiri, tiada Google, ruang storan berasingan ----
    // survey bahagian 1 dan 2 ditanda selesai supaya ujian demo biasa terus masuk (survey diuji di bawah)
    const seedSurvey = async (page) => page.addInitScript(() => {
      if (location.search.includes('demo') && !localStorage.getItem('jadual-demo-prefs')) localStorage.setItem('jadual-demo-prefs', JSON.stringify({ survey: { id: 'ujianseed0001', p1: '2026-10-26T00:00:00.000Z', p2: '2026-10-26T00:00:00.000Z' } }));
    });
    const dm = await open(b, base + '?demo', seedSurvey, NOSW);
    const hosts = [];
    dm.pg.on('request', (r) => { const h = new URL(r.url()).host; if (/google|googleapis|gstatic/.test(h) && !/^fonts\./.test(h)) hosts.push(h); });
    await dm.pg.waitForSelector('header.topbar');
    assert.strictEqual(await dm.pg.locator('.gate').count(), 0, 'demo tiada skrin log masuk');
    assert.ok(await dm.pg.locator('.demobar').count());
    assert.strictEqual(await dm.pg.locator('button.fab').count(), 0, 'tiada butang terapung jika maklum balas sudah dihantar');
    assert.strictEqual(await dm.pg.locator('.dialog').count(), 0, 'tiada popup notis jika maklum balas sudah dihantar');
    const dst = await dm.st();
    assert.strictEqual(dst.placements.length, 243);
    assert.ok(dst.reliefs.filter((r) => r.status === 'assigned').length >= 4);
    assert.strictEqual(await dm.pg.evaluate(() => localStorage.getItem('jadual-sekolah-v1')), null, 'data sekolah sebenar tidak disentuh');
    assert.ok(await dm.pg.evaluate(() => !!localStorage.getItem('jadual-demo-v1')));
    assert.ok((await dm.pg.locator('.demobar a.pill').getAttribute('href')).startsWith('https://wa.me/601120879149'));
    assert.strictEqual(await dm.pg.locator('button.avatar').count(), 1);
    await dm.pg.click('button[data-act="menu"][data-m="role"]');
    await dm.pg.click('button[data-act="setRole"][data-r="guru"]');
    assert.ok(await dm.pg.locator('.pick').count(), 'pratonton guru dalam demo');
    await dm.pg.click('button[data-act="setRole"][data-r="admin"]'); // menu kekal terbuka supaya nama boleh dipilih
    await dm.pg.click('nav button[data-p="tetapan"]');
    await dm.pg.click('button[data-act="tab"][data-k="storan"]');
    assert.ok(await dm.pg.locator('text=Tidak tersedia dalam demo').count());
    assert.strictEqual(await dm.pg.locator('button[data-act="syncSignIn"]').count(), 0);
    await dm.pg.click('button[data-act="tab"][data-k="sekolah"]');
    await dm.pg.fill('input[data-chg="schoolName"]', 'Sekolah Cubaan');
    await dm.pg.press('input[data-chg="schoolName"]', 'Tab');
    await dm.pg.reload();
    await dm.pg.waitForSelector('header.topbar');
    assert.strictEqual((await dm.st()).school.name, 'Sekolah Cubaan', 'perubahan demo kekal selepas muat semula');
    await dm.pg.click('button.avatar');
    await dm.pg.click('button[data-act="demoReset"]');
    await dm.pg.click('button[data-act="confirmYes"]');
    await dm.pg.waitForFunction(() => UI.state.school.name === 'SMK Contoh Jaya');
    assert.strictEqual((await dm.st()).placements.length, 243);
    // alamat biasa pada pelayar yang sama: skrin log masuk, data demo tidak bocor
    const real = await dm.ctx.newPage();
    await real.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await real.goto(base + 'index.html');
    assert.ok(await real.locator('.gate').count());
    assert.strictEqual(await real.evaluate(() => localStorage.getItem('jadual-sekolah-v1')), null);
    await real.close();
    assert.deepStrictEqual(hosts, [], 'demo tidak menghubungi Google: ' + hosts);
    assert.deepStrictEqual(dm.errors, []);
    await dm.ctx.close();
    step('demo: terus masuk tanpa log masuk, data contoh siap (243 waktu, relief), ruang storan berasingan, tiada Google, set semula');

    // ---- survey demo: popup wajib sebelum demo, bahagian 2 selepas cuba, sync ke Apps Script (Code.gs sebenar) ----
    async function fillSurvey(pg, part, pick = {}) {
      const secs = await pg.evaluate((p) => TT.surveySections(p).map((s) => s.questions), part);
      for (let i = 0; i < secs.length; i++) {
        for (const q of secs[i]) {
          if (!(await pg.locator(`[data-qwrap="${q.id}"]`).count())) continue; // soalan bersyarat tersembunyi
          const want = pick[q.id];
          if (q.type === 'single') await pg.locator(`label.opt:has(input[data-q="${q.id}"]${want ? `[value="${want}"]` : ''})`).first().click();
          else if (q.type === 'multi') for (const v of (want || [q.options[0].v])) await pg.locator(`label.opt:has(input[data-q="${q.id}"][value="${v}"])`).click();
          else if (q.type === 'scale') await pg.locator(`label.sc:has(input[data-q="${q.id}"][value="${want == null ? q.max : want}"])`).click();
          else if (q.type === 'text') await pg.fill(`textarea[data-q="${q.id}"]`, 'jawapan ' + q.id);
          else if (q.type === 'matrix') for (const r of q.rows) await pg.locator(`label.opt:has(input[data-q="${q.id}"][data-row="${r.v}"])`).first().click();
          else if (q.type === 'numbers') for (const [k, f] of q.fields.entries()) await pg.fill(`input[data-q="${q.id}"][data-f="${f.v}"]`, String((k + 1) * 500));
        }
        await pg.click('.svy .row .btn.primary');
      }
    }
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbTEST/exec';
    const apps = createEnv();
    const posts = [];
    let netFail = false;
    const surveySetup = async (page) => {
      await page.route('**/config.js', async (route) => {
        const body = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace(/surveyUrl: '[^']*'/, `surveyUrl: '${scriptUrl}'`);
        await route.fulfill({ status: 200, contentType: 'text/javascript', body });
      });
      await page.route('https://script.google.com/**', async (route) => {
        if (netFail) return route.abort();
        const req = route.request();
        if (req.method() === 'POST') { posts.push(JSON.parse(req.postData())); apps.post(req.postData()); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      });
    };
    const sv = await open(b, base + '?demo', surveySetup, NOSW);
    await sv.pg.waitForSelector('.svy');
    assert.strictEqual(await sv.pg.locator('header.topbar').count(), 0, 'demo tidak boleh digunakan sebelum survey');
    assert.ok((await sv.pg.textContent('.svy h1')).includes('Sebelum cuba demo'));
    assert.ok((await sv.pg.textContent('.svy')).includes('Tiada nama, nombor telefon atau e-mel'));
    await sv.pg.click('[data-act="svyStart"]');
    await sv.pg.click('[data-act="svyNext"]');
    assert.ok(await sv.pg.locator('.q.err').count() >= 4, 'soalan wajib ditanda');
    assert.match(await sv.pg.textContent('#svyMsg'), /lengkapkan/);
    assert.strictEqual(await sv.pg.evaluate(() => UI.survey.step), 0, 'tidak maju tanpa jawapan wajib');
    await sv.pg.locator('label.opt:has(input[data-q="peranan"][value="lain"])').click();
    await sv.pg.click('[data-act="svyNext"]');
    assert.match(await sv.pg.textContent('[data-qwrap="peranan"] .qerr'), /lain-lain/, 'lain-lain mesti dinyatakan');
    assert.ok(await sv.pg.locator('input[data-other="peranan"]:visible').count());
    await sv.pg.fill('input[data-other="peranan"]', 'Guru ICT');
    // draf kekal selepas muat semula
    await sv.pg.reload();
    await sv.pg.waitForSelector('.svy');
    assert.strictEqual(await sv.pg.evaluate(() => UI.survey.step), 0);
    assert.ok(await sv.pg.locator('input[data-q="peranan"][value="lain"]:checked').count(), 'draf jawapan kekal');
    assert.strictEqual(await sv.pg.inputValue('input[data-other="peranan"]'), 'Guru ICT');
    await sv.pg.locator('label.opt:has(input[data-q="peranan"][value="penyelaras"])').click();
    assert.ok(!(await sv.pg.locator('input[data-other="peranan"]:visible').count()), 'kotak lain-lain disembunyikan');
    // had pilihan: pilih sehingga 3
    for (const id of ['jenis', 'bil_guru', 'bil_kelas']) await sv.pg.locator(`label.opt:has(input[data-q="${id}"])`).first().click();
    await sv.pg.click('[data-act="svyNext"]');
    assert.strictEqual(await sv.pg.evaluate(() => UI.survey.step), 1);
    // soalan bersyarat: aSc membuka soalan susulan
    assert.strictEqual(await sv.pg.locator('[data-qwrap="asc_sebab"]').count(), 0);
    await sv.pg.locator('label.opt:has(input[data-q="susun_alat"][value="asc"])').click();
    assert.strictEqual(await sv.pg.locator('[data-qwrap="asc_sebab"]').count(), 1);
    await sv.pg.locator('label.opt:has(input[data-q="susun_alat"][value="asc"])').click();
    assert.strictEqual(await sv.pg.locator('[data-qwrap="asc_sebab"]').count(), 0);
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="sekatan"])').click();
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="bertindih"])').click();
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="gabung"])').click();
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="bilik"])').click();
    assert.match(await sv.pg.textContent('[data-qwrap="susah"] .qerr'), /sehingga 3/);
    assert.strictEqual(await sv.pg.locator('input[data-q="susah"]:checked').count(), 3);
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="gabung"])').click();
    await sv.pg.locator('label.opt:has(input[data-q="susah"][value="gabung"])').click(); // buang
    await sv.pg.evaluate(() => { UI.survey.step = 0; });
    // isi bakinya melalui klik sebenar, bermula dari bahagian pertama
    await sv.pg.reload();
    await sv.pg.waitForSelector('.svy');
    await sv.pg.evaluate(() => { UI.actions.svyBack(); UI.actions.svyStart(); });
    await fillSurvey(sv.pg, 1, { peranan: 'penyelaras', susun_alat: ['excel', 'asc'], rel_guru_isi: 'perlu' });
    await sv.pg.waitForSelector('header.topbar');
    assert.ok(await sv.pg.locator('.demobar').count());
    // popup notis sekali: ayat, gambar butang, dan penjelasan butang terapung
    await sv.pg.waitForSelector('.dialog');
    const notis = await sv.pg.textContent('.dialog');
    assert.ok(notis.includes('Selepas anda cuba demo ini, tolong isi maklum balas melalui butang Maklum Balas seperti ini'), notis);
    assert.ok(await sv.pg.locator('.dialog .fabdemo .fab.prev').count(), 'gambar butang dalam popup');
    assert.ok(notis.includes('sentiasa terapung'));
    await sv.pg.click('.dialog button[data-act="modalClose"]');
    assert.strictEqual(await sv.pg.locator('.dialog').count(), 0);
    await sv.pg.waitForFunction(() => JSON.parse(localStorage.getItem('jadual-demo-survey-queue') || '[]').length === 0);
    assert.strictEqual(posts.length, 1);
    const p1 = posts[0];
    assert.strictEqual(p1.part, 1); assert.strictEqual(p1.v, 1); assert.strictEqual(p1.hp, ''); assert.ok(/^[A-Za-z0-9_-]{8,64}$/.test(p1.id)); assert.ok(p1.ua.length > 5);
    assert.strictEqual(p1.answers.peranan, 'penyelaras');
    assert.deepStrictEqual(p1.answers.susun_alat, ['excel', 'asc']);
    assert.ok(p1.answers.asc_sebab, 'soalan bersyarat dijawab dan dihantar');
    assert.ok(!('nps' in p1.answers) && !('mudah' in p1.answers), 'bahagian 1 tidak mengandungi soalan selepas demo');
    assert.strictEqual(apps.rows().length, 1);
    assert.strictEqual(apps.row(0).peranan, 'Penyelaras jadual / relief');
    assert.strictEqual(apps.row(0).susun_alat, 'Excel / Google Sheet | aSc Timetables');
    assert.ok(!JSON.stringify(p1).match(/pbkdf2|@|\b01[0-9]-?\d{7}/), 'tiada maklumat peribadi dalam payload');
    step('survey bahagian 1: popup wajib, semakan wajib/lain-lain/had pilihan, soalan bersyarat, draf kekal, popup notis + gambar butang, dihantar ke Apps Script (Code.gs sebenar)');

    // selepas survey: demo boleh digunakan, kekal selepas muat semula, butang bahagian 2 kelihatan
    await sv.pg.reload();
    await sv.pg.waitForSelector('header.topbar');
    assert.strictEqual(await sv.pg.locator('.svy').count(), 0, 'survey tidak diminta semula');
    assert.strictEqual(await sv.pg.locator('.dialog').count(), 0, 'popup notis hanya sekali');
    assert.strictEqual((await sv.st()).placements.length, 243);
    // butang Maklum Balas terapung: ada pada setiap halaman, kekal di penjuru kanan bawah walaupun halaman disrkol
    const vp = sv.pg.viewportSize();
    for (const page of ['utama', 'data', 'jadual', 'relief', 'laporan', 'tetapan']) {
      await sv.pg.click(`nav button[data-p="${page}"]`);
      await sv.pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const box = await sv.pg.locator('button.fab').boundingBox();
      assert.ok(box, 'butang terapung tiada pada halaman ' + page);
      assert.ok(box.x + box.width > vp.width - 40 && box.y + box.height > vp.height - 60, `kedudukan butang pada ${page}: ${JSON.stringify(box)}`);
      assert.strictEqual(await sv.pg.locator('button.fab').getAttribute('data-act'), 'svyOpen2');
    }
    await sv.pg.click('button[data-act="menu"][data-m="role"]');
    await sv.pg.click('button[data-act="setRole"][data-r="guru"]');
    assert.ok(await sv.pg.locator('button.fab').count(), 'butang kekal dalam pratonton guru');
    await sv.pg.click('button[data-act="setRole"][data-r="admin"]');
    await sv.pg.click('nav button[data-p="utama"]');
    await sv.pg.click('button.fab');
    assert.ok((await sv.pg.textContent('.svy h1')).includes('Terima kasih sudah mencuba'));
    await sv.pg.click('[data-act="svyClose"]');
    await sv.pg.waitForSelector('header.topbar');
    await sv.pg.click('button.fab');
    await sv.pg.click('[data-act="svyStart"]');
    await sv.pg.click('[data-act="svyNext"]');
    assert.ok(await sv.pg.locator('.q.err').count() >= 2, 'bahagian 2 juga menyemak soalan wajib');
    await sv.pg.evaluate(() => { UI.survey.step = -1; });
    await sv.pg.evaluate(() => UI.actions.svyStart());
    await fillSurvey(sv.pg, 2, { nps: 9 });
    await sv.pg.waitForSelector('header.topbar');
    await sv.pg.waitForFunction(() => JSON.parse(localStorage.getItem('jadual-demo-survey-queue') || '[]').length === 0);
    assert.strictEqual(posts.length, 2);
    assert.strictEqual(posts[1].part, 2); assert.strictEqual(posts[1].id, p1.id, 'bahagian 2 guna ID responden sama');
    assert.strictEqual(posts[1].answers.harga_terlalu_mahal, 2000);
    assert.strictEqual(apps.rows().length, 1, 'bahagian 2 mengemas kini baris yang sama');
    assert.strictEqual(apps.row(0).nps, 9); assert.strictEqual(apps.row(0).peranan, 'Penyelaras jadual / relief');
    assert.strictEqual(await sv.pg.locator('button.fab').count(), 0, 'butang terapung hilang selepas bahagian 2');
    // set semula demo tidak menetapkan semula survey
    await sv.pg.click('button.avatar');
    await sv.pg.click('button[data-act="demoReset"]');
    await sv.pg.click('button[data-act="confirmYes"]');
    await sv.pg.waitForFunction(() => UI.state.school.name === 'SMK Contoh Jaya');
    assert.strictEqual(await sv.pg.locator('.svy').count(), 0);
    assert.deepStrictEqual(sv.errors, []);
    await sv.ctx.close();
    step('survey bahagian 2 selepas demo: butang Maklum Balas terapung pada setiap halaman, ID sama, baris Sheet dikemas kini (bukan berganda), set semula demo tidak ulang survey');

    // rangkaian terputus: demo tetap boleh digunakan, jawapan menunggu dalam baris gilir dan dihantar bila pulih; perangkap robot
    const off = await open(b, base + '?demo', surveySetup, NOSW);
    await off.pg.waitForSelector('.svy');
    netFail = true;
    await off.pg.click('[data-act="svyStart"]');
    await fillSurvey(off.pg, 1, { peranan: 'pk' });
    await off.pg.waitForSelector('header.topbar');
    assert.strictEqual(await off.pg.evaluate(() => JSON.parse(localStorage.getItem('jadual-demo-survey-queue')).length), 1, 'menunggu dalam baris gilir');
    assert.strictEqual(posts.length, 2);
    netFail = false;
    await off.pg.evaluate(() => UI.surveyFlush());
    await off.pg.waitForFunction(() => JSON.parse(localStorage.getItem('jadual-demo-survey-queue')).length === 0);
    assert.strictEqual(posts.length, 3);
    assert.strictEqual(apps.rows().length, 2);
    await off.pg.evaluate(() => UI.surveyFlush());
    assert.strictEqual(posts.length, 3, 'tiada hantaran berganda');
    assert.deepStrictEqual(off.errors.filter((e) => !/ERR_FAILED/.test(e)), [], 'hanya ralat rangkaian yang sengaja digagalkan dibenarkan');
    await off.ctx.close();
    // robot mengisi medan tersembunyi: pelayan menolak, tiada baris ditulis
    const bot = await open(b, base + '?demo', surveySetup, NOSW);
    await bot.pg.waitForSelector('.svy');
    await bot.pg.click('[data-act="svyStart"]');
    const before = apps.rows().length;
    // isi semua kecuali butang akhir, kemudian isi medan perangkap sebelum hantar
    const secs = await bot.pg.evaluate(() => TT.surveySections(1).length);
    await fillSurveyBot(bot.pg, secs);
    async function fillSurveyBot(pg, n) {
      const answers = await pg.evaluate(() => ({}));
      void answers;
      for (let i = 0; i < n; i++) {
        const qs = await pg.evaluate((k) => TT.surveySections(1)[k].questions, i);
        for (const q of qs) {
          if (!(await pg.locator(`[data-qwrap="${q.id}"]`).count())) continue;
          if (q.type === 'single') await pg.locator(`label.opt:has(input[data-q="${q.id}"])`).first().click();
          else if (q.type === 'multi') await pg.locator(`label.opt:has(input[data-q="${q.id}"])`).first().click();
        }
        if (i === n - 1) await pg.evaluate(() => { document.querySelector('.svy .hp').value = 'http://spam.example'; });
        await pg.click('.svy .row .btn.primary');
      }
    }
    await bot.pg.waitForSelector('header.topbar');
    await bot.pg.waitForFunction(() => JSON.parse(localStorage.getItem('jadual-demo-survey-queue')).length === 0);
    assert.strictEqual(posts[posts.length - 1].hp, 'http://spam.example');
    assert.strictEqual(apps.rows().length, before, 'hantaran robot ditolak oleh Apps Script');
    await bot.ctx.close();
    step('rangkaian terputus: demo boleh guna, jawapan dihantar bila pulih tanpa berganda; perangkap robot ditolak oleh Apps Script');

    // ---- PWA: manifest, ikon, service worker, buka luar talian ----
    const w = await open(b, base, async (page) => { await page.route(/accounts\.google\.com/, (r) => r.abort()); });
    const man = await w.pg.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
    assert.strictEqual(man.display, 'standalone');
    for (const ic of man.icons) assert.strictEqual(await w.pg.evaluate(async (u) => (await fetch(u)).status, ic.src), 200, ic.src);
    assert.ok(man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
    await w.pg.evaluate(() => navigator.serviceWorker.ready);
    await w.pg.waitForFunction(async () => !!(await caches.match('js/app.js')));
    await w.ctx.setOffline(true);
    await w.pg.reload();
    await w.pg.waitForSelector('.gate');
    assert.strictEqual(await w.pg.evaluate(() => typeof TT.guruSnapshot), 'function');
    await w.ctx.setOffline(false);
    await w.ctx.close();
    step('PWA: manifest + ikon sah, service worker aktif, app dibuka semula tanpa internet');
  } finally { server.close(); }
}

(async () => {
  const b = await chromium.launch();
  try {
    await adminAndGuru(b);
    await sheetsFlow(b);
    console.log('SEMUA UJIAN E2E LULUS');
  } finally { await b.close(); }
})().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
