const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../js/redirect.js'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const live = (() => { const w = {}; vm.runInNewContext(cfgSrc, { window: w }); return w.APP_CONFIG; })();
const run = (host, pathname, search, cfg, hash) => {
  let to = null;
  const w = { APP_CONFIG: cfg };
  vm.runInNewContext(src, { window: w, location: { hostname: host, pathname, search: search || '', hash: hash || '', replace: (u) => { to = u; } } });
  return { to, flag: !!w.__redirecting };
};
const C = { canonicalUrl: 'https://annurtimetable.com/', oldHosts: ['ruzjadual.netlify.app', 'annurprosolutions-cell.github.io'] };

test('alamat lama dihantar ke alamat rasmi dengan laluan dan parameter sama', () => {
  assert.strictEqual(run('ruzjadual.netlify.app', '/', '?demo', C).to, 'https://annurtimetable.com/?demo');
  assert.strictEqual(run('ruzjadual.netlify.app', '/privasi.html', '', C).to, 'https://annurtimetable.com/privasi.html');
  const g = 'a'.repeat(44);
  assert.strictEqual(run('annurprosolutions-cell.github.io', '/ruztimetable/', `?g=${g}`, C).to, `https://annurtimetable.com/?g=${g}`, 'GitHub Pages: /ruztimetable/ dibuang, pautan guru kekal');
  assert.strictEqual(run('annurprosolutions-cell.github.io', '/ruztimetable/privasi.html', '', C).to, 'https://annurtimetable.com/privasi.html');
  assert.strictEqual(run('ruzjadual.netlify.app', '/', '?demo', C, '#x').to, 'https://annurtimetable.com/?demo#x');
  assert.strictEqual(run('ruzjadual.netlify.app', '/', '', C).flag, true, 'app tidak dimulakan pada alamat lama');
});

test('alamat rasmi, localhost dan konfigurasi kosong tidak dialih', () => {
  assert.deepStrictEqual(run('annurtimetable.com', '/', '?demo', C), { to: null, flag: false });
  assert.deepStrictEqual(run('127.0.0.1', '/', '', C), { to: null, flag: false });
  assert.deepStrictEqual(run('ruzjadual.netlify.app', '/', '', { canonicalUrl: '', oldHosts: C.oldHosts }), { to: null, flag: false });
  assert.deepStrictEqual(run('ruzjadual.netlify.app', '/', '', {}), { to: null, flag: false });
});

test('config sebenar: semua alamat lama dihantar ke annurtimetable.com, alamat rasmi tidak berpusing', () => {
  assert.strictEqual(live.canonicalUrl, 'https://annurtimetable.com');
  const canonicalHost = new URL(live.canonicalUrl).hostname;
  assert.ok(!live.oldHosts.includes(canonicalHost), 'alamat rasmi tidak boleh ada dalam senarai lama (gelung)');
  for (const h of ['ruzjadual.netlify.app', 'annurprosolutions-cell.github.io', 'annurtimetable.annurprosolutions.workers.dev', 'www.annurtimetable.com']) {
    assert.ok(run(h, '/', '?demo', live).to.startsWith('https://annurtimetable.com/'), h);
  }
  assert.strictEqual(run(canonicalHost, '/', '', live).to, null);
});
