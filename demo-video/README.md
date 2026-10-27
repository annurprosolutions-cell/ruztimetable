# Video demo Jadual Sekolah + Relief

**2 minit**, 1080x1920 (TikTok / Reels / Shorts / status WhatsApp). Tunjuk semua fungsi utama dalam 9 langkah, dengan zoom masuk dan keluar, kursor, sorotan, dan label **DI MANA** (laluan menu dalam app) pada setiap babak supaya penonton boleh ikut sendiri. Semua gambar ialah rakaman app sebenar (`../index.html`) menggunakan data contoh. Aliran log masuk Google dan Sheets dirakam melalui kod app yang sama dengan Google tiruan (lihat `capture.mjs`).

Video ini **tiada audio**. Tambah muzik daripada pustaka bunyi semasa muat naik.

| Masa | Babak |
|---|---|
| 0:00 | Pembuka: jadual siap, zoom keluar. Masalah: cari guru ganti di WhatsApp |
| 0:08 | 1. **Masuk**: pilih peranan (Pentadbir / Guru), log masuk Google, tetapan awal (nama, warna, logo), kata laluan |
| 0:21 | 2. **Data**: hari/waktu/rehat, tampal guru dari Excel, waktu guru tak boleh mengajar, kelas gabungan PI/PM |
| 0:36 | 3. **Jana**: tahap usaha, 243 waktu, 0 konflik |
| 0:47 | 4. **Laras**: seret dan lepas, kunci waktu, paparan kelas/guru/bilik/induk, cetak |
| 0:57 | 5. **Relief**: rekod guru MC, agih automatik, sebab setiap cadangan, slip, mesej WhatsApp |
| 1:14 | 6. **Pantau**: kalendar SELESAI/BELUM, statistik kesaksamaan, laporan beban |
| 1:24 | 7. **Awan**: simpanan Google Sheet sekolah, pautan guru, Sheet sebenar |
| 1:32 | 8. **Guru**: buka pautan, pilih nama, dashboard, jadual dan relief sendiri, pasang di telefon dan notifikasi |
| 1:48 | 9. **Peranan**: dashboard pentadbir, pratonton paparan guru |
| 1:54 | Penutup dan hubungi |

## Render semula

```bash
cd demo-video
npm i playwright                               # atau pautkan node_modules (lihat bawah)
node capture.mjs                               # rakam app ke shots/ (jam ditetapkan Isnin 26/10/2026 7:45 pagi)
node render.mjs stills                         # satu gambar bagi setiap babak, untuk semak layout
node render.mjs full out/demo-2min.mp4         # perlukan ffmpeg, kira-kira 10 minit
```

- Skrip ESM tidak menggunakan `NODE_PATH`. Pasang `playwright` dalam `node_modules` projek (`npm i playwright` di akar) atau pautkan `node_modules` ke pakej global.
- Hasil `out/` tidak dimasukkan ke git (besar). `demo.mp4` dalam folder ini ialah versi 90 saat yang lama.
- Garis masa: fungsi `seg({...})` dalam `demo.html`. Semua masa dalam satu babak ialah relatif kepada permulaan babak, jadi menukar `d` (tempoh) satu babak menggerakkan semua babak selepasnya. Babak penutup mengisi baki sehingga 2:00 dan skrip berhenti dengan ralat jika babak lain melebihi 1:55.
- Kapsyen dan label DI MANA: medan `cap` bagi setiap babak (`[kicker, tajuk, huraian, laluan]`).
- Kamera, kursor, klik dan sorotan: `cam`, `cur`, `click`, `hl`, `tap`, `drag`. Sasaran zoom merujuk nama elemen yang direkod oleh `capture.mjs` (`shots/manifest.js`), jadi kamera tetap tepat walaupun app berubah dan dirakam semula.

---

# Video tutorial pengguna baharu (4 minit 13 saat)

Untuk orang yang tidak tahu bagaimana mula menggunakan demo. Tunjuk **dari data kosong sampai jadual dan relief siap**, menggunakan sekolah rekaan **SMK Taman Harmoni** (12 guru, 4 kelas, 8 subjek, 2 bilik). Semua data dimasukkan melalui borang sebenar app dalam mod `?demo`, bukan data contoh. 1080x1920, tiada audio. Setiap babak ada label **DI MANA** (laluan menu) supaya penonton boleh mengikut sendiri.

| Masa | Langkah |
|---|---|
| 0:00 | Pengenalan: 9 langkah |
| 0:09 | 1. **Mula**: buka pautan demo, survey, popup butang Maklum Balas, data contoh, Padam semua data untuk mula dari kosong |
| 0:43 | 2. **Sekolah**: nama, minggu persekolahan, logo dan warna, waktu dan rehat, waktu Jumaat |
| 1:06 | 3. **Data**: subjek, guru (tambah ramai, subjek yang boleh diajar, waktu tak boleh), kelas, bilik |
| 1:54 | 4. **Pelajaran**: satu subjek untuk banyak kelas, PI/PM gabungan serentak, semak senarai |
| 2:26 | 5. **Jana**: semakan awal, tahap usaha, jadual siap tanpa konflik |
| 2:45 | 6. **Laras**: seret dan lepas, kunci waktu, induk kelas dan cetak |
| 3:00 | 7. **Relief**: guru tidak hadir (cuti beberapa hari), agih automatik dan sebabnya, slip, WhatsApp |
| 3:25 | 8. **Pantau**: kalendar, statistik kesaksamaan, laporan |
| 3:40 | 9. **Guru**: pratonton paparan guru, jadual dan relief guru, butang Maklum Balas |
| 4:04 | Penutup |

Salin senarai masa di atas ke penerangan video (YouTube atau Facebook) supaya penonton boleh melompat ke bab yang mereka perlukan.

```bash
cd demo-video
node capture-tutorial.mjs                                  # rakam ke shots-t/ (tidak menyentuh shots/ bagi video 2 minit)
PAGE=tutorial.html node render.mjs stills                  # satu gambar bagi setiap babak
PAGE=tutorial.html node render.mjs full out/tutorial.mp4   # kira-kira 25 minit
```

- Garis masa dalam `tutorial.html` (fungsi `seg`). Pemalar `PACE` (sekarang 1.3) mendarab semua tempoh: tukar kepada 1.0 untuk versi kira-kira 3 minit 15 saat, atau 1.5 untuk lebih perlahan.
- `capture-tutorial.mjs` menggantikan permintaan survey ke Apps Script dengan respons palsu supaya rakaman tidak menulis ke Google Sheet sebenar, dan gagal jika `github`, `ruztimetable`, `netlify` atau alamat tempatan terpapar pada skrin.
- Data sekolah rekaan ditakrif dalam `capture-tutorial.mjs` (senarai subjek, guru, kelas, bilik dan pelajaran). Jika data tidak muat, skrip berhenti dengan ralat dan bilangan waktu yang tidak diletak.
- Hasil `out/` dan `shots-t/` tidak dimasukkan ke git (besar).
