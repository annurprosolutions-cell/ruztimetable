# Jadual Sekolah

Penjana jadual waktu sekolah (macam Winjaws / aSc TimeTables) dengan modul guru ganti (relief), dashboard ikut peranan, dan pilihan simpan data dalam Google Sheets milik sekolah. Web app statik: tiada server, tiada dependency.

## Hos di GitHub Pages (peringkat awal)

1. Repo > Settings > Pages > Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. Tunggu seminit. App hidup di `https://annurprosolutions-cell.github.io/ruztimetable/`.
3. Setiap `git push` ke `main` mengemas kini semua sekolah secara automatik.

Nota: GitHub Pages untuk repo *private* memerlukan plan berbayar; repo public percuma. Kod app memang boleh dilihat sesiapa, data sekolah tidak ada dalam repo. Untuk Google Sheets, tambah alamat Pages di atas sebagai *Authorized JavaScript origin* dalam OAuth client. Bila pindah ke Cloudflare Pages kelak, cuma tukar alamat dan tambah origin baharu.

## Cara guna

- **Cuba terus**: buka `index.html` dalam Chrome, Edge atau Firefox. Data disimpan dalam pelayar.
- **Guna sebenar**: hos folder ini di GitHub Pages atau Cloudflare Pages. Ini wajib kalau nak guna Google Sheets, sebab Google tak benarkan log masuk dari fail `file://`.

Aliran kerja pentadbir:

1. **Tetapan**: Isnin-Jumaat atau Ahad-Khamis, waktu dan rehat, bilangan waktu hari Jumaat.
2. **Data**: subjek, guru (termasuk waktu tidak boleh mengajar), kelas, bilik, kemudian pelajaran.
3. **Jadual**: tekan "Jana jadual", laras dengan seret-dan-lepas, kunci waktu yang tak boleh berubah, cetak.
4. **Relief**: rekod guru tidak hadir, tekan "Agih automatik", cetak slip atau salin mesej WhatsApp.

**PERANAN** (menu kanan atas) menukar paparan antara Pentadbir dan Guru. Guru pilih nama sendiri dan nampak kelas hari ini, tugas relief, slip dan perbandingan kesaksamaan. Ini paparan sahaja, bukan kawalan akses.

## Ciri

**Dashboard (Utama)**
- Ringkasan: bilangan perkara yang perlu tindakan, peratus waktu diletak tanpa konflik, diletak / belum / konflik, guru, kelas, relief bulan ini.
- Kad "Hari ini": blok relief hari ini dengan status (Siap / Agih / Kendiri) dan ketidakhadiran minggu ini. Untuk guru: kelas sendiri ikut masa, tugas relief diserlahkan, cip "Sekarang".
- Banner merah untuk perkara paling mendesak, contohnya relief hari ini atau hari persekolahan seterusnya yang belum diagih, atau konflik jadual.
- "Perlu tindakan" dan loceng notifikasi: konflik, waktu belum diletak, relief belum diagih untuk 7 hari akan datang, guru melebihi had, data belum dibackup.
- Heatmap aktiviti relief sebulan. Klik satu hari untuk terus ke relief tarikh itu.

**Penjana jadual**
- Peraturan tetap: guru, kelas dan bilik tak bertindih; slot "tidak boleh" dihormati; waktu berganda tak melintasi rehat; had waktu sehari guru; had pelajaran sama sehari.
- Peraturan lembut (dioptimumkan): kurangkan waktu kosong guru dan kelas, sebar pelajaran merentas hari, subjek berat di waktu pagi, imbang beban harian.
- Pelajaran gabungan serentak (contoh Pendidikan Islam / Moral): satu pelajaran, beberapa kelas, beberapa guru.
- Berjalan dalam **Web Worker**, jadi skrin tak beku. Kalau Worker tak dibenarkan, ia jatuh balik ke main thread secara automatik.
- Waktu yang tak dapat diletak dilaporkan dengan sebab. Semakan awal mengesan data mustahil, contohnya beban guru melebihi kapasiti sebenar.

**Relief**
- Harian: calon diskor dengan sebab yang jelas (subjek sama, panitia, kenal kelas, beban, relief bulan ini). Agih automatik bermula dengan blok paling sukar dahulu.
- Kalendar bulanan: SELESAI / BELUM bagi setiap hari, dengan nama guru tidak hadir.
- Statistik kesaksamaan (purata, sisihan piawai, siapa melebihi purata) dan sejarah, dengan eksport CSV.
- Slip cetak (ringkasan harian + slip setiap guru), slip peribadi untuk guru, dan mesej WhatsApp.

