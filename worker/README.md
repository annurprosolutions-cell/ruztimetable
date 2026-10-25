# Pelayan lesen (Cloudflare Worker)

Percuma pada free tier Cloudflare untuk skala pilot. Fungsi: app hantar token Google, Worker sahkan dengan Google dan semak senarai pelanggan.

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
