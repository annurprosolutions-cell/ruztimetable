// Video promosi yang disegerakkan dengan audio suara (voice-over) yang sedia ada.
// Setiap klip direkod daripada app sebenar (Google, Sheets, Worker lesen tiruan) mengikut garis masa audio, kemudian
// dicantum, diletak sari kata dan digabung dengan audio.
//
//   node tools/manual/promo.js <audio.wav> <segmen.json> [keluaran.mp4]
//
// segmen.json = hasil transkripsi masa ayat (faster-whisper): [{ "start": 0, "end": 2.06, "text": "..." }, ...]
// Garis masa klip dan teks sari kata ditakrif dalam CLIPS dan CAPTIONS di bawah (ikut skrip yang dibaca suara).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const { site, backend, OVERLAY, helpers, seedState, SITE, EMAIL, FIXED, OUT } = require('./record.js');

const [AUDIO, SEGS, OUTFILE] = process.argv.slice(2);
if (!AUDIO || !SEGS) { console.error('guna: node tools/manual/promo.js <audio.wav> <segmen.json> [keluaran.mp4]'); process.exit(1); }
const seg = JSON.parse(fs.readFileSync(SEGS, 'utf8'));
const DUR = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', AUDIO]).toString().trim();
const WORK = path.join(OUT, 'promo');
fs.mkdirSync(WORK, { recursive: true });
const log = (m) => console.log(m);

// ---- sari kata: [mula (saat audio), teks]; tamat = mula seterusnya ----
const CAPTIONS = [
  [0.0, 'Cikgu yang uruskan jadual waktu...'],
  [2.06, 'Kita semua tahu betapa pening kepala bila nak susun jadual dan cari guru ganti.'],
  [7.88, 'Annur Time Table ialah sistem yang membantu cikgu buat dua kerja ini sekali gus!'],
  [13.18, 'Masukkan data guru, kelas dan subjek.'],
  [15.7, 'Kalau sekolah cikgu pernah guna aSc, boleh import terus daripada Excel.'],
  [20.0, 'Tekan satu butang... jadual siap dalam beberapa saat!'],
  [22.82, 'Tanpa pertindihan guru atau kelas.'],
  [24.9, 'Nak ubah? Seret dan lepas sahaja.'],
  [27.7, 'Lepas tu, cetak atau muat turun dalam format Excel.'],
  [31.68, 'Bila ada guru tidak hadir, rekodkan sahaja dalam sistem.'],
  [34.8, 'Guru ganti dicadangkan secara adil, dan mesej boleh terus dihantar ke WhatsApp.'],
  [39.44, 'Guru lain pula boleh semak jadual waktu dan tugas relief masing-masing melalui telefon.'],
  [44.1, 'Tak perlu kata laluan!'],
  [46.5, 'Data disimpan dalam Google Sheet sekolah sendiri.'],
  [50.36, 'Cuba PERCUMA selama 14 hari, dengan semua ciri dibuka!'],
  [55.52, 'Selepas itu, hanya RM20 sebulan atau RM200 setahun.'],
  [59.52, 'Ada berita baik untuk cikgu yang nak jadi pengguna terawal atau Beta User kami!'],
  [64.52, 'Untuk 50 pengguna pertama, kami sediakan promosi istimewa khas sebagai tanda penghargaan'],
  [69.74, 'kerana menyokong Annur Time Table sejak awal!'],
  [72.52, 'Jangan risau kalau tak biasa guna sistem.'],
  [74.36, 'Kami sediakan panduan lengkap bergambar dan 13 video pendek untuk bimbing cikgu dari mula.'],
  [79.24, 'Dan kalau tersangkut, kami sedia membantu melalui WhatsApp.'],
  [83.78, 'Jadi, tunggu apa lagi? Cuba Annur Time Table sekarang di annurtimetable.com!'],
  [88.9, 'Susun jadual lebih mudah, urusan relief lebih lancar!']
];

// ---- pembantu klip ----
const card = (pg, k, t, s) => pg.evaluate(([k, t, s]) => window.__rec.title(k, t, s), [k, t, s]);
const cardOff = (pg) => pg.evaluate(() => window.__rec.titleOff());