**Storan**
- Pelayar (localStorage), sentiasa aktif.
- Backup JSON: eksport dan import. Dashboard mengingatkan kalau belum backup lebih 7 hari.
- **Google Sheets (beta)**: lihat bahagian di bawah.

## Log masuk, peranan dan pautan guru

Sebelum app dibuka, skrin log masuk meminta peranan:

- **Pentadbir**: log masuk Google (bila app dihos di https), kemudian kata laluan pentadbir. Kali pertama, tetapan awal muncul: nama sekolah, warna dan logo, kata laluan, dan data permulaan (contoh, kosong atau import JSON). Google Sheet sekolah dicipta automatik. Di peranti baharu, app mencari Sheet itu sendiri (Google Drive API) dan terus minta kata laluan.
- **Guru**: buka pautan guru, pilih nama. Tiada kata laluan, tiada log masuk Google. Paparan baca sahaja.
- Pill Google Sheets tidak lagi kekal "Disimpan" bila token tamat: ia bertukar kepada "Sambung untuk simpan" dan perubahan tertangguh dihantar sebaik sahaja disambung semula. Bila app dibuka atau tab kembali fokus, app menyemak Sheet: jika ada versi lebih baharu dan tiada perubahan tempatan, ia ditarik; jika kedua-duanya berubah, dialog konflik keluar. Setiap tab ada penulis sendiri, jadi dua tab pada pelayar sama pun tidak menimpa satu sama lain secara senyap. Data setiap alamat (github.io, netlify.app) dan setiap pelayar tetap berasingan sehingga disambung ke Sheet yang sama.
- Sesi kekal **30 hari** pada peranti itu. Token Google (sah ~1 jam) disimpan supaya muat semula halaman tidak memutuskan sambungan; selepas tamat, satu klik "Sambung semula" (akaun yang sama, tanpa pilih akaun) dan perubahan yang tertangguh dihantar.
- Kata laluan disimpan sebagai hash PBKDF2-SHA256 (120,000 pusingan) dalam data sekolah. **Ia menghalang orang lain membuka paparan pentadbir, bukan melindungi data**: data sebenar dilindungi oleh akaun Google pemilik Sheet.

**Pautan guru.** Setiap kali pentadbir simpan, app menulis salinan ringkas ke Sheet berasingan "Jadual Guru - (sekolah) (baca sahaja)" dan berkongsi Sheet itu sebagai *sesiapa dengan pautan boleh lihat*. Salinan ini tiada hash kata laluan, tiada sebab atau catatan cuti, dan hanya relief 2 bulan terakhir ke hadapan. Sheet utama kekal peribadi. Guru membaca salinan itu melalui `docs.google.com/.../gviz/tq?tqx=out:csv` tanpa log masuk. Jika domain (contohnya DELIMa) menyekat perkongsian awam, app memaparkan langkah kongsi manual.

## Mod demo

Tambah `?demo` pada alamat app, contohnya `https://annurprosolutions-cell.github.io/ruztimetable/?demo`. Pelawat terus masuk sebagai pentadbir tanpa log masuk atau kata laluan, dengan SMK contoh yang jadualnya sudah dijana dan relief sudah diagih. Mereka boleh klik, ubah, jana semula dan lihat paparan guru.

- Setiap pelawat mendapat salinan sendiri dalam pelayar mereka (kunci storan `jadual-demo-*`, berasingan daripada data sekolah sebenar pada alamat yang sama). Tiada apa dihantar ke Google, Worker atau mana-mana pelayan. Ujian e2e menyemak tiada permintaan ke Google.
- Tiada had hari atau akaun. Butang "Set semula" memuatkan semula data contoh asal. Bar demo di atas ada pautan WhatsApp ke `support.whatsapp` dalam `config.js`.
- Google Sheets, pautan guru, pasang app dan notifikasi dimatikan dalam demo.
- Demo sengaja **tidak** memakai akaun Google atau Sheet milik pembekal: kata laluan akaun tidak patut dikongsi, dan satu Sheet bersama akan ditimpa oleh semua pelawat serentak.

## PWA dan notifikasi

