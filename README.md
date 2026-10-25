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

## Google Sheets (beta)

Bila disambung, setiap perubahan disimpan secara automatik (selepas 2.5 saat) ke satu Google Sheet dalam Drive akaun pengguna sendiri. Data tidak melalui server pembekal.

- Skop OAuth: `drive.file`. App hanya boleh membuka fail yang ia cipta sendiri, bukan fail lain dalam Drive pengguna.
- Satu tab bagi setiap jenis data (Guru, Kelas, Pelajaran, Jadual, TidakHadir, Relief dan lain-lain). Lajur bertanda "(rujukan)" hanya untuk dibaca manusia.
- Kalau Sheet dikemas kini dari peranti lain, app berhenti menyimpan dan minta pengguna pilih sama ada mahu muat dari Sheet atau tulis ganti. Data tidak ditulis ganti secara senyap.

Penyediaan (sekali sahaja, oleh pembekal atau IT sekolah):

1. Hos app di https (GitHub Pages / Cloudflare Pages / domain sendiri).
2. Google Cloud Console: cipta projek, aktifkan **Google Sheets API**.
3. OAuth consent screen: jenis External, isi nama app dan e-mel sokongan, tambah skop `drive.file`, `openid` dan `email`. Dalam mod "Testing", hanya akaun ujian yang didaftarkan boleh log masuk. Untuk semua sekolah, terbitkan ke "In production". Dari ingatan, `drive.file` tergolong skop bukan sensitif, jadi verifikasi penuh tidak diperlukan, tetapi sahkan dalam console.
4. Credentials > OAuth client ID > Web application. Tambah alamat app (contoh `https://namaanda.github.io`) dalam *Authorized JavaScript origins*.
5. Salin Client ID ke `config.js` (medan `googleClientId`).

Status ujian: aliran penuh (log masuk, cipta Sheet, autosave, konflik, muat semula) diuji dengan Google yang dimock. **Belum diuji dengan akaun Google sebenar.** Admin DELIMa mungkin menyekat app pihak ketiga, jadi uji dengan 2-3 sekolah dahulu.

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
js/sample.js              data contoh SMK
js/icons.js, ui-*.js, app.js   antara muka
tests/                    ujian unit (Node) dan e2e (Playwright)
```

### Cara penjana berfungsi

Fasa 1 meletakkan setiap unit (satu waktu, atau sepasang waktu berganda) pada slot terbaik. Kalau semua slot sah sudah diduduki, ia menolak keluar unit yang menghalang, meletakkan unit baharu, kemudian meletakkan semula unit yang ditolak. Had waktu sehari guru diselesaikan dengan cara sama. Fasa 2 ialah simulated annealing: alih satu unit atau tukar dua unit, terima kalau kos lembut turun, dan tak pernah melanggar peraturan tetap.

Untuk data contoh, pengoptimuman 6 saat mengurangkan waktu kosong guru dari sekitar 120 ke sekitar 30.

## Ujian

```bash
npm test                               # 40 ujian unit, tanpa dependency
npm i playwright && npm run test:e2e   # klik seluruh aliran dalam Chromium
```

- **Ujian unit**: penjana (beberapa seed, waktu dikunci, slot tak boleh, data mustahil, seret rawak), relief (tiada bertindih, had harian, simulasi sebulan dengan sisihan piawai bawah 2.5), dashboard (perlu tindakan, kalendar Isnin-Jumaat dan Ahad-Khamis), Worker, dan Google Sheets (pergi-balik data, suntingan manual dalam Sheets, ralat API) dengan pelayan Sheets palsu.
- **Ujian e2e**: jam pelayar ditetapkan pada Isnin 26/10/2026 waktu Malaysia. Merangkumi aliran pentadbir atas `file://` (jana dalam Worker, seret, relief, kalendar, cetak), peranan guru (dashboard, slip, susunan telefon), dan aliran Google Sheets atas localhost dengan Google dimock.

## Had semasa

- Google Sheets: satu Sheet diurus oleh satu akaun pentadbir. Dengan `drive.file`, akaun lain perlu membuka fail melalui Google Picker, dan itu belum dibina. Guru belum boleh membuka data sekolah dari telefon sendiri melalui app.
- Peranan bukan kawalan akses. Sesiapa yang ada fail data boleh tukar ke Pentadbir.
- Setiap pelajaran guna satu bilik tetap. Tiada "mana-mana makmal yang kosong".
- Tiada kumpulan murid atau blok pilihan (elective) selain pelajaran gabungan serentak.
- Tiada import terus daripada fail aSc atau Winjaws. Tambah ramai hanya melalui tampal teks.
- Sekolah dua sesi: buat satu fail data bagi setiap sesi.
- Penjana ialah heuristik, bukan bukti optimum. Data yang terlalu ketat mungkin tinggalkan beberapa waktu belum diletak; sebabnya dilaporkan.
- Tiada semakan lesen. Sesiapa yang ada salinan app boleh menggunakannya.
