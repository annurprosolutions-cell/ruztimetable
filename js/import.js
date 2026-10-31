(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Import senarai daripada eksport aSc (atau mana-mana Excel/CSV yang ada lajur nama dan kod).
  // Eksport aSc biasa: tab "Kelas", "Subjek", "Guru", "Bilik", setiap satu ada lajur nama + KOD.
  // Fail sebegini tidak mengandungi pelajaran (siapa ajar apa) atau jadual; itu diisi selepas import.

  const low = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const KINDS = {
    classes: { sheet: /kelas|class/, head: [/^(nama )?kelas$/, /^class( name)?$/] },
    subjects: { sheet: /subjek|mata ?pelajaran|subject/, head: [/^mata ?pelajaran$/, /^(nama )?subjek$/, /^subject( name)?$/] },
    teachers: { sheet: /guru|teacher|pengajar/, head: [/^(nama )?guru$/, /^teacher( name)?$/] },
    rooms: { sheet: /bilik|room|makmal|lab/, head: [/^(nama )?bilik$/, /^room( name)?$/, /^classroom$/] }
  };
  const CODE = [/^kod$/, /^code$/, /^short$/, /^singkatan$/, /^kod ringkas$/];
  const NAME = [/^nama$/, /^name$/];
  const LEVEL = [/^tingkatan$/, /^tahun$/, /^level$/, /^grade$/];

  const findCol = (row, pats) => row.findIndex((c) => pats.some((p) => p.test(low(c))));

  // { classes, subjects, teachers, rooms, skipped: [nama tab] }
  TT.importLists = (sheets) => {
    const out = { classes: [], subjects: [], teachers: [], rooms: [], skipped: [] };
    for (const sh of sheets || []) {
      const rows = (sh.rows || []).map((r) => (r || []).map((c) => (c == null ? '' : c)));
      let kind = null, hr = -1, nameCol = -1;
      // baris tajuk: cari dalam 8 baris pertama
      for (let i = 0; i < Math.min(8, rows.length) && hr < 0; i++) {
        for (const [k, def] of Object.entries(KINDS)) {
          const c = findCol(rows[i], def.head);
          if (c >= 0) { kind = k; hr = i; nameCol = c; break; }
        }
        if (hr < 0 && findCol(rows[i], NAME) >= 0) {
          const k = Object.keys(KINDS).find((x) => KINDS[x].sheet.test(low(sh.name)));
          if (k) { kind = k; hr = i; nameCol = findCol(rows[i], NAME); }
        }
      }
      if (!kind) { out.skipped.push(sh.name); continue; }
      const head = rows[hr], codeCol = findCol(head, CODE), levelCol = findCol(head, LEVEL);
      const seen = new Set(out[kind].map((x) => low(x.name)));
      for (const r of rows.slice(hr + 1)) {
        const name = String(r[nameCol] == null ? '' : r[nameCol]).replace(/\s+/g, ' ').trim();
        if (!name || /^\d+$/.test(name) || seen.has(low(name))) continue;
        seen.add(low(name));
        const item = { name, code: codeCol >= 0 ? String(r[codeCol] == null ? '' : r[codeCol]).trim() : '' };
        if (kind === 'classes') {
          const lv = levelCol >= 0 ? String(r[levelCol] == null ? '' : r[levelCol]).trim() : '';
          const m = /^(?:tingkatan|ting\.?|tahun|thn|t|year|form)?\s*(\d{1,2})\b/i.exec(name);
          item.level = lv || (m ? m[1] : '');
        }
        out[kind].push(item);
      }
    }
    return out;
  };

  const PAL = ['#e11d48', '#2563eb', '#7c3aed', '#059669', '#b45309', '#0d9488', '#ca8a04', '#ea580c', '#db2777', '#4b5563'];
  const initials = (name) => String(name).split(/\s+/).filter((w) => w && !/^(bin|binti|bt|b|a\/l|a\/p|@)$/i.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  // mode 'add': tambah yang belum wujud (nama sama diabaikan). mode 'replace': ganti senarai dan buang pelajaran/jadual lama.
  // kinds: senarai jenis yang dipilih pengguna. Pulangkan bilangan yang ditambah setiap jenis.
  TT.applyImport = (s, data, mode, kinds) => {
    kinds = kinds || ['classes', 'subjects', 'teachers', 'rooms'];
    const added = { classes: 0, subjects: 0, teachers: 0, rooms: 0 };
    if (mode === 'replace') {
      kinds.forEach((k) => { s[k] = []; });
      s.lessons = []; s.placements = []; s.absences = []; s.reliefs = [];
    }
    const has = (arr) => new Set(arr.map((x) => low(x.name)));
    if (kinds.includes('subjects')) {
      const h = has(s.subjects);
      data.subjects.forEach((x) => { if (h.has(low(x.name))) return; s.subjects.push({ id: TT.uid('s'), name: x.name, short: x.code || x.name.slice(0, 3).toUpperCase(), color: PAL[s.subjects.length % PAL.length], heavy: false }); added.subjects++; });
    }
    if (kinds.includes('teachers')) {
      const h = has(s.teachers);
      data.teachers.forEach((x) => { if (h.has(low(x.name))) return; s.teachers.push({ id: TT.uid('t'), name: x.name, short: x.code || initials(x.name), dept: '', role: '', subjectIds: [], maxPerDay: 7, maxPerWeek: 36, unavailable: {}, noRelief: false }); added.teachers++; });
    }
    if (kinds.includes('classes')) {
      const h = has(s.classes);
      data.classes.forEach((x) => { if (h.has(low(x.name))) return; s.classes.push({ id: TT.uid('c'), name: x.name, level: x.level || '', homeroomId: null, timeSet: '' }); added.classes++; });
    }
    if (kinds.includes('rooms')) {
      const h = has(s.rooms);
      data.rooms.forEach((x) => { if (h.has(low(x.name))) return; s.rooms.push({ id: TT.uid('r'), name: x.name, type: /makmal|lab/i.test(x.name) ? 'Makmal' : /bengkel/i.test(x.name) ? 'Bengkel' : '' }); added.rooms++; });
    }
    return added;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
