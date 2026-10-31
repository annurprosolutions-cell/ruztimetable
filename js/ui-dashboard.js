(function () {
  'use strict';
  const { esc, actions, pages } = UI;
  const S = () => UI.state;

  function summaryCard(o) {
    return `<section class="card summary"><div class="ch"><h2>Ringkasan saya</h2><button class="pill" ${o.allGo}>Lihat semua</button></div>
      <div class="sum-hero">${UI.gauge(o.n, o.ok)}<span class="badge ${o.ok ? 'green' : 'red'}">${esc(o.badge)}</span><p class="greet">${esc(UI.greet())}, ${esc(o.greetName)}</p></div>
      <div class="bigstat"><b>${esc(o.big)}</b><span>${esc(o.bigLabel)}</span></div>
      <div class="sbars">${o.bars.map(([n, l, t]) => `<div class="sbar ${t}"><i></i><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <div class="tiles">${o.tiles.map(([ic, n, l, t]) => `<div class="tile ${t}">${UI.icon(ic)}<b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div></section>`;
  }

  function heatCard(values, title, goPage) {
    const s = S(), ym = UI.heatMonth, grid = TT.monthGrid(s, ym), days = TT.days(s), today = TT.todayISO();
    const max = Math.max(1, ...values.values());
    const lvl = (v) => (!v ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
    const cells = grid.map((w) => w.map((iso) => {
      if (!iso) return '<span class="hm empty"></span>';
      const v = values.get(iso) || 0;
      const go = goPage === 'relief' ? { page: 'relief', date: iso } : { page: goPage };
      return `<button class="hm l${lvl(v)}${iso > today ? ' fut' : ''}${iso === today ? ' now' : ''}" ${UI.goAttr(go)} title="${esc(TT.weekdayOf(iso))}, ${TT.fmtDate(iso)}: ${v} waktu relief">${+iso.slice(8)}</button>`;
    }).join('')).join('');
    return `<section class="card heat"><div class="ch"><div><h3>${esc(title)}</h3><small>Setiap petak ialah satu hari persekolahan</small></div>
      <div class="hm-nav"><button class="iconbtn sm" data-act="heatMonth" data-n="-1" aria-label="Bulan sebelum">${UI.icon('chevLeft')}</button><span class="hm-month">${UI.icon('calendar')}${esc(TT.monthLabel(ym).toUpperCase())}</span><button class="iconbtn sm" data-act="heatMonth" data-n="1" aria-label="Bulan seterusnya">${UI.icon('chevRight')}</button></div></div>
      <div class="hm-grid" style="grid-template-columns:repeat(${days.length},1fr)">${days.map((d) => `<span class="hm-h">${esc(d.short.toUpperCase())}</span>`).join('')}${cells || `<p class="empty" style="grid-column:1/-1">Tiada hari persekolahan.</p>`}</div>
      <div class="hm-legend"><span>Kurang</span><i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i><span>Lebih</span></div></section>`;
  }
  actions.heatMonth = (el) => { UI.heatMonth = TT.addMonths(UI.heatMonth, +el.dataset.n); UI.render(); };

  const alertBanner = (title, sub, btn) => `<section class="alert"><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>${btn}</section>`;

  function actsCard(items) {
    const list = UI.dashAll ? items : items.slice(0, 5);
    return `<section class="card acts"><div class="ch"><h2>Perlu tindakan</h2>${items.length > 5 ? `<button class="lnk" data-act="dashAll">${UI.dashAll ? 'Ringkaskan' : `Lihat semua (${items.length})`}</button>` : ''}</div>
      ${list.length ? `<div class="act-list">${UI.actList(list)}</div>` : '<p class="empty">Tiada tindakan diperlukan.</p>'}</section>`;
  }
  actions.dashAll = () => { UI.dashAll = !UI.dashAll; UI.render(); };

  const welcomeCard = () => `<section class="card dark today"><div class="ch"><div><h2>Selamat datang</h2><small>Pilih cara untuk bermula</small></div></div>
    <div class="drows">
      <div class="drow"><span class="t">1</span><div><b>Cuba dengan data contoh</b><small>18 guru, 9 kelas, sedia untuk dijana</small></div><div class="r"><button class="pill w" data-act="loadSample">Muat contoh</button></div></div>
      <div class="drow"><span class="t">2</span><div><b>Sekolah anda guna aSc sebelum ini?</b><small>Import senarai kelas, subjek, guru dan bilik dari fail Excel aSc</small></div><div class="r"><button class="pill w" data-act="ascImport">Import aSc</button></div></div>
      <div class="drow"><span class="t">3</span><div><b>Atau mula baharu</b><small>Tetapan waktu, kemudian guru, kelas, subjek</small></div><div class="r"><button class="pill w" data-act="goto" data-p="tetapan">Mula</button></div></div>
      <div class="drow"><span class="t">4</span><div><b>Sudah ada backup?</b><small>Import fail JSON daripada peranti lain</small></div><div class="r"><button class="pill o" data-act="importJson">Import</button></div></div>
    </div></section>`;

  function todayAdmin() {
    const s = S(), today = TT.todayISO(), m = TT.maps(s);
    if (!s.placements.length) {
      return `<section class="card dark today"><div class="ch"><div><h2>Hari ini</h2><small>Jadual waktu belum dijana</small></div><button class="pill o" data-act="goto" data-p="jadual">Buka jadual</button></div>
        <p class="dmuted">Relief bergantung pada jadual mengajar guru. Jana jadual dahulu, kemudian rekod guru tidak hadir di sini.</p></section>`;
    }
    const day = TT.nextSchoolDay(s, today), sum = TT.reliefSummary(s, day);
    const rows = sum.needs.map((n) => {
      const rec = TT.reliefRecord(s, n), sub = m.subject.get(n.subjectId) || {}, at = m.teacher.get(n.absentTeacherId) || {};
      let right;
      if (!rec) right = `<button class="pill w" ${UI.goAttr({ page: 'relief', date: day })}>Agih</button>`;
      else if (rec.status === 'assigned') right = `<span class="chip-s green">Siap</span><span class="pill o" title="${esc((m.teacher.get(rec.reliefTeacherId) || {}).name || '')}">${esc((m.teacher.get(rec.reliefTeacherId) || {}).short || '?')}</span>`;
      else right = `<span class="chip-s amber">${rec.status === 'kendiri' ? 'Kendiri' : 'Gabung'}</span>`;
      return `<div class="drow"><span class="t">${esc(TT.slots(s, n.k)[n.periods[0]].start)}</span><div><b>${esc(sub.short || '?')} · ${esc(TT.classNames(s, n.classIds))}</b><small>Ganti ${esc(at.name || '?')}${n.periods.length > 1 ? ` · ${n.periods.length} waktu` : ''}</small></div><div class="r">${right}</div></div>`;
    });
    const [from, to] = UI.monthRange(today);
    const st = TT.reliefStats(s, from, to).summary, need = st.total + st.uncovered + st.kendiri;
    const up = [];
    for (let i = 1; i <= 7 && up.length < 6; i++) {
      const d = TT.addDays(day, i);
      if (TT.dateToDay(s, d) < 0) continue;
      const ds = TT.reliefSummary(s, d);
      ds.absent.forEach((a) => {
        const mine = ds.needs.filter((n) => n.absenceId === a.id);
        up.push({ a, d, open: mine.filter((n) => !TT.reliefRecord(s, n)).length, total: mine.length });
      });
    }
    const upHtml = up.map(({ a, d, open, total }) => {
      const t = m.teacher.get(a.teacherId) || {}, tone = !total ? 'grey' : open ? 'red' : 'green';
      const scope = a.from == null && a.to == null ? 'sehari' : `waktu ${(a.from || 0) + 1}-${(a.to == null ? TT.slots(s).length - 1 : a.to) + 1}`;
      return `<button class="urow" ${UI.goAttr({ page: 'relief', date: d })}><i class="dot ${tone}"></i><div><b>${esc(t.name || '?')} · ${esc(a.reason)}</b><small>${esc(TT.weekdayOf(d))}, ${esc(TT.shortDate(d))} · ${scope}</small></div><span class="chip-s ${tone === 'green' ? 'green' : 'grey'}">${!total ? 'Tiada kelas' : open ? 'Belum agih' : 'Siap'}</span>${UI.icon('chevRight')}</button>`;
    }).join('');
    return `<section class="card dark today"><div class="ch"><div><h2>${day === today ? 'Hari ini' : 'Hari persekolahan seterusnya'}</h2><small>${esc(TT.weekdayOf(day))}, ${TT.fmtDate(day)} · ${sum.absent.length} guru tidak hadir · ${sum.periods - sum.open}/${sum.periods} waktu relief selesai</small></div><button class="pill o" ${UI.goAttr({ page: 'relief', date: day })}>Lihat semua</button></div>
      <div class="drows">${rows.slice(0, 4).join('') || `<div class="drow empty"><div><b>Tiada guru tidak hadir dicatat</b><small>Rekod ketidakhadiran untuk menjana keperluan relief</small></div><div class="r"><button class="pill w" data-act="absenceAdd" data-date="${day}">+ Tidak hadir</button></div></div>`}</div>
      ${rows.length > 4 ? `<p class="dmore">+${rows.length - 4} lagi blok relief</p>` : ''}
      <p class="dfoot">${st.total} waktu relief bulan ini · ${need ? Math.round((st.total / need) * 100) : 100}% ada guru ganti</p>
      <div class="dsec"><div class="ch"><span class="cap">Minggu ini</span><button class="pill o" data-act="absenceAdd">+ Guru tidak hadir</button></div>
        ${upHtml || '<p class="dmuted">Tiada ketidakhadiran dirancang dalam tempoh seminggu.</p>'}</div></section>`;
  }

  function adminDash() {
    const s = S(), today = TT.todayISO(), items = UI.items;
    const urgent = items.filter((i) => i.sev !== 'info');
    const total = TT.buildUnits(s).length, val = TT.validate(s), un = TT.unplaced(s).length;
    const okPlaced = s.placements.filter((p) => !val.bad.has(p.unit)).length;
    const [from, to] = UI.monthRange(today);
    const st = TT.reliefStats(s, from, to).summary;
    const sum = summaryCard({
      n: urgent.length, ok: !urgent.length, badge: urgent.length ? 'Perlu tindakan' : 'Semua beres', greetName: UI.displayName(),
      big: total ? Math.round((okPlaced / total) * 100) + '%' : '-', bigLabel: 'Waktu diletak tanpa konflik',
      bars: [[okPlaced, 'Diletak', 'green'], [un, 'Belum diletak', 'blue'], [val.bad.size, 'Konflik', 'red']],
      tiles: [['users', s.teachers.length, 'Guru', 'blue'], ['layers', s.classes.length, 'Kelas', 'amber'], ['check', st.total, 'Relief bulan ini', 'green']],
      allGo: UI.goAttr({ page: 'laporan' })
    });
    const empty = !s.teachers.length && !s.classes.length;
    const top = urgent.find((i) => TT.URGENT.includes(i.sev));
    const banner = top ? alertBanner(top.title, top.when, `<button class="pill red" ${UI.goAttr(top.go)}>${esc(top.btn)}</button>`) : '';
    return `<div class="dash"><div class="col-l">${sum}${heatCard(TT.monthReliefPeriods(s, UI.heatMonth), 'Aktiviti relief', 'relief')}</div>
      <div class="col-r">${banner}${empty ? welcomeCard() : todayAdmin()}${actsCard(items.filter((i) => i !== top))}${UI.pwaCard()}</div></div>`;
  }

  // ---------------- peranan guru ----------------
  UI.pickMe = () => `<section class="card"><div class="ch"><h2>Siapa anda?</h2></div><p class="hint">Pilih nama anda untuk melihat jadual dan tugas relief sendiri. Pilihan ini disimpan pada peranti ini.</p>
    <div class="pick">${S().teachers.map((t) => `<button class="pickbtn" data-act="setMe" data-id="${t.id}"><span class="av">${esc(UI.initials(t.name))}</span>${esc(t.name)}</button>`).join('') || '<p class="empty">Belum ada guru dalam data. Minta pentadbir jadual kongsikan data sekolah.</p>'}</div></section>`;
  actions.setMe = (el) => { UI.prefs.me = el.dataset.id; UI.savePrefs(); UI.menu = null; UI.render(); UI.checkNotices(true); };

  function todayGuru(t, day, items) {
    const s = S(), today = TT.todayISO();
    const d = new Date(), nowMin = d.getHours() * 60 + d.getMinutes();
    const toMin = (hm) => { const [h, mi] = String(hm).split(':').map(Number); return h * 60 + mi; };
    const rows = items.map((x) => {
      const live = day === today && toMin(x.start) <= nowMin && nowMin < toMin(x.end);
      const right = x.kind === 'relief' ? '<span class="chip-s amber">Relief</span>' : x.absent ? '<span class="chip-s red">Cuti</span>' : live ? '<span class="chip-s green">Sekarang</span>' : (x.room ? `<span class="pill o">${esc(x.room)}</span>` : '');
      const sub = x.kind === 'relief' ? `Ganti ${x.forTeacher ? x.forTeacher.name : '?'}${x.room ? ' · ' + x.room : ''}` : `${TT.periodLabel(s, x.p0, x.p1)}${x.p1 > x.p0 ? ' (berganda)' : ''}`;
      return `<div class="drow${x.kind === 'relief' ? ' rel' : ''}"><span class="t">${esc(x.start)}</span><div><b>${esc(x.subject ? x.subject.short : '?')} · ${esc(x.classes)}</b><small>${esc(sub)}</small></div><div class="r">${right}</div></div>`;
    });
    const up = [];
    for (let i = 1; i <= 7; i++) {
      const dd = TT.addDays(day, i);
      if (TT.dateToDay(s, dd) < 0) continue;
      TT.teacherDay(s, t.id, dd).filter((x) => x.kind === 'relief').forEach((x) => up.push({ d: dd, x }));
    }
    const nTeach = items.filter((x) => x.kind === 'kelas').reduce((a, x) => a + x.p1 - x.p0 + 1, 0);
    const nRel = items.filter((x) => x.kind === 'relief').length;
    return `<section class="card dark today"><div class="ch"><div><h2>${day === today ? 'Hari ini' : 'Hari persekolahan seterusnya'}</h2><small>${esc(TT.weekdayOf(day))}, ${TT.fmtDate(day)} · ${nTeach} waktu mengajar${nRel ? ` · ${nRel} relief` : ''}</small></div><button class="pill o" data-act="goto" data-p="jadualku">Jadual penuh</button></div>
      <div class="drows">${rows.join('') || '<div class="drow empty"><div><b>Tiada kelas pada hari ini</b><small>Semak jadual mingguan anda</small></div></div>'}</div>
      <div class="dsec"><div class="ch"><span class="cap">Relief minggu ini</span><button class="pill o" data-act="goto" data-p="reliefku">Relief saya</button></div>
        ${up.map(({ d: dd, x }) => `<button class="urow" data-act="mySlip" data-date="${dd}"><i class="dot amber"></i><div><b>${esc(x.subject ? x.subject.short : '')} · ${esc(x.classes)}</b><small>${esc(TT.weekdayOf(dd))}, ${esc(TT.shortDate(dd))} · ${esc(x.start)} · ganti ${esc(x.forTeacher ? x.forTeacher.name : '?')}</small></div><span class="chip-s amber">Slip</span>${UI.icon('chevRight')}</button>`).join('') || '<p class="dmuted">Tiada tugas relief lain minggu ini.</p>'}</div></section>`;
  }

  function guruDash() {
    const s = S(), t = UI.meTeacher();
    if (!t) return UI.pickMe();
    const today = TT.todayISO(), day = s.placements.length ? TT.nextSchoolDay(s, today) : today;
    const items = TT.teacherDay(s, t.id, day), rel = items.filter((x) => x.kind === 'relief');
    const load = TT.teacherLoad(s).get(t.id) || 0;
    const [from, to] = UI.monthRange(today);
    const st = TT.reliefStats(s, from, to), mine = st.rows.find((r) => r.teacher.id === t.id) || { periods: 0 };
    const absDays = new Set(s.absences.filter((a) => a.teacherId === t.id && a.date >= from && a.date <= to).map((a) => a.date)).size;
    const classesTaught = new Set(s.lessons.filter((l) => l.teacherIds.includes(t.id)).flatMap((l) => l.classIds)).size;
    const teachDay = items.filter((x) => x.kind === 'kelas').reduce((a, x) => a + x.p1 - x.p0 + 1, 0);
    const dayWord = day === today ? 'hari ini' : TT.weekdayOf(day);
    const sum = summaryCard({
      n: rel.length, ok: !rel.length, badge: rel.length ? `Relief ${dayWord}` : 'Tiada relief', greetName: t.name,
      big: String(load), bigLabel: 'Waktu mengajar seminggu',
      bars: [[mine.periods, 'Relief bulan ini', 'green'], [st.summary.mean.toFixed(1), 'Purata guru', 'blue'], [absDays, 'Hari tidak hadir', 'red']],
      tiles: [['file', teachDay, `Waktu ${dayWord}`, 'blue'], ['layers', classesTaught, 'Kelas diajar', 'amber'], ['check', mine.periods, 'Relief bulan ini', 'green']],
      allGo: UI.goAttr({ page: 'reliefku' })
    });
    const banner = rel.length ? alertBanner(`Anda ada ${rel.length} tugas relief ${dayWord}`, rel.map((x) => `${x.start} ${x.classes}`).join(' · '), `<button class="pill red" data-act="mySlip" data-date="${day}">Cetak slip</button>`) : '';
    const acts = UI.items.filter((i) => !(rel.length && i.go.act === 'mySlip' && i.go.date === day));
    return `<div class="dash"><div class="col-l">${sum}${heatCard(TT.monthReliefPeriods(s, UI.heatMonth, t.id), 'Aktiviti relief saya', 'reliefku')}</div>
      <div class="col-r">${banner}${todayGuru(t, day, items)}${UI.pwaCard()}${actsCard(acts)}</div></div>`;
  }

  pages.utama = () => (UI.isGuru() ? guruDash() : adminDash());
})();
