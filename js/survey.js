(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Survey tester demo. Satu sumber kebenaran: app (js/ui-survey.js) dan Google Apps Script (appscript/Code.gs, dijana oleh
  // tools/gen-appscript.js) kedua-duanya membaca skema ini, jadi soalan dan lajur Sheet sentiasa sepadan.
  //   part 1 = sebelum cuba demo (popup wajib), part 2 = selepas cuba demo (butang terapung "Maklum Balas")
  // Jenis: single, multi (max = pilih sehingga N mengikut keutamaan), scale, text, matrix, numbers
  const o = (v, t, other) => (other ? { v, t, other: true } : { v, t });
  const LAIN = o('lain', 'Lain-lain', true);

  TT.SURVEY = {
    version: 1,
    sections: [
      { id: 'profil', part: 1, title: 'Tentang anda', intro: 'Pilih yang paling hampir dengan keadaan anda.', questions: [
        { id: 'peranan', type: 'single', req: true, label: 'Apakah peranan anda di sekolah?', options: [o('guru', 'Guru'), o('guru_kelas', 'Guru kelas'), o('penyelaras', 'Penyelaras jadual / relief'), o('pk', 'Penolong Kanan / Pentadbiran'), o('pengetua', 'Pengetua / Guru Besar'), o('kerani', 'Kerani / pembantu pejabat'), LAIN] },
        { id: 'jenis', type: 'single', req: true, label: 'Jenis sekolah', options: [o('sr', 'Sekolah rendah kerajaan'), o('sm', 'Sekolah menengah kerajaan'), o('agama', 'Sekolah agama / tahfiz'), o('swasta', 'Sekolah swasta'), LAIN] },
        { id: 'bil_guru', type: 'single', req: true, label: 'Bilangan guru', options: [o('g1', 'Kurang 20'), o('g2', '20 hingga 40'), o('g3', '41 hingga 70'), o('g4', '71 hingga 100'), o('g5', 'Lebih 100')] },
        { id: 'bil_kelas', type: 'single', req: true, label: 'Bilangan kelas', options: [o('k1', 'Kurang 10'), o('k2', '10 hingga 20'), o('k3', '21 hingga 35'), o('k4', '36 hingga 50'), o('k5', 'Lebih 50')] },
        { id: 'sesi', type: 'single', label: 'Satu sesi atau dua sesi?', options: [o('satu', 'Satu sesi'), o('dua', 'Dua sesi (pagi dan petang)')] },
        { id: 'minggu', type: 'single', label: 'Minggu persekolahan', options: [o('mf', 'Isnin hingga Jumaat'), o('st', 'Ahad hingga Khamis')] }
      ] },
      { id: 'jadual', part: 1, title: 'Jadual waktu sekarang', intro: 'Bagaimana jadual disusun di sekolah anda pada masa ini.', questions: [
        { id: 'susun_siapa', type: 'single', req: true, label: 'Siapa yang menyusun jadual waktu?', options: [o('penyelaras', 'Penyelaras jadual'), o('pk', 'Penolong Kanan'), o('pengetua', 'Pengetua / Guru Besar'), o('guru', 'Guru biasa'), o('luar', 'Pihak luar / pembekal'), LAIN] },
        { id: 'susun_alat', type: 'multi', req: true, label: 'Guna apa untuk menyusun jadual? (boleh pilih lebih daripada satu)', options: [o('excel', 'Excel / Google Sheet'), o('asc', 'aSc Timetables'), o('winjaws', 'Winjaws'), o('kertas', 'Kertas / papan putih'), o('sistem_lain', 'Sistem lain', true)] },
        { id: 'asc_sebab', type: 'text', label: 'Kalau pernah guna aSc atau Winjaws: kenapa terus guna, atau kenapa berhenti?', showIf: { id: 'susun_alat', anyOf: ['asc', 'winjaws'] } },
        { id: 'susun_masa', type: 'single', req: true, label: 'Berapa lama masa untuk menyiapkan jadual setiap tahun?', options: [o('m1', 'Kurang sehari'), o('m2', '1 hingga 3 hari'), o('m3', '4 hingga 7 hari'), o('m4', '1 hingga 2 minggu'), o('m5', 'Lebih 2 minggu')] },
        { id: 'ubah_kali', type: 'single', label: 'Berapa kerap jadual berubah dalam setahun?', options: [o('u0', 'Hampir tidak pernah'), o('u1', '1 hingga 2 kali'), o('u2', '3 hingga 5 kali'), o('u3', 'Lebih 5 kali')] },
        { id: 'ubah_sebab', type: 'text', label: 'Apa sebab utama jadual berubah?' },
        { id: 'susah', type: 'multi', max: 3, req: true, label: 'Apa yang paling menyusahkan semasa menyusun jadual? Pilih sehingga 3, yang pertama dipilih paling utama.', options: [o('sekatan', 'Terlalu banyak sekatan guru'), o('bertindih', 'Elak guru atau bilik bertindih'), o('gabung', 'Kelas gabungan / kumpulan'), o('bilik', 'Bilik khas (makmal, bengkel)'), o('kosong', 'Waktu kosong guru'), o('ubah_tengah', 'Ubah jadual pertengahan tahun'), o('alat', 'Tiada alat yang sesuai atau terlalu mahal'), o('semak', 'Semak dan betulkan makan masa'), LAIN] }
      ] },
      { id: 'relief', part: 1, title: 'Relief (guru ganti) sekarang', intro: 'Bagaimana relief diuruskan pada hari guru tidak hadir.', questions: [
        { id: 'rel_maklum', type: 'single', req: true, label: 'Bila guru MC atau tidak hadir, siapa yang maklumkan dan kepada siapa?', options: [o('hubungi_pic', 'Guru hubungi PK / penyelaras relief (WhatsApp atau telefon)'), o('hubungi_ganti', 'Guru cari dan maklum sendiri guru ganti'), o('isi_sistem', 'Guru isi sendiri dalam sistem atau borang'), o('kerani', 'Kerani atau pejabat yang rekod'), o('tidak_maklum', 'Penyelaras perasan sendiri (tiada makluman)'), LAIN] },
        { id: 'rel_bila', type: 'single', req: true, label: 'Biasanya bila guru memaklumkan ketidakhadiran?', options: [o('malam', 'Malam sebelum'), o('pagi_awal', 'Pagi sebelum 7:30'), o('pagi_lewat', 'Selepas 7:30 atau dalam waktu persekolahan'), o('berbeza', 'Tidak tentu')] },
        { id: 'rel_agih_siapa', type: 'single', req: true, label: 'Siapa yang mengagih guru ganti?', options: [o('pk', 'Penolong Kanan'), o('penyelaras', 'Penyelaras relief'), o('kerani', 'Kerani'), o('guru_pilih', 'Guru yang tidak hadir pilih sendiri'), LAIN] },
        { id: 'rel_agih_cara', type: 'multi', req: true, label: 'Cara mengagih relief (boleh pilih lebih daripada satu)', options: [o('whatsapp', 'WhatsApp'), o('papan', 'Papan kenyataan / kertas'), o('excel', 'Excel / Google Sheet'), o('sistem', 'Sistem khas'), o('lisan', 'Lisan / interkom'), LAIN] },
        { id: 'rel_masa', type: 'single', req: true, label: 'Berapa lama sehari untuk menguruskan relief?', options: [o('r1', 'Kurang 5 minit'), o('r2', '5 hingga 15 minit'), o('r3', '16 hingga 30 minit'), o('r4', 'Lebih 30 minit'), o('r5', 'Tidak tentu')] },
        { id: 'rel_kriteria', type: 'multi', max: 3, req: true, label: 'Apa yang diambil kira bila memilih guru ganti? Pilih sehingga 3, yang pertama dipilih paling utama.', options: [o('subjek', 'Subjek sama'), o('kenal_kelas', 'Kenal kelas itu'), o('kurang_relief', 'Paling kurang relief'), o('kosong', 'Guru yang ada waktu kosong'), o('panitia', 'Panitia sama'), o('guru_kelas', 'Guru kelas'), o('giliran', 'Ikut giliran tetap'), LAIN] },
        { id: 'rel_peraturan', type: 'text', label: 'Peraturan relief khas di sekolah anda (had seminggu, guru dikecualikan, dan sebagainya)' },
        { id: 'rel_jenis', type: 'multi', label: 'Jenis ketidakhadiran yang paling kerap', options: [o('mc', 'MC'), o('kursus', 'Kursus / bengkel'), o('rasmi', 'Urusan rasmi'), o('rehat', 'Cuti rehat'), o('kecemasan', 'Cuti kecemasan'), LAIN] },
        { id: 'rel_lulus', type: 'multi', label: 'Jenis mana yang perlu kelulusan dahulu?', options: [o('mc', 'MC'), o('kursus', 'Kursus / bengkel'), o('rasmi', 'Urusan rasmi'), o('rehat', 'Cuti rehat'), o('kecemasan', 'Cuti kecemasan'), o('tiada', 'Tiada yang perlu kelulusan')] },
        { id: 'rel_tahu', type: 'multi', label: 'Bagaimana guru ganti tahu tugasnya?', options: [o('whatsapp', 'WhatsApp'), o('slip', 'Slip bertulis'), o('perhimpunan', 'Pengumuman'), o('papan', 'Papan kenyataan'), o('telefon', 'Panggilan telefon'), LAIN] },
        { id: 'rel_rekod', type: 'single', label: 'Adakah rekod relief digunakan untuk apa-apa?', options: [o('laporan', 'Ya, laporan dalaman'), o('audit', 'Ya, untuk PPD / JPN / audit'), o('tidak', 'Tidak'), o('tidak_pasti', 'Tidak pasti')] },
        { id: 'rel_guru_isi', type: 'single', req: true, label: 'Patutkah guru yang tidak hadir isi sendiri dalam sistem?', options: [o('perlu', 'Ya, guru isi sendiri'), o('pk_rekod', 'Tidak, PK atau penyelaras yang rekod'), o('bergantung', 'Bergantung jenis ketidakhadiran'), o('tidak_pasti', 'Tidak pasti')] }
      ] },
      { id: 'konteks', part: 1, title: 'Akaun dan keputusan di sekolah', intro: 'Untuk kami faham apa yang perlu dipenuhi sebelum sekolah boleh guna sistem ini.', questions: [
        { id: 'google_jenis', type: 'single', req: true, label: 'Akaun Google apa yang digunakan guru di sekolah?', options: [o('delima', 'DELIMa (akaun Google KPM)'), o('workspace', 'Google Workspace sekolah sendiri'), o('gmail', 'Gmail biasa'), o('tiada', 'Tiada akaun Google'), o('tidak_tahu', 'Tidak tahu')] },
        { id: 'google_sekat', type: 'single', req: true, label: 'Adakah app pihak ketiga disekat pada akaun itu?', options: [o('ya', 'Ya, disekat'), o('tidak', 'Tidak disekat'), o('tidak_tahu', 'Tidak tahu')] },
        { id: 'lulus', type: 'multi', label: 'Siapa yang perlu meluluskan sebelum sekolah guna sistem baharu?', options: [o('pengetua', 'Pengetua / Guru Besar'), o('ppd', 'PPD'), o('jpn', 'JPN'), o('jk_ict', 'JK ICT / pentadbir ICT sekolah'), o('tiada', 'Tiada kelulusan perlu'), o('tidak_tahu', 'Tidak tahu')] },
        { id: 'beli_siapa', type: 'single', req: true, label: 'Siapa yang membuat keputusan membeli sistem seperti ini?', options: [o('pengetua', 'Pengetua / Guru Besar'), o('pk', 'Penolong Kanan'), o('penyelaras', 'Penyelaras jadual'), o('jk_ict', 'JK ICT'), o('saya', 'Saya sendiri'), LAIN] },
        { id: 'beli_dana', type: 'single', label: 'Dari peruntukan mana biasanya dibayar?', options: [o('pibg', 'PIBG'), o('tabung', 'Tabung / akaun sekolah'), o('ppd', 'Peruntukan PPD / JPN'), o('peribadi', 'Belanja sendiri'), o('tidak_pasti', 'Tidak pasti')] }
      ] },
      { id: 'cuba', part: 2, title: 'Selepas cuba demo', intro: 'Jawab ikut apa yang anda alami semasa mencuba.', questions: [
        { id: 'tugas', type: 'matrix', req: true, label: 'Adakah anda dapat menyelesaikan tugas ini tanpa bantuan?',
          rows: [o('jana', 'Jana jadual'), o('rekod', 'Rekod guru tidak hadir'), o('agih', 'Agih relief'), o('slip', 'Cetak slip')],
          options: [o('sendiri', 'Berjaya sendiri'), o('bantuan', 'Berjaya, perlu bantuan atau lama'), o('gagal', 'Gagal'), o('tidak_cuba', 'Tidak cuba')] },
        { id: 'mudah', type: 'scale', req: true, min: 1, max: 5, low: 'Sangat sukar', high: 'Sangat mudah', label: 'Betapa mudah sistem ini digunakan?' },
        { id: 'keliru', type: 'text', req: true, label: 'Bahagian paling mengelirukan (tulis "tiada" jika tiada)' },
        { id: 'berguna', type: 'text', label: 'Bahagian paling berguna' },
        { id: 'hilang', type: 'text', req: true, label: 'Apa yang tiada tetapi anda perlukan sebelum boleh guna? (tulis "tiada" jika tiada)' },
        { id: 'tak_perlu', type: 'text', label: 'Apa yang anda rasa tidak diperlukan?' },
        { id: 'peranti', type: 'multi', label: 'Peranti yang anda gunakan untuk mencuba', options: [o('komputer', 'Komputer / laptop'), o('telefon', 'Telefon'), o('tablet', 'Tablet')] },
        { id: 'teknikal', type: 'single', label: 'Masalah teknikal yang dihadapi', options: [o('tiada', 'Tiada'), o('lambat', 'Lambat'), o('paparan', 'Paparan tidak kemas'), LAIN] }
      ] },
      { id: 'guru', part: 2, title: 'Guru dan telefon', intro: 'Pratonton paparan guru ada pada menu Peranan.', questions: [
        { id: 'guru_lihat', type: 'single', req: true, label: 'Guru patut nampak yang mana?', options: [o('penuh', 'Jadual penuh sekolah'), o('sendiri', 'Jadual sendiri sahaja'), o('pilih', 'Pentadbir yang tetapkan'), o('tidak_pasti', 'Tidak pasti')] },
        { id: 'notif', type: 'multi', req: true, label: 'Bagaimana guru patut dimaklumkan tugas relief? (boleh pilih lebih daripada satu)', options: [o('app', 'Notifikasi app di telefon'), o('whatsapp', 'WhatsApp'), o('emel', 'E-mel'), o('tidak', 'Tidak perlu')] },
        { id: 'guru_selesa', type: 'scale', min: 1, max: 5, low: 'Tidak selesa', high: 'Sangat selesa', label: 'Selesa jika guru lain boleh nampak jadual anda?' }
      ] },
      { id: 'data', part: 2, title: 'Data dan keselamatan', intro: 'Data sekolah disimpan dalam Google Sheet milik akaun Google sekolah, bukan pada pelayan kami.', questions: [
        { id: 'drive_selesa', type: 'scale', req: true, min: 1, max: 5, low: 'Tidak selesa', high: 'Sangat selesa', label: 'Selesa data disimpan dalam Google Drive sekolah sendiri?' },
        { id: 'drive_sebab', type: 'text', label: 'Kenapa?' },
        { id: 'privasi', type: 'text', label: 'Apa kebimbangan privasi atau keselamatan anda?' }
      ] },
      { id: 'beli', part: 2, title: 'Harga dan keputusan', intro: 'Jawapan jujur paling membantu.', questions: [
        { id: 'harga', type: 'numbers', req: true, unit: 'RM setahun', label: 'Bagi satu sekolah, berapa harga setahun yang anda rasa:',
          fields: [o('terlalu_murah', 'Terlalu murah sampai ragu kualiti'), o('murah', 'Murah dan berpatutan'), o('mahal_ok', 'Mahal, tetapi masih sanggup'), o('terlalu_mahal', 'Terlalu mahal, tidak akan beli')] },
        { id: 'bayar', type: 'single', label: 'Lebih suka bayar bagaimana?', options: [o('bulanan', 'Bulanan'), o('tahunan', 'Tahunan'), o('kedua', 'Dua-dua boleh')] },
        { id: 'syarat', type: 'multi', label: 'Apa yang diperlukan sebelum sekolah beli?', options: [o('data_sendiri', 'Cuba dengan data sendiri'), o('rujukan', 'Rujukan sekolah lain'), o('kontrak', 'Kontrak / perjanjian bertulis'), o('latihan', 'Latihan atau sesi pengenalan'), o('sokongan', 'Sokongan WhatsApp'), o('invois', 'Invois / pesanan belian rasmi')] },
        { id: 'nps', type: 'scale', req: true, min: 0, max: 10, low: 'Tidak sama sekali', high: 'Pasti', label: 'Sejauh mana anda akan mencadangkan sistem ini kepada guru lain?' },
        { id: 'mula', type: 'single', req: true, label: 'Bila sekolah anda boleh mula guna?', options: [o('sekarang', 'Sekarang'), o('sebelum_sesi', 'Sebelum sesi persekolahan baharu'), o('tahun_depan', 'Tahun depan'), o('tidak_pasti', 'Tidak pasti')] }
      ] }
    ]
  };

  // ---------- pembantu ----------
  const allQ = () => TT.SURVEY.sections.flatMap((s) => s.questions.map((q) => Object.assign({ part: s.part, section: s.id }, q)));
  TT.surveySections = (part) => TT.SURVEY.sections.filter((s) => s.part === part);
  TT.surveyQuestion = (id) => allQ().find((q) => q.id === id);

  // soalan dipaparkan hanya jika syarat showIf dipenuhi
  TT.surveyVisible = (q, answers) => {
    if (!q.showIf) return true;
    const a = answers[q.showIf.id];
    const list = Array.isArray(a) ? a : a == null ? [] : [a];
    return list.some((x) => q.showIf.anyOf.includes(x));
  };

  const isNum = (x) => x !== '' && x != null && Number.isFinite(Number(x));
  const MAX_TEXT = 1500, MAX_OTHER = 300, MAX_RM = 1000000;
  TT.SURVEY_LIMITS = { text: MAX_TEXT, other: MAX_OTHER, rm: MAX_RM };

  // semakan jawapan satu bahagian. Pulangkan { errors: {id: mesej}, first: id pertama yang salah }
  TT.surveyValidate = (part, answers) => {
    const errors = {};
    for (const s of TT.surveySections(part)) for (const q of s.questions) {
      if (!TT.surveyVisible(q, answers)) continue;
      const a = answers[q.id];
      const need = 'Sila jawab soalan ini.';
      if (q.type === 'single' || q.type === 'multi') {
        const vals = q.type === 'multi' ? (a || []) : (a ? [a] : []);
        if (q.req && !vals.length) { errors[q.id] = need; continue; }
        if (q.type === 'multi' && q.max && vals.length > q.max) { errors[q.id] = `Pilih sehingga ${q.max} sahaja.`; continue; }
        const other = (q.options || []).find((x) => x.other && vals.includes(x.v));
        if (other && String(answers[q.id + '_lain'] || '').trim().length < 2) errors[q.id] = 'Sila nyatakan pilihan lain-lain.';
      } else if (q.type === 'scale') {
        if (a == null || a === '') { if (q.req) errors[q.id] = need; } else if (!(Number.isInteger(+a) && +a >= q.min && +a <= q.max)) errors[q.id] = 'Nilai tidak sah.';
      } else if (q.type === 'text') {
        const t = String(a || '').trim();
        if (q.req && t.length < 2) errors[q.id] = 'Sila isi. Tulis "tiada" jika tiada.';
      } else if (q.type === 'matrix') {
        const m = a || {};
        if (q.req && q.rows.some((r) => !m[r.v])) errors[q.id] = 'Sila pilih satu jawapan bagi setiap baris.';
      } else if (q.type === 'numbers') {
        const m = a || {}, vs = q.fields.map((f) => m[f.v]);
        const any = vs.some((v) => v !== '' && v != null);
        if (q.req || any) {
          if (vs.some((v) => !isNum(v) || +v < 0 || +v > MAX_RM)) errors[q.id] = 'Isi semua jumlah dalam RM (0 hingga 1,000,000).';
          else if (vs.some((v, i) => i > 0 && +v < +vs[i - 1])) errors[q.id] = 'Jumlah mesti meningkat: terlalu murah, murah, mahal tetapi sanggup, terlalu mahal.';
        }
      }
    }
    return { errors, first: Object.keys(errors)[0] || null };
  };

  // ratakan jawapan kepada { lajur: nilai } untuk dihantar ke Google Sheet
  TT.surveyAnswers = (part, answers) => {
    const out = {};
    for (const s of TT.surveySections(part)) for (const q of s.questions) {
      if (!TT.surveyVisible(q, answers)) continue;
      const a = answers[q.id];
      if (q.type === 'single' && a) out[q.id] = a;
      else if (q.type === 'multi' && a && a.length) out[q.id] = a.slice();
      else if (q.type === 'scale' && a !== undefined && a !== '' && a !== null) out[q.id] = Number(a);
      else if (q.type === 'text' && String(a || '').trim()) out[q.id] = String(a).trim().slice(0, MAX_TEXT);
      else if (q.type === 'matrix') q.rows.forEach((r) => { if (a && a[r.v]) out[`${q.id}_${r.v}`] = a[r.v]; });
      else if (q.type === 'numbers') q.fields.forEach((f) => { if (a && isNum(a[f.v])) out[`${q.id}_${f.v}`] = Number(a[f.v]); });
      if (q.options && q.options.some((x) => x.other)) {
        const vals = q.type === 'multi' ? (a || []) : (a ? [a] : []);
        if (q.options.some((x) => x.other && vals.includes(x.v)) && String(answers[q.id + '_lain'] || '').trim()) out[q.id + '_lain'] = String(answers[q.id + '_lain']).trim().slice(0, MAX_OTHER);
      }
    }
    return out;
  };

  TT.surveyPayload = (part, answers, meta) => Object.assign({
    v: TT.SURVEY.version, part, id: '', key: '', hp: '', ua: '', dur: 0
  }, meta || {}, { answers: TT.surveyAnswers(part, answers) });

  // skema lajur Sheet (digunakan untuk menjana appscript/Code.gs)
  TT.surveySchema = () => {
    const columns = [];
    for (const q of allQ()) {
      const base = { qid: q.id, part: q.part };
      if (q.type === 'single' || q.type === 'multi') {
        columns.push(Object.assign({ key: q.id, label: q.label, kind: q.type, options: q.options.map((x) => ({ v: x.v, t: x.t })) }, base, q.max ? { max: q.max } : {}));
        if (q.options.some((x) => x.other)) columns.push(Object.assign({ key: q.id + '_lain', label: q.label + ' (lain-lain)', kind: 'other' }, base));
      } else if (q.type === 'scale') columns.push(Object.assign({ key: q.id, label: q.label, kind: 'scale', min: q.min, max: q.max }, base));
      else if (q.type === 'text') columns.push(Object.assign({ key: q.id, label: q.label, kind: 'text' }, base));
      else if (q.type === 'matrix') q.rows.forEach((r) => columns.push(Object.assign({ key: `${q.id}_${r.v}`, label: `${q.label} ${r.t}`, kind: 'single', options: q.options.map((x) => ({ v: x.v, t: x.t })) }, base)));
      else if (q.type === 'numbers') q.fields.forEach((f) => columns.push(Object.assign({ key: `${q.id}_${f.v}`, label: `${q.label} ${f.t}`, kind: 'number' }, base)));
    }
    return { version: TT.SURVEY.version, limits: TT.SURVEY_LIMITS, columns };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
