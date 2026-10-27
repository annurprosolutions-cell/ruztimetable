// Rakam tutorial "pengguna baharu": mula dari data kosong, masukkan data sekolah sendiri (SMK Taman Harmoni, rekaan)
// melalui borang sebenar app dalam mod demo (?demo), sehingga jadual dan relief siap.
// Hasil: shots-t/*.png + shots-t/manifest.js (kedudukan elemen untuk kamera video).
//   node capture-tutorial.mjs
// Semua permintaan ke Apps Script survey digantikan respons palsu supaya rakaman tidak menulis ke Google Sheet sebenar.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const APP = 'file://' + path.resolve(here, '../index.html') + '?demo';
const OUT = path.join(here, 'shots-t');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIXED = new Date('2026-10-26T07:45:00+08:00'); // Isnin, 7:45 pagi
const M = {};
const browser = await chromium.launch();

async function open(viewport, dsf, init) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, timezoneId: 'Asia/Kuala_Lumpur', locale: 'ms-MY', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.clock.setFixedTime(FIXED);
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('https://script.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await p.addInitScript(() => { window.print = () => {}; });
  if (init) await p.addInitScript(init.fn, init.arg);
  await p.goto(APP);
  p.errors = errors;
  return p;
}

async function shot(p, name, tags, opts = {}) {
  await p.evaluate(() => {
    document.getElementById('toast').innerHTML = ''; window.scrollTo(0, 0);
    // Chromium headless sentiasa papar tarikh mm/dd/yyyy; pengguna Malaysia nampak dd/mm/yyyy.
    document.querySelectorAll('input[type=date]').forEach((i) => {
      const v = i.value; i.dataset.origDate = v; i.type = 'text';
      if (v) i.value = v.split('-').reverse().join('/'); else i.placeholder = 'dd/mm/yyyy';
    });
  });
  await p.waitForTimeout(150);
  // pastikan tiada nama repo atau hos sebenar terpapar dalam video
  const leak = await p.evaluate(() => {
    const txt = document.body.innerText + ' ' + [...document.querySelectorAll('input,textarea')].map((e) => e.value).join(' ');
    const m = txt.match(/github|ruztimetable|127\.0\.0\.1|localhost|netlify|script\.google/i);
    return m ? m[0] : '';
  });
  if (leak) throw new Error(`Rakaman '${name}' memaparkan "${leak}". Betulkan sebelum render.`);
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
const goto = (p, page, extra = {}) => p.evaluate(({ page, extra }) => { UI.page = page; Object.assign(UI, extra); UI.menu = null; UI.render(); window.scrollTo(0, 0); }, { page, extra });

// ---------- logo sekolah rekaan ----------
const LOGO = path.join(OUT, '_logo.png');
{
  const lp = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await lp.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>
    <circle cx="128" cy="128" r="120" fill="url(#g)"/><circle cx="128" cy="128" r="104" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>
    <path d="M128 52c10 26 34 40 34 70 0 24-16 40-34 40s-34-16-34-40c0-30 24-44 34-70z" fill="#fde68a"/><path d="M70 176h116M84 196h88" stroke="#fff" stroke-width="10" stroke-linecap="round"/></svg></body>`);
  await lp.screenshot({ path: LOGO, omitBackground: true });
  await lp.close();
}

// ================= pentadbir (desktop) =================
const p = await open({ width: 1280, height: 1200 }, 2);
await p.waitForSelector('.svy');

// ---- 1. Mula: survey, popup notis, data contoh, padam untuk mula dari kosong ----
const SVY = { rows: 'x' };
void SVY;
await shot(p, 't-svy-intro', { card: '.gate-card', start: '[data-act="svyStart"]', head: '.gate-card h1' });
await p.click('[data-act="svyStart"]');
for (const [id, v] of [['peranan', 'penyelaras'], ['jenis', 'sm'], ['bil_guru', 'g2'], ['bil_kelas', 'k2']]) await p.locator(`label.opt:has(input[data-q="${id}"][value="${v}"])`).click();
await shot(p, 't-svy-isi', { card: '.gate-card', peranan: '[data-qwrap="peranan"]', jenis: '[data-qwrap="jenis"]', next: '[data-act="svyNext"]' });
// isi baki bahagian 1 melalui klik sebenar
async function answerRest(pg, part) {
  const secs = await pg.evaluate((q) => TT.surveySections(q).map((s) => s.questions), part);
  const start = await pg.evaluate(() => UI.survey.step);
  for (let i = start; i < secs.length; i++) {
    for (const q of secs[i]) {
      if (!(await pg.locator(`[data-qwrap="${q.id}"]`).count())) continue;
      if (q.type === 'single' || q.type === 'multi') { if (!(await pg.locator(`input[data-q="${q.id}"]:checked`).count())) await pg.locator(`label.opt:has(input[data-q="${q.id}"])`).first().click(); }
      else if (q.type === 'scale') await pg.locator(`label.sc:has(input[data-q="${q.id}"][value="${q.max}"])`).click();
      else if (q.type === 'text') await pg.fill(`textarea[data-q="${q.id}"]`, 'tiada');
      else if (q.type === 'matrix') for (const r of q.rows) await pg.locator(`label.opt:has(input[data-q="${q.id}"][data-row="${r.v}"])`).first().click();
      else if (q.type === 'numbers') for (const [k, f] of q.fields.entries()) await pg.fill(`input[data-q="${q.id}"][data-f="${f.v}"]`, String((k + 1) * 500));
    }
    await pg.click('.svy .row .btn.primary');
  }
}
await answerRest(p, 1);
await p.waitForSelector('.dialog');
await shot(p, 't-svy-notice', { dlg: '.dialog', fab: '.dialog .fab.prev', ok: '.dialog button[data-act="modalClose"]' });
await p.click('.dialog button[data-act="modalClose"]');
await p.evaluate(() => { UI.prefs.name = 'Pn. Rohana'; UI.prefs.lastBackup = new Date().toISOString(); UI.savePrefs(); UI.render(); });
await shot(p, 't-demo-awal', { bar: '.demobar', fab: 'button.fab', summary: '.summary', head: '.topbar', today: '.card.dark.today' });

await goto(p, 'tetapan', { setTab: 'storan' });
await tag(p, () => { [...document.querySelectorAll('main > section.card')].forEach((c) => { if (c.textContent.includes('Data contoh dan set semula')) c.dataset.shot = 'reset'; }); });
await shot(p, 't-storan', { reset: '[data-shot=reset]', padam: 'button[data-act="newBlank"]', tabs: '.phead .seg.sub', head: '.phead' });
await p.click('button[data-act="newBlank"]');
await shot(p, 't-padam', { dlg: '.dialog', ya: 'button[data-act="confirmYes"]' });
await p.click('button[data-act="confirmYes"]');
await goto(p, 'utama');
await shot(p, 't-kosong', { welcome: '.card.dark.today', mula: '.card.dark.today button[data-act="goto"]', fab: 'button.fab', head: '.topbar' });

// ---- 2. Sekolah: nama, minggu, jenama, waktu dan rehat ----
await goto(p, 'tetapan', { setTab: 'sekolah' });
await p.fill('input[data-chg="schoolName"]', 'SMK Taman Harmoni');
await p.press('input[data-chg="schoolName"]', 'Tab');
await p.setInputFiles('#logoFile', LOGO);
await p.waitForSelector('#logoBox img');
await p.click('button.swatch[data-c="#166534"]');
await tag(p, () => { const c = document.querySelectorAll('main > section.card'); c[1].dataset.shot = 'maklumat'; c[2].dataset.shot = 'jenama'; });
await shot(p, 't-sekolah', { head: '.phead', maklumat: '[data-shot=maklumat]', nama: 'input[data-chg="schoolName"]', minggu: 'select[data-chg="weekMode"]', jenama: '[data-shot=jenama]', logo: '#logoBox', warna: '.swatches' });
await goto(p, 'tetapan', { setTab: 'waktu' });
await p.click('button[data-act="periodGen"]');
await shot(p, 't-waktu-gen', { dlg: '.dialog', jana: 'button[data-act="formSave"]', borang: '#theForm' });
await p.click('button[data-act="formSave"]');
await p.fill('input[data-chg="dayLimit"][data-i="4"]', '6');
await p.press('input[data-chg="dayLimit"][data-i="4"]', 'Tab');
await tag(p, () => { const c = document.querySelectorAll('main > section.card'); c[1].dataset.shot = 'waktu'; c[2].dataset.shot = 'hari'; document.querySelector('input[data-chg="dayLimit"][data-i="4"]').closest('label').dataset.shot = 'jumaat'; });
await shot(p, 't-waktu', { head: '.phead', waktu: '[data-shot=waktu]', hari: '[data-shot=hari]', jumaat: '[data-shot=jumaat]', gen: 'button[data-act="periodGen"]' });

// ---- 3. Data: subjek, guru, kelas, bilik ----
async function bulk(pg, text) { await pg.click('button[data-act="bulk"]'); await pg.fill('#theForm textarea[name="text"]', text); }
await goto(p, 'data', { dataTab: 'subjek' });
await shot(p, 't-subjek-kosong', { bulk: 'button[data-act="bulk"]', add: 'button[data-act="add-subjek"]', tabs: '.phead .seg.sub', head: '.phead', empty: 'main .tbl' });
await bulk(p, 'Bahasa Melayu, BM\nBahasa Inggeris, BI\nMatematik, MT\nSains, SN\nSejarah, SJ\nPendidikan Islam / Moral, PI/PM\nPendidikan Jasmani, PJK\nPendidikan Seni Visual, PSV');
await shot(p, 't-subjek-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await shot(p, 't-subjek', { head: '.phead', table: 'main .tbl', tabs: '.phead .seg.sub' });

await goto(p, 'data', { dataTab: 'guru' });
await bulk(p, 'Siti Hajar Ahmad, SHJ, Bahasa\nRosnani Hashim, RNH, Bahasa\nJason Lim, JLM, Bahasa\nNurul Ain Zakaria, NRA, Bahasa\nKumaresan Raju, KMR, Matematik\nTan Wei Jie, TWJ, Matematik\nZulkifli Abdullah, ZKA, Sains\nLee Mei Ling, LML, Sains\nAhmad Syafiq, ASQ, Kemanusiaan\nKhairul Anuar, KHA, Kokurikulum\nUstazah Salmah, USM, Pendidikan Islam\nPriya Nair, PNR, Pendidikan Moral');
await shot(p, 't-guru-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await shot(p, 't-guru', { head: '.phead', table: 'main .tbl', subjek: 'main .tbl thead th:nth-child(4)', tak: 'main .tbl thead th:nth-child(6)' });
// lengkapkan seorang guru melalui borang: subjek yang boleh diajar dan waktu tak boleh
const usm = await p.evaluate(() => UI.state.teachers.find((t) => t.short === 'USM').id);
await p.click(`button[data-act="edit"][data-kind="guru"][data-id="${usm}"]`);
const pipm = await p.evaluate(() => UI.state.subjects.find((s) => s.short === 'PI/PM').id);
await p.check(`input[name="subjectIds"][value="${pipm}"]`);
await p.click('button.lnk[data-act="availCol"][data-d="4"]');
await p.click('td.av[data-k="0-0"]');
await tag(p, () => { document.querySelector('#theForm .multi').dataset.shot = 'subjek'; });
await shot(p, 't-guru-edit', { dlg: '.dialog', subjek: '[data-shot=subjek]', grid: 'table.avail', jumaat: 'button.lnk[data-act="availCol"][data-d="4"]', simpan: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
// guru lain dilengkapkan dengan cara yang sama (di sini terus melalui data supaya rakaman ringkas)
await p.evaluate(() => {
  const s = UI.state, sub = (x) => s.subjects.find((y) => y.short === x).id;
  const map = { SHJ: ['BM'], RNH: ['BM'], JLM: ['BI'], NRA: ['BI'], KMR: ['MT'], TWJ: ['MT'], ZKA: ['SN'], LML: ['SN'], ASQ: ['SJ', 'PSV'], KHA: ['PJK'], PNR: ['PI/PM'] };
  s.teachers.forEach((t) => { if (map[t.short]) t.subjectIds = map[t.short].map(sub); });
  UI.commit();
});
await shot(p, 't-guru-lengkap', { head: '.phead', table: 'main .tbl', subjek: 'main .tbl thead th:nth-child(4)', tak: 'main .tbl thead th:nth-child(6)' });

await goto(p, 'data', { dataTab: 'kelas' });
await bulk(p, '1 Amanah, 1\n1 Bestari, 1\n2 Amanah, 2\n2 Bestari, 2');
await shot(p, 't-kelas-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await p.evaluate(() => {
  const s = UI.state, t = (x) => s.teachers.find((y) => y.short === x).id;
  [['1 Amanah', 'SHJ'], ['1 Bestari', 'JLM'], ['2 Amanah', 'KMR'], ['2 Bestari', 'ZKA']].forEach(([c, h]) => { s.classes.find((x) => x.name === c).homeroomId = t(h); });
  UI.commit();
});
await shot(p, 't-kelas', { head: '.phead', table: 'main .tbl', guruKelas: 'main .tbl thead th:nth-child(3)' });

await goto(p, 'data', { dataTab: 'bilik' });
await bulk(p, 'Makmal Sains, Makmal\nBilik Seni, Bilik seni');
await shot(p, 't-bilik-bulk', { dlg: '.dialog', ta: '#theForm textarea', tambah: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await shot(p, 't-bilik', { head: '.phead', table: 'main .tbl' });

// ---- 4. Pelajaran ----
await goto(p, 'data', { dataTab: 'pelajaran' });
await shot(p, 't-pel-kosong', { head: '.phead', add: 'button[data-act="add-pelajaran"]', hint: 'main .hint', table: 'main .tbl' });
const CLS = ['1 Amanah', '1 Bestari', '2 Amanah', '2 Bestari'];
async function addAsing(pg, { subj, per, dbl = 0, room = '', teachers, name }) {
  await pg.click('button[data-act="add-pelajaran"]');
  const sid = await pg.evaluate((s) => UI.state.subjects.find((x) => x.short === s).id, subj);
  await pg.selectOption('#wzSubj', sid);
  await pg.fill('#wzPer', String(per)); await pg.fill('#wzDbl', String(dbl));
  if (room) await pg.selectOption('#wzRoom', await pg.evaluate((n) => UI.state.rooms.find((r) => r.name === n).id, room));
  await pg.click('button[data-act="wzAll"]');
  for (const [i, c] of CLS.entries()) {
    const ids = await pg.evaluate(([cn, ts]) => [UI.state.classes.find((x) => x.name === cn).id, UI.state.teachers.find((x) => x.short === ts).id], [c, teachers[i]]);
    await pg.selectOption(`[name="t_${ids[0]}"]`, ids[1]);
  }
  if (name) await shot(pg, name, { dlg: '.dialog', subj: '#wzSubj', per: '#wzPer', room: '#wzRoom', all: 'button[data-act="wzAll"]', tbl: '#wzAsing table', mod: '[name=wzMode]', tambah: 'button[data-act="wzSave"]' });
  await pg.click('button[data-act="wzSave"]');
}
await addAsing(p, { subj: 'BM', per: 5, dbl: 1, teachers: ['SHJ', 'SHJ', 'RNH', 'RNH'], name: 't-pel-wizard' });
await addAsing(p, { subj: 'BI', per: 4, teachers: ['JLM', 'JLM', 'NRA', 'NRA'] });
await addAsing(p, { subj: 'MT', per: 5, dbl: 1, teachers: ['KMR', 'KMR', 'TWJ', 'TWJ'] });
await addAsing(p, { subj: 'SN', per: 5, dbl: 1, room: 'Makmal Sains', teachers: ['ZKA', 'ZKA', 'LML', 'LML'] });
await addAsing(p, { subj: 'SJ', per: 3, teachers: ['ASQ', 'ASQ', 'ASQ', 'ASQ'] });
await addAsing(p, { subj: 'PJK', per: 2, teachers: ['KHA', 'KHA', 'KHA', 'KHA'] });
await addAsing(p, { subj: 'PSV', per: 2, room: 'Bilik Seni', teachers: ['ASQ', 'ASQ', 'ASQ', 'ASQ'] });
// gabungan PI/PM serentak bagi setiap tingkatan
async function addGabung(pg, classes, name) {
  await pg.click('button[data-act="add-pelajaran"]');
  const sid = await pg.evaluate(() => UI.state.subjects.find((x) => x.short === 'PI/PM').id);
  await pg.selectOption('#wzSubj', sid);
  await pg.fill('#wzPer', '4'); await pg.fill('#wzDbl', '1');
  await pg.check('input[name="wzMode"][value="gabung"]');
  await pg.evaluate((cn) => {
    const s = UI.state, c = cn.map((n) => s.classes.find((x) => x.name === n).id), t = ['USM', 'PNR'].map((x) => s.teachers.find((y) => y.short === x).id);
    document.querySelectorAll('[data-wz-gc]').forEach((i) => { i.checked = c.includes(i.value); });
    document.querySelectorAll('[data-wz-gt]').forEach((i) => { i.checked = t.includes(i.value); });
    document.querySelector('input[name="wzMode"][value="gabung"]').closest('.fld').dataset.shot = 'mode';
  }, classes);
  if (name) await shot(pg, name, { dlg: '.dialog', mode: '[data-shot=mode]', gabung: '#wzGabung', tambah: 'button[data-act="wzSave"]' });
  await pg.click('button[data-act="wzSave"]');
}
await addGabung(p, ['1 Amanah', '1 Bestari'], 't-pel-gabung');
await addGabung(p, ['2 Amanah', '2 Bestari']);
await shot(p, 't-pel-senarai', { head: '.phead', metric: '.phead .metric', table: 'main .tbl', filter: 'main .toolbar', chip: 'main .tbl tbody tr:first-child .chip-s' });

// ---- 5. Jana ----
await goto(p, 'jadual', { view: { type: 'class', id: null } });
await shot(p, 't-jana-kosong', { head: '.phead', jana: 'button[data-act="generate"]', chip: '.toolbar-card .chip-s', side: '.tt-side', grid: 'table.grid' });
await p.click('button[data-act="generate"]');
await p.selectOption('#gEffort', '6000');
await tag(p, () => { document.querySelector('#gEffort').closest('.fld').dataset.shot = 'effort'; });
await shot(p, 't-jana-opsyen', { dlg: '.dialog', effort: '[data-shot=effort]', mula: 'button[data-act="genStart"]' });
await p.click('.dlg-f button[data-act="modalClose"]');
const units = await p.evaluate(() => TT.buildUnits(UI.state).length);
const prog = [[6, `Meletakkan waktu: ${Math.round(units * 0.06)}/${units}`], [27, `Meletakkan waktu: ${Math.round(units * 0.55)}/${units}`], [50, `Meletakkan waktu: ${units}/${units}`], [72, 'Memperbaiki susunan (kurangkan waktu kosong guru)...'], [96, 'Memperbaiki susunan (kurangkan waktu kosong guru)...']];
for (const [i, [pct, txt]] of prog.entries()) {
  await p.evaluate(({ pct, txt }) => {
    UI.modalOpen('Menjana jadual', '<div class="prog"><div id="gbar"></div></div><p id="gtxt" class="hint"></p>', '<button class="btn">Batal</button>');
    const g = document.getElementById('gbar'); g.style.transition = 'none'; g.style.width = pct + '%';
    document.getElementById('gtxt').textContent = txt;
  }, { pct, txt });
  await shot(p, 't-prog-' + (i + 1), { dlg: '.dialog', bar: '.prog' });
}
await p.evaluate(() => UI.modalClose());
const gen = await p.evaluate(() => {
  const r = TT.generate(UI.state, { seed: 7, improveMs: 3000 });
  UI.state.placements = r.placements; UI.lastGen = Object.assign({ at: '2026-10-26T07:44:00+08:00', mode: 'worker' }, r);
  UI.save(); UI.render();
  return { placed: r.placements.length, unplaced: r.unplaced.length };
});
console.log('jana', gen);
if (gen.unplaced) throw new Error('Data tutorial tidak muat sepenuhnya: ' + gen.unplaced + ' waktu tidak diletak');
await shot(p, 't-jana-siap', { chip: '.toolbar-card .chip-s', metric: '.phead .metric', grid: 'table.grid', banner: '.banner', jana: 'button[data-act="generate"]', head: '.phead', tabs: '.phead .seg.sub' });

// ---- 6. Laras ----
await p.evaluate(() => { UI.view = { type: 'teacher', id: UI.state.teachers.find((t) => t.short === 'SHJ').id }; UI.render(); });
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
if (!mv) throw new Error('Tiada gerakan sah untuk adegan seret');
const srcSel = `td.cell.filled[data-unit="${mv.u}"]`, dstSel = `td.cell.empty[data-day="${mv.day}"][data-p="${mv.p}"]`;
await shot(p, 't-jadual-guru', { src: srcSel, dst: dstSel, grid: 'table.grid', head: '.phead', tabs: '.phead .seg.sub' });
await p.evaluate(({ mv, srcSel }) => {
  document.querySelector(srcSel).classList.add('dragging');
  mv.ok.forEach(([d, pp]) => document.querySelector(`td.cell.empty[data-day="${d}"][data-p="${pp}"]`).classList.add('ok'));
}, { mv, srcSel });
await shot(p, 't-jadual-drag', { src: srcSel, dst: dstSel, grid: 'table.grid' });
await p.evaluate((mv) => { TT.applyMove(UI.state, mv.u, mv.day, mv.p); TT.toggleLock(UI.state, mv.u); UI.save(); UI.render(); }, mv);
await shot(p, 't-jadual-lepas', { moved: srcSel, lock: `${srcSel} .cbtn`, grid: 'table.grid' });
await p.evaluate(() => { UI.view = { type: 'mclass', id: null }; UI.render(); });
await shot(p, 't-jadual-induk', { tabs: '.phead .seg.sub', print: 'button[data-act="printView"]', grid: 'table.grid.master', head: '.phead' });

// ---- 7. Relief ----
await p.setViewportSize({ width: 1280, height: 1300 });
await goto(p, 'relief', { relief: Object.assign(await p.evaluate(() => UI.relief), { tab: 'harian', date: '2026-10-26' }) });
await shot(p, 't-relief-kosong', { tambah: '.toolbar button[data-act="absenceAdd"]', head: '.phead', date: 'input[data-chg="reliefDate"]' });
await p.click('.toolbar button[data-act="absenceAdd"]');
const shj = await p.evaluate(() => UI.state.teachers.find((t) => t.short === 'SHJ').id);
await p.selectOption('#theForm select[name="teacherId"]', shj);
await tag(p, () => {
  const f = document.getElementById('theForm');
  f.querySelector('[name="teacherId"]').closest('.fld').dataset.shot = 'guru';
  f.querySelector('[name="reason"]').closest('.fld').dataset.shot = 'sebab';
  f.querySelector('[name="dateTo"]').closest('.fld').dataset.shot = 'hingga';
});
await shot(p, 't-relief-borang', { dlg: '.dialog', guru: '[data-shot=guru]', sebab: '[data-shot=sebab]', hingga: '[data-shot=hingga]', simpan: 'button[data-act="formSave"]' });
await p.click('button[data-act="formSave"]');
await p.evaluate(() => {
  const s = UI.state;
  s.absences.push({ id: 'zka', date: '2026-10-26', teacherId: s.teachers.find((t) => t.short === 'ZKA').id, from: 2, to: 5, reason: 'Kursus / Bengkel', note: '' });
  UI.save(); UI.render();
});
await shot(p, 't-relief-perlu', { auto: 'button[data-act="reliefAuto"]', table: 'table.relief', head: '.phead', metric: '.phead .metric' });
await p.click('button[data-act="reliefAuto"]');
await tag(p, () => { const rows = document.querySelectorAll('table.relief tbody tr'); rows[0].dataset.shot = 'r1'; rows[1].dataset.shot = 'r2'; });
await shot(p, 't-relief-agih', { table: 'table.relief', r1: '[data-shot=r1]', r2: '[data-shot=r2]', why: 'table.relief .why', metric: '.phead .metric', sel: 'table.relief select' });
await p.setViewportSize({ width: 1100, height: 1000 });
await p.evaluate(() => UI.actions.reliefPrint());
await p.emulateMedia({ media: 'print' });
await shot(p, 't-relief-slip', { sheet: '#printArea .sheet', slips: '#printArea .slips', slip: '#printArea .slip' });
await p.emulateMedia({ media: null });
await p.evaluate(() => { document.body.classList.remove('printing'); document.getElementById('printArea').innerHTML = ''; });
await p.setViewportSize({ width: 1280, height: 1300 });
await goto(p, 'relief');
await p.click('button[data-act="reliefMsg"]');
await shot(p, 't-relief-wa', { dlg: '.dialog', ta: '#waText', salin: 'button[data-act="copyMsg"]' });
await p.click('.dlg-f button[data-act="modalClose"]');

// ---- 8. Pantau (sejarah Oktober supaya kalendar dan statistik bermakna) ----
await p.evaluate(() => {
  const s = UI.state;
  let rnd = 11; const r = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const reasons = ['MC', 'Kursus / Bengkel', 'Urusan Rasmi', 'Cuti Rehat', 'MC'];
  TT.schoolDays(s, '2026-10-01', '2026-10-23').forEach((d, i) => {
    const k = 1 + ((r() * 2) | 0);
    s.teachers.slice().sort(() => r() - 0.5).slice(0, k).forEach((t, j) => s.absences.push({ id: `h${i}_${j}`, date: d, teacherId: t.id, from: null, to: null, reason: reasons[(r() * reasons.length) | 0], note: '' }));
    TT.autoRelief(s, d);
  });
  s.absences.push({ id: 'esok', date: '2026-10-27', teacherId: s.teachers.find((t) => t.short === 'KMR').id, from: null, to: null, reason: 'Kursus / Bengkel', note: '' });
  UI.save(); UI.relief.tab = 'kalendar'; UI.relief.month = '2026-10'; UI.render();
});
await tag(p, () => { const c = [...document.querySelectorAll('.mday')].find((x) => x.textContent.includes('BELUM')); if (c) c.dataset.shot = 'belum'; });
await shot(p, 't-kalendar', { legend: '.legend-chips', now: '.mday.now', belum: '[data-shot=belum]', cal: '.mcal', head: '.phead' });
await p.evaluate(() => { UI.relief.tab = 'statistik'; UI.relief.from = '2026-10-01'; UI.relief.to = '2026-10-31'; UI.render(); });
await tag(p, () => { document.querySelectorAll('.stats .stat')[3].dataset.shot = 'sd'; });
await shot(p, 't-stats', { tiles: '.stats', sd: '[data-shot=sd]', table: 'main section.card .tbl', metric: '.phead .metric' });
await goto(p, 'laporan');
await tag(p, () => { const c = document.querySelectorAll('main > section.card'); c[1].dataset.shot = 'semakan'; c[2].dataset.shot = 'cetak'; c[3].dataset.shot = 'beban'; });
await shot(p, 't-laporan', { head: '.phead', metric: '.phead .metric', semakan: '[data-shot=semakan]', cetak: '[data-shot=cetak]', beban: '[data-shot=beban]', csv: 'button[data-act="exportCsv"]' });

// ---- 9. Guru dan maklum balas ----
await p.setViewportSize({ width: 1280, height: 1150 });
await goto(p, 'utama');
await p.evaluate(() => { UI.menu = 'role'; UI.render(); });
await shot(p, 't-role-menu', { role: 'button.role', menu: '.menu', admin: '.menu .mi:nth-of-type(1)', guru: '.menu .mi:nth-of-type(2)', top: '.topbar' });
await p.evaluate(() => { UI.menu = null; UI.render(); });
await p.click('button.fab');
await shot(p, 't-svy2-intro', { card: '.gate-card', mula: '[data-act="svyStart"]', head: '.gate-card h1', tutup: '[data-act="svyClose"]' });
await p.click('[data-act="svyClose"]');

// paparan guru (telefon): data dan sesi demo disalin ke konteks baharu
const data = await p.evaluate(() => localStorage.getItem('jadual-demo-v1'));
const me = await p.evaluate(() => UI.state.reliefs.find((x) => x.date === '2026-10-26' && x.status === 'assigned').reliefTeacherId);
const g = await open({ width: 412, height: 1500 }, 3, {
  fn: ([d, id]) => {
    localStorage.setItem('jadual-demo-v1', d);
    localStorage.setItem('jadual-demo-prefs', JSON.stringify({ role: 'guru', me: id, name: '', deviceId: 'dg', lastBackup: new Date().toISOString(), sheet: null, survey: { id: 'abcdefgh1234', p1: '2026-10-26T00:00:00Z', p2: null, noticed: true } }));
  },
  arg: [data, me]
});
await g.waitForSelector('header.topbar');
await shot(g, 't-guru-dash', { alert: '.alert', slip: '.alert button', today: '.card.dark.today', rel: '.drow.rel', top: '.topbar', fab: 'button.fab', bar: '.demobar' }, { mobile: true });
await goto(g, 'jadualku');
await shot(g, 't-guru-jadual', { head: '.phead', grid: 'table.grid', print: 'button[data-act="printMine"]' }, { mobile: true });
await goto(g, 'reliefku');
await shot(g, 't-guru-relief', { head: '.phead', first: 'main > section.card:nth-of-type(2)', fair: '.fair' }, { mobile: true });

const errs = [...p.errors, ...g.errors];
fs.writeFileSync(path.join(OUT, 'manifest.js'), 'window.MANIFEST = ' + JSON.stringify(M, null, 1) + ';\n');
await browser.close();
console.log('siap:', Object.keys(M).length, 'shot', errs.length ? 'RALAT HALAMAN: ' + errs.join(' | ') : '');