async function recordClip(browser, base, seed, c) {
  const phone = !!c.phone;
  const size = phone ? { width: 412, height: 860 } : { width: 1280, height: 720 };
  const vdir = path.join(WORK, 'raw-' + c.id);
  fs.rmSync(vdir, { recursive: true, force: true });
  const be = await backend(new URL(base).origin);
  if (c.licence) await be.admin(Object.assign({ email: EMAIL }, c.licence));
  let url = base;
  if (c.prep) url = await c.prep({ browser, be, seed, base, site });
  const opts = { viewport: size, timezoneId: 'Asia/Kuala_Lumpur', serviceWorkers: 'block', acceptDownloads: true, locale: 'ms-MY', recordVideo: { dir: vdir, size } };
  if (phone) Object.assign(opts, { isMobile: true, hasTouch: true });
  if (!c.fresh) opts.storageState = seed;
  const ctx = await browser.newContext(opts);
  await site(ctx);
  const pg = await ctx.newPage();
  const tPage = Date.now();
  await pg.clock.setFixedTime(FIXED);
  await be.mocks(pg);
  await pg.addInitScript(OVERLAY);
  pg.on('pageerror', (e) => log(`  ! [${c.id}] ralat halaman: ${e.message}`));
  const h = helpers(pg, 'video', c.id, log);
  h.be = be;
  await pg.goto(url);
  await pg.waitForSelector(c.ready || 'header.topbar', { timeout: 30000 });
  if (c.setup) await c.setup(h, pg);
  await pg.waitForTimeout(300);
  // t0 = detik 0 klip. at(t) menunggu sehingga detik t; lewat > 0.5 s dilog supaya kelihatan jika segerak lari
  const t0 = Date.now();
  const at = async (t) => {
    const w = t0 + t * 1000 - Date.now();
    if (w > 0) await pg.waitForTimeout(w); else if (w < -500) log(`  ~ [${c.id}] lewat ${(-w / 1000).toFixed(1)} s pada ${t}`);
  };
  try { await c.run(h, pg, at); } catch (e) { log(`  ! [${c.id}] klip gagal: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  await at(c.dur + 0.4);
  const video = pg.video();
  await ctx.close();
  const raw = await video.path();
  const out = path.join(WORK, c.id + '.mp4');
  const vf = phone
    ? '[0:v]split[a][b];[a]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=28:6,eq=brightness=-0.12[bg];[b]scale=-2:700[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=25,format=yuv420p[v]'
    : '[0:v]scale=1280:720,fps=25,format=yuv420p[v]';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ((t0 - tPage) / 1000).toFixed(3), '-t', String(c.dur), '-i', raw, '-filter_complex', vf, '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-an', out]);
  log(`  klip ${c.id}: ${c.dur.toFixed(2)} s`);
  return out;
}

// ---- takrifan klip (masa relatif kepada permulaan klip; permulaan = detik audio `from`) ----
const F = { after: 150, fast: true };
const CLIPS = (seg0) => [
  {
    id: 'A', from: 0, to: 39.44,
    async run(h, pg, at) {
      await card(pg, 'Untuk cikgu penyedia jadual', 'Pening susun jadual dan cari guru ganti?', 'Annur Time Table');
      await at(7.5); await cardOff(pg);
      await at(8.7); await h.hl('nav button[data-p="jadual"]', 1300);
      await at(10.4); await h.hl('nav button[data-p="relief"]', 1300);
      await at(12.7); await h.nav('data', F); await h.tab('dataTab', 'guru', F);
      await at(15.1); await h.tab('dataTab', 'kelas', F);
      await at(16.4); await h.hl('button[data-act="ascImport"]', 2600);
      await at(19.6); await h.nav('jadual', F);
      await at(20.3); await h.click('button[data-act="generate"]', { after: 200, fast: true });
      await at(21.0); await pg.selectOption('#gMode', 'fresh'); await pg.selectOption('#gEffort', '2000');
      await at(21.8); await h.click('button[data-act="genStart"]', { after: 100, fast: true });
      await pg.waitForFunction(() => !document.querySelector('.overlay') && UI.lastGen, null, { timeout: 15000 }).catch(() => {});
      await at(24.2); await h.hl('.card.phead', 700);
      await at(24.9);
      try {
        const src = pg.locator('td.cell.filled[draggable="true"]').nth(3);
        await src.scrollIntoViewIfNeeded(); const b = await src.boundingBox();
        await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await pg.mouse.down();
        await pg.mouse.move(b.x + b.width / 2 + 8, b.y + b.height / 2 + 8, { steps: 3 }); await pg.waitForTimeout(250);
        const ok = pg.locator('td.cell.empty.ok').first();
        if (await ok.count()) { const t = await ok.boundingBox(); await pg.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 24 }); await pg.waitForTimeout(450); }
        await pg.mouse.up();
      } catch (e) { /* abaikan */ }
      await at(27.7);
      await pg.evaluate(() => { window.print = () => {}; });
      await h.click('button[data-act="printView"]', { after: 300, fast: true });
      await pg.emulateMedia({ media: 'print' }); await pg.evaluate(() => window.scrollTo(0, 0));
      await at(29.7); await pg.emulateMedia({ media: 'screen' }); await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await at(30.1); await h.click('button[data-act="xlsxView"]', { after: 200, fast: true });
      await at(31.5); await h.nav('relief', F);
      await at(32.2); await h.click('button[data-act="absenceAdd"]', { after: 200, fast: true });
      await at(32.9); await pg.selectOption('#theForm [name="teacherId"]', { index: 4 }); await pg.waitForTimeout(350); await pg.selectOption('#theForm [name="reason"]', { index: 1 });
      await at(34.0); await h.click('[data-act="formSave"]', { after: 100, fast: true });
      await at(35.0); await h.click('button[data-act="reliefAuto"]', { after: 100, fast: true });
      await at(36.4); await h.scroll(380, 400);
      await at(37.4); await h.click('button[data-act="reliefMsg"]', { after: 100, fast: true });
      await at(39.0); await h.click('.overlay [data-act="modalClose"]', { after: 0, timeout: 600, fast: true });
    }
  },
  {
    id: 'B', from: 39.44, to: 46.2, phone: true, fresh: true, ready: '.gate .pickbtn',
    // pentadbir simpan ke Google Sheets dahulu (tidak dirakam) supaya pautan guru wujud
    licence: { plan: 'tahunan', school: 'SMK Contoh Jaya', expires: '2027-11-01' },
    async prep({ browser, be, seed, base, site }) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Kuala_Lumpur', serviceWorkers: 'block', storageState: seed });
      await site(ctx); const pg = await ctx.newPage(); await pg.clock.setFixedTime(FIXED); await be.mocks(pg);
      await pg.goto(base); await pg.waitForSelector('header.topbar');
      await pg.evaluate(() => { UI.page = 'tetapan'; UI.setTab = 'storan'; UI.render(); });
      await pg.click('button[data-act="syncSignIn"]');
      await pg.waitForFunction(() => UI.sync.licensed && UI.sync.licensed(), null, { timeout: 15000 });
      await pg.click('button[data-act="syncCreate"]');
      if (await pg.locator('[data-act="confirmYes"]').count()) await pg.click('[data-act="confirmYes"]');
      await pg.waitForFunction(() => UI.state.school.guruSheet && UI.sync.status === 'saved', null, { timeout: 20000 });
      await pg.evaluate(() => UI.sync.push(true));
      const link = await pg.evaluate(() => UI.sync.guruLink());
      await ctx.close();
      return link;
    },
    async setup(h, pg) { await pg.click('.gate .pickbtn >> nth=2'); await pg.waitForSelector('header.topbar', { timeout: 15000 }); },
    async run(h, pg, at) {
      await at(2.4); await h.scroll(300, 300);
      await at(3.6); await h.click('nav button[data-p="jadualku"], button[data-p="jadualku"]', { after: 100, fast: true });
      await at(5.0); await h.scroll(350, 300);
    }
  },
  {
    id: 'C', from: 46.2, to: DUR, licence: { plan: 'tahunan', school: 'SMK Contoh Jaya', expires: '2027-11-01' },
    async setup(h, pg) {
      await pg.evaluate(() => { UI.page = 'tetapan'; UI.setTab = 'storan'; UI.render(); });
      await pg.click('button[data-act="syncSignIn"]');
      await pg.waitForFunction(() => UI.sync.licensed && UI.sync.licensed(), null, { timeout: 15000 });
      await pg.click('button[data-act="syncCreate"]');
      if (await pg.locator('[data-act="confirmYes"]').count()) await pg.click('[data-act="confirmYes"]');
      await pg.waitForFunction(() => UI.sync.status === 'saved' && UI.state.school.guruSheet, null, { timeout: 20000 });
      await pg.evaluate(() => window.scrollTo(0, 0));
    },
    async run(h, pg, at) {
      const R = (a) => a - 46.2;
      await at(R(46.6)); await h.hl('#syncPill', 1600);
      await at(R(48.6)); await pg.evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' }));
      await at(R(50.3));
      await pg.evaluate(() => { UI.prefs.license = { email: '', ok: true, plan: 'percubaan', expires: TT.addDays(TT.todayISO(), 13), checkedAt: Date.now() }; UI.sync.license = { allowed: true, state: 'off', message: '' }; UI.page = 'utama'; UI.render(); window.scrollTo(0, 0); });
      await at(R(51.0)); await h.hl('.act-item, .abanner, .banner', 2600);
      await at(R(55.5)); await card(pg, 'Harga', 'RM20 sebulan', 'atau RM200 setahun (jimat RM40)');
      await at(R(59.3)); await card(pg, 'Pengguna Beta', '50 pengguna pertama: promosi istimewa', 'Tanda penghargaan untuk penyokong awal Annur Time Table');
      await at(R(71.6)); await pg.goto(SITE + 'panduan/'); await pg.waitForSelector('#kenali', { timeout: 10000 });
      await at(R(74.5)); await pg.evaluate(() => document.getElementById('video').scrollIntoView({ behavior: 'smooth', block: 'start' }));
      await at(R(77.3)); await h.hover('.vid div:nth-child(6) video', 600);
      await at(R(79.3)); await pg.evaluate(() => document.getElementById('hubungi').scrollIntoView({ behavior: 'smooth', block: 'start' }));
      await at(R(81.0)); await h.hl('#hubungi ~ table', 1800);
      await at(R(83.2)); await card(pg, 'Annur Time Table', 'annurtimetable.com', 'Cuba percuma 14 hari · Panduan, 13 video dan sokongan WhatsApp');
    }
  }
];

// ---- sari kata sebagai fail teks (bungkus baris) + rantai drawtext ----
function wrap(t, n) {
  const out = []; let line = '';
  for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  out.push(line); return out.join('\n');
}
function captionFilter() {
  const font = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf';
  return CAPTIONS.map(([a, t], i) => {
    const b = i + 1 < CAPTIONS.length ? CAPTIONS[i + 1][0] : DUR;
    const f = path.join(WORK, `cap${String(i).padStart(2, '0')}.txt`);
    fs.writeFileSync(f, wrap(t, 46));
    return `drawtext=fontfile=${font}:textfile=${f}:fontcolor=white:fontsize=34:line_spacing=8:box=1:boxcolor=0x0f172ad9:boxborderw=16:x=(w-text_w)/2:y=h-text_h-44:enable='between(t,${a.toFixed(2)},${(b - 0.05).toFixed(2)})'`;
  }).join(',');
}

(async () => {
  const browser = await chromium.launch();
  try {
    const seed = await seedState(browser, SITE);
    const parts = [];
    for (const c of CLIPS(seg)) {
      c.dur = c.to - c.from;
      const have = path.join(WORK, c.id + '.mp4');
      // CLIPS=A,C: rakam semula klip itu sahaja, guna klip sedia ada untuk yang lain
      if (process.env.CLIPS && !process.env.CLIPS.split(',').includes(c.id) && fs.existsSync(have)) { parts.push(have); continue; }
      log(`Klip ${c.id} (${c.from}-${c.to})`);
      parts.push(await recordClip(browser, SITE, seed, c));
    }
    const list = path.join(WORK, 'senarai.txt');
    fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
    const joined = path.join(WORK, 'cantum.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
    const out = path.resolve(OUTFILE || path.join(WORK, 'video-promosi.mp4'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', joined, '-i', AUDIO, '-filter_complex', `[0:v]${captionFilter()}[v]`, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
    log('Siap: ' + out);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
