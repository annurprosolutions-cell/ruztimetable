// Modul dibungkus sebagai factory supaya sumbernya boleh dihantar ke Web Worker (lihat runner.js)
(function (factory) {
  const root = typeof window !== 'undefined' ? window : globalThis;
  factory(root);
  (root.TT.__mods || (root.TT.__mods = {})).core = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TT;
})(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  TT.DAY_SETS = {
    'mon-fri': [
      { name: 'Isnin', short: 'Isn', dow: 1 }, { name: 'Selasa', short: 'Sel', dow: 2 },
      { name: 'Rabu', short: 'Rab', dow: 3 }, { name: 'Khamis', short: 'Kha', dow: 4 },
      { name: 'Jumaat', short: 'Jum', dow: 5 }
    ],
    'sun-thu': [
      { name: 'Ahad', short: 'Aha', dow: 0 }, { name: 'Isnin', short: 'Isn', dow: 1 },
      { name: 'Selasa', short: 'Sel', dow: 2 }, { name: 'Rabu', short: 'Rab', dow: 3 },
      { name: 'Khamis', short: 'Kha', dow: 4 }
    ]
  };
  TT.days = (s) => TT.DAY_SETS[s.school.weekMode] || TT.DAY_SETS['mon-fri'];

  TT.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let seq = 0;
  TT.uid = (p) => p + Date.now().toString(36).slice(-4) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

  TT.defaultPeriods = () => [
    { label: '1', start: '07:30', end: '08:10', type: 'lesson' },
    { label: '2', start: '08:10', end: '08:50', type: 'lesson' },
    { label: '3', start: '08:50', end: '09:30', type: 'lesson' },
    { label: '4', start: '09:30', end: '10:10', type: 'lesson' },
    { label: 'Rehat', start: '10:10', end: '10:40', type: 'break' },
    { label: '5', start: '10:40', end: '11:20', type: 'lesson' },
    { label: '6', start: '11:20', end: '12:00', type: 'lesson' },
    { label: '7', start: '12:00', end: '12:40', type: 'lesson' },
    { label: '8', start: '12:40', end: '13:20', type: 'lesson' }
  ];

  // peraturan relief: had sehari / seminggu (waktu, 0 = tiada had), kecualikan guru yang sudah mengajar
  // banyak hari itu, wajib ada waktu kosong sebelum atau selepas, dan jawatan yang dikecualikan
  TT.defaultRelief = () => ({
    maxPerDay: 3, maxPerWeek: 0, maxTeachDay: 0, needGap: false, excludeRoles: '', respectUnavailable: true,
    wSubject: 30, wDept: 10, wKnows: 15, wHome: 10, wCont: 20,
    wFair: 8, wTotal: 0.5, wToday: 12, wLoad: 0.5
  });

  TT.newState = () => ({
    version: 1,
    // multiTime: kelas boleh guna set waktu berlainan (cth Tahap 1 dan Tahap 2 sekolah rendah)
    school: { name: 'Sekolah Saya', weekMode: 'mon-fri', logo: '', color: '', guruSheet: '', multiTime: false, mainSetName: 'Set utama' },
    auth: null, // { admin: 'pbkdf2-sha256$...' } hash kata laluan pentadbir
    periods: TT.defaultPeriods(),
    dayLimits: [8, 8, 8, 8, 6],
    timeSets: [], // set tambahan: { id, name, periods, dayLimits }. Set utama = periods/dayLimits di atas
    blocks: [], // sekatan serentak: { id, name, days: [hari], from, to (waktu set utama), teacherIds: [] = semua guru, dept }
    archives: [], // sejarah yang telah diarkib: { title, url, before, count, at }
    subjects: [], teachers: [], classes: [], rooms: [], lessons: [],
    placements: [], absences: [], reliefs: [],
    settings: { relief: TT.defaultRelief() }
  });

  // isi medan yang tiada supaya fail JSON lama / import separuh siap tidak merosakkan app
  TT.migrate = (s) => {
    const base = TT.newState();
    for (const k of Object.keys(base)) if (s[k] == null) s[k] = base[k];
    s.school = Object.assign(base.school, s.school);
    s.settings = s.settings || {};
    s.settings.relief = Object.assign(TT.defaultRelief(), s.settings.relief);
    s.teachers.forEach((t) => {
      t.subjectIds = t.subjectIds || []; t.unavailable = t.unavailable || {};
      if (t.maxPerDay == null) t.maxPerDay = 7;
      if (t.maxPerWeek == null) t.maxPerWeek = 36;
      t.role = t.role || '';
    });
    s.lessons.forEach((l) => { l.classIds = l.classIds || []; l.teacherIds = l.teacherIds || []; l.doubles = l.doubles || 0; });
    s.timeSets = (s.timeSets || []).filter((x) => x && x.id).map((x) => ({ id: x.id, name: x.name || 'Set', periods: Array.isArray(x.periods) ? x.periods : TT.defaultPeriods(), dayLimits: Array.isArray(x.dayLimits) ? x.dayLimits : [] }));
    const sets = new Set(s.timeSets.map((x) => x.id));
    s.classes.forEach((c) => { c.timeSet = c.timeSet && sets.has(c.timeSet) ? c.timeSet : ''; });
    s.reliefs.forEach((r) => { if (r.mergeClassId === undefined) r.mergeClassId = null; });
    s.archives = (s.archives || []).filter((x) => x && x.before);
    s.blocks = (s.blocks || []).filter((b) => b && b.id).map((b) => ({ id: b.id, name: b.name || 'Sekatan', days: (b.days || []).map(Number).filter((d) => d >= 0), from: b.from | 0, to: b.to == null ? b.from | 0 : b.to | 0, teacherIds: b.teacherIds || [], dept: b.dept || '' }));
    return s;
  };

  // ---------- set waktu ----------
  // Set 0 = set utama (s.periods, s.dayLimits). Set 1.. = s.timeSets, hanya aktif bila school.multiTime.
  TT.multiTime = (s) => !!(s.school && s.school.multiTime && s.timeSets && s.timeSets.length);
  TT.timeSetList = (s) => [{ id: '', name: (s.school && s.school.mainSetName) || 'Set utama', periods: s.periods, dayLimits: s.dayLimits }]
    .concat(TT.multiTime(s) ? s.timeSets : []);
  TT.classSetIdx = (s, c) => {
    if (!c || !c.timeSet || !TT.multiTime(s)) return 0;
    const i = s.timeSets.findIndex((x) => x.id === c.timeSet);
    return i < 0 ? 0 : i + 1;
  };
  // set bagi satu pelajaran = set kelas pertama (pelajaran gabungan mesti dalam set yang sama, lihat precheck)
  TT.lessonSetIdx = (s, l, clsMap) => {
    if (!l || !TT.multiTime(s)) return 0;
    const c = clsMap ? clsMap.get(l.classIds[0]) : s.classes.find((x) => x.id === l.classIds[0]);
    return TT.classSetIdx(s, c);
  };
  TT.setOfClasses = (s, classIds) => TT.lessonSetIdx(s, { classIds: classIds || [] });

  const periodsOf = (s, k) => (k ? ((s.timeSets[k - 1] || {}).periods || []) : s.periods);
  TT.slots = (s, k) => {
    const out = []; let brk = false;
    for (const p of periodsOf(s, k | 0)) {
      if (p.type === 'break') { brk = true; continue; }
      out.push({ index: out.length, label: p.label, start: p.start, end: p.end, breakBefore: brk && out.length > 0 });
      brk = false;
    }
    return out;
  };

  TT.dayLimits = (s, k) => {
    k = k | 0;
    const n = TT.slots(s, k).length, lim = k ? (s.timeSets[k - 1] || {}).dayLimits : s.dayLimits;
    return TT.days(s).map((_, i) => {
      const v = lim && lim[i];
      return Math.max(0, Math.min(n, v == null ? n : v));
    });
  };

  const toMin = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : NaN; };
  TT.toMin = toMin;

  /**
   * Model masa untuk semakan bertindih guru dan bilik. Satu set: atom = waktu (sama seperti asal).
   * Beberapa set: masa dipecah kepada atom pada setiap sempadan waktu mana-mana set, supaya guru yang
   * mengajar Tahap 1 (10:15-10:45) dan Tahap 2 (10:30-11:00) dikesan bertindih ikut masa sebenar.
   * span[k][p] = [a0, a1) atom yang diliputi waktu p dalam set k.
   */
  TT.timeModel = (s) => {
    const D = TT.days(s).length;
    const sets = TT.timeSetList(s).map((x, k) => ({ id: x.id, name: x.name, slots: TT.slots(s, k), limit: TT.dayLimits(s, k) }));
    const classSet = new Map(s.classes.map((c) => [c.id, TT.classSetIdx(s, c)]));
    if (sets.length === 1) {
      const sl = sets[0].slots, P = sl.length;
      return {
        multi: false, D, sets, classSet, A: P, bad: [],
        span: [sl.map((_, p) => [p, p + 1])], aw: new Array(P).fill(1), abrk: sl.map((x) => x.breakBefore),
        aLim: sets[0].limit.slice(), atoms: sl.map((x) => ({ start: x.start, end: x.end }))
      };
    }
    const bad = [], pts = new Set();
    sets.forEach((st) => st.slots.forEach((sl) => {
      const a = toMin(sl.start), b = toMin(sl.end);
      if (!(a < b)) bad.push(`${st.name}: waktu ${sl.label} masa tidak sah (${sl.start || '?'}-${sl.end || '?'})`);
      else { pts.add(a); pts.add(b); }
    }));
    const b = [...pts].sort((x, y) => x - y), atoms = [];
    for (let i = 0; i + 1 < b.length; i++) {
      const a0 = b[i], a1 = b[i + 1];
      if (sets.some((st) => st.slots.some((sl) => toMin(sl.start) <= a0 && toMin(sl.end) >= a1))) atoms.push({ s: a0, e: a1 });
    }
    const A = Math.max(1, atoms.length);
    const span = sets.map((st) => st.slots.map((sl) => {
      const a = toMin(sl.start), e = toMin(sl.end);
      if (!(a < e)) return [0, A]; // masa rosak: anggap bertindih dengan semua, lebih selamat daripada terlepas konflik
      let a0 = atoms.findIndex((x) => x.s >= a), a1 = a0;
      while (a1 < atoms.length && atoms[a1].e <= e) a1++;
      return a0 < 0 ? [0, A] : [a0, Math.max(a0 + 1, a1)];
    }));
    const durs = sets.flatMap((st) => st.slots.map((sl) => toMin(sl.end) - toMin(sl.start)).filter((x) => x > 0)).sort((x, y) => x - y);
    const unit = durs.length ? durs[durs.length >> 1] : 30;
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const aLim = new Array(D).fill(0);
    sets.forEach((st, k) => st.limit.forEach((n, d) => { if (n > 0) aLim[d] = Math.max(aLim[d], span[k][n - 1][1]); }));
    return {
      multi: true, D, sets, classSet, A, bad, span, aLim,
      aw: atoms.map((x) => (x.e - x.s) / unit), abrk: atoms.map((x, i) => i > 0 && x.s > atoms[i - 1].e),
      atoms: atoms.map((x) => ({ start: fmt(x.s), end: fmt(x.e) }))
    };
  };
  // atom [a0, a1) bagi `len` waktu bermula `start` dalam set k
  TT.atomRange = (tm, k, start, len) => {
    const sp = tm.span[k] || tm.span[0], f = sp[start], l = sp[start + len - 1] || f;
    return f ? [f[0], l[1]] : [0, 0];
  };

  // ---------- sekatan guru: profil guru + sekatan serentak (mesyuarat, kokurikulum) ----------
  TT.blockApplies = (b, t) => (b.teacherIds && b.teacherIds.length ? b.teacherIds.includes(t.id) : b.dept ? t.dept === b.dept : true);
  // kunci "hari-waktu" (waktu set utama) -> nama sekatan, atau true untuk profil guru
  TT.teacherUnavail = (s, t) => {
    const out = {};
    for (const k of Object.keys(t.unavailable || {})) if (t.unavailable[k]) out[k] = true;
    for (const b of s.blocks || []) {
      if (!TT.blockApplies(b, t)) continue;
      for (const d of b.days) for (let p = Math.min(b.from, b.to); p <= Math.max(b.from, b.to); p++) out[`${d}-${p}`] = b.name || 'Sekatan';
    }
    return out;
  };
  // set "hari|atom" yang disekat untuk seorang guru
  TT.blockedAtoms = (s, tm, t, only) => {
    const out = new Set(), un = only || TT.teacherUnavail(s, t), P = tm.sets[0].slots.length;
    for (const key of Object.keys(un)) {
      const [d, p] = key.split('-').map(Number);
      if (!(d >= 0 && d < tm.D && p >= 0 && p < P)) continue;
      const [a0, a1] = tm.span[0][p];
      for (let a = a0; a < a1; a++) out.add(d * tm.A + a);
    }
    return out;
  };

  TT.maps = (s) => ({
    subject: new Map(s.subjects.map((x) => [x.id, x])),
    teacher: new Map(s.teachers.map((x) => [x.id, x])),
    cls: new Map(s.classes.map((x) => [x.id, x])),
    room: new Map(s.rooms.map((x) => [x.id, x])),
    lesson: new Map(s.lessons.map((x) => [x.id, x]))
  });

  TT.buildUnits = (s) => {
    const out = [];
    for (const l of s.lessons) {
      const n = Math.max(0, l.perWeek | 0);
      const d = Math.min(l.doubles | 0, n >> 1);
      let k = 0;
      for (let i = 0; i < d; i++) out.push({ id: l.id + ':' + (k++), lessonId: l.id, len: 2 });
      for (let i = 0; i < n - 2 * d; i++) out.push({ id: l.id + ':' + (k++), lessonId: l.id, len: 1 });
    }
    return out;
  };

  // buang penempatan yatim (pelajaran dipadam / bilangan waktu berubah)
  TT.reconcile = (s) => {
    const len = new Map(TT.buildUnits(s).map((u) => [u.id, u.len]));
    const seen = new Set();
    s.placements = s.placements.filter((p) => {
      if (!len.has(p.unit) || len.get(p.unit) !== p.len || seen.has(p.unit)) return false;
      seen.add(p.unit); return true;
    });
    const l = new Set(s.lessons.map((x) => x.id));
    s.lessons.forEach((x) => {
      x.classIds = x.classIds.filter((id) => s.classes.some((c) => c.id === id));
      x.teacherIds = x.teacherIds.filter((id) => s.teachers.some((t) => t.id === id));
      if (x.roomId && !s.rooms.some((r) => r.id === x.roomId)) x.roomId = null;
    });
    s.reliefs = s.reliefs.filter((r) => l.has(r.lessonId));
    return s;
  };

  // buang penempatan yang tidak lagi muat selepas waktu / rehat / set kelas diubah
  TT.prunePlacements = (s) => {
    const tm = TT.timeModel(s), m = TT.maps(s);
    s.placements = s.placements.filter((p) => {
      const st = tm.sets[TT.lessonSetIdx(s, m.lesson.get(p.lessonId), m.cls)], lim = st.limit;
      if (p.day < 0 || p.day >= lim.length || p.start < 0 || p.start + p.len > lim[p.day]) return false;
      for (let k = 1; k < p.len; k++) if (st.slots[p.start + k].breakBefore) return false;
      return true;
    });
    return s;
  };

  TT.unplaced = (s) => {
    const have = new Set(s.placements.map((p) => p.unit));
    return TT.buildUnits(s).filter((u) => !have.has(u.id));
  };

  TT.teacherLoad = (s) => {
    const load = new Map(s.teachers.map((t) => [t.id, 0]));
    for (const l of s.lessons) for (const id of l.teacherIds) if (load.has(id)) load.set(id, load.get(id) + (l.perWeek | 0));
    return load;
  };

  TT.slotText = (s, p, k) => {
    const sl = TT.slots(s, k)[p];
    return sl ? `Waktu ${sl.label} (${sl.start}-${sl.end})` : `Waktu ${p + 1}`;
  };

  TT.classNames = (s, ids) => {
    const m = new Map(s.classes.map((c) => [c.id, c.name]));
    return ids.map((i) => m.get(i)).filter(Boolean).join(', ');
  };

  TT.lessonLabel = (s, l) => {
    const m = TT.maps(s);
    const sub = m.subject.get(l.subjectId);
    return `${sub ? sub.short : '?'} ${TT.classNames(s, l.classIds)}`.trim();
  };

  TT.fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

  // semakan bebas daripada enjin: dipakai UI untuk tunjuk konflik dan oleh ujian
  // Kelas disemak ikut waktu setnya; guru dan bilik ikut atom masa (sama dengan waktu bila satu set).
  TT.validate = (s) => {
    const m = TT.maps(s), tm = TT.timeModel(s), days = TT.days(s);
    const units = new Map(TT.buildUnits(s).map((u) => [u.id, u]));
    const issues = [], bad = new Set(), occ = new Map();
    const add = (sev, msg, ids) => { issues.push({ sev, msg }); ids.forEach((i) => bad.add(i)); };
    const tDay = new Map(), blocked = new Map();
    const blockedOf = (t) => { if (!blocked.has(t.id)) blocked.set(t.id, TT.blockedAtoms(s, tm, t)); return blocked.get(t.id); };
    const when = (d, a) => (tm.multi ? `${days[d].name} ${tm.atoms[a].start}-${tm.atoms[a].end}` : `${days[d].name} waktu ${a + 1}`);
    for (const pl of s.placements) {
      const u = units.get(pl.unit); if (!u) continue;
      const l = m.lesson.get(u.lessonId);
      const label = TT.lessonLabel(s, l);
      const k = TT.lessonSetIdx(s, l, m.cls), st = tm.sets[k];
      if (pl.day < 0 || pl.day >= days.length || pl.start < 0 || pl.start + u.len > st.limit[pl.day]) {
        add('error', `${label} berada di luar waktu sekolah`, [pl.unit]); continue;
      }
      for (let j = 1; j < u.len; j++) {
        if (st.slots[pl.start + j].breakBefore) { add('error', `${label} (waktu berganda) melintasi waktu rehat`, [pl.unit]); break; }
      }
      const push = (key) => { if (!occ.has(key)) occ.set(key, new Set()); occ.get(key).add(pl.unit); };
      for (let j = 0; j < u.len; j++) l.classIds.forEach((c) => push(`c|${c}|${pl.day}|${pl.start + j}`));
      const [a0, a1] = TT.atomRange(tm, k, pl.start, u.len);
      for (let a = a0; a < a1; a++) {
        l.teacherIds.forEach((t) => push(`t|${t}|${pl.day}|${a}`));
        if (l.roomId) push(`r|${l.roomId}|${pl.day}|${a}`);
      }
      for (const tid of l.teacherIds) {
        const t = m.teacher.get(tid); if (!t) continue;
        const bl = blockedOf(t);
        for (let a = a0; a < a1; a++) {
          if (bl.has(pl.day * tm.A + a)) { add('error', `${t.name} tidak boleh mengajar ${when(pl.day, a)} (${label})`, [pl.unit]); break; }
        }
        const key = `${tid}|${pl.day}`; tDay.set(key, (tDay.get(key) || 0) + u.len);
      }
    }
    const seen = new Set();
    occ.forEach((set, key) => {
      if (set.size < 2) return;
      const [kind, id, d, p] = key.split('|');
      // set berbilang: satu waktu boleh meliputi beberapa atom; lapor sekali sahaja
      if (tm.multi) { const sig = `${kind}|${id}|${d}|${[...set].sort().join(',')}`; if (seen.has(sig)) return; seen.add(sig); }
      const who = kind === 'c' ? (m.cls.get(id) || {}).name : kind === 't' ? (m.teacher.get(id) || {}).name : (m.room.get(id) || {}).name;
      const what = { c: 'Kelas', t: 'Guru', r: 'Bilik' }[kind];
      const names = [...set].map((uid) => TT.lessonLabel(s, m.lesson.get(units.get(uid).lessonId)));
      const at = kind === 'c' ? `${days[d].name} waktu ${+p + 1}` : when(+d, +p);
      add('error', `${what} ${who} bertindih pada ${at}: ${names.join(' / ')}`, [...set]);
    });
    tDay.forEach((n, key) => {
      const [tid, d] = key.split('|'); const t = m.teacher.get(tid);
      if (t && t.maxPerDay && n > t.maxPerDay) issues.push({ sev: 'warn', msg: `${t.name} mengajar ${n} waktu pada ${days[d].name} (had ${t.maxPerDay})` });
    });
    const un = TT.unplaced(s).length;
    if (un) issues.push({ sev: 'warn', msg: `${un} waktu pelajaran belum diletakkan dalam jadual` });
    return { issues, bad };
  };

  // semakan awal sebelum jana: cari masalah data yang pasti menyebabkan jadual gagal
  TT.precheck = (s) => {
    const out = [], m = TT.maps(s), tm = TT.timeModel(s), days = TT.days(s);
    const totals = tm.sets.map((st) => st.limit.reduce((a, b) => a + b, 0));
    const tLoad = TT.teacherLoad(s), cLoad = new Map(), rLoad = new Map();
    tm.bad.forEach((msg) => out.push({ sev: 'error', msg: `Set waktu ${msg}` }));
    for (const l of s.lessons) {
      const lab = TT.lessonLabel(s, l);
      if (!l.classIds.length) out.push({ sev: 'error', msg: `Pelajaran "${lab}" tiada kelas` });
      if (!l.teacherIds.length) out.push({ sev: 'warn', msg: `Pelajaran "${lab}" tiada guru` });
      if (!(l.perWeek > 0)) out.push({ sev: 'warn', msg: `Pelajaran "${lab}" bilangan waktu seminggu 0` });
      if (new Set(l.teacherIds).size !== l.teacherIds.length) out.push({ sev: 'error', msg: `Pelajaran "${lab}" guna guru yang sama dua kali` });
      if (tm.multi && new Set(l.classIds.map((c) => tm.classSet.get(c) || 0)).size > 1) out.push({ sev: 'error', msg: `Pelajaran gabungan "${lab}" mencampurkan kelas daripada set waktu berlainan` });
      l.classIds.forEach((c) => cLoad.set(c, (cLoad.get(c) || 0) + (l.perWeek | 0)));
      if (l.roomId) rLoad.set(l.roomId, (rLoad.get(l.roomId) || 0) + (l.perWeek | 0));
    }
    for (const t of s.teachers) {
      // kapasiti sebenar: setiap hari terhad oleh waktu yang boleh diajar dan had harian guru.
      // Set berbilang: ambil set yang paling banyak waktu lapang hari itu (anggaran atas, tidak pernah salah tuduh)
      const bl = TT.blockedAtoms(s, tm, t);
      let cap = 0;
      for (let d = 0; d < days.length; d++) {
        let avail = 0;
        tm.sets.forEach((st, k) => {
          let n = 0;
          for (let p = 0; p < st.limit[d]; p++) {
            const [a0, a1] = tm.span[k][p]; let ok = true;
            for (let a = a0; a < a1; a++) if (bl.has(d * tm.A + a)) { ok = false; break; }
            if (ok) n++;
          }
          avail = Math.max(avail, n);
        });
        cap += t.maxPerDay > 0 ? Math.min(avail, t.maxPerDay) : avail;
      }
      const load = tLoad.get(t.id) || 0;
      if (load > cap) out.push({ sev: 'error', msg: `${t.name}: ${load} waktu tetapi kapasiti sebenar cuma ${cap} (slot tidak boleh + had harian)` });
      else if (t.maxPerWeek && load > t.maxPerWeek) out.push({ sev: 'warn', msg: `${t.name}: ${load} waktu melebihi had mingguan ${t.maxPerWeek}` });
      if (t.maxPerDay && load > t.maxPerDay * days.length) out.push({ sev: 'error', msg: `${t.name}: ${load} waktu tidak muat dengan had harian ${t.maxPerDay}` });
    }
    for (const c of s.classes) {
      const load = cLoad.get(c.id) || 0, total = totals[tm.classSet.get(c.id) || 0];
      if (load > total) out.push({ sev: 'error', msg: `Kelas ${c.name}: ${load} waktu tetapi jadual cuma ada ${total} slot` });
    }
    const most = Math.max(...totals);
    for (const r of s.rooms) {
      const load = rLoad.get(r.id) || 0;
      if (load > most) out.push({ sev: 'error', msg: `Bilik ${r.name}: ${load} waktu melebihi ${most} slot` });
    }
    return out;
  };

  // semak sama ada satu penempatan sah (tanpa melihat kos lembut). `ignore` = unit yang dianggap tiada.
  TT.checkPlacement = (s, unitId, day, start, ignore, ctx) => {
    ignore = ignore || new Set([unitId]);
    // ctx boleh dikongsi antara banyak panggilan (cth sorot petak semasa seret) supaya tidak dikira semula
    ctx = ctx || TT.placeCtx(s);
    const { m, tm, days } = ctx;
    const unit = ctx.units.get(unitId);
    if (!unit) return { ok: false, reason: 'Unit tidak wujud', blockers: [] };
    const l = m.lesson.get(unit.lessonId), k = TT.lessonSetIdx(s, l, m.cls), st = tm.sets[k];
    if (day < 0 || day >= days.length || start < 0 || start + unit.len > st.limit[day]) return { ok: false, reason: 'Di luar waktu sekolah hari itu', blockers: [] };
    for (let j = 1; j < unit.len; j++) {
      if (st.slots[start + j].breakBefore) return { ok: false, reason: 'Waktu berganda tidak boleh melintasi rehat', blockers: [] };
    }
    const [a0, a1] = TT.atomRange(tm, k, start, unit.len);
    for (const tid of l.teacherIds) {
      const t = m.teacher.get(tid); if (!t) continue;
      const un = TT.teacherUnavail(s, t), bl = TT.blockedAtoms(s, tm, t, un);
      for (let a = a0; a < a1; a++) {
        if (bl.has(day * tm.A + a)) {
          const why = Object.keys(un).map((x) => x.split('-').map(Number)).find(([d, p]) => d === day && tm.span[0][p] && tm.span[0][p][0] <= a && a < tm.span[0][p][1]);
          const name = why && un[why.join('-')];
          return { ok: false, reason: typeof name === 'string' ? `${t.name} ada ${name} pada waktu ini` : `${t.name} tidak boleh mengajar pada waktu ini`, blockers: [] };
        }
      }
    }
    const blockers = new Set(); let reason = '';
    for (const pl of s.placements) {
      if (ignore.has(pl.unit) || pl.day !== day) continue;
      const o = ctx.units.get(pl.unit); if (!o) continue;
      const ol = m.lesson.get(o.lessonId), ok = TT.lessonSetIdx(s, ol, m.cls);
      const sharedC = ol.classIds.find((c) => l.classIds.includes(c));
      let hit = false;
      if (sharedC) hit = !(pl.start >= start + unit.len || start >= pl.start + o.len);
      const [b0, b1] = TT.atomRange(tm, ok, pl.start, o.len);
      const overlap = b0 < a1 && a0 < b1;
      const sharedT = overlap && ol.teacherIds.find((t) => l.teacherIds.includes(t));
      const sharedR = overlap && ol.roomId && ol.roomId === l.roomId;
      if (hit || sharedT || sharedR) {
        blockers.add(pl.unit);
        if (!reason) reason = sharedT ? `Guru ${(m.teacher.get(sharedT) || {}).name} sudah mengajar ${TT.lessonLabel(s, ol)}`
          : hit ? `Kelas ${(m.cls.get(sharedC) || {}).name} sudah ada ${TT.lessonLabel(s, ol)}`
            : `Bilik ${(m.room.get(l.roomId) || {}).name} sedang digunakan`;
      }
    }
    return blockers.size ? { ok: false, reason, blockers: [...blockers] } : { ok: true, blockers: [] };
  };
  TT.placeCtx = (s) => ({ m: TT.maps(s), tm: TT.timeModel(s), days: TT.days(s), units: new Map(TT.buildUnits(s).map((u) => [u.id, u])) });

  const placementOf = (s, id) => s.placements.find((p) => p.unit === id);

  // alih unit ke slot baharu; jika slot diduduki satu unit lain, cuba tukar tempat
  TT.applyMove = (s, unitId, day, start) => {
    const unit = TT.buildUnits(s).find((u) => u.id === unitId);
    if (!unit) return { ok: false, reason: 'Unit tidak wujud' };
    const cur = placementOf(s, unitId);
    if (cur && cur.locked) return { ok: false, reason: 'Waktu ini dikunci. Buka kunci dahulu.' };
    const set = (d, st) => {
      if (cur) { cur.day = d; cur.start = st; } else s.placements.push({ unit: unitId, lessonId: unit.lessonId, len: unit.len, day: d, start: st, locked: false });
    };
    const r = TT.checkPlacement(s, unitId, day, start);
    if (r.ok) { set(day, start); return { ok: true }; }
    if (r.blockers.length !== 1) return { ok: false, reason: r.reason };
    const other = placementOf(s, r.blockers[0]);
    if (!other || other.locked) return { ok: false, reason: other ? 'Waktu sasaran dikunci' : r.reason };
    const ig = new Set([unitId, other.unit]);
    if (!TT.checkPlacement(s, unitId, day, start, ig).ok) return { ok: false, reason: r.reason };
    if (!cur) {
      // unit dari senarai "belum diletak": unit yang menghalang dikeluarkan dari jadual
      s.placements = s.placements.filter((p) => p !== other);
      set(day, start); return { ok: true, swapped: true };
    }
    if (!TT.checkPlacement(s, other.unit, cur.day, cur.start, ig).ok) return { ok: false, reason: `Tidak boleh tukar tempat: ${r.reason}` };
    const od = other.day, os = other.start, cd = cur.day, cs = cur.start;
    other.day = cd; other.start = cs; cur.day = od; cur.start = os;
    // dua unit berlainan panjang boleh bertindih sesama sendiri selepas tukar; semak dan batalkan jika perlu
    const bad = TT.validate(s).bad;
    if (bad.has(unitId) || bad.has(other.unit)) {
      other.day = od; other.start = os; cur.day = cd; cur.start = cs;
      return { ok: false, reason: 'Tukar tempat menyebabkan konflik lain' };
    }
    return { ok: true, swapped: true };
  };

  TT.unplace = (s, unitId) => {
    const p = placementOf(s, unitId);
    if (p && p.locked) return false;
    s.placements = s.placements.filter((x) => x.unit !== unitId); return true;
  };
  TT.toggleLock = (s, unitId) => { const p = placementOf(s, unitId); if (p) p.locked = !p.locked; };

});
