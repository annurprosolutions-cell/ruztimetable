# Pelayan lesen (Cloudflare Worker)

Percuma pada free tier Cloudflare untuk skala pilot. Fungsi: app hantar token Google, Worker sahkan dengan Google dan semak senarai pelanggan. Pelanggan baharu dapat percubaan percuma 14 hari secara automatik, dan bayaran melalui borang BCL mengaktifkan lesen tanpa kerja manual.

## Pasang (sekali)
```bash
cd worker
npx wrangler login
npx wrangler kv namespace create LICENSES        # salin id ke wrangler.toml
# isi GOOGLE_CLIENT_ID dan ALLOWED_ORIGINS dalam wrangler.toml
npx wrangler secret put ADMIN_TOKEN              # pilih kata laluan panjang rawak
npx wrangler deploy                              # catat URL, contoh https://jadual-sekolah-lesen.NAMA.workers.dev
```
Kemudian isi `licenseUrl` dalam `../config.js` dengan URL itu dan push.

## Daftar sekolah
```bash
URL=https://jadual-sekolah-lesen.NAMA.workers.dev
TOKEN=...   # ADMIN_TOKEN

# satu e-mel pentadbir
curl -X POST $URL/admin/licenses -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"admin@smkcontoh.edu.my","school":"SMK Contoh","plan":"pilot","expires":"2027-01-31"}'

# semua akaun satu domain (contoh akaun sekolah)
curl -X POST $URL/admin/licenses -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"domain":"smkcontoh.edu.my","school":"SMK Contoh","expires":"2027-12-31"}'

curl $URL/admin/licenses -H "Authorization: Bearer $TOKEN"                                   # senarai
curl -X DELETE "$URL/admin/licenses?key=email:admin@smkcontoh.edu.my" -H "Authorization: Bearer $TOKEN"
```
Pembaharuan = hantar POST yang sama dengan `expires` baharu.

Tambah bulan tanpa kira tarikh sendiri (contoh hadiah, pembayaran luar BCL, atau lesen untuk diri sendiri). Disambung dari tarikh tamat semasa jika masih aktif, jika tidak dari hari ini; percubaan ditukar kepada berbayar:
```bash
curl -X POST $URL/admin/licenses -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"saya@gmail.com","school":"Nama sekolah","addMonths":12}'
```
Di Console pelayar (pada halaman Worker): `fetch('/admin/licenses',{method:'POST',headers:{authorization:'Bearer ISI_ADMIN_TOKEN','content-type':'application/json'},body:JSON.stringify({email:'saya@gmail.com',addMonths:12})}).then(r=>r.json()).then(console.log)`. Kuantiti dalam borang BCL dikira: Bulanan x3 = 3 bulan, Tahunan x2 = 24 bulan.

## Tingkah laku
- Lesen tamat: tempoh ihsan 7 hari (`GRACE_DAYS`), kemudian simpanan Google Sheets dihentikan. Data tempatan dalam pelayar kekal boleh digunakan.
- Pelayan lesen tak dapat dihubungi: app guna semakan terakhir yang berjaya selama 7 hari.
- Kadar permintaan sangat rendah (satu semakan setiap log masuk).

## Had yang perlu diketahui
Ini penghalang kesesuaian, bukan DRM. Kod app dihos terbuka, jadi pihak yang pandai boleh membuang semakan di salinan sendiri. Untuk pasaran sekolah ini memadai, kerana nilai sebenar ialah kemas kini, sokongan dan Google Sheets yang berfungsi.

## Percubaan percuma 14 hari
- Kali pertama satu e-mel log masuk Google dan tiada lesen, Worker cipta lesen `percubaan` selama `TRIAL_DAYS` hari (lalai 14, termasuk hari pertama).
- Sekali sahaja bagi setiap e-mel (kunci `trial:<email>`). Tiada tempoh ihsan selepas percubaan tamat.
- `TRIAL_DAYS = "0"` mematikan percubaan.

## Bayaran BCL automatik (RM20 sebulan, RM200 setahun)
Aliran: pembeli isi borang BCL dengan e-mel log masuk Google -> BCL hantar webhook ke Worker -> Worker **semak semula pesanan dengan API BCL** (webhook BCL tidak ditandatangani) -> lesen e-mel itu dilanjutkan.

### Sediakan borang di BCL
1. Cipta borang bayaran baharu, contoh "Jadual Sekolah: Langganan".
2. Produk: **Langganan Bulanan RM20** dan **Langganan Tahunan RM200**. Nama produk mesti mengandungi perkataan "Bulanan" atau "Tahunan" (Worker guna nama ini untuk kira tempoh; jika tiada, bayaran RM150 ke atas dikira tahunan).
3. Medan tambahan (custom field) wajib: **E-mel akaun Google untuk log masuk** (perkataan "Google", "emel" atau "log masuk" dalam nama medan membolehkan Worker mengenalinya). Jika tiada, e-mel pembayar digunakan.
4. Pilihan: medan **Nama sekolah**.
5. Untuk auto-debit bulanan, guna FPX Direct Debit (mandat bulanan). Setiap potongan berjaya melanjutkan lesen sebulan.

