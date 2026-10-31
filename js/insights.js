(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  TT.WEEKDAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  TT.MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  TT.weekdayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return TT.WEEKDAYS[new Date(y, m - 1, d).getDay()]; };
  TT.monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${TT.MONTHS[m - 1]} ${y}`; };
  TT.shortDate = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${TT.MONTHS[m - 1].slice(0, 3)}`; };
  TT.addMonths = (ym, n) => {
    let [y, m] = ym.split('-').map(Number);
    m += n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  TT.periodLabel = (s, p0, p1, k) => {
    const sl = TT.slots(s, k);
    const a = sl[p0] ? sl[p0].label : p0 + 1, b = sl[p1] ? sl[p1].label : p1 + 1;
    return p0 === p1 ? `Waktu ${a}` : `Waktu ${a}-${b}`;
  };

  // minggu dalam sebulan; setiap baris = satu minggu, lajur = hari persekolahan, null = luar bulan
  TT.monthGrid = (s, ym) => {
    const n = TT.days(s).length, [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate();
    const weeks = new Map();
    for (let d = 1; d <= last; d++) {
      const iso = `${ym}-${String(d).padStart(2, '0')}`, c = TT.dateToDay(s, iso);
      if (c < 0) continue;
      const k = TT.addDays(iso, -c); // hari persekolahan berturutan, jadi tolak indeks = permulaan minggu
      if (!weeks.has(k)) weeks.set(k, new Array(n).fill(null));
      weeks.get(k)[c] = iso;
    }
    return [...weeks.values()];
  };

  TT.reliefSummary = (s, iso) => {
    const needs = TT.reliefNeeds(s, iso);
    let periods = 0, assigned = 0, other = 0, open = 0;
    for (const n of needs) {
      const r = TT.reliefRecord(s, n);
      periods += n.periods.length;
      if (!r) open += n.periods.length;
      else if (r.status === 'assigned') assigned += n.periods.length;
      else other += n.periods.length;
    }
    const absent = s.absences.filter((a) => a.date === iso);
    return { needs, periods, assigned, other, open, absent, status: !absent.length ? 'none' : open ? 'pending' : 'done' };
  };

  // waktu relief yang diagih setiap hari dalam bulan (semua guru, atau seorang guru)
  TT.monthReliefPeriods = (s, ym, teacherId) => {
    const out = new Map();
    for (const r of s.reliefs) {
      if (r.status !== 'assigned' || !r.date.startsWith(ym)) continue;
      if (teacherId && r.reliefTeacherId !== teacherId) continue;
      out.set(r.date, (out.get(r.date) || 0) + r.periods.length);
    }
    return out;
  };

  // apa yang guru buat pada satu tarikh: kelas sendiri + tugas relief
  // k = set waktu item itu (kelas Tahap 1 dan Tahap 2 boleh berlainan masa)
  TT.teacherDay = (s, tid, iso) => {
    const day = TT.dateToDay(s, iso); if (day < 0) return [];
    const m = TT.maps(s), tm = TT.timeModel(s), out = [];
    for (const pl of s.placements) {
      if (pl.day !== day) continue;
      const l = m.lesson.get(pl.lessonId);
      if (!l || !l.teacherIds.includes(tid)) continue;
      const k = TT.lessonSetIdx(s, l, m.cls);
      out.push({
        kind: 'kelas', k, p0: pl.start, p1: pl.start + pl.len - 1, lesson: l, subject: m.subject.get(l.subjectId),
        classes: TT.classNames(s, l.classIds), room: (m.room.get(l.roomId) || {}).name || '', absent: !!TT.absentAt(s, iso, tid, pl.start, k, tm)
      });
    }
    const valid = new Set(TT.reliefNeeds(s, iso).map((n) => TT.reliefRecord(s, n)).filter(Boolean));
    for (const r of valid) {
      if (r.status !== 'assigned' || r.reliefTeacherId !== tid) continue;
      const l = m.lesson.get(r.lessonId);
      out.push({
        kind: 'relief', k: TT.setOfClasses(s, r.classIds), p0: r.periods[0], p1: r.periods[r.periods.length - 1], lesson: l, subject: l && m.subject.get(l.subjectId),
        classes: TT.classNames(s, r.classIds), room: (l && (m.room.get(l.roomId) || {}).name) || '', forTeacher: m.teacher.get(r.absentTeacherId) || null
      });
    }
    out.forEach((x) => { const sl = tm.sets[x.k].slots; x.start = sl[x.p0] ? sl[x.p0].start : ''; x.end = sl[x.p1] ? sl[x.p1].end : ''; });
    out.sort((a, b) => (tm.multi ? a.start.localeCompare(b.start) : 0) || a.p0 - b.p0);
    return out;
  };

  const SEV = { kritikal: 0, 'hari-ini': 1, segera: 2, perhatian: 3, amaran: 4, info: 5 };
  TT.SEV_LABEL = { kritikal: 'Kritikal', 'hari-ini': 'Hari ini', segera: 'Segera', perhatian: 'Perhatian', amaran: 'Amaran', info: 'Makluman' };
  TT.URGENT = ['kritikal', 'hari-ini', 'segera'];
  // hari ini, atau hari persekolahan pertama selepasnya (cth Ahad -> Isnin), ialah yang paling mendesak
  const dueSev = (s, iso, d) => (d === iso ? 'hari-ini' : d === TT.nextSchoolDay(s, iso) ? 'segera' : 'perhatian');
  const bySev = (a, b) => SEV[a.sev] - SEV[b.sev];

  // senarai "Perlu tindakan" untuk pentadbir. env: { lastBackup, sheetLinked }
  TT.actionItems = (s, iso, env) => {
    env = env || {};
    const items = [];
    if (!s.teachers.length && !s.classes.length) {
      items.push({ sev: 'info', title: 'Belum ada data sekolah', when: 'Langkah pertama', btn: 'Muat contoh', go: { act: 'loadSample' } });
      return items;
    }
    const pre = TT.precheck(s).filter((e) => e.sev === 'error');
    pre.slice(0, 3).forEach((e) => items.push({ sev: 'kritikal', title: e.msg, when: 'Menghalang penjanaan', btn: 'Betulkan', go: { page: 'data' } }));
    if (pre.length > 3) items.push({ sev: 'kritikal', title: `${pre.length - 3} lagi masalah data`, when: 'Semakan data', btn: 'Lihat', go: { page: 'laporan' } });
    const errs = TT.validate(s).issues.filter((i) => i.sev === 'error').length;
    if (errs) items.push({ sev: 'kritikal', title: `${errs} konflik dalam jadual`, when: 'Jadual semasa', btn: 'Semak', go: { page: 'laporan' } });
    const total = TT.buildUnits(s).length, un = TT.unplaced(s).length;
    if (total && un === total) items.push({ sev: 'perhatian', title: 'Jadual belum dijana', when: `${total} waktu menunggu`, btn: 'Jana', go: { page: 'jadual' } });
    else if (un) items.push({ sev: 'perhatian', title: `${un} waktu belum diletak dalam jadual`, when: 'Jadual semasa', btn: 'Buka', go: { page: 'jadual' } });
    if (s.placements.length) {
      for (let i = 0; i < 7; i++) {
        const d = TT.addDays(iso, i);
        if (TT.dateToDay(s, d) < 0) continue;
        const r = TT.reliefSummary(s, d);
        if (!r.open) continue;
        items.push({
          sev: dueSev(s, iso, d),
          title: `${r.open} waktu relief ${i === 0 ? 'hari ini' : `${TT.weekdayOf(d)} ${TT.shortDate(d)}`} belum diagih`,
          when: `${r.absent.length} guru tidak hadir`, btn: 'Agih', go: { page: 'relief', date: d }
        });
      }
    }
    const load = TT.teacherLoad(s);
    const over = s.teachers.filter((t) => t.maxPerWeek && (load.get(t.id) || 0) > t.maxPerWeek);
    if (over.length) items.push({ sev: 'amaran', title: over.length === 1 ? `${over[0].name} melebihi had waktu seminggu` : `${over.length} guru melebihi had waktu seminggu`, when: 'Beban guru', btn: 'Lihat', go: { page: 'laporan' } });
    const noT = s.lessons.filter((l) => !l.teacherIds.length).length;
    if (noT) items.push({ sev: 'amaran', title: `${noT} pelajaran tiada guru`, when: 'Data pelajaran', btn: 'Betulkan', go: { page: 'data', tab: 'pelajaran' } });
    if (TT.archiveDue && TT.archiveDue(s, iso)) items.push({ sev: 'info', title: 'Sejarah relief melebihi 12 bulan', when: 'Arkib supaya app kekal laju', btn: 'Arkib', go: { act: 'archiveOpen' } });
    if (!env.sheetLinked) {
      const lb = env.lastBackup ? env.lastBackup.slice(0, 10) : null;
      const ago = lb ? Math.round((Date.parse(iso) - Date.parse(lb)) / 864e5) : null;
      if (lb == null || ago >= 7) {
        items.push({ sev: 'info', title: lb ? `Backup terakhir ${ago} hari lalu` : 'Data belum pernah dibackup', when: lb ? `Terakhir ${TT.fmtDate(lb)}` : 'Simpan salinan JSON', btn: 'Eksport', go: { act: 'exportJson' } });
      }
    }
    return items.sort(bySev);
  };

  // senarai "Perlu tindakan" untuk seorang guru dalam 7 hari akan datang
  TT.teacherActions = (s, tid, iso) => {
    const items = [];
    for (let i = 0; i < 7; i++) {
      const d = TT.addDays(iso, i);
      if (TT.dateToDay(s, d) < 0) continue;
      const when = d === iso ? 'Hari ini' : `${TT.weekdayOf(d)} ${TT.shortDate(d)}`;
      TT.teacherDay(s, tid, d).filter((x) => x.kind === 'relief').forEach((x) => items.push({
        sev: dueSev(s, iso, d),
        title: `Relief ${x.subject ? x.subject.short + ' ' : ''}${x.classes}, ${TT.periodLabel(s, x.p0, x.p1, x.k).toLowerCase()}`,
        when: `${when} · ${x.start}${x.forTeacher ? ' · ganti ' + x.forTeacher.name : ''}`, btn: 'Slip', go: { act: 'mySlip', date: d }
      }));
      const a = s.absences.find((y) => y.date === d && y.teacherId === tid);
      if (a) items.push({ sev: 'info', title: `Anda ditanda tidak hadir (${a.reason})`, when, btn: 'Lihat', go: { page: 'reliefku' } });
    }
    return items.sort(bySev);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
