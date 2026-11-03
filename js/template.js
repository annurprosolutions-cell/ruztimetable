(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Templat Excel untuk import: tab Guru, Subjek, Kelas, Bilik dan Pelajaran dengan tajuk tetap.
  // Pelajaran merujuk nama (atau kod) daripada tab lain. Baris yang bermula "(contoh)" diabaikan.
  // Fail yang sama boleh dijana daripada data semasa (eksport) supaya boleh disunting dan diimport semula.

  const SAMPLE = '(contoh) ';
  const HEAD = {
    guru: ['Nama Guru', 'Kod', 'Panitia', 'Jawatan', 'Had Waktu Sehari', 'Had Waktu Seminggu'],
    subjek: ['Nama Subjek', 'Kod', 'Subjek Berat'],
    kelas: ['Nama Kelas', 'Tahun / Tingkatan', 'Guru Kelas'],
    bilik: ['Nama Bilik', 'Jenis'],
    pelajaran: ['Kelas', 'Subjek', 'Guru', 'Waktu Seminggu', 'Waktu Berganda', 'Bilik']
  };
  const TAB = { guru: 'Guru', subjek: 'Subjek', kelas: 'Kelas', bilik: 'Bilik', pelajaran: 'Pelajaran' };
  const SHEET_RX = { guru: /^guru$|^teachers?$/, subjek: /^subjek$|^mata ?pelajaran$|^subjects?$/, kelas: /^kelas$|^classes$/, bilik: /^bilik$|^rooms?$/, pelajaran: /^pelajaran$|^lessons?$|^agihan/ };
  // lajur dikenal ikut corak supaya perbezaan tajuk kecil tidak menyebabkan ralat
  const COLS = {
    guru: { name: /^(nama )?guru$|^nama$/, code: /^kod/, dept: /^(panitia|jabatan|unit)/, role: /^jawatan/, maxDay: /sehari|harian/, maxWeek: /seminggu|mingguan/ },
    subjek: { name: /^(nama )?subjek$|^mata ?pelajaran$|^nama$/, code: /^kod/, heavy: /berat/ },
    kelas: { name: /^(nama )?kelas$|^nama$/, level: /tahun|tingkatan|level/, homeroom: /guru kelas/ },
    bilik: { name: /^(nama )?bilik$|^nama$/, type: /^jenis/ },
    pelajaran: { cls: /^kelas$/, sub: /^(subjek|mata ?pelajaran)$/, teacher: /^guru$/, perWeek: /seminggu/, doubles: /berganda/, room: /^bilik$/ }
  };

  const low = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const txt = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const key = (v) => low(v).replace(/\s+/g, ''); // "1 Amanah" = "1amanah"
  const isSample = (row) => row.some((c) => low(c).startsWith('(contoh)'));
  const yes = (v) => /^(ya|yes|y|true|1|x|\/)$/i.test(txt(v));
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.').trim()); return String(v == null ? '' : v).trim() === '' ? null : n; };
  const splitMany = (v) => txt(v).split(/\s*[;+]\s*|\s+\/\s+/).map(txt).filter(Boolean);

  // cari tab dan baris tajuk bagi satu jenis; pulangkan { rows, head, cols } atau null
  function locate(sheets, kind) {
    for (const sh of sheets || []) {
      if (!SHEET_RX[kind].test(low(sh.name))) continue;
      const rows = (sh.rows || []).map((r) => (r || []).map((c) => (c == null ? '' : c)));
      for (let i = 0; i < Math.min(8, rows.length); i++) {
        const cols = {}; let ok = true;
        for (const [f, rx] of Object.entries(COLS[kind])) cols[f] = rows[i].findIndex((c) => rx.test(low(c)));
        const need = kind === 'pelajaran' ? ['cls', 'sub', 'teacher', 'perWeek'] : ['name'];
        need.forEach((f) => { if (cols[f] < 0) ok = false; });
        if (ok) return { rows: rows.slice(i + 1), headRow: i + 1, cols, name: sh.name };
      }
    }
    return null;
  }

  /**
   * Baca templat. s = data semasa (untuk merujuk nama yang sudah wujud semasa import "tambah").
   * Pulangkan { isTemplate, classes, subjects, teachers, rooms, lessons, errors, warnings, skipped }.
   * Setiap ralat/amaran: { sheet, row, msg } dengan nombor baris seperti dalam Excel.
   */
  TT.parseTemplate = (sheets, s) => {
    const out = { isTemplate: false, classes: [], subjects: [], teachers: [], rooms: [], lessons: [], errors: [], warnings: [], skipped: [] };
    const found = {};
    for (const k of Object.keys(HEAD)) found[k] = locate(sheets, k);
    out.isTemplate = !!found.pelajaran || (sheets || []).some((x) => /^arahan$/.test(low(x.name)));
    if (!out.isTemplate) return out;
    const err = (sheet, row, msg) => out.errors.push({ sheet, row, msg });
    const warn = (sheet, row, msg) => out.warnings.push({ sheet, row, msg });
    const cell = (r, c) => (c >= 0 ? r[c] : '');
    const body = (kind, fn) => {
      const f = found[kind]; if (!f) return;
      f.rows.forEach((r, i) => { if (!r.some((c) => txt(c)) || isSample(r)) return; fn(r, f.headRow + i + 1, f.cols); });
    };
    const dupe = (arr, name) => arr.some((x) => low(x.name) === low(name));
    const intIn = (sheet, row, label, v, min, max) => {
      const n = num(v); if (n == null) return null;
      if (!Number.isInteger(n) || n < min || n > max) { warn(sheet, row, `${label} "${txt(v)}" tidak sah (nombor ${min} hingga ${max}), diabaikan`); return null; }
      return n;
    };

    body('guru', (r, row, c) => {
      const name = txt(cell(r, c.name)); if (!name) { err(TAB.guru, row, 'Nama guru kosong'); return; }
      if (dupe(out.teachers, name)) { warn(TAB.guru, row, `"${name}" bertindih dalam fail, baris ini diabaikan`); return; }
      out.teachers.push({ name, code: txt(cell(r, c.code)), dept: txt(cell(r, c.dept)), role: txt(cell(r, c.role)),
        maxPerDay: intIn(TAB.guru, row, 'Had waktu sehari', cell(r, c.maxDay), 1, 12), maxPerWeek: intIn(TAB.guru, row, 'Had waktu seminggu', cell(r, c.maxWeek), 1, 80), row });
    });
    body('subjek', (r, row, c) => {
      const name = txt(cell(r, c.name)); if (!name) { err(TAB.subjek, row, 'Nama subjek kosong'); return; }
      if (dupe(out.subjects, name)) { warn(TAB.subjek, row, `"${name}" bertindih dalam fail, baris ini diabaikan`); return; }
      out.subjects.push({ name, code: txt(cell(r, c.code)), heavy: yes(cell(r, c.heavy)), row });
    });
    body('kelas', (r, row, c) => {
      const name = txt(cell(r, c.name)); if (!name) { err(TAB.kelas, row, 'Nama kelas kosong'); return; }
      if (dupe(out.classes, name)) { warn(TAB.kelas, row, `"${name}" bertindih dalam fail, baris ini diabaikan`); return; }
      const lv = txt(cell(r, c.level)), m = /^(?:tingkatan|ting\.?|tahun|thn|t|year|form)?\s*(\d{1,2})\b/i.exec(name);
      out.classes.push({ name, level: lv.replace(/^(?:tingkatan|tahun)\s*/i, '') || (m ? m[1] : ''), homeroom: txt(cell(r, c.homeroom)), row });
    });
    body('bilik', (r, row, c) => {
      const name = txt(cell(r, c.name)); if (!name) { err(TAB.bilik, row, 'Nama bilik kosong'); return; }
      if (dupe(out.rooms, name)) { warn(TAB.bilik, row, `"${name}" bertindih dalam fail, baris ini diabaikan`); return; }
      out.rooms.push({ name, type: txt(cell(r, c.type)), row });
    });

    // rujukan nama/kod: senarai dalam fail dan data sedia ada
    const exist = s || { teachers: [], subjects: [], classes: [], rooms: [] };
    const idx = (inFile, have, codeOf) => {
      const m = new Map();
      [...inFile.map((x) => ({ name: x.name, code: x.code })), ...have.map((x) => ({ name: x.name, code: codeOf(x) }))].forEach((x) => {
        m.set(key(x.name), x.name); if (x.code) m.set('~' + key(x.code), x.name);
      });
      return m;
    };
    const T = idx(out.teachers, exist.teachers, (x) => x.short), S = idx(out.subjects, exist.subjects, (x) => x.short);
    const C = idx(out.classes, exist.classes, () => ''), R = idx(out.rooms, exist.rooms, () => '');
    const pick = (m, v) => m.get(key(v)) || m.get('~' + key(v)) || null;

    // guru kelas merujuk guru (amaran jika tidak dijumpai)
    out.classes.forEach((c) => { if (c.homeroom && !pick(T, c.homeroom)) { warn(TAB.kelas, c.row, `Guru kelas "${c.homeroom}" tiada dalam senarai Guru, diabaikan`); c.homeroom = ''; } });

    const seen = new Set();
    body('pelajaran', (r, row, c) => {
      const L = TAB.pelajaran, bad = [];
      const classes = splitMany(cell(r, c.cls)), subj = txt(cell(r, c.sub)), teachers = splitMany(cell(r, c.teacher));
      if (!classes.length) bad.push('Kelas kosong');
      if (!subj) bad.push('Subjek kosong');
      if (!teachers.length) bad.push('Guru kosong');
      const cn = classes.map((x) => pick(C, x) || (bad.push(`Kelas "${x}" tiada dalam senarai Kelas`), null));
      const sn = subj ? pick(S, subj) || (bad.push(`Subjek "${subj}" tiada dalam senarai Subjek`), null) : null;
      const tn = teachers.map((x) => pick(T, x) || (bad.push(`Guru "${x}" tiada dalam senarai Guru`), null));
      const pw = num(cell(r, c.perWeek));
      if (pw == null) bad.push('Waktu seminggu kosong');
      else if (!Number.isInteger(pw) || pw < 1 || pw > 20) bad.push(`Waktu seminggu "${txt(cell(r, c.perWeek))}" tidak sah (nombor 1 hingga 20)`);
      let dbl = 0; const dv = num(cell(r, c.doubles));
      if (dv != null) { if (!Number.isInteger(dv) || dv < 0 || dv > 10) bad.push(`Waktu berganda "${txt(cell(r, c.doubles))}" tidak sah (nombor 0 hingga 10)`); else dbl = dv; }
      if (pw != null && Number.isInteger(pw) && dbl * 2 > pw) bad.push('Pasang waktu berganda terlalu banyak untuk bilangan waktu seminggu');
      let room = '';
      if (c.room >= 0 && txt(r[c.room])) { room = pick(R, r[c.room]) || ''; if (!room) warn(L, row, `Bilik "${txt(r[c.room])}" tiada dalam senarai Bilik, diabaikan`); }
      if (bad.length) { bad.forEach((m) => err(L, row, m)); return; }
      const k = [[...cn].map(key).sort().join('|'), key(sn), [...tn].map(key).sort().join('|')].join('#');
      if (seen.has(k)) { warn(L, row, 'Pelajaran yang sama sudah ada dalam fail, baris ini diabaikan'); return; }
      seen.add(k);
      out.lessons.push({ classes: cn, subject: sn, teachers: tn, perWeek: pw, doubles: dbl, room, row });
    });

    // tab penting yang tiada langsung
    ['guru', 'kelas', 'subjek'].forEach((k) => { if (!found[k] && !exist[{ guru: 'teachers', kelas: 'classes', subjek: 'subjects' }[k]].length) warn(TAB[k], 0, `Tab "${TAB[k]}" tidak dijumpai`); });
    if (!found.pelajaran) warn(TAB.pelajaran, 0, 'Tab "Pelajaran" tidak dijumpai, hanya senarai diimport');
    return out;
  };

  // gunakan pelajaran daripada parseTemplate ke dalam data s. Pulangkan { added, updated, skipped }.
  TT.applyLessons = (s, lessons, uid) => {
    uid = uid || TT.uid;
    const res = { added: 0, updated: 0, skipped: 0 };
    const idOf = (arr, name, alt) => { const k = key(name); const x = arr.find((y) => key(y.name) === k) || (alt ? arr.find((y) => alt(y) && key(alt(y)) === k) : null); return x ? x.id : null; };
    for (const l of lessons || []) {
      const classIds = l.classes.map((n) => idOf(s.classes, n)), teacherIds = l.teachers.map((n) => idOf(s.teachers, n, (t) => t.short));
      const subjectId = idOf(s.subjects, l.subject, (x) => x.short);
      if (classIds.includes(null) || teacherIds.includes(null) || !subjectId) { res.skipped++; continue; }
      const roomId = l.room ? idOf(s.rooms, l.room) : null;
      const k = [[...classIds].sort().join('|'), subjectId, [...teacherIds].sort().join('|')].join('#');
      const ex = s.lessons.find((x) => [[...x.classIds].sort().join('|'), x.subjectId, [...x.teacherIds].sort().join('|')].join('#') === k);
      if (ex) { ex.perWeek = l.perWeek; ex.doubles = l.doubles; ex.roomId = roomId; res.updated++; continue; }
      s.lessons.push({ id: uid('l'), classIds, subjectId, teacherIds, perWeek: l.perWeek, doubles: l.doubles, roomId });
      res.added++;
    }
    return res;
  };

  /**
   * Jana helaian templat. withData=false: baris contoh. withData=true: data semasa sekolah.
   * Pulangkan tatasusunan helaian untuk TT.xlsxWrite.
   */
  TT.templateSheets = (s, withData) => {
    const sheet = (name, rows, widths) => ({ name, rows, widths, bold: [0] });
    const cn = (id) => (s && s.classes.find((x) => x.id === id) || {}).name || '';
    const sn = (id) => (s && s.subjects.find((x) => x.id === id) || {}).name || '';
    const tn = (id) => (s && s.teachers.find((x) => x.id === id) || {}).name || '';
    const rn = (id) => (s && s.rooms.find((x) => x.id === id) || {}).name || '';
    const guide = [
      ['Templat import Annur Time Table'], [''],
      ['Cara guna'],
      ['1. Isi tab Guru, Subjek, Kelas dan Bilik dahulu, kemudian tab Pelajaran. Tab Bilik boleh dikosongkan jika tiada bilik khas.'],
      ['2. Jangan ubah nama tab atau baris tajuk (baris pertama setiap tab). Lajur boleh diisi mengikut keperluan; hanya nama yang wajib.'],
      ['3. Baris yang bermula dengan "(contoh)" diabaikan semasa import. Padam atau ganti dengan data sekolah anda.'],
      ['4. Tab Pelajaran: tulis nama (atau kod) guru, subjek dan kelas seperti dalam tab lain. Ejaan dan huruf besar kecil tidak dipentingkan.'],
      ['5. Banyak kelas atau banyak guru dalam satu sel (kelas gabungan, atau guru yang mengajar serentak): pisahkan dengan ;  Contoh: 1 Amanah; 1 Bestari'],
      ['6. Waktu Berganda = bilangan pasang waktu berturut-turut. Contoh: Pendidikan Seni 2 waktu seminggu, berganda 1.'],
      ['7. Subjek Berat: tulis YA atau biarkan kosong. Had waktu: nombor sahaja.'],
      ['8. Di app: Data, Import dari aSc / Excel, pilih fail ini. Sistem tunjuk pratonton dan senarai ralat (dengan nombor baris) sebelum apa-apa disimpan.'],
      [''], ['Data sekolah anda tidak dihantar ke mana-mana pelayan; fail dibaca dalam pelayar.']
    ];
    const ex = (v) => SAMPLE + v;
    const sheets = [{ name: 'Arahan', rows: guide, widths: [120], bold: [0, 2] }];
    if (withData && s) {
      sheets.push(sheet(TAB.guru, [HEAD.guru].concat(s.teachers.map((t) => [t.name, t.short, t.dept || '', t.role || '', t.maxPerDay, t.maxPerWeek])), [34, 8, 18, 14, 18, 20]));
      sheets.push(sheet(TAB.subjek, [HEAD.subjek].concat(s.subjects.map((x) => [x.name, x.short, x.heavy ? 'YA' : ''])), [34, 8, 14]));
      sheets.push(sheet(TAB.kelas, [HEAD.kelas].concat(s.classes.map((c) => [c.name, c.level || '', tn(c.homeroomId)])), [24, 18, 34]));
      sheets.push(sheet(TAB.bilik, [HEAD.bilik].concat(s.rooms.map((r) => [r.name, r.type || ''])), [28, 16]));
      sheets.push(sheet(TAB.pelajaran, [HEAD.pelajaran].concat(s.lessons.map((l) => [l.classIds.map(cn).join('; '), sn(l.subjectId), l.teacherIds.map(tn).join('; '), l.perWeek, l.doubles || 0, rn(l.roomId)])), [26, 28, 34, 16, 16, 20]));
    } else {
      sheets.push(sheet(TAB.guru, [HEAD.guru, [ex('Aminah binti Ali'), 'AMA', 'Sains', '', 7, 36], [ex('Kumar a/l Rajan'), 'KUM', 'Matematik', 'Penolong Kanan', 7, 36], [ex('Lim Mei Ling'), 'LML', 'Bahasa', '', 7, 36]], [34, 8, 18, 14, 18, 20]));
      sheets.push(sheet(TAB.subjek, [HEAD.subjek, [ex('Matematik'), 'MT', ''], [ex('Bahasa Melayu'), 'BM', ''], [ex('Pendidikan Jasmani'), 'PJ', 'YA']], [34, 8, 14]));
      sheets.push(sheet(TAB.kelas, [HEAD.kelas, [ex('1 Amanah'), '1', ex('Aminah binti Ali')], [ex('1 Bestari'), '1', ''], [ex('2 Amanah'), '2', '']], [24, 18, 34]));
      sheets.push(sheet(TAB.bilik, [HEAD.bilik, [ex('Makmal Sains'), 'Makmal'], [ex('Bilik Komputer'), 'Makmal']], [28, 16]));
      sheets.push(sheet(TAB.pelajaran, [HEAD.pelajaran, [ex('1 Amanah'), 'Matematik', 'Kumar a/l Rajan', 5, 0, ''], [ex('1 Amanah; 1 Bestari'), 'Pendidikan Jasmani', 'Lim Mei Ling', 2, 1, ''], [ex('2 Amanah'), 'Bahasa Melayu', 'AMA', 6, 1, '']], [26, 28, 34, 16, 16, 20]));
    }
    return sheets;
  };

  TT.TEMPLATE_HEAD = HEAD;
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