### Rahsia dan tetapan Worker
```bash
npx wrangler secret put BCL_WEBHOOK_KEY   # rentetan rawak panjang, contoh: openssl rand -hex 24
npx wrangler secret put BCL_API_TOKEN     # token API BCL (bermula bcl_), kebenaran "API Read" sahaja
```
Dalam `wrangler.toml`: isi `BUY_URL` (pautan borang BCL) dan `BCL_FORM_ID` (ID borang). Kemudian `npx wrangler deploy`.

Token API: BCL > Platform Setup > Integrations > Developer > API tokens > Create new API token. Pilih **API Read** sahaja, tempoh luput 365 hari (ingat untuk perbaharui).

### Pasang webhook di BCL
URL webhook: `https://<worker>/bcl/<BCL_WEBHOOK_KEY>`. Tandakan peristiwa **Payment Success** dan, untuk auto-debit, **Direct Debit**. Guna "Send Test Webhook" untuk uji (transaksi ujian diabaikan kecuali `BCL_ACCEPT_TEST = "1"`).

### Keselamatan
- BCL tidak menandatangani webhook. Kunci rahsia dalam URL menghalang orang luar, dan setiap bayaran borang disemak semula melalui `GET https://api.bcl.my/v1/transactions/{order}`: status mesti berjaya dan jumlah mesti sama.
- Setiap pesanan diproses sekali sahaja (kunci `bcl:<order>`), jadi webhook berulang tidak menambah tempoh.
- API BCL tiada endpoint untuk potongan auto-debit, jadi potongan bergantung pada kunci rahsia URL dan rekod mandat yang didaftarkan semasa kelulusan. Jangan kongsi URL webhook.
- BCL tidak mencuba semula webhook yang gagal. Semak di BCL > Tools > Webhook Logs dan tekan Resend jika perlu.

### Semak rekod
```bash
curl "$URL/admin/licenses?semua=1" -H "Authorization: Bearer $TOKEN"   # lesen, percubaan, bayaran, mandat dan log 90 hari
```

## Nama pautan guru (`/slug`)
Pentadbir berlangganan menempah nama supaya pautan guru menjadi `https://<alamat app>/s/<nama>`.

| Kaedah | Laluan | Guna |
|---|---|---|
| `GET` | `/slug/<nama>` | Awam (asal mesti dalam `ALLOWED_ORIGINS`): `{ok, gid, school}` atau 404 (`tiada`, `lesen-tamat`) |
| `POST` | `/slug` | Token Google: `{slug, gid, school}`. Tuntut, tukar nama atau kemas kini ID Sheet. 403 `perlu-langganan` untuk percubaan atau tanpa lesen, 409 `telah-digunakan`, 429 `terlalu-kerap` (tukar nama sekali setiap 30 hari) |
| `DELETE` | `/slug` | Token Google: lepaskan nama pemilik |

KV: `slug:<nama>` dan `slugof:<email>`. Nama dikhaskan ada dalam `SLUG_RESERVED` (worker/index.mjs dan js/slug.js, simpan kedua-duanya selaras). Untuk menolak atau memadam nama tertentu secara manual: `DELETE /admin/licenses?key=slug:<nama>` (dan `slugof:<email>`).

## Kaunter awam (`GET /stats`)
Bilangan sahaja, tanpa nama atau e-mel: `{ "paid": 8 | null, "trial": 21, "min": 5 }`. Dipapar pada skrin log masuk app.
- `paid` = lesen berbayar aktif (bukan percubaan, bukan `pilot`, belum tamat). Lesen domain dikira satu. Bernilai `null` selagi kurang daripada `STATS_MIN` (lalai 5), jadi nombor kecil tidak dipaparkan.
- `trial` = percubaan aktif sentiasa dipaparkan.
- `STATS_EXCLUDE` (e-mel atau domain, dipisah koma): akaun yang tidak dikira. **Isi dengan e-mel pemilik dan akaun ujian sendiri**, contoh `annurprosolutions@gmail.com`.
- `STATS_TTL` (saat, lalai 3600): keputusan dicache dalam KV (`stats:cache`). Padam kunci itu untuk kira semula serta-merta.

## Dashboard pemilik (`/admin/` di laman app)
Halaman `https://annurtimetable.com/admin/`: senarai pelanggan (cari, tapis, edit sekolah/pelan/tarikh, tambah bulan, pindah e-mel, padam, export CSV), perlu tindakan (percubaan hampir tamat, pembaharuan, webhook gagal), bayaran, log webhook, nama pautan, dan ringkasan prestasi (langganan aktif, percubaan, MRR, bayaran 30 hari, kadar tukar).
- Log masuk dengan Google: e-mel mesti ada dalam pemboleh ubah `OWNER_EMAILS` (dipisah koma). ADMIN_TOKEN masih boleh digunakan sebagai sandaran.
- Laman app mesti ada dalam `ALLOWED_ORIGINS` (CORS untuk `/admin/*`).
- `GET /admin/overview`: semua rekod dengan status dikira + `stats`. `POST /admin/licenses` dengan `merge: true`: ubah `school`, `plan` atau `expires` tanpa memadam medan lain.
- Bayaran baharu kini menyimpan `amount`; bayaran lama tiada jumlah.
