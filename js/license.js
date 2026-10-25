(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  const CACHE_DAYS = 7; // tempoh app dibenarkan guna lesen yang disimpan bila pelayan lesen tak dapat dihubungi
  const WARN_DAYS = 14;

  // hubungi pelayan lesen dengan token akses Google. Melontar ralat dengan `status` jika gagal.
  TT.fetchLicense = async (url, token, fetchFn) => {
    const res = await fetchFn(url.replace(/\/$/, '') + '/check', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    let body = null;
    try { body = await res.json(); } catch (e) { /* bukan JSON */ }
    if (res.ok || (body && body.reason)) return { status: res.status, body: body || {} };
    const err = new Error('Pelayan lesen tidak menjawab (HTTP ' + res.status + ')'); err.status = res.status; throw err;
  };

  const MSG = {
    tiada: 'E-mel ini belum berlesen. Hubungi pembekal untuk mengaktifkan akaun sekolah anda.',
    tamat: 'Lesen sekolah telah tamat. Hubungi pembekal untuk pembaharuan. Data anda selamat dan masih boleh digunakan dalam pelayar ini.',
    'token-tidak-sah': 'Sesi Google tidak sah. Log masuk semula.',
    gagal: 'Tidak dapat mengesahkan lesen (tiada sambungan ke pelayan lesen). Cuba semula sebentar lagi.'
  };

  /**
   * Putuskan sama ada penyimpanan awan dibenarkan.
   * result: { body } daripada pelayan, atau error, atau tiada keduanya (semakan dimatikan).
   * cache: { email, ok, checkedAt (ms), school, expires } daripada semakan lalu, atau null.
   */
  TT.licenseDecision = (o) => {
    const now = o.now != null ? o.now : Date.now();
    if (o.disabled) return { allowed: true, state: 'off', message: '', cache: null };
    if (o.result) {
      const b = o.result.body;
      if (b.ok) {
        const warn = b.reason === 'tamat-tempoh-ihsan' ? `Lesen tamat, tempoh ihsan berakhir dalam ${Math.max(0, 7 + b.daysLeft)} hari. Sila perbaharui.`
          : b.daysLeft != null && b.daysLeft <= WARN_DAYS ? `Lesen tamat dalam ${b.daysLeft} hari.` : '';
        return { allowed: true, state: warn ? 'warn' : 'ok', message: warn, school: b.school || '', expires: b.expires || '', cache: { email: b.email, ok: true, checkedAt: now, school: b.school || '', expires: b.expires || '' } };
      }
      return { allowed: false, state: 'denied', message: MSG[b.reason] || MSG.tiada, cache: { email: b.email || '', ok: false, checkedAt: now } };
    }
    // pelayan tidak dapat dihubungi: guna cache yang masih segar sahaja
    const c = o.cache;
    if (c && c.ok && o.email && c.email === o.email && now - c.checkedAt <= CACHE_DAYS * 864e5) {
      return { allowed: true, state: 'cached', message: 'Lesen disahkan sebelum ini. Akan disemak semula bila sambungan pulih.', school: c.school, expires: c.expires, cache: c };
    }
    const status = o.error && o.error.status;
    return { allowed: false, state: 'unreachable', message: status === 401 ? MSG['token-tidak-sah'] : MSG.gagal, cache: c || null };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