- `manifest.webmanifest` + `sw.js`: boleh dipasang ke skrin utama (Android, iPhone melalui Safari > Tambah ke Skrin Utama, komputer) dan dibuka tanpa internet (strategi rangkaian dahulu, cache bila luar talian).
- Notifikasi: guru dimaklumkan bila ada tugas relief baharu untuk dirinya; pentadbir menerima satu ringkasan sehari bagi perkara mendesak. App menyemak data guru setiap 10 minit ketika dibuka, dan setiap kali app dibuka semula.
- **Had:** notifikasi hanya keluar bila app dibuka atau masih hidup di latar. Untuk notifikasi ketika app ditutup sepenuhnya perlu Web Push (kunci VAPID + pelayan yang menghantar, contohnya Cloudflare Worker sedia ada). Pada iPhone, notifikasi hanya untuk app yang dipasang ke skrin utama (iOS 16.4+).

## Google Sheets (beta)

Bila disambung, setiap perubahan disimpan secara automatik (selepas 2.5 saat) ke satu Google Sheet dalam Drive akaun pengguna sendiri. Data tidak melalui server pembekal.

- Skop OAuth: `drive.file`. App hanya boleh membuka fail yang ia cipta sendiri, bukan fail lain dalam Drive pengguna.
- Satu tab bagi setiap jenis data (Guru, Kelas, Pelajaran, Jadual, TidakHadir, Relief dan lain-lain). Lajur bertanda "(rujukan)" hanya untuk dibaca manusia.
- Kalau Sheet dikemas kini dari peranti lain, app berhenti menyimpan dan minta pengguna pilih sama ada mahu muat dari Sheet atau tulis ganti. Data tidak ditulis ganti secara senyap.

Penyediaan (sekali sahaja, oleh pembekal atau IT sekolah):

1. Hos app di https (GitHub Pages / Cloudflare Pages / domain sendiri).
2. Google Cloud Console: cipta projek, aktifkan **Google Sheets API** dan **Google Drive API** (untuk kongsi pautan guru dan cari Sheet di peranti baharu).
3. OAuth consent screen: jenis External, isi nama app dan e-mel sokongan, tambah skop `drive.file`, `openid` dan `email`. Dalam mod "Testing", hanya akaun ujian yang didaftarkan boleh log masuk. Untuk semua sekolah, terbitkan ke "In production". Dari ingatan, `drive.file` tergolong skop bukan sensitif, jadi verifikasi penuh tidak diperlukan, tetapi sahkan dalam console.
4. Credentials > OAuth client ID > Web application. Tambah alamat app (contoh `https://namaanda.github.io`) dalam *Authorized JavaScript origins*.
5. Salin Client ID ke `config.js` (medan `googleClientId`).

Status ujian: aliran penuh (log masuk, cipta Sheet, autosave, konflik, muat semula) diuji dengan Google yang dimock. **Belum diuji dengan akaun Google sebenar.** Admin DELIMa mungkin menyekat app pihak ketiga, jadi uji dengan 2-3 sekolah dahulu.

## Lesen sekolah (Cloudflare Worker)

Simpanan Google Sheets hanya aktif untuk akaun yang berlesen. Guna tempatan dalam pelayar tidak disekat. Worker kecil di folder `worker/` mengesahkan token Google dan menyemak senarai pelanggan (e-mel atau seluruh domain, dengan tarikh luput dan tempoh ihsan 7 hari). Jika `licenseUrl` dalam `config.js` kosong, tiada semakan dibuat. Langkah pasang dan arahan daftar sekolah: [worker/README.md](worker/README.md).

Ini penghalang kesesuaian, bukan DRM: kod app terbuka, jadi ia tidak menghalang pihak yang sengaja menyalin dan membuang semakan.

## Jenama sekolah

Tetapan > Sekolah > Jenama sekolah: muat naik logo (dikecilkan automatik supaya muat satu sel Google Sheets) dan pilih warna. Warna dilaraskan supaya teks putih sentiasa jelas. Logo, nama dan warna disimpan bersama data setiap sekolah, jadi satu URL boleh dikongsi semua sekolah dengan jenama masing-masing. Ia muncul pada header, tab pelayar, jadual cetak dan slip relief. Pada skrin sebelum log masuk, jenama hanya kelihatan pada peranti yang sudah pernah memuatkan data sekolah itu.

## Persediaan Google dan halaman privasi

[docs/google-setup.md](docs/google-setup.md): langkah Google Cloud dan teks untuk consent screen. Halaman dasar privasi ada di `privasi.html` (pautan untuk consent screen). Isi `support.email` dalam `config.js` dahulu; halaman memaparkan amaran jika kosong.

## Susunan kod

