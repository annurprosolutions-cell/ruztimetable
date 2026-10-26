(function () {
  'use strict';
  // PWA: pasang ke skrin utama, berfungsi luar talian (service worker), dan notifikasi.
  // Notifikasi di sini dicetuskan oleh app sendiri bila ia dibuka atau berjalan di latar.
  // Notifikasi ketika app ditutup sepenuhnya perlukan Web Push melalui pelayan (fasa seterusnya).
  const { actions } = UI;
  const nav = navigator;
  const P = UI.pwa = {
    prompt: null,
    standalone: (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true,
    ios: /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  };
  const hosted = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in nav && hosted && !UI.demo) {
    window.addEventListener('load', () => { nav.serviceWorker.register('sw.js').catch(() => { /* pelayar menyekat */ }); });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); P.prompt = e; if (UI.render && UI.state) UI.render(); });
  window.addEventListener('appinstalled', () => { P.prompt = null; P.standalone = true; UI.toast('App dipasang. Buka dari skrin utama telefon.'); });

  UI.canInstall = () => !UI.demo && !P.standalone && (!!P.prompt || P.ios);
  actions.install = async () => {
    if (P.prompt) {
      const ev = P.prompt; P.prompt = null;
      ev.prompt();
      try { await ev.userChoice; } catch (e) { /* abaikan */ }
      UI.render(); return;
    }
    UI.modalOpen('Pasang app ke skrin utama', P.ios
      ? `<ol class="steps"><li>Buka pautan ini dalam <b>Safari</b>.</li><li>Tekan butang <b>Kongsi</b> (petak dengan anak panah ke atas).</li><li>Pilih <b>Tambah ke Skrin Utama</b> (Add to Home Screen), kemudian <b>Tambah</b>.</li></ol>
        <p class="hint">Notifikasi pada iPhone/iPad hanya berfungsi selepas app dipasang ke skrin utama (iOS 16.4 ke atas).</p>`
      : `<ol class="steps"><li>Buka pautan ini dalam <b>Chrome</b> atau <b>Edge</b>.</li><li>Tekan menu <b>⋮</b> di penjuru atas.</li><li>Pilih <b>Pasang app</b> atau <b>Tambah ke skrin utama</b>.</li></ol>`,
    '<button class="btn primary" data-act="modalClose">Faham</button>');
  };

  // ---------- notifikasi ----------
  UI.notifyState = () => (!('Notification' in window) ? 'unsupported' : Notification.permission);
  UI.notifyOn = () => !!UI.prefs.notify && UI.notifyState() === 'granted';
  UI.notify = async (title, body, tag) => {
    if (!UI.notifyOn()) return false;
    const opt = { body, tag: tag || 'jadual', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: location.href } };
    try {
      const reg = 'serviceWorker' in nav ? await nav.serviceWorker.getRegistration() : null;
      if (reg) { await reg.showNotification(title, opt); return true; }
      new Notification(title, opt); return true; // eslint-disable-line no-new
    } catch (e) { return false; }
  };
  actions.notifyEnable = async () => {
    if (UI.notifyState() === 'unsupported') {
      UI.modalOpen('Notifikasi', P.ios && !P.standalone
        ? '<p>Pada iPhone/iPad, pasang app ke skrin utama dahulu (Safari → Kongsi → Tambah ke Skrin Utama), kemudian buka app dari skrin utama dan hidupkan notifikasi.</p>'
        : '<p>Pelayar ini tidak menyokong notifikasi. Cuba Chrome pada Android atau komputer.</p>', '<button class="btn primary" data-act="modalClose">Faham</button>');
      return;
    }
    const p = await Notification.requestPermission();
    UI.prefs.notify = p === 'granted'; UI.savePrefs();
    if (p === 'granted') {
      UI.checkNotices(true);
      await UI.notify('Notifikasi dihidupkan', UI.isGuru() ? 'Anda akan dimaklumkan bila ada tugas relief baharu.' : 'Anda akan dimaklumkan tentang perkara yang perlu tindakan.', 'uji');
      UI.toast('Notifikasi dihidupkan.');
    } else UI.toast('Kebenaran notifikasi ditolak. Hidupkan semula dalam tetapan pelayar.', 'err');
    UI.render();
  };
  actions.notifyDisable = () => { UI.prefs.notify = false; UI.savePrefs(); UI.render(); UI.toast('Notifikasi dimatikan pada peranti ini.'); };

  // bandingkan data semasa dengan apa yang pengguna sudah tahu, dan maklumkan yang baharu
  UI.checkNotices = (silent) => {
    const s = UI.state, today = TT.todayISO();
    if (!s || UI.needGate() || UI.demo) return;
    if (UI.isGuru()) {
      const t = UI.meTeacher(); if (!t) return;
      const key = (UI.guruSrc() || 'tempatan') + '|' + t.id, seen = UI.prefs.seen;
      if (!seen || seen.key !== key || silent) { UI.prefs.seen = { key, list: TT.reliefKeys(s, t.id, today) }; UI.savePrefs(); return; }
      const fresh = TT.newReliefs(s, t.id, today, seen.list);
      UI.prefs.seen = { key, list: TT.reliefKeys(s, t.id, today) }; UI.savePrefs();
      if (!fresh.length) return;
      const n = TT.reliefNotice(s, fresh);
      UI.toast(`${n.title}: ${n.body.split('\n')[0]}`);
      UI.notify(n.title, n.body, 'relief');
      return;
    }
    // pentadbir: satu ringkasan sehari tentang perkara mendesak
    const urgent = (UI.items || []).filter((i) => TT.URGENT.includes(i.sev));
    const mark = today + ':' + urgent.length;
    if (!urgent.length || UI.prefs.adminNote === mark) return;
    UI.prefs.adminNote = mark; UI.savePrefs();
    if (!silent) UI.notify(urgent.length === 1 ? urgent[0].title : `${urgent.length} perkara perlu tindakan`, urgent.slice(0, 3).map((i) => i.title).join('\n'), 'admin');
  };

  // guru: muat semula data dari pautan secara berkala ketika app dibuka
  const REFRESH_MS = 10 * 60 * 1000;
  let last = Date.now();
  const tick = async (force) => {
    if (UI.needGate() || !UI.readOnly || !UI.guruSrc()) return;
    if (!force && Date.now() - last < REFRESH_MS) return;
    last = Date.now();
    const ok = await UI.refreshGuru(true);
    if (ok && !UI.needGate()) { UI.render(); UI.checkNotices(); }
  };
  UI.guruTick = tick;
  setInterval(() => { if (document.visibilityState === 'visible') tick(); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 2 * 60 * 1000) tick(true); });

  // kad kecil pada dashboard: pasang app dan notifikasi
  UI.pwaCard = () => {
    if (UI.demo) return '';
    const ns = UI.notifyState(), on = UI.notifyOn();
    const inst = UI.canInstall() ? `<button class="pill w" data-act="install">${UI.icon('download')} Pasang app</button>` : '';
    const noti = on ? '' : ns === 'denied' ? '<small>Notifikasi disekat dalam tetapan pelayar.</small>' : `<button class="pill w" data-act="notifyEnable">${UI.icon('bell')} Hidupkan notifikasi</button>`;
    if (!inst && !noti) return '';
    return `<section class="card dark pwa"><div class="ch"><div><h2>Pada telefon anda</h2><small>${UI.isGuru() ? 'Pasang app dan terima notifikasi bila ada tugas relief baharu.' : 'Pasang app untuk akses pantas dan notifikasi perkara mendesak.'}</small></div></div><div class="row">${inst}${noti}</div></section>`;
  };
})();
