# Apps Script untuk survey demo

Skrip ini menerima jawapan survey daripada mod demo (`?demo`) dan menyimpannya dalam Google Sheet anda. Fail: [`Code.gs`](Code.gs).

## Pasang (sekali sahaja, kira-kira 5 minit)

1. Cipta Google Sheet baharu dalam akaun Google anda, contohnya **Survey Demo Jadual Sekolah**.
2. Menu **Extensions > Apps Script**. Padam kod sedia ada, tampal **semua** kandungan `Code.gs`, tekan **Save**.
3. Pilih fungsi **sediakanSheet** pada bar atas, tekan **Run**. Google minta kebenaran. Jika keluar amaran "Google hasn't verified this app", tekan **Advanced > Go to (nama projek) (unsafe)**. Ini skrip anda sendiri dan ia hanya mengakses Sheet ini.
4. **Deploy > New deployment**, ikon gear > **Web app**:
   - **Execute as:** Me
   - **Who has access:** **Anyone** (bukan "Anyone with Google account", kalau tidak pelawat tidak boleh menghantar)
5. Tekan **Deploy**, salin **Web app URL** yang berakhir dengan `/exec`.
6. Sahkan URL hidup: buka URL itu dalam pelayar. Anda patut nampak `{"ok":true,"layanan":"survey-jadual-sekolah","versi":1}`.
7. Dalam Sheet, muat semula halaman. Menu baharu **Survey Jadual Sekolah** muncul. Tekan **Hantar baris ujian**: satu baris berid `ujian-...` masuk ke tab **Jawapan**. Kemudian **Padam baris ujian**.
8. Tampal URL dalam `config.js` app: `surveyUrl: 'https://script.google.com/macros/s/.../exec'`, kemudian push.

## Kunci pilihan

Untuk menyukarkan penghantaran rawak: dalam Apps Script **Project Settings > Script properties > Add script property**, nama `SURVEY_KEY`, nilai rahsia pilihan anda. Letak nilai sama pada `surveyKey` dalam `config.js`. Ini bukan keselamatan sebenar (kunci kelihatan dalam `config.js`), cuma menolak penghantaran rawak yang tidak membaca app.

## Apa yang dilakukan skrip

- Setiap responden mendapat **satu baris**. Bahagian 1 (sebelum demo) mencipta baris, bahagian 2 (selepas demo) mengemas kini baris yang sama melalui ID rawak. Hantar semula tidak mencipta baris berganda.
- Tab **Jawapan**: baris 1 ialah kunci lajur, baris 2 ialah teks soalan, data bermula baris 3. Jawapan pilihan disimpan sebagai **teks** pilihan (mudah dibaca), pilihan berganda dipisahkan dengan ` | ` mengikut susunan keutamaan yang dipilih.
- Menu **Kemas kini ringkasan** membina tab **Ringkasan**: bilangan dan peratus bagi setiap pilihan, purata skala, median harga dan NPS.
- Ditolak atau dibuang: format tidak sah, ID tidak sah, medan perangkap robot diisi, kunci salah, badan lebih 30,000 aksara, lebih 120 permintaan seminit, pilihan yang tiada dalam skema, nilai di luar julat. Teks bermula `=`, `+`, `-`, `@` dilumpuhkan supaya tidak jadi formula.
- Tiada nama, telefon atau e-mel dikumpul. Peranti (jenis pelayar) dan tempoh menjawab disimpan untuk menapis jawapan terlalu pantas.
- `GET` pada URL hanya memulangkan status, tiada data.

## Mengubah soalan

Soalan ditakrif dalam [`../js/survey.js`](../js/survey.js). Selepas mengubahnya:

```bash
node tools/gen-appscript.js     # kemas kini blok SCHEMA dalam Code.gs
npm test                        # ujian menyemak Code.gs sepadan dengan survey.js
```

Tampal `Code.gs` baharu ke Apps Script, kemudian **Deploy > Manage deployments > ikon pensel > Version: New version > Deploy**. URL kekal sama. Jika terlupa versi baharu, skrip lama yang masih berjalan.

- **Tambah soalan di hujung:** lajur baharu ditambah di hujung tab Jawapan, baris lama tidak terjejas.
- **Ubah susunan, buang atau sisip soalan di tengah:** baris lama tidak lagi sejajar dengan tajuk baharu. Skrip menamakan semula tab lama kepada `Jawapan (lama ...)` (data kekal) dan mencipta tab `Jawapan` baharu. Soalan yang sudah dihantar oleh pelawat dengan app lama yang tidak lagi wujud akan dibuang.
- Selepas mengubah `survey.js`, push app dan kemas kini Apps Script **kedua-duanya**. Jika hanya satu, jawapan bagi soalan yang tidak dikenali dibuang.

## Menyelesaikan masalah

| Gejala | Punca biasa |
|---|---|
| Jawapan tiada dalam Sheet | Semak **Executions** di Apps Script untuk ralat. Pastikan akses ialah **Anyone** dan URL berakhir `/exec` (bukan `/dev`). |
| Baris ujian masuk tetapi app tidak menghantar | `surveyUrl` dalam `config.js` kosong atau belum dipush. Jawapan menunggu dalam pelayar pelawat dan dihantar bila URL ada dan rangkaian ada. |
| Perubahan kod tiada kesan | Terlupa **New version** semasa deploy. |
| `kunci_salah` dalam Executions | `SURVEY_KEY` dan `surveyKey` tidak sama. |
| Sel teks jadi tarikh | Tidak berlaku untuk lajur soalan (ditetapkan sebagai teks). Lajur yang anda tambah sendiri perlu ditetapkan sendiri. |

App menghantar dalam mod `no-cors` (Apps Script tidak menghantar pengepala CORS), jadi app **tidak dapat membaca jawapan pelayan** dan tidak tahu jika skrip menolak. Selepas pasang, uji dengan satu responden sebenar dan semak Sheet.

Had harian Google untuk web app Apps Script wujud dan berubah, semak dokumentasi Google semasa jika menjangka ribuan responden sehari.
