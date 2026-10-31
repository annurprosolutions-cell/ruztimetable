(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Arkib dan bersih sejarah: rekod tidak hadir dan relief sebelum satu tarikh dipindah ke fail/Sheet
  // berasingan, kemudian dibuang daripada data aktif. Data aktif kekal kecil supaya simpanan pelayar
  // dan penyegerakan Google Sheets tidak menjadi perlahan untuk sekolah besar.

  TT.ARCHIVE_MONTHS = 12;

  TT.historyRange = (s) => {
    const dates = s.absences.map((a) => a.date).concat(s.reliefs.map((r) => r.date)).filter(Boolean).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1], count: s.absences.length + s.reliefs.length } : null;
  };

  const monthsBack = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1 - n, d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  // arkib disyorkan bila rekod tertua lebih 12 bulan
  TT.archiveDue = (s, today) => { const r = TT.historyRange(s); return !!r && r.from < monthsBack(today, TT.ARCHIVE_MONTHS); };
  // tarikh potong cadangan: 1 Januari tahun semasa jika ada rekod tahun lepas, jika tidak 12 bulan lalu
  TT.archiveSuggest = (s, today) => {
    const r = TT.historyRange(s), jan = today.slice(0, 4) + '-01-01';
    return r && r.from < jan ? jan : monthsBack(today, TT.ARCHIVE_MONTHS);
  };

  // rekod sebelum `before` (tidak termasuk tarikh itu)
  TT.archivePick = (s, before) => ({
    absences: s.absences.filter((a) => a.date < before),
    reliefs: s.reliefs.filter((r) => r.date < before)
  });

  // tab untuk fail/Sheet arkib: Ringkasan (jumlah setiap guru), TidakHadir, Relief (format sama dengan Sheet utama)
  TT.archiveTabs = (s, picked, before) => {
    const m = TT.maps(s), tname = (id) => (m.teacher.get(id) || {}).name || '';
    const dates = picked.absences.map((a) => a.date).concat(picked.reliefs.map((r) => r.date)).sort();
    const per = new Map();
    const row = (id) => { if (!per.has(id)) per.set(id, { relief: 0, sesi: 0, tidakHadir: 0 }); return per.get(id); };
    picked.reliefs.forEach((r) => { if (r.status === 'assigned' && r.reliefTeacherId) { const x = row(r.reliefTeacherId); x.relief += r.periods.length; x.sesi++; } });
    picked.absences.forEach((a) => { row(a.teacherId).tidakHadir++; });
    const sum = [['Arkib sejarah relief', s.school.name], ['Tempoh', dates.length ? `${TT.fmtDate(dates[0])} hingga ${TT.fmtDate(dates[dates.length - 1])}` : '-'],
      ['Rekod sebelum', TT.fmtDate(before)], ['Tidak hadir', picked.absences.length], ['Relief', picked.reliefs.length], [],
      ['Guru', 'Relief (waktu)', 'Sesi relief', 'Hari tidak hadir']]
      .concat([...per].map(([id, x]) => [tname(id) || id, x.relief, x.sesi, x.tidakHadir]).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
    return {
      Ringkasan: sum,
      TidakHadir: [TT.ABSENCE_HEAD].concat(picked.absences.map((a) => TT.absenceRow(s, a, tname))),
      Relief: [TT.RELIEF_HEAD].concat(picked.reliefs.map((r) => TT.reliefRow(s, r, tname)))
    };
  };

  TT.archiveRemove = (s, before) => {
    const n = { absences: s.absences.filter((a) => a.date < before).length, reliefs: s.reliefs.filter((r) => r.date < before).length };
    s.absences = s.absences.filter((a) => a.date >= before);
    s.reliefs = s.reliefs.filter((r) => r.date >= before);
    return n;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
