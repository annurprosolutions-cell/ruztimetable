// Tetapan pemasangan. Ubah fail ini tanpa menyentuh kod lain.
window.APP_CONFIG = {
  appName: 'Jadual Sekolah',
  version: '2.1.0',
  vendor: 'AnnurPro Solutions',
  // Client ID OAuth Google (jenis "Web application") untuk simpan data dalam Google Sheets pengguna.
  // Kosong = ciri Google Sheets dimatikan. Langkah penyediaan dalam README.md.
  googleClientId: '40784680032-vpri939rkmrq8mbnq2qrph31jl9dla0b.apps.googleusercontent.com',
  // Alamat Worker lesen (lihat worker/README.md), tanpa garis condong hujung.
  // Kosong = tiada semakan lesen (sesuai untuk ujian dan sekolah sendiri).
  licenseUrl: '',
  // Survey dalam mod demo (?demo): URL web app Google Apps Script yang berakhir dengan /exec (lihat appscript/README.md).
  // Kosong = survey tetap dipaparkan tetapi jawapan hanya tersimpan dalam pelayar pelawat dan belum dihantar.
  surveyUrl: '',
  // Kunci pilihan: sama dengan SURVEY_KEY dalam Script properties Apps Script. Kosong = tiada semakan kunci.
  surveyKey: '',
  // Maklumat sokongan yang dipaparkan di halaman Bantuan (pilihan)
  support: { whatsapp: '0134874206', email: 'annurprosolutions@gmail.com' }
};
