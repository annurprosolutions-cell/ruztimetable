(function () {
  'use strict';
  const { esc, pages } = UI;

  const FAQ = [
    ['Data saya disimpan di mana?', 'Dalam pelayar (browser) peranti ini. Jika Google Sheets disambung di Tetapan > Storan, satu salinan turut disimpan dalam Google Sheet milik akaun anda sendiri. Pembekal sistem tidak menerima data anda.'],
    ['Macam mana nak pindah ke komputer lain?', 'Tetapan > Storan > Eksport JSON, kemudian Import JSON di komputer baharu. Jika guna Google Sheets, log masuk dengan akaun yang sama dan tekan "Muat dari Sheet".'],
    ['Kenapa ada waktu yang tidak dapat diletak?', 'Biasanya beban guru terlalu padat, guru banyak slot "tidak boleh", atau bilik khas penuh. Semakan awal sebelum jana dan sebab di atas jadual menunjukkan puncanya. Waktu yang tinggal boleh diseret secara manual.'],
    ['Bagaimana skor cadangan relief dikira?', 'Bonus untuk subjek sama, panitia sama, mengajar kelas itu, guru kelas, dan sambungan kelas yang sama. Penalti untuk bilangan relief bulan ini, relief keseluruhan, relief hari ini dan beban mengajar. Semua pemberat boleh diubah di Tetapan > Peraturan relief.'],
    ['Apa beza peranan Pentadbir dan Guru?', 'Pentadbir log masuk dengan Google dan kata laluan, dan mengurus data, jadual serta relief. Guru membuka pautan guru, pilih nama, dan hanya boleh melihat jadual, tugas relief dan slip sendiri. Guru membaca salinan "Data Guru" yang berasingan, jadi mereka tidak boleh mengubah data sekolah.'],
    ['Macam mana guru dapat jadual di telefon?', 'Pentadbir: Tetapan > Storan > Pautan guru > Salin atau WhatsApp. Guru buka pautan itu, pilih nama, kemudian tekan "Pasang app" supaya ia ada di skrin utama telefon. Data guru dikemas kini setiap kali pentadbir menyimpan.'],
    ['Kenapa perlu log masuk semula?', 'Sesi pada peranti kekal 30 hari. Sambungan Google pula hanya sah kira-kira 1 jam setiap kali (peraturan Google untuk app tanpa pelayan). Bila tamat, data masih boleh diguna dan disimpan dalam pelayar; tekan "Sambung semula" sekali dan semua perubahan dihantar ke Sheet.'],
    ['Notifikasi tidak keluar?', 'Tekan "Hidupkan notifikasi" dan benarkan. Pada iPhone, pasang app ke skrin utama dahulu (iOS 16.4 ke atas). Notifikasi dihantar bila app dibuka atau masih berjalan di latar; app yang ditutup sepenuhnya belum menerima notifikasi.'],
    ['Sekolah saya Ahad hingga Khamis. Boleh?', 'Boleh. Tetapan > Sekolah > Minggu persekolahan. Hari dan relief akan mengikut tetapan itu.'],
    ['Pendidikan Islam dan Moral serentak, macam mana nak masukkan?', 'Di Data > Pelajaran > Tambah, pilih mod "Gabungan serentak". Pilih kelas yang belajar serentak dan semua guru yang mengajar kumpulan masing-masing. Ia dikira satu slot untuk semua kelas dan semua guru itu.'],
    ['Macam mana nak dapat PDF?', 'Tekan butang Cetak, kemudian pilih "Save as PDF" dalam dialog cetak pelayar.']
  ];

  pages.bantuan = () => {
    const cfg = UI.cfg, sup = cfg.support || {};
    const head = UI.pageHead({ crumbs: [['Bantuan']], title: 'Bantuan', sub: 'Panduan ringkas dan soalan lazim' });
    const steps = UI.isGuru()
      ? ['Tekan "Pasang app" dan "Hidupkan notifikasi" pada halaman Utama supaya dimaklumkan bila ada relief baharu.', 'Halaman Utama menunjukkan kelas dan tugas relief anda hari ini.', 'Jadual saya untuk jadual mingguan penuh dan cetakan.', 'Relief saya untuk tugas akan datang, slip dan perbandingan kesaksamaan.']
      : ['Tetapan: hari persekolahan, waktu dan rehat, had waktu Jumaat.', 'Data: subjek, guru (termasuk waktu tidak boleh), kelas, bilik dan pelajaran.', 'Jadual: tekan Jana, kemudian laras dengan seret-dan-lepas. Kunci waktu yang tidak boleh berubah.', 'Relief: rekod guru tidak hadir, tekan Agih automatik, cetak slip atau salin mesej WhatsApp.', 'Tetapan > Storan: sambung Google Sheets, kongsi pautan guru, atau eksport JSON sebagai backup.'];
    const contact = sup.whatsapp || sup.email
      ? `<p>${sup.whatsapp ? `WhatsApp: <a href="https://wa.me/${esc(UI.waNumber(sup.whatsapp))}" target="_blank" rel="noopener">${esc(sup.whatsapp)}</a><br>` : ''}${sup.email ? `E-mel: <a href="mailto:${esc(sup.email)}">${esc(sup.email)}</a>` : ''}</p>`
      : '<p class="hint">Hubungi pembekal sistem anda.</p>';
    return head + `<div class="dash"><div class="col-l">
      <section class="card"><div class="ch"><h2>Langkah kerja</h2></div><ol class="steps">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="card"><div class="ch"><h2>Tentang</h2></div><p><b>${esc(cfg.appName || 'Jadual Sekolah')}</b> versi ${esc(cfg.version || '')}${cfg.vendor ? `<br>${esc(cfg.vendor)}` : ''}</p>${contact}</section></div>
      <div class="col-r"><section class="card"><div class="ch"><h2>Soalan lazim</h2></div>${FAQ.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section></div></div>`;
  };
})();
