import test from 'node:test';
import assert from 'node:assert';
import { handle, markdown, artSlugify, readMinutes } from '../worker/index.mjs';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, v); }
  async delete(k) { this.m.delete(k); }
  async list() { return { keys: [...this.m.keys()].map((name) => ({ name })), list_complete: true }; }
}
const NOW = Date.parse('2026-11-04T02:00:00Z');
const mkEnv = () => ({ LICENSES: new KV(), ADMIN_TOKEN: 'rahsia-admin', ALLOWED_ORIGINS: 'https://app.test' });
const adm = (env, method, path, body, token = 'rahsia-admin') => handle(new Request('https://w.test' + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { now: NOW });
const pub = (env, path, now = NOW) => handle(new Request('https://w.test' + path), env, { now });

test('markdown: format asas dan HTML/pautan berbahaya dibuang', () => {
  const h = markdown('# Tajuk\n\nIni **tebal**, *condong* dan [pautan](https://contoh.com/a_b) <script>alert(1)</script>\n\n- satu\n- dua\n\n1. a\n2. b\n\n> petikan\n\n---\n\n[jahat](javascript:alert(1)) ![g](/artikel/img/x.png) `kod`');
  assert.match(h, /<h2 id="tajuk">Tajuk<\/h2>/);
  assert.match(h, /<strong>tebal<\/strong>, <em>condong<\/em>/);
  assert.match(h, /<a href="https:\/\/contoh.com\/a_b" target="_blank" rel="noopener">pautan<\/a>/);
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;'));
  assert.match(h, /<ul><li>satu<\/li><li>dua<\/li><\/ul>/);
  assert.match(h, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(h, /<blockquote><p>petikan<\/p><\/blockquote>/);
  assert.ok(h.includes('<hr>'));
  assert.ok(!/href="javascript/i.test(h));
  assert.match(h, /<img src="\/artikel\/img\/x.png" alt="g" loading="lazy">/);
  assert.match(h, /<code>kod<\/code>/);
  assert.ok(!markdown('[x](https://a.com/"onmouseover="alert(1))').includes('"onmouseover'));
  assert.strictEqual(artSlugify('Cara Agih Relief: Adil & Pantas!'), 'cara-agih-relief-adil-pantas');
  assert.strictEqual(readMinutes('kata '.repeat(450)), 2);
});

test('admin artikel: perlu kebenaran, cipta draf, terbit, ubah slug, versi lama, padam', async () => {
  const env = mkEnv();
  assert.strictEqual((await adm(env, 'GET', '/admin/articles', null, 'salah')).status, 401);
  let r = await adm(env, 'POST', '/admin/articles', { title: 'Cara Agih Relief', desc: 'Ringkas', body: '## Satu\n\nIsi.' });
  assert.strictEqual(r.status, 200);
  let a = (await r.json()).article;
  assert.deepStrictEqual([a.slug, a.status, a.date], ['cara-agih-relief', 'draft', '']);
  // draf tidak kelihatan kepada awam
  assert.strictEqual((await pub(env, '/artikel/cara-agih-relief/')).status, 404);
  assert.ok(!(await (await pub(env, '/artikel/')).text()).includes('Cara Agih Relief'));
  // slug sama untuk artikel baharu ditolak
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: 'Cara Agih Relief' })).status, 409);
  // terbit: tarikh hari ini diisi; versi lama disimpan
  r = await adm(env, 'POST', '/admin/articles', { title: 'Cara Agih Relief', desc: 'Ringkas', body: '## Satu\n\nIsi baharu.', status: 'published', oldSlug: 'cara-agih-relief', base: a.updated });
  a = (await r.json()).article;
  assert.deepStrictEqual([a.status, a.date, a.history.length, a.history[0].body], ['published', '2026-11-04', 1, '## Satu\n\nIsi.']);
  // konflik: base lama ditolak
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: 'X', oldSlug: 'cara-agih-relief', base: 'lama' })).status, 409);
  r = await pub(env, '/artikel/cara-agih-relief/');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>Cara Agih Relief · Annur Time Table<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/annurtimetable.com\/artikel\/cara-agih-relief\/">/);
  assert.match(html, /<h2 id="satu">Satu<\/h2>/);
  assert.match(html, /application\/ld\+json/);
  assert.strictEqual((await pub(env, '/artikel/cara-agih-relief')).headers.get('location'), '/artikel/cara-agih-relief/');
  assert.match(await (await pub(env, '/artikel/')).text(), /href="\/artikel\/cara-agih-relief\/"/);
  assert.match(await (await pub(env, '/artikel/sitemap.xml')).text(), /<loc>https:\/\/annurtimetable.com\/artikel\/cara-agih-relief\/<\/loc>/);
  assert.match(await (await pub(env, '/artikel/feed.xml')).text(), /<item><title>Cara Agih Relief<\/title>/);
  // tukar slug: alamat lama dialihkan
  r = await adm(env, 'POST', '/admin/articles', { title: 'Cara Agih Relief', slug: 'agih-relief-adil', body: 'x', status: 'published', oldSlug: 'cara-agih-relief', base: a.updated });
  assert.strictEqual(r.status, 200);
  r = await pub(env, '/artikel/cara-agih-relief/');
  assert.deepStrictEqual([r.status, r.headers.get('location')], [301, '/artikel/agih-relief-adil/']);
  assert.strictEqual((await pub(env, '/artikel/agih-relief-adil/')).status, 200);
  let list = (await (await adm(env, 'GET', '/admin/articles')).json()).articles;
  assert.deepStrictEqual(list.map((x) => x.slug), ['agih-relief-adil']);
  // overview pemilik tidak terganggu oleh kunci artikel
  const ov = await (await adm(env, 'GET', '/admin/overview')).json();
  assert.strictEqual(ov.licences.length, 0);
  assert.strictEqual((await adm(env, 'DELETE', '/admin/articles/agih-relief-adil')).status, 200);
  list = (await (await adm(env, 'GET', '/admin/articles')).json()).articles;
  assert.strictEqual(list.length, 0);
  assert.strictEqual((await pub(env, '/artikel/agih-relief-adil/')).status, 404);
});

