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

  UI.gridHtml = (kind, id, editable, bad) => {
    const s = S(), m = TT.maps(s), days = TT.days(s), lim = TT.dayLimits(s);
    bad = bad || new Set();
    const at = days.map(() => ({}));
    placementsFor(kind, id, m).forEach((p) => {
      if (!at[p.day]) return;
      at[p.day][p.start] = { p, start: true };
      for (let k = 1; k < p.len; k++) at[p.day][p.start + k] = { p, start: false };
    });
    const teacher = kind === 'teacher' ? m.teacher.get(id) : null;
    let h = `<table class="grid"><thead><tr><th class="tcol">Waktu</th>${days.map((d) => `<th>${d.name}</th>`).join('')}</tr></thead><tbody>`;
    let p = 0;
    for (const per of s.periods) {
      if (per.type === 'break') { h += `<tr class="brk"><th class="tcol">${esc(per.label)}<small>${per.start}-${per.end}</small></th><td colspan="${days.length}"><span>${esc(per.label)}</span></td></tr>`; continue; }
      h += `<tr><th class="tcol">${esc(per.label)}<small>${per.start}-${per.end}</small></th>`;
      days.forEach((_, d) => {
        const c = at[d][p];
        if (c && !c.start) return;
        if (p >= lim[d]) { h += '<td class="cell off"></td>'; return; }
        if (c) {
          const l = m.lesson.get(c.p.lessonId), sub = m.subject.get(l.subjectId) || {};
          const btns = editable ? `<span class="cbtn"><button class="lock" data-act="lock" data-unit="${c.p.unit}" title="${c.p.locked ? 'Buka kunci' : 'Kunci waktu ini'}">${UI.icon(c.p.locked ? 'lock' : 'unlock')}</button><button class="lock" data-act="unplaceUnit" data-unit="${c.p.unit}" title="Keluarkan dari jadual">${UI.icon('x')}</button></span>`
            : (c.p.locked ? `<span class="lockd">${UI.icon('lock')}</span>` : '');
          h += `<td class="cell filled${bad.has(c.p.unit) ? ' bad' : ''}${c.p.locked ? ' locked' : ''}" rowspan="${c.p.len}"${editable ? ' draggable="true"' : ''} data-unit="${c.p.unit}" data-day="${d}" data-p="${p}" style="${tint(sub.color)}">${cellInner(kind, l, m)}${btns}</td>`;
        } else {
          const un = teacher && teacher.unavailable[`${d}-${p}`];
          h += `<td class="cell empty${un ? ' unav' : ''}" data-day="${d}" data-p="${p}">${un ? '<span>tidak boleh</span>' : ''}</td>`;
        }
      });
      h += '</tr>'; p++;
    }
    return h + '</tbody></table>';
  };

  UI.masterHtml = (type) => {
    const s = S(), m = TT.maps(s), days = TT.days(s), lim = TT.dayLimits(s);
    const byClass = type === 'mclass', list = byClass ? s.classes : s.teachers;
    const map = new Map();
    for (const pl of s.placements) {
      const l = m.lesson.get(pl.lessonId); if (!l) continue;
      for (const id of byClass ? l.classIds : l.teacherIds) for (let k = 0; k < pl.len; k++) map.set(`${id}|${pl.day}|${pl.start + k}`, l);
    }
    let h = '<table class="grid master"><thead><tr><th rowspan="2" class="tcol">' + (byClass ? 'Kelas' : 'Guru') + '</th>';
    days.forEach((d, i) => { if (lim[i]) h += `<th colspan="${lim[i]}" class="dayh">${d.short}</th>`; });
    h += '</tr><tr>';
    const sl = TT.slots(s);
    days.forEach((_, i) => { for (let p = 0; p < lim[i]; p++) h += `<th class="ph${p === 0 ? ' first' : ''}">${esc(sl[p].label)}</th>`; });
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
  };

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
      sub: `${weekText(s)} · ${TT.slots(s).length} waktu sehari${g ? ` · dijana ${new Date(g.at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}` : ''}`,
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
        <button class="btn" data-act="printView">${UI.icon('printer')} Cetak</button>
        <button class="btn danger" data-act="clearTT">Kosongkan</button></div></section>
      ${bannerBody ? `<div class="banner">${bannerBody}</div>` : ''}
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
      document.querySelectorAll('td.cell.empty[data-day]').forEach((td) => { if (TT.checkPlacement(S(), drag, +td.dataset.day, +td.dataset.p).ok) td.classList.add('ok'); });
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
    return `<section class="sheet"><h2>${esc(s.school.name)}</h2><h3>Jadual Waktu ${NAME[kind]}: ${esc(e.name)}</h3>${UI.gridHtml(kind, id, false)}${legend}</section>`;
  }
  const masterSheet = (k) => `<section class="sheet"><h2>${esc(S().school.name)}</h2><h3>Jadual Induk ${k === 'mclass' ? 'Kelas' : 'Guru'}</h3>${UI.masterHtml(k)}</section>`;
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
    const s = S(), v = TT.validate(s), grid = TT.teacherGrid(s), load = TT.teacherLoad(s), days = TT.days(s);
    const errs = v.issues.filter((i) => i.sev === 'error').length;
    const rel = new Map();
    s.reliefs.filter((r) => r.status === 'assigned').forEach((r) => rel.set(r.reliefTeacherId, (rel.get(r.reliefTeacherId) || 0) + r.periods.length));
    const trows = s.teachers.map((t) => {
      const g = grid.get(t.id); let gaps = 0;
      const per = g.map((day) => {
        let f = -1, l = -1, c = 0; day.forEach((x, p) => { if (x) { if (f < 0) f = p; l = p; c++; } });
        if (f >= 0) gaps += l - f + 1 - c; return c;
      });
      return `<tr><td>${esc(t.name)}</td><td>${esc(t.dept)}</td><td class="${load.get(t.id) > t.maxPerWeek ? 'bad' : ''}">${load.get(t.id)}</td>${per.map((n) => `<td>${n}</td>`).join('')}<td class="${gaps > 8 ? 'warn' : ''}">${gaps}</td><td>${rel.get(t.id) || 0}</td></tr>`;
    }).join('');
    const head = UI.pageHead({ crumbs: [['Laporan']], title: 'Laporan dan semakan', sub: `${v.issues.length} isu ditemui · ${s.teachers.length} guru`, metric: errs, metricLabel: 'konflik', tone: errs ? 'red' : 'green' });
    const issues = v.issues.length ? `<ul class="issues">${v.issues.slice(0, 60).map((i) => `<li class="${i.sev}">${esc(i.msg)}</li>`).join('')}</ul>` : '<p class="okmsg">Tiada konflik atau amaran. Jadual sah.</p>';
    const pb = (kind, label) => `<button class="btn" data-act="printAll" data-kind="${kind}">${UI.icon('printer')} ${label}</button>`;
    return head + `<section class="card"><div class="ch"><h2>Semakan jadual</h2></div>${issues}</section>
      <section class="card"><div class="ch"><div><h2>Cetak dan eksport</h2><small>Pilih "Save as PDF" dalam dialog cetak untuk simpan PDF. Saiz A4 landskap.</small></div></div><div class="row">
        ${pb('class', 'Semua jadual kelas')}${pb('teacher', 'Semua jadual guru')}${pb('room', 'Semua jadual bilik')}${pb('mclass', 'Induk kelas')}${pb('mteacher', 'Induk guru')}
        <button class="btn" data-act="exportCsv">${UI.icon('download')} CSV senarai waktu</button></div></section>
      <section class="card"><div class="ch"><h2>Beban guru</h2></div><div class="tablewrap"><table class="tbl"><thead><tr><th>Guru</th><th>Panitia</th><th>Waktu/mgg</th>${days.map((d) => `<th>${d.short}</th>`).join('')}<th>Waktu kosong</th><th>Relief</th></tr></thead><tbody>${trows || '<tr><td colspan="9" class="empty">Tiada guru.</td></tr>'}</tbody></table></div></section>`;
  };

  actions.exportCsv = () => {
    const s = S(), m = TT.maps(s), days = TT.days(s), rows = [['Hari', 'Waktu', 'Mula', 'Tamat', 'Kelas', 'Subjek', 'Guru', 'Bilik']];
    const sl = TT.slots(s);
    [...s.placements].sort((a, b) => a.day - b.day || a.start - b.start).forEach((p) => {
      const l = m.lesson.get(p.lessonId); if (!l) return;
      for (let k = 0; k < p.len; k++) rows.push([days[p.day].name, sl[p.start + k].label, sl[p.start + k].start, sl[p.start + k].end, TT.classNames(s, l.classIds), (m.subject.get(l.subjectId) || {}).name, l.teacherIds.map((i) => (m.teacher.get(i) || {}).name).join(' / '), (m.room.get(l.roomId) || {}).name || '']);
    });
    UI.download('jadual-waktu.csv', '﻿' + UI.csv(rows), 'text/csv');
  };
})();
