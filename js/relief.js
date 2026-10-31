(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  TT.ABSENCE_REASONS = ['MC', 'Cuti Rehat', 'Cuti Kecemasan', 'Kursus / Bengkel', 'Urusan Rasmi', 'Cuti Bersalin', 'Lain-lain'];

  TT.dateToDay = (s, iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return TT.days(s).findIndex((x) => x.dow === dow);
  };

  TT.todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // tarikh sama atau hari persekolahan seterusnya (cth Ahad -> Isnin dalam minggu Isnin-Jumaat)
  TT.nextSchoolDay = (s, iso) => {
    for (let i = 0; i < 8; i++) { const d = TT.addDays(iso, i); if (TT.dateToDay(s, d) >= 0) return d; }
    return iso;
  };

  TT.addDays = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    const x = new Date(y, m - 1, d + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  // jadual mengajar setiap guru: Map(teacherId -> [hari][atom] = placement).
  // Satu set waktu: atom = waktu. Set berbilang: atom = potongan masa (lihat TT.timeModel).
  TT.teacherGrid = (s, tm) => {
    tm = tm || TT.timeModel(s);
    const D = tm.D, A = tm.A, m = TT.maps(s);
    const grid = new Map(s.teachers.map((t) => [t.id, Array.from({ length: D }, () => new Array(A).fill(null))]));
    for (const pl of s.placements) {
      const l = m.lesson.get(pl.lessonId); if (!l) continue;
      const [a0, a1] = TT.atomRange(tm, TT.lessonSetIdx(s, l, m.cls), pl.start, pl.len);
      for (const tid of l.teacherIds) {
        const g = grid.get(tid); if (!g || !g[pl.day]) continue;
        for (let a = a0; a < a1; a++) g[pl.day][a] = pl;
      }
    }
    return grid;
  };

  const covers = (a, p) => (a.from == null || p >= a.from) && (a.to == null || p <= a.to);
  // tidak hadir disimpan dalam waktu set utama; untuk set lain, bandingkan ikut masa sebenar
  TT.absCovers = (tm, a, k, p) => {
    if (a.from == null && a.to == null) return true;
    if (!tm.multi || !k) return covers(a, p);
    const sp = tm.span[k][p], P0 = tm.sets[0].slots.length; if (!sp || !P0) return false;
    const f = Math.min(P0 - 1, a.from == null ? 0 : a.from), t = Math.min(P0 - 1, a.to == null ? P0 - 1 : a.to);
    return sp[0] < tm.span[0][t][1] && tm.span[0][f][0] < sp[1];
  };

  TT.absentAt = (s, iso, teacherId, p, k, tm) => {
    tm = tm || TT.timeModel(s);
    return s.absences.find((a) => a.date === iso && a.teacherId === teacherId && TT.absCovers(tm, a, k || 0, p));
  };

  // blok relief = satu pelajaran yang terlibat dengan ketidakhadiran, mungkin 1-2 waktu bersambung.
  // periods = indeks waktu dalam set kelas itu (k)
  TT.reliefNeeds = (s, iso) => {
    const day = TT.dateToDay(s, iso); if (day < 0) return [];
    const tm = TT.timeModel(s), m = TT.maps(s);
    const out = [];
    for (const a of s.absences) {
      if (a.date !== iso) continue;
      for (const pl of s.placements) {
        if (pl.day !== day) continue;
        const l = m.lesson.get(pl.lessonId);
        if (!l || !l.teacherIds.includes(a.teacherId)) continue;
        const k = TT.lessonSetIdx(s, l, m.cls), lim = tm.sets[k].limit[day];
        const periods = [];
        for (let j = 0; j < pl.len; j++) { const p = pl.start + j; if (p < lim && TT.absCovers(tm, a, k, p)) periods.push(p); }
        if (!periods.length) continue;
        out.push({
          key: `${iso}|${a.teacherId}|${pl.unit}`, date: iso, day, k, absenceId: a.id, absentTeacherId: a.teacherId,
          unitId: pl.unit, lessonId: l.id, classIds: l.classIds, subjectId: l.subjectId, roomId: l.roomId, periods
        });
      }
    }
    const t0 = (n) => (tm.multi ? TT.atomRange(tm, n.k, n.periods[0], 1)[0] : n.periods[0]);
    out.sort((x, y) => t0(x) - t0(y) || x.absentTeacherId.localeCompare(y.absentTeacherId));
    return out;
  };

  const recordOf = (s, need) => s.reliefs.find((r) => r.key === need.key && r.periods.join() === need.periods.join());

  TT.reliefRecord = recordOf;

  // status: assigned (guru ganti), kendiri (kelas kendiri), gabung (gabung dengan kelas lain, mergeClassId pilihan)
  TT.setRelief = (s, need, status, teacherId, note, mergeClassId) => {
    s.reliefs = s.reliefs.filter((r) => r.key !== need.key);
    if (!status) return;
    s.reliefs.push({
      id: TT.uid('rl'), key: need.key, date: need.date, absentTeacherId: need.absentTeacherId, unitId: need.unitId,
      lessonId: need.lessonId, classIds: need.classIds, subjectId: need.subjectId, periods: need.periods.slice(),
      status, reliefTeacherId: status === 'assigned' ? teacherId : null, note: note || '',
      mergeClassId: status === 'gabung' ? mergeClassId || null : null
    });
  };

  // kelas lain yang sedang belajar dengan guru yang hadir pada waktu keperluan: calon untuk digabungkan
  TT.mergeCandidates = (s, need) => {
    const tm = TT.timeModel(s), m = TT.maps(s), mine = new Set(need.classIds);
    const level = new Set(need.classIds.map((c) => String((m.cls.get(c) || {}).level || '')));
    const out = [];
    for (const pl of s.placements) {
      if (pl.day !== need.day) continue;
      const l = m.lesson.get(pl.lessonId); if (!l || l.classIds.some((c) => mine.has(c))) continue;
      const k = TT.lessonSetIdx(s, l, m.cls); if (k !== need.k) continue;
      if (!need.periods.every((p) => p >= pl.start && p < pl.start + pl.len)) continue;
      const present = l.teacherIds.filter((t) => !need.periods.some((p) => TT.absentAt(s, need.date, t, p, k, tm)));
      if (!present.length) continue;
      for (const c of l.classIds) {
        const cls = m.cls.get(c); if (!cls) continue;
        out.push({ cls, teacher: m.teacher.get(present[0]) || null, subject: m.subject.get(l.subjectId) || null, sameLevel: level.has(String(cls.level || '')) });
      }
    }
    out.sort((a, b) => (b.sameLevel - a.sameLevel) || a.cls.name.localeCompare(b.cls.name));
    return out;
  };

  // padam rekod relief yang tidak lagi sepadan dengan keperluan (cth selepas padam ketidakhadiran)
  TT.reliefSync = (s, iso) => {
    const keys = new Set(TT.reliefNeeds(s, iso).map((n) => n.key + '#' + n.periods.join()));
    s.reliefs = s.reliefs.filter((r) => r.date !== iso || keys.has(r.key + '#' + r.periods.join()));
  };

  const monthOf = (iso) => iso.slice(0, 7);

  const roleList = (txt) => String(txt || '').split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  // guru dikecualikan terus: tanda pada profil, atau jawatan dalam senarai pengecualian sekolah
  TT.reliefExempt = (s, t) => !!t.noRelief || (!!t.role && roleList(s.settings.relief.excludeRoles).includes(String(t.role).trim().toLowerCase()));

  // minggu persekolahan yang mengandungi tarikh itu (hari pertama hingga +6)
  const weekOf = (s, iso) => { const i = Math.max(0, TT.dateToDay(s, iso)); const a = TT.addDays(iso, -i); return [a, TT.addDays(a, 6)]; };

  TT.reliefCandidates = (s, need, opts) => {
    opts = opts || {};
    const cfg = s.settings.relief, iso = need.date, day = need.day, k = need.k || 0;
    const tm = opts.tm || TT.timeModel(s);
    const grid = opts.grid || TT.teacherGrid(s, tm);
    const load = TT.teacherLoad(s);
    const absent = s.teachers.find((t) => t.id === need.absentTeacherId);
    const st = tm.sets[k], lim = st.limit[day];
    const others = s.reliefs.filter((r) => r.date === iso && r.key !== need.key && r.status === 'assigned');
    const past = s.reliefs.filter((r) => r.status === 'assigned' && r.date !== iso);
    const [w0, w1] = weekOf(s, iso);
    const teachesClass = new Set();
    for (const l of s.lessons) for (const t of l.teacherIds) if (l.classIds.some((c) => need.classIds.includes(c))) teachesClass.add(t);
    const homerooms = new Set(s.classes.filter((c) => need.classIds.includes(c.id)).map((c) => c.homeroomId));
    // atom yang sibuk dengan relief lain hari ini, ikut guru
    const relBusy = new Map();
    for (const r of others) {
      const rk = TT.setOfClasses(s, r.classIds);
      if (!relBusy.has(r.reliefTeacherId)) relBusy.set(r.reliefTeacherId, new Set());
      for (const p of r.periods) { const [a0, a1] = TT.atomRange(tm, rk, p, 1); for (let a = a0; a < a1; a++) relBusy.get(r.reliefTeacherId).add(a); }
    }
    const atomsOf = (p) => { const [a0, a1] = TT.atomRange(tm, k, p, 1); const out = []; for (let a = a0; a < a1; a++) out.push(a); return out; };
    const busyAt = (t, p) => atomsOf(p).some((a) => grid.get(t.id)[day][a] || (relBusy.get(t.id) && relBusy.get(t.id).has(a)));
    const p0 = need.periods[0], p1 = need.periods[need.periods.length - 1];
    const cands = [];
    for (const t of s.teachers) {
      if (t.id === need.absentTeacherId || TT.reliefExempt(s, t)) continue;
      const un = TT.teacherUnavail(s, t);
      const blocked = TT.blockedAtoms(s, tm, t, cfg.respectUnavailable ? un : Object.fromEntries(Object.entries(un).filter(([, v]) => typeof v === 'string')));
      let ok = true;
      for (const p of need.periods) {
        if (busyAt(t, p)) { ok = false; break; }
        if (TT.absentAt(s, iso, t.id, p, k, tm)) { ok = false; break; }
        // sekatan serentak (mesyuarat) sentiasa dihormati; profil "tidak boleh" ikut tetapan
        if (atomsOf(p).some((a) => blocked.has(day * tm.A + a))) { ok = false; break; }
      }
      if (!ok) continue;
      const today = others.filter((r) => r.reliefTeacherId === t.id).reduce((a, r) => a + r.periods.length, 0);
      if (cfg.maxPerDay > 0 && today + need.periods.length > cfg.maxPerDay) continue;
      const mine = past.filter((r) => r.reliefTeacherId === t.id);
      if (cfg.maxPerWeek > 0) {
        const week = mine.filter((r) => r.date >= w0 && r.date <= w1).reduce((a, r) => a + r.periods.length, 0);
        if (week + today + need.periods.length > cfg.maxPerWeek) continue;
      }
      if (cfg.maxTeachDay > 0) {
        let teach = 0; const seen = new Set();
        for (const row of grid.get(t.id)[day]) if (row && !seen.has(row)) { seen.add(row); teach += row.len; }
        if (teach + today + need.periods.length > cfg.maxTeachDay) continue;
      }
      if (cfg.needGap) {
        const freeBefore = p0 === 0 || st.slots[p0].breakBefore || !busyAt(t, p0 - 1);
        const freeAfter = p1 + 1 >= lim || st.slots[p1 + 1].breakBefore || !busyAt(t, p1 + 1);
        if (!freeBefore && !freeAfter) continue;
      }
      const month = mine.filter((r) => monthOf(r.date) === monthOf(iso)).reduce((a, r) => a + r.periods.length, 0);
      const total = mine.reduce((a, r) => a + r.periods.length, 0);
      const parts = []; let score = 0;
      const add = (label, v) => { if (v) { score += v; parts.push({ label, v }); } };
      if (t.subjectIds.includes(need.subjectId)) add('Subjek sama', cfg.wSubject);
      if (absent && t.dept && t.dept === absent.dept) add('Panitia sama', cfg.wDept);
      if (teachesClass.has(t.id)) add('Mengajar kelas ini', cfg.wKnows);
      if (homerooms.has(t.id)) add('Guru kelas', cfg.wHome);
      const adj = others.some((r) => r.reliefTeacherId === t.id && r.classIds.some((c) => need.classIds.includes(c)) &&
        r.periods.some((p) => p === p0 - 1 || p === p1 + 1));
      if (adj) add('Sambung kelas sama', cfg.wCont);
      add(`Relief bulan ini: ${month}`, -cfg.wFair * month);
      add(`Jumlah relief: ${total}`, -cfg.wTotal * total);
      add(`Relief hari ini: ${today}`, -cfg.wToday * today);
      add(`Beban mengajar: ${load.get(t.id) || 0}`, -cfg.wLoad * (load.get(t.id) || 0));
      const tag = [];
      if (t.subjectIds.includes(need.subjectId)) tag.push('subjek sama');
      if (teachesClass.has(t.id)) tag.push('ajar kelas ini');
      if (absent && t.dept && t.dept === absent.dept) tag.push('panitia sama');
      cands.push({ teacher: t, score: Math.round(score * 10) / 10, parts, month, total, today, tag });
    }
    cands.sort((a, b) => b.score - a.score || a.total - b.total || a.teacher.name.localeCompare(b.teacher.name));
    return cands;
  };

  // agih semua blok yang belum ada keputusan. Blok paling sukar (calon paling sedikit) dahulu.
  TT.autoRelief = (s, iso) => {
    const needs = TT.reliefNeeds(s, iso).filter((n) => !recordOf(s, n));
    const tm = TT.timeModel(s), grid = TT.teacherGrid(s, tm);
    let assigned = 0; const none = [];
    const left = needs.slice();
    while (left.length) {
      const scored = left.map((n) => ({ n, c: TT.reliefCandidates(s, n, { grid, tm }) }));
      scored.sort((a, b) => a.c.length - b.c.length || a.n.periods[0] - b.n.periods[0]);
      const { n, c } = scored[0];
      left.splice(left.indexOf(n), 1);
      if (c.length) { TT.setRelief(s, n, 'assigned', c[0].teacher.id); assigned++; } else none.push(n);
    }
    return { assigned, unresolved: none };
  };

  TT.clearRelief = (s, iso) => { s.reliefs = s.reliefs.filter((r) => r.date !== iso); };

  // teks keputusan bukan guru ganti: "Kelas kendiri", "Gabung dengan 2 Amanah (Cikgu X)"
  TT.reliefStatusText = (s, r) => {
    if (r.status === 'kendiri') return 'Kelas kendiri';
    if (r.status !== 'gabung') return '';
    const m = TT.maps(s), c = r.mergeClassId && m.cls.get(r.mergeClassId);
    if (!c) return 'Gabung kelas';
    const need = TT.reliefNeeds(s, r.date).find((n) => n.key === r.key);
    const w = need && TT.mergeCandidates(s, need).find((x) => x.cls.id === c.id);
    return `Gabung dengan ${c.name}${w && w.teacher ? ` (${w.teacher.name})` : ''}`;
  };

  TT.schoolDays = (s, from, to) => {
    const out = [];
    for (let d = from; d <= to; d = TT.addDays(d, 1)) if (TT.dateToDay(s, d) >= 0) out.push(d);
    return out;
  };

  TT.reliefStats = (s, from, to) => {
    const load = TT.teacherLoad(s);
    const rows = new Map(s.teachers.map((t) => [t.id, { teacher: t, periods: 0, sessions: 0, load: load.get(t.id) || 0, absent: 0 }]));
    for (const r of s.reliefs) {
      if (r.date < from || r.date > to || r.status !== 'assigned') continue;
      const row = rows.get(r.reliefTeacherId); if (!row) continue;
      row.periods += r.periods.length; row.sessions++;
    }
    const dates = [...new Set(s.absences.filter((a) => a.date >= from && a.date <= to).map((a) => a.date))];
    let uncovered = 0, kendiri = 0;
    for (const d of dates) for (const n of TT.reliefNeeds(s, d)) {
      const row = rows.get(n.absentTeacherId); if (row) row.absent += n.periods.length;
      const rec = recordOf(s, n);
      if (!rec) uncovered += n.periods.length; else if (rec.status !== 'assigned') kendiri += n.periods.length;
    }
    const list = [...rows.values()].filter((r) => !TT.reliefExempt(s, r.teacher));
    const vals = list.map((r) => r.periods);
    const total = vals.reduce((a, b) => a + b, 0), mean = list.length ? total / list.length : 0;
    const sd = list.length ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / list.length) : 0;
    return { rows: [...rows.values()], summary: { total, mean, sd, max: Math.max(0, ...vals), uncovered, kendiri } };
  };

  TT.reliefMessage = (s, iso) => {
    const m = TT.maps(s), slots = TT.slots(s), days = TT.days(s);
    const day = TT.dateToDay(s, iso);
    const needs = TT.reliefNeeds(s, iso);
    const L = [`*RELIEF ${day >= 0 ? days[day].name.toUpperCase() : ''} ${TT.fmtDate(iso)}*`, s.school.name, ''];
    const abs = s.absences.filter((a) => a.date === iso);
    if (abs.length) {
      L.push('*Guru tidak hadir:*');
      abs.forEach((a) => {
        const t = m.teacher.get(a.teacherId);
        const range = a.from == null && a.to == null ? 'sehari' : `waktu ${(a.from || 0) + 1}-${(a.to == null ? slots.length - 1 : a.to) + 1}`;
        L.push(`- ${t ? t.name : '?'} (${a.reason}, ${range})`);
      });
      L.push('');
    }
    const ass = [], rest = [];
    for (const n of needs) {
      const rec = recordOf(s, n);
      const p0 = n.periods[0], p1 = n.periods[n.periods.length - 1], sl = TT.slots(s, n.k);
      const when = p0 === p1 ? `W${p0 + 1}` : `W${p0 + 1}-${p1 + 1}`;
      const time = `${sl[p0].start}-${sl[p1].end}`;
      const sub = (m.subject.get(n.subjectId) || {}).short || '';
      const at = m.teacher.get(n.absentTeacherId);
      const base = `${when} (${time}) ${TT.classNames(s, n.classIds)} ${sub}, ganti ${at ? at.name : '?'}`;
      if (rec && rec.status === 'assigned') ass.push({ t: sl[p0].start, line: `${base} → *${(m.teacher.get(rec.reliefTeacherId) || {}).name}*` });
      else rest.push(`${base} → ${rec ? TT.reliefStatusText(s, rec) : '*BELUM ADA GURU GANTI*'}`);
    }
    if (ass.length) { L.push('*Guru ganti:*'); ass.sort((a, b) => a.t.localeCompare(b.t)).forEach((x) => L.push('- ' + x.line)); L.push(''); }
    if (rest.length) { L.push('*Perlu perhatian:*'); rest.forEach((x) => L.push('- ' + x)); L.push(''); }
    if (!needs.length) L.push('Tiada relief diperlukan.');
    L.push('Sila rujuk slip relief. Terima kasih.');
    return L.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
