(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Kaunter awam dari pelayan lesen (GET /stats): bilangan sahaja. paid ialah null selagi belum sampai had minimum pelayan.
  TT.statsText = (s) => {
    if (!s || typeof s !== 'object') return '';
    const paid = Number.isInteger(s.paid) && s.paid > 0 ? s.paid : 0, trial = Number.isInteger(s.trial) && s.trial > 0 ? s.trial : 0;
    const parts = [];
    if (paid) parts.push(`${paid} akaun berbayar`);
    if (trial) parts.push(`${trial} sedang mencuba percuma`);
    return parts.join(' · ');
  };

  // ambil dengan had masa; gagal senyap (kaunter hanya hiasan, tidak boleh menghalang log masuk)
  TT.fetchStats = async (url, fetchFn) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
    try {
      const res = await fetchFn(url.replace(/\/$/, '') + '/stats', ctl ? { signal: ctl.signal } : {});
      return res.ok ? await res.json() : null;
    } catch (e) { return null; } finally { if (tm) clearTimeout(tm); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
