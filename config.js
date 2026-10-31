// Tetapan pemasangan. Ubah fail ini tanpa menyentuh kod lain.
window.APP_CONFIG = {
  appName: 'Jadual Sekolah',
  version: '2.2.0',
  vendor: 'AnnurPro Solutions',
  // Client ID OAuth Google (jenis "Web application") untuk simpan data dalam Google Sheets pengguna.
  // Kosong = ciri Google Sheets dimatikan. Langkah penyediaan dalam README.md.
  googleClientId: '40784680032-vpri939rkmrq8mbnq2qrph31jl9dla0b.apps.googleusercontent.com',
  // Alamat Worker lesen (lihat worker/README.md), tanpa garis condong hujung.
  // Kosong = tiada semakan lesen (sesuai untuk ujian dan sekolah sendiri).
  licenseUrl: 'https://jadual-sekolah-lesen.annurprosolutions.workers.dev',
  // Borang bayaran langganan (BCL). Pembeli isi e-mel log masuk Google; Worker aktifkan lesen secara automatik.
  // Worker juga boleh menghantar pautan ini (BUY_URL), yang diutamakan.
  buyUrl: 'https://annurprosolutions1.bcl.my/form/jadual-sekolah-relief-system',
  priceText: 'RM20 sebulan, atau RM200 setahun (jimat RM40).',
  // Alamat rasmi app (contoh 'https://annurtimetable.com'). Bila diisi, pelawat ke alamat lama dalam oldHosts
  // dihantar ke sini dengan laluan dan parameter yang sama. Kosong = tiada pindah alamat.
  canonicalUrl: '',
  oldHosts: ['ruzjadual.netlify.app', 'annurprosolutions-cell.github.io'],
  // Survey dalam mod demo (?demo): URL web app Google Apps Script yang berakhir dengan /exec (lihat appscript/README.md).
  // Kosong = survey tetap dipaparkan tetapi jawapan hanya tersimpan dalam pelayar pelawat dan belum dihantar.
  surveyUrl: 'https://script.google.com/macros/s/AKfycbw6OKT2xy0XM2VOUVLWNMj91OCG9x4ltDZMspboAvMWwMMQ39SgXKd1gkTnZ01hjWGr/exec',
  // Kunci pilihan: sama dengan SURVEY_KEY dalam Script properties Apps Script. Kosong = tiada semakan kunci.
  surveyKey: '',
  // Maklumat sokongan yang dipaparkan di halaman Bantuan (pilihan)
  support: { whatsapp: '01120879149', email: 'annurprosolutions@gmail.com' }
};
