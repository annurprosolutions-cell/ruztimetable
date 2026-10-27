/**
 * Survey tester demo Jadual Sekolah: terima jawapan daripada app dan simpan dalam Google Sheet.
 *
 * CARA PASANG (sekali sahaja, kira-kira 5 minit). Penerangan penuh: appscript/README.md
 *  1. Cipta Google Sheet baharu, contohnya "Survey Demo Jadual Sekolah".
 *  2. Menu Extensions > Apps Script. Padam kod sedia ada, tampal SEMUA kandungan fail ini, tekan Save.
 *  3. Pilih fungsi sediakanSheet di bar atas, tekan Run, benarkan kebenaran (hanya untuk Sheet ini).
 *  4. Deploy > New deployment > jenis "Web app".
 *       Execute as: Me
 *       Who has access: Anyone
 *     Tekan Deploy, salin "Web app URL" yang berakhir dengan /exec.
 *  5. Tampal URL itu dalam config.js app pada medan surveyUrl.
 *  6. (Pilihan) Project Settings > Script properties > tambah SURVEY_KEY, dan letak nilai sama pada surveyKey dalam config.js.
 *
 * Selepas mengubah kod ini: Deploy > Manage deployments > ikon pensel > Version: New version > Deploy.
 * URL kekal sama.
 *
 * Jangan edit blok SCHEMA di bawah dengan tangan. Ia dijana oleh `node tools/gen-appscript.js`
 * daripada js/survey.js supaya soalan dalam app dan lajur dalam Sheet sentiasa sepadan.
 */

const CFG = {
  SHEET_JAWAPAN: 'Jawapan',
  SHEET_RINGKASAN: 'Ringkasan',
  TZ: 'Asia/Kuala_Lumpur',
  MAX_BODY: 30000,      // aksara maksimum satu permintaan
  RATE_PER_MIN: 120,    // permintaan maksimum seminit (semua pelawat)
  HEADER_ROWS: 2        // baris 1 = kunci lajur, baris 2 = teks soalan
};

// lajur meta yang diisi oleh skrip (bukan soalan)
const META = [
  ['meta_masa1', 'Masa bahagian 1'],
  ['meta_id', 'ID responden'],
  ['meta_masa2', 'Masa bahagian 2'],
  ['meta_peranti', 'Peranti (ringkas)'],
  ['meta_dur1', 'Tempoh bahagian 1 (saat)'],
  ['meta_dur2', 'Tempoh bahagian 2 (saat)'],
  ['meta_versi', 'Versi survey']
];

