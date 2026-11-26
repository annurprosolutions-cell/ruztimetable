// Pangkalan FAQ dan carian tanpa AI. TT.faq = senarai soalan; TT.faqSearch(soalan) = padanan terbaik.
// Setiap entri: { id, topic, q, a, tags (kata kunci dan sinonim), link (bahagian panduan), guru (boleh dilihat guru) }.
(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  TT.faq = [
 {
  "id": "data-simpan",
  "topic": "Akaun dan data",
  "q": "Data saya disimpan di mana?",
  "a": "Dalam pelayar (browser) peranti ini. Jika Google Sheets disambung di Tetapan > Storan, satu salinan turut disimpan dalam Google Sheet milik akaun anda sendiri. Pembekal sistem tidak menerima data anda.",
  "tags": "simpan storan pelayar google sheet drive cloud awan data milik sekolah privasi",
  "link": "#sheets",
  "guru": false
 },
 {
  "id": "pindah-komputer",
  "topic": "Akaun dan data",
  "q": "Macam mana nak pindah ke komputer lain?",
  "a": "Tetapan > Storan > Eksport JSON, kemudian Import JSON di komputer baharu. Jika guna Google Sheets, log masuk dengan akaun yang sama dan tekan \"Muat dari Sheet\".",
  "tags": "pindah komputer lain peranti baharu eksport import json backup salin",
  "link": "#sheets",
  "guru": false
 },
 {
  "id": "tak-dapat-diletak",
  "topic": "Jadual",
  "q": "Kenapa ada waktu yang tidak dapat diletak?",
  "a": "Biasanya beban guru terlalu padat, guru banyak slot \"tidak boleh\", atau bilik khas penuh. Semakan awal sebelum jana dan sebab di atas jadual menunjukkan puncanya. Waktu yang tinggal boleh diseret secara manual.",
  "tags": "tidak dapat diletak belum diletak gagal jana konflik slot padat bilik khas penuh",
  "link": "#jana",
  "guru": false
 },
 {
  "id": "skor-relief",
  "topic": "Relief",
  "q": "Bagaimana skor cadangan relief dikira?",
  "a": "Bonus untuk subjek sama, panitia sama, mengajar kelas itu, guru kelas, dan sambungan kelas yang sama. Penalti untuk bilangan relief bulan ini, relief keseluruhan, relief hari ini dan beban mengajar. Semua pemberat boleh diubah di Tetapan > Peraturan relief.",
  "tags": "skor cadangan relief bonus penalti calon guru ganti adil kesaksamaan",
  "link": "#relief2",
  "guru": false
 },
 {
  "id": "peranan",
  "topic": "Akaun dan data",
  "q": "Apa beza peranan Pentadbir dan Guru?",
  "a": "Pentadbir log masuk dengan Google dan kata laluan, dan mengurus data, jadual serta relief. Guru membuka pautan guru, pilih nama, dan hanya boleh melihat jadual, tugas relief dan slip sendiri. Guru membaca salinan \"Data Guru\" yang berasingan, jadi mereka tidak boleh mengubah data sekolah.",
  "tags": "peranan pentadbir guru admin beza kebenaran baca sahaja",
  "link": "#mula",
  "guru": true
 },
 {
  "id": "guru-telefon",
  "topic": "Telefon dan guru",
  "q": "Macam mana guru dapat jadual di telefon?",
  "a": "Pentadbir: Tetapan > Storan > Pautan guru > Salin atau WhatsApp. Guru buka pautan itu, pilih nama, kemudian tekan \"Pasang app\" supaya ia ada di skrin utama telefon. Data guru dikemas kini setiap kali pentadbir menyimpan.",
  "tags": "guru telefon pautan whatsapp pasang app skrin utama jadual saya",
  "link": "#guru",
  "guru": true
 },
 {
  "id": "log-semula",
  "topic": "Akaun dan data",
  "q": "Kenapa perlu log masuk semula?",
  "a": "Sesi pada peranti kekal 30 hari. Sambungan Google pula hanya sah kira-kira 1 jam setiap kali (peraturan Google untuk app tanpa pelayan). Bila tamat, data masih boleh diguna dan disimpan dalam pelayar; tekan \"Sambung semula\" sekali dan semua perubahan dihantar ke Sheet.",
  "tags": "log masuk semula sesi tamat sambung semula google token sejam",
  "link": "#faq",
  "guru": true
 },
 {
  "id": "notifikasi",
  "topic": "Telefon dan guru",
  "q": "Notifikasi tidak keluar?",
  "a": "Tekan \"Hidupkan notifikasi\" dan benarkan. Pada iPhone, pasang app ke skrin utama dahulu (iOS 16.4 ke atas). Notifikasi dihantar bila app dibuka atau masih berjalan di latar; app yang ditutup sepenuhnya belum menerima notifikasi.",
  "tags": "notifikasi tidak keluar iphone pasang app benarkan amaran",
  "link": "#guru",
  "guru": true
 },
 {
  "id": "ahad-khamis",
  "topic": "Tetapan",
  "q": "Sekolah saya Ahad hingga Khamis. Boleh?",
  "a": "Boleh. Tetapan > Sekolah > Minggu persekolahan. Hari dan relief akan mengikut tetapan itu.",
  "tags": "ahad khamis minggu persekolahan kedah kelantan terengganu johor hari sekolah",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "pi-pm",
  "topic": "Pelajaran",
  "q": "Pendidikan Islam dan Moral serentak, macam mana nak masukkan?",
  "a": "Di Data > Pelajaran > Tambah, pilih mod \"Gabungan serentak\". Pilih kelas yang belajar serentak dan semua guru yang mengajar kumpulan masing-masing. Ia dikira satu slot untuk semua kelas dan semua guru itu.",
  "tags": "pendidikan islam moral serentak gabungan pi pm elektif kumpulan kelas gabung dua guru",
  "link": "#pelajaran",
  "guru": false
 },
 {
  "id": "pdf",
  "topic": "Jadual",
  "q": "Macam mana nak dapat PDF?",
  "a": "Tekan butang Cetak, kemudian pilih \"Save as PDF\" dalam dialog cetak pelayar.",
  "tags": "pdf cetak simpan jadual save as pdf muat turun",
  "link": "#cetak",
  "guru": false
 },
 {
  "id": "dua-sesi",
  "topic": "Tetapan",
  "q": "Sekolah saya dua sesi (pagi dan petang). Macam mana nak set waktu?",
  "a": "Jangan letak semua waktu dalam satu senarai dari pagi hingga petang. Guna Tetapan > Waktu & rehat > \"Waktu berbeza ikut kumpulan kelas\": Set utama jadikan Sesi Pagi (contoh 7.30 hingga 12.30), tekan \"+ Tambah set waktu\" untuk Sesi Petang (contoh 1.30 hingga 5.00), kemudian tetapkan setiap kelas ke sesinya. Guru yang mengajar dua sesi disemak ikut jam sebenar, jadi tidak bertembung. Lakukan sebelum jana jadual.",
  "tags": "dua sesi pagi petang sesi petang sesi pagi waktu mula 7.00 5.00 set waktu kumpulan kelas dua kumpulan",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "rehat-berbeza",
  "topic": "Tetapan",
  "q": "Rehat berbeza untuk PPKI, Tahun 4, 5 dan 6. Boleh?",
  "a": "Boleh. Guna \"Waktu berbeza ikut kumpulan kelas\" (Beta). Tekan \"+ Tambah set waktu\" sekali untuk setiap kumpulan (contoh empat set: PPKI, Tahun 4, Tahun 5, Tahun 6) dan isi rehat masing-masing. Tetapkan kelas ke set guna butang cepat ikut tahun, dan pilih kelas PPKI satu-satu. Guru yang mengajar di dua set disemak ikut jam sebenar. Ciri ini masih Beta, jadi cuba dahulu dengan data sebenar.",
  "tags": "rehat berbeza ppki tahun 4 tahun 5 tahun 6 empat rehat banyak rehat tahap 1 tahap 2 set waktu kumpulan kelas",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "karakter-15",
  "topic": "Tetapan",
  "q": "Macam mana nak masukkan 15 minit pembentukan karakter?",
  "a": "Dalam Tetapan > Waktu & rehat, tambah satu baris jenis \"Rehat\" dengan label Pembentukan karakter (contoh 3.00 hingga 3.15 petang). Ia bukan waktu belajar, jadi penjana tidak meletak pelajaran di situ dan jadual tidak perlu dikunci. Jika hanya hari tertentu, hidupkan \"Masa berbeza setiap hari\". Buat sebelum jana jadual kerana menambah baris waktu selepas jana boleh membuang penempatan yang tidak muat.",
  "tags": "pembentukan karakter 15 minit 2027 kokurikulum perhimpunan lock kunci masa tambah rehat",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "perhimpunan",
  "topic": "Tetapan",
  "q": "Macam mana nak set perhimpunan pagi?",
  "a": "Jika perhimpunan sebelum waktu 1 dan bukan sebahagian jadual, cukup tetapkan waktu 1 bermula selepas perhimpunan. Jika ia mengambil satu waktu: Tetapan > Sekatan serentak > Tambah sekatan, nama Perhimpunan, pilih hari (Isnin sahaja atau semua hari), waktu 1 hingga 1, guru terlibat Semua guru, kemudian jana semula. Petak itu akan bertanda Perhimpunan dalam jadual kelas.",
  "tags": "perhimpunan pagi isnin setiap pagi sekatan serentak label waktu 1 yasin",
  "link": "#sekatan",
  "guru": false
 },
 {
  "id": "masa-hari",
  "topic": "Tetapan",
  "q": "Jam waktu tidak sama setiap hari (contoh sesi petang atau Jumaat). Macam mana?",
  "a": "Tetapan > Waktu & rehat > tandakan \"Masa berbeza setiap hari\" (Beta). Isi jam mula dan tamat bagi setiap hari. Tanda \"tiada kelas\" untuk waktu yang tidak digunakan pada hari tertentu. Jadual, cetakan dan slip akan guna jam hari itu. Tonton video 14.",
  "tags": "masa berbeza setiap hari jumaat pendek sesi petang isnin mula 11.30 rabu jam hari tiada kelas",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "jumaat-pendek",
  "topic": "Tetapan",
  "q": "Hari Jumaat lebih pendek. Macam mana?",
  "a": "Tetapan > Waktu & rehat > bahagian \"Bilangan waktu setiap hari\": kurangkan bilangan waktu untuk Jumaat. Waktu selepas had itu tidak digunakan.",
  "tags": "jumaat pendek had waktu sehari kurang waktu balik awal",
  "link": "#tetapan",
  "guru": false
 },
 {
  "id": "berganda-apa",
  "topic": "Pelajaran",
  "q": "Apa maksud waktu berganda?",
  "a": "Dua waktu belajar bersambung untuk pelajaran, kelas dan guru yang sama, contoh Sains Waktu 1-2. Penjana meletaknya pada dua slot berturut-turut dalam hari yang sama, dan tidak melintasi rehat. Dalam aSc ia dipanggil Double.",
  "tags": "berganda double dua waktu bersambung waktu berturut amali makmal bengkel maksud",
  "link": "#pelajaran",
  "guru": false
 },
 {
  "id": "berganda-bil",
  "topic": "Pelajaran",
  "q": "BM 10 waktu, nak 4 waktu berganda dan 2 waktu tunggal. Macam mana?",
  "a": "Data > Pelajaran: isi Waktu seminggu = 10 dan Pasang berganda = 4. Empat pasang dikira 8 waktu, baki 2 waktu jadi tunggal. Sistem menolak jika pasang berganda darab 2 melebihi jumlah waktu.",
  "tags": "bm 10 waktu 4 double 2 single berganda tunggal waktu seminggu pasang berganda bahasa melayu bilangan waktu",
  "link": "#pelajaran",
  "guru": false
 },
 {
  "id": "dua-guru",
  "topic": "Pelajaran",
  "q": "Satu pelajaran diajar dua guru serentak (pengajaran berpasangan). Boleh?",
  "a": "Boleh. Dalam borang pelajaran, pilih lebih daripada seorang guru. Kedua-dua guru ditempatkan pada waktu yang sama.",
  "tags": "dua guru berpasangan serentak kongsi pelajaran team teaching lebih daripada satu guru",
  "link": "#pelajaran",
  "guru": false
 },
 {
  "id": "pj-lelaki-perempuan",
  "topic": "Pelajaran",
  "q": "PJ lelaki dan perempuan dipisah. Macam mana masukkan?",
  "a": "Guna mod \"Gabungan serentak\" di Data > Pelajaran: pilih kelas-kelas yang PJ-nya serentak, dan masukkan guru lelaki dan guru perempuan sebagai guru pelajaran itu. Bila import dari aSc, kumpulan Boys dan Girls digabung secara automatik.",
  "tags": "pj pjk lelaki perempuan boys girls kumpulan pisah jantina gabungan serentak",
  "link": "#pelajaran",
  "guru": false
 },
 {
  "id": "pj-selang",
  "topic": "Jadual",
  "q": "PJ mesti selang sehari untuk setiap kelas. Boleh dikuncikan?",
  "a": "Belum ada peraturan automatik \"selang sehari\" atau \"hari dibenarkan untuk pelajaran\". Cara sekarang: jana jadual, seret PJ setiap kelas ke hari yang diingini, kemudian tekan ikon kunci supaya kekal bila jana semula. Letak PJ pada satu bilik (contoh Padang) untuk elak dua kelas guna padang serentak. Ciri hari dibenarkan sudah dicadangkan.",
  "tags": "pj selang sehari hari tertentu isnin rabu jumaat hari dibenarkan alternate kunci hari subjek hari",
  "link": "#jana",
  "guru": false
 },
 {
  "id": "had-subjek-sehari",
  "topic": "Jadual",
  "q": "Setiap kelas maksimum 4 mata pelajaran berbeza sehari. Ada?",
  "a": "Belum ada kekangan wajib untuk bilangan subjek berbeza sehari bagi sesebuah kelas. Penjana hanya cuba elak pelajaran yang sama berulang pada hari yang sama (penalti lembut). Ciri ini sudah dicadangkan; hubungi kami jika sekolah anda memerlukannya.",
  "tags": "maksimum empat mata pelajaran sehari subjek berbeza sehari tahun 1 2 3 had subjek kekangan wajib hard constraint",
  "link": "#jana",
  "guru": false
 },
 {
  "id": "kunci-waktu",
  "topic": "Jadual",
  "q": "Macam mana nak kekalkan satu waktu bila jana semula?",
  "a": "Di halaman Jadual, tekan ikon kunci pada petak itu. Waktu yang dikunci kekal bila anda jana semula dalam mod yang mengekalkan waktu dikunci.",
  "tags": "kunci lock waktu kekal jana semula tetap petak tidak berubah",
  "link": "#jana",
  "guru": false
 },
 {
  "id": "import-asc",
  "topic": "Import",
  "q": "Boleh import data dari aSc?",
  "a": "Boleh. Data > Import dari aSc / Excel. Fail Excel aSc dengan tab Pelajaran turut membawa pelajaran (guru, kelas, subjek, waktu seminggu), guru berkongsi dan kelas gabungan, dan kumpulan serentak (PI/PM, lelaki/perempuan) digabung automatik. Jadual yang sudah disusun dalam aSc tidak dibawa masuk; jadual dijana semula. Tonton video 16.",
  "tags": "import asc aSc excel pangkalan data pelajaran import jadual tukar dari asc",
  "link": "#data",
  "guru": false
 },
 {
  "id": "kapasiti-import",
  "topic": "Import",
  "q": "Lepas import keluar ralat \"waktu tetapi jadual cuma ada slot\". Kenapa?",
  "a": "Fail aSc membawa pelajaran, bukan jam waktu sekolah. Kelas yang paling padat memerlukan lebih waktu seminggu daripada yang ada di Tetapan > Waktu & rehat. Tambah waktu sehari (atau waktu Jumaat) sehingga jumlah seminggu mencukupi. Pratonton import menyatakan kelas paling padat dan jumlah waktu yang ada.",
  "tags": "ralat waktu tetapi jadual cuma ada slot 47 waktu 38 kapasiti tidak muat kelas padat import asc tambah waktu",
  "link": "#data",
  "guru": false
 },
 {
  "id": "had-harian-guru",
  "topic": "Import",
  "q": "Guru \"36 waktu tidak muat dengan had harian 7\". Macam mana?",
  "a": "Naikkan \"Had waktu mengajar sehari\" guru itu di Data > Guru > Edit (contoh 8 atau 9). Selepas import dari aSc, had dikira ikut beban seminggu, jadi ralat ini jarang berlaku. Sekolah yang waktunya 30 minit biasanya memerlukan had lebih tinggi.",
  "tags": "had harian guru 7 tidak muat kapasiti sebenar had waktu mengajar sehari 36 waktu ralat guru",
  "link": "#data",
  "guru": false
 },
 {
  "id": "masa-off",
  "topic": "Import",
  "q": "Kenapa Masa Off guru dari aSc tidak diimport?",
  "a": "Nombor waktu aSc berbeza ikut sekolah dan tidak dipetakan secara automatik. Isi waktu \"tidak boleh\" di profil guru (Data > Guru > Edit).",
  "tags": "masa off tidak diimport waktu tidak boleh guru asc",
  "link": "#data",
  "guru": false
 },
 {
  "id": "relief-pecah",
  "topic": "Relief",
  "q": "Waktu 1-2 mahu diberi kepada dua guru ganti berlainan. Boleh?",
  "a": "Boleh. Tetapan > Peraturan relief > tandakan \"Pecah pelajaran berganda\". Setiap waktu jadi keperluan relief sendiri dengan calon dan guru ganti berlainan. Relief yang sudah diagih kekal satu blok: tekan Kosongkan dahulu, kemudian Agih automatik. Tonton video 15.",
  "tags": "relief waktu berganda dua guru berlainan pecah waktu seorang guru dua waktu guru ganti sama",
  "link": "#relief2",
  "guru": false
 },
 {
  "id": "relief-berturut",
  "topic": "Relief",
  "q": "Guru jadi 3 atau 4 waktu berturut-turut (kelas sendiri + relief). Macam mana elak?",
  "a": "Tetapan > Peraturan relief > \"Had waktu berturut-turut\". Isi 2 (disyorkan). Kelas sendiri dan relief dikira bersama dan rehat memutuskan urutan. Ia syarat keras: jika terlalu ketat, sesetengah waktu tiada calon dan perlu dipilih manual.",
  "tags": "relief berturut-turut 3 waktu 4 waktu straight guru penat kelas sendiri sambung had berturut",
  "link": "#relief2",
  "guru": false
 },
 {
  "id": "jenis-cuti",
  "topic": "Relief",
  "q": "Boleh tambah jenis cuti untuk relief?",
  "a": "Belum. Senarai sebab ketidakhadiran tetap: MC, Cuti Rehat, Cuti Kecemasan, Kursus / Bengkel, Urusan Rasmi, Cuti Bersalin dan Lain-lain. Guna Lain-lain dan tulis catatan buat masa ini. Ciri senarai boleh diedit sudah dicadangkan.",
  "tags": "jenis cuti tambah kurang sebab tidak hadir mc cuti rehat kecemasan cuti bersalin ketidakhadiran edit senarai",
  "link": "#relief",
  "guru": false
 },
 {
  "id": "relief-manual",
  "topic": "Relief",
  "q": "Boleh tukar guru ganti yang dicadangkan?",
  "a": "Boleh. Pada setiap waktu di Relief harian, pilih guru lain daripada menu. Anda juga boleh pilih Kelas kendiri atau Gabung dengan kelas lain.",
  "tags": "tukar guru ganti manual kelas kendiri gabung kelas pilih guru lain relief",
  "link": "#relief",
  "guru": false
 },
 {
  "id": "relief-kecuali",
  "topic": "Relief",
  "q": "Macam mana kecualikan PK atau GB daripada relief?",
  "a": "Tetapan > Peraturan relief > \"Jawatan yang dikecualikan\" (contoh GB, PK, Kaunselor), dan isi ruang Jawatan dalam profil guru. Guru boleh juga dikecualikan satu-satu dalam profilnya.",
  "tags": "kecualikan pk gb kaunselor jawatan tidak kena relief guru besar penolong kanan",
  "link": "#relief2",
  "guru": false
 },
 {
  "id": "relief-wa",
  "topic": "Relief",
  "q": "Macam mana hantar relief ke WhatsApp atau cetak slip?",
  "a": "Di Relief harian tekan WhatsApp untuk salin mesej dan tampal dalam kumpulan guru, atau Slip untuk cetak slip bagi papan kenyataan.",
  "tags": "relief whatsapp slip cetak hantar mesej kumpulan guru papan kenyataan",
  "link": "#relief",
  "guru": false
 },
 {
  "id": "admin-lain",
  "topic": "Akaun dan data",
  "q": "Boleh lantik admin lain guna e-mel mereka?",
  "a": "Belum ada senarai pentadbir. Pentadbir ialah sesiapa yang log masuk dengan akaun Google pemilik Sheet sekolah dan tahu kata laluan pentadbir. Orang kedua dengan e-mel berbeza tidak boleh membuka Sheet itu dan mendapat lesen percubaan berasingan. Cara sekarang: guna satu akaun Google sekolah yang dikongsi, atau minta lesen domain. Guru yang hanya perlu melihat boleh guna pautan guru.",
  "tags": "admin lain lantik pentadbir kedua e-mel lain kongsi akaun beberapa admin pengguna tambahan",
  "link": "#guru",
  "guru": false
 },
 {
  "id": "lesen-tamat",
  "topic": "Akaun dan data",
  "q": "Apa berlaku bila lesen tamat?",
  "a": "Lesen berbayar ada 7 hari tempoh ihsan; percubaan tidak ada. Selepas itu simpanan Google Sheets dan nama pautan guru berhenti, tetapi data kekal dalam pelayar dan dalam Sheet sekolah, dan app boleh diteruskan tanpa Google Sheets. Bayar semula untuk menyambung.",
  "tags": "lesen tamat expired langganan tamat tempoh ihsan apa berlaku percubaan tamat data hilang",
  "link": "#lesen",
  "guru": false
 },
 {
  "id": "percubaan",
  "topic": "Akaun dan data",
  "q": "Berapa lama percubaan percuma?",
  "a": "Akaun Google baharu mendapat percubaan 14 hari dengan semua ciri dibuka. Baki hari dipapar di halaman Utama.",
  "tags": "percubaan percuma 14 hari trial coba free",
  "link": "#lesen",
  "guru": false
 },
 {
  "id": "langgan",
  "topic": "Akaun dan data",
  "q": "Macam mana nak melanggan atau memperbaharui?",
  "a": "Tekan Langgan di halaman Utama atau Tetapan > Storan dan bayar melalui borang BCL (bulanan atau tahunan). Lesen disambung secara automatik selepas bayaran berjaya, dari tarikh tamat jika masih aktif.",
  "tags": "langgan bayar perbaharui renew harga bulanan tahunan bcl bayarcash",
  "link": "#lesen",
  "guru": false
 },
 {
  "id": "lupa-kata-laluan",
  "topic": "Akaun dan data",
  "q": "Saya lupa kata laluan pentadbir.",
  "a": "Di skrin kata laluan tekan \"Lupa kata laluan?\", log masuk dengan akaun Google pemilik Sheet, kemudian tetapkan kata laluan baharu.",
  "tags": "lupa kata laluan password pentadbir reset tukar kata laluan",
  "link": "#login",
  "guru": false
 },
 {
  "id": "pasang-app",
  "topic": "Telefon dan guru",
  "q": "Macam mana pasang app ke skrin utama? Nama dan ikonnya apa?",
  "a": "Chrome atau Edge: menu ⋮ > Pasang app. Safari (iPhone): butang Kongsi > Tambah ke Skrin Utama. Nama dan ikon app mengikut nama dan logo sekolah yang ditetapkan di Tetapan > Sekolah. Tetapkan dahulu sebelum memasang; pemasangan lama mungkin tidak berubah.",
  "tags": "pasang app skrin utama install pwa ikon nama sekolah logo add to home screen telefon komputer",
  "link": "#guru",
  "guru": true
 },
 {
  "id": "guru-lama",
  "topic": "Telefon dan guru",
  "q": "Guru tidak nampak kemas kini terbaru.",
  "a": "Data guru dikemas kini setiap kali pentadbir menyimpan ke Google Sheets. Pastikan status simpanan \"Disimpan\", kemudian minta guru muat semula pautan.",
  "tags": "guru tidak nampak kemas kini lama jadual tidak berubah muat semula simpan sheets",
  "link": "#guru",
  "guru": true
 },
 {
  "id": "lebih-komputer",
  "topic": "Akaun dan data",
  "q": "Boleh guna di lebih satu komputer?",
  "a": "Boleh. Log masuk dengan akaun Google yang sama. Elakkan dua orang menyunting serentak; jika berlaku, sistem tunjuk dialog konflik dan anda pilih data mana yang hendak dikekalkan.",
  "tags": "lebih satu komputer dua komputer peranti lain serentak konflik sunting",
  "link": "#faq",
  "guru": false
 },
 {
  "id": "privasi",
  "topic": "Akaun dan data",
  "q": "Adakah data guru dihantar ke pelayan anda?",
  "a": "Tidak. Data jadual disimpan dalam pelayar dan dalam Google Sheet milik akaun sekolah. Pelayan kami hanya menyemak status lesen. Baca Dasar Privasi untuk butiran.",
  "tags": "privasi data guru pelayan selamat pdpa peribadi dihantar",
  "link": "#privasi",
  "guru": false
 },
 {
  "id": "cetak-excel",
  "topic": "Jadual",
  "q": "Macam mana cetak atau muat turun Excel jadual kelas, guru dan bilik?",
  "a": "Di halaman Jadual, pilih paparan (Kelas, Guru, Bilik, Induk) kemudian tekan Cetak atau Excel. Untuk PDF, pilih Save as PDF dalam dialog cetak.",
  "tags": "cetak excel muat turun jadual kelas guru bilik induk xlsx print",
  "link": "#cetak",
  "guru": false
 },
 {
  "id": "bantuan-lain",
  "topic": "Mula",
  "q": "Mana panduan penuh dan video?",
  "a": "Buka panduan bergambar di annurtimetable.com/panduan/ (ada versi PDF) dan senarai 16 video di bahagian Senarai video panduan.",
  "tags": "panduan manual video tutorial belajar pdf buku panduan",
  "link": "#video",
  "guru": false
 }
];

  const STOP = new Set(('yang dan atau di ke dari untuk nak mahu macam mana bagaimana boleh tak tidak ka ni itu ini saya kami kita apa adakah ada dengan pada kalau jika akan sudah dah lagi je sahaja sikit guna buat letak cara tolong ke sebab kenapa bila lepas selepas sebelum cikgu tuan puan sistem app the is of to a in').split(' '));
  const norm = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // penstriman ringkas Bahasa Melayu (buang awalan dan akhiran biasa) supaya "dimaksudkan" padan "maksud"; digunakan sama pada soalan dan pangkalan
  const stem = (t) => {
    if (t.length < 6 || /\d/.test(t)) return t;
    for (const p of ['meng', 'mem', 'men', 'ber', 'ter', 'per', 'me', 'di', 'pe', 'se']) if (t.startsWith(p) && t.length - p.length >= 4) { t = t.slice(p.length); break; }
    for (const x of ['kan', 'nya', 'an', 'i']) if (t.endsWith(x) && t.length - x.length >= 4) { t = t.slice(0, -x.length); break; }
    return t;
  };
  const toks = (v) => norm(v).split(' ').filter((t) => t && (t.length > 1 || /\d/.test(t)) && !STOP.has(t)).map(stem);
  // padanan token: sama, atau awalan (sekurang-kurangnya 4 huruf) supaya "perhimpunan" padan "perhimpun", "berganda" padan "ganda"
  const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  const has = (set, t) => { for (const x of set) if (same(x, t)) return true; return false; };

  const idx = TT.faq.map((e) => ({ e, q: new Set(toks(e.q)), tags: new Set(toks(e.tags)), a: new Set(toks(e.a)), phrases: norm(e.tags), nq: norm(e.q) }));

  // pulangkan entri disusun ikut skor; { entry, score }. guruOnly: hanya entri untuk guru.
  TT.faqSearch = (query, opt) => {
    opt = opt || {};
    const q = toks(query), nq = norm(query);
    if (!q.length) return [];
    const out = [];
    for (const x of idx) {
      if (opt.guruOnly && !x.e.guru) continue;
      let score = 0, hit = 0;
      for (const t of q) {
        let s = 0;
        if (has(x.q, t)) s = 3; else if (has(x.tags, t)) s = 2.5; else if (has(x.a, t)) s = 0.7;
        if (s) { hit++; score += s; }
      }
      if (!hit || hit < Math.ceil(q.length / 2)) continue;
      // bonus frasa: dua kata berturut-turut daripada soalan terdapat dalam tag atau soalan entri
      for (let i = 0; i + 1 < q.length; i++) { const p = q[i] + ' ' + q[i + 1]; if (x.phrases.includes(p) || x.nq.includes(p)) score += 3; }
      score *= 0.6 + 0.4 * (hit / q.length); // liputan soalan
      out.push({ entry: x.e, score: Math.round(score * 10) / 10 });
    }
    out.sort((a, b) => b.score - a.score);
    const top = out.length ? out[0].score : 0;
    return out.filter((r) => r.score >= Math.max(2.5, top * 0.45)).slice(0, opt.limit || 5);
  };

  TT.faqTopics = (guruOnly) => {
    const m = new Map();
    TT.faq.forEach((e) => { if (guruOnly && !e.guru) return; if (!m.has(e.topic)) m.set(e.topic, []); m.get(e.topic).push(e); });
    return [...m.entries()];
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
