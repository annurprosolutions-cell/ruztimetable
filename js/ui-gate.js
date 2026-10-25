(function () {
  'use strict';
  // Skrin log masuk: dipaparkan sebelum app bila peranti ini belum ada sesi (30 hari).
  //  Pentadbir: log masuk Google (jika dihos) -> kata laluan, atau tetapan awal kali pertama.
  //  Guru: pilih nama sahaja, paparan baca sahaja dari pautan guru.
  const { esc, actions, changes } = UI;
  const CFG = UI.cfg;
  const GKEY = 'jadual-sekolah-guru';
  const G = UI.gate = { step: 'role', err: '', busy: '', wz: null, fails: 0, lockUntil: 0 };
  const sy = () => UI.sync;
  const google = () => !!(sy() && sy().configured() && sy().hosted());
  const S = () => UI.state;
  const empty = (s) => !s.teachers.length && !s.classes.length;

  UI.needGate = () => !TT.sessionValid(UI.prefs.session, Date.now());

  // ---------- data guru (salinan baca sahaja) ----------
  UI.guruSrc = () => (UI.prefs.guru && UI.prefs.guru.src) || '';
  UI.guruCache = () => { try { const v = JSON.parse(localStorage.getItem(GKEY) || 'null'); return v && v.src && v.data ? v : null; } catch (e) { return null; } };
  UI.useGuruState = () => {
    const src = UI.guruSrc(), c = UI.guruCache();
    UI.state = !src ? UI.load() : c && c.src === src ? TT.migrate(c.data) : TT.newState();
    UI.readOnly = true;
  };
  UI.refreshGuru = async (quiet) => {
    const src = UI.guruSrc(); if (!src) return true;
    try {
      const data = await TT.fetchGuru(src, (u, i) => fetch(u, i));
      try { localStorage.setItem(GKEY, JSON.stringify({ src, at: Date.now(), data })); } catch (e) { /* storan penuh */ }
      if (UI.readOnly) UI.state = data;
      UI.guruErr = ''; UI.guruAt = Date.now();
      return true;
    } catch (e) { UI.guruErr = e.message; if (!quiet) UI.toast(e.message, 'err'); return false; }
  };

  // ---------- sesi ----------
  UI.enter = (role) => {
    UI.prefs.session = TT.newSession(role, Date.now()); UI.prefs.role = role; UI.savePrefs();
    UI.readOnly = role === 'guru';
    Object.assign(G, { step: 'role', err: '', busy: '', wz: null });
    UI.page = 'utama'; UI.menu = null; UI.modalClose(); UI.render(); window.scrollTo(0, 0);
    if (UI.afterEnter) UI.afterEnter();
  };
  UI.logout = (next) => {
    UI.prefs.session = null; UI.savePrefs();
    UI.readOnly = false; UI.state = UI.load(); UI.menu = null;
    Object.assign(G, { step: 'role', err: '', busy: '', wz: null });
    UI.modalClose(); UI.render();
    if (next) actions.gateGo({ dataset: { s: next } });
  };
  actions.logout = () => UI.logout();
  actions.adminLogin = () => UI.logout('admin');

  const draw = () => { if (UI.needGate()) UI.render(); };
  const busy = (msg) => { G.busy = msg; G.err = ''; draw(); };
  const fail = (e) => { G.busy = ''; G.err = e && e.message ? e.message : String(e); draw(); };

  // ---------- langkah ----------
  actions.gateGo = async (el) => {
    const to = el.dataset.s;
    G.err = ''; G.busy = '';
    if (to === 'role') { G.step = 'role'; draw(); return; }
    if (to === 'guru') {
      UI.useGuruState(); G.step = 'guru'; draw();
      if (UI.guruSrc()) { busy('Memuat data guru...'); await UI.refreshGuru(true); G.busy = ''; draw(); }
      return;
    }
    // pentadbir: data dalam pelayar ini
    UI.readOnly = false; UI.state = UI.load();
    if (TT.sessionValid(UI.prefs.session, Date.now()) && UI.prefs.session.role === 'admin') { UI.enter('admin'); return; }
    G.step = google() ? 'google' : nextAdmin(); G.wz = null; draw();
  };
  const nextAdmin = () => (S().auth && S().auth.admin ? 'pw' : 'wizard');
  actions.gateLocal = () => { G.local = true; G.err = ''; G.step = nextAdmin(); draw(); };

  actions.gateGoogle = async () => {
    const s = sy();
    try {
      busy('Menunggu log masuk Google...');
      if (!s.signedIn()) await s.auth.signIn(s.auth.lastEmail() ? '' : 'consent');
      s.email = await s.auth.email();
      busy('Menyemak lesen...');
      await s.checkLicense();
      if (!s.license.allowed) { G.busy = ''; G.err = s.license.message; G.unlicensed = true; s.setStatus('unlicensed', s.license.message); draw(); return; }
      G.unlicensed = false;
      busy('Mencari Google Sheet sekolah...');
      await findSheet();
      G.busy = ''; G.local = false; G.step = nextAdmin(); draw();
    } catch (e) { fail(e); }
  };

  async function adopt(id) {
    const s = sy(), r = await s.store.load(id);
    if (!empty(S()) && !UI.prefs.sheet) { try { localStorage.setItem(UI.KEY + '-sebelum', JSON.stringify(S())); } catch (e) { /* abaikan */ } }
    s.quiet = true; UI.readOnly = false; UI.state = UI.carry(r.state); UI.save(); s.quiet = false;
    const prev = UI.prefs.sheet || {};
    UI.prefs.sheet = { id, url: r.url, title: r.title, syncedAt: r.meta.dikemaskini || '', auto: prev.auto !== false, dirty: false, guruShared: prev.id === id ? prev.guruShared : !!r.state.school.guruSheet };
    UI.savePrefs(); s.setStatus('saved', 'Dimuat dari Google Sheets');
  }
  async function findSheet() {
    const s = sy(), sh = UI.prefs.sheet;
    let meta = null;
    if (sh) {
      try { meta = await s.store.readMeta(sh.id); } catch (e) {
        if (![403, 404].includes(e.status)) throw e;
        UI.prefs.sheet = null; UI.savePrefs(); // Sheet dipadam atau akaun lain: cari semula
      }
    }
    if (meta) {
      // peranti ini sudah disambung: ambil versi terkini jika tiada perubahan tempatan yang belum dihantar
      if (meta.dikemaskini && meta.dikemaskini !== (sh.syncedAt || '') && meta.oleh !== UI.prefs.deviceId) {
        if (sh.dirty) s.setStatus('conflict', 'Sheet dikemas kini dari peranti lain, dan peranti ini ada perubahan yang belum disimpan.');
        else await adopt(sh.id);
      } else if (sh.dirty) await s.push(true);
      else s.setStatus('saved', 'Disambung');
      return;
    }
    // peranti baharu: cari Sheet yang pernah dicipta oleh akaun ini
    const ids = [], c = UI.guruCache();
    if (c && c.data.published && c.data.published.master) ids.push(c.data.published.master);
    try { (await s.store.findMaster()).forEach((f) => { if (!ids.includes(f.id)) ids.push(f.id); }); } catch (e) { G.note = 'Carian automatik tidak tersedia (Google Drive API belum diaktifkan). Sheet sedia ada boleh disambung kemudian di Tetapan > Storan.'; }
    for (const id of ids) {
      try { await adopt(id); return; } catch (e) { if (![403, 404, 422].includes(e.status)) throw e; }
    }
  }

  // ---------- kata laluan ----------
  actions.gatePw = async () => {
    const el = document.getElementById('gPw'), pw = el ? el.value : '';
    if (Date.now() < G.lockUntil) { G.err = `Terlalu banyak cubaan. Cuba lagi dalam ${Math.ceil((G.lockUntil - Date.now()) / 1000)} saat.`; draw(); return; }
    if (!pw) { G.err = 'Masukkan kata laluan.'; draw(); return; }
    busy('Menyemak...');
    const ok = await TT.verifyPassword(pw, S().auth && S().auth.admin).catch(() => false);
    G.busy = '';
    if (ok) { G.fails = 0; UI.enter('admin'); return; }
    G.fails++; if (G.fails >= 5) { G.lockUntil = Date.now() + 30000; G.fails = 0; }
    G.err = 'Kata laluan salah.'; draw();
  };
  actions.gateForgot = () => {
    if (google() && sy().signedIn() && UI.prefs.sheet && !G.local) {
      // akaun Google pemilik Sheet sudah disahkan: boleh tetapkan kata laluan baharu
      G.step = 'wizard'; G.wz = { steps: ['katalaluan'], i: 0, reset: true }; G.err = ''; draw(); return;
    }
    G.forgot = true; G.err = ''; draw();
  };
  actions.gateWipe = () => UI.confirm('Padam SEMUA data sekolah dalam pelayar ini dan mula semula? Data dalam Google Sheet (jika ada) tidak terjejas.', () => {
    try { localStorage.removeItem(UI.KEY); } catch (e) { /* abaikan */ }
    UI.prefs.sheet = null; UI.savePrefs(); UI.state = TT.newState(); G.forgot = false; G.step = 'wizard'; G.wz = null; draw();
  }, 'Padam dan mula semula');

  // ---------- tetapan awal ----------
  const wizard = () => {
    if (!G.wz) {
      const s = S();
      G.wz = { steps: ['sekolah', 'katalaluan'].concat(empty(s) ? ['data'] : []), i: 0,
        name: s.school.name === 'Sekolah Saya' ? '' : s.school.name, week: s.school.weekMode, color: s.school.color || TT.BRAND_PRESETS[0], logo: s.school.logo, data: 'contoh' };
    }
    return G.wz;
  };
  const readStep = () => {
    const w = G.wz, v = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const st = w.steps[w.i];
    if (st === 'sekolah') {
      w.name = v('wName').trim(); w.week = v('wWeek') || 'mon-fri';
      if (!w.name) return 'Masukkan nama sekolah.';
    }
    if (st === 'katalaluan') {
      w.pw = v('wPw'); const p2 = v('wPw2');
      const bad = TT.passwordProblem(w.pw, p2); if (bad) return bad;
    }
    if (st === 'data') {
      const el = document.querySelector('input[name="wData"]:checked'); w.data = el ? el.value : 'contoh';
      if (w.data === 'import' && !w.imported) return 'Pilih fail backup JSON dahulu.';
    }
    return '';
  };
  actions.gateBack = () => { const w = G.wz; if (w && w.i > 0) { w.i--; G.err = ''; draw(); } else actions.gateGo({ dataset: { s: 'role' } }); };
  actions.gateNext = async () => {
    const w = G.wz, bad = readStep();
    if (bad) { G.err = bad; draw(); return; }
    G.err = '';
    if (w.i < w.steps.length - 1) { w.i++; draw(); return; }
    try { await finish(); } catch (e) { fail(e); }
  };
  actions.gateColor = (el) => { G.wz.color = el.dataset.c; readKeep(); draw(); };
  const readKeep = () => { const n = document.getElementById('wName'); if (n) G.wz.name = n.value; const wk = document.getElementById('wWeek'); if (wk) G.wz.week = wk.value; };
  changes.gateLogo = async (el) => {
    const f = el.files[0]; if (!f) return;
    readKeep();
    try { G.wz.logo = await UI.fitLogo(f); G.err = ''; } catch (e) { G.err = e.message; }
    draw();
  };
  changes.gateImport = (el) => {
    const f = el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const obj = JSON.parse(rd.result);
        if (!obj || !Array.isArray(obj.teachers) || !Array.isArray(obj.lessons)) throw new Error('format');
        G.wz.imported = TT.migrate(obj); delete G.wz.imported.auth; G.wz.imported.school.guruSheet = '';
        G.wz.data = 'import'; G.err = '';
      } catch (e) { G.err = 'Fail JSON tidak sah atau bukan fail Jadual Sekolah.'; }
      draw();
    };
    rd.readAsText(f);
  };

  async function finish() {
    const w = G.wz;
    busy('Menyimpan tetapan...');
    let st = S();
    if (w.steps.includes('data')) {
      st = w.data === 'contoh' ? TT.sample() : w.data === 'import' && w.imported ? w.imported : TT.newState();
      st = UI.carry(st);
    }
    if (w.steps.includes('sekolah')) Object.assign(st.school, { name: w.name, weekMode: w.week, color: w.color, logo: w.logo || '' });
    st.auth = { admin: await TT.hashPassword(w.pw) };
    UI.readOnly = false; UI.state = st; UI.lastGen = null;
    UI.relief.date = TT.nextSchoolDay(st, TT.todayISO());
    UI.save();
    const s = sy();
    if (google() && !G.local && s.signedIn() && s.licensed() && !s.linked()) {
      busy('Mencipta Google Sheet sekolah...');
      try { await s.createMaster(); } catch (e) { UI.toast('Google Sheet belum dapat dicipta: ' + e.message + '. Cuba di Tetapan > Storan.', 'err'); }
    }
    const blank = empty(st), reset = w.reset;
    UI.enter('admin');
    if (blank) { UI.page = 'data'; UI.render(); }
    UI.toast(reset ? 'Kata laluan baharu disimpan.' : blank ? 'Tetapan awal selesai. Mula dengan tambah guru, subjek dan kelas.' : 'Tetapan awal selesai.');
  }

  // ---------- guru ----------
  actions.gateLink = async () => {
    const id = TT.guruIdFrom((document.getElementById('gLink') || {}).value);
    if (!id) { G.err = 'Pautan tidak sah. Salin pautan penuh yang dikongsi oleh pentadbir.'; draw(); return; }
    UI.prefs.guru = { src: id }; UI.savePrefs();
    UI.useGuruState(); busy('Memuat data guru...');
    const ok = await UI.refreshGuru(true);
    G.busy = ''; if (!ok) G.err = UI.guruErr; draw();
  };
  actions.gatePick = (el) => { UI.prefs.me = el.dataset.id; UI.enter('guru'); };
  actions.gateRetry = async () => { busy('Memuat data guru...'); await UI.refreshGuru(true); G.busy = ''; draw(); };
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'gQ') return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.gate .pickbtn').forEach((b) => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.closest || !e.target.closest('.gate')) return;
    if (e.target.id === 'gPw') { e.preventDefault(); actions.gatePw(); }
    else if (e.target.id === 'gLink') { e.preventDefault(); actions.gateLink(); }
    else if (/^w(Name|Pw|Pw2)$/.test(e.target.id)) { e.preventDefault(); actions.gateNext(); }
  });

  // ---------- paparan ----------
  const back = (to) => `<button class="lnk gback" data-act="${to === 'wizard' ? 'gateBack' : 'gateGo'}" data-s="${to || 'role'}">${UI.icon('chevLeft')} Kembali</button>`;
  const msg = () => (G.busy ? `<p class="gbusy"><i class="spin"></i>${esc(G.busy)}</p>` : '') + (G.err ? `<p class="err" role="alert">${esc(G.err)}</p>` : '');

  function stepRole() {
    return `<h1>Log masuk</h1><p class="gsub">Pilih peranan anda.</p>
      <button class="gopt" data-act="gateGo" data-s="admin">${UI.icon('shield')}<span><b>Pentadbir jadual</b><small>Urus data, jadual dan relief. Perlu kata laluan.</small></span>${UI.icon('chevRight')}</button>
      <button class="gopt" data-act="gateGo" data-s="guru">${UI.icon('user')}<span><b>Guru</b><small>Lihat jadual dan tugas relief sendiri. Pilih nama sahaja.</small></span>${UI.icon('chevRight')}</button>`;
  }
  function stepGoogle() {
    const s = sy(), last = s.auth.lastEmail();
    const lic = G.unlicensed ? `<div class="row"><button class="btn" data-act="gateGoogle">${UI.icon('refresh')} Semak semula</button><button class="btn" data-act="gateLocal">Teruskan tanpa Google Sheets</button></div>` : '';
    return `${back()}<h1>Pentadbir</h1><p class="gsub">Log masuk dengan akaun Google sekolah. Data disimpan dalam Google Sheet milik akaun ini, bukan pada pembekal.</p>
      <button class="btn primary big wide" data-act="gateGoogle"${G.busy ? ' disabled' : ''}>${GLOGO} ${s.signedIn() && last ? 'Teruskan sebagai ' + esc(last) : 'Log masuk dengan Google'}</button>
      ${last && !s.signedIn() ? `<small class="center">Akaun terakhir: ${esc(last)}</small>` : ''}${msg()}${lic}
      <button class="lnk center" data-act="gateLocal">Guna tanpa Google (data dalam pelayar ini sahaja)</button>`;
  }
  function stepPw() {
    const s = sy(), who = !G.local && s && s.signedIn() && s.email ? `<p class="gsub">${UI.icon('check')} ${esc(s.email)}${UI.prefs.sheet ? ' · ' + esc(UI.prefs.sheet.title || 'Google Sheet') : ''}</p>` : '<p class="gsub">Masukkan kata laluan pentadbir sekolah ini.</p>';
    const forgot = G.forgot ? `<div class="banner warn">Kata laluan disimpan bersama data sekolah. ${google() ? 'Log masuk dengan akaun Google pemilik Sheet, kemudian tekan "Lupa kata laluan?" sekali lagi untuk tetapkan yang baharu.' : ''}
      Jika tiada Google Sheet, satu-satunya cara ialah padam data dalam pelayar ini dan mula semula (atau import backup JSON selepas itu).
      <div class="row">${google() && G.local ? '<button class="btn" data-act="gateGo" data-s="admin">Log masuk Google</button>' : ''}<button class="btn danger" data-act="gateWipe">Padam data pelayar ini</button></div></div>` : '';
    return `${back()}<h1>Kata laluan pentadbir</h1>${who}
      <label class="fld"><span>Kata laluan</span><input type="password" id="gPw" autocomplete="current-password" autofocus></label>
      <button class="btn primary big wide" data-act="gatePw"${G.busy ? ' disabled' : ''}>Masuk</button>${msg()}
      <button class="lnk center" data-act="gateForgot">Lupa kata laluan?</button>${forgot}`;
  }
  function stepWizard() {
    const w = wizard(), st = w.steps[w.i], n = w.steps.length;
    const dots = n > 1 ? `<div class="wsteps">${w.steps.map((x, i) => `<i class="${i < w.i ? 'done' : i === w.i ? 'on' : ''}"></i>`).join('')}<span>Langkah ${w.i + 1} daripada ${n}</span></div>` : '';
    let body = '';
    if (st === 'sekolah') {
      body = `<h1>Tetapan awal</h1><p class="gsub">Maklumat asas sekolah. Semua boleh diubah kemudian di Tetapan.</p>
        <label class="fld"><span>Nama sekolah</span><input id="wName" value="${esc(w.name)}" placeholder="Contoh: SMK Taman Melati" autofocus></label>
        <label class="fld"><span>Minggu persekolahan</span><select id="wWeek">${UI.optHtml([{ v: 'mon-fri', t: 'Isnin hingga Jumaat' }, { v: 'sun-thu', t: 'Ahad hingga Khamis (Johor, Kedah, Kelantan, Terengganu)' }], w.week)}</select></label>
        <div class="fld"><span>Warna sekolah</span><div class="swatches">${TT.BRAND_PRESETS.map((c) => `<button class="swatch${w.color === c ? ' on' : ''}" style="background:${c}" data-act="gateColor" data-c="${c}" aria-label="Warna ${c}"></button>`).join('')}</div></div>
        <div class="fld"><span>Logo sekolah (pilihan)</span><div class="wlogo">${TT.validLogo(w.logo) ? `<img src="${w.logo}" alt="Logo">` : '<i></i>'}<label class="btn">${UI.icon('upload')} Pilih imej<input type="file" accept="image/*" data-chg="gateLogo" hidden></label></div></div>`;
    } else if (st === 'katalaluan') {
      body = `<h1>${w.reset ? 'Kata laluan baharu' : 'Kata laluan pentadbir'}</h1><p class="gsub">Diperlukan setiap kali pentadbir log masuk pada peranti baharu (sesi kekal 30 hari). Guru tidak memerlukannya.</p>
        <label class="fld"><span>Kata laluan (sekurang-kurangnya ${TT.PW_MIN} aksara)</span><input type="password" id="wPw" autocomplete="new-password" autofocus></label>
        <label class="fld"><span>Ulang kata laluan</span><input type="password" id="wPw2" autocomplete="new-password"></label>`;
    } else {
      const opt = (v, t, d) => `<label class="gradio"><input type="radio" name="wData" value="${v}"${w.data === v ? ' checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`;
      body = `<h1>Data permulaan</h1><p class="gsub">Pilih cara untuk bermula.</p>
        ${opt('contoh', 'Cuba dengan data contoh', '18 guru dan 9 kelas, sedia untuk dijana. Boleh dipadam bila-bila masa.')}
        ${opt('kosong', 'Mula kosong', 'Masukkan guru, subjek dan kelas sekolah anda sendiri.')}
        ${opt('import', 'Import backup JSON', w.imported ? `Fail dipilih: ${esc(w.imported.school.name)} (${w.imported.teachers.length} guru)` : 'Fail yang dieksport dari app ini sebelum ini.')}
        <label class="btn sm">${UI.icon('upload')} Pilih fail JSON<input type="file" accept=".json,application/json" data-chg="gateImport" hidden></label>`;
    }
    const last = w.i === n - 1;
    return `${back('wizard')}${dots}${body}${msg()}
      <div class="row end"><button class="btn primary big" data-act="gateNext"${G.busy ? ' disabled' : ''}>${last ? 'Selesai' : 'Seterusnya'}</button></div>`;
  }
  function stepGuru() {
    const src = UI.guruSrc(), s = S();
    if (!src && !s.teachers.length) {
      return `${back()}<h1>Guru</h1><p class="gsub">Buka pautan guru yang dikongsi oleh pentadbir jadual sekolah anda (contohnya melalui WhatsApp), atau tampal pautan itu di bawah.</p>
        <label class="fld"><span>Pautan guru</span><input id="gLink" placeholder="https://.../?g=..." autofocus></label>
        <button class="btn primary big wide" data-act="gateLink"${G.busy ? ' disabled' : ''}>Buka</button>${msg()}`;
    }
    const stale = UI.guruErr ? `<div class="banner warn">${esc(UI.guruErr)}${s.teachers.length ? '' : ''}<div class="row"><button class="btn sm" data-act="gateRetry">${UI.icon('refresh')} Cuba lagi</button></div></div>` : '';
    const list = s.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `${back()}<h1>Siapa anda?</h1><p class="gsub">Pilih nama anda. Pilihan disimpan pada peranti ini selama ${TT.SESSION_DAYS} hari.</p>${msg()}${stale}
      ${list.length > 8 ? '<input id="gQ" class="gsearch" placeholder="Cari nama..." autocomplete="off">' : ''}
      <div class="pick gpick">${list.map((t) => `<button class="pickbtn" data-act="gatePick" data-id="${esc(t.id)}"><span class="av">${esc(UI.initials(t.name))}</span>${esc(t.name)}</button>`).join('') || (G.busy ? '' : '<p class="empty">Tiada senarai guru lagi. Minta pentadbir simpan data sekolah ke Google Sheets.</p>')}</div>`;
  }

  const GLOGO = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z"/><path fill="#fff" opacity=".55" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4 5.6-4z"/></svg>';

  UI.gateHtml = () => {
    const sc = S().school, named = sc.name && sc.name !== 'Sekolah Saya';
    const body = { role: stepRole, google: stepGoogle, pw: stepPw, wizard: stepWizard, guru: stepGuru }[G.step] || stepRole;
    const install = UI.canInstall && UI.canInstall() ? `<button class="lnk" data-act="install">${UI.icon('download')} Pasang app</button> · ` : '';
    return `<div class="gate"><div class="gate-card">
        <div class="gbrand"><span class="mark${TT.validLogo(sc.logo) ? ' logo' : ''}">${TT.validLogo(sc.logo) ? `<img src="${sc.logo}" alt="">` : UI.icon('calendar')}</span>
          <span><b>${esc(named ? sc.name : CFG.appName || 'Jadual Sekolah')}</b><small>${esc(named ? CFG.appName || 'Jadual Sekolah' : 'Jadual waktu dan relief guru')}</small></span></div>
        ${body()}${G.note && G.step !== 'role' ? `<p class="hint">${esc(G.note)}</p>` : ''}</div>
      <p class="gate-foot">${install}<a href="privasi.html" target="_blank" rel="noopener">Privasi</a> · ${esc(CFG.appName || 'Jadual Sekolah')} ${esc(CFG.version || '')}${CFG.vendor ? ' · ' + esc(CFG.vendor) : ''}</p></div>`;
  };
})();
