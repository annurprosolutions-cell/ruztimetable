(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  const DEFAULT = '#1e3a8a';
  TT.LOGO_MAX_CHARS = 45000; // satu sel Google Sheets muat 50,000 aksara
  TT.BRAND_PRESETS = ['#1e3a8a', '#0f766e', '#7c2d12', '#6d28d9', '#be123c', '#166534', '#b45309', '#334155'];

  TT.validHex = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  TT.contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  // daripada satu warna sekolah, hasilkan warna antara muka yang sentiasa boleh dibaca dengan teks putih
  TT.brandPalette = (color) => {
    const base = TT.validHex(color) ? color.toLowerCase() : DEFAULT;
    let accent = base;
    for (let i = 0; i < 12 && TT.contrast(accent, '#ffffff') < 4.5; i++) accent = mix(accent, '#000000', 0.12);
    return { base, accent, accent2: mix(accent, '#ffffff', 0.14), navy: mix(base, '#000000', 0.66), navy2: mix(base, '#000000', 0.42), navy3: mix(base, '#000000', 0.8), soft: mix(base, '#ffffff', 0.9) };
  };

  // logo hanya data URL imej; selain itu dibuang
  TT.validLogo = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= TT.LOGO_MAX_CHARS;

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
