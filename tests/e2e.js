// Ujian hujung-ke-hujung dalam Chromium. Jalankan: npm i playwright && node tests/e2e.js
// Jam pelayar ditetapkan pada Isnin 26/10/2026 07:45 (waktu Malaysia) supaya keputusan tidak bergantung pada tarikh sebenar.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const assert = require('assert');
const { fakeSheets } = require('./helpers/fake-sheets.js');

const ROOT = path.resolve(__dirname, '..');
const FIXED = new Date('2026-10-26T07:45:00+08:00');
const MON = '2026-10-26';
const SHOTS = process.env.SHOTS || '';
const step = (m) => console.log('  ok  ' + m);

async function open(b, url, setup) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1500 }, timezoneId: 'Asia/Kuala_Lumpur', acceptDownloads: true });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(FIXED);
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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

  assert.ok(await pg.locator('.card.dark.today', { hasText: 'Selamat datang' }).count());
  await pg.click('.card.dark.today button[data-act="loadSample"]');
  assert.strictEqual((await st()).teachers.length, 18);
  step('kad selamat datang + muat data contoh');

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
  await pg.selectOption('select[data-chg="weekMode"]', 'sun-thu');
  assert.strictEqual((await st()).school.weekMode, 'sun-thu');
  await pg.selectOption('select[data-chg="weekMode"]', 'mon-fri');
  await pg.click('button[data-act="tab"][data-k="storan"]');
  assert.ok(await pg.locator('text=belum diaktifkan').count());
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.card button[data-act="exportJson"]')]);
  assert.match(dl.suggestedFilename(), /\.json$/);
  assert.ok(await pg.evaluate(() => UI.prefs.lastBackup));
  step('tetapan minggu, storan (Sheets belum dikonfigurasi), eksport JSON');

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
  step('peranan guru: dashboard, slip, jadual saya, relief saya, bantuan, susunan telefon');

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
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  try {
    const { pg, errors, st } = await open(b, `http://127.0.0.1:${server.address().port}/index.html`, async (page) => {
      await page.route('**/config.js', async (route) => {
        const body = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace("googleClientId: ''", "googleClientId: 'ujian.apps.googleusercontent.com'");
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
      await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => (route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ email: 'pentadbir@moe-dl.edu.my' }) })));
    });
    await pg.click('.card.dark.today button[data-act="loadSample"]');
    await pg.evaluate(() => { UI.state.placements = TT.generate(UI.state, { seed: 2, improveMs: 100 }).placements; UI.save(); UI.render(); });
    await pg.click('nav button[data-p="tetapan"]');
    await pg.click('button[data-act="tab"][data-k="storan"]');
    await pg.click('button[data-act="syncSignIn"]');
    await pg.waitForFunction(() => UI.sync.signedIn());
    await pg.waitForSelector('text=pentadbir@moe-dl.edu.my', { timeout: 10000 });
    await pg.click('button[data-act="syncCreate"]');
    await pg.waitForFunction(() => UI.prefs.sheet && UI.sync.status === 'saved');
    const book = [...fake.db.values()][0];
    assert.strictEqual(book.tabs.get('Guru').length, 19);
    assert.strictEqual(book.tabs.get('Jadual').length, 244);
    assert.strictEqual(await pg.locator('#syncPill').textContent(), 'Disimpan');
    step('log masuk (mock), cipta Sheet, data ditulis: 18 guru, 243 waktu');

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

    await pg.click('button[data-act="syncUnlink"]');
    await pg.click('button[data-act="confirmYes"]');
    assert.strictEqual(await pg.evaluate(() => UI.prefs.sheet), null);
    step('putuskan sambungan');
    assert.deepStrictEqual(errors, []);
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
