# Video demo Jadual Sekolah

90 saat, 1080x1920 (TikTok / Reels / Shorts). Tunjuk aliran penggunaan sistem dalam 7 langkah, dengan zoom masuk dan keluar pada perkara penting. Semua gambar ialah rakaman app sebenar (`../index.html`) menggunakan data contoh.

Video ini **tiada audio**. Tambah muzik daripada pustaka bunyi TikTok semasa muat naik.

| Masa | Babak |
|---|---|
| 0:00 | Pembuka: jadual siap, zoom keluar |
| 0:05 | Masalah: cari guru ganti di WhatsApp |
| 0:09 | 1. Tetapan hari, waktu dan rehat |
| 0:17 | 2. Data guru, kelas, subjek (tampal dari Excel, kelas gabungan PI/PM) |
| 0:28 | 3. Jana jadual: 243 waktu, 0 konflik |
| 0:42 | 4. Seret untuk ubah, kunci waktu |
| 0:50 | 5. Relief: rekod guru MC, agih automatik, mesej WhatsApp |
| 1:06 | 6. Pantau: kalendar SELESAI/BELUM, statistik kesaksamaan |
| 1:14 | 7. Guru di telefon, dashboard pentadbir |
| 1:24 | Penutup |

## Render semula

```bash
cd demo-video
npm i playwright
node capture.mjs                               # rakam app ke shots/ (jam ditetapkan Isnin 26/10/2026 7:45 pagi)
node render.mjs stills                         # snapshot ke stills/ untuk semak layout
node render.mjs full demo.mp4   # perlukan ffmpeg, kira-kira 6 minit
```

- Kapsyen: tatasusunan `CAPS` dalam `demo.html`.
- Kamera, kursor, klik dan sorotan: tatasusunan `SEG`. Sasaran zoom merujuk nama elemen yang direkod oleh `capture.mjs` (`shots/manifest.js`), jadi kamera tetap tepat walaupun app berubah dan dirakam semula.
