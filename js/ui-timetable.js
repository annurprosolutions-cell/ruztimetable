(function () {
  'use strict';
  const { esc, actions, changes, pages } = UI;
  const S = () => UI.state;

  const VIEWS = [['class', 'Kelas'], ['teacher', 'Guru'], ['room', 'Bilik'], ['mclass', 'Induk kelas'], ['mteacher', 'Induk guru']];
  const NAME = { class: 'Kelas', teacher: 'Guru', room: 'Bilik' };
  const entities = (type) => { const s = S(); return type === 'class' || type === 'mclass' ? s.classes : type === 'teacher' || type === 'mteacher' ? s.teachers : s.rooms; };
  const isMaster = (t) => t === 'mclass' || t === 'mteacher';
  const weekText = (s) => (s.school.weekMode === 'sun-thu' ? 'Ahad hingga Khamis' : 'Isnin hingga Jumaat');

  function ensureView() {
    const v = UI.view;
    if (isMaster(v.type)) return;
    const list = entities(v.type);
    if (!list.find((x) => x.id === v.id)) v.id = list.length ? list[0].id : null;
  }

  const tint = (c) => `--c:${esc(c || '#888')}`;

  function placementsFor(kind, id, m) {
    return S().placements.filter((p) => {
      const l = m.lesson.get(p.lessonId); if (!l) return false;
      return kind === 'class' ? l.classIds.includes(id) : kind === 'teacher' ? l.teacherIds.includes(id) : l.roomId === id;
    });
  }

  function cellInner(kind, l, m) {
    const sub = m.subject.get(l.subjectId) || { short: '?' };
    const tS = l.teacherIds.map((i) => (m.teacher.get(i) || {}).short).filter(Boolean).join('/');
    const cN = l.classIds.map((i) => (m.cls.get(i) || {}).name).filter(Boolean).join(', ');
    const room = (m.room.get(l.roomId) || {}).name;
    const meta = kind === 'class' ? tS : kind === 'teacher' ? cN : `${cN} · ${tS}`;
    return `<div class="sub">${esc(sub.short)}</div><div class="meta">${esc(meta)}</div>${room && kind !== 'room' ? `<div class="rm">${esc(room)}</div>` : ''}`;
  }

  // Paparan jadual. Kelas (atau semua paparan bila satu set waktu): baris = waktu set itu.
  // Guru/bilik bila waktu berbeza ikut set: baris = potongan masa (atom), supaya kelas Tahap 1 dan 2 tersusun ikut masa.
  // axis 'top' = hari di atas (lalai), 'left' = hari di sebelah kiri.
  UI.dayAxis = () => (UI.prefs.dayAxis === 'left' ? 'left' : 'top');
  UI.gridModel = (kind, id) => {
    const s = S(), m = TT.maps(s), tm = TT.timeModel(s), days = TT.days(s);
    const atomMode = tm.multi && kind !== 'class';
    const k = kind === 'class' ? (tm.classSet.get(id) || 0) : 0;
    const rows = [];
    if (atomMode) tm.atoms.forEach((a, i) => rows.push({ label: a.start, time: `${a.start}-${a.end}`, idx: i }));
    else {
      let p = 0;
      for (const per of TT.timeSetList(s)[k].periods) {
        if (per.type === 'break') rows.push({ brk: true, label: per.label, time: `${per.start}-${per.end}` });
        else rows.push({ label: per.label, time: `${per.start}-${per.end}`, idx: p++ });
      }
    }
    const lim = atomMode ? tm.aLim : tm.sets[k].limit;
    const at = days.map(() => ({}));
    placementsFor(kind, id, m).forEach((pl) => {
      if (!at[pl.day]) return;
      const l = m.lesson.get(pl.lessonId), lk = TT.lessonSetIdx(s, l, m.cls);
      const [r0, r1] = atomMode ? TT.atomRange(tm, lk, pl.start, pl.len) : [pl.start, pl.start + pl.len];
      at[pl.day][r0] = { pl, start: true, span: r1 - r0 };
      for (let r = r0 + 1; r < r1; r++) at[pl.day][r] = { pl, start: false };
    });
    let blocked = null;
    if (kind === 'teacher') {
      const t = m.teacher.get(id);
      if (t) {
        const un = TT.teacherUnavail(s, t);
        blocked = (d, r) => {
          if (!atomMode) { const v = un[`${d}-${r}`]; return v ? (typeof v === 'string' ? v : 'tidak boleh') : ''; }
          const hit = Object.keys(un).find((key) => { const [dd, p] = key.split('-').map(Number); const sp = tm.span[0][p]; return dd === d && sp && sp[0] <= r && r < sp[1]; });
          return hit ? (typeof un[hit] === 'string' ? un[hit] : 'tidak boleh') : '';
        };
      }
    }
    return { s, m, tm, days, rows, lim, at, atomMode, blocked, k };
  };

  UI.gridHtml = (kind, id, editable, bad, axis) => {
    const g = UI.gridModel(kind, id), { m, days, rows, lim, at } = g;
    bad = bad || new Set(); axis = axis || UI.dayAxis();
    if (g.atomMode) editable = false; // seret dalam paparan kelas bila waktu berbeza ikut set
    const cell = (d, r, vertical) => {
      const c = at[d][r];
      if (c && !c.start) return '';
      if (r >= lim[d]) return '<td class="cell off"></td>';
      if (c) {
        const l = m.lesson.get(c.pl.lessonId), sub = m.subject.get(l.subjectId) || {};
        const btns = editable ? `<span class="cbtn"><button class="lock" data-act="lock" data-unit="${c.pl.unit}" title="${c.pl.locked ? 'Buka kunci' : 'Kunci waktu ini'}">${UI.icon(c.pl.locked ? 'lock' : 'unlock')}</button><button class="lock" data-act="unplaceUnit" data-unit="${c.pl.unit}" title="Keluarkan dari jadual">${UI.icon('x')}</button></span>`
          : (c.pl.locked ? `<span class="lockd">${UI.icon('lock')}</span>` : '');
        const span = vertical ? `colspan="${c.span}"` : `rowspan="${c.span}"`;
        return `<td class="cell filled${bad.has(c.pl.unit) ? ' bad' : ''}${c.pl.locked ? ' locked' : ''}" ${span}${editable ? ' draggable="true"' : ''} data-unit="${c.pl.unit}" data-day="${d}" data-p="${r}" style="${tint(sub.color)}">${cellInner(kind, l, m)}${btns}</td>`;
      }
      const un = g.blocked && g.blocked(d, r);
      return `<td class="cell empty${un ? ' unav' : ''}"${editable ? ` data-day="${d}" data-p="${r}"` : ''}>${un ? `<span>${esc(un)}</span>` : ''}</td>`;
    };
    if (axis === 'left') {
      let h = `<table class="grid left${g.atomMode ? ' atoms' : ''}"><thead><tr><th class="tcol">Hari</th>${rows.map((x) => (x.brk ? `<th class="brkh">${esc(x.label)}</th>` : `<th>${esc(x.label)}<small>${esc(x.time)}</small></th>`)).join('')}</tr></thead><tbody>`;
      days.forEach((dy, d) => {
        h += `<tr><th class="tcol">${esc(dy.name)}</th>`;
        rows.forEach((x) => { h += x.brk ? (d === 0 ? `<td class="brkv" rowspan="${days.length}"><span>${esc(x.label)}</span></td>` : '') : cell(d, x.idx, true); });
        h += '</tr>';
      });
      return h + '</tbody></table>';
    }
    let h = `<table class="grid${g.atomMode ? ' atoms' : ''}"><thead><tr><th class="tcol">${g.atomMode ? 'Masa' : 'Waktu'}</th>${days.map((d) => `<th>${d.name}</th>`).join('')}</tr></thead><tbody>`;
    for (const x of rows) {
      if (x.brk) { h += `<tr class="brk"><th class="tcol">${esc(x.label)}<small>${esc(x.time)}</small></th><td colspan="${days.length}"><span>${esc(x.label)}</span></td></tr>`; continue; }
      h += `<tr><th class="tcol">${esc(x.label)}<small>${esc(x.time)}</small></th>${days.map((_, d) => cell(d, x.idx, false)).join('')}</tr>`;
    }
    return h + '</tbody></table>';
  };

  // jadual induk: satu baris setiap kelas/guru. Kelas dengan set waktu berlainan dipecah ikut set.
  UI.masterHtml = (type) => {
    const s = S(), tm = TT.timeModel(s);
    if (type === 'mclass' && tm.multi) {
      return tm.sets.map((st, k) => {
        const cls = s.classes.filter((c) => (tm.classSet.get(c.id) || 0) === k);
        return cls.length ? `<h3 class="seth">${esc(st.name)}</h3>${masterTable(type, cls, k)}` : '';
      }).join('');
    }
    return masterTable(type, type === 'mclass' ? s.classes : s.teachers, 0);
  };
  function masterTable(type, list, k) {
    const s = S(), m = TT.maps(s), tm = TT.timeModel(s), days = TT.days(s);
    const byClass = type === 'mclass', atomMode = !byClass && tm.multi;
    const lim = atomMode ? tm.aLim : tm.sets[k].limit;
    const labels = atomMode ? tm.atoms.map((a) => a.start) : tm.sets[k].slots.map((x) => x.label);
    const map = new Map();
    for (const pl of s.placements) {
      const l = m.lesson.get(pl.lessonId); if (!l) continue;
      const [r0, r1] = atomMode ? TT.atomRange(tm, TT.lessonSetIdx(s, l, m.cls), pl.start, pl.len) : [pl.start, pl.start + pl.len];
      for (const id of byClass ? l.classIds : l.teacherIds) for (let r = r0; r < r1; r++) map.set(`${id}|${pl.day}|${r}`, l);
    }
    let h = '<table class="grid master"><thead><tr><th rowspan="2" class="tcol">' + (byClass ? 'Kelas' : 'Guru') + '</th>';
    days.forEach((d, i) => { if (lim[i]) h += `<th colspan="${lim[i]}" class="dayh">${d.short}</th>`; });
    h += '</tr><tr>';
    days.forEach((_, i) => { for (let p = 0; p < lim[i]; p++) h += `<th class="ph${p === 0 ? ' first' : ''}">${esc(labels[p])}</th>`; });
    h += '</tr></thead><tbody>';
    for (const e of list) {
      h += `<tr><th class="tcol">${esc(byClass ? e.name : e.short)}</th>`;
      days.forEach((_, d) => {
        for (let p = 0; p < lim[d]; p++) {
          const l = map.get(`${e.id}|${d}|${p}`), f = p === 0 ? ' first' : '';
          if (!l) { h += `<td class="cell empty${f}"></td>`; continue; }
          const sub = m.subject.get(l.subjectId) || {};
          const other = byClass ? l.teacherIds.map((i) => (m.teacher.get(i) || {}).short).join('/') : l.classIds.map((i) => (m.cls.get(i) || {}).name).join(',');
          h += `<td class="cell filled${f}" style="${tint(sub.color)}"><div class="sub">${esc(sub.short)}</div><div class="meta">${esc(other)}</div></td>`;
        }
      });
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }

  // ---------------- halaman Jadual (pentadbir) ----------------
  pages.jadual = () => {
    const s = S(); ensureView();
    const v = UI.view, master = isMaster(v.type), list = entities(v.type), m = TT.maps(s);
    const val = TT.validate(s), bad = val.bad, errs = val.issues.filter((i) => i.sev === 'error');
    const un = TT.unplaced(s), total = TT.buildUnits(s).length;
    const ent = !master && list.find((x) => x.id === v.id);
    const g = UI.lastGen;
    const head = UI.pageHead({
      crumbs: [['Jadual']], title: master ? `Jadual induk · ${v.type === 'mclass' ? 'Kelas' : 'Guru'}` : `Jadual waktu · ${ent ? ent.name : NAME[v.type]}`,
      sub: `${weekText(s)} · ${TT.multiTime(s) ? `${TT.timeSetList(s).length} set waktu` : `${TT.slots(s).length} waktu sehari`}${g ? ` · dijana ${new Date(g.at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
      metric: total ? Math.round(((total - un.length) / total) * 100) + '%' : '-', metricLabel: 'waktu diletak', tone: un.length ? 'amber' : 'green',
      tabs: VIEWS, tab: v.type, scope: 'viewType'
    });
    const unHere = master ? un : un.filter((u) => {
      const l = m.lesson.get(u.lessonId);
      return v.type === 'class' ? l.classIds.includes(v.id) : v.type === 'teacher' ? l.teacherIds.includes(v.id) : l.roomId === v.id;
    });
    const bannerBody = g ? `<b>Jana terakhir:</b> ${g.placements.length}/${g.placements.length + g.unplaced.length} waktu diletak. Waktu kosong guru ${g.metrics.teacherGaps}, waktu kosong kelas ${g.metrics.classGaps}, pelajaran berulang pada hari sama ${g.metrics.repeats}.
      ${g.unplaced.length ? `<ul class="issues">${g.unplaced.slice(0, 8).map((u) => `<li class="warn">${esc(TT.lessonLabel(s, m.lesson.get(u.lessonId) || { classIds: [] }))}: ${esc(u.reason)}</li>`).join('')}</ul>` : ''}` : '';
    const nav = master ? '' : `<div class="entnav"><button class="iconbtn sm" data-act="viewStep" data-dir="-1" aria-label="Sebelum">${UI.icon('chevLeft')}</button>
      <select data-chg="viewId">${UI.optHtml(list.map((x) => ({ v: x.id, t: x.name })), v.id)}</select><button class="iconbtn sm" data-act="viewStep" data-dir="1" aria-label="Seterusnya">${UI.icon('chevRight')}</button></div>`;
    const body = !s.lessons.length ? '<p class="empty">Belum ada pelajaran. Tambah di Data &gt; Pelajaran, atau muat data contoh di Tetapan &gt; Storan.</p>'
      : master ? `<div class="tablewrap">${UI.masterHtml(v.type)}</div>`
        : list.length ? `<div class="tablewrap">${UI.gridHtml(v.type, v.id, true, bad)}</div>` : '<p class="empty">Tiada data.</p>';
    return head + `<section class="card toolbar-card"><div class="toolbar">${nav}<span class="grow"></span>
        <span class="chip-s ${un.length ? 'amber' : 'green'}">${total - un.length}/${total} diletak</span>${errs.length ? `<span class="chip-s red">${errs.length} konflik</span>` : ''}
        <button class="btn primary" data-act="generate">${UI.icon('spark')} Jana jadual</button>
        ${master ? '' : `<button class="btn" data-act="axisToggle" title="Tukar kedudukan hari">${UI.dayAxis() === 'left' ? 'Hari di atas' : 'Hari di kiri'}</button>`}
        <button class="btn" data-act="printView">${UI.icon('printer')} Cetak</button>${master ? '' : `<button class="btn" data-act="xlsxView">${UI.icon('download')} Excel</button>`}
        <button class="btn danger" data-act="clearTT">Kosongkan</button></div></section>
      ${bannerBody ? `<div class="banner">${bannerBody}</div>` : ''}
      ${TT.multiTime(s) && !master && v.type !== 'class' ? '<div class="banner">Waktu berbeza ikut set: paparan guru dan bilik disusun ikut masa. Untuk seret dan alih waktu, guna paparan Kelas.</div>' : ''}
      <div class="tt-layout${master ? ' full' : ''}"><section class="card tt-main">${body}</section>
        ${master ? '' : `<aside class="card tt-side" data-drop="unplace"><div class="ch"><h3>Belum diletak (${unHere.length})</h3></div>
          <p class="hint">Seret ke petak kosong. Seret waktu dalam jadual ke petak lain untuk alih atau tukar tempat. Petak hijau = sah.</p>
          <div class="chips">${unHere.map((u) => { const l = m.lesson.get(u.lessonId), sub = m.subject.get(l.subjectId) || {}; return `<div class="chip" draggable="true" data-unit="${u.id}" style="${tint(sub.color)}">${esc(TT.lessonLabel(s, l))}${u.len > 1 ? ' <b>(2 waktu)</b>' : ''}</div>`; }).join('') || '<em class="hint">Semua sudah diletak.</em>'}</div>
          <p class="hint">Seret waktu dari jadual ke sini untuk keluarkan.</p>
          ${errs.length ? `<h3>Konflik (${errs.length})</h3><ul class="issues">${errs.slice(0, 6).map((i) => `<li class="error">${esc(i.msg)}</li>`).join('')}</ul>` : ''}
        </aside>`}</div>`;
  };

  changes.viewId = (el) => { UI.view.id = el.value; UI.render(); };
  actions.viewStep = (el) => {
    const list = entities(UI.view.type); const i = list.findIndex((x) => x.id === UI.view.id);
    if (!list.length) return; UI.view.id = list[(i + +el.dataset.dir + list.length) % list.length].id; UI.render();
  };
  actions.axisSet = (el) => { UI.prefs.dayAxis = el.dataset.v; UI.savePrefs(); UI.render(); };
  actions.axisToggle = () => { UI.prefs.dayAxis = UI.dayAxis() === 'left' ? 'top' : 'left'; UI.savePrefs(); UI.render(); };
  actions.lock = (el, e) => { e.stopPropagation(); TT.toggleLock(S(), el.dataset.unit); UI.save(); UI.render(); };
  actions.unplaceUnit = (el, e) => {
    e.stopPropagation();
    if (!TT.unplace(S(), el.dataset.unit)) UI.toast('Waktu ini dikunci.', 'err'); else UI.save();
    UI.render();
  };
  actions.clearTT = () => UI.confirm('Keluarkan semua waktu daripada jadual? Waktu yang dikunci kekal.', () => { S().placements = S().placements.filter((p) => p.locked); UI.lastGen = null; UI.commit(); }, 'Kosongkan');

  // ---------------- jana ----------------
  actions.generate = () => {
    const s = S();
    if (!s.lessons.length) { UI.toast('Tiada pelajaran untuk dijana.', 'err'); return; }
    const pre = TT.precheck(s);
    const errs = pre.filter((i) => i.sev === 'error'), warns = pre.filter((i) => i.sev === 'warn');
    const locked = s.placements.filter((p) => p.locked).length;
    const body = `${errs.length ? `<div class="banner bad"><b>Masalah data yang pasti menghalang jadual lengkap:</b><ul class="issues">${errs.slice(0, 8).map((i) => `<li class="error">${esc(i.msg)}</li>`).join('')}</ul></div>` : ''}
      ${warns.length ? `<ul class="issues">${warns.slice(0, 5).map((i) => `<li class="warn">${esc(i.msg)}</li>`).join('')}</ul>` : ''}
      <label class="fld"><span>Mod</span><select id="gMode"><option value="fresh">Jana baharu (hanya ${locked} waktu dikunci dikekalkan)</option><option value="keep"${s.placements.length && !locked ? ' selected' : ''}>Kekalkan susunan semasa: letak yang belum ada, kemudian optimumkan</option></select></label>
      <label class="fld"><span>Usaha pengoptimuman</span><select id="gEffort"><option value="2000">Cepat (2 saat)</option><option value="6000" selected>Biasa (6 saat)</option><option value="20000">Teliti (20 saat)</option></select>
      <span class="hint">Lebih lama = kurang waktu kosong guru dan sebaran subjek lebih baik. Penjanaan berjalan di latar belakang, skrin tidak beku.</span></label>`;
    UI.modalOpen('Jana jadual', body, '<button class="btn" data-act="modalClose">Batal</button><button class="btn primary" data-act="genStart">Mula</button>');
  };

  actions.genStart = () => {
    const keep = document.getElementById('gMode').value === 'keep', ms = +document.getElementById('gEffort').value;
    UI.modalOpen('Menjana jadual', '<div class="prog"><div id="gbar"></div></div><p id="gtxt" class="hint">Memulakan...</p>', '<button class="btn" data-act="genCancel">Batal</button>');
    const job = TT.runSolver(S(), { keep, improveMs: ms }, (pr, frac) => {
      const bar = document.getElementById('gbar'), txt = document.getElementById('gtxt');
      if (bar) bar.style.width = (frac * 100).toFixed(0) + '%';
      if (txt) txt.textContent = pr.phase === 'construct' ? `Meletakkan waktu: ${pr.placed}/${pr.total}` : 'Memperbaiki susunan (kurangkan waktu kosong guru)...';
    });
    UI._gen = job;
    job.promise.then(({ result, mode }) => {
      if (UI._gen !== job) return;
      UI._gen = null; UI._lastRunMode = mode;
      S().placements = result.placements;
      UI.lastGen = Object.assign({ at: new Date().toISOString(), mode }, result);
      UI.modalClose(); UI.save(); UI.render();
      UI.toast(result.unplaced.length ? `Siap, tetapi ${result.unplaced.length} waktu tidak dapat diletak. Lihat sebab di atas jadual.` : 'Jadual siap. Semua waktu diletak tanpa konflik.', result.unplaced.length ? 'err' : '');
    }, (err) => {
      if (UI._gen !== job) return;
      UI._gen = null; UI.modalClose(); UI.toast('Penjanaan gagal: ' + (err && err.message), 'err');
    });
  };
  actions.genCancel = () => { if (UI._gen) { UI._gen.cancel(); UI._gen = null; } UI.modalClose(); };

  // ---------------- seret dan lepas ----------------
  let drag = null;
  const clearHi = () => document.querySelectorAll('.cell.ok,.dragging,.drop-un').forEach((x) => x.classList.remove('ok', 'dragging', 'drop-un'));
  document.addEventListener('dragstart', (e) => {
    const el = e.target.closest && e.target.closest('[data-unit][draggable="true"]'); if (!el) return;
    drag = el.dataset.unit; e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      el.classList.add('dragging');
      const ctx = TT.placeCtx(S());
      document.querySelectorAll('td.cell.empty[data-day]').forEach((td) => { if (TT.checkPlacement(S(), drag, +td.dataset.day, +td.dataset.p, null, ctx).ok) td.classList.add('ok'); });
    }, 0);
  });
  document.addEventListener('dragend', () => { drag = null; clearHi(); });
  document.addEventListener('dragover', (e) => {
    if (!drag) return;
    if (e.target.closest('td.cell[data-day]')) e.preventDefault();
    else if (e.target.closest('[data-drop="unplace"]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('drop-un'); }
  });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop-un'); });
  document.addEventListener('drop', (e) => {
    if (!drag) return;
    const id = drag, td = e.target.closest('td.cell[data-day]'), zone = e.target.closest('[data-drop="unplace"]');
    if (td) {
      e.preventDefault();
      const r = TT.applyMove(S(), id, +td.dataset.day, +td.dataset.p);
      drag = null;
      if (r.ok) { UI.save(); UI.render(); if (r.swapped) UI.toast('Ditukar tempat.'); } else { clearHi(); UI.toast(r.reason, 'err'); }
    } else if (zone) {
      e.preventDefault(); drag = null;
      if (!TT.unplace(S(), id)) UI.toast('Waktu ini dikunci.', 'err'); else UI.save();
      UI.render();
    }
  });

  // ---------------- cetak ----------------
  function sheet(kind, id) {
    const s = S(), m = TT.maps(s);
    const e = entities(kind).find((x) => x.id === id); if (!e) return '';
    let legend = '';
    if (kind === 'class') {
      const rows = s.lessons.filter((l) => l.classIds.includes(id)).map((l) => `<tr><td>${esc((m.subject.get(l.subjectId) || {}).name)}</td><td>${l.teacherIds.map((t) => esc((m.teacher.get(t) || {}).name)).join(' / ')}</td><td>${l.perWeek}</td></tr>`).join('');
      const homeroom = (m.teacher.get(e.homeroomId) || {}).name;
      legend = `<table class="tbl legend"><thead><tr><th>Subjek</th><th>Guru</th><th>W/mgg</th></tr></thead><tbody>${rows}</tbody></table>${homeroom ? `<p>Guru kelas: ${esc(homeroom)}</p>` : ''}`;
    }
    return `<section class="sheet">${UI.sheetHead()}<h3>Jadual Waktu ${NAME[kind]}: ${esc(e.name)}</h3>${UI.gridHtml(kind, id, false)}${legend}</section>`;
  }
  const masterSheet = (k) => `<section class="sheet">${UI.sheetHead()}<h3>Jadual Induk ${k === 'mclass' ? 'Kelas' : 'Guru'}</h3>${UI.masterHtml(k)}</section>`;
  actions.printView = () => { const v = UI.view; UI.print(isMaster(v.type) ? masterSheet(v.type) : sheet(v.type, v.id)); };
  actions.printAll = (el) => {
    const k = el.dataset.kind;
    UI.print(isMaster(k) ? masterSheet(k) : entities(k).map((e) => sheet(k, e.id)).join(''));
  };
  actions.printMine = () => { const t = UI.meTeacher(); if (t) UI.print(sheet('teacher', t.id)); };

  // ---------------- Jadual saya (guru) ----------------
  pages.jadualku = () => {
    const s = S(), t = UI.meTeacher();
    if (!t) return UI.pickMe();
    const m = TT.maps(s), load = TT.teacherLoad(s).get(t.id) || 0;
    const mine = s.lessons.filter((l) => l.teacherIds.includes(t.id));
    const head = UI.pageHead({ crumbs: [['Jadual saya']], title: `Jadual saya · ${t.name}`, sub: `${weekText(s)} · ${mine.length} pelajaran · ${new Set(mine.flatMap((l) => l.classIds)).size} kelas`, metric: load, metricLabel: 'waktu seminggu', tone: 'blue' });
    const rows = mine.map((l) => `<tr><td><span class="sw" style="background:${esc((m.subject.get(l.subjectId) || {}).color || '#999')}"></span>${esc((m.subject.get(l.subjectId) || {}).name || '?')}</td><td>${esc(TT.classNames(s, l.classIds))}</td><td>${l.perWeek}</td><td>${esc((m.room.get(l.roomId) || {}).name || '')}</td></tr>`).join('');
    return head + `<section class="card toolbar-card"><div class="toolbar"><span class="grow"></span><button class="btn" data-act="printMine">${UI.icon('printer')} Cetak jadual saya</button></div></section>
      <section class="card">${s.placements.length ? `<div class="tablewrap">${UI.gridHtml('teacher', t.id, false)}</div>` : '<p class="empty">Jadual belum dijana oleh pentadbir.</p>'}</section>
      <section class="card"><div class="ch"><h2>Pelajaran saya</h2></div><div class="tablewrap"><table class="tbl"><thead><tr><th>Subjek</th><th>Kelas</th><th>Waktu/mgg</th><th>Bilik</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Tiada pelajaran.</td></tr>'}</tbody></table></div></section>`;
  };

  // ---------------- LAPORAN ----------------
  pages.laporan = () => {
    const s = S(), v = TT.validate(s), tm = TT.timeModel(s), grid = TT.teacherGrid(s, tm), load = TT.teacherLoad(s), days = TT.days(s);
    const errs = v.issues.filter((i) => i.sev === 'error').length;
    const rel = new Map();
    s.reliefs.filter((r) => r.status === 'assigned').forEach((r) => rel.set(r.reliefTeacherId, (rel.get(r.reliefTeacherId) || 0) + r.periods.length));
    const trows = s.teachers.map((t) => {
      // waktu sehari = jumlah panjang pelajaran; waktu kosong ditimbang ikut tempoh (set berbilang)
      const g = grid.get(t.id); let gaps = 0;
      const per = g.map((day) => {
        let f = -1, l = -1, c = 0, n = 0; const seen = new Set();
        day.forEach((x, a) => { if (x) { if (f < 0) f = a; l = a; c += tm.aw[a]; if (!seen.has(x)) { seen.add(x); n += x.len; } } });
        if (f >= 0) { let w = 0; for (let a = f; a <= l; a++) w += tm.aw[a]; gaps += w - c; }
        return n;
      });
      gaps = Math.round(gaps);
      return `<tr><td>${esc(t.name)}</td><td>${esc(t.dept)}</td><td class="${load.get(t.id) > t.maxPerWeek ? 'bad' : ''}">${load.get(t.id)}</td>${per.map((n) => `<td>${n}</td>`).join('')}<td class="${gaps > 8 ? 'warn' : ''}">${gaps}</td><td>${rel.get(t.id) || 0}</td></tr>`;
    }).join('');
    const head = UI.pageHead({ crumbs: [['Laporan']], title: 'Laporan dan semakan', sub: `${v.issues.length} isu ditemui · ${s.teachers.length} guru`, metric: errs, metricLabel: 'konflik', tone: errs ? 'red' : 'green' });
    const issues = v.issues.length ? `<ul class="issues">${v.issues.slice(0, 60).map((i) => `<li class="${i.sev}">${esc(i.msg)}</li>`).join('')}</ul>` : '<p class="okmsg">Tiada konflik atau amaran. Jadual sah.</p>';
    const pb = (kind, label) => `<button class="btn" data-act="printAll" data-kind="${kind}">${UI.icon('printer')} ${label}</button>`;
    const xb = (kind, label) => `<button class="btn" data-act="xlsxAll" data-kind="${kind}">${UI.icon('download')} ${label}</button>`;
    const axis = UI.dayAxis();
    return head + `<section class="card"><div class="ch"><h2>Semakan jadual</h2></div>${issues}</section>
      <section class="card"><div class="ch"><div><h2>Cetak dan muat turun</h2><small>Pilih "Save as PDF" dalam dialog cetak untuk simpan PDF. Excel: satu tab setiap guru, kelas atau bilik.</small></div>
        <div class="seg sub mini"><button class="${axis === 'top' ? 'on' : ''}" data-act="axisSet" data-v="top">Hari di atas</button><button class="${axis === 'left' ? 'on' : ''}" data-act="axisSet" data-v="left">Hari di kiri</button></div></div>
        <h3 class="sub">Guru sahaja</h3><div class="row">${pb('teacher', 'Cetak semua jadual guru')}${xb('teacher', 'Excel jadual guru')}${pb('mteacher', 'Cetak induk guru')}</div>
        <h3 class="sub">Kelas sahaja</h3><div class="row">${pb('class', 'Cetak semua jadual kelas')}${xb('class', 'Excel jadual kelas')}${pb('mclass', 'Cetak induk kelas')}</div>
        <h3 class="sub">Bilik sahaja (makmal, bengkel, bilik khas)</h3><div class="row">${pb('room', 'Cetak semua jadual bilik')}${xb('room', 'Excel jadual bilik')}</div>
        <h3 class="sub">Lain-lain</h3><div class="row"><button class="btn" data-act="exportCsv">${UI.icon('download')} CSV senarai waktu</button></div></section>
      <section class="card"><div class="ch"><h2>Beban guru</h2></div><div class="tablewrap"><table class="tbl"><thead><tr><th>Guru</th><th>Panitia</th><th>Waktu/mgg</th>${days.map((d) => `<th>${d.short}</th>`).join('')}<th>Waktu kosong</th><th>Relief</th></tr></thead><tbody>${trows || '<tr><td colspan="9" class="empty">Tiada guru.</td></tr>'}</tbody></table></div></section>`;
  };

  // ---------------- Excel: satu tab setiap guru / kelas / bilik, ikut kedudukan hari pilihan ----------------
  const cellText = (kind, l, m) => {
    const sub = m.subject.get(l.subjectId) || { short: '?' };
    const tS = l.teacherIds.map((i) => (m.teacher.get(i) || {}).short).filter(Boolean).join('/');
    const cN = l.classIds.map((i) => (m.cls.get(i) || {}).name).filter(Boolean).join(', ');
    const room = (m.room.get(l.roomId) || {}).name;
    return [sub.short, kind === 'class' ? tS : kind === 'teacher' ? cN : `${cN} ${tS}`, kind !== 'room' ? room : ''].filter(Boolean).join('\n');
  };
  UI.gridSheet = (kind, id, axis) => {
    const g = UI.gridModel(kind, id), { m, days, rows, lim, at } = g, ent = entities(kind).find((x) => x.id === id) || {};
    const title = `Jadual Waktu ${NAME[kind]}: ${ent.name || ''} · ${S().school.name}`;
    const out = [[title]], merges = [], col = TT.xlsxColName;
    const text = (d, r) => { const c = at[d][r]; if (r >= lim[d]) return ''; if (c) return c.start ? cellText(kind, m.lesson.get(c.pl.lessonId), m) : null; const un = g.blocked && g.blocked(d, r); return un ? `(${un})` : ''; };
    if (axis === 'left') {
      out.push(['Hari'].concat(rows.map((x) => (x.brk ? x.label : `${x.label}\n${x.time}`))));
      days.forEach((dy, d) => {
        const row = [dy.name];
        rows.forEach((x, ci) => {
          if (x.brk) { row.push(d === 0 ? x.label : ''); return; }
          const v = text(d, x.idx), c = at[d][x.idx];
          row.push(v == null ? '' : v);
          if (c && c.start && c.span > 1) merges.push(`${col(ci + 1)}${out.length + 1}:${col(ci + c.span)}${out.length + 1}`);
        });
        out.push(row);
      });
      rows.forEach((x, ci) => { if (x.brk && days.length > 1) merges.push(`${col(ci + 1)}3:${col(ci + 1)}${2 + days.length}`); });
      return { name: ent.short || ent.name, rows: out, merges, bold: [0, 1], grid: true, gridFrom: 1, widths: [10].concat(rows.map((x) => (x.brk ? 6 : 12))) };
    }
    out.push([g.atomMode ? 'Masa' : 'Waktu'].concat(days.map((d) => d.name)));
    rows.forEach((x) => {
      const ri = out.length + 1;
      if (x.brk) { out.push([`${x.label}\n${x.time}`, x.label]); if (days.length > 1) merges.push(`B${ri}:${col(days.length)}${ri}`); return; }
      const row = [`${x.label}\n${x.time}`];
      days.forEach((_, d) => {
        const v = text(d, x.idx), c = at[d][x.idx];
        row.push(v == null ? '' : v);
        if (c && c.start && c.span > 1) merges.push(`${col(d + 1)}${ri}:${col(d + 1)}${ri + c.span - 1}`);
      });
      out.push(row);
    });
    return { name: ent.short || ent.name, rows: out, merges, bold: [0, 1], grid: true, gridFrom: 1, widths: [12].concat(days.map(() => 18)) };
  };
  const saveXlsx = (name, sheets) => {
    const bytes = TT.xlsxWrite(sheets);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  actions.xlsxAll = (el) => {
    const k = el.dataset.kind, list = entities(k), s = S();
    if (!list.length) { UI.toast('Tiada data.', 'err'); return; }
    const slug = s.school.name.replace(/\W+/g, '-').toLowerCase();
    saveXlsx(`jadual-${{ class: 'kelas', teacher: 'guru', room: 'bilik' }[k]}-${slug}.xlsx`, list.map((e) => UI.gridSheet(k, e.id, UI.dayAxis())));
  };
  actions.xlsxView = () => {
    const v = UI.view; if (isMaster(v.type) || !v.id) return;
    const e = entities(v.type).find((x) => x.id === v.id); if (!e) return;
    saveXlsx(`jadual-${String(e.name).replace(/\W+/g, '-').toLowerCase()}.xlsx`, [UI.gridSheet(v.type, v.id, UI.dayAxis())]);
  };

  actions.exportCsv = () => {
    const s = S(), m = TT.maps(s), days = TT.days(s), rows = [['Hari', 'Waktu', 'Mula', 'Tamat', 'Kelas', 'Subjek', 'Guru', 'Bilik']];
    const out = [];
    s.placements.forEach((p) => {
      const l = m.lesson.get(p.lessonId); if (!l) return;
      const sl = TT.slots(s, TT.lessonSetIdx(s, l, m.cls));
      for (let k = 0; k < p.len; k++) out.push([p.day, sl[p.start + k].start, [days[p.day].name, sl[p.start + k].label, sl[p.start + k].start, sl[p.start + k].end, TT.classNames(s, l.classIds), (m.subject.get(l.subjectId) || {}).name, l.teacherIds.map((i) => (m.teacher.get(i) || {}).name).join(' / '), (m.room.get(l.roomId) || {}).name || '']]);
    });
    out.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).forEach((x) => rows.push(x[2]));
    UI.download('jadual-waktu.csv', '﻿' + UI.csv(rows), 'text/csv');
  };
})();
