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
