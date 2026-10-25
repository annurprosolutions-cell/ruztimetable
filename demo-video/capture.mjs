// Rakam app Jadual Sekolah sebenar untuk video demo. Hasil: shots/*.png + shots/manifest.js
// (kedudukan elemen penting dalam piksel CSS, supaya kamera video boleh zoom tepat).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const APP = 'file://' + path.resolve(here, '../index.html');
const OUT = path.join(here, 'shots');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIXED = new Date('2026-10-26T07:45:00+08:00'); // Isnin, 7:45 pagi
const M = {};
const browser = await chromium.launch();

async function open(viewport, dsf, init) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY' });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(FIXED);
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.addInitScript(() => { window.print = () => {}; });
  if (init) await p.addInitScript(init.fn, init.arg);
  await p.goto(APP);
  return p;
}

async function shot(p, name, tags, opts = {}) {
  await p.evaluate(() => {
    document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0);
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

// ---------------- pentadbir (desktop) ----------------
const p = await open({ width: 1280, height: 1200 }, 2);
await p.click('.card.dark.today button[data-act="loadSample"]');
await p.evaluate(() => { UI.prefs.name = 'Pn. Rohana'; UI.prefs.lastBackup = '2026-10-24T10:00:00Z'; UI.savePrefs(); });

// 1. Tetapan
await p.evaluate(() => { UI.page = 'tetapan'; UI.setTab = 'waktu'; UI.render(); });
await tag(p, () => {
  const c = document.querySelectorAll('main .card'); c[1].dataset.shot = 'waktu'; c[2].dataset.shot = 'hari';
  document.querySelector('input[data-chg="dayLimit"][data-i="4"]').closest('label').dataset.shot = 'jumaat';
});
await shot(p, 'tetapan', { waktu: '[data-shot=waktu]', hari: '[data-shot=hari]', jumaat: '[data-shot=jumaat]', gen: 'button[data-act="periodGen"]', head: '.phead' });
await p.click('button[data-act="periodGen"]');
await shot(p, 'tetapan-gen', { dlg: '.dialog', jana: 'button[data-act="formSave"]' });
await p.click('.dlg-f button[data-act="modalClose"]');

// 2. Data
await p.evaluate(() => { UI.page = 'data'; UI.dataTab = 'guru'; UI.render(); });
await shot(p, 'data-guru', { bulk: 'button[data-act="bulk"]', table: 'main .tbl', tabs: '.phead .seg.sub', metric: '.phead .metric' });
await p.click('button[data-act="bulk"]');
await p.fill('#theForm textarea[name="text"]', 'Rahimah Salleh, RHS, Bahasa\nGanesh Kumar, GKR, Matematik\nWong Siew Lan, WSL, Sains\nFauziah Hamid, FZH, Kemanusiaan\nMohd Faiz Ramli, MFR, Sukan');
await shot(p, 'data-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
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

// 3. Jana
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

// 4. Laras: seret dalam paparan guru (banyak slot kosong, petak hijau jelas)
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

// 5. Relief
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
await p.click('button[data-act="reliefMsg"]');
await shot(p, 'relief-wa', { dlg: '.dialog', ta: '#waText', salin: 'button[data-act="copyMsg"]' });
await p.click('.dlg-f button[data-act="modalClose"]');

// 6. Pantau: sejarah Oktober supaya kalendar dan statistik bermakna
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

// 7. Dashboard pentadbir
await p.setViewportSize({ width: 1280, height: 1150 });
await p.evaluate(() => { UI.page = 'utama'; UI.render(); });
await shot(p, 'dash-admin', { summary: '.summary', gauge: 'svg.gauge', today: '.card.dark.today', acts: '.acts', heat: '.heat', top: '.topbar', role: 'button.role' });

// ---------------- guru (telefon) ----------------
const data = await p.evaluate(() => localStorage.getItem('jadual-sekolah-v1'));
const me = await p.evaluate(() => UI.state.reliefs.find((x) => x.date === '2026-10-26' && x.status === 'assigned').reliefTeacherId);
const g = await open({ width: 412, height: 1500 }, 3, {
  fn: ([d, id]) => {
    localStorage.setItem('jadual-sekolah-v1', d);
    localStorage.setItem('jadual-sekolah-prefs', JSON.stringify({ role: 'guru', me: id, name: '', deviceId: 'dg', lastBackup: '2026-10-25T10:00:00Z', sheet: null }));
  },
  arg: [data, me]
});
await shot(g, 'guru-dash', { alert: '.alert', slip: '.alert button', today: '.card.dark.today', rel: '.drow.rel', top: '.topbar' }, { mobile: true });
await g.evaluate(() => { UI.page = 'reliefku'; UI.render(); });
await shot(g, 'guru-relief', { head: '.phead', first: 'main > section.card:nth-of-type(2)', fair: '.fair' }, { mobile: true });

fs.writeFileSync(path.join(OUT, 'manifest.js'), 'window.MANIFEST = ' + JSON.stringify(M, null, 1) + ';\n');
await browser.close();
console.log('siap:', Object.keys(M).length, 'shot');
