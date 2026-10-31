(function () {
  'use strict';
  const { esc, actions, changes, pages } = UI;
  const S = () => UI.state;
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const PAL = ['#e11d48', '#2563eb', '#7c3aed', '#059669', '#b45309', '#0d9488', '#ca8a04', '#ea580c', '#db2777', '#4b5563'];
  const opts = (arr, f) => arr.map((x) => ({ v: x.id, t: f(x) }));
  const short3 = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  // ---------------- data sekolah: muat contoh, kosong, backup ----------------
  actions.loadSample = () => {
    const go = () => {
      UI.state = UI.carry(TT.sample()); UI.lastGen = null; UI.view = { type: 'class', id: null };
      UI.relief.date = TT.nextSchoolDay(UI.state, TT.todayISO());
      UI.save(); UI.page = 'utama'; UI.render(); UI.toast('Data contoh dimuatkan. Buka Jadual dan tekan Jana.');
    };
    if (S().teachers.length || S().classes.length) UI.confirm('Ini akan menggantikan semua data semasa dengan data contoh. Teruskan?', go, 'Ganti'); else go();
  };
  actions.newBlank = () => {
    const go = () => { UI.state = UI.carry(TT.newState()); UI.lastGen = null; UI.save(); UI.render(); };
    if (S().teachers.length || S().classes.length) UI.confirm('Semua data semasa akan dipadam. Teruskan?', go, 'Padam semua'); else go();
  };
  actions.exportJson = () => {
    UI.download(`jadual-${S().school.name.replace(/\W+/g, '-').toLowerCase()}-${TT.todayISO()}.json`, JSON.stringify(S(), null, 1), 'application/json');
    UI.prefs.lastBackup = new Date().toISOString(); UI.savePrefs(); UI.render();
  };
  actions.importJson = () => document.getElementById('importFile').click();
  changes.importFile = (el) => {
    const f = el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (!obj || !Array.isArray(obj.teachers) || !Array.isArray(obj.lessons)) throw new Error('format');
        UI.state = TT.migrate(obj); delete UI.state.auth; UI.state.school.guruSheet = ''; UI.state = UI.carry(UI.state); UI.commit(); UI.toast('Import berjaya.');
      } catch (e) { UI.toast('Fail JSON tidak sah atau bukan fail Jadual Sekolah.', 'err'); }
      el.value = '';
    };
    rd.readAsText(f);
  };

  // ---------------- import senarai daripada aSc (Excel / CSV) ----------------
  actions.ascImport = () => { const f = document.getElementById('ascFile'); f.value = ''; f.click(); };
  changes.ascFile = async (el) => {
    const f = el.files[0]; if (!f) return;
    try {
      let sheets;
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') sheets = [{ name: f.name.replace(/\.csv$/i, ''), rows: TT.parseCSV((await f.text()).replace(/^\ufeff/, '')) }];
      else sheets = (await TT.xlsxRead(await f.arrayBuffer())).sheets;
      UI._imp = TT.importLists(sheets);
      UI._impName = f.name;
      showImport();
    } catch (e) { UI.toast(e.message || 'Fail tidak dapat dibaca.', 'err'); }
    el.value = '';
  };
  function showImport() {
    const d = UI._imp, s = S();
    const LBL = { classes: 'Kelas', subjects: 'Subjek', teachers: 'Guru', rooms: 'Bilik' };
    const kinds = Object.keys(LBL).filter((k) => d[k].length);
    if (!kinds.length) { UI.toast('Tiada senarai kelas, subjek, guru atau bilik dikenal pasti. Pastikan baris tajuk ada lajur seperti "Kelas", "Mata Pelajaran", "Nama" dan "KOD".', 'err'); return; }
    const exist = { classes: s.classes, subjects: s.subjects, teachers: s.teachers, rooms: s.rooms };
    const card = (k) => {
      const have = new Set(exist[k].map((x) => x.name.trim().toLowerCase())), fresh = d[k].filter((x) => !have.has(x.name.trim().toLowerCase())).length;
      return `<label class="impk"><input type="checkbox" name="impKind" value="${k}" checked><span><b>${LBL[k]}: ${d[k].length}</b><small>${fresh} baharu${fresh < d[k].length ? `, ${d[k].length - fresh} sudah ada` : ''}</small><em>${d[k].slice(0, 4).map((x) => esc(x.name) + (x.code ? ` (${esc(x.code)})` : '')).join(', ')}${d[k].length > 4 ? ' ...' : ''}</em></span></label>`;
    };
    const any = s.classes.length || s.teachers.length || s.subjects.length;
    UI.modalOpen('Import daripada aSc', `<p>Fail: <b>${esc(UI._impName)}</b></p><div class="impgrid">${kinds.map(card).join('')}</div>
      ${d.skipped.length ? `<p class="hint">Tab diabaikan: ${d.skipped.map(esc).join(', ')}</p>` : ''}
      ${any ? `<div class="fld"><span>Cara import</span><label class="chk"><input type="radio" name="impMode" value="add" checked>Tambah kepada data sedia ada (nama yang sama diabaikan)</label>
        <label class="chk"><input type="radio" name="impMode" value="replace">Ganti senarai yang dipilih (pelajaran, jadual dan rekod relief lama dipadam)</label></div>` : ''}
      <div class="banner">Fail eksport aSc biasanya hanya senarai nama dan kod. Selepas import, isi <b>Pelajaran</b> (subjek, kelas, guru, waktu seminggu) di Data &gt; Pelajaran, kemudian jana jadual.</div>`,
    '<button class="btn" data-act="modalClose">Batal</button><button class="btn primary" data-act="ascApply">Import</button>', true);
  }
  actions.ascApply = () => {
    const kinds = [...document.querySelectorAll('[name=impKind]:checked')].map((x) => x.value);
    const modeEl = document.querySelector('[name=impMode]:checked'), mode = modeEl ? modeEl.value : 'add';
    if (!kinds.length) { UI.toast('Pilih sekurang-kurangnya satu senarai.', 'err'); return; }
    const go = () => {
      const n = TT.applyImport(S(), UI._imp, mode, kinds);
      UI._imp = null; UI.modalClose(); UI.page = 'data'; UI.dataTab = kinds.includes('teachers') ? 'guru' : kinds.includes('classes') ? 'kelas' : 'subjek'; UI.commit();
      UI.toast(`Diimport: ${n.teachers} guru, ${n.classes} kelas, ${n.subjects} subjek, ${n.rooms} bilik.`);
    };
    if (mode === 'replace') UI.confirm('Ganti senarai yang dipilih? Pelajaran, jadual dan rekod relief lama akan dipadam.', go, 'Ganti'); else go();
  };

  // ---------------- TETAPAN ----------------
  pages.tetapan = () => {
    const s = S();
    const head = UI.pageHead({
      crumbs: [['Tetapan']], title: 'Tetapan', sub: esc(s.school.name),
      metric: TT.slots(s).length, metricLabel: 'waktu belajar sehari', tone: 'blue',
      tabs: [['sekolah', 'Sekolah'], ['waktu', 'Waktu & rehat'], ['sekatan', 'Sekatan serentak'], ['relief', 'Peraturan relief'], ['storan', 'Storan & backup']], tab: UI.setTab, scope: 'setTab'
    });
    return head + ({ sekolah: setSchool, waktu: setPeriods, sekatan: setBlocks, relief: setRelief, storan: setStorage }[UI.setTab] || setSchool)();
  };

  function setSchool() {
    const s = S();
    return `<section class="card"><div class="ch"><h2>Maklumat sekolah</h2></div>
      <div class="grid2">
        <label class="fld"><span>Nama sekolah</span><input data-chg="schoolName" value="${esc(s.school.name)}"></label>
        <label class="fld"><span>Minggu persekolahan</span><select data-chg="weekMode">
          <option value="mon-fri"${s.school.weekMode === 'mon-fri' ? ' selected' : ''}>Isnin hingga Jumaat</option>
          <option value="sun-thu"${s.school.weekMode === 'sun-thu' ? ' selected' : ''}>Ahad hingga Khamis (Kedah, Kelantan, Terengganu, Johor)</option></select></label>
      </div></section>
      <section class="card"><div class="ch"><div><h2>Jenama sekolah</h2><small>Logo dan warna muncul pada header, cetakan dan slip. Disimpan bersama data sekolah.</small></div></div>
        <div class="brandrow"><div><div class="logobox" id="logoBox">${TT.validLogo(s.school.logo) ? `<img src="${s.school.logo}" alt="Logo sekolah">` : 'Belum ada logo'}</div>
          <div class="row"><label class="btn sm" for="logoFile">Pilih logo</label><input type="file" id="logoFile" data-chg="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
          ${TT.validLogo(s.school.logo) ? '<button class="btn sm danger" data-act="logoClear">Buang</button>' : ''}</div></div>
          <div><span class="lbl">Warna utama</span><div class="swatches">${TT.BRAND_PRESETS.map((c) => `<button class="swatch${(s.school.color || TT.BRAND_PRESETS[0]).toLowerCase() === c ? ' on' : ''}" style="background:${c}" data-act="brandPick" data-c="${c}" aria-label="Warna ${c}"></button>`).join('')}</div>
          <label class="fld sm"><span>Atau pilih sendiri</span><input type="color" data-chg="brandColor" value="${TT.brandPalette(s.school.color).base}"></label>
          <p class="hint">Warna dilaraskan secara automatik supaya teks putih sentiasa jelas dibaca.</p></div></div></section>
      <section class="card"><div class="ch"><div><h2>Peranti ini</h2><small>Disimpan dalam pelayar ini sahaja, tidak dikongsi</small></div></div>
      <div class="grid2"><label class="fld"><span>Nama anda (untuk sapaan di halaman Utama)</span><input data-chg="prefName" value="${esc(UI.prefs.name)}" placeholder="Contoh: Pn. Rohana"></label>
        <label class="fld chk"><input type="checkbox" data-chg="focusRelief"${UI.prefs.focusRelief ? ' checked' : ''}><span>Mod fokus relief: buka terus halaman Relief, sorok Jadual dan Laporan dari menu atas</span><span class="hint">Sesuai untuk penyelaras yang hanya mengurus guru ganti setiap pagi. Jadual masih boleh dibuka dari halaman Utama.</span></label></div></section>`;
  }

  // set waktu: k = 0 set utama (s.periods), k >= 1 = s.timeSets[k - 1]
  const setPeriodsArr = (k) => (k ? S().timeSets[k - 1].periods : S().periods);
  const setLimitsArr = (k) => (k ? S().timeSets[k - 1].dayLimits : S().dayLimits);
  const setLimitsPut = (k, v) => { if (k) S().timeSets[k - 1].dayLimits = v; else S().dayLimits = v; };

  function periodCard(k, multi) {
    const s = S(), days = TT.days(s), slots = TT.slots(s, k), list = TT.timeSetList(s), st = list[k];
    const rows = setPeriodsArr(k).map((p, i) => `<tr>
      <td><input data-chg="period" data-k="${k}" data-i="${i}" data-f="label" value="${esc(p.label)}" size="6"></td>
      <td><input type="time" data-chg="period" data-k="${k}" data-i="${i}" data-f="start" value="${p.start}"></td>
      <td><input type="time" data-chg="period" data-k="${k}" data-i="${i}" data-f="end" value="${p.end}"></td>
      <td><select data-chg="period" data-k="${k}" data-i="${i}" data-f="type"><option value="lesson"${p.type === 'lesson' ? ' selected' : ''}>Waktu belajar</option><option value="break"${p.type === 'break' ? ' selected' : ''}>Rehat</option></select></td>
      <td class="acts"><button class="btn sm" data-act="periodMove" data-k="${k}" data-i="${i}" data-dir="-1" title="Naik">↑</button><button class="btn sm" data-act="periodMove" data-k="${k}" data-i="${i}" data-dir="1" title="Turun">↓</button><button class="btn sm danger" data-act="periodDel" data-k="${k}" data-i="${i}">Padam</button></td></tr>`).join('');
    const ncls = multi ? s.classes.filter((c) => TT.classSetIdx(s, c) === k).length : s.classes.length;
    const title = multi ? `<input class="setname" data-chg="setName" data-k="${k}" value="${esc(st.name)}" aria-label="Nama set"> <small>${ncls} kelas</small>` : 'Waktu dan rehat';
    return `<section class="card"><div class="ch"><div><h2>${title}</h2><small>Susun ikut turutan sebenar. Waktu berganda tidak akan melintasi rehat.</small></div>
        <div class="row tight"><button class="pill" data-act="periodGen" data-k="${k}">Jana pantas</button>${multi && k ? `<button class="pill" data-act="setDel" data-k="${k}">Padam set</button>` : ''}</div></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Label</th><th>Mula</th><th>Tamat</th><th>Jenis</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row"><button class="btn" data-act="periodAdd" data-k="${k}" data-type="lesson">+ Waktu belajar</button><button class="btn" data-act="periodAdd" data-k="${k}" data-type="break">+ Rehat</button></div>
      <h3 class="sub">Bilangan waktu setiap hari</h3><p class="hint">Contoh: Jumaat lebih pendek, atau Tahap 1 balik lebih awal pada hari tertentu. Waktu selepas had ini tidak digunakan.</p>
      <div class="row">${days.map((d, i) => `<label class="fld sm"><span>${d.name}${slots.length ? ` <small>(${(slots[TT.dayLimits(s, k)[i] - 1] || { end: '-' }).end})</small>` : ''}</span><input type="number" min="0" max="${slots.length}" data-chg="dayLimit" data-k="${k}" data-i="${i}" value="${TT.dayLimits(s, k)[i]}"></label>`).join('')}</div></section>`;
  }

  function setPeriods() {
    const s = S(), multi = !!s.school.multiTime;
    const mode = `<section class="card"><div class="ch"><div><h2>Susunan waktu</h2><small>Sekolah rendah yang rehat atau waktu balik Tahap 1 dan Tahap 2 berbeza boleh guna set waktu berasingan</small></div></div>
      <div class="row"><label class="chk"><input type="radio" name="tmode" value="0" data-chg="multiTime"${multi ? '' : ' checked'}>Waktu sama untuk semua kelas</label>
      <label class="chk"><input type="radio" name="tmode" value="1" data-chg="multiTime"${multi ? ' checked' : ''}>Waktu berbeza ikut kumpulan kelas <span class="tag">Beta</span></label></div>
      ${multi ? '<p class="hint">Setiap kelas ikut satu set. Guru yang mengajar dua set disemak bertindih ikut masa sebenar (contoh 10:15-10:45 lawan 10:30-11:00). Waktu "tidak boleh" guru, sekatan serentak dan ketidakhadiran separuh hari direkod ikut waktu set pertama.</p>' : ''}</section>`;
    if (!multi) return mode + periodCard(0, false);
    const list = TT.timeSetList(s);
    const assign = s.classes.length ? `<section class="card"><div class="ch"><div><h2>Kelas mengikut set</h2><small>Tetapkan cepat ikut tahun/tingkatan, atau pilih setiap kelas</small></div></div>
      <div class="row">${list.map((st, k) => `<label class="fld sm"><span>${esc(st.name)}: tahun</span><input id="lv_${k}" placeholder="cth 1,2,3"></label>`).join('')}<button class="btn" data-act="setAssignLevels">Guna</button></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Kelas</th><th>Tahun / tingkatan</th><th>Set waktu</th></tr></thead><tbody>${s.classes.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.level)}</td><td><select data-chg="classSet" data-id="${c.id}">${list.map((st, k) => `<option value="${esc(st.id)}"${TT.classSetIdx(s, c) === k ? ' selected' : ''}>${esc(st.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></section>` : '';
    return mode + list.map((_, k) => periodCard(k, true)).join('') + `<div class="row"><button class="btn" data-act="setAdd">+ Tambah set waktu</button></div>` + assign;
  }

  // ---------- sekatan serentak (mesyuarat, kokurikulum) ----------
  function setBlocks() {
    const s = S(), days = TT.days(s), sl = TT.slots(s);
    const who = (b) => (b.teacherIds.length ? `${b.teacherIds.length} guru` : b.dept ? `Panitia ${b.dept}` : 'Semua guru');
    const rows = s.blocks.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${b.days.map((d) => esc((days[d] || {}).name || '?')).join(', ')}</td>
      <td>Waktu ${esc((sl[b.from] || {}).label || b.from + 1)} hingga ${esc((sl[b.to] || {}).label || b.to + 1)}<small>${esc((sl[b.from] || {}).start || '')}-${esc((sl[b.to] || {}).end || '')}</small></td><td>${esc(who(b))}</td>
      <td class="acts"><button class="btn sm" data-act="blockEdit" data-id="${b.id}">Edit</button><button class="btn sm danger" data-act="blockDel" data-id="${b.id}">Padam</button></td></tr>`).join('');
    return `<section class="card"><div class="ch"><div><h2>Sekatan serentak</h2><small>Waktu yang tidak boleh diisi kelas untuk ramai guru sekaligus: mesyuarat mingguan, kokurikulum, perhimpunan</small></div>
      <button class="btn primary" data-act="blockEdit">${UI.icon('plus')} Tambah sekatan</button></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Hari</th><th>Waktu</th><th>Guru terlibat</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Belum ada sekatan. Contoh: Mesyuarat guru, Rabu waktu 7 hingga 8.</td></tr>'}</tbody></table></div>
      <p class="hint">Penjana tidak meletak kelas guru terlibat pada waktu ini, dan guru itu tidak dicadangkan untuk relief pada waktu yang sama.${TT.multiTime(s) ? ' Waktu ikut set pertama.' : ''}</p></section>`;
  }
  actions.blockEdit = (el) => {
    const s = S(), b = el.dataset.id ? s.blocks.find((x) => x.id === el.dataset.id) : null, sl = TT.slots(s);
    const depts = [...new Set(s.teachers.map((t) => t.dept).filter(Boolean))].sort();
    UI.openForm({
      title: b ? 'Edit sekatan' : 'Tambah sekatan serentak', wide: true,
      values: b ? { name: b.name, days: b.days.map(String), from: String(b.from), to: String(b.to), scope: b.teacherIds.length ? 'pick' : b.dept ? 'dept' : 'all', dept: b.dept, teacherIds: b.teacherIds } : { days: [], from: '0', to: '0', scope: 'all' },
      fields: [
        { key: 'name', label: 'Nama', required: true, placeholder: 'Mesyuarat guru / Kokurikulum' },
        { key: 'days', label: 'Hari', type: 'multi', options: TT.days(s).map((d, i) => ({ v: String(i), t: d.name })) },
        { key: 'from', label: 'Dari waktu', type: 'select', options: sl.map((x, i) => ({ v: String(i), t: `${x.label} (${x.start})` })) },
        { key: 'to', label: 'Hingga waktu', type: 'select', options: sl.map((x, i) => ({ v: String(i), t: `${x.label} (${x.end})` })) },
        { key: 'scope', label: 'Guru terlibat', type: 'select', options: [{ v: 'all', t: 'Semua guru' }].concat(depts.length ? [{ v: 'dept', t: 'Satu panitia' }] : []).concat([{ v: 'pick', t: 'Pilih guru' }]) },
        { key: 'dept', label: 'Panitia (jika satu panitia)', type: 'select', options: [{ v: '', t: '-' }].concat(depts.map((d) => ({ v: d, t: d }))) },
        { key: 'teacherIds', label: 'Guru (jika pilih guru)', type: 'multi', options: s.teachers.map((t) => ({ v: t.id, t: t.name })) }
      ],
      onSave: (v) => {
        if (!v.days.length) return 'Pilih sekurang-kurangnya satu hari.';
        if (+v.to < +v.from) return 'Waktu akhir mesti selepas waktu mula.';
        if (v.scope === 'dept' && !v.dept) return 'Pilih panitia.';
        if (v.scope === 'pick' && !v.teacherIds.length) return 'Pilih sekurang-kurangnya seorang guru.';
        const o = b || { id: TT.uid('b') };
        Object.assign(o, { name: v.name, days: v.days.map(Number), from: +v.from, to: +v.to, dept: v.scope === 'dept' ? v.dept : '', teacherIds: v.scope === 'pick' ? v.teacherIds : [] });
        if (!b) s.blocks.push(o);
        const clash = TT.validate(s).issues.filter((i) => i.sev === 'error' && /tidak boleh mengajar/.test(i.msg)).length;
        if (clash) setTimeout(() => UI.toast(`${clash} waktu dalam jadual semasa jatuh pada sekatan ini. Jana semula atau alih secara manual.`, 'err'), 50);
      }
    });
  };
  actions.blockDel = (el) => UI.confirm('Padam sekatan ini?', () => { S().blocks = S().blocks.filter((b) => b.id !== el.dataset.id); UI.commit(); }, 'Padam');

  changes.multiTime = (el) => {
    const s = S(), on = el.value === '1';
    s.school.multiTime = on;
    if (on && !s.timeSets.length) s.timeSets.push({ id: TT.uid('ts'), name: 'Tahap 1', periods: JSON.parse(JSON.stringify(s.periods)), dayLimits: s.dayLimits.slice() });
    if (on && (!s.school.mainSetName || s.school.mainSetName === 'Set utama')) s.school.mainSetName = 'Tahap 2';
    UI.commit();
  };
  actions.setAdd = () => { const s = S(); s.timeSets.push({ id: TT.uid('ts'), name: `Set ${s.timeSets.length + 2}`, periods: JSON.parse(JSON.stringify(s.periods)), dayLimits: s.dayLimits.slice() }); UI.commit(); };
  actions.setDel = (el) => {
    const s = S(), k = +el.dataset.k, st = s.timeSets[k - 1]; if (!st) return;
    UI.confirm(`Padam set "${st.name}"? Kelas dalam set ini kembali ke set pertama dan jadual mereka mungkin perlu dijana semula.`, () => {
      s.classes.forEach((c) => { if (c.timeSet === st.id) c.timeSet = ''; });
      s.timeSets.splice(k - 1, 1); UI.commit();
    }, 'Padam');
  };
  changes.setName = (el) => {
    const k = +el.dataset.k, v = el.value.trim() || 'Set';
    if (k) S().timeSets[k - 1].name = v; else S().school.mainSetName = v;
    UI.commit();
  };
  changes.classSet = (el) => { const c = S().classes.find((x) => x.id === el.dataset.id); if (c) { c.timeSet = el.value; UI.commit(); } };
  actions.setAssignLevels = () => {
    const s = S(), list = TT.timeSetList(s); let n = 0;
    list.forEach((st, k) => {
      const el = document.getElementById('lv_' + k); if (!el || !el.value.trim()) return;
      const lv = new Set(el.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean));
      s.classes.forEach((c) => { if (lv.has(String(c.level).trim())) { c.timeSet = st.id; n++; } });
    });
    if (!n) { UI.toast('Tiada kelas sepadan. Pastikan ruang "Tahun / tingkatan" kelas diisi.', 'err'); return; }
    UI.commit(); UI.toast(`${n} kelas dikemas kini.`);
  };

  function setRelief() {
    const s = S(), r = s.settings.relief;
    const rw = (k, label, hint) => `<label class="fld"><span>${label}</span><input type="number" step="any" data-chg="reliefCfg" data-k="${k}" value="${r[k]}">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
    const ex = s.teachers.filter((t) => TT.reliefExempt(s, t));
    return `<section class="card"><div class="ch"><div><h2>Had dan syarat</h2><small>Calon relief mesti kosong, hadir, dan belum melebihi had. Setiap sekolah boleh tetapkan sendiri.</small></div><button class="pill" data-act="reliefDefaults">Pulihkan nilai asal</button></div>
      <div class="grid3">${rw('maxPerDay', 'Had relief sehari seorang guru (waktu)', '0 = tiada had')}
        ${rw('maxPerWeek', 'Had relief seminggu seorang guru (waktu)', '0 = tiada had. Contoh: 3')}
        ${rw('maxTeachDay', 'Had jumlah waktu sehari (mengajar + relief)', '0 = tiada had. Contoh 6: guru yang sudah mengajar 6 waktu hari itu tidak dicadangkan')}
        <label class="fld chk"><input type="checkbox" data-chg="reliefBool" data-k="needGap"${r.needGap ? ' checked' : ''}><span>Mesti ada waktu kosong sebelum atau selepas relief (guru sempat berehat)</span></label>
        <label class="fld chk"><input type="checkbox" data-chg="reliefBool" data-k="respectUnavailable"${r.respectUnavailable ? ' checked' : ''}><span>Hormati waktu guru tidak boleh (profil guru)</span></label></div></section>
      <section class="card"><div class="ch"><div><h2>Guru yang dikecualikan</h2><small>Contoh: Guru Besar, PK, Kaunselor, guru UBK</small></div></div>
        <label class="fld"><span>Jawatan yang dikecualikan (pisah dengan koma)</span><input data-chg="reliefRoles" value="${esc(r.excludeRoles || '')}" placeholder="GB, PK, Kaunselor, UBK"><span class="hint">Isi ruang "Jawatan" dalam profil guru. Guru boleh juga dikecualikan satu persatu dalam profil.</span></label>
        <p>${ex.length ? `<b>${ex.length} guru dikecualikan:</b> ${ex.map((t) => esc(t.name)).join(', ')}` : 'Tiada guru dikecualikan.'}</p></section>
      <section class="card"><div class="ch"><div><h2>Pemberat skor cadangan</h2><small>Skor = jumlah bonus tolak penalti. Calon skor tertinggi dicadangkan dahulu.</small></div></div>
      <div class="grid3">${rw('wSubject', 'Bonus: subjek sama')}${rw('wDept', 'Bonus: panitia sama')}${rw('wKnows', 'Bonus: mengajar kelas itu')}
        ${rw('wHome', 'Bonus: guru kelas')}${rw('wCont', 'Bonus: sambung kelas sama')}${rw('wFair', 'Penalti setiap relief bulan ini')}
        ${rw('wTotal', 'Penalti setiap relief keseluruhan')}${rw('wToday', 'Penalti setiap relief hari ini')}${rw('wLoad', 'Penalti setiap waktu mengajar mingguan')}</div></section>`;
  }

  function setStorage() {
    const lb = UI.prefs.lastBackup;
    return (UI.syncCard ? UI.syncCard() : '') + `<section class="card"><div class="ch"><div><h2>${UI.icon('download')} Backup fail JSON</h2><small>Salinan penuh semua data. Boleh dibuka semula di mana-mana peranti.</small></div></div>
      <p>Backup terakhir: <b>${lb ? `${TT.fmtDate(lb.slice(0, 10))}` : 'belum pernah'}</b></p>
      <div class="row"><button class="btn primary" data-act="exportJson">${UI.icon('download')} Eksport JSON</button><button class="btn" data-act="importJson">${UI.icon('upload')} Import JSON</button></div></section>
      ${archiveCard()}
      <section class="card"><div class="ch"><div><h2>Data contoh dan set semula</h2><small>Untuk cuba sistem atau mula semula</small></div></div>
      <div class="row"><button class="btn" data-act="loadSample">Muat data contoh (SMK Contoh Jaya)</button><button class="btn danger" data-act="newBlank">Padam semua data</button></div></section>
      <section class="card"><div class="ch"><h2>Privasi</h2></div><p class="hint">Data sekolah disimpan dalam pelayar peranti ini${UI.sync && UI.sync.linked() ? ' dan dalam Google Sheet milik akaun anda' : ''}. Pembekal sistem tidak menerima atau menyimpan data anda.</p></section>`;
  }

  // ---------- arkib dan bersih sejarah ----------
  function archiveCard() {
    const s = S(), r = TT.historyRange(s), today = TT.todayISO();
    if (!UI.archBefore) UI.archBefore = TT.archiveSuggest(s, today);
    const p = TT.archivePick(s, UI.archBefore), n = p.absences.length + p.reliefs.length;
    const sheetOk = UI.sync && UI.sync.linked && UI.sync.linked() && UI.sync.signedIn() && UI.sync.licensed();
    const past = s.archives.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)} <small>${x.count} rekod sebelum ${TT.fmtDate(x.before)}, diarkib ${TT.fmtDate(x.at.slice(0, 10))}</small></li>`).join('');
    return `<section class="card"><div class="ch"><div><h2>Arkib dan bersih sejarah</h2><small>Pindah rekod tidak hadir dan relief lama ke fail berasingan supaya app kekal laju. Disyorkan setiap tahun.</small></div></div>
      ${r ? `<p>Sejarah aktif: <b>${r.count} rekod</b> (${s.absences.length} tidak hadir, ${s.reliefs.length} relief) dari ${TT.fmtDate(r.from)} hingga ${TT.fmtDate(r.to)}.${TT.archiveDue(s, today) ? ' <span class="chip-s amber">Lebih 12 bulan</span>' : ''}</p>` : '<p class="hint">Tiada sejarah relief untuk diarkib.</p>'}
      ${r ? `<div class="row"><label class="fld sm"><span>Arkib rekod sebelum</span><input type="date" value="${UI.archBefore}" data-chg="archBefore"></label>
        <span class="hint">${n} rekod akan diarkib (${p.absences.length} tidak hadir, ${p.reliefs.length} relief).</span></div>
        <div class="row">${sheetOk ? `<button class="btn primary" data-act="archiveRun" data-to="sheet"${n ? '' : ' disabled'}>${UI.icon('cloud')} Arkib ke Google Sheet baharu</button>` : ''}
        <button class="btn${sheetOk ? '' : ' primary'}" data-act="archiveRun" data-to="file"${n ? '' : ' disabled'}>${UI.icon('download')} Muat turun arkib Excel dan bersih</button></div>
        <p class="hint">Rekod hanya dibuang selepas arkib berjaya dicipta. Statistik kesaksamaan relief dikira semula daripada rekod yang tinggal.</p>` : ''}
      ${past ? `<h3 class="sub">Arkib terdahulu</h3><ul class="plain">${past}</ul>` : ''}</section>`;
  }
  changes.archBefore = (el) => { if (el.value) { UI.archBefore = el.value; UI.render(); } };
  actions.archiveRun = async (el) => {
    const s = S(), before = UI.archBefore, p = TT.archivePick(s, before), n = p.absences.length + p.reliefs.length;
    if (!n) { UI.toast('Tiada rekod sebelum tarikh ini.', 'err'); return; }
    const tabs = TT.archiveTabs(s, p, before), dates = p.absences.map((a) => a.date).concat(p.reliefs.map((r) => r.date)).sort();
    const title = `Arkib Relief - ${s.school.name} - ${TT.fmtDate(dates[0])} hingga ${TT.fmtDate(dates[dates.length - 1])}`;
    const done = (url) => {
      TT.archiveRemove(s, before);
      s.archives.push({ title, url: url || '', before, count: n, at: new Date().toISOString() });
      UI.archBefore = null; UI.commit();
      UI.toast(`${n} rekod diarkib dan dibuang daripada data aktif.`);
    };
    if (el.dataset.to === 'sheet') {
      UI.toast('Mencipta Google Sheet arkib...');
      try { const r = await UI.sync.store.createWith(title, tabs); done(r.url); } catch (e) { UI.toast('Arkib gagal, tiada rekod dibuang: ' + e.message, 'err'); }
      return;
    }
    const bytes = TT.xlsxWrite(Object.keys(tabs).map((k) => ({ name: k, rows: tabs[k], bold: k === 'Ringkasan' ? [0, 6] : [0] })));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = title.replace(/[\/:*?"<>|]+/g, '-') + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    UI.confirm(`Fail arkib (${n} rekod) telah dimuat turun. Simpan fail itu di tempat selamat. Buang rekod ini daripada data aktif sekarang?`, () => done(''), 'Buang daripada data aktif');
  };

  changes.logoFile = async (el) => {
    const f = el.files[0]; if (!f) return;
    try { S().school.logo = await UI.fitLogo(f); UI.commit(); UI.toast('Logo disimpan.'); } catch (e) { UI.toast(e.message, 'err'); }
    el.value = '';
  };
  actions.logoClear = () => { S().school.logo = ''; UI.commit(); };
  actions.brandPick = (el) => { S().school.color = el.dataset.c; UI.commit(); };
  changes.brandColor = (el) => { S().school.color = el.value; UI.commit(); };
  changes.schoolName = (el) => { S().school.name = el.value.trim() || 'Sekolah'; UI.commit(); };
  changes.weekMode = (el) => { S().school.weekMode = el.value; UI.commit(); };
  changes.focusRelief = (el) => { UI.prefs.focusRelief = el.checked; UI.savePrefs(); UI.render(); };
  changes.prefName = (el) => { UI.prefs.name = el.value.trim(); UI.savePrefs(); UI.render(); };
  changes.period = (el) => {
    const p = setPeriodsArr(+el.dataset.k || 0)[+el.dataset.i]; p[el.dataset.f] = el.value;
    if (p.type === 'break' && !p.label) p.label = 'Rehat';
    UI.commit();
  };
  changes.dayLimit = (el) => {
    const k = +el.dataset.k || 0, arr = setLimitsArr(k) || [];
    arr[+el.dataset.i] = Math.max(0, Math.min(TT.slots(S(), k).length, num(el.value, 0))); setLimitsPut(k, arr); UI.commit();
  };
  changes.reliefRoles = (el) => { S().settings.relief.excludeRoles = el.value; UI.save(); UI.render(); };
  changes.reliefCfg = (el) => { S().settings.relief[el.dataset.k] = num(el.value, 0); UI.save(); UI.toast('Disimpan'); };
  changes.reliefBool = (el) => { S().settings.relief[el.dataset.k] = el.checked; UI.save(); };
  actions.reliefDefaults = () => { S().settings.relief = TT.defaultRelief(); UI.commit(); };

  const addMin = (hhmm, m) => { const [h, mi] = hhmm.split(':').map(Number); const t = h * 60 + mi + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  actions.periodAdd = (el) => {
    const s = S(), k = +el.dataset.k || 0, ps = setPeriodsArr(k), last = ps[ps.length - 1], before = TT.slots(s, k).length;
    const n = ps.filter((p) => p.type === 'lesson').length + 1;
    ps.push({ label: el.dataset.type === 'break' ? 'Rehat' : String(n), start: last ? last.end : '07:30', end: last ? addMin(last.end, el.dataset.type === 'break' ? 30 : 40) : '08:10', type: el.dataset.type });
    // hari yang sebelum ini penuh turut dapat waktu baharu
    const lim = setLimitsArr(k) || [];
    if (el.dataset.type === 'lesson') setLimitsPut(k, TT.days(s).map((_, i) => (lim[i] == null || lim[i] >= before ? before + 1 : lim[i])));
    UI.commit();
  };
  actions.periodDel = (el) => {
    const i = +el.dataset.i, ps = setPeriodsArr(+el.dataset.k || 0);
    UI.confirm('Padam baris ini? Waktu yang telah diletak selepasnya mungkin dibuang dari jadual.', () => { ps.splice(i, 1); UI.commit(); }, 'Padam');
  };
  actions.periodMove = (el) => {
    const i = +el.dataset.i, j = i + +el.dataset.dir, ps = setPeriodsArr(+el.dataset.k || 0);
    if (j < 0 || j >= ps.length) return; [ps[i], ps[j]] = [ps[j], ps[i]]; UI.commit();
  };
  actions.periodGen = (el) => {
    const k = (el && el.dataset && +el.dataset.k) || 0;
    UI.openForm({
      title: 'Jana pantas waktu', saveLabel: 'Jana',
      fields: [
        { key: 'start', label: 'Waktu mula persekolahan', type: 'time', def: '07:30' },
        { key: 'len', label: 'Tempoh satu waktu (minit)', type: 'number', def: 40, min: 20, max: 90 },
        { key: 'n', label: 'Bilangan waktu belajar', type: 'number', def: 8, min: 1, max: 14 },
        { key: 'brkAfter', label: 'Rehat selepas waktu ke', type: 'number', def: 4, min: 0, max: 14, hint: '0 = tiada rehat' },
        { key: 'brkLen', label: 'Tempoh rehat (minit)', type: 'number', def: 30, min: 5, max: 90 }
      ],
      onSave: (v) => {
        if (!(v.n >= 1) || !(v.len >= 5)) return 'Bilangan dan tempoh waktu mesti diisi.';
        const ps = []; let t = v.start || '07:30';
        for (let i = 1; i <= v.n; i++) {
          ps.push({ label: String(i), start: t, end: addMin(t, v.len), type: 'lesson' }); t = addMin(t, v.len);
          if (i === v.brkAfter) { ps.push({ label: 'Rehat', start: t, end: addMin(t, v.brkLen || 30), type: 'break' }); t = addMin(t, v.brkLen || 30); }
        }
        if (k) { S().timeSets[k - 1].periods = ps; S().timeSets[k - 1].dayLimits = TT.days(S()).map(() => v.n); } else { S().periods = ps; S().dayLimits = TT.days(S()).map(() => v.n); }
      }
    });
  };

  // ---------------- DATA ----------------
  const TABS = [['guru', 'Guru'], ['subjek', 'Subjek'], ['kelas', 'Kelas'], ['bilik', 'Bilik'], ['pelajaran', 'Pelajaran']];

  pages.data = () => {
    const s = S(), counts = { guru: s.teachers, subjek: s.subjects, kelas: s.classes, bilik: s.rooms, pelajaran: s.lessons };
    const weekly = s.lessons.reduce((a, l) => a + (l.perWeek | 0), 0);
    const head = UI.pageHead({
      crumbs: [['Data']], title: 'Data sekolah',
      sub: `${s.teachers.length} guru · ${s.classes.length} kelas · ${s.subjects.length} subjek · ${s.rooms.length} bilik · ${s.lessons.length} pelajaran`,
      metric: weekly, metricLabel: 'waktu pelajaran seminggu', tone: 'blue',
      tabs: TABS.map(([k, t]) => [k, `${t} (${counts[k].length})`]), tab: UI.dataTab, scope: 'dataTab'
    });
    return head + `<section class="card">${dataTables[UI.dataTab]()}</section>`;
  };

  const bar = (label, addAct, bulk, extra) => `<div class="toolbar"><button class="btn primary" data-act="${addAct}">${UI.icon('plus')} Tambah ${label}</button>${bulk ? `<button class="btn" data-act="bulk" data-kind="${bulk}">Tambah ramai sekaligus</button>` : ''}<button class="btn" data-act="ascImport">${UI.icon('upload')} Import dari aSc / Excel</button>${extra || ''}</div>`;
  const delBtn = (kind, id) => `<button class="btn sm danger" data-act="del" data-kind="${kind}" data-id="${id}">Padam</button>`;
  const editBtn = (kind, id) => `<button class="btn sm" data-act="edit" data-kind="${kind}" data-id="${id}">Edit</button>`;

  const dataTables = {
    guru() {
      const s = S(), load = TT.teacherLoad(s), m = TT.maps(s);
      const rows = s.teachers.map((t) => {
        const blocked = Object.values(t.unavailable).filter(Boolean).length, l = load.get(t.id) || 0;
        return `<tr><td><span class="av sm">${esc(UI.initials(t.name))}</span>${esc(t.name)}${t.role ? ` <small>${esc(t.role)}</small>` : ''}${TT.reliefExempt(s, t) ? ' <span class="tag">tiada relief</span>' : ''}</td><td>${esc(t.short)}</td><td>${esc(t.dept)}</td>
          <td>${t.subjectIds.map((i) => esc((m.subject.get(i) || {}).short)).join(', ')}</td>
          <td class="${l > t.maxPerWeek ? 'bad' : ''}">${l}</td><td>${blocked || ''}</td><td class="acts">${editBtn('guru', t.id)}${delBtn('guru', t.id)}</td></tr>`;
      }).join('');
      return bar('guru', 'add-guru', 'guru') + `<div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Kod</th><th>Panitia</th><th>Subjek</th><th>Waktu/mgg</th><th>Slot tak boleh</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Belum ada guru.</td></tr>'}</tbody></table></div>`;
    },
    subjek() {
      const rows = S().subjects.map((x) => `<tr><td><span class="sw" style="background:${esc(x.color)}"></span>${esc(x.name)}</td><td>${esc(x.short)}</td><td>${x.heavy ? 'Ya (pagi)' : ''}</td><td class="acts">${editBtn('subjek', x.id)}${delBtn('subjek', x.id)}</td></tr>`).join('');
      return bar('subjek', 'add-subjek', 'subjek') + `<div class="tablewrap"><table class="tbl"><thead><tr><th>Subjek</th><th>Kod</th><th>Utamakan pagi</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Belum ada subjek.</td></tr>'}</tbody></table></div>`;
    },
    kelas() {
      const s = S(), m = TT.maps(s);
      const per = new Map(); s.lessons.forEach((l) => l.classIds.forEach((c) => per.set(c, (per.get(c) || 0) + (l.perWeek | 0))));
      const multi = TT.multiTime(s), sets = TT.timeSetList(s);
      const rows = s.classes.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.level)}</td>${multi ? `<td>${esc(sets[TT.classSetIdx(s, c)].name)}</td>` : ''}<td>${esc((m.teacher.get(c.homeroomId) || {}).name || '')}</td><td>${per.get(c.id) || 0}</td><td class="acts">${editBtn('kelas', c.id)}${delBtn('kelas', c.id)}</td></tr>`).join('');
      return bar('kelas', 'add-kelas', 'kelas') + `<div class="tablewrap"><table class="tbl"><thead><tr><th>Kelas</th><th>Tingkatan</th>${multi ? '<th>Set waktu</th>' : ''}<th>Guru kelas</th><th>Waktu/mgg</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="${multi ? 6 : 5}" class="empty">Belum ada kelas.</td></tr>`}</tbody></table></div>`;
    },
    bilik() {
      const rows = S().rooms.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td class="acts">${editBtn('bilik', r.id)}${delBtn('bilik', r.id)}</td></tr>`).join('');
      return bar('bilik', 'add-bilik', 'bilik') + `<div class="tablewrap"><table class="tbl"><thead><tr><th>Bilik / makmal</th><th>Jenis</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">Belum ada bilik. Bilik bersifat pilihan.</td></tr>'}</tbody></table></div>`;
    },
    pelajaran() {
      const s = S(), m = TT.maps(s), f = UI.lessonFilter;
      const placed = new Map(); s.placements.forEach((p) => placed.set(p.lessonId, (placed.get(p.lessonId) || 0) + p.len));
      const list = s.lessons.filter((l) => (!f.cls || l.classIds.includes(f.cls)) && (!f.teacher || l.teacherIds.includes(f.teacher)) && (!f.subject || l.subjectId === f.subject));
      const rows = list.map((l) => {
        const sub = m.subject.get(l.subjectId) || {}, got = placed.get(l.id) || 0;
        return `<tr><td>${esc(TT.classNames(s, l.classIds))}</td><td><span class="sw" style="background:${esc(sub.color || '#999')}"></span>${esc(sub.name || '?')}</td>
          <td>${l.teacherIds.map((i) => esc((m.teacher.get(i) || {}).name)).join(' + ') || '<span class="bad">tiada guru</span>'}</td><td>${l.perWeek}</td><td>${l.doubles || ''}</td>
          <td>${esc((m.room.get(l.roomId) || {}).name || '')}</td><td><span class="chip-s ${got < l.perWeek ? 'amber' : 'green'}">${got}/${l.perWeek}</span></td><td class="acts">${editBtn('pelajaran', l.id)}${delBtn('pelajaran', l.id)}</td></tr>`;
      }).join('');
      const sel = (key, label, arr, fn) => `<label class="fld sm"><span>${label}</span><select data-chg="lessonFilter" data-k="${key}"><option value="">Semua</option>${UI.optHtml(opts(arr, fn), f[key])}</select></label>`;
      return `<div class="toolbar"><button class="btn primary" data-act="add-pelajaran">${UI.icon('plus')} Tambah pelajaran</button><span class="grow"></span>
        ${sel('cls', 'Kelas', s.classes, (c) => c.name)}${sel('teacher', 'Guru', s.teachers, (t) => t.name)}${sel('subject', 'Subjek', s.subjects, (x) => x.name)}</div>
        <p class="hint">Pelajaran gabungan (contoh Pendidikan Islam / Moral) ialah satu pelajaran dengan beberapa kelas dan beberapa guru yang mengajar serentak.</p>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>Kelas</th><th>Subjek</th><th>Guru</th><th>Waktu/mgg</th><th>Berganda</th><th>Bilik</th><th>Diletak</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Tiada pelajaran dipadankan.</td></tr>'}</tbody></table></div>`;
    }
  };
  changes.lessonFilter = (el) => { UI.lessonFilter[el.dataset.k] = el.value; UI.render(); };

  // ---- borang tambah / edit ----
  const forms = {
    guru: (id) => {
      const s = S(), t = id ? s.teachers.find((x) => x.id === id) : null;
      UI.openForm({
        title: t ? 'Edit guru' : 'Tambah guru', wide: true,
        values: t ? { name: t.name, short: t.short, dept: t.dept, role: t.role || '', subjectIds: t.subjectIds, maxPerDay: t.maxPerDay, maxPerWeek: t.maxPerWeek, noRelief: t.noRelief, unavailable: t.unavailable } : {},
        fields: [
          { key: 'name', label: 'Nama', required: true }, { key: 'short', label: 'Kod ringkas (3 huruf)', hint: 'Dipaparkan dalam jadual. Kosongkan untuk jana automatik.' },
          { key: 'dept', label: 'Panitia / jabatan' }, { key: 'role', label: 'Jawatan (pilihan)', hint: 'Contoh GB, PK, Kaunselor, UBK. Jawatan dalam senarai pengecualian relief tidak diberi relief.' },
          { key: 'subjectIds', label: 'Subjek yang boleh diajar', type: 'multi', options: opts(s.subjects, (x) => x.name) },
          { key: 'maxPerDay', label: 'Had waktu mengajar sehari', type: 'number', def: 7, min: 1 }, { key: 'maxPerWeek', label: 'Had waktu seminggu (amaran)', type: 'number', def: 36, min: 1 },
          { key: 'noRelief', label: 'Dikecualikan daripada tugas relief (contoh pentadbir)', type: 'checkbox' },
          { key: 'unavailable', label: TT.multiTime(s) ? `Waktu tidak boleh mengajar (ikut waktu ${TT.timeSetList(s)[0].name})` : 'Waktu tidak boleh mengajar', type: 'avail' }
        ],
        onSave: (v) => {
          const o = t || { id: TT.uid('t') };
          Object.assign(o, v, { short: v.short || short3(v.name), maxPerDay: v.maxPerDay || 7, maxPerWeek: v.maxPerWeek || 36 });
          if (!t) s.teachers.push(o);
        }
      });
    },
    subjek: (id) => {
      const s = S(), x = id ? s.subjects.find((y) => y.id === id) : null;
      UI.openForm({
        title: x ? 'Edit subjek' : 'Tambah subjek', values: x ? { name: x.name, short: x.short, color: x.color, heavy: x.heavy } : { color: PAL[s.subjects.length % PAL.length] },
        fields: [{ key: 'name', label: 'Nama subjek', required: true }, { key: 'short', label: 'Kod ringkas', hint: 'Contoh BM, MT, SN' }, { key: 'color', label: 'Warna', type: 'color' },
          { key: 'heavy', label: 'Subjek berat: utamakan waktu pagi', type: 'checkbox' }],
        onSave: (v) => { const o = x || { id: TT.uid('s') }; Object.assign(o, v, { short: v.short || v.name.slice(0, 3).toUpperCase() }); if (!x) s.subjects.push(o); }
      });
    },
    kelas: (id) => {
      const s = S(), c = id ? s.classes.find((y) => y.id === id) : null;
      UI.openForm({
        title: c ? 'Edit kelas' : 'Tambah kelas', values: c ? { name: c.name, level: c.level, homeroomId: c.homeroomId || '', timeSet: c.timeSet || '' } : {},
        fields: [{ key: 'name', label: 'Nama kelas', required: true, hint: 'Contoh 1 Amanah' }, { key: 'level', label: 'Tingkatan / tahun' },
          { key: 'homeroomId', label: 'Guru kelas', type: 'select', options: [{ v: '', t: '(tiada)' }].concat(opts(s.teachers, (t) => t.name)) }]
          .concat(TT.multiTime(s) ? [{ key: 'timeSet', label: 'Set waktu', type: 'select', options: TT.timeSetList(s).map((x) => ({ v: x.id, t: x.name })) }] : []),
        onSave: (v) => { const o = c || { id: TT.uid('c'), timeSet: '' }; Object.assign(o, v, { homeroomId: v.homeroomId || null }); if (!c) s.classes.push(o); }
      });
    },
    bilik: (id) => {
      const s = S(), r = id ? s.rooms.find((y) => y.id === id) : null;
      UI.openForm({
        title: r ? 'Edit bilik' : 'Tambah bilik', values: r ? { name: r.name, type: r.type } : {},
        fields: [{ key: 'name', label: 'Nama bilik / makmal', required: true }, { key: 'type', label: 'Jenis', hint: 'Contoh Makmal, Bengkel' }],
        onSave: (v) => { const o = r || { id: TT.uid('r') }; Object.assign(o, v); if (!r) s.rooms.push(o); }
      });
    },
    pelajaran: (id) => {
      const s = S();
      if (!id) { lessonWizard(); return; }
      const l = s.lessons.find((x) => x.id === id);
      UI.openForm({
        title: 'Edit pelajaran', wide: true,
        values: { subjectId: l.subjectId, classIds: l.classIds, teacherIds: l.teacherIds, perWeek: l.perWeek, doubles: l.doubles, roomId: l.roomId || '' },
        fields: [
          { key: 'subjectId', label: 'Subjek', type: 'select', options: opts(s.subjects, (x) => x.name) },
          { key: 'classIds', label: 'Kelas (lebih daripada satu = gabungan serentak)', type: 'multi', options: opts(s.classes, (c) => c.name) },
          { key: 'teacherIds', label: 'Guru (lebih daripada satu = mengajar serentak)', type: 'multi', options: opts(s.teachers, (t) => t.name) },
          { key: 'perWeek', label: 'Waktu seminggu', type: 'number', min: 1, max: 20, required: true }, { key: 'doubles', label: 'Daripadanya berapa pasang waktu berganda', type: 'number', min: 0, max: 10 },
          { key: 'roomId', label: 'Bilik', type: 'select', options: [{ v: '', t: '(tiada)' }].concat(opts(s.rooms, (r) => r.name)) }
        ],
        onSave: (v) => {
          if (!v.classIds.length) return 'Pilih sekurang-kurangnya satu kelas.';
          if (!v.teacherIds.length) return 'Pilih sekurang-kurangnya satu guru.';
          if ((v.doubles || 0) * 2 > v.perWeek) return 'Pasang berganda terlalu banyak untuk bilangan waktu.';
          Object.assign(l, v, { roomId: v.roomId || null, doubles: v.doubles || 0 });
        }
      });
    }
  };

  // tambah pelajaran: setiap kelas guru sendiri, atau satu pelajaran gabungan serentak
  function teacherOptions(sid, cur) {
    const s = S(), mine = s.teachers.filter((t) => t.subjectIds.includes(sid)), rest = s.teachers.filter((t) => !t.subjectIds.includes(sid));
    return (mine.length ? `<optgroup label="Mengajar subjek ini">${UI.optHtml(opts(mine, (t) => t.name), cur)}</optgroup>` : '') + `<optgroup label="Guru lain">${UI.optHtml(opts(rest, (t) => t.name), cur)}</optgroup>`;
  }
  function lessonWizard() {
    const s = S();
    if (!s.subjects.length || !s.classes.length || !s.teachers.length) { UI.toast('Isi dahulu subjek, kelas dan guru.', 'err'); return; }
    const sid = s.subjects[0].id;
    const body = `<div class="grid2">
      <label class="fld"><span>Subjek</span><select id="wzSubj" data-chg="wzSubject">${UI.optHtml(opts(s.subjects, (x) => x.name), sid)}</select></label>
      <label class="fld"><span>Bilik</span><select id="wzRoom"><option value="">(tiada)</option>${UI.optHtml(opts(s.rooms, (r) => r.name), '')}</select></label>
      <label class="fld"><span>Waktu seminggu</span><input id="wzPer" type="number" min="1" max="20" value="3"></label>
      <label class="fld"><span>Pasang berganda</span><input id="wzDbl" type="number" min="0" max="10" value="0"></label></div>
      <div class="fld"><span>Mod</span><div class="row"><label class="chk"><input type="radio" name="wzMode" value="asing" checked data-chg="wzMode">Satu pelajaran setiap kelas (guru boleh berbeza)</label>
      <label class="chk"><input type="radio" name="wzMode" value="gabung" data-chg="wzMode">Gabungan serentak (contoh Pendidikan Islam / Moral)</label></div></div>
      <div id="wzAsing"><span class="lbl">Kelas dan guru</span><table class="tbl"><tbody>${s.classes.map((c) => `<tr><td><label class="chk"><input type="checkbox" data-wz-cls value="${c.id}">${esc(c.name)}</label></td><td><select name="t_${c.id}" data-teacher-sel>${teacherOptions(sid, '')}</select></td></tr>`).join('')}</tbody></table>
        <button type="button" class="btn sm" data-act="wzAll">Pilih semua kelas</button></div>
      <div id="wzGabung" class="hidden"><span class="lbl">Kelas yang belajar serentak</span><div class="multi">${s.classes.map((c) => `<label class="chk"><input type="checkbox" data-wz-gc value="${c.id}">${esc(c.name)}</label>`).join('')}</div>
        <span class="lbl">Guru yang mengajar serentak (satu kumpulan setiap guru)</span><div class="multi">${s.teachers.map((t) => `<label class="chk"><input type="checkbox" data-wz-gt value="${t.id}">${esc(t.name)}</label>`).join('')}</div></div>
      <div id="formErr" class="err"></div>`;
    UI.modalOpen('Tambah pelajaran', body, '<button class="btn" data-act="modalClose">Batal</button><button class="btn primary" data-act="wzSave">Tambah</button>', true);
  }
  changes.wzSubject = (el) => document.querySelectorAll('[data-teacher-sel]').forEach((sel) => { sel.innerHTML = teacherOptions(el.value, sel.value); });
  changes.wzMode = () => {
    const g = document.querySelector('[name=wzMode]:checked').value === 'gabung';
    document.getElementById('wzAsing').classList.toggle('hidden', g); document.getElementById('wzGabung').classList.toggle('hidden', !g);
  };
  actions.wzAll = () => document.querySelectorAll('[data-wz-cls]').forEach((c) => { c.checked = true; });
  actions.wzSave = () => {
    const s = S(), $ = (id) => document.getElementById(id);
    const base = { subjectId: $('wzSubj').value, perWeek: num($('wzPer').value, 0), doubles: num($('wzDbl').value, 0), roomId: $('wzRoom').value || null };
    const fail = (m) => { $('formErr').textContent = m; };
    if (base.perWeek < 1) return fail('Waktu seminggu mesti sekurang-kurangnya 1.');
    if (base.doubles * 2 > base.perWeek) return fail('Pasang berganda terlalu banyak.');
    if (document.querySelector('[name=wzMode]:checked').value === 'gabung') {
      const cls = [...document.querySelectorAll('[data-wz-gc]:checked')].map((x) => x.value), tch = [...document.querySelectorAll('[data-wz-gt]:checked')].map((x) => x.value);
      if (!cls.length || !tch.length) return fail('Pilih kelas dan guru.');
      s.lessons.push(Object.assign({ id: TT.uid('l'), classIds: cls, teacherIds: tch }, base));
    } else {
      const cls = [...document.querySelectorAll('[data-wz-cls]:checked')].map((x) => x.value);
      if (!cls.length) return fail('Pilih sekurang-kurangnya satu kelas.');
      cls.forEach((c) => s.lessons.push(Object.assign({ id: TT.uid('l'), classIds: [c], teacherIds: [document.querySelector(`[name="t_${c}"]`).value] }, base)));
    }
    UI.modalClose(); UI.commit(); UI.toast('Pelajaran ditambah.');
  };

  ['guru', 'subjek', 'kelas', 'bilik', 'pelajaran'].forEach((k) => { actions['add-' + k] = () => forms[k](); });
  actions.edit = (el) => forms[el.dataset.kind](el.dataset.id);

  actions.del = (el) => {
    const { kind, id } = el.dataset, s = S();
    const arr = { guru: 'teachers', subjek: 'subjects', kelas: 'classes', bilik: 'rooms', pelajaran: 'lessons' }[kind];
    const used = kind === 'subjek' ? s.lessons.filter((l) => l.subjectId === id).length
      : kind === 'guru' ? s.lessons.filter((l) => l.teacherIds.includes(id)).length
        : kind === 'kelas' ? s.lessons.filter((l) => l.classIds.includes(id)).length
          : kind === 'bilik' ? s.lessons.filter((l) => l.roomId === id).length : 0;
    const msg = used ? `Item ini dipakai dalam ${used} pelajaran. Padam akan membuang rujukan itu (pelajaran tanpa kelas atau guru perlu dibetulkan). Teruskan?` : 'Padam item ini?';
    UI.confirm(msg, () => {
      s[arr] = s[arr].filter((x) => x.id !== id);
      if (kind === 'subjek') s.lessons = s.lessons.filter((l) => l.subjectId !== id);
      if (kind === 'kelas') { s.lessons = s.lessons.filter((l) => l.classIds.some((c) => c !== id)); s.lessons.forEach((l) => { l.classIds = l.classIds.filter((c) => c !== id); }); }
      if (kind === 'guru') {
        s.classes.forEach((c) => { if (c.homeroomId === id) c.homeroomId = null; });
        s.absences = s.absences.filter((a) => a.teacherId !== id);
        s.reliefs = s.reliefs.filter((r) => r.reliefTeacherId !== id && r.absentTeacherId !== id);
        if (UI.prefs.me === id) { UI.prefs.me = null; UI.savePrefs(); }
      }
      UI.commit();
    }, 'Padam');
  };

  actions.bulk = (el) => {
    const kind = el.dataset.kind;
    const help = { guru: 'Satu guru setiap baris: Nama, Kod, Panitia', subjek: 'Satu subjek setiap baris: Nama, Kod', kelas: 'Satu kelas setiap baris: Nama, Tingkatan', bilik: 'Satu bilik setiap baris: Nama, Jenis' }[kind];
    UI.openForm({
      title: 'Tambah ramai: ' + kind, saveLabel: 'Tambah', wide: true,
      fields: [{ key: 'text', label: help, type: 'textarea', rows: 10, hint: 'Tampal terus dari Excel pun boleh (lajur dipisahkan tab atau koma). Hanya nama yang wajib.' }],
      onSave: (v) => {
        const s = S();
        const lines = v.text.split(/\r?\n/).map((l) => l.split(/\t|,/).map((x) => x.trim())).filter((c) => c[0]);
        if (!lines.length) return 'Tiada data.';
        lines.forEach(([a, b, c]) => {
          if (kind === 'guru') s.teachers.push({ id: TT.uid('t'), name: a, short: b || short3(a), dept: c || '', subjectIds: [], maxPerDay: 7, maxPerWeek: 36, unavailable: {}, noRelief: false });
          else if (kind === 'subjek') s.subjects.push({ id: TT.uid('s'), name: a, short: b || a.slice(0, 3).toUpperCase(), color: PAL[s.subjects.length % PAL.length], heavy: false });
          else if (kind === 'kelas') s.classes.push({ id: TT.uid('c'), name: a, level: b || '', homeroomId: null });
          else s.rooms.push({ id: TT.uid('r'), name: a, type: b || '' });
        });
      }
    });
  };
})();
