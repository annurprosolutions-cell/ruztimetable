(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // sekolah menengah contoh: 3 tingkatan x 3 kelas, 18 guru
  TT.sample = () => {
    const s = TT.newState();
    s.school.name = 'SMK Contoh Jaya';
    const sub = {};
    [
      ['bm', 'Bahasa Melayu', 'BM', '#e11d48', 1], ['bi', 'Bahasa Inggeris', 'BI', '#2563eb', 1],
      ['mt', 'Matematik', 'MT', '#7c3aed', 1], ['sn', 'Sains', 'SN', '#059669', 1],
      ['sj', 'Sejarah', 'SJ', '#b45309', 0], ['ge', 'Geografi', 'GE', '#0d9488', 0],
      ['pm', 'Pendidikan Islam / Moral', 'PI/PM', '#ca8a04', 0], ['pj', 'Pendidikan Jasmani & Kesihatan', 'PJK', '#ea580c', 0],
      ['sv', 'Pendidikan Seni Visual', 'PSV', '#db2777', 0], ['rb', 'Reka Bentuk & Teknologi', 'RBT', '#4b5563', 0]
    ].forEach(([k, name, short, color, heavy]) => {
      sub[k] = { id: TT.uid('s'), name, short, color, heavy: !!heavy }; s.subjects.push(sub[k]);
    });

    const tch = {};
    [
      ['amy', 'Aminah Yusof', 'AMY', 'Bahasa', ['bm']], ['rnh', 'Rosnani Hashim', 'RNH', 'Bahasa', ['bm']],
      ['fri', 'Faridah Ismail', 'FRI', 'Bahasa', ['bi']], ['jlm', 'Jason Lim', 'JLM', 'Bahasa', ['bi']],
      ['kmr', 'Kumaresan Raju', 'KMR', 'Matematik', ['mt']], ['nhz', 'Nurul Huda Zainal', 'NHZ', 'Matematik', ['mt']],
      ['zka', 'Zulkifli Abdullah', 'ZKA', 'Sains', ['sn']], ['lml', 'Lee Mei Ling', 'LML', 'Sains', ['sn']],
      ['asq', 'Ahmad Syafiq', 'ASQ', 'Kemanusiaan', ['sj', 'ge']], ['shj', 'Siti Hajar', 'SHJ', 'Kemanusiaan', ['sj', 'ge']],
      ['twj', 'Tan Wei Jie', 'TWJ', 'Kemanusiaan', ['sj', 'ge']],
      ['uhf', 'Ustaz Hafiz', 'UHF', 'Pend. Islam & Moral', ['pm']], ['usm', 'Ustazah Salmah', 'USM', 'Pend. Islam & Moral', ['pm']],
      ['pnr', 'Priya Nair', 'PNR', 'Pend. Islam & Moral', ['pm']],
      ['kha', 'Khairul Anuar', 'KHA', 'Sukan', ['pj']], ['mrz', 'Mohd Razif', 'MRZ', 'Sukan', ['pj']],
      ['nal', 'Nor Azlina', 'NAL', 'Kemahiran', ['sv']], ['hnm', 'Hasnah Mohd', 'HNM', 'Kemahiran', ['rb']]
    ].forEach(([k, name, short, dept, subs]) => {
      tch[k] = { id: TT.uid('t'), name, short, dept, subjectIds: subs.map((x) => sub[x].id), maxPerDay: 7, maxPerWeek: 36, unavailable: {}, noRelief: false };
      s.teachers.push(tch[k]);
    });
    tch.kmr.unavailable['0-0'] = true;   // Isnin waktu 1
    tch.jlm.unavailable['2-0'] = true;   // Rabu waktu 1
    tch.mrz.unavailable['4-4'] = true;   // Jumaat waktu 5

    const room = {};
    [['mk1', 'Makmal Sains 1', 'Makmal'], ['mk2', 'Makmal Sains 2', 'Makmal'], ['rbt', 'Bengkel RBT', 'Bengkel'], ['art', 'Bilik Seni', 'Bilik khas']]
      .forEach(([k, name, type]) => { room[k] = { id: TT.uid('r'), name, type }; s.rooms.push(room[k]); });

    const classes = [];
    [1, 2, 3].forEach((lv) => ['Amanah', 'Bestari', 'Cekap'].forEach((n) => {
      const c = { id: TT.uid('c'), name: `${lv} ${n}`, level: lv, homeroomId: null }; classes.push(c); s.classes.push(c);
    }));
    classes.forEach((c, i) => { c.homeroomId = s.teachers[i].id; });

    const load = {};
    const lesson = (cls, subj, teachers, perWeek, doubles, roomId) => {
      s.lessons.push({ id: TT.uid('l'), classIds: cls.map((c) => c.id), subjectId: sub[subj].id, teacherIds: teachers.map((t) => tch[t].id), perWeek, doubles, roomId: roomId || null });
      teachers.forEach((t) => { load[t] = (load[t] || 0) + perWeek; });
    };
    const least = (keys) => keys.slice().sort((a, b) => (load[a] || 0) - (load[b] || 0))[0];
    const plan = [
      ['bm', 5, 1, ['amy', 'rnh']], ['bi', 5, 1, ['fri', 'jlm']], ['mt', 5, 1, ['kmr', 'nhz']], ['sn', 5, 1, ['zka', 'lml']],
      ['sj', 3, 0, ['asq', 'shj', 'twj']], ['ge', 3, 0, ['asq', 'shj', 'twj']], ['pj', 3, 1, ['kha', 'mrz']],
      ['sv', 2, 1, ['nal']], ['rb', 2, 1, ['hnm']]
    ];
    classes.forEach((c) => plan.forEach(([subj, n, dbl, pool]) => {
      const roomId = subj === 'sn' ? (c.level === 1 ? room.mk1.id : room.mk2.id) : subj === 'rb' ? room.rbt.id : subj === 'sv' ? room.art.id : null;
      lesson([c], subj, [least(pool)], n, dbl, roomId);
    }));
    // Pendidikan Islam / Moral: satu tingkatan serentak, setiap kumpulan ada gurunya sendiri
    [1, 2, 3].forEach((lv) => lesson(classes.filter((c) => c.level === lv), 'pm', ['uhf', 'usm', 'pnr'], 4, 1));
    return s;
  };

  // data demo: SMK contoh, jadual sudah dijana dan dua guru tidak hadir pada hari persekolahan seterusnya (relief sudah diagih)
  TT.demoSample = (today, opts) => {
    const s = TT.sample();
    s.placements = TT.generate(s, { seed: 2, improveMs: opts && opts.improveMs != null ? opts.improveMs : 600 }).placements;
    const day = TT.nextSchoolDay(s, today);
    [[3, 'MC'], [7, 'Kursus']].forEach(([i, reason], k) => {
      if (s.teachers[i]) s.absences.push({ id: 'demo-ab' + k, date: day, teacherId: s.teachers[i].id, from: null, to: null, reason, note: '' });
    });
    TT.autoRelief(s, day);
    return s;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
