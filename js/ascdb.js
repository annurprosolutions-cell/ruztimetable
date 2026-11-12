(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Import "pangkalan data" aSc Timetables (eksport Excel dengan tab Pelajaran, Guru, Kelas, Subjek, Bilik).
  // Tab Pelajaran: satu baris = satu kad aSc: Guru, Kelas, Kumpulan, Subjek, Panjang (Single/Double/Triple), Bil. seminggu.
  //  - beberapa guru atau kelas dalam satu sel dipisah koma (guru berkongsi, kelas gabungan)
  //  - Kumpulan sejajar dengan senarai kelas (cth "Boys,Boys"); kumpulan berlainan bagi kelas yang sama (lelaki/perempuan,
  //    Islam/bukan Islam, elektif) berjalan serentak, jadi digabung menjadi satu pelajaran dengan beberapa guru (cth PI/PM)
  //  - baris "Tanpa guru" (rehat, perhimpunan) dan "Tanpa kelas" (tugas) bukan pelajaran, dilaporkan dan dilangkau
  // Hasil sama bentuk dengan TT.parseTemplate supaya pratonton dan TT.applyImport digunakan semula.

  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const low = (v) => txt(v).toLowerCase();
  const key = (v) => low(v).replace(/\s+/g, '');
  const list = (v) => String(v == null ? '' : v).split(',').map(txt).filter(Boolean);

  const H = {
    teacher: /^(guru|teacher|teachers)$/, cls: /^(kelas|class|classes)$/, group: /^(kumpulan|group|groups)$/,
    subject: /^(subjek|subject|mata ?pelajaran)$/, length: /^(panjang|length|duration|tempoh)$/,
    count: /^(bil\.? ?pelajaran ?\/ ?minggu|bil\.?|lessons? ?\/ ?week|count|bilangan)$/, room: /^(bilik tersedia|classrooms?|bilik)$/,
    name: /^(nama|name)$/, short: /^(singkatan|short|kod|code)$/, homeroom: /^(guru kelas|class teacher|form teacher)$/,
    off: /^(masa off|time off)$/
  };
  const col = (row, re) => row.findIndex((c) => re.test(low(c)));
  const WHOLE = /^(seluruh kelas|entire class|whole class)$/i;
  const NO_TEACHER = /^(tanpa guru|no teacher|without teacher)$/i;
  const NO_CLASS = /^(tanpa kelas|no class|without class)$/i;

  // cari tab dan baris tajuk yang mengandungi semua lajur wajib
  function locate(sheets, nameRe, need, avoid) {
    const cands = (sheets || []).filter((sh) => !avoid || !avoid.test(low(sh.name)));
    cands.sort((a, b) => (nameRe.test(low(b.name)) ? 1 : 0) - (nameRe.test(low(a.name)) ? 1 : 0));
    for (const sh of cands) {
      const rows = (sh.rows || []).map((r) => (r || []).map((c) => (c == null ? '' : c)));
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const cols = {};
        for (const [k, re] of Object.entries(need)) cols[k] = col(rows[i], re);
        if (Object.values(cols).every((c) => c >= 0)) return { sh, rows, head: i, cols };
      }
    }
    return null;
  }
  const lengthOf = (v) => {
    const s = low(v);
    if (/^(single|tunggal|1)$/.test(s)) return 1;
    if (/^(double|berganda|2)$/.test(s)) return 2;
    if (/^(triple|3)$/.test(s)) return 3;
    const n = parseInt(s, 10); return n >= 1 && n <= 4 ? n : 0;
  };

  TT.isAscDb = (sheets) => !!locate(sheets, /^pelajaran$|^lessons?$/, { teacher: H.teacher, cls: H.cls, group: H.group, subject: H.subject, length: H.length }, /kontrak|contract/);

  TT.parseAscDb = (sheets) => {
    const out = { isTemplate: true, isAsc: true, classes: [], subjects: [], teachers: [], rooms: [], lessons: [], errors: [], warnings: [], skipped: [], info: {} };
    const les = locate(sheets, /^pelajaran$|^lessons?$/, { teacher: H.teacher, cls: H.cls, group: H.group, subject: H.subject, length: H.length }, /kontrak|contract/);
    if (!les) { out.isTemplate = false; out.isAsc = false; return out; }
    const warn = (sheet, row, msg) => out.warnings.push({ sheet, row, msg });
    const err = (sheet, row, msg) => out.errors.push({ sheet, row, msg });
    const used = new Set([les.sh.name]);

    // ---- Kelas ----
    const kl = locate(sheets, /^kelas$|^class(es)?$/, { name: /^(kelas|class|nama|name)$/ }, /kontrak|contract|pelajaran|lessons?/);
    const classCode = new Map();
    if (kl) {
      used.add(kl.sh.name);
      const sc = col(kl.rows[kl.head], H.short);
      kl.rows.slice(kl.head + 1).forEach((r) => {
        const name = txt(r[kl.cols.name]); if (!name || out.classes.some((c) => key(c.name) === key(name))) return;
        const m = /^(?:tingkatan|ting\.?|tahun|thn|t|year|form)?\s*(\d{1,2})\b/i.exec(name);
        out.classes.push({ name, level: m ? m[1] : '', homeroom: '' });
        if (sc >= 0 && txt(r[sc])) classCode.set(key(r[sc]), name);
      });
    }
    const clsName = (v) => { const k = key(v); const c = out.classes.find((x) => key(x.name) === k); return c ? c.name : classCode.get(k) || null; };

    // ---- Subjek ----
    const sj = locate(sheets, /^subjek$|^subjects?$/, { name: /^(subjek|subject|nama|name)$/ }, /kontrak|contract|pelajaran|lessons?/);
    const subjAll = [];
    if (sj) {
      used.add(sj.sh.name);
      const sc = col(sj.rows[sj.head], H.short);
      sj.rows.slice(sj.head + 1).forEach((r) => {
        const name = txt(r[sj.cols.name]); if (!name || subjAll.some((x) => key(x.name) === key(name))) return;
        subjAll.push({ name, code: sc >= 0 ? txt(r[sc]) : '' });
      });
    }
    const subjOf = (v) => {
      const k = key(v);
      return subjAll.find((x) => key(x.name) === k) || subjAll.find((x) => x.code && key(x.code) === k) || null;
    };

    // ---- Guru ----
    const gr = locate(sheets, /^guru$|^teachers?$/, { name: /^(nama|name|guru|teacher)$/ }, /kontrak|contract|pelajaran|lessons?/);
    let withOff = 0;
    if (gr) {
      used.add(gr.sh.name);
      const hr = gr.rows[gr.head], sc = col(hr, H.short), hc = col(hr, H.homeroom), oc = col(hr, H.off);
      gr.rows.slice(gr.head + 1).forEach((r, i) => {
        const name = txt(r[gr.cols.name]); if (!name || out.teachers.some((t) => key(t.name) === key(name))) return;
        out.teachers.push({ name, code: sc >= 0 ? txt(r[sc]) : '' });
        if (oc >= 0 && txt(r[oc])) withOff++;
        const hcv = hc >= 0 ? txt(r[hc]) : '';
        if (hcv) {
          const c = clsName(hcv), cl = c && out.classes.find((x) => x.name === c);
          if (cl && !cl.homeroom) cl.homeroom = name; else if (!c) warn(gr.sh.name, gr.head + i + 2, `Guru kelas "${hcv}" bagi ${name} tiada dalam senarai Kelas, diabaikan`);
        }
      });
    }
    const teacherName = (v) => { const k = key(v); const t = out.teachers.find((x) => key(x.name) === k) || out.teachers.find((x) => x.code && key(x.code) === k); return t ? t.name : null; };

    // ---- Bilik ----
    const bl = locate(sheets, /^bilik$|^rooms?$|^classrooms?$/, { name: H.name }, /kontrak|contract|pelajaran|lessons?/);
    if (bl) {
      used.add(bl.sh.name);
      bl.rows.slice(bl.head + 1).forEach((r) => { const name = txt(r[bl.cols.name]); if (name && !out.rooms.some((x) => key(x.name) === key(name))) out.rooms.push({ name, type: '' }); });
    }

    // ---- Pelajaran: kumpul baris yang sama (cth Double x2 + Single x1) ----
    const lr = les.rows[les.head], cCount = col(lr, H.count), cRoom = col(lr, H.room);
    const agg = new Map(), noTeacher = new Map(), noClass = new Map();
    let triples = 0;
    const addSubj = (s) => { if (!out.subjects.some((x) => key(x.name) === key(s.name))) out.subjects.push({ name: s.name, code: s.code }); };
    les.rows.slice(les.head + 1).forEach((r, i) => {
      const row = les.head + i + 2, L = les.sh.name;
      const tRaw = list(r[les.cols.teacher]), cRaw = list(r[les.cols.cls]), sRaw = txt(r[les.cols.subject]);
      if (!tRaw.length && !cRaw.length && !sRaw) return;
      if (tRaw.length && tRaw.every((x) => NO_TEACHER.test(x))) { noTeacher.set(sRaw, (noTeacher.get(sRaw) || 0) + 1); return; }
      if (cRaw.length && cRaw.every((x) => NO_CLASS.test(x))) { noClass.set(sRaw, (noClass.get(sRaw) || 0) + 1); return; }
      const bad = [];
      if (!sRaw) bad.push('Subjek kosong');
      const len = lengthOf(r[les.cols.length]); if (!len) bad.push(`Panjang "${txt(r[les.cols.length])}" tidak dikenali`);
      const cnt = cCount >= 0 ? parseInt(txt(r[cCount]), 10) : 1;
      if (!(cnt >= 1 && cnt <= 20)) bad.push(`Bilangan seminggu "${txt(cCount >= 0 ? r[cCount] : '')}" tidak sah`);
      const classes = [];
      cRaw.filter((x) => !NO_CLASS.test(x)).forEach((x) => {
        let n = clsName(x);
        if (!n) { n = x; out.classes.push({ name: x, level: (/^(\d{1,2})\b/.exec(x) || [])[1] || '', homeroom: '' }); warn(L, row, `Kelas "${x}" tiada dalam tab Kelas, ditambah`); }
        if (!classes.includes(n)) classes.push(n);
      });
      if (!classes.length) bad.push('Kelas kosong');
      const teachers = [];
      tRaw.filter((x) => !NO_TEACHER.test(x)).forEach((x) => {
        let n = teacherName(x);
        if (!n) { n = x; out.teachers.push({ name: x, code: '' }); warn(L, row, `Guru "${x}" tiada dalam tab Guru, ditambah`); }
        if (!teachers.includes(n)) teachers.push(n);
      });
      if (bad.length) { bad.forEach((m) => err(L, row, m)); return; }
      const subj = subjOf(sRaw) || { name: sRaw, code: sRaw };
      const groups = [...new Set(list(r[les.cols.group]).filter((g) => !WHOLE.test(g)).map((g) => g.toUpperCase()))].sort();
      const room = cRoom >= 0 ? txt(r[cRoom]) : '';
      const k = [[...classes].map(key).sort().join('|'), groups.join('|'), key(subj.name), [...teachers].map(key).sort().join('|')].join('#');
      const x = agg.get(k) || { classes, teachers, subject: subj, groups, perWeek: 0, doubles: 0, room: '', row };
      if (len === 1) x.perWeek += cnt;
      else if (len === 2) { x.perWeek += 2 * cnt; x.doubles += cnt; }
      else { x.perWeek += len * cnt; x.doubles += cnt * Math.floor(len / 2); triples += cnt; }
      if (room && out.rooms.some((y) => key(y.name) === key(room))) x.room = out.rooms.find((y) => key(y.name) === key(room)).name;
      agg.set(k, x);
    });

    // ---- gabung kumpulan yang berjalan serentak ----
    let lessons = [...agg.values()];
    const whole = lessons.filter((l) => !l.groups.length), grp = lessons.filter((l) => l.groups.length);
    const same = (a, b) => a.perWeek === b.perWeek && a.doubles === b.doubles;
    const disjoint = (a, b) => !a.some((x) => b.includes(x));
    const overlap = (a, b) => a.some((x) => b.includes(x));
    const merged = [];
    // A: subjek sama, kelas sama, kumpulan berlainan (cth PJK lelaki + perempuan)
    const left = grp.slice();
    for (let i = 0; i < left.length; i++) {
      const a = left[i]; if (!a) continue;
      const comp = [a];
      for (let j = i + 1; j < left.length; j++) {
        const b = left[j];
        if (b && key(b.subject.name) === key(a.subject.name) && same(a, b) && [...a.classes].sort().join() === [...b.classes].sort().join() &&
            comp.every((c) => disjoint(c.groups, b.groups) && disjoint(c.teachers, b.teachers))) { comp.push(b); left[j] = null; }
      }
      left[i] = comp.length > 1 ? { comp } : a;
    }
    let units = left.filter(Boolean).map((u) => (u.comp ? u.comp : [u]));
    // B: kelas bertindih, subjek berlainan (cth PI setiap kelas + PM gabungan, elektif PA/SK)
    const parent = units.map((_, i) => i), find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const flat = (u) => ({ classes: [...new Set(u.flatMap((x) => x.classes))], teachers: [...new Set(u.flatMap((x) => x.teachers))], groups: [...new Set(u.flatMap((x) => x.groups))], perWeek: u[0].perWeek, doubles: u[0].doubles, subj: new Set(u.map((x) => key(x.subject.name))) });
    const F = units.map(flat);
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = F[i], b = F[j];
      if (same(a, b) && overlap(a.classes, b.classes) && disjoint(a.teachers, b.teachers) && disjoint([...a.subj], [...b.subj])) parent[find(j)] = find(i);
    }
    const comps = new Map();
    units.forEach((u, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(...u); });
    let mergedFrom = 0;
    for (const comp of comps.values()) {
      // seorang guru tidak boleh berada dalam dua kumpulan serentak: jangan gabung komponen sebegini
      const seen = new Map(); let clash = false;
      comp.forEach((m) => m.teachers.forEach((t) => { if (seen.has(t) && seen.get(t) !== m) clash = true; seen.set(t, m); }));
      if (comp.length === 1 || clash) {
        if (clash) warn(les.sh.name, comp[0].row, `Kumpulan ${comp.map((m) => m.subject.name + ' ' + m.classes.join('+')).join(', ')} tidak digabung kerana guru yang sama ada dalam dua kumpulan; semak di Data > Pelajaran`);
        comp.forEach((m) => merged.push(m));
        continue;
      }
      const names = [];
      const freq = new Map(); comp.forEach((m) => freq.set(m.subject.name, (freq.get(m.subject.name) || 0) + 1));
      [...freq.entries()].sort((a, b) => b[1] - a[1]).forEach(([n]) => { if (!names.includes(n)) names.push(n); });
      const subject = names.length === 1 ? comp[0].subject
        : { name: names.map((n) => (comp.find((m) => m.subject.name === n).subject.code || n)).join('/'), code: names.map((n) => (comp.find((m) => m.subject.name === n).subject.code || n)).join('/') };
      merged.push({ classes: [...new Set(comp.flatMap((m) => m.classes))], teachers: [...new Set(comp.flatMap((m) => m.teachers))], subject, groups: [], perWeek: comp[0].perWeek, doubles: comp[0].doubles, room: '', row: comp[0].row });
      mergedFrom += comp.length;
    }
    lessons = whole.concat(merged);
    lessons.forEach((l) => addSubj(l.subject));
    out.lessons = lessons.map((l) => ({ classes: l.classes, subject: l.subject.name, teachers: l.teachers, perWeek: l.perWeek, doubles: l.doubles, room: l.room || '', row: l.row }));
    out.subjects.sort((a, b) => a.name.localeCompare(b.name));

    // had guru: aSc tidak menyimpan had harian, jadi had diambil daripada beban sebenar (seminggu / 5 hari + 2, minimum 7,
    // maksimum 14) supaya guru berbeban tinggi tidak terus ditolak oleh semakan kapasiti. Had seminggu sekurang-kurangnya beban.
    const loadOf = new Map();
    out.lessons.forEach((l) => l.teachers.forEach((t) => loadOf.set(t, (loadOf.get(t) || 0) + l.perWeek)));
    let raised = 0, topDay = 7;
    out.teachers.forEach((t) => {
      const w = loadOf.get(t.name) || 0;
      t.maxPerDay = Math.min(14, Math.max(7, Math.ceil(w / 5) + 2));
      t.maxPerWeek = Math.max(36, w);
      if (t.maxPerDay > 7) { raised++; topDay = Math.max(topDay, t.maxPerDay); }
    });

    // ---- laporan ----
    const S = les.sh.name, fmt = (m) => [...m.entries()].map(([k, n]) => `${k || '(tiada nama)'}${n > 1 ? ` x${n}` : ''}`).join(', ');
    if (noTeacher.size) warn(S, 0, `Baris tanpa guru tidak diimport (${[...noTeacher.values()].reduce((a, b) => a + b, 0)}): ${fmt(noTeacher)}. Rehat ditetapkan di Tetapan > Waktu & rehat; perhimpunan dan aktiviti sekolah di Tetapan > Sekatan serentak.`);
    if (noClass.size) warn(S, 0, `Tugas tanpa kelas tidak diimport (${[...noClass.values()].reduce((a, b) => a + b, 0)}): ${fmt(noClass)}.`);
    if (triples) warn(S, 0, `${triples} kad 3 waktu (Triple) diimport sebagai 1 waktu berganda + 1 waktu tunggal.`);
    if (mergedFrom) warn(S, 0, `${mergedFrom} pelajaran kumpulan (cth lelaki/perempuan, PI/PM, elektif) digabung menjadi pelajaran serentak dengan beberapa guru.`);
    if (raised) warn(gr ? gr.sh.name : 'Guru', 0, `${raised} guru diberi had mengajar sehari lebih daripada 7 (hingga ${topDay}) ikut beban seminggu dalam aSc. Ubah di Data > Guru jika perlu.`);
    if (withOff) warn(gr ? gr.sh.name : 'Guru', 0, `${withOff} guru ada "Masa Off" dalam aSc. Tidak diimport kerana nombor waktu aSc mungkin berbeza dengan susunan waktu sekolah dalam app; isi waktu tidak boleh di profil guru.`);
    out.skipped = (sheets || []).map((x) => x.name).filter((n) => !used.has(n));
    out.info = { raised, rows: les.rows.length - les.head - 1, noTeacher: [...noTeacher.values()].reduce((a, b) => a + b, 0), noClass: [...noClass.values()].reduce((a, b) => a + b, 0), triples, mergedFrom, withOff };
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
