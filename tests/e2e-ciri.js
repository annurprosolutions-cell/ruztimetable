// Ujian pelayar untuk ciri gelombang 1: waktu berbeza ikut tahap, sekatan serentak, peraturan relief,
// paparan semua guru, gabung kelas, slip format jadual, import aSc, muat turun Excel, arkib, mod fokus relief.
// Jalankan: node tests/e2e-ciri.js   (Chromium Playwright, jam tetap Isnin 26/10/2026 07:45 MYT)
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const TT = require('../js/core.js');
require('../js/xlsx.js');

const ROOT = path.resolve(__dirname, '..');
const FIXED = new Date('2026-10-26T07:45:00+08:00');
const step = (m) => console.log('  ok  ' + m);

(async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jadual-e2e-'));
  try {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 1500 }, timezoneId: 'Asia/Kuala_Lumpur', acceptDownloads: true, serviceWorkers: 'block' });
    const pg = await ctx.newPage();
    await pg.clock.setFixedTime(FIXED);
    const errors = [];
    pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await pg.route('https://script.google.com/**', (r) => r.abort());
    await pg.addInitScript(() => {
      window.print = () => { window.__printed = document.getElementById('printArea').innerHTML; window.dispatchEvent(new Event('afterprint')); };
      if (!localStorage.getItem('jadual-demo-prefs')) localStorage.setItem('jadual-demo-prefs', JSON.stringify({ survey: { id: 'ujianciri0001', p1: '2026-10-26T00:00:00.000Z', p2: '2026-10-26T00:00:00.000Z' } }));
    });
    await pg.goto(`http://127.0.0.1:${server.address().port}/?demo`);
    await pg.waitForSelector('header.topbar', { timeout: 60000 });
    const st = () => pg.evaluate(() => JSON.parse(JSON.stringify(UI.state)));
    const nav = (p) => pg.click(`nav button[data-p="${p}"]`);
    const tab = (k) => pg.click(`button[data-act="tab"][data-k="${k}"]`);
    const download = async (click) => { const [d] = await Promise.all([pg.waitForEvent('download'), click()]); const f = path.join(tmp, d.suggestedFilename()); await d.saveAs(f); return f; };
    // UI.print memanggil window.print selepas 50 ms: tunggu hasil cetakan baharu
    const printed = async (click) => { await pg.evaluate(() => { window.__printed = null; }); await click(); await pg.waitForFunction(() => window.__printed); return pg.evaluate(() => window.__printed); };
    const generate = async () => {
      await nav('jadual');
      await pg.click('button[data-act="generate"]');
      await pg.selectOption('#gMode', 'fresh');
      await pg.selectOption('#gEffort', '2000');
      await pg.click('button[data-act="genStart"]');
      await pg.waitForFunction(() => UI.lastGen && !document.querySelector('.overlay'), null, { timeout: 90000 });
    };

    // ---- waktu berbeza ikut tahap ----
    console.log('Waktu berbeza ikut tahap (Beta)');
    await nav('tetapan'); await tab('waktu');
    await pg.check('input[name="tmode"][value="1"]');
    let s = await st();
    assert.strictEqual(s.school.multiTime, true);
    assert.strictEqual(s.timeSets.length, 1);
    assert.strictEqual(s.school.mainSetName, 'Tahap 2');
    // Tahap 1: mula 07:30, waktu 40 minit, rehat lebih awal (selepas waktu 3)
    await pg.click('button[data-act="periodGen"][data-k="1"]');
    await pg.fill('[name="start"]', '07:30'); await pg.fill('[name="len"]', '40'); await pg.fill('[name="n"]', '8'); await pg.fill('[name="brkAfter"]', '3'); await pg.fill('[name="brkLen"]', '30');
    await pg.click('button[data-act="formSave"]');
    await pg.fill('#lv_1', '1');
    await pg.click('button[data-act="setAssignLevels"]');
    s = await st();
    assert.strictEqual(s.timeSets[0].periods[3].type, 'break');
    assert.strictEqual(s.classes.filter((c) => c.timeSet === s.timeSets[0].id).length, 3, '3 kelas tingkatan 1 dalam Tahap 1');
    assert.strictEqual(await pg.locator('select[data-chg="classSet"]').count(), s.classes.length);
    await generate();
    s = await st();
    const res = await pg.evaluate(() => {
      const s = UI.state, tm = TT.timeModel(s), m = TT.maps(s);
      const errs = TT.validate(s).issues.filter((i) => i.sev === 'error').length;
      // semakan bebas: tiada guru bertindih ikut masa sebenar merentas set
      let clash = 0;
      const byT = new Map();
      for (const p of s.placements) {
        const l = m.lesson.get(p.lessonId), [a0, a1] = TT.atomRange(tm, TT.lessonSetIdx(s, l), p.start, p.len);
        for (const t of l.teacherIds) { if (!byT.has(t)) byT.set(t, []); byT.get(t).push([p.day, a0, a1]); }
      }
      byT.forEach((list) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i][0] === list[j][0] && list[i][1] < list[j][2] && list[j][1] < list[i][2]) clash++; });
      return { errs, clash, un: TT.unplaced(s).length, multi: tm.multi, A: tm.A };
    });
    assert.deepStrictEqual([res.errs, res.clash, res.multi], [0, 0, true]);
    assert.ok(res.un <= 3, `waktu tidak diletak: ${res.un}`);
    await tab('teacher');
    assert.ok(await pg.locator('table.grid.atoms').count(), 'paparan guru ikut masa');
    assert.ok(await pg.locator('.banner', { hasText: 'Waktu berbeza ikut set' }).count());
    await tab('mclass');
    assert.strictEqual(await pg.locator('h3.seth').count(), 2, 'induk kelas dipecah ikut set');
    step(`set Tahap 1 (rehat awal) + Tahap 2, kelas ikut tahun, jana: 0 konflik, 0 guru bertindih masa (${res.A} potongan masa)`);

    // kembali kepada satu set supaya ujian seterusnya guna data demo asal
    await nav('tetapan'); await tab('waktu');
    await pg.check('input[name="tmode"][value="0"]');
    assert.strictEqual((await st()).school.multiTime, false);

    // ---- sekatan serentak ----
    console.log('Sekatan serentak');
    await tab('sekatan');
    await pg.click('button[data-act="blockEdit"]');
    await pg.fill('[name="name"]', 'Mesyuarat guru');
    await pg.check('[name="days"][value="2"]');
    await pg.selectOption('[name="from"]', '6'); await pg.selectOption('[name="to"]', '7');
    await pg.click('button[data-act="formSave"]');
    s = await st();
    assert.deepStrictEqual(s.blocks.map((x) => [x.name, x.days, x.from, x.to, x.teacherIds.length]), [['Mesyuarat guru', [2], 6, 7, 0]]);
    assert.ok(await pg.locator('table.tbl td', { hasText: 'Semua guru' }).count());
    await generate();
    s = await st();
    assert.ok(!s.placements.some((p) => p.day === 2 && p.start + p.len > 6 && p.start <= 7), 'tiada kelas Rabu waktu 7-8');
    assert.strictEqual(await pg.evaluate(() => TT.validate(UI.state).issues.filter((i) => i.sev === 'error').length), 0);
    await tab('teacher');
    assert.ok(await pg.locator('td.cell.unav span', { hasText: 'Mesyuarat guru' }).count() >= 2, 'jadual guru tunjuk nama sekatan');
    step('sekatan Rabu waktu 7-8 untuk semua guru: dihormati penjana, dipapar dalam jadual guru');

    // ---- hari di kiri + Excel ----
    console.log('Paparan dan muat turun');
    await tab('class');
    await pg.click('button[data-act="axisToggle"]');
    assert.ok(await pg.locator('table.grid.left').count());
    assert.strictEqual(await pg.locator('table.grid.left tbody tr').count(), 5, 'satu baris setiap hari');
    await nav('laporan');
    const fx = await download(() => pg.click('button[data-act="xlsxAll"][data-kind="teacher"]'));
    const book = await TT.xlsxRead(fs.readFileSync(fx));
    assert.strictEqual(book.sheets.length, s.teachers.length, 'satu tab setiap guru');
    assert.strictEqual(book.sheets[0].rows[1][0], 'Hari', 'Excel ikut kedudukan hari pilihan (kiri)');
    assert.ok(book.sheets[0].rows.slice(2).some((r) => r.some((c) => /^[A-Z/]+\n/.test(String(c)))), 'sel berisi subjek dan kelas');
    await pg.click('button[data-act="axisSet"][data-v="top"]');
    const fr = await download(() => pg.click('button[data-act="xlsxAll"][data-kind="room"]'));
    const rb = await TT.xlsxRead(fs.readFileSync(fr));
    assert.strictEqual(rb.sheets.length, s.rooms.length);
    assert.deepStrictEqual(rb.sheets[0].rows[1].slice(0, 2), ['Waktu', 'Isnin']);
    assert.ok((await printed(() => pg.click('button[data-act="printAll"][data-kind="room"]'))).includes('Jadual Waktu Bilik'));
    step('hari di kiri/atas, Excel jadual guru (satu tab setiap guru) dan bilik, cetak bilik sahaja');

    // ---- relief ----
    console.log('Relief');
    await nav('tetapan'); await tab('relief');
    await pg.fill('[data-chg="reliefCfg"][data-k="maxPerWeek"]', '6'); await pg.press('[data-chg="reliefCfg"][data-k="maxPerWeek"]', 'Tab');
    await pg.check('[data-chg="reliefBool"][data-k="needGap"]');
    await pg.fill('[data-chg="reliefRoles"]', 'GB, PK'); await pg.press('[data-chg="reliefRoles"]', 'Tab');
    s = await st();
    assert.deepStrictEqual([s.settings.relief.maxPerWeek, s.settings.relief.needGap, s.settings.relief.excludeRoles], [6, true, 'GB, PK']);
    await nav('relief');
    await pg.click('button[data-act="reliefClear"]'); await pg.click('button[data-act="confirmYes"]');
    await pg.click('button[data-act="reliefView"][data-v="guru"]');
    assert.ok(await pg.locator('table.mxt').count());
    const before = (await st()).reliefs.filter((r) => r.date === '2026-10-26').length;
    await pg.locator('td.mx.pick').first().click();
    let after = (await st()).reliefs.filter((r) => r.date === '2026-10-26' && r.status === 'assigned');
    assert.strictEqual(after.length, before + 1, 'klik petak lapang = guru ganti');
    await pg.click('button[data-act="reliefView"][data-v="senarai"]');
    // gabung dengan kelas tertentu
    const sel = pg.locator('select[data-chg="reliefPick"]').filter({ has: pg.locator('optgroup[label="Gabung dengan kelas"]') }).first();
    const val = await sel.evaluate((x) => x.querySelector('optgroup[label="Gabung dengan kelas"] option').value);
    await sel.selectOption(val);
    s = await st();
    const g = s.reliefs.find((r) => r.status === 'gabung');
    assert.strictEqual(g.mergeClassId, val.slice(2));
    assert.ok(await pg.locator('small.why', { hasText: 'Gabung dengan' }).count());
    await pg.click('button[data-act="reliefAuto"]');
    const slip = await printed(() => pg.click('button[data-act="reliefPrint"]'));
    assert.ok(/SLIP GURU GANTI/.test(slip) && /RELIEF<\/b> ganti/.test(slip) && /Kelas sendiri/.test(slip), 'slip format jadual: kelas sendiri + relief');
    assert.ok(/Gabung dengan/.test(slip));
    step('peraturan relief disimpan, paparan semua guru (klik untuk agih), gabung dengan kelas tertentu, slip format jadual');

    // ---- import aSc ----
    console.log('Import aSc');
    const xf = path.join(tmp, 'DATA_JADUAL.xlsx');
    fs.writeFileSync(xf, TT.xlsxWrite([
      { name: '1Kelas', rows: [['', 'NAMA KELAS DAN KOD 2026'], [], ['BIL', 'Kelas', 'KOD'], [1, '4 IBNU SINA', '4 IBS'], [2, '5 IBNU SINA', '5 IBS']] },
      { name: '3Guru', rows: [['BIL', 'NAMA', 'KOD'], [1, 'GURU IMPORT SATU', 'GI1'], [2, 'Aminah Yusof', 'AMY']] },
      { name: '4Bilik', rows: [['NAMA BILIK', 'KOD'], ['MAKMAL KOMPUTER 1', 'MK1']] }
    ]));
    const t0 = (await st()).teachers.length, c0 = (await st()).classes.length;
    await nav('data');
    await pg.setInputFiles('#ascFile', xf);
    await pg.waitForSelector('.impgrid');
    assert.ok(await pg.locator('label.impk', { hasText: 'Guru: 2' }).locator('small', { hasText: '1 baharu, 1 sudah ada' }).count());
    await pg.click('button[data-act="ascApply"]');
    s = await st();
    assert.deepStrictEqual([s.teachers.length - t0, s.classes.length - c0], [1, 2]);
    assert.strictEqual(s.classes.find((c) => c.name === '4 IBNU SINA').level, '4');
    assert.strictEqual(s.rooms.find((r) => r.name === 'MAKMAL KOMPUTER 1').type, 'Makmal');
    step('import Excel eksport aSc: tab dikenal pasti, nama sedia ada tidak berganda, tingkatan daripada nama kelas');

    // ---- arkib ----
    console.log('Arkib dan bersih');
    await pg.evaluate(() => {
      const s = UI.state, t = s.teachers[0].id;
      for (let i = 0; i < 5; i++) s.absences.push({ id: 'old' + i, date: `2025-0${i + 3}-10`, teacherId: t, from: null, to: null, reason: 'MC', note: '' });
      s.reliefs.push({ id: 'oldr', key: 'k', date: '2025-03-10', absentTeacherId: t, unitId: '', lessonId: s.lessons[0].id, classIds: [], subjectId: '', periods: [0], status: 'assigned', reliefTeacherId: s.teachers[1].id, note: '', mergeClassId: null });
      UI.save(); UI.render();
    });
    await nav('utama');
    assert.ok(await pg.locator('.act-item', { hasText: 'Sejarah relief melebihi 12 bulan' }).count(), 'peringatan arkib');
    await nav('tetapan'); await tab('storan');
    assert.ok(await pg.locator('.card', { hasText: 'Arkib dan bersih sejarah' }).locator('.chip-s.amber').count());
    const keep = (await st()).absences.filter((a) => a.date >= '2026-01-01').length;
    const fa = await download(() => pg.click('button[data-act="archiveRun"][data-to="file"]'));
    const ab = await TT.xlsxRead(fs.readFileSync(fa));
    assert.deepStrictEqual(ab.sheets.map((x) => x.name), ['Ringkasan', 'TidakHadir', 'Relief']);
    assert.strictEqual(ab.sheets[1].rows.length, 6, '5 rekod tidak hadir lama + tajuk');
    await pg.click('button[data-act="confirmYes"]');
    s = await st();
    assert.ok(s.absences.every((a) => a.date >= '2026-01-01') && s.absences.length === keep, 'hanya rekod lama dibuang');
    assert.strictEqual(s.archives.length, 1);
    assert.ok(await pg.locator('ul.plain li', { hasText: 'Arkib Relief' }).count());
    step('arkib: peringatan > 12 bulan, fail Excel (Ringkasan, TidakHadir, Relief), rekod lama dibuang selepas pengesahan');

    // ---- mod fokus relief ----
    await tab('sekolah');
    await pg.check('[data-chg="focusRelief"]');
    const navs = await pg.$$eval('nav.seg.main button', (x) => x.map((y) => y.dataset.p));
    assert.deepStrictEqual(navs, ['utama', 'relief', 'data', 'tetapan']);
    await pg.reload(); await pg.waitForSelector('header.topbar');
    assert.strictEqual(await pg.evaluate(() => UI.page), 'relief', 'buka terus halaman Relief');
    step('mod fokus relief: menu ringkas, buka terus Relief');

    assert.deepStrictEqual(errors, []);
    console.log('SEMUA UJIAN E2E CIRI BAHARU LULUS');
  } finally {
    await b.close(); server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
