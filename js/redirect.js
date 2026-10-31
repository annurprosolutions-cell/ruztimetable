// Pindah alamat: pautan lama (Netlify, GitHub Pages) dihantar ke alamat rasmi.
// Laluan dan parameter dikekalkan, jadi pautan demo (?demo) dan pautan guru (?g=...) terus berfungsi.
(function () {
  var c = window.APP_CONFIG || {}, to = String(c.canonicalUrl || '').replace(/\/$/, '');
  if (!to || (c.oldHosts || []).indexOf(location.hostname) < 0) return;
  // GitHub Pages menghos di bawah /ruztimetable/
  var path = location.pathname.replace(/^\/ruztimetable(?=\/|$)/, '') || '/';
  window.__redirecting = true;
  location.replace(to + path + location.search + location.hash);
})();
