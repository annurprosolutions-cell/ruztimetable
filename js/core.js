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

  TT.defaultRelief = () => ({
    maxPerDay: 3, respectUnavailable: true,
    wSubject: 30, wDept: 10, wKnows: 15, wHome: 10, wCont: 20,
    wFair: 8, wTotal: 0.5, wToday: 12, wLoad: 0.5
  });

  TT.newState = () => ({
    version: 1,
    school: { name: 'Sekolah Saya', weekMode: 'mon-fri', logo: '', color: '' },
    periods: TT.defaultPeriods(),
    dayLimits: [8, 8, 8, 8, 6],
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
    });
    s.lessons.forEach((l) => { l.classIds = l.classIds || []; l.teacherIds = l.teacherIds || []; l.doubles = l.doubles || 0; });
    return s;
  };

  TT.slots = (s) => {
    const out = []; let brk = false;
    for (const p of s.periods) {
      if (p.type === 'break') { brk = true; continue; }
      out.push({ index: out.length, label: p.label, start: p.start, end: p.end, breakBefore: brk && out.length > 0 });
      brk = false;
    }
    return out;
  };

  TT.dayLimits = (s) => {
    const n = TT.slots(s).length;
    return TT.days(s).map((_, i) => {
      const v = s.dayLimits && s.dayLimits[i];
      return Math.max(0, Math.min(n, v == null ? n : v));
    });
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

  // buang penempatan yang tidak lagi muat selepas waktu / rehat diubah
  TT.prunePlacements = (s) => {
    const lim = TT.dayLimits(s), slots = TT.slots(s);
    s.placements = s.placements.filter((p) => {
      if (p.day < 0 || p.day >= lim.length || p.start < 0 || p.start + p.len > lim[p.day]) return false;
      for (let k = 1; k < p.len; k++) if (slots[p.start + k].breakBefore) return false;
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

  TT.slotText = (s, p) => {
    const sl = TT.slots(s)[p];
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
  TT.validate = (s) => {
    const m = TT.maps(s), slots = TT.slots(s), lim = TT.dayLimits(s), days = TT.days(s);
    const units = new Map(TT.buildUnits(s).map((u) => [u.id, u]));
    const issues = [], bad = new Set(), occ = new Map();
    const add = (sev, msg, ids) => { issues.push({ sev, msg }); ids.forEach((i) => bad.add(i)); };
    const tDay = new Map();
    for (const pl of s.placements) {
      const u = units.get(pl.unit); if (!u) continue;
      const l = m.lesson.get(u.lessonId);
      const label = TT.lessonLabel(s, l);
      if (pl.day < 0 || pl.day >= days.length || pl.start < 0 || pl.start + u.len > lim[pl.day]) {
        add('error', `${label} berada di luar waktu sekolah`, [pl.unit]); continue;
      }
      for (let k = 1; k < u.len; k++) {
        if (slots[pl.start + k].breakBefore) { add('error', `${label} (waktu berganda) melintasi waktu rehat`, [pl.unit]); break; }
      }
      for (let k = 0; k < u.len; k++) {
        const p = pl.start + k;
        const push = (key) => { if (!occ.has(key)) occ.set(key, new Set()); occ.get(key).add(pl.unit); };
        l.classIds.forEach((c) => push(`c|${c}|${pl.day}|${p}`));
        l.teacherIds.forEach((t) => push(`t|${t}|${pl.day}|${p}`));
        if (l.roomId) push(`r|${l.roomId}|${pl.day}|${p}`);
      }
      for (const tid of l.teacherIds) {
        const t = m.teacher.get(tid); if (!t) continue;
        for (let k = 0; k < u.len; k++) {
          if (t.unavailable[`${pl.day}-${pl.start + k}`]) { add('error', `${t.name} tidak boleh mengajar ${days[pl.day].name} waktu ${pl.start + k + 1} (${label})`, [pl.unit]); break; }
        }
        const key = `${tid}|${pl.day}`; tDay.set(key, (tDay.get(key) || 0) + u.len);
      }
    }
    occ.forEach((set, key) => {
      if (set.size < 2) return;
      const [kind, id, d, p] = key.split('|');
      const who = kind === 'c' ? (m.cls.get(id) || {}).name : kind === 't' ? (m.teacher.get(id) || {}).name : (m.room.get(id) || {}).name;
      const what = { c: 'Kelas', t: 'Guru', r: 'Bilik' }[kind];
      const names = [...set].map((uid) => TT.lessonLabel(s, m.lesson.get(units.get(uid).lessonId)));
      add('error', `${what} ${who} bertindih pada ${days[d].name} waktu ${+p + 1}: ${names.join(' / ')}`, [...set]);
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
    const out = [], m = TT.maps(s), lim = TT.dayLimits(s), days = TT.days(s);
    const total = lim.reduce((a, b) => a + b, 0);
    const tLoad = TT.teacherLoad(s), cLoad = new Map(), rLoad = new Map();
    for (const l of s.lessons) {
      const lab = TT.lessonLabel(s, l);
      if (!l.classIds.length) out.push({ sev: 'error', msg: `Pelajaran "${lab}" tiada kelas` });
      if (!l.teacherIds.length) out.push({ sev: 'warn', msg: `Pelajaran "${lab}" tiada guru` });
      if (!(l.perWeek > 0)) out.push({ sev: 'warn', msg: `Pelajaran "${lab}" bilangan waktu seminggu 0` });
      if (new Set(l.teacherIds).size !== l.teacherIds.length) out.push({ sev: 'error', msg: `Pelajaran "${lab}" guna guru yang sama dua kali` });
      l.classIds.forEach((c) => cLoad.set(c, (cLoad.get(c) || 0) + (l.perWeek | 0)));
      if (l.roomId) rLoad.set(l.roomId, (rLoad.get(l.roomId) || 0) + (l.perWeek | 0));
    }
    for (const t of s.teachers) {
      // kapasiti sebenar: setiap hari terhad oleh slot yang boleh diajar dan had harian guru
      let cap = 0;
      lim.forEach((n, d) => {
        let avail = 0;
        for (let p = 0; p < n; p++) if (!t.unavailable[`${d}-${p}`]) avail++;
        cap += t.maxPerDay > 0 ? Math.min(avail, t.maxPerDay) : avail;
      });
      const load = tLoad.get(t.id) || 0;
      if (load > cap) out.push({ sev: 'error', msg: `${t.name}: ${load} waktu tetapi kapasiti sebenar cuma ${cap} (slot tidak boleh + had harian)` });
      else if (t.maxPerWeek && load > t.maxPerWeek) out.push({ sev: 'warn', msg: `${t.name}: ${load} waktu melebihi had mingguan ${t.maxPerWeek}` });
      if (t.maxPerDay && load > t.maxPerDay * days.length) out.push({ sev: 'error', msg: `${t.name}: ${load} waktu tidak muat dengan had harian ${t.maxPerDay}` });
    }
    for (const c of s.classes) {
      const load = cLoad.get(c.id) || 0;
      if (load > total) out.push({ sev: 'error', msg: `Kelas ${c.name}: ${load} waktu tetapi jadual cuma ada ${total} slot` });
    }
    for (const r of s.rooms) {
      const load = rLoad.get(r.id) || 0;
      if (load > total) out.push({ sev: 'error', msg: `Bilik ${r.name}: ${load} waktu melebihi ${total} slot` });
    }
    return out;
  };

  // semak sama ada satu penempatan sah (tanpa melihat kos lembut). `ignore` = unit yang dianggap tiada.
  TT.checkPlacement = (s, unitId, day, start, ignore) => {
    ignore = ignore || new Set([unitId]);
    const m = TT.maps(s), slots = TT.slots(s), lim = TT.dayLimits(s), days = TT.days(s);
    const unit = TT.buildUnits(s).find((u) => u.id === unitId);
    if (!unit) return { ok: false, reason: 'Unit tidak wujud', blockers: [] };
    const l = m.lesson.get(unit.lessonId);
    if (day < 0 || day >= days.length || start < 0 || start + unit.len > lim[day]) return { ok: false, reason: 'Di luar waktu sekolah hari itu', blockers: [] };
    for (let k = 1; k < unit.len; k++) {
      if (slots[start + k].breakBefore) return { ok: false, reason: 'Waktu berganda tidak boleh melintasi rehat', blockers: [] };
    }
    for (const tid of l.teacherIds) {
      const t = m.teacher.get(tid);
      for (let k = 0; k < unit.len; k++) {
        if (t && t.unavailable[`${day}-${start + k}`]) return { ok: false, reason: `${t.name} tidak boleh mengajar pada waktu ini`, blockers: [] };
      }
    }
    const units = new Map(TT.buildUnits(s).map((u) => [u.id, u]));
    const blockers = new Set(); let reason = '';
    for (const pl of s.placements) {
      if (ignore.has(pl.unit) || pl.day !== day) continue;
      const o = units.get(pl.unit); if (!o) continue;
      if (pl.start >= start + unit.len || start >= pl.start + o.len) continue;
      const ol = m.lesson.get(o.lessonId);
      const sharedT = ol.teacherIds.find((t) => l.teacherIds.includes(t));
      const sharedC = ol.classIds.find((c) => l.classIds.includes(c));
      const sharedR = ol.roomId && ol.roomId === l.roomId;
      if (sharedT || sharedC || sharedR) {
        blockers.add(pl.unit);
        if (!reason) reason = sharedT ? `Guru ${(m.teacher.get(sharedT) || {}).name} sudah mengajar ${TT.lessonLabel(s, ol)}`
          : sharedC ? `Kelas ${(m.cls.get(sharedC) || {}).name} sudah ada ${TT.lessonLabel(s, ol)}`
            : `Bilik ${(m.room.get(l.roomId) || {}).name} sedang digunakan`;
      }
    }
    return blockers.size ? { ok: false, reason, blockers: [...blockers] } : { ok: true, blockers: [] };
  };

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
