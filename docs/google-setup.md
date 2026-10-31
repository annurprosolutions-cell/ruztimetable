# Setup Google Cloud untuk Jadual Sekolah

Dibuat sekali sahaja oleh pembekal, bukan oleh setiap sekolah.

## 1. Projek dan API
1. console.cloud.google.com > projek baharu (contoh `jadual-sekolah`).
2. APIs & Services > Library > aktifkan **Google Sheets API** dan **Google Drive API**. Drive API digunakan untuk (a) berkongsi Sheet "Data Guru" melalui pautan, dan (b) mencari Sheet sekolah bila pentadbir log masuk di peranti baharu. Tanpanya app masih berfungsi, tetapi pentadbir perlu kongsi Data Guru secara manual dan tampal pautan Sheet di peranti baharu.

## 2. OAuth consent screen
Pilih *External*, kemudian isi:

| Medan | Nilai |
|---|---|
| App name | Jadual Sekolah |
| User support email | e-mel sokongan anda |
| App logo | logo 120x120 (pilihan, tetapi dikehendaki jika mahu terbit penuh) |
| Application home page | `https://annurtimetable.com/` |
| Application privacy policy link | `https://annurtimetable.com/privasi` |
| Authorized domains | `annurtimetable.com` |
| Developer contact | e-mel anda |

Scopes: tambah `.../auth/drive.file`, `openid`, `.../auth/userinfo.email`.

Publishing status:
- **Testing**: hanya akaun yang didaftar dalam *Test users* boleh log masuk. Daftar e-mel pentadbir setiap sekolah pilot.
- **In production**: tekan *Publish app* bila sedia untuk ramai sekolah. `drive.file` ialah skop non-sensitive, jadi biasanya tiada semakan sensitif, tetapi Google mungkin minta pengesahan domain. Semak status dalam console.

## 3. OAuth client
Credentials > Create credentials > OAuth client ID > *Web application*.
- Authorized JavaScript origins (tanpa laluan, tanpa garis condong hujung): `https://annurtimetable.com`, `https://www.annurtimetable.com`, `https://annurtimetable.annurprosolutions.workers.dev`. Alamat lama (`https://ruzjadual.netlify.app`, `https://annurprosolutions-cell.github.io`) dikekalkan supaya pautan lama masih berfungsi.
- Salin Client ID ke `config.js` (`googleClientId`) dan ke `worker/wrangler.toml` (`GOOGLE_CLIENT_ID`).

## 4. Teks justifikasi skop (jika Google minta)
- `drive.file`: "Aplikasi mencipta satu Google Sheet dalam Drive pengguna untuk menyimpan data jadual sekolah pengguna itu sendiri, dan mengemas kininya. Aplikasi tidak memerlukan akses kepada fail lain."
- `openid` dan `email`: "Memaparkan akaun yang digunakan dan mengesahkan langganan sekolah."

## 5. Isi `config.js`
`support.email` (wajib kerana dipaparkan di halaman privasi), `support.whatsapp`, `vendor`.
