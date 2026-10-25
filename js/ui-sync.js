(function () {
  'use strict';
  const { esc, actions, changes } = UI;
  const CFG = UI.cfg;
  const S = () => UI.state;
  const localDate = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const sync = UI.sync = {
    status: 'off', msg: '', email: '', timer: null, quiet: false, busy: false, again: false,
    configured: () => !!CFG.googleClientId,
    hosted: () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname),
    linked: () => !!(UI.prefs.sheet && UI.prefs.sheet.id),
    signedIn: () => !!(sync.auth && sync.auth.has())
  };
  const LURL = CFG.licenseUrl || '';
  sync.license = { allowed: true, state: 'off', message: '' };
  sync.licensed = () => !LURL || sync.license.allowed;
  if (sync.configured() && typeof TT.GoogleAuth === 'function') {
    sync.auth = new TT.GoogleAuth(CFG.googleClientId, TT.SHEET_SCOPE);
    sync.store = new TT.SheetStore({ fetch: (u, i) => fetch(u, i), token: () => sync.auth.token() });
    if (sync.linked()) sync.status = 'login';
  }

  sync.checkLicense = async () => {
    if (!LURL) { sync.license = TT.licenseDecision({ disabled: true }); return sync.license; }
    let result = null, error = null;
    try { result = await TT.fetchLicense(LURL, await sync.auth.token(), (u, i) => fetch(u, i)); } catch (e) { error = e; }
    sync.license = TT.licenseDecision({ result, error, cache: UI.prefs.license, email: sync.email, now: Date.now() });
    if (sync.license.cache) { UI.prefs.license = sync.license.cache; UI.savePrefs(); }
    return sync.license;
  };

  const set = (st, msg) => { sync.status = st; sync.msg = msg || ''; if (UI.refreshSyncPill) UI.refreshSyncPill(); };
  const fail = (e) => {
    if (e.needsLogin || e.status === 401) set('login', 'Sesi Google tamat. Sambung semula untuk terus menyimpan.');
    else if (e.status === 403) set('error', 'Tiada akses ke Sheet ini. Sheet mesti dicipta oleh app ini menggunakan akaun Google yang sama.');
    else if (e.status === 404) set('error', 'Sheet tidak dijumpai. Mungkin telah dipadam.');
    else set('error', e.message || 'Gagal berhubung dengan Google');
  };

  sync.schedule = () => {
    if (!sync.licensed() || !sync.linked() || !sync.signedIn() || sync.status === 'conflict' || UI.prefs.sheet.auto === false) return;
    clearTimeout(sync.timer);
    set('pending', 'Perubahan akan disimpan sebentar lagi');
    sync.timer = setTimeout(() => sync.push(false), 2500);
  };

  sync.push = async (force) => {
    if (!sync.linked() || !sync.licensed()) return;
    if (sync.busy) { sync.again = true; return; }
    clearTimeout(sync.timer); sync.busy = true; set('saving', 'Menyimpan ke Google Sheets');
    try {
      const id = UI.prefs.sheet.id;
      if (!force) {
        const meta = await sync.store.readMeta(id);
        const known = UI.prefs.sheet.syncedAt || '';
        if (meta.dikemaskini && meta.dikemaskini !== known && meta.oleh !== UI.prefs.deviceId) {
          set('conflict', `Sheet telah dikemas kini dari peranti lain (${localDate(meta.dikemaskini)}).`);
          return;
        }
      }
      const now = new Date().toISOString();
      const r = await sync.store.save(id, S(), { updatedAt: now, by: UI.prefs.deviceId, app: `${CFG.appName || 'Jadual Sekolah'} ${CFG.version || ''}`.trim() });
      Object.assign(UI.prefs.sheet, { syncedAt: now, url: r.url, title: r.title });
      UI.prefs.lastBackup = now; UI.savePrefs();
      set('saved', `Disimpan ${localDate(now)}`);
    } catch (e) { fail(e); } finally {
      sync.busy = false;
      if (sync.again) { sync.again = false; sync.schedule(); }
    }
  };

  sync.pull = async () => {
    if (!sync.licensed()) { set('unlicensed', sync.license.message); return; }
    set('saving', 'Memuat dari Google Sheets');
    try {
      const r = await sync.store.load(UI.prefs.sheet.id);
      sync.quiet = true; UI.state = r.state; UI.save(); sync.quiet = false;
      Object.assign(UI.prefs.sheet, { syncedAt: r.meta.dikemaskini || '', title: r.title, url: r.url }); UI.savePrefs();
      set('saved', 'Dimuat dari Google Sheets'); UI.render(); UI.toast('Data dimuat dari Google Sheets.');
    } catch (e) { sync.quiet = false; fail(e); UI.toast(sync.msg, 'err'); }
  };

  // ---------- tindakan ----------
  const guard = () => {
    if (!sync.configured()) { UI.toast('Google Sheets belum dikonfigurasi (config.js).', 'err'); return false; }
    if (!sync.hosted()) { UI.toast('Log masuk Google hanya berfungsi bila app dibuka melalui https atau localhost.', 'err'); return false; }
    return true;
  };
  actions.syncSignIn = async () => {
    if (!guard()) return;
    try {
      await sync.auth.signIn(sync.linked() ? '' : 'consent');
      sync.email = await sync.auth.email();
      await sync.checkLicense();
      if (!sync.license.allowed) { set('unlicensed', sync.license.message); UI.render(); return; }
      if (sync.linked()) {
        const meta = await sync.store.readMeta(UI.prefs.sheet.id);
        if (meta.dikemaskini && meta.dikemaskini !== (UI.prefs.sheet.syncedAt || '') && meta.oleh !== UI.prefs.deviceId) {
          set('conflict', `Sheet dikemas kini dari peranti lain (${localDate(meta.dikemaskini)}).`); conflictModal();
        } else set('saved', 'Disambung');
      } else set('off');
      UI.render();
    } catch (e) { fail(e); UI.toast(e.message, 'err'); UI.render(); }
  };
  actions.syncCreate = async () => {
    if (!guard() || !sync.signedIn() || !sync.licensed()) return;
    try {
      set('saving', 'Mencipta Sheet');
      const r = await sync.store.create(`Jadual Sekolah - ${S().school.name}`);
      UI.prefs.sheet = { id: r.id, url: r.url, title: r.title, syncedAt: '', auto: true }; UI.savePrefs();
      await sync.push(true);
      UI.render(); UI.toast('Google Sheet dicipta dan data disimpan.');
    } catch (e) { fail(e); UI.toast(sync.msg, 'err'); UI.render(); }
  };
  actions.syncLink = () => {
    if (!guard() || !sync.signedIn() || !sync.licensed()) return;
    UI.modalOpen('Guna Google Sheet sedia ada', `<label class="fld"><span>Pautan atau ID Google Sheet</span><input id="sheetLink" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
      <p class="hint">Dengan kebenaran <b>drive.file</b>, app ini hanya boleh membuka Sheet yang dicipta oleh app ini sendiri menggunakan akaun Google yang sama. Ini menjaga privasi fail lain dalam Drive anda.</p><div id="formErr" class="err"></div>`,
    '<button class="btn" data-act="modalClose">Batal</button><button class="btn primary" data-act="syncLinkGo">Sambung</button>');
  };
  actions.syncLinkGo = async () => {
    const id = TT.sheetIdFrom(document.getElementById('sheetLink').value);
    const err = document.getElementById('formErr');
    if (!id) { err.textContent = 'Pautan tidak sah.'; return; }
    try {
      const info = await sync.store.info(id);
      const meta = await sync.store.readMeta(id);
      UI.prefs.sheet = { id, url: info.url, title: info.title, syncedAt: '', auto: true }; UI.savePrefs();
      UI.modalClose();
      if (meta.dikemaskini) { set('conflict', 'Sheet ini sudah ada data.'); conflictModal(true); } else { await sync.push(true); UI.render(); }
    } catch (e) { err.textContent = e.status === 403 || e.status === 404 ? 'Sheet ini tidak boleh dibuka oleh app ini (bukan dicipta oleh app ini, atau akaun Google berbeza).' : e.message; }
  };
  function conflictModal(fresh) {
    UI.modalOpen(fresh ? 'Sheet ini sudah ada data' : 'Data tidak selari', `<p>${fresh ? 'Sheet yang dipilih sudah mengandungi data Jadual Sekolah.' : esc(sync.msg)}</p>
      <p>Pilih data mana yang hendak dikekalkan. Pilihan lain akan ditulis ganti.</p>
      <ul class="plain"><li><b>Muat dari Sheet</b>: data dalam pelayar ini diganti dengan data Sheet.</li><li><b>Tulis ganti Sheet</b>: Sheet diganti dengan data dalam pelayar ini.</li></ul>`,
    '<button class="btn" data-act="modalClose">Tangguh</button><button class="btn" data-act="syncResolvePush">Tulis ganti Sheet</button><button class="btn primary" data-act="syncResolvePull">Muat dari Sheet</button>');
  }
  actions.syncConflict = () => conflictModal();
  actions.syncResolvePull = async () => { UI.modalClose(); await sync.pull(); };
  actions.syncResolvePush = async () => { UI.modalClose(); await sync.push(true); UI.render(); };
  actions.syncPush = async () => { await sync.push(false); if (sync.status === 'conflict') conflictModal(); UI.render(); };
  actions.syncPull = () => UI.confirm('Ganti data dalam pelayar ini dengan data dari Google Sheet?', () => sync.pull(), 'Muat');
  actions.syncUnlink = () => UI.confirm('Putuskan sambungan dengan Google Sheet ini? Sheet tidak dipadam, cuma tidak lagi dikemas kini.', () => { UI.prefs.sheet = null; UI.savePrefs(); set('off'); UI.render(); }, 'Putuskan');
  actions.syncSignOut = () => { sync.auth.signOut(); sync.email = ''; set(sync.linked() ? 'login' : 'off'); UI.render(); };
  changes.syncAuto = (el) => { UI.prefs.sheet.auto = el.checked; UI.savePrefs(); if (el.checked) sync.schedule(); };

  window.addEventListener('beforeunload', (e) => {
    if (sync.status === 'pending' || sync.status === 'saving') { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- kad Tetapan > Storan ----------
  UI.syncStatusHtml = () => {
    const map = { off: ['', 'Belum disambung'], login: ['warn', 'Perlu sambung semula'], pending: ['', 'Ada perubahan belum disimpan'], saving: ['', 'Menyimpan...'], saved: ['ok', 'Selari'], error: ['bad', 'Ralat'], conflict: ['bad', 'Konflik data'], unlicensed: ['bad', 'Tiada lesen'] };
    const [tone, text] = map[sync.status] || map.off;
    return `<span class="chip-s ${tone === 'ok' ? 'green' : tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : 'grey'}">${text}</span>${sync.msg ? ` <small>${esc(sync.msg)}</small>` : ''}`;
  };

  UI.syncCard = () => {
    const sh = UI.prefs.sheet;
    const head = `<div class="ch"><div><h2>${UI.icon('database')} Google Sheets</h2><small>Simpan data dalam Google Drive akaun sekolah anda sendiri</small></div></div>`;
    if (!sync.configured()) {
      return `<section class="card">${head}<p>Ciri ini belum diaktifkan untuk pemasangan ini. Data kini disimpan dalam pelayar sahaja.</p>
        <details class="faq"><summary>Cara aktifkan (untuk pembekal / IT sekolah)</summary><ol class="steps">
        <li>Dalam Google Cloud Console, cipta projek dan aktifkan <b>Google Sheets API</b>.</li>
        <li>Skrin persetujuan OAuth: jenis External, tambah skop <code>drive.file</code>.</li>
        <li>Cipta kelayakan <b>OAuth client ID</b> jenis Web application. Tambah asal (origin) app di bawah sebagai <i>Authorized JavaScript origin</i>.</li>
        <li>Salin Client ID ke <code>config.js</code> (medan <code>googleClientId</code>), kemudian muat semula.</li></ol>
        <p class="hint">Asal app semasa: <code>${esc(location.origin === 'null' ? location.protocol + '//' : location.origin)}</code>${!sync.hosted() ? '. Fail yang dibuka terus (file://) tidak boleh log masuk Google; app perlu dihos, contohnya GitHub Pages.' : ''}</p></details></section>`;
    }
    if (!sync.hosted()) return `<section class="card">${head}<p>Log masuk Google hanya berfungsi bila app dibuka melalui https (contoh GitHub Pages) atau localhost. Fail yang dibuka terus dari komputer tidak disokong oleh Google.</p></section>`;
    const L = sync.license;
    const licLine = !LURL ? '' : L.allowed ? `<p class="hint">Lesen: ${esc(L.school || 'aktif')}${L.expires ? ', sah hingga ' + esc(TT.fmtDate(L.expires)) : ''}.${L.message ? ` <b class="warn">${esc(L.message)}</b>` : ''}</p>`
      : `<div class="banner bad"><b>${esc(L.message)}</b>${CFG.support && (CFG.support.whatsapp || CFG.support.email) ? `<br>Hubungi: ${esc(CFG.support.whatsapp || CFG.support.email)}` : ''}</div>`;
    const status = `<div class="sync-line">Status: <span id="syncStatus">${UI.syncStatusHtml()}</span></div>${licLine}`;
    if (!sync.signedIn()) {
      return `<section class="card">${head}${sh ? `<p>Disambung ke <a href="${esc(sh.url)}" target="_blank" rel="noopener">${esc(sh.title || 'Google Sheet')}</a>. Kali terakhir selari: ${sh.syncedAt ? localDate(sh.syncedAt) : '-'}.</p>${status}` : '<p>Log masuk dengan akaun Google sekolah (contoh DELIMa) untuk menyimpan data dalam Google Sheet milik anda. App hanya boleh membuka fail yang ia cipta sendiri.</p>'}
        <div class="row"><button class="btn primary" data-act="syncSignIn">${UI.icon('user')} ${sh ? 'Sambung semula' : 'Log masuk Google'}</button>${sh ? '<button class="btn" data-act="syncUnlink">Putuskan</button>' : ''}</div></section>`;
    }
    if (!sync.licensed()) {
      return `<section class="card">${head}<p>Log masuk sebagai <b>${esc(sync.email || 'akaun Google')}</b>.</p>${licLine}
        <div class="row"><button class="btn primary" data-act="syncSignIn">${UI.icon('refresh')} Semak lesen semula</button><button class="btn" data-act="syncSignOut">Log keluar</button></div></section>`;
    }
    if (!sh) {
      return `<section class="card">${head}<p>Log masuk sebagai <b>${esc(sync.email || 'akaun Google')}</b>.</p>${licLine}
        <div class="row"><button class="btn primary" data-act="syncCreate">${UI.icon('plus')} Cipta Sheet baharu</button><button class="btn" data-act="syncLink">Guna Sheet sedia ada</button><button class="btn" data-act="syncSignOut">Log keluar</button></div></section>`;
    }
    return `<section class="card">${head}<p>Disambung ke <a href="${esc(sh.url)}" target="_blank" rel="noopener">${esc(sh.title || 'Google Sheet')} ${UI.icon('external')}</a> sebagai <b>${esc(sync.email || 'akaun Google')}</b>.</p>${status}
      <label class="fld chk"><input type="checkbox" data-chg="syncAuto"${sh.auto !== false ? ' checked' : ''}><span>Simpan automatik setiap kali data berubah</span></label>
      <div class="row">${sync.status === 'conflict' ? '<button class="btn danger-fill" data-act="syncConflict">Selesaikan konflik</button>' : ''}<button class="btn primary" data-act="syncPush">${UI.icon('upload')} Simpan sekarang</button><button class="btn" data-act="syncPull">${UI.icon('download')} Muat dari Sheet</button><button class="btn" data-act="syncUnlink">Putuskan</button><button class="btn" data-act="syncSignOut">Log keluar</button></div></section>`;
  };
})();
