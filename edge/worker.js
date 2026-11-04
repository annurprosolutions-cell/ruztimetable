// Worker kecil di hadapan fail statik app (Cloudflare Workers + Assets). Hanya alamat /s/<nama> (pautan guru cantik)
// melaluinya; semua yang lain dilayan terus oleh fail statik. /s/<nama> tiada fail sebenar, jadi index.html dihantar
// dengan <base href="/"> disuntik di awal <head> supaya css/ dan js/ dimuat dari akar (bukan dari /s/css/...) sejak muat awal.
// Nama itu sendiri dibaca oleh js/app.js dan diterjemah oleh Worker lesen.
// /artikel/* (halaman artikel awam) dijana oleh Worker lesen; di sini hanya diproksi supaya alamatnya kekal annurtimetable.com,
// dengan cache tepi 60 saat (Cache API) supaya pelawat ramai tidak mencetus permintaan berulang ke Worker lesen.
const LICENSE_URL = 'https://jadual-sekolah-lesen.annurprosolutions.workers.dev';
async function artikel(request, env, ctx, url) {
  const target = String((env && env.LICENSE_URL) || LICENSE_URL).replace(/\/$/, '') + url.pathname + url.search;
  const cache = typeof caches !== 'undefined' && request.method === 'GET' ? caches.default : null;
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }
  const res = await fetch(target, { method: request.method, headers: { accept: request.headers.get('accept') || '*/*' }, redirect: 'manual' });
  const out = new Response(res.body, res);
  if (cache && res.status === 200 && /public/.test(res.headers.get('cache-control') || '')) {
    const p = cache.put(request, out.clone());
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/artikel' || url.pathname.startsWith('/artikel/')) return artikel(request, env, ctx, url);
    if (request.method !== 'GET' || !/^\/s\/[^/]+\/?$/.test(url.pathname)) return env.ASSETS.fetch(request);
    // "/" bukan "/index.html": yang kedua dialihkan (307) oleh pengendalian .html Cloudflare
    const res = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const out = new HTMLRewriter().on('head', { element(el) { el.prepend('<base href="/">', { html: true }); } }).transform(res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  }
};
