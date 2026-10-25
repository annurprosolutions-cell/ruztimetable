(function () {
  'use strict';
  const { esc, pages } = UI;

  const FAQ = [
    ['Data saya disimpan di mana?', 'Dalam pelayar (browser) peranti ini. Jika Google Sheets disambung di Tetapan > Storan, satu salinan turut disimpan dalam Google Sheet milik akaun anda sendiri. Pembekal sistem tidak menerima data anda.'],
    ['Macam mana nak pindah ke komputer lain?', 'Tetapan > Storan > Eksport JSON, kemudian Import JSON di komputer baharu. Jika guna Google Sheets, log masuk dengan akaun yang sama dan tekan "Muat dari Sheet".'],
    ['Kenapa ada waktu yang tidak dapat diletak?', 'Biasanya beban guru terlalu padat, guru banyak slot "tidak boleh", atau bilik khas penuh. Semakan awal sebelum jana dan sebab di atas jadual menunjukkan puncanya. Waktu yang tinggal boleh diseret secara manual.'],
    ['Bagaimana skor cadangan relief dikira?', 'Bonus untuk subjek sama, panitia sama, mengajar kelas itu, guru kelas, dan sambungan kelas yang sama. Penalti untuk bilangan relief bulan ini, relief keseluruhan, relief hari ini dan beban mengajar. Semua pemberat boleh diubah di Tetapan > Peraturan relief.'],
    ['Apa beza peranan Pentadbir dan Guru?', 'Pentadbir mengurus data, jadual dan relief. Guru melihat jadual sendiri, tugas relief dan slip. Peranan hanya menukar paparan pada peranti ini, bukan kawalan akses.'],
    ['Sekolah saya Ahad hingga Khamis. Boleh?', 'Boleh. Tetapan > Sekolah > Minggu persekolahan. Hari dan relief akan mengikut tetapan itu.'],
    ['Pendidikan Islam dan Moral serentak, macam mana nak masukkan?', 'Di Data > Pelajaran > Tambah, pilih mod "Gabungan serentak". Pilih kelas yang belajar serentak dan semua guru yang mengajar kumpulan masing-masing. Ia dikira satu slot untuk semua kelas dan semua guru itu.'],
    ['Macam mana nak dapat PDF?', 'Tekan butang Cetak, kemudian pilih "Save as PDF" dalam dialog cetak pelayar.']
  ];

  pages.bantuan = () => {
    const cfg = UI.cfg, sup = cfg.support || {};
    const head = UI.pageHead({ crumbs: [['Bantuan']], title: 'Bantuan', sub: 'Panduan ringkas dan soalan lazim' });
    const steps = UI.isGuru()
      ? ['Pilih nama anda melalui menu PERANAN di atas.', 'Halaman Utama menunjukkan kelas dan tugas relief anda hari ini.', 'Jadual saya untuk jadual mingguan penuh dan cetakan.', 'Relief saya untuk tugas akan datang, slip dan perbandingan kesaksamaan.']
      : ['Tetapan: hari persekolahan, waktu dan rehat, had waktu Jumaat.', 'Data: subjek, guru (termasuk waktu tidak boleh), kelas, bilik dan pelajaran.', 'Jadual: tekan Jana, kemudian laras dengan seret-dan-lepas. Kunci waktu yang tidak boleh berubah.', 'Relief: rekod guru tidak hadir, tekan Agih automatik, cetak slip atau salin mesej WhatsApp.', 'Tetapan > Storan: sambung Google Sheets atau eksport JSON sebagai backup.'];
    const contact = sup.whatsapp || sup.email
      ? `<p>${sup.whatsapp ? `WhatsApp: <a href="https://wa.me/${esc(String(sup.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(sup.whatsapp)}</a><br>` : ''}${sup.email ? `E-mel: <a href="mailto:${esc(sup.email)}">${esc(sup.email)}</a>` : ''}</p>`
      : '<p class="hint">Hubungi pembekal sistem anda.</p>';
    return head + `<div class="dash"><div class="col-l">
      <section class="card"><div class="ch"><h2>Langkah kerja</h2></div><ol class="steps">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="card"><div class="ch"><h2>Tentang</h2></div><p><b>${esc(cfg.appName || 'Jadual Sekolah')}</b> versi ${esc(cfg.version || '')}${cfg.vendor ? `<br>${esc(cfg.vendor)}` : ''}</p>${contact}</section></div>
      <div class="col-r"><section class="card"><div class="ch"><h2>Soalan lazim</h2></div>${FAQ.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section></div></div>`;
  };
})();
