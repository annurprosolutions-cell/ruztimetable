// Service worker: app boleh dibuka luar talian dan menerima klik notifikasi.
// Strategi "rangkaian dahulu": versi terbaharu sentiasa diambil bila ada internet,
// salinan dalam cache hanya digunakan bila luar talian. Permintaan ke Google tidak disentuh.
const CACHE = 'jadual-sekolah-v3';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/badge-96.png',
  'js/core.js', 'js/engine.js', 'js/runner.js', 'js/sample.js', 'js/relief.js', 'js/insights.js', 'js/license.js', 'js/access.js', 'js/survey.js', 'js/brand.js',
  'js/sheets.js', 'js/xlsx.js', 'js/import.js', 'js/archive.js', 'js/icons.js', 'js/ui-common.js', 'js/ui-sync.js', 'js/ui-gate.js', 'js/ui-pwa.js', 'js/ui-survey.js', 'js/ui-dashboard.js', 'js/ui-setup.js',
  'js/ui-timetable.js', 'js/ui-relief.js', 'js/ui-help.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req, { ignoreSearch: req.mode === 'navigate' })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    return c ? c.focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