/*SCHEMA:BEGIN*/
const SCHEMA = {
 "version": 1,
 "limits": {
  "text": 1500,
  "other": 300,
  "rm": 1000000
 },
 "columns": [
  {
   "key": "peranan",
   "label": "Apakah peranan anda di sekolah?",
   "kind": "single",
   "options": [
    {
     "v": "guru",
     "t": "Guru"
    },
    {
     "v": "guru_kelas",
     "t": "Guru kelas"
    },
    {
     "v": "penyelaras",
     "t": "Penyelaras jadual / relief"
    },
    {
     "v": "pk",
     "t": "Penolong Kanan / Pentadbiran"
    },
    {
     "v": "pengetua",
     "t": "Pengetua / Guru Besar"
    },
    {
     "v": "kerani",
     "t": "Kerani / pembantu pejabat"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "peranan",
   "part": 1
  },
  {
   "key": "peranan_lain",
   "label": "Apakah peranan anda di sekolah? (lain-lain)",
   "kind": "other",
   "qid": "peranan",
   "part": 1
  },
  {
   "key": "jenis",
   "label": "Jenis sekolah",
   "kind": "single",
   "options": [
    {
     "v": "sr",
     "t": "Sekolah rendah kerajaan"
    },
    {
     "v": "sm",
     "t": "Sekolah menengah kerajaan"
    },
    {
     "v": "agama",
     "t": "Sekolah agama / tahfiz"
    },
    {
     "v": "swasta",
     "t": "Sekolah swasta"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "jenis",
   "part": 1
  },
  {
   "key": "jenis_lain",
   "label": "Jenis sekolah (lain-lain)",
   "kind": "other",
   "qid": "jenis",
   "part": 1
  },
  {
   "key": "bil_guru",
   "label": "Bilangan guru",
   "kind": "single",
   "options": [
    {
     "v": "g1",
     "t": "Kurang 20"
    },
    {
     "v": "g2",
     "t": "20 hingga 40"
    },
    {
     "v": "g3",
     "t": "41 hingga 70"
    },
    {
     "v": "g4",
     "t": "71 hingga 100"
    },
    {
     "v": "g5",
     "t": "Lebih 100"
    }
   ],
   "qid": "bil_guru",
   "part": 1
  },
  {
   "key": "bil_kelas",
   "label": "Bilangan kelas",
   "kind": "single",
   "options": [
    {
     "v": "k1",
     "t": "Kurang 10"
    },
    {
     "v": "k2",
     "t": "10 hingga 20"
    },
    {
     "v": "k3",
     "t": "21 hingga 35"
    },
    {
     "v": "k4",
     "t": "36 hingga 50"
    },
    {
     "v": "k5",
     "t": "Lebih 50"
    }
   ],
   "qid": "bil_kelas",
   "part": 1
  },
  {
   "key": "sesi",
   "label": "Satu sesi atau dua sesi?",
   "kind": "single",
   "options": [
    {
     "v": "satu",
     "t": "Satu sesi"
    },
    {
     "v": "dua",
     "t": "Dua sesi (pagi dan petang)"
    }
   ],
   "qid": "sesi",
   "part": 1
  },
  {
   "key": "minggu",
   "label": "Minggu persekolahan",
   "kind": "single",
   "options": [
    {
     "v": "mf",
     "t": "Isnin hingga Jumaat"
    },
    {
     "v": "st",
     "t": "Ahad hingga Khamis"
    }
   ],
   "qid": "minggu",
   "part": 1
  },
  {
   "key": "susun_siapa",
   "label": "Siapa yang menyusun jadual waktu?",
   "kind": "single",
   "options": [
    {
     "v": "penyelaras",
     "t": "Penyelaras jadual"
    },
    {
     "v": "pk",
     "t": "Penolong Kanan"
    },
    {
     "v": "pengetua",
     "t": "Pengetua / Guru Besar"
    },
    {
     "v": "guru",
     "t": "Guru biasa"
    },
    {
     "v": "luar",
     "t": "Pihak luar / pembekal"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "susun_siapa",
   "part": 1
  },
  {
   "key": "susun_siapa_lain",
   "label": "Siapa yang menyusun jadual waktu? (lain-lain)",
   "kind": "other",
   "qid": "susun_siapa",
   "part": 1
  },
  {
   "key": "susun_alat",
   "label": "Guna apa untuk menyusun jadual? (boleh pilih lebih daripada satu)",
   "kind": "multi",
   "options": [
    {
     "v": "excel",
     "t": "Excel / Google Sheet"
    },
    {
     "v": "asc",
     "t": "aSc Timetables"
    },
    {
     "v": "winjaws",
     "t": "Winjaws"
    },
    {
     "v": "kertas",
     "t": "Kertas / papan putih"
    },
    {
     "v": "sistem_lain",
     "t": "Sistem lain"
    }
   ],
   "qid": "susun_alat",
   "part": 1
  },
  {
   "key": "susun_alat_lain",
   "label": "Guna apa untuk menyusun jadual? (boleh pilih lebih daripada satu) (lain-lain)",
   "kind": "other",
   "qid": "susun_alat",
   "part": 1
  },
  {
   "key": "asc_sebab",
   "label": "Kalau pernah guna aSc atau Winjaws: kenapa terus guna, atau kenapa berhenti?",
   "kind": "text",
   "qid": "asc_sebab",
   "part": 1
  },
  {
   "key": "susun_masa",
   "label": "Berapa lama masa untuk menyiapkan jadual setiap tahun?",
   "kind": "single",
   "options": [
    {
     "v": "m1",
     "t": "Kurang sehari"
    },
    {
     "v": "m2",
     "t": "1 hingga 3 hari"
    },
    {
     "v": "m3",
     "t": "4 hingga 7 hari"
    },
    {
     "v": "m4",
     "t": "1 hingga 2 minggu"
    },
    {
     "v": "m5",
     "t": "Lebih 2 minggu"
    }
   ],
   "qid": "susun_masa",
   "part": 1
  },
  {
   "key": "ubah_kali",
   "label": "Berapa kerap jadual berubah dalam setahun?",
   "kind": "single",
   "options": [
    {
     "v": "u0",
     "t": "Hampir tidak pernah"
    },
    {
     "v": "u1",
     "t": "1 hingga 2 kali"
    },
    {
     "v": "u2",
     "t": "3 hingga 5 kali"
    },
    {
     "v": "u3",
     "t": "Lebih 5 kali"
    }
   ],
   "qid": "ubah_kali",
   "part": 1
  },
  {
   "key": "ubah_sebab",
   "label": "Apa sebab utama jadual berubah?",
   "kind": "text",
   "qid": "ubah_sebab",
   "part": 1
  },
  {
   "key": "susah",
   "label": "Apa yang paling menyusahkan semasa menyusun jadual? Pilih sehingga 3, yang pertama dipilih paling utama.",
   "kind": "multi",
   "options": [
    {
     "v": "sekatan",
     "t": "Terlalu banyak sekatan guru"
    },
    {
     "v": "bertindih",
     "t": "Elak guru atau bilik bertindih"
    },
    {
     "v": "gabung",
     "t": "Kelas gabungan / kumpulan"
    },
    {
     "v": "bilik",
     "t": "Bilik khas (makmal, bengkel)"
    },
    {
     "v": "kosong",
     "t": "Waktu kosong guru"
    },
    {
     "v": "ubah_tengah",
     "t": "Ubah jadual pertengahan tahun"
    },
    {
     "v": "alat",
     "t": "Tiada alat yang sesuai atau terlalu mahal"
    },
    {
     "v": "semak",
     "t": "Semak dan betulkan makan masa"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "susah",
   "part": 1,
   "max": 3
  },
  {
   "key": "susah_lain",
   "label": "Apa yang paling menyusahkan semasa menyusun jadual? Pilih sehingga 3, yang pertama dipilih paling utama. (lain-lain)",
   "kind": "other",
   "qid": "susah",
   "part": 1
  },
  {
   "key": "rel_maklum",
   "label": "Bila guru MC atau tidak hadir, siapa yang maklumkan dan kepada siapa?",
   "kind": "single",
   "options": [
    {
     "v": "hubungi_pic",
     "t": "Guru hubungi PK / penyelaras relief (WhatsApp atau telefon)"
    },
    {
     "v": "hubungi_ganti",
     "t": "Guru cari dan maklum sendiri guru ganti"
    },
    {
     "v": "isi_sistem",
     "t": "Guru isi sendiri dalam sistem atau borang"
    },
    {
     "v": "kerani",
     "t": "Kerani atau pejabat yang rekod"
    },
    {
     "v": "tidak_maklum",
     "t": "Penyelaras perasan sendiri (tiada makluman)"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_maklum",
   "part": 1
  },
  {
   "key": "rel_maklum_lain",
   "label": "Bila guru MC atau tidak hadir, siapa yang maklumkan dan kepada siapa? (lain-lain)",
   "kind": "other",
   "qid": "rel_maklum",
   "part": 1
  },
  {
   "key": "rel_bila",
   "label": "Biasanya bila guru memaklumkan ketidakhadiran?",
   "kind": "single",
   "options": [
    {
     "v": "malam",
     "t": "Malam sebelum"
    },
    {
     "v": "pagi_awal",
     "t": "Pagi sebelum 7:30"
    },
    {
     "v": "pagi_lewat",
     "t": "Selepas 7:30 atau dalam waktu persekolahan"
    },
    {
     "v": "berbeza",
     "t": "Tidak tentu"
    }
   ],
   "qid": "rel_bila",
   "part": 1
  },
  {
   "key": "rel_agih_siapa",
   "label": "Siapa yang mengagih guru ganti?",
   "kind": "single",
   "options": [
    {
     "v": "pk",
     "t": "Penolong Kanan"
    },
    {
     "v": "penyelaras",
     "t": "Penyelaras relief"
    },
    {
     "v": "kerani",
     "t": "Kerani"
    },
    {
     "v": "guru_pilih",
     "t": "Guru yang tidak hadir pilih sendiri"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_agih_siapa",
   "part": 1
  },
  {
   "key": "rel_agih_siapa_lain",
   "label": "Siapa yang mengagih guru ganti? (lain-lain)",
   "kind": "other",
   "qid": "rel_agih_siapa",
   "part": 1
  },
  {
   "key": "rel_agih_cara",
   "label": "Cara mengagih relief (boleh pilih lebih daripada satu)",
   "kind": "multi",
   "options": [
    {
     "v": "whatsapp",
     "t": "WhatsApp"
    },
    {
     "v": "papan",
     "t": "Papan kenyataan / kertas"
    },
    {
     "v": "excel",
     "t": "Excel / Google Sheet"
    },
    {
     "v": "sistem",
     "t": "Sistem khas"
    },
    {
     "v": "lisan",
     "t": "Lisan / interkom"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_agih_cara",
   "part": 1
  },
  {
   "key": "rel_agih_cara_lain",
   "label": "Cara mengagih relief (boleh pilih lebih daripada satu) (lain-lain)",
   "kind": "other",
   "qid": "rel_agih_cara",
   "part": 1
  },
  {
   "key": "rel_masa",
   "label": "Berapa lama sehari untuk menguruskan relief?",
   "kind": "single",
   "options": [
    {
     "v": "r1",
     "t": "Kurang 5 minit"
    },
    {
     "v": "r2",
     "t": "5 hingga 15 minit"
    },
    {
     "v": "r3",
     "t": "16 hingga 30 minit"
    },
    {
     "v": "r4",
     "t": "Lebih 30 minit"
    },
    {
     "v": "r5",
     "t": "Tidak tentu"
    }
   ],
   "qid": "rel_masa",
   "part": 1
  },
  {
   "key": "rel_kriteria",
   "label": "Apa yang diambil kira bila memilih guru ganti? Pilih sehingga 3, yang pertama dipilih paling utama.",
   "kind": "multi",
   "options": [
    {
     "v": "subjek",
     "t": "Subjek sama"
    },
    {
     "v": "kenal_kelas",
     "t": "Kenal kelas itu"
    },
    {
     "v": "kurang_relief",
     "t": "Paling kurang relief"
    },
    {
     "v": "kosong",
     "t": "Guru yang ada waktu kosong"
    },
    {
     "v": "panitia",
     "t": "Panitia sama"
    },
    {
     "v": "guru_kelas",
     "t": "Guru kelas"
    },
    {
     "v": "giliran",
     "t": "Ikut giliran tetap"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_kriteria",
   "part": 1,
   "max": 3
  },
  {
   "key": "rel_kriteria_lain",
   "label": "Apa yang diambil kira bila memilih guru ganti? Pilih sehingga 3, yang pertama dipilih paling utama. (lain-lain)",
   "kind": "other",
   "qid": "rel_kriteria",
   "part": 1
  },
  {
   "key": "rel_peraturan",
   "label": "Peraturan relief khas di sekolah anda (had seminggu, guru dikecualikan, dan sebagainya)",
   "kind": "text",
   "qid": "rel_peraturan",
   "part": 1
  },
  {
   "key": "rel_jenis",
   "label": "Jenis ketidakhadiran yang paling kerap",
   "kind": "multi",
   "options": [
    {
     "v": "mc",
     "t": "MC"
    },
    {
     "v": "kursus",
     "t": "Kursus / bengkel"
    },
    {
     "v": "rasmi",
     "t": "Urusan rasmi"
    },
    {
     "v": "rehat",
     "t": "Cuti rehat"
    },
    {
     "v": "kecemasan",
     "t": "Cuti kecemasan"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_jenis",
   "part": 1
  },
  {
   "key": "rel_jenis_lain",
   "label": "Jenis ketidakhadiran yang paling kerap (lain-lain)",
   "kind": "other",
   "qid": "rel_jenis",
   "part": 1
  },
  {
   "key": "rel_lulus",
   "label": "Jenis mana yang perlu kelulusan dahulu?",
   "kind": "multi",
   "options": [
    {
     "v": "mc",
     "t": "MC"
    },
    {
     "v": "kursus",
     "t": "Kursus / bengkel"
    },
    {
     "v": "rasmi",
     "t": "Urusan rasmi"
    },
    {
     "v": "rehat",
     "t": "Cuti rehat"
    },
    {
     "v": "kecemasan",
     "t": "Cuti kecemasan"
    },
    {
     "v": "tiada",
     "t": "Tiada yang perlu kelulusan"
    }
   ],
   "qid": "rel_lulus",
   "part": 1
  },
  {
   "key": "rel_tahu",
   "label": "Bagaimana guru ganti tahu tugasnya?",
   "kind": "multi",
   "options": [
    {
     "v": "whatsapp",
     "t": "WhatsApp"
    },
    {
     "v": "slip",
     "t": "Slip bertulis"
    },
    {
     "v": "perhimpunan",
     "t": "Pengumuman"
    },
    {
     "v": "papan",
     "t": "Papan kenyataan"
    },
    {
     "v": "telefon",
     "t": "Panggilan telefon"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "rel_tahu",
   "part": 1
  },
  {
   "key": "rel_tahu_lain",
   "label": "Bagaimana guru ganti tahu tugasnya? (lain-lain)",
   "kind": "other",
   "qid": "rel_tahu",
   "part": 1
  },
  {
   "key": "rel_rekod",
   "label": "Adakah rekod relief digunakan untuk apa-apa?",
   "kind": "single",
   "options": [
    {
     "v": "laporan",
     "t": "Ya, laporan dalaman"
    },
    {
     "v": "audit",
     "t": "Ya, untuk PPD / JPN / audit"
    },
    {
     "v": "tidak",
     "t": "Tidak"
    },
    {
     "v": "tidak_pasti",
     "t": "Tidak pasti"
    }
   ],
   "qid": "rel_rekod",
   "part": 1
  },
  {
   "key": "rel_guru_isi",
   "label": "Patutkah guru yang tidak hadir isi sendiri dalam sistem?",
   "kind": "single",
   "options": [
    {
     "v": "perlu",
     "t": "Ya, guru isi sendiri"
    },
    {
     "v": "pk_rekod",
     "t": "Tidak, PK atau penyelaras yang rekod"
    },
    {
     "v": "bergantung",
     "t": "Bergantung jenis ketidakhadiran"
    },
    {
     "v": "tidak_pasti",
     "t": "Tidak pasti"
    }
   ],
   "qid": "rel_guru_isi",
   "part": 1
  },
  {
   "key": "google_jenis",
   "label": "Akaun Google apa yang digunakan guru di sekolah?",
   "kind": "single",
   "options": [
    {
     "v": "delima",
     "t": "DELIMa (akaun Google KPM)"
    },
    {
     "v": "workspace",
     "t": "Google Workspace sekolah sendiri"
    },
    {
     "v": "gmail",
     "t": "Gmail biasa"
    },
    {
     "v": "tiada",
     "t": "Tiada akaun Google"
    },
    {
     "v": "tidak_tahu",
     "t": "Tidak tahu"
    }
   ],
   "qid": "google_jenis",
   "part": 1
  },
  {
   "key": "google_sekat",
   "label": "Adakah app pihak ketiga disekat pada akaun itu?",
   "kind": "single",
   "options": [
    {
     "v": "ya",
     "t": "Ya, disekat"
    },
    {
     "v": "tidak",
     "t": "Tidak disekat"
    },
    {
     "v": "tidak_tahu",
     "t": "Tidak tahu"
    }
   ],
   "qid": "google_sekat",
   "part": 1
  },
  {
   "key": "lulus",
   "label": "Siapa yang perlu meluluskan sebelum sekolah guna sistem baharu?",
   "kind": "multi",
   "options": [
    {
     "v": "pengetua",
     "t": "Pengetua / Guru Besar"
    },
    {
     "v": "ppd",
     "t": "PPD"
    },
    {
     "v": "jpn",
     "t": "JPN"
    },
    {
     "v": "jk_ict",
     "t": "JK ICT / pentadbir ICT sekolah"
    },
    {
     "v": "tiada",
     "t": "Tiada kelulusan perlu"
    },
    {
     "v": "tidak_tahu",
     "t": "Tidak tahu"
    }
   ],
   "qid": "lulus",
   "part": 1
  },
  {
   "key": "beli_siapa",
   "label": "Siapa yang membuat keputusan membeli sistem seperti ini?",
   "kind": "single",
   "options": [
    {
     "v": "pengetua",
     "t": "Pengetua / Guru Besar"
    },
    {
     "v": "pk",
     "t": "Penolong Kanan"
    },
    {
     "v": "penyelaras",
     "t": "Penyelaras jadual"
    },
    {
     "v": "jk_ict",
     "t": "JK ICT"
    },
    {
     "v": "saya",
     "t": "Saya sendiri"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "beli_siapa",
   "part": 1
  },
  {
   "key": "beli_siapa_lain",
   "label": "Siapa yang membuat keputusan membeli sistem seperti ini? (lain-lain)",
   "kind": "other",
   "qid": "beli_siapa",
   "part": 1
  },
  {
   "key": "beli_dana",
   "label": "Dari peruntukan mana biasanya dibayar?",
   "kind": "single",
   "options": [
    {
     "v": "pibg",
     "t": "PIBG"
    },
    {
     "v": "tabung",
     "t": "Tabung / akaun sekolah"
    },
    {
     "v": "ppd",
     "t": "Peruntukan PPD / JPN"
    },
    {
     "v": "peribadi",
     "t": "Belanja sendiri"
    },
    {
     "v": "tidak_pasti",
     "t": "Tidak pasti"
    }
   ],
   "qid": "beli_dana",
   "part": 1
  },
  {
   "key": "tugas_jana",
   "label": "Adakah anda dapat menyelesaikan tugas ini tanpa bantuan? Jana jadual",
   "kind": "single",
   "options": [
    {
     "v": "sendiri",
     "t": "Berjaya sendiri"
    },
    {
     "v": "bantuan",
     "t": "Berjaya, perlu bantuan atau lama"
    },
    {
     "v": "gagal",
     "t": "Gagal"
    },
    {
     "v": "tidak_cuba",
     "t": "Tidak cuba"
    }
   ],
   "qid": "tugas",
   "part": 2
  },
  {
   "key": "tugas_rekod",
   "label": "Adakah anda dapat menyelesaikan tugas ini tanpa bantuan? Rekod guru tidak hadir",
   "kind": "single",
   "options": [
    {
     "v": "sendiri",
     "t": "Berjaya sendiri"
    },
    {
     "v": "bantuan",
     "t": "Berjaya, perlu bantuan atau lama"
    },
    {
     "v": "gagal",
     "t": "Gagal"
    },
    {
     "v": "tidak_cuba",
     "t": "Tidak cuba"
    }
   ],
   "qid": "tugas",
   "part": 2
  },
  {
   "key": "tugas_agih",
   "label": "Adakah anda dapat menyelesaikan tugas ini tanpa bantuan? Agih relief",
   "kind": "single",
   "options": [
    {
     "v": "sendiri",
     "t": "Berjaya sendiri"
    },
    {
     "v": "bantuan",
     "t": "Berjaya, perlu bantuan atau lama"
    },
    {
     "v": "gagal",
     "t": "Gagal"
    },
    {
     "v": "tidak_cuba",
     "t": "Tidak cuba"
    }
   ],
   "qid": "tugas",
   "part": 2
  },
  {
   "key": "tugas_slip",
   "label": "Adakah anda dapat menyelesaikan tugas ini tanpa bantuan? Cetak slip",
   "kind": "single",
   "options": [
    {
     "v": "sendiri",
     "t": "Berjaya sendiri"
    },
    {
     "v": "bantuan",
     "t": "Berjaya, perlu bantuan atau lama"
    },
    {
     "v": "gagal",
     "t": "Gagal"
    },
    {
     "v": "tidak_cuba",
     "t": "Tidak cuba"
    }
   ],
   "qid": "tugas",
   "part": 2
  },
  {
   "key": "mudah",
   "label": "Betapa mudah sistem ini digunakan?",
   "kind": "scale",
   "min": 1,
   "max": 5,
   "qid": "mudah",
   "part": 2
  },
  {
   "key": "keliru",
   "label": "Bahagian paling mengelirukan (tulis \"tiada\" jika tiada)",
   "kind": "text",
   "qid": "keliru",
   "part": 2
  },
  {
   "key": "berguna",
   "label": "Bahagian paling berguna",
   "kind": "text",
   "qid": "berguna",
   "part": 2
  },
  {
   "key": "hilang",
   "label": "Apa yang tiada tetapi anda perlukan sebelum boleh guna? (tulis \"tiada\" jika tiada)",
   "kind": "text",
   "qid": "hilang",
   "part": 2
  },
  {
   "key": "tak_perlu",
   "label": "Apa yang anda rasa tidak diperlukan?",
   "kind": "text",
   "qid": "tak_perlu",
   "part": 2
  },
  {
   "key": "peranti",
   "label": "Peranti yang anda gunakan untuk mencuba",
   "kind": "multi",
   "options": [
    {
     "v": "komputer",
     "t": "Komputer / laptop"
    },
    {
     "v": "telefon",
     "t": "Telefon"
    },
    {
     "v": "tablet",
     "t": "Tablet"
    }
   ],
   "qid": "peranti",
   "part": 2
  },
  {
   "key": "teknikal",
   "label": "Masalah teknikal yang dihadapi",
   "kind": "single",
   "options": [
    {
     "v": "tiada",
     "t": "Tiada"
    },
    {
     "v": "lambat",
     "t": "Lambat"
    },
    {
     "v": "paparan",
     "t": "Paparan tidak kemas"
    },
    {
     "v": "lain",
     "t": "Lain-lain"
    }
   ],
   "qid": "teknikal",
   "part": 2
  },
  {
   "key": "teknikal_lain",
   "label": "Masalah teknikal yang dihadapi (lain-lain)",
   "kind": "other",
   "qid": "teknikal",
   "part": 2
  },
  {
   "key": "guru_lihat",
   "label": "Guru patut nampak yang mana?",
   "kind": "single",
   "options": [
    {
     "v": "penuh",
     "t": "Jadual penuh sekolah"
    },
    {
     "v": "sendiri",
     "t": "Jadual sendiri sahaja"
    },
    {
     "v": "pilih",
     "t": "Pentadbir yang tetapkan"
    },
    {
     "v": "tidak_pasti",
     "t": "Tidak pasti"
    }
   ],
   "qid": "guru_lihat",
   "part": 2
  },
  {
   "key": "notif",
   "label": "Bagaimana guru patut dimaklumkan tugas relief? (boleh pilih lebih daripada satu)",
   "kind": "multi",
   "options": [
    {
     "v": "app",
     "t": "Notifikasi app di telefon"
    },
    {
     "v": "whatsapp",
     "t": "WhatsApp"
    },
    {
     "v": "emel",
     "t": "E-mel"
    },
    {
     "v": "tidak",
     "t": "Tidak perlu"
    }
   ],
   "qid": "notif",
   "part": 2
  },
  {
   "key": "guru_selesa",
   "label": "Selesa jika guru lain boleh nampak jadual anda?",
   "kind": "scale",
   "min": 1,
   "max": 5,
   "qid": "guru_selesa",
   "part": 2
  },
  {
   "key": "drive_selesa",
   "label": "Selesa data disimpan dalam Google Drive sekolah sendiri?",
   "kind": "scale",
   "min": 1,
   "max": 5,
   "qid": "drive_selesa",
   "part": 2
  },
  {
   "key": "drive_sebab",
   "label": "Kenapa?",
   "kind": "text",
   "qid": "drive_sebab",
   "part": 2
  },
  {
   "key": "privasi",
   "label": "Apa kebimbangan privasi atau keselamatan anda?",
   "kind": "text",
   "qid": "privasi",
   "part": 2
  },
  {
   "key": "harga_terlalu_murah",
   "label": "Bagi satu sekolah, berapa harga setahun yang anda rasa: Terlalu murah sampai ragu kualiti",
   "kind": "number",
   "qid": "harga",
   "part": 2
  },
  {
   "key": "harga_murah",
   "label": "Bagi satu sekolah, berapa harga setahun yang anda rasa: Murah dan berpatutan",
   "kind": "number",
   "qid": "harga",
   "part": 2
  },
  {
   "key": "harga_mahal_ok",
   "label": "Bagi satu sekolah, berapa harga setahun yang anda rasa: Mahal, tetapi masih sanggup",
   "kind": "number",
   "qid": "harga",
   "part": 2
  },
  {
   "key": "harga_terlalu_mahal",
   "label": "Bagi satu sekolah, berapa harga setahun yang anda rasa: Terlalu mahal, tidak akan beli",
   "kind": "number",
   "qid": "harga",
   "part": 2
  },
  {
   "key": "bayar",
   "label": "Lebih suka bayar bagaimana?",
   "kind": "single",
   "options": [
    {
     "v": "bulanan",
     "t": "Bulanan"
    },
    {
     "v": "tahunan",
     "t": "Tahunan"
    },
    {
     "v": "kedua",
     "t": "Dua-dua boleh"
    }
   ],
   "qid": "bayar",
   "part": 2
  },
  {
   "key": "syarat",
   "label": "Apa yang diperlukan sebelum sekolah beli?",
   "kind": "multi",
   "options": [
    {
     "v": "data_sendiri",
     "t": "Cuba dengan data sendiri"
    },
    {
     "v": "rujukan",
     "t": "Rujukan sekolah lain"
    },
    {
     "v": "kontrak",
     "t": "Kontrak / perjanjian bertulis"
    },
    {
     "v": "latihan",
     "t": "Latihan atau sesi pengenalan"
    },
    {
     "v": "sokongan",
     "t": "Sokongan WhatsApp"
    },
    {
     "v": "invois",
     "t": "Invois / pesanan belian rasmi"
    }
   ],
   "qid": "syarat",
   "part": 2
  },
  {
   "key": "nps",
   "label": "Sejauh mana anda akan mencadangkan sistem ini kepada guru lain?",
   "kind": "scale",
   "min": 0,
   "max": 10,
   "qid": "nps",
   "part": 2
  },
  {
   "key": "mula",
   "label": "Bila sekolah anda boleh mula guna?",
   "kind": "single",
   "options": [
    {
     "v": "sekarang",
     "t": "Sekarang"
    },
    {
     "v": "sebelum_sesi",
     "t": "Sebelum sesi persekolahan baharu"
    },
    {
     "v": "tahun_depan",
     "t": "Tahun depan"
    },
    {
     "v": "tidak_pasti",
     "t": "Tidak pasti"
    }
   ],
   "qid": "mula",
   "part": 2
  }
 ]
};
/*SCHEMA:END*/

// ---------------------------------------------------------------------------------------------
// Titik masuk web app
// ---------------------------------------------------------------------------------------------

/** Terima jawapan (POST, badan JSON dihantar sebagai text/plain supaya tiada preflight CORS). */
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw) return json_({ ok: false, error: 'kosong' });
    if (raw.length > CFG.MAX_BODY) return json_({ ok: false, error: 'terlalu_besar' });
    let p;
    try { p = JSON.parse(raw); } catch (x) { return json_({ ok: false, error: 'json_tidak_sah' }); }
    const salah = semak_(p);
    if (salah) return json_({ ok: false, error: salah });
    if (!kadar_()) return json_({ ok: false, error: 'terlalu_kerap' });
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return json_({ ok: false, error: 'sibuk' });
    try {
      return json_(Object.assign({ ok: true }, simpan_(p)));
    } finally {
      lock.releaseLock();
    }
  } catch (x) {
    console.error(x && x.stack ? x.stack : String(x));
    return json_({ ok: false, error: 'ralat_pelayan' });
  }
}

/** Semakan kesihatan: buka URL /exec dalam pelayar. Tidak mendedahkan sebarang data. */
function doGet() {
  return json_({ ok: true, layanan: 'survey-jadual-sekolah', versi: SCHEMA.version });
}

// ---------------------------------------------------------------------------------------------
// Pengesahan dan penyimpanan
// ---------------------------------------------------------------------------------------------

function semak_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'format_tidak_sah';
  if (p.part !== 1 && p.part !== 2) return 'bahagian_tidak_sah';
  if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(p.id)) return 'id_tidak_sah';
  if (p.hp) return 'ditolak';                       // perangkap robot: medan tersembunyi mesti kosong
  const kunci = PropertiesService.getScriptProperties().getProperty('SURVEY_KEY');
  if (kunci && p.key !== kunci) return 'kunci_salah';
  if (!p.answers || typeof p.answers !== 'object' || Array.isArray(p.answers)) return 'jawapan_tidak_sah';
  return '';
}

/** Hadkan bilangan permintaan seminit supaya URL awam tidak boleh dibanjiri. */
function kadar_() {
  const cache = CacheService.getScriptCache();
  const k = 'r' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 120);
  return n <= CFG.RATE_PER_MIN;
}

/** Tukar satu nilai dari app kepada nilai sel. Pulangkan null jika tidak sah (nilai dibuang, bukan dipercayai). */
function bersih_(def, v) {
  const L = SCHEMA.limits;
  if (def.kind === 'single') {
    const o = def.options.filter(function (x) { return x.v === v; })[0];
    return o ? o.t : null;
  }
  if (def.kind === 'multi') {
    if (!Array.isArray(v)) return null;
    const dilihat = {}, out = [];
    v.forEach(function (x) {
      const o = def.options.filter(function (y) { return y.v === x; })[0];
      if (o && !dilihat[o.v]) { dilihat[o.v] = true; out.push(o.t); }
    });
    const had = def.max || def.options.length;
    return out.length ? out.slice(0, had).join(' | ') : null;
  }
  if (def.kind === 'scale') {
    const n = Number(v);
    return typeof v !== 'boolean' && v !== '' && v !== null && Number.isInteger(n) && n >= def.min && n <= def.max ? n : null;
  }
  if (def.kind === 'number') {
    const n = Number(v);
    return v !== '' && v !== null && typeof v !== 'boolean' && isFinite(n) && n >= 0 && n <= L.rm ? n : null;
  }
  if (def.kind === 'text' || def.kind === 'other') {
    if (typeof v !== 'string') return null;
    let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, def.kind === 'text' ? L.text : L.other);
    if (!s) return null;
    if (/^[=+\-@]/.test(s)) s = "'" + s;           // elak formula dalam sel
    return s;
  }
  return null;
}

function lajur_() {
  return META.map(function (m) { return { key: m[0], label: m[1], kind: 'meta' }; })
    .concat(SCHEMA.columns.map(function (c) { return { key: c.key, label: c.label, kind: c.kind }; }));
}

function sekarang_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
}

function simpan_(p) {
  const sheet = sediakanSheet_();
  const cols = lajur_(), idx = {};
  cols.forEach(function (c, i) { idx[c.key] = i; });
  const def = {};
  SCHEMA.columns.forEach(function (c) { def[c.key] = c; });

  // cari baris sedia ada bagi responden ini (hantar semula atau bahagian 2 mengemas kini baris yang sama)
  const akhir = sheet.getLastRow();
  const bilData = Math.max(0, akhir - CFG.HEADER_ROWS);
  const ids = bilData ? sheet.getRange(CFG.HEADER_ROWS + 1, idx.meta_id + 1, bilData, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  const pos = ids.indexOf(p.id);
  const baris = pos >= 0 ? CFG.HEADER_ROWS + 1 + pos : Math.max(akhir, CFG.HEADER_ROWS) + 1;
  const row = pos >= 0 ? sheet.getRange(baris, 1, 1, cols.length).getValues()[0] : cols.map(function () { return ''; });

  const masa = sekarang_();
  const mk = p.part === 1 ? 'meta_masa1' : 'meta_masa2', dk = p.part === 1 ? 'meta_dur1' : 'meta_dur2';
  if (!row[idx[mk]]) row[idx[mk]] = masa;
  row[idx.meta_id] = p.id;
  if (!row[idx.meta_peranti]) row[idx.meta_peranti] = String(p.ua || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 120);
  const dur = Number(p.dur);
  if (isFinite(dur) && dur >= 0 && dur <= 86400) row[idx[dk]] = Math.round(dur);
  row[idx.meta_versi] = SCHEMA.version;

  let diterima = 0, dibuang = 0;
  const teks = [];
  Object.keys(p.answers).forEach(function (k) {
    const d = Object.prototype.hasOwnProperty.call(def, k) ? def[k] : null;
    if (!d || d.part !== p.part) { dibuang++; return; }
    const nilai = bersih_(d, p.answers[k]);
    if (nilai === null) { dibuang++; return; }
    row[idx[k]] = nilai;
    diterima++;
    if (d.kind === 'text' || d.kind === 'other') teks.push(idx[k]);
  });

  // lajur teks: format teks supaya "1/2" atau "3-4" tidak ditukar menjadi tarikh
  teks.forEach(function (c) { sheet.getRange(baris, c + 1).setNumberFormat('@'); });
  sheet.getRange(baris, 1, 1, cols.length).setValues([row]);
  return { baru: pos < 0, baris: baris, diterima: diterima, dibuang: dibuang };
}

// ---------------------------------------------------------------------------------------------
// Sheet: sediakan, ringkasan, menu
// ---------------------------------------------------------------------------------------------

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sediakanSheet_() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(CFG.SHEET_JAWAPAN);
  const cols = lajur_();
  if (sheet) {
    // Tajuk sedia ada mesti sepadan dengan skema (atau lebih pendek: soalan baharu ditambah di hujung).
    // Jika susunan berubah, baris lama tidak lagi sejajar dengan tajuk baharu: simpan tab lama (data kekal) dan mulakan tab baharu.
    const lebar = Math.max(cols.length, sheet.getLastColumn());
    const kini = sheet.getRange(1, 1, 1, lebar).getValues()[0];
    const bercanggah = kini.some(function (v, i) { return v !== '' && (i >= cols.length || v !== cols[i].key); });
    if (bercanggah) {
      sheet.setName(CFG.SHEET_JAWAPAN + ' (lama ' + sekarang_().replace(/[: ]/g, '-') + ')');
      sheet = null;
    }
  }
  if (!sheet) sheet = ss.insertSheet(CFG.SHEET_JAWAPAN);
  // tulis tajuk hanya jika tiada atau kurang lajur: setiap permintaan tidak perlu menulis semula
  const sedia = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
  if (!cols.every(function (c, i) { return sedia[i] === c.key; })) {
    sheet.getRange(1, 1, 2, cols.length).setValues([cols.map(function (c) { return c.key; }), cols.map(function (c) { return c.label; })]);
  }
  return sheet;
}

/** Jalankan sekali sebelum deploy: cipta tab Jawapan dengan tajuk, bekukan baris tajuk, kemaskan paparan. */
function sediakanSheet() {
  const sheet = sediakanSheet_();
  const cols = lajur_();
  sheet.setFrozenRows(CFG.HEADER_ROWS);
  sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#e8eaed').setFontColor('#5f6368');
  sheet.getRange(2, 1, 1, cols.length).setFontWeight('bold').setBackground('#d2e3fc').setWrap(true).setVerticalAlignment('top');
  for (let i = 1; i <= cols.length; i++) sheet.setColumnWidth(i, i <= META.length ? 150 : 190);
  const ss = spreadsheet_();
  if (!ss.getSheetByName(CFG.SHEET_RINGKASAN)) ss.insertSheet(CFG.SHEET_RINGKASAN);
  return 'Sheet "' + CFG.SHEET_JAWAPAN + '" sedia dengan ' + cols.length + ' lajur.';
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Survey Jadual Sekolah')
    .addItem('Sediakan sheet', 'sediakanSheet')
    .addItem('Kemas kini ringkasan', 'kemasKiniRingkasan')
    .addSeparator()
    .addItem('Hantar baris ujian', 'hantarUjian')
    .addItem('Padam baris ujian', 'padamBarisUjian')
    .addToUi();
}

function dataRows_() {
  const sheet = sediakanSheet_();
  const n = Math.max(0, sheet.getLastRow() - CFG.HEADER_ROWS);
  return n ? sheet.getRange(CFG.HEADER_ROWS + 1, 1, n, lajur_().length).getValues() : [];
}

function median_(a) {
  const s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Bina tab Ringkasan: kiraan setiap pilihan, purata skala, statistik harga dan NPS. */
function kemasKiniRingkasan() {
  const rows = dataRows_(), cols = lajur_(), idx = {};
  cols.forEach(function (c, i) { idx[c.key] = i; });
  const ada = function (r, k) { const v = r[idx[k]]; return v !== '' && v !== null && v !== undefined; };
  const out = [['Soalan', 'Jawapan / ukuran', 'Bilangan', '% daripada yang menjawab']];
  const pct = function (n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; };
  out.push(['Jumlah responden', 'Bahagian 1 (sebelum demo)', rows.filter(function (r) { return ada(r, 'meta_masa1'); }).length, '']);
  out.push(['Jumlah responden', 'Bahagian 2 (selepas demo)', rows.filter(function (r) { return ada(r, 'meta_masa2'); }).length, '']);

  SCHEMA.columns.forEach(function (c) {
    const dijawab = rows.filter(function (r) { return ada(r, c.key); });
    const d = dijawab.length;
    if (c.kind === 'single') {
      c.options.forEach(function (o) {
        const n = dijawab.filter(function (r) { return String(r[idx[c.key]]) === o.t; }).length;
        out.push([c.label, o.t, n, pct(n, d)]);
      });
    } else if (c.kind === 'multi') {
      c.options.forEach(function (o) {
        const n = dijawab.filter(function (r) { return String(r[idx[c.key]]).split(' | ').indexOf(o.t) >= 0; }).length;
        out.push([c.label, o.t, n, pct(n, d)]);
      });
    } else if (c.kind === 'scale') {
      const nilai = dijawab.map(function (r) { return Number(r[idx[c.key]]); });
      for (let v = c.min; v <= c.max; v++) {
        const n = nilai.filter(function (x) { return x === v; }).length;
        out.push([c.label, String(v), n, pct(n, d)]);
      }
      if (d) out.push([c.label, 'Purata', Math.round((nilai.reduce(function (a, b) { return a + b; }, 0) / d) * 100) / 100, '']);
      if (c.key === 'nps' && d) {
        const pro = nilai.filter(function (x) { return x >= 9; }).length, det = nilai.filter(function (x) { return x <= 6; }).length;
        out.push([c.label, 'NPS (penyokong 9-10 tolak pengkritik 0-6)', Math.round(((pro - det) / d) * 100), '']);
      }
    } else if (c.kind === 'number') {
      const nilai = dijawab.map(function (r) { return Number(r[idx[c.key]]); });
      if (d) {
        out.push([c.label, 'Bilangan jawapan', d, '']);
        out.push([c.label, 'Median', median_(nilai), '']);
        out.push([c.label, 'Purata', Math.round((nilai.reduce(function (a, b) { return a + b; }, 0) / d) * 100) / 100, '']);
        out.push([c.label, 'Terendah', Math.min.apply(null, nilai), '']);
        out.push([c.label, 'Tertinggi', Math.max.apply(null, nilai), '']);
      } else out.push([c.label, 'Bilangan jawapan', 0, '']);
    } else if (c.kind === 'text') {
      out.push([c.label, 'Bilangan yang menulis (baca di tab Jawapan)', d, '']);
    }
  });

  const ss = spreadsheet_();
  let s = ss.getSheetByName(CFG.SHEET_RINGKASAN);
  if (!s) s = ss.insertSheet(CFG.SHEET_RINGKASAN);
  s.clear();
  s.getRange(1, 1, out.length, 4).setValues(out);
  s.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#d2e3fc');
  s.setFrozenRows(1);
  s.setColumnWidth(1, 420); s.setColumnWidth(2, 320); s.setColumnWidth(3, 90); s.setColumnWidth(4, 170);
  return out.length - 1;
}

// ---------------------------------------------------------------------------------------------
// Ujian dalam editor (tidak menyentuh data sebenar: baris ujian berid "ujian-...")
// ---------------------------------------------------------------------------------------------

function contohJawapan_(part) {
  const a = {};
  SCHEMA.columns.forEach(function (c, i) {
    if (c.part !== part) return;
    if (c.kind === 'single' || c.kind === 'multi') a[c.key] = c.kind === 'multi' ? [c.options[0].v] : c.options[0].v;
    else if (c.kind === 'scale') a[c.key] = c.max;
    else if (c.kind === 'text') a[c.key] = 'jawapan ujian';
    else if (c.kind === 'number') a[c.key] = (i % 4 + 1) * 100;
  });
  return a;
}

/** Hantar satu responden ujian (bahagian 1 dan 2) melalui doPost, untuk sahkan semuanya berfungsi. */
function hantarUjian() {
  const id = 'ujian-' + Date.now();
  const kunci = PropertiesService.getScriptProperties().getProperty('SURVEY_KEY') || '';
  const hasil = [1, 2].map(function (part) {
    const res = doPost({ postData: { contents: JSON.stringify({ v: SCHEMA.version, part: part, id: id, key: kunci, hp: '', ua: 'ujian-editor', dur: 60, answers: contohJawapan_(part) }) } });
    return JSON.parse(res.getContent());
  });
  console.log(JSON.stringify(hasil));
  return hasil;
}

function padamBarisUjian() {
  const sheet = sediakanSheet_(), col = lajur_().map(function (c) { return c.key; }).indexOf('meta_id') + 1;
  let padam = 0;
  for (let r = sheet.getLastRow(); r > CFG.HEADER_ROWS; r--) {
    if (String(sheet.getRange(r, col).getValue()).indexOf('ujian-') === 0) { sheet.deleteRow(r); padam++; }
  }
  return padam;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