```
index.html, config.js     halaman dan tetapan pemasangan (nama app, Client ID Google)
css/app.css               reka bentuk
js/core.js                model data, semakan (validate / precheck), alih waktu (applyMove)
js/engine.js              penjana jadual
js/runner.js              jalankan penjana dalam Web Worker (fallback main thread)
js/relief.js              keperluan relief, calon, agihan, statistik, mesej
js/insights.js            data dashboard: perlu tindakan, kalendar, hari guru
js/sheets.js              format Google Sheets, akses API, log masuk Google
js/license.js             keputusan lesen di sisi app
js/brand.js               palet warna dan semakan logo sekolah
js/access.js              kata laluan (hash), sesi, data guru, CSV, notifikasi relief baharu
js/ui-gate.js             skrin log masuk, tetapan awal, pilih nama guru
js/ui-pwa.js              pasang app, notifikasi, muat semula data guru
(?demo)                   TT.demoSample dalam js/sample.js, bar demo dalam js/app.js
manifest.webmanifest, sw.js, icons/   PWA
worker/                   pelayan lesen (Cloudflare Worker)
privasi.html, docs/       dasar privasi dan panduan persediaan Google
js/sample.js              data contoh SMK
js/icons.js, ui-*.js, app.js   antara muka
tests/                    ujian unit (Node) dan e2e (Playwright)
```

### Cara penjana berfungsi

Fasa 1 meletakkan setiap unit (satu waktu, atau sepasang waktu berganda) pada slot terbaik. Kalau semua slot sah sudah diduduki, ia menolak keluar unit yang menghalang, meletakkan unit baharu, kemudian meletakkan semula unit yang ditolak. Had waktu sehari guru diselesaikan dengan cara sama. Fasa 2 ialah simulated annealing: alih satu unit atau tukar dua unit, terima kalau kos lembut turun, dan tak pernah melanggar peraturan tetap.

Untuk data contoh, pengoptimuman 6 saat mengurangkan waktu kosong guru dari sekitar 120 ke sekitar 30.

## Ujian

```bash
npm test                               # 68 ujian unit, tanpa dependency
npm i playwright && npm run test:e2e   # klik seluruh aliran dalam Chromium
```

- **Ujian unit**: penjana (beberapa seed, waktu dikunci, slot tak boleh, data mustahil, seret rawak), relief (tiada bertindih, had harian, simulasi sebulan dengan sisihan piawai bawah 2.5), dashboard (perlu tindakan, kalendar Isnin-Jumaat dan Ahad-Khamis), Worker, dan Google Sheets (pergi-balik data, suntingan manual dalam Sheets, ralat API) dengan pelayan Sheets palsu.
- **Ujian e2e**: jam pelayar ditetapkan pada Isnin 26/10/2026 waktu Malaysia. Merangkumi skrin log masuk dan tetapan awal, kata laluan salah/betul, sesi kekal selepas muat semula, guru baca sahaja; aliran pentadbir atas `file://` (jana dalam Worker, seret, relief, kalendar, cetak); aliran Google Sheets atas localhost dengan Google dimock (lesen, cipta Sheet, Data Guru dikongsi, autosave, konflik); guru di telefon membuka pautan dan menerima notifikasi relief baharu; pentadbir di peranti baharu; dan PWA dibuka semula tanpa internet.

## Had semasa

- Google Sheets: satu Sheet diurus oleh satu akaun pentadbir (guna akaun pentadbir jadual yang dikongsi). Dengan `drive.file`, akaun Google lain tidak boleh menyimpan ke Sheet yang sama.
- Kata laluan pentadbir ialah penghalang paparan, bukan keselamatan data. Pemilik akaun Google dan sesiapa yang memegang fail backup JSON boleh set semula.
- Guru memilih nama sendiri tanpa pengesahan. Seorang guru boleh melihat jadual guru lain (sama seperti jadual induk yang ditampal di bilik guru).
- Notifikasi belum dihantar ketika app ditutup sepenuhnya (perlu Web Push melalui pelayan).
- Setiap pelajaran guna satu bilik tetap. Tiada "mana-mana makmal yang kosong".
- Tiada kumpulan murid atau blok pilihan (elective) selain pelajaran gabungan serentak.
- Tiada import terus daripada fail aSc atau Winjaws. Tambah ramai hanya melalui tampal teks.
- Sekolah dua sesi: buat satu fail data bagi setiap sesi.
- Penjana ialah heuristik, bukan bukti optimum. Data yang terlalu ketat mungkin tinggalkan beberapa waktu belum diletak; sebabnya dilaporkan.
- Semakan lesen bukan DRM (lihat di atas). Branding sebelum log masuk hanya kelihatan pada peranti yang pernah memuatkan data sekolah.
