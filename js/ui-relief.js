(function () {
  'use strict';
  const { esc, actions, changes, pages } = UI;
  const S = () => UI.state;
  const R = () => UI.relief;

  const periodText = (s, ps) => {
    const sl = TT.slots(s), a = ps[0], b = ps[ps.length - 1];
    return a === b ? `Waktu ${sl[a].label}<small>${sl[a].start}-${sl[a].end}</small>` : `Waktu ${sl[a].label}-${sl[b].label}<small>${sl[a].start}-${sl[b].end}</small>`;
  };

  pages.relief = () => {
    const s = S(), r = R();
    let head;
    if (r.tab === 'kalendar') head = { title: 'Kalendar relief', sub: esc(TT.monthLabel(r.month)) };
    else if (r.tab === 'statistik') { const st = TT.reliefStats(s, r.from, r.to).summary; head = { title: 'Statistik kesaksamaan', sub: `${TT.fmtDate(r.from)} hingga ${TT.fmtDate(r.to)}`, metric: st.sd.toFixed(1), metricLabel: 'sisihan piawai (kecil = adil)', tone: 'blue' }; }
    else if (r.tab === 'sejarah') head = { title: 'Sejarah relief', sub: `${TT.fmtDate(r.from)} hingga ${TT.fmtDate(r.to)}` };
    else {
      const sum = TT.reliefSummary(s, r.date);
      head = { title: 'Relief harian', sub: `${esc(TT.weekdayOf(r.date))}, ${TT.fmtDate(r.date)} · ${sum.absent.length} guru tidak hadir`, metric: `${sum.periods - sum.open}/${sum.periods}`, metricLabel: 'waktu diselesaikan', tone: sum.open ? 'red' : 'green' };
    }
    const tabs = [['harian', 'Harian'], ['kalendar', 'Kalendar'], ['statistik', 'Statistik'], ['sejarah', 'Sejarah']];
    return UI.pageHead(Object.assign({ crumbs: [['Relief']], tabs, tab: r.tab, scope: 'reliefTab' }, head)) +
      ({ harian: daily, kalendar: calendar, statistik: stats, sejarah: history }[r.tab] || daily)();
  };

  // ---------------- harian ----------------
  function daily() {
    const s = S(), iso = R().date, day = TT.dateToDay(s, iso), m = TT.maps(s), sl = TT.slots(s);
    const abs = s.absences.filter((a) => a.date === iso);
    const needs = TT.reliefNeeds(s, iso), grid = TT.teacherGrid(s);
    const absRows = abs.map((a) => {
      const t = m.teacher.get(a.teacherId) || { name: '?' };
      const scope = a.from == null && a.to == null ? 'Sehari penuh' : `Waktu ${(a.from || 0) + 1} hingga ${(a.to == null ? sl.length - 1 : a.to) + 1}`;
      const n = needs.filter((x) => x.absenceId === a.id).reduce((c, x) => c + x.periods.length, 0);
      return `<tr><td><span class="av sm">${esc(UI.initials(t.name))}</span>${esc(t.name)}</td><td><span class="chip-s grey">${esc(a.reason)}</span>${a.note ? `<small>${esc(a.note)}</small>` : ''}</td><td>${scope}</td><td>${n} waktu perlu ganti</td><td class="acts"><button class="btn sm danger" data-act="absenceDel" data-id="${a.id}">Padam</button></td></tr>`;
    }).join('');

    const rows = needs.map((n) => {
      const rec = TT.reliefRecord(s, n), cands = TT.reliefCandidates(s, n, { grid });
      const at = m.teacher.get(n.absentTeacherId) || { name: '?' }, sub = m.subject.get(n.subjectId) || {};
      const cur = rec && rec.status === 'assigned' ? 't:' + rec.reliefTeacherId : rec ? rec.status : '';
      let o = '<option value="">- Pilih guru ganti -</option>';
      o += cands.map((c, i) => `<option value="t:${c.teacher.id}"${cur === 't:' + c.teacher.id ? ' selected' : ''}>${i === 0 ? '★ ' : ''}${esc(c.teacher.name)} · skor ${c.score}${c.tag.length ? ' · ' + esc(c.tag.join(', ')) : ''}</option>`).join('');
      if (cur.startsWith('t:') && !cands.some((c) => 't:' + c.teacher.id === cur)) o += `<option value="${cur}" selected>${esc((m.teacher.get(cur.slice(2)) || {}).name)} (tidak lagi sesuai)</option>`;
      o += `<option value="kendiri"${cur === 'kendiri' ? ' selected' : ''}>Kelas kendiri (beri tugasan)</option><option value="gabung"${cur === 'gabung' ? ' selected' : ''}>Gabung dengan kelas lain</option>`;
      const sel = rec && rec.status === 'assigned' ? cands.find((c) => c.teacher.id === rec.reliefTeacherId) : null;
      const why = sel ? sel.parts.map((p) => `${p.label} (${p.v > 0 ? '+' : ''}${Math.round(p.v * 10) / 10})`).join(', ') : (!cands.length && !rec ? 'Tiada guru kosong yang layak pada waktu ini.' : '');
      return `<tr class="${rec ? 'done' : 'todo'}"><td class="nowrap">${periodText(s, n.periods)}</td><td>${esc(TT.classNames(s, n.classIds))}</td>
        <td><span class="sw" style="background:${esc(sub.color || '#999')}"></span>${esc(sub.name || '?')}${n.roomId ? `<small>${esc((m.room.get(n.roomId) || {}).name)}</small>` : ''}</td>
        <td>${esc(at.name)}</td><td><select data-chg="reliefPick" data-key="${esc(n.key)}">${o}</select>${why ? `<small class="why">${esc(why)}</small>` : ''}</td></tr>`;
    }).join('');

    const per = new Map();
    s.reliefs.filter((r) => r.date === iso && r.status === 'assigned').forEach((r) => per.set(r.reliefTeacherId, (per.get(r.reliefTeacherId) || 0) + r.periods.length));
    const done = needs.filter((n) => TT.reliefRecord(s, n)).length;
    const dis = needs.length ? '' : ' disabled';
    return `<section class="card toolbar-card"><div class="toolbar">
        <div class="entnav"><button class="iconbtn sm" data-act="reliefDay" data-n="-1" aria-label="Hari sebelum">${UI.icon('chevLeft')}</button>
        <input type="date" value="${iso}" data-chg="reliefDate">
        <button class="iconbtn sm" data-act="reliefDay" data-n="1" aria-label="Hari seterusnya">${UI.icon('chevRight')}</button></div>
        <button class="btn sm" data-act="reliefToday">Hari ini</button>
        <span class="grow"></span>
        <button class="btn primary" data-act="absenceAdd">${UI.icon('plus')} Guru tidak hadir</button></div></section>
      ${day < 0 ? `<div class="banner warn">${esc(TT.weekdayOf(iso))} bukan hari persekolahan mengikut tetapan (${s.school.weekMode === 'mon-fri' ? 'Isnin hingga Jumaat' : 'Ahad hingga Khamis'}). Tiada relief diperlukan.</div>` : ''}
      ${!s.placements.length ? '<div class="banner warn">Jadual waktu belum dijana. Relief bergantung pada jadual mengajar guru.</div>' : ''}
      <section class="card"><div class="ch"><h2>Guru tidak hadir (${abs.length})</h2></div>
        ${abs.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Guru</th><th>Sebab</th><th>Tempoh</th><th>Kesan</th><th></th></tr></thead><tbody>${absRows}</tbody></table></div>` : '<p class="empty">Tiada guru tidak hadir dicatat untuk tarikh ini.</p>'}</section>
      <section class="card"><div class="ch"><h2>Keperluan relief (${done}/${needs.length} blok)</h2>
        <div class="row tight"><button class="btn primary" data-act="reliefAuto"${dis}>${UI.icon('spark')} Agih automatik</button>
        <button class="btn" data-act="reliefClear"${dis}>Kosongkan</button>
        <button class="btn" data-act="reliefPrint"${dis}>${UI.icon('printer')} Slip</button>
        <button class="btn" data-act="reliefMsg"${dis}>${UI.icon('message')} WhatsApp</button></div></div>
        ${needs.length ? `<div class="tablewrap"><table class="tbl relief"><thead><tr><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Guru tiada</th><th>Guru ganti (calon terbaik dahulu)</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hint">★ = cadangan teratas. Skor mengambil kira subjek sama, panitia, kenal kelas itu, dan menolak guru yang sudah banyak relief bulan ini atau beban mengajar tinggi. Anda bebas memilih guru lain.</p>`
        : '<p class="empty">Tiada waktu mengajar yang terjejas.</p>'}</section>
      ${per.size ? `<section class="card"><div class="ch"><h2>Guru ganti hari ini</h2></div><div class="chips">${[...per].map(([id, n]) => `<span class="chip plain">${esc((m.teacher.get(id) || {}).name)}: ${n} waktu</span>`).join('')}</div></section>` : ''}`;
  }

  changes.reliefDate = (el) => { if (el.value) { R().date = el.value; UI.render(); } };
  actions.reliefDay = (el) => { R().date = TT.addDays(R().date, +el.dataset.n); UI.render(); };
  actions.reliefToday = () => { R().date = TT.nextSchoolDay(S(), TT.todayISO()); UI.render(); };

  changes.reliefPick = (el) => {
    const s = S(), need = TT.reliefNeeds(s, R().date).find((n) => n.key === el.dataset.key); if (!need) return;
    const v = el.value;
    if (!v) TT.setRelief(s, need, null);
    else if (v.startsWith('t:')) TT.setRelief(s, need, 'assigned', v.slice(2));
    else TT.setRelief(s, need, v);
    UI.save(); UI.render();
  };
  actions.reliefAuto = () => {
    const r = TT.autoRelief(S(), R().date); UI.save(); UI.render();
    if (r.unresolved.length) UI.toast(`${r.assigned} diagih. ${r.unresolved.length} blok tiada calon layak: pilih kelas kendiri atau gabung kelas.`, 'err');
    else UI.toast(r.assigned ? `${r.assigned} blok relief diagih.` : 'Tiada keperluan baharu untuk diagih.');
  };
  actions.reliefClear = () => UI.confirm('Kosongkan semua agihan relief untuk tarikh ini?', () => { TT.clearRelief(S(), R().date); UI.commit(); }, 'Kosongkan');

  actions.absenceAdd = (el) => {
    const s = S(), sl = TT.slots(s);
    if (!s.teachers.length) { UI.toast('Belum ada guru.', 'err'); return; }
    const date = (el && el.dataset && el.dataset.date) || (UI.page === 'relief' ? R().date : TT.nextSchoolDay(s, TT.todayISO()));
    UI.openForm({
      title: 'Guru tidak hadir', saveLabel: 'Simpan',
      values: { date, dateTo: '', reason: 'MC', scope: 'full', from: 1, to: sl.length },
      fields: [
        { key: 'teacherId', label: 'Guru', type: 'select', options: s.teachers.map((t) => ({ v: t.id, t: `${t.name} (${t.short})` })) },
        { key: 'date', label: 'Tarikh', type: 'date', required: true },
        { key: 'dateTo', label: 'Hingga tarikh (pilihan, untuk cuti beberapa hari)', type: 'date', hint: 'Hujung minggu dilangkau secara automatik.' },
        { key: 'reason', label: 'Sebab', type: 'select', options: TT.ABSENCE_REASONS.map((x) => ({ v: x, t: x })) },
        { key: 'scope', label: 'Tempoh', type: 'select', options: [{ v: 'full', t: 'Sehari penuh' }, { v: 'part', t: 'Waktu tertentu sahaja' }] },
        { key: 'from', label: 'Dari waktu ke (jika waktu tertentu)', type: 'number', min: 1, max: sl.length },
        { key: 'to', label: 'Hingga waktu ke', type: 'number', min: 1, max: sl.length },
        { key: 'note', label: 'Catatan' }
      ],
      onSave: (v) => {
        const to = v.dateTo || v.date;
        if (to < v.date) return 'Tarikh akhir mesti selepas tarikh mula.';
        const dates = TT.schoolDays(s, v.date, to);
        if (!dates.length) return 'Tarikh yang dipilih tiada hari persekolahan.';
        if (dates.length > 60) return 'Julat terlalu panjang (maksimum 60 hari persekolahan).';
        let from = null, till = null;
        if (v.scope === 'part') {
          from = (v.from || 1) - 1; till = (v.to || sl.length) - 1;
          if (till < from) return 'Waktu akhir mesti selepas waktu mula.';
        }
        dates.forEach((d) => {
          s.absences = s.absences.filter((a) => !(a.date === d && a.teacherId === v.teacherId));
          s.absences.push({ id: TT.uid('a'), date: d, teacherId: v.teacherId, from, to: till, reason: v.reason, note: v.note });
          TT.reliefSync(s, d);
        });
        R().date = dates[0]; R().tab = 'harian';
        if (UI.page !== 'utama') UI.page = 'relief';
      }
    });
  };
  actions.absenceDel = (el) => {
    const s = S(), a = s.absences.find((x) => x.id === el.dataset.id); if (!a) return;
    s.absences = s.absences.filter((x) => x !== a); TT.reliefSync(s, a.date); UI.commit();
  };

  // ---------------- kalendar bulanan ----------------
  function calendar() {
    const s = S(), ym = R().month, grid = TT.monthGrid(s, ym), days = TT.days(s), today = TT.todayISO(), m = TT.maps(s);
    let done = 0, pending = 0, none = 0;
    const cells = grid.map((w) => w.map((iso) => {
      if (!iso) return '<div class="mday out"></div>';
      const sum = TT.reliefSummary(s, iso);
      if (sum.status === 'done') done++; else if (sum.status === 'pending') pending++; else none++;
      const chip = sum.status === 'done' ? '<span class="st green">SELESAI</span>' : sum.status === 'pending' ? '<span class="st red">BELUM</span>' : '';
      const abs = sum.absent.map((a) => `<span class="mchip">${esc((m.teacher.get(a.teacherId) || {}).short || '?')} · ${esc(a.reason)}</span>`);
      return `<button class="mday${iso === today ? ' now' : ''}${sum.absent.length ? '' : ' quiet'}" ${UI.goAttr({ page: 'relief', date: iso })}><div class="mh"><b>${+iso.slice(8)}</b>${chip}</div>${abs.slice(0, 2).join('')}${abs.length > 2 ? `<small>+${abs.length - 2} lagi</small>` : ''}</button>`;
    }).join('')).join('');
    return `<section class="card"><div class="cal-head"><div class="entnav"><button class="iconbtn sm" data-act="calMonth" data-n="-1" aria-label="Bulan sebelum">${UI.icon('chevLeft')}</button><b>${esc(TT.monthLabel(ym))}</b><button class="iconbtn sm" data-act="calMonth" data-n="1" aria-label="Bulan seterusnya">${UI.icon('chevRight')}</button></div>
      <div class="legend-chips"><span class="lc green">${done} Selesai</span><span class="lc red">${pending} Belum diagih</span><span class="lc grey">${none} Tiada rekod</span></div></div>
      <div class="mcal" style="grid-template-columns:repeat(${days.length},minmax(0,1fr))">${days.map((d) => `<span class="mcal-h">${esc(d.name.toUpperCase())}</span>`).join('')}${cells}</div></section>`;
  }
  actions.calMonth = (el) => { R().month = TT.addMonths(R().month, +el.dataset.n); UI.render(); };

  // ---------------- slip dan mesej ----------------
  function slipBlock(s, iso, tid, list) {
    const m = TT.maps(s), t = m.teacher.get(tid) || { name: '?' };
    return `<div class="slip"><h4>SLIP GURU GANTI</h4><p><b>${esc(t.name)}</b> &mdash; ${esc(TT.weekdayOf(iso))}, ${TT.fmtDate(iso)}</p>
      <table class="tbl"><thead><tr><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Ganti</th><th>Bilik</th></tr></thead><tbody>${list.sort((a, b) => a.periods[0] - b.periods[0]).map((n) => `<tr><td>${periodText(s, n.periods)}</td><td>${esc(TT.classNames(s, n.classIds))}</td><td>${esc((m.subject.get(n.subjectId) || {}).name)}</td><td>${esc((m.teacher.get(n.absentTeacherId) || {}).name)}</td><td>${esc((m.room.get(n.roomId) || {}).name || '')}</td></tr>`).join('')}</tbody></table>
      <p class="sign">Tandatangan: ______________</p></div>`;
  }
  function slips(iso) {
    const s = S(), m = TT.maps(s), needs = TT.reliefNeeds(s, iso);
    const line = (n, rec) => {
      const who = rec && rec.status === 'assigned' ? esc((m.teacher.get(rec.reliefTeacherId) || {}).name) : rec ? (rec.status === 'kendiri' ? 'Kelas kendiri' : 'Gabung kelas') : '<b>BELUM DIAGIH</b>';
      return `<tr><td>${periodText(s, n.periods)}</td><td>${esc(TT.classNames(s, n.classIds))}</td><td>${esc((m.subject.get(n.subjectId) || {}).name)}</td><td>${esc((m.teacher.get(n.absentTeacherId) || {}).name)}</td><td>${who}</td><td>${esc((m.room.get(n.roomId) || {}).name || '')}</td></tr>`;
    };
    let out = `<section class="sheet">${UI.sheetHead()}<h3>Agihan Guru Ganti (Relief) &mdash; ${esc(TT.weekdayOf(iso))}, ${TT.fmtDate(iso)}</h3>
      <table class="tbl"><thead><tr><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Guru tiada</th><th>Guru ganti</th><th>Bilik</th></tr></thead><tbody>${needs.map((n) => line(n, TT.reliefRecord(s, n))).join('')}</tbody></table>
      <p>Disediakan oleh: ____________________ &nbsp; Disahkan: ____________________</p></section>`;
    const by = new Map();
    needs.forEach((n) => { const r = TT.reliefRecord(s, n); if (r && r.status === 'assigned') { if (!by.has(r.reliefTeacherId)) by.set(r.reliefTeacherId, []); by.get(r.reliefTeacherId).push(n); } });
    out += `<section class="sheet slips">${[...by].map(([tid, list]) => slipBlock(s, iso, tid, list)).join('')}</section>`;
    return out;
  }
  actions.reliefPrint = () => UI.print(slips(R().date));
  actions.mySlip = (el) => {
    const s = S(), t = UI.meTeacher(), iso = el.dataset.date || TT.todayISO();
    if (!t) return;
    const list = TT.reliefNeeds(s, iso).filter((n) => { const r = TT.reliefRecord(s, n); return r && r.status === 'assigned' && r.reliefTeacherId === t.id; });
    if (!list.length) { UI.toast('Tiada tugas relief pada tarikh ini.'); return; }
    UI.print(`<section class="sheet slips">${slipBlock(s, iso, t.id, list)}</section>`);
  };
  actions.reliefMsg = () => {
    const text = TT.reliefMessage(S(), R().date);
    UI.modalOpen('Mesej WhatsApp', `<textarea id="waText" rows="16" readonly>${esc(text)}</textarea><p class="hint">Tekan Salin, kemudian tampal dalam kumpulan WhatsApp guru.</p>`,
      '<button class="btn" data-act="modalClose">Tutup</button><button class="btn primary" data-act="copyMsg">Salin</button>', true);
  };
  actions.copyMsg = () => {
    const ta = document.getElementById('waText');
    UI.copyText(ta.value).then((ok) => {
      if (!ok) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
      UI.toast(ok ? 'Disalin ke papan klip.' : 'Pilih teks dan salin secara manual.', ok ? '' : 'err');
    });
  };

  // ---------------- statistik ----------------
  const rangeBar = (csv) => `<section class="card toolbar-card"><div class="toolbar"><label class="fld sm"><span>Dari</span><input type="date" value="${R().from}" data-chg="relFrom"></label>
      <label class="fld sm"><span>Hingga</span><input type="date" value="${R().to}" data-chg="relTo"></label>
      <button class="btn sm" data-act="relMonth">Bulan ini</button>${csv ? `<span class="grow"></span><button class="btn" data-act="relCsv">${UI.icon('download')} CSV</button>` : ''}</div></section>`;

  function stats() {
    const s = S(), { from, to } = R();
    const st = TT.reliefStats(s, from, to), sum = st.summary;
    const rows = st.rows.filter((r) => !r.teacher.noRelief).sort((a, b) => b.periods - a.periods || a.teacher.name.localeCompare(b.teacher.name));
    const max = Math.max(1, ...rows.map((r) => r.periods));
    const body = rows.map((r) => {
      const hi = sum.sd > 0 && r.periods > sum.mean + sum.sd;
      return `<tr><td>${esc(r.teacher.name)}</td><td>${esc(r.teacher.dept)}</td><td class="${hi ? 'warn' : ''}"><b>${r.periods}</b></td><td>${r.sessions}</td><td>${r.load}</td><td>${r.absent || ''}</td>
        <td class="barcell"><div class="bar${hi ? ' hi' : ''}" style="width:${(r.periods / max) * 100}%"></div></td></tr>`;
    }).join('');
    const tile = (n, l, tone) => `<div class="stat ${tone || ''}"><b>${n}</b><span>${l}</span></div>`;
    return rangeBar(true) + `<section class="stats">${tile(sum.total, 'Waktu relief diagih')}${tile(sum.mean.toFixed(1), 'Purata seorang guru')}${tile(sum.max, 'Tertinggi')}${tile(sum.sd.toFixed(1), 'Sisihan piawai')}${tile(sum.uncovered, 'Belum ada guru ganti', sum.uncovered ? 'bad' : '')}${tile(sum.kendiri, 'Kelas kendiri / gabung')}</section>
      <section class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Guru</th><th>Panitia</th><th>Relief (waktu)</th><th>Sesi</th><th>Beban mengajar</th><th>Tidak hadir</th><th></th></tr></thead><tbody>${body || '<tr><td colspan="7" class="empty">Tiada data.</td></tr>'}</tbody></table></div>
      <p class="hint">Kuning = melebihi purata + 1 sisihan piawai. Enjin cadangan menolak guru ini secara automatik pada agihan berikutnya.</p></section>`;
  }
  changes.relFrom = (el) => { R().from = el.value; UI.render(); };
  changes.relTo = (el) => { R().to = el.value; UI.render(); };
  actions.relMonth = () => { [R().from, R().to] = UI.monthRange(TT.todayISO()); UI.render(); };
  actions.relCsv = () => {
    const st = TT.reliefStats(S(), R().from, R().to);
    UI.download(`statistik-relief-${R().from}-${R().to}.csv`, '﻿' + UI.csv([['Guru', 'Panitia', 'Relief (waktu)', 'Sesi', 'Beban mengajar', 'Tidak hadir (waktu)']].concat(st.rows.map((r) => [r.teacher.name, r.teacher.dept, r.periods, r.sessions, r.load, r.absent]))), 'text/csv');
  };

  // ---------------- sejarah ----------------
  function history() {
    const s = S(), m = TT.maps(s), { from, to, teacher } = R();
    const list = s.reliefs.filter((r) => r.date >= from && r.date <= to && (!teacher || r.reliefTeacherId === teacher || r.absentTeacherId === teacher))
      .sort((a, b) => b.date.localeCompare(a.date) || a.periods[0] - b.periods[0]);
    const rows = list.map((r) => `<tr><td>${TT.fmtDate(r.date)}</td><td>${r.periods.map((p) => p + 1).join(', ')}</td><td>${esc(TT.classNames(s, r.classIds))}</td><td>${esc((m.subject.get(r.subjectId) || {}).short || '')}</td>
      <td>${esc((m.teacher.get(r.absentTeacherId) || {}).name || '?')}</td><td>${r.status === 'assigned' ? esc((m.teacher.get(r.reliefTeacherId) || {}).name) : `<span class="chip-s amber">${r.status === 'kendiri' ? 'Kelas kendiri' : 'Gabung kelas'}</span>`}</td>
      <td class="acts"><button class="btn sm danger" data-act="histDel" data-id="${r.id}">Padam</button></td></tr>`).join('');
    return rangeBar(false) + `<section class="card"><div class="toolbar"><label class="fld sm"><span>Guru</span><select data-chg="relTeacher"><option value="">Semua</option>${UI.optHtml(s.teachers.map((t) => ({ v: t.id, t: t.name })), teacher)}</select></label></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Tarikh</th><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Guru tiada</th><th>Guru ganti</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Tiada rekod relief dalam julat ini.</td></tr>'}</tbody></table></div></section>`;
  }
  changes.relTeacher = (el) => { R().teacher = el.value; UI.render(); };
  actions.histDel = (el) => { S().reliefs = S().reliefs.filter((r) => r.id !== el.dataset.id); UI.save(); UI.render(); };

  // ---------------- Relief saya (guru) ----------------
  pages.reliefku = () => {
    const s = S(), t = UI.meTeacher();
    if (!t) return UI.pickMe();
    const today = TT.todayISO(), [from, to] = UI.monthRange(today), m = TT.maps(s);
    const st = TT.reliefStats(s, from, to), mine = st.rows.find((r) => r.teacher.id === t.id) || { periods: 0 };
    const head = UI.pageHead({ crumbs: [['Relief saya']], title: 'Relief saya', sub: `${esc(t.name)} · ${esc(TT.monthLabel(today.slice(0, 7)))}`, metric: mine.periods, metricLabel: 'waktu relief bulan ini', tone: 'blue', tabs: [['akan', 'Akan datang'], ['sejarah', 'Sejarah']], tab: UI.myTab, scope: 'myTab' });
    const fair = `<section class="card"><div class="ch"><div><h2>Kesaksamaan bulan ini</h2><small>Bandingan dengan guru lain (tidak termasuk yang dikecualikan)</small></div></div>
      <div class="fair">${[['Anda', mine.periods, 'navy'], ['Purata guru', +st.summary.mean.toFixed(1), 'blue'], ['Tertinggi', st.summary.max, 'grey']].map(([l, v, tone]) => `<div class="frow"><span>${l}</span><div class="ftrack"><i class="${tone}" style="width:${(v / Math.max(1, st.summary.max, mine.periods)) * 100}%"></i></div><b>${v}</b></div>`).join('')}</div></section>`;
    if (UI.myTab === 'sejarah') {
      const list = s.reliefs.filter((r) => r.status === 'assigned' && r.reliefTeacherId === t.id).sort((a, b) => b.date.localeCompare(a.date));
      const rows = list.map((r) => `<tr><td>${TT.fmtDate(r.date)}</td><td>${r.periods.map((p) => p + 1).join(', ')}</td><td>${esc(TT.classNames(s, r.classIds))}</td><td>${esc((m.subject.get(r.subjectId) || {}).short || '')}</td><td>${esc((m.teacher.get(r.absentTeacherId) || {}).name || '?')}</td></tr>`).join('');
      return head + `<section class="card"><div class="tablewrap"><table class="tbl"><thead><tr><th>Tarikh</th><th>Waktu</th><th>Kelas</th><th>Subjek</th><th>Ganti</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Belum ada rekod relief.</td></tr>'}</tbody></table></div></section>` + fair;
    }
    const up = [];
    for (let i = 0; i < 21; i++) {
      const d = TT.addDays(today, i);
      if (TT.dateToDay(s, d) < 0) continue;
      const list = TT.teacherDay(s, t.id, d).filter((x) => x.kind === 'relief');
      if (list.length) up.push({ d, list });
    }
    const days = up.map(({ d, list }) => `<section class="card"><div class="ch"><div><h3>${esc(TT.weekdayOf(d))}, ${TT.fmtDate(d)}</h3><small>${list.length} tugas relief</small></div><button class="pill navy" data-act="mySlip" data-date="${d}">${UI.icon('printer')} Slip</button></div>
      <div class="act-list">${list.map((x) => `<div class="act-item sev-perhatian"><div><b>${esc(x.start)} · ${esc(x.subject ? x.subject.short : '')} ${esc(x.classes)}</b><small>${esc(TT.periodLabel(s, x.p0, x.p1))} · ganti ${esc(x.forTeacher ? x.forTeacher.name : '?')}${x.room ? ' · ' + esc(x.room) : ''}</small></div></div>`).join('')}</div></section>`).join('');
    return head + (days || '<section class="card"><p class="empty">Tiada tugas relief dalam tiga minggu akan datang.</p></section>') + fair;
  };
})();
