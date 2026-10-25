const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/relief.js');
require('../js/brand.js');
require('../js/sheets.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('brandPalette: warna sah, dan aksen sentiasa boleh dibaca dengan teks putih', () => {
  for (const c of ['#1e3a8a', '#ffff00', '#ffffff', '#f5c518', '#00ff00', '#fcd34d', '#000000', '#be123c']) {
    const p = TT.brandPalette(c);
    assert.ok(TT.contrast(p.accent, '#ffffff') >= 4.5, `${c} -> ${p.accent} kontras ${TT.contrast(p.accent, '#ffffff').toFixed(2)}`);
    assert.ok(TT.contrast(p.navy, '#ffffff') >= 7, `${c} navy`);
    for (const v of Object.values(p)) assert.match(v, /^#[0-9a-f]{6}$/);
  }
});

test('brandPalette: warna tak sah jatuh balik ke lalai', () => {
  const d = TT.brandPalette('');
  assert.strictEqual(TT.brandPalette('merah').base, d.base);
  assert.strictEqual(TT.brandPalette('#12345').base, d.base);
  assert.strictEqual(TT.brandPalette('#ABCDEF').base, '#abcdef');
});

test('validLogo: hanya imej data URL bersaiz muat sel Sheets', () => {
  assert.ok(TT.validLogo(PNG));
  assert.ok(!TT.validLogo(''));
  assert.ok(!TT.validLogo('https://jahat.test/logo.png'));
  assert.ok(!TT.validLogo('data:text/html;base64,PHNjcmlwdD4='));
  assert.ok(!TT.validLogo('data:image/svg+xml;base64,PHN2Zz4='), 'SVG ditolak (boleh mengandungi skrip)');
  assert.ok(!TT.validLogo('data:image/png;base64,' + 'A'.repeat(TT.LOGO_MAX_CHARS)));
  assert.ok(!TT.validLogo('data:image/png;base64,AAAA" onerror="x'));
});

test('Sheets: logo dan warna pergi-balik; logo terlalu besar atau jahat tidak ditulis', () => {
  const s = TT.sample();
  s.school.logo = PNG; s.school.color = '#0f766e';
  let back = TT.fromSheets(JSON.parse(JSON.stringify(TT.toSheets(s, {}))));
  assert.strictEqual(back.school.logo, PNG);
  assert.strictEqual(back.school.color, '#0f766e');
  s.school.logo = 'data:image/png;base64,' + 'A'.repeat(60000);
  const tabs = TT.toSheets(s, {});
  const cells = tabs.Sekolah.flat().filter((c) => typeof c === 'string');
  assert.ok(cells.every((c) => c.length < 50000), 'sel melebihi had Google Sheets');
  assert.strictEqual(TT.fromSheets(JSON.parse(JSON.stringify(tabs))).school.logo, '');
  // Sheet yang disunting orang: nilai jahat dibuang semasa muat
  const evil = JSON.parse(JSON.stringify(TT.toSheets(TT.sample(), {})));
  evil.Sekolah.push(['logo', 'javascript:alert(1)']); evil.Sekolah.push(['warna', 'red;background:url(x)']);
  back = TT.fromSheets(evil);
  assert.deepStrictEqual([back.school.logo, back.school.color], ['', '']);
});

test('migrate: data lama tanpa logo/warna dilengkapkan', () => {
  const s = TT.migrate({ school: { name: 'Lama', weekMode: 'mon-fri' }, teachers: [], lessons: [] });
  assert.deepStrictEqual([s.school.logo, s.school.color], ['', '']);
});
