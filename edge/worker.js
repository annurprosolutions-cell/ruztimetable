// Worker kecil di hadapan fail statik app (Cloudflare Workers + Assets). Hanya alamat /s/<nama> (pautan guru cantik)
// melaluinya; semua yang lain dilayan terus oleh fail statik. /s/<nama> tiada fail sebenar, jadi index.html dihantar
// dengan <base href="/"> disuntik di awal <head> supaya css/ dan js/ dimuat dari akar (bukan dari /s/css/...) sejak muat awal.
// Nama itu sendiri dibaca oleh js/app.js dan diterjemah oleh Worker lesen.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !/^\/s\/[^/]+\/?$/.test(url.pathname)) return env.ASSETS.fetch(request);
    // "/" bukan "/index.html": yang kedua dialihkan (307) oleh pengendalian .html Cloudflare
    const res = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: request.headers }));
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const out = new HTMLRewriter().on('head', { element(el) { el.prepend('<base href="/">', { html: true }); } }).transform(res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  }
};