test('artikel dijadualkan: hanya muncul pada tarikh terbit', async () => {
  const env = mkEnv();
  await adm(env, 'POST', '/admin/articles', { title: 'Akan Datang', body: 'x', status: 'published', date: '2026-11-10' });
  assert.strictEqual((await pub(env, '/artikel/akan-datang/')).status, 404);
  assert.strictEqual((await pub(env, '/artikel/akan-datang/', Date.parse('2026-11-10T01:00:00Z'))).status, 200);
});

test('gambar artikel: muat naik, had jenis dan saiz, dihidang dengan cache panjang', async () => {
  const env = mkEnv();
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  assert.strictEqual((await adm(env, 'POST', '/admin/articles/image', { type: 'image/svg+xml', data: png })).status, 400);
  assert.strictEqual((await adm(env, 'POST', '/admin/articles/image', { type: 'image/png', data: 'A'.repeat(2200000) })).status, 400);
  const j = await (await adm(env, 'POST', '/admin/articles/image', { type: 'image/png', data: 'data:image/png;base64,' + png })).json();
  assert.match(j.url, /^\/artikel\/img\/[a-f0-9]{16}\.png$/);
  const r = await pub(env, j.url);
  assert.deepStrictEqual([r.status, r.headers.get('content-type')], [200, 'image/png']);
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString('hex'), '89504e470d0a1a0a0000000d49484452');
  assert.strictEqual((await pub(env, '/artikel/img/../x')).status, 404);
});

test('pratonton admin dan input tidak sah', async () => {
  const env = mkEnv();
  const p = await (await adm(env, 'POST', '/admin/articles/preview', { body: '**a**' })).json();
  assert.strictEqual(p.html, '<p><strong>a</strong></p>');
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: '' })).status, 400);
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: 'A', slug: 'Ada Ruang' })).status, 400);
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: 'A', cover: 'javascript:alert(1)' })).status, 400);
  assert.strictEqual((await adm(env, 'POST', '/admin/articles', { title: 'A', slug: 'img' })).status, 400);
});

test('draf awal dalam admin/artikel-awal.json sah dan boleh diimport', async () => {
  const fs = await import('node:fs');
  const arr = JSON.parse(fs.readFileSync(new URL('../admin/artikel-awal.json', import.meta.url), 'utf8'));
  assert.ok(arr.length >= 3);
  const env = mkEnv();
  for (const a of arr) {
    assert.ok(a.desc.length <= 160, a.slug);
    const r = await adm(env, 'POST', '/admin/articles', Object.assign({}, a, { status: 'draft' }));
    assert.strictEqual(r.status, 200, a.slug);
  }
  assert.strictEqual((await (await adm(env, 'GET', '/admin/articles')).json()).articles.length, arr.length);
});
