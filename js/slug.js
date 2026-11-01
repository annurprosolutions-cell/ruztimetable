(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Pautan guru cantik: https://<alamat rasmi>/s/<nama> -> Worker terjemah nama kepada ID Sheet Data Guru.
  // Peraturan nama sama dengan worker/index.mjs (Worker yang menentukan; semakan di sini hanya untuk mesej awal).
  TT.SLUG_RESERVED = ['www', 'app', 'api', 'admin', 'administrator', 'lesen', 'license', 'mail', 'email', 'ftp', 'static', 'assets', 'demo', 'privasi', 'privacy',
    'terms', 'bantuan', 'help', 'support', 'login', 'logout', 'signin', 'test', 'testing', 'staging', 'dev', 'root', 'null', 'undefined', 'annurtimetable', 'annurpro',
    'annurprosolutions', 'jadual', 'relief', 'guru', 'sekolah', 'school', 'kpm', 'moe', 'jpn', 'ppd', 'kementerian', 'pendidikan', 'jabatan', 'pejabat', 'kerajaan',
    'gov', 'polis', 'tentera', 'bank', 'delima', 'google'];
  TT.slugCheck = (raw) => {
    const slug = String(raw == null ? '' : raw).trim().toLowerCase();
    if (slug.length < 3 || slug.length > 30) return { problem: 'Nama mesti 3 hingga 30 aksara.' };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { problem: 'Hanya huruf kecil, nombor dan sempang, contoh smk-wakanda.' };
    if (TT.SLUG_RESERVED.includes(slug) || slug.startsWith('xn--')) return { problem: 'Nama ini dikhaskan. Pilih nama lain.' };
    return { slug };
  };
  // /s/smkwakanda atau /s/smkwakanda/ -> 'smkwakanda'; selain itu ''
  TT.slugFromPath = (pathname) => { const m = /^\/s\/([a-zA-Z0-9-]{3,30})\/?$/.exec(pathname || ''); return m ? m[1].toLowerCase() : ''; };

  const call = async (url, path, init, fetchFn) => {
    const res = await fetchFn(url.replace(/\/$/, '') + path, init);
    let body = null; try { body = await res.json(); } catch (e) { /* bukan JSON */ }
    if (res.ok && body && body.ok) return body;
    const err = new Error((body && (body.message || body.reason)) || 'HTTP ' + res.status);
    err.status = res.status; err.reason = (body && body.reason) || ''; err.daysLeft = body && body.daysLeft; throw err;
  };
  // awam: { ok, gid, school }
  TT.fetchSlug = (url, slug, fetchFn) => call(url, '/slug/' + encodeURIComponent(slug), { method: 'GET' }, fetchFn);
  // pentadbir berlangganan: tuntut, tukar atau kemas kini ID Sheet
  TT.claimSlug = (url, token, payload, fetchFn) => call(url, '/slug', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn);
  TT.releaseSlug = (url, token, fetchFn) => call(url, '/slug', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }, fetchFn);

  // mesej untuk pentadbir bagi setiap sebab penolakan
  TT.slugErrorText = (e) => ({
    'perlu-langganan': 'Nama pautan memerlukan langganan berbayar (bukan percubaan percuma).',
    'telah-digunakan': 'Nama ini telah digunakan oleh sekolah lain. Pilih nama lain.',
    'terlalu-kerap': `Nama hanya boleh ditukar sekali setiap 30 hari. Cuba lagi dalam ${e.daysLeft || 'beberapa'} hari.`,
    'token-tidak-sah': 'Sesi Google tamat. Tekan "Sambung semula" dan cuba lagi.',
    'tiada-token': 'Sesi Google tamat. Tekan "Sambung semula" dan cuba lagi.'
  }[e.reason] || (e.reason === 'nama-tidak-sah' || e.reason === 'gid-tidak-sah' ? e.message : (e.status ? `Pelayan lesen menolak permintaan (${e.reason || e.status}).` : 'Tidak dapat menghubungi pelayan lesen. Semak sambungan internet.')));

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
