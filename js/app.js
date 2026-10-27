(function () {
  'use strict';
  const { esc, $ } = UI;
  const CFG = UI.cfg;
  const NAV = {
    admin: [['utama', 'Utama', 'grid'], ['data', 'Data', 'users'], ['jadual', 'Jadual', 'table'], ['relief', 'Relief', 'swap'], ['laporan', 'Laporan', 'chart'], ['tetapan', 'Tetapan', 'gear']],
    guru: [['utama', 'Utama', 'grid'], ['jadualku', 'Jadual saya', 'table'], ['reliefku', 'Relief saya', 'swap'], ['bantuan', 'Bantuan', 'help']]
  };
  const ROLE = { admin: 'Pentadbir', guru: 'Guru' };

  function computeItems() {
    const s = UI.state, today = TT.todayISO();
    if (UI.isGuru()) { const t = UI.meTeacher(); return t ? TT.teacherActions(s, t.id, today) : []; }
    return TT.actionItems(s, today, { lastBackup: UI.prefs.lastBackup, sheetLinked: !!(UI.sync && UI.sync.linked()) });
  }

  function syncPill() {
    const sy = UI.sync;
    if (!sy || !sy.configured() || !sy.linked() || !UI.isAdmin()) return '';
    const map = { off: ['', 'Sheets'], login: ['warn', 'Sambung semula'], pending: ['', 'Belum disimpan'], saving: ['', 'Menyimpan'], saved: ['ok', 'Disimpan'], error: ['bad', 'Ralat simpan'], conflict: ['bad', 'Konflik data'], unlicensed: ['bad', 'Tiada lesen'] };
    const [tone, text] = map[sy.status] || map.off;
    const label = sy.status === 'login' && UI.prefs.sheet && UI.prefs.sheet.dirty ? 'Sambung untuk simpan' : text;
    return `<button id="syncPill" class="sync ${tone}" ${sy.status === 'login' ? 'data-act="syncSignIn"' : 'data-act="goto" data-p="tetapan" data-s="storan"'} title="${esc(sy.msg || 'Google Sheets')}">${UI.icon('cloud')}<span>${label}</span></button>`;
  }
  UI.refreshSyncPill = () => {
    const el = $('syncPill'); if (el) el.outerHTML = syncPill();
    const st = $('syncStatus'); if (st && UI.syncStatusHtml) st.innerHTML = UI.syncStatusHtml();
  };

  function menu() {
    const s = UI.state;
    if (UI.menu === 'role') {
      const t = UI.meTeacher();
      const pick = UI.isGuru() ? `<div class="mh">Saya ialah</div><select class="msel" data-chg="setMeSel"><option value="">- Pilih nama -</option>${UI.optHtml(s.teachers.map((x) => ({ v: x.id, t: x.name })), t ? t.id : '')}</select>` : '';
      if (!UI.isAdmin()) {
        return `<div class="menu"><div class="mh">Guru</div>${pick}
          <button class="mi" data-act="adminLogin">${UI.icon('shield')}<span><b>Log masuk pentadbir</b><small>Perlu kata laluan</small></span></button>
          <p class="mnote">Paparan guru adalah baca sahaja. Data diurus oleh pentadbir jadual.</p></div>`;
      }
      return `<div class="menu"><div class="mh">Paparan</div>
        <button class="mi${!UI.isGuru() ? ' on' : ''}" data-act="setRole" data-r="admin">${UI.icon('shield')}<span><b>Pentadbir jadual</b><small>Urus data, jadual dan relief</small></span></button>
        <button class="mi${UI.isGuru() ? ' on' : ''}" data-act="setRole" data-r="guru">${UI.icon('user')}<span><b>Lihat sebagai guru</b><small>Pratonton apa yang guru nampak</small></span></button>
        ${pick}</div>`;
    }
    if (UI.menu === 'bell') {
      const items = UI.items.slice(0, 6);
      return `<div class="menu wide"><div class="mh">Notifikasi</div>${items.length ? `<div class="act-list">${UI.actList(items)}</div>` : '<p class="mnote">Tiada notifikasi.</p>'}
        ${UI.items.length > 6 ? `<button class="mi center" data-act="goto" data-p="utama">Lihat semua (${UI.items.length})</button>` : ''}</div>`;
    }
    if (UI.menu === 'avatar') {
      return `<div class="menu"><div class="mh">${esc(UI.displayName())}<small>${ROLE[UI.prefs.role]}${UI.isAdmin() && UI.sync && UI.sync.email ? ' · ' + esc(UI.sync.email) : ''}</small></div>
        ${UI.isGuru() ? '' : `<button class="mi" data-act="goto" data-p="tetapan" data-s="storan">${UI.icon('database')}<span><b>Storan & backup</b></span></button>
        <button class="mi" data-act="exportJson">${UI.icon('download')}<span><b>Eksport backup JSON</b></span></button>
        <button class="mi" data-act="goto" data-p="tetapan" data-s="sekolah">${UI.icon('gear')}<span><b>Tetapan</b></span></button>`}
        ${UI.canInstall() ? `<button class="mi" data-act="install">${UI.icon('download')}<span><b>Pasang app</b><small>Ke skrin utama telefon atau komputer</small></span></button>` : ''}
        ${UI.demo ? '' : UI.notifyOn() ? `<button class="mi" data-act="notifyDisable">${UI.icon('bell')}<span><b>Matikan notifikasi</b></span></button>` : UI.notifyState() !== 'denied' ? `<button class="mi" data-act="notifyEnable">${UI.icon('bell')}<span><b>Hidupkan notifikasi</b></span></button>` : ''}
        <button class="mi" data-act="goto" data-p="bantuan">${UI.icon('help')}<span><b>Bantuan</b></span></button>
        ${UI.demo ? `<button class="mi" data-act="demoReset">${UI.icon('refresh')}<span><b>Set semula demo</b><small>Kembali kepada data contoh asal</small></span></button>`
          : `<button class="mi" data-act="logout">${UI.icon('logout')}<span><b>Log keluar</b><small>${UI.isAdmin() ? 'Kata laluan diperlukan untuk masuk semula' : 'Pilih nama semula bila masuk'}</small></span></button>`}</div>`;
    }
    return '';
  }

  function header() {
    const s = UI.state, role = UI.prefs.role, urgent = UI.items.filter((i) => i.sev !== 'info').length;
    return `<header class="topbar">
      <div class="brand"><span class="mark${TT.validLogo(s.school.logo) ? ' logo' : ''}">${TT.validLogo(s.school.logo) ? `<img src="${s.school.logo}" alt="Logo ${esc(s.school.name)}">` : UI.icon('calendar')}</span><span class="bname">${esc(s.school.name)}<small>${esc(CFG.appName || 'Jadual Sekolah')}</small></span></div>
      <nav class="seg main">${NAV[role].map(([k, t, ic]) => `<button class="${UI.page === k ? 'on' : ''}" data-act="goto" data-p="${k}">${UI.icon(ic)}<span>${t}</span></button>`).join('')}</nav>
      <div class="tb-right">${syncPill()}
        <button class="role${UI.menu === 'role' ? ' open' : ''}" data-act="menu" data-m="role" aria-haspopup="true" aria-expanded="${UI.menu === 'role'}">${UI.icon(role === 'guru' ? 'user' : 'shield')}<span><small>PERANAN</small><b>${UI.isAdmin() && role === 'guru' ? 'Pratonton guru' : ROLE[role]}</b></span>${UI.icon('chevDown')}</button>
        ${role === 'admin' ? `<button class="iconbtn hide-sm" data-act="goto" data-p="bantuan" aria-label="Bantuan" title="Bantuan">${UI.icon('help')}</button>` : ''}
        <button class="iconbtn bell" data-act="menu" data-m="bell" aria-label="Notifikasi" title="Notifikasi">${UI.icon('bell')}${urgent ? `<i class="dot">${urgent > 9 ? '9+' : urgent}</i>` : ''}</button>
        <button class="avatar" data-act="menu" data-m="avatar" aria-label="Akaun">${esc(UI.initials(UI.displayName()))}</button>
        ${menu()}</div></header>`;
  }

  function demoBar() {
    if (!UI.demo) return '';
    const sup = CFG.support || {}, wa = sup.whatsapp ? `https://wa.me/${UI.waNumber(sup.whatsapp)}?text=${encodeURIComponent('Saya berminat dengan Jadual Sekolah (selepas cuba demo).')}` : '';
    return `<div class="demobar"><span><b>MOD DEMO</b> · Data contoh sahaja. Klik, ubah dan jana jadual dengan bebas. Data demo disimpan dalam pelayar anda sahaja. Hanya jawapan survey dihantar kepada kami.</span>
      <span class="dbtns"><button class="pill o" data-act="demoReset">${UI.icon('refresh')} Set semula</button>${wa ? `<a class="pill w" href="${wa}" target="_blank" rel="noopener">${UI.icon('message')} Berminat? WhatsApp kami</a>` : sup.email ? `<a class="pill w" href="mailto:${esc(sup.email)}">Berminat? Hubungi kami</a>` : ''}</span></div>`;
  }
  UI.actions.demoReset = () => UI.confirm('Set semula demo? Semua perubahan anda dibuang dan data contoh asal dimuatkan semula.', () => {
    UI.toast('Menyediakan demo...');
    setTimeout(() => {
      UI.state = TT.demoSample(TT.todayISO()); UI.lastGen = null; UI.view = { type: 'class', id: null };
      UI.relief.date = TT.nextSchoolDay(UI.state, TT.todayISO());
      UI.prefs.role = 'admin'; UI.prefs.me = null; UI.page = 'utama'; UI.savePrefs(); UI.save(); UI.render();
    }, 30);
  }, 'Set semula');

  UI.render = () => {
    const y = window.scrollY, s = UI.state;
    UI.applyBrand();
    if (UI.surveyActive && UI.surveyActive()) { $('app').innerHTML = UI.surveyHtml(); return; }
    if (UI.needGate()) { $('app').innerHTML = UI.gateHtml(); return; }
    const allowed = NAV[UI.prefs.role].map((x) => x[0]).concat(UI.isGuru() ? [] : ['bantuan']);
    if (!allowed.includes(UI.page)) UI.page = 'utama';
    UI.items = computeItems();
    const where = UI.sync && UI.sync.linked() ? 'dalam pelayar ini dan Google Sheet anda' : 'dalam pelayar ini sahaja';
    $('app').innerHTML = `${demoBar()}${header()}<main class="pg-${UI.page}">${UI.pages[UI.page]()}</main>
      <footer class="foot">${esc(CFG.appName || 'Jadual Sekolah')} ${esc(CFG.version || '')}${CFG.vendor ? ' · ' + esc(CFG.vendor) : ''} · ${esc(s.school.name)} · Data disimpan ${where}</footer>${UI.surveyFab ? UI.surveyFab() : ''}`;
    window.scrollTo(0, y);
  };

  UI.actions.menu = (el, e) => { e.stopPropagation(); UI.menu = UI.menu === el.dataset.m ? null : el.dataset.m; UI.render(); };
  UI.actions.setRole = (el) => {
    if (!UI.isAdmin()) { UI.logout('admin'); return; } // guru perlu log masuk pentadbir
    UI.prefs.role = el.dataset.r; UI.savePrefs();
    if (UI.prefs.role === 'admin' || UI.meTeacher()) UI.menu = null;
    UI.page = 'utama'; UI.render();
  };
  UI.changes.setMeSel = (el) => { UI.prefs.me = el.value || null; UI.savePrefs(); UI.menu = null; UI.render(); UI.checkNotices(true); };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    const closing = UI.menu && !e.target.closest('.menu') && !(el && el.dataset.act === 'menu');
    if (closing) UI.menu = null;
    if (el) { const f = UI.actions[el.dataset.act]; if (f) f(el, e); }
    if (closing && !(el && UI.actions[el.dataset.act])) UI.render();
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-chg]'); if (!el) return;
    const f = UI.changes[el.dataset.chg];
    if (f) f(el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (UI.menu) { UI.menu = null; UI.render(); } else if ($('modal').firstChild && !UI._gen) UI.modalClose();
    }
    if (e.key === 'Enter' && e.target.matches('#theForm input:not([type=checkbox])')) { e.preventDefault(); UI.actions.formSave(); }
  });

  UI.afterEnter = () => {
    UI.checkNotices(UI.isGuru() ? false : true);
    if (UI.isAdmin() && UI.sync && UI.sync.status === 'conflict') UI.actions.syncConflict();
  };

  // ---------- mula ----------
  function boot() {
    if (UI.demo) {
      // demo: terus masuk sebagai pentadbir tanpa Google atau kata laluan, dalam ruang storan berasingan
      UI.prefs.session = TT.newSession('admin', Date.now()); UI.prefs.sheet = null; UI.prefs.guru = null;
      if (UI.prefs.role !== 'guru') UI.prefs.role = 'admin';
      if (UI.hasSaved()) UI.state = UI.load(); else { UI.state = TT.demoSample(TT.todayISO()); UI.save(); }
      UI.savePrefs();
      UI.relief.date = TT.nextSchoolDay(UI.state, UI.relief.date);
      UI.render();
      if (UI.surveyFlush) UI.surveyFlush();
      if (UI.surveyNotice) UI.surveyNotice();
      return;
    }
    const g = TT.guruIdFrom(new URLSearchParams(location.search).get('g') || '');
    if (g && UI.guruSrc() !== g) { UI.prefs.guru = { src: g }; if (UI.prefs.session && UI.prefs.session.role === 'guru') UI.prefs.me = null; }
    const ses = UI.prefs.session, live = TT.sessionValid(ses, Date.now());
    if (!live) UI.prefs.session = null;
    if (live && ses.role === 'guru') { UI.prefs.role = 'guru'; UI.useGuruState(); } else UI.state = UI.load();
    if (live && ses.role === 'admin' && g) UI.toast('Ini pautan guru. Anda sedang log masuk sebagai pentadbir; log keluar untuk masuk sebagai guru.');
    UI.savePrefs();
    UI.relief.date = TT.nextSchoolDay(UI.state, UI.relief.date);
    UI.render();
    if (!live && g) UI.actions.gateGo({ dataset: { s: 'guru' } });
    if (live && ses.role === 'guru') UI.guruTick(true).then(() => UI.checkNotices());
    else if (live) { UI.checkNotices(); if (UI.sync) UI.sync.refresh(); }
  }
  if (UI.demo && !UI.hasSaved()) {
    // jana jadual contoh mengambil sekitar satu saat: paparkan skrin menunggu dahulu
    $('app').innerHTML = '<div class="gate"><div class="gate-card"><p class="gbusy"><i class="spin"></i>Menyediakan demo...</p></div></div>';
    setTimeout(boot, 40);
  } else boot();
})();
