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

  // jadual mengajar setiap guru: Map(teacherId -> [hari][waktu] = placement)
  TT.teacherGrid = (s) => {
    const D = TT.days(s).length, P = TT.slots(s).length;
    const lessons = new Map(s.lessons.map((l) => [l.id, l]));
    const grid = new Map(s.teachers.map((t) => [t.id, Array.from({ length: D }, () => new Array(P).fill(null))]));
    for (const pl of s.placements) {
      const l = lessons.get(pl.lessonId); if (!l) continue;
      for (const tid of l.teacherIds) {
        const g = grid.get(tid); if (!g || !g[pl.day]) continue;
        for (let k = 0; k < pl.len; k++) g[pl.day][pl.start + k] = pl;
      }
    }
    return grid;
  };

  const covers = (a, p) => (a.from == null || p >= a.from) && (a.to == null || p <= a.to);

  TT.absentAt = (s, iso, teacherId, p) => s.absences.find((a) => a.date === iso && a.teacherId === teacherId && covers(a, p));

  // blok relief = satu pelajaran yang terlibat dengan ketidakhadiran, mungkin 1-2 waktu bersambung
  TT.reliefNeeds = (s, iso) => {
    const day = TT.dateToDay(s, iso); if (day < 0) return [];
    const lim = TT.dayLimits(s)[day];
    const lessons = new Map(s.lessons.map((l) => [l.id, l]));
    const out = [];
    for (const a of s.absences) {
      if (a.date !== iso) continue;
      for (const pl of s.placements) {
        if (pl.day !== day) continue;
        const l = lessons.get(pl.lessonId);
        if (!l || !l.teacherIds.includes(a.teacherId)) continue;
        const periods = [];
        for (let k = 0; k < pl.len; k++) { const p = pl.start + k; if (p < lim && covers(a, p)) periods.push(p); }
        if (!periods.length) continue;
        out.push({
          key: `${iso}|${a.teacherId}|${pl.unit}`, date: iso, day, absenceId: a.id, absentTeacherId: a.teacherId,
          unitId: pl.unit, lessonId: l.id, classIds: l.classIds, subjectId: l.subjectId, roomId: l.roomId, periods
        });
      }
    }
    out.sort((x, y) => x.periods[0] - y.periods[0] || x.absentTeacherId.localeCompare(y.absentTeacherId));
    return out;
  };

  const recordOf = (s, need) => s.reliefs.find((r) => r.key === need.key && r.periods.join() === need.periods.join());

  TT.reliefRecord = recordOf;

  TT.setRelief = (s, need, status, teacherId, note) => {
    s.reliefs = s.reliefs.filter((r) => r.key !== need.key);
    if (!status) return;
    s.reliefs.push({
      id: TT.uid('rl'), key: need.key, date: need.date, absentTeacherId: need.absentTeacherId, unitId: need.unitId,
      lessonId: need.lessonId, classIds: need.classIds, subjectId: need.subjectId, periods: need.periods.slice(),
      status, reliefTeacherId: status === 'assigned' ? teacherId : null, note: note || ''
    });
  };

  // padam rekod relief yang tidak lagi sepadan dengan keperluan (cth selepas padam ketidakhadiran)
  TT.reliefSync = (s, iso) => {
    const keys = new Set(TT.reliefNeeds(s, iso).map((n) => n.key + '#' + n.periods.join()));
    s.reliefs = s.reliefs.filter((r) => r.date !== iso || keys.has(r.key + '#' + r.periods.join()));
  };

  const monthOf = (iso) => iso.slice(0, 7);

  TT.reliefCandidates = (s, need, opts) => {
    opts = opts || {};
    const cfg = s.settings.relief, iso = need.date, day = need.day;
    const grid = opts.grid || TT.teacherGrid(s);
    const lessons = new Map(s.lessons.map((l) => [l.id, l]));
    const load = TT.teacherLoad(s);
    const absent = s.teachers.find((t) => t.id === need.absentTeacherId);
    const needP = new Set(need.periods);
    const others = s.reliefs.filter((r) => r.date === iso && r.key !== need.key && r.status === 'assigned');
    const past = s.reliefs.filter((r) => r.status === 'assigned' && r.date !== iso);
    const teachesClass = new Set();
    for (const l of s.lessons) for (const t of l.teacherIds) if (l.classIds.some((c) => need.classIds.includes(c))) teachesClass.add(t);
    const homerooms = new Set(s.classes.filter((c) => need.classIds.includes(c.id)).map((c) => c.homeroomId));
    const cands = [];
    for (const t of s.teachers) {
      if (t.id === need.absentTeacherId || t.noRelief) continue;
      let ok = true;
      for (const p of need.periods) {
        if (grid.get(t.id)[day][p]) { ok = false; break; }
        if (TT.absentAt(s, iso, t.id, p)) { ok = false; break; }
        if (cfg.respectUnavailable && t.unavailable[`${day}-${p}`]) { ok = false; break; }
        if (others.some((r) => r.reliefTeacherId === t.id && r.periods.includes(p))) { ok = false; break; }
      }
      if (!ok) continue;
      const today = others.filter((r) => r.reliefTeacherId === t.id).reduce((a, r) => a + r.periods.length, 0);
      if (cfg.maxPerDay > 0 && today + need.periods.length > cfg.maxPerDay) continue;
      const mine = past.filter((r) => r.reliefTeacherId === t.id);
      const month = mine.filter((r) => monthOf(r.date) === monthOf(iso)).reduce((a, r) => a + r.periods.length, 0);
      const total = mine.reduce((a, r) => a + r.periods.length, 0);
      const parts = []; let score = 0;
      const add = (label, v) => { if (v) { score += v; parts.push({ label, v }); } };
      if (t.subjectIds.includes(need.subjectId)) add('Subjek sama', cfg.wSubject);
      if (absent && t.dept && t.dept === absent.dept) add('Panitia sama', cfg.wDept);
      if (teachesClass.has(t.id)) add('Mengajar kelas ini', cfg.wKnows);
      if (homerooms.has(t.id)) add('Guru kelas', cfg.wHome);
      const adj = others.some((r) => r.reliefTeacherId === t.id && r.classIds.some((c) => need.classIds.includes(c)) &&
        r.periods.some((p) => p === need.periods[0] - 1 || p === need.periods[need.periods.length - 1] + 1));
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
    const grid = TT.teacherGrid(s);
    let assigned = 0; const none = [];
    const left = needs.slice();
    while (left.length) {
      const scored = left.map((n) => ({ n, c: TT.reliefCandidates(s, n, { grid }) }));
      scored.sort((a, b) => a.c.length - b.c.length || a.n.periods[0] - b.n.periods[0]);
      const { n, c } = scored[0];
      left.splice(left.indexOf(n), 1);
      if (c.length) { TT.setRelief(s, n, 'assigned', c[0].teacher.id); assigned++; } else none.push(n);
    }
    return { assigned, unresolved: none };
  };

  TT.clearRelief = (s, iso) => { s.reliefs = s.reliefs.filter((r) => r.date !== iso); };

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
    const list = [...rows.values()].filter((r) => !r.teacher.noRelief);
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
      const p0 = n.periods[0], p1 = n.periods[n.periods.length - 1];
      const when = p0 === p1 ? `W${p0 + 1}` : `W${p0 + 1}-${p1 + 1}`;
      const time = `${slots[p0].start}-${slots[p1].end}`;
      const sub = (m.subject.get(n.subjectId) || {}).short || '';
      const at = m.teacher.get(n.absentTeacherId);
      const base = `${when} (${time}) ${TT.classNames(s, n.classIds)} ${sub}, ganti ${at ? at.name : '?'}`;
      if (rec && rec.status === 'assigned') ass.push({ p0, line: `${base} → *${(m.teacher.get(rec.reliefTeacherId) || {}).name}*` });
      else rest.push(`${base} → ${rec ? (rec.status === 'kendiri' ? 'kelas kendiri' : 'gabung kelas') : '*BELUM ADA GURU GANTI*'}`);
    }
    if (ass.length) { L.push('*Guru ganti:*'); ass.sort((a, b) => a.p0 - b.p0).forEach((x) => L.push('- ' + x.line)); L.push(''); }
    if (rest.length) { L.push('*Perlu perhatian:*'); rest.forEach((x) => L.push('- ' + x)); L.push(''); }
    if (!needs.length) L.push('Tiada relief diperlukan.');
    L.push('Sila rujuk slip relief. Terima kasih.');
    return L.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
