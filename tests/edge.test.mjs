import test from 'node:test';
import assert from 'node:assert';
import worker from '../edge/worker.js';

// HTMLRewriter ialah API runtime Cloudflare, tiada dalam Node: tiruan minimum yang menyokong prepend() pada <head>
globalThis.HTMLRewriter = class {
  on(sel, h) { this.sel = sel; this.h = h; return this; }
  transform(res) {
    const h = this.h, sel = this.sel;
    const body = new ReadableStream({ async start(c) {
      const t = await res.text(); let ins = '';
      h.element({ prepend: (x, o) => { assert.deepStrictEqual(o, { html: true }); ins += x; } });
      c.enqueue(new TextEncoder().encode(t.replace(`<${sel}>`, `<${sel}>` + ins))); c.close();
    } });
    return new Response(body, { status: res.status, headers: res.headers });
  }
};

const HTML = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body><div id="app"></div></body></html>';
const seen = [];
const env = {
  ASSETS: { fetch: async (req) => {
    seen.push(new URL(req.url).pathname);
    const p = new URL(req.url).pathname;
    if (p === '/') return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (p === '/config.js') return new Response('window.X=1', { headers: { 'content-type': 'text/javascript' } });
    return new Response('tiada', { status: 404 });
  } }
};
const get = (path, method = 'GET') => worker.fetch(new Request('https://annurtimetable.com' + path, { method }), env);

test('/s/<nama>: index.html dengan <base href="/"> disuntik di awal <head>', async () => {
  for (const p of ['/s/smkwakanda', '/s/smkwakanda/', '/s/smk-wakanda-2']) {
    const r = await get(p);
    assert.strictEqual(r.status, 200, p);
    const t = await r.text();
    assert.ok(t.includes('<head><base href="/"><meta charset="utf-8">'), t);
    assert.strictEqual(r.headers.get('cache-control'), 'no-cache');
    assert.match(r.headers.get('content-type'), /text\/html/);
  }
  assert.ok(seen.every((p) => p === '/'), 'sentiasa minta "/" (bukan /index.html yang dialihkan)');
});

test('selain /s/<nama>: dilayan terus oleh fail statik tanpa diubah', async () => {
  seen.length = 0;
  assert.strictEqual(await (await get('/config.js')).text(), 'window.X=1');
  assert.strictEqual((await get('/tiada')).status, 404);
  assert.strictEqual((await get('/s/a/b')).status, 404, 'laluan lebih dalam bukan pautan sekolah');
  assert.strictEqual((await get('/s')).status, 404);
  assert.strictEqual(await (await get('/')).text(), HTML, 'laman utama tidak disentuh');
  assert.ok(!(await (await get('/')).text()).includes('<base'));
  assert.strictEqual((await worker.fetch(new Request('https://annurtimetable.com/s/smkwakanda', { method: 'POST' }), env)).status, 404, 'hanya GET');
});

test('/artikel/*: diproksi ke Worker lesen, laluan lain tidak', async () => {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (u, o) => { calls.push([String(u), o && o.redirect]); return new Response('<h1>artikel</h1>', { headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=60' } }); };
  try {
    const r = await worker.fetch(new Request('https://annurtimetable.com/artikel/cara-agih/?a=1'), {}, {});
    assert.strictEqual(await r.text(), '<h1>artikel</h1>');
    assert.deepStrictEqual(calls[0], ['https://jadual-sekolah-lesen.annurprosolutions.workers.dev/artikel/cara-agih/?a=1', 'manual']);
    await worker.fetch(new Request('https://annurtimetable.com/artikel'), { LICENSE_URL: 'https://lesen.test/' }, {});
    assert.strictEqual(calls[1][0], 'https://lesen.test/artikel');
    seen.length = 0;
    await get('/artikelku');
    assert.deepStrictEqual(seen, ['/artikelku']);
    assert.strictEqual(calls.length, 2);
  } finally { globalThis.fetch = real; }
});
