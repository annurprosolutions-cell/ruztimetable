(function () {
  'use strict';
  const { esc, pages } = UI;

  const { actions } = UI;
  const sup = () => UI.cfg.support || {};
  const SUGGEST = ['dua sesi pagi petang', 'rehat berbeza ikut tahun', 'perhimpunan pagi', 'waktu berganda', 'relief guru berlainan', 'import dari aSc', 'lesen tamat', 'lupa kata laluan'];

  const faqItem = (e, open) => `<details class="faq"${open ? ' open' : ''}><summary>${esc(e.q)}</summary><p>${esc(e.a)}</p>${e.link && !UI.isGuru() ? `<p class="faqlink"><a href="panduan/${e.link}" target="_blank" rel="noopener">Baca lebih lanjut dalam panduan</a></p>` : ''}</details>`;
  const topicList = () => TT.faqTopics(UI.isGuru()).map(([t, a]) => `<h3 class="faqtopic">${esc(t)}</h3>${a.map((e) => faqItem(e, false)).join('')}`).join('');
  // hasil carian (atau senarai mengikut topik bila kosong). Tiada AI: padanan kata kunci pada pangkalan soalan.
  UI.faqHtml = (query) => {
    const q = String(query || '').trim();
    if (!q) return topicList();
    const res = TT.faqSearch(q, { guruOnly: UI.isGuru(), limit: 5 });
    if (res.length) return `<p class="hint">${res.length} jawapan dijumpai</p>${res.map((r, i) => faqItem(r.entry, i === 0)).join('')}`;
    const s = sup(), wa = s.whatsapp ? `https://wa.me/${UI.waNumber(s.whatsapp)}?text=${encodeURIComponent('Soalan tentang Annur Time Table: ' + q)}` : '';
    return `<div class="banner">Tiada jawapan yang sesuai untuk "<b>${esc(q)}</b>". Cuba kata kunci lain (contoh: rehat, relief, import), atau tanya kami.${wa ? `<div class="row"><a class="btn primary" href="${wa}" target="_blank" rel="noopener">Tanya melalui WhatsApp</a></div>` : ''}</div>${topicList()}`;
  };
  const OUTS = { faqQ: 'faqOut', faqQm: 'faqOutM' };
  document.addEventListener('input', (e) => { const id = e.target && OUTS[e.target.id]; if (id) { const o = document.getElementById(id); if (o) o.innerHTML = UI.faqHtml(e.target.value); } });
  actions.faqAsk = (el) => {
    const inM = !!el.closest('.overlay'), i = document.getElementById(inM ? 'faqQm' : 'faqQ'), o = document.getElementById(inM ? 'faqOutM' : 'faqOut');
    if (!i || !o) return; i.value = el.dataset.q; o.innerHTML = UI.faqHtml(i.value); i.focus();
  };

  // ---------- butang bantuan terapung ----------
  // Pentadbir: menu kecil (Cari jawapan, Panduan penuh). Guru: terus buka carian jawapan.
  UI.helpFab = () => `<button class="helpfab" data-act="helpFab" aria-label="Bantuan" title="Bantuan">?</button>${UI.helpMenu ? `<div class="helpmenu" role="menu">
      <button class="mi" data-act="faqModal" role="menuitem">${UI.icon('message')}<span><b>Cari jawapan</b><small>Soalan lazim</small></span></button>
      <a class="mi" href="panduan/" target="_blank" rel="noopener" role="menuitem" data-act="helpClose">${UI.icon('book')}<span><b>Panduan penuh</b><small>Manual bergambar dan video</small></span></a></div>` : ''}`;
  const redrawFab = () => { const w = document.getElementById('helpfabWrap'); if (w) w.innerHTML = UI.helpFab(); };
  actions.helpFab = () => { if (UI.isGuru()) { actions.faqModal(); return; } UI.helpMenu = !UI.helpMenu; redrawFab(); };
  actions.helpClose = () => { UI.helpMenu = false; redrawFab(); };
  actions.faqModal = () => {
    UI.helpMenu = false; redrawFab();
    const chips = UI.isGuru() ? ['pasang app', 'notifikasi', 'jadual tidak berubah'] : SUGGEST;
    UI.modalOpen('Cari jawapan', `<label class="fld"><span>Taip soalan anda</span><input id="faqQm" type="search" autocomplete="off" placeholder="Contoh: ${UI.isGuru() ? 'pasang app' : 'dua sesi, waktu berganda'}"></label>
      <div class="row tight faqchips">${chips.map((x) => `<button class="pill" data-act="faqAsk" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div><div id="faqOutM">${UI.faqHtml('')}</div>`,
    '<button class="btn" data-act="modalClose">Tutup</button>', true);
    setTimeout(() => { const i = document.getElementById('faqQm'); if (i) i.focus(); }, 50);
  };
  // tutup menu bila klik di luar
  document.addEventListener('click', (e) => { if (UI.helpMenu && !e.target.closest('#helpfabWrap')) { UI.helpMenu = false; redrawFab(); } });


  pages.bantuan = () => {
    const cfg = UI.cfg, sup = cfg.support || {};
    const head = UI.pageHead({ crumbs: [['Bantuan']], title: 'Bantuan', sub: 'Panduan ringkas dan soalan lazim' });
    const steps = UI.isGuru()
      ? ['Tekan "Pasang app" dan "Hidupkan notifikasi" pada halaman Utama supaya dimaklumkan bila ada relief baharu.', 'Halaman Utama menunjukkan kelas dan tugas relief anda hari ini.', 'Jadual saya untuk jadual mingguan penuh dan cetakan.', 'Relief saya untuk tugas akan datang, slip dan perbandingan kesaksamaan.']
      : ['Tetapan: hari persekolahan, waktu dan rehat, had waktu Jumaat.', 'Data: subjek, guru (termasuk waktu tidak boleh), kelas, bilik dan pelajaran.', 'Jadual: tekan Jana, kemudian laras dengan seret-dan-lepas. Kunci waktu yang tidak boleh berubah.', 'Relief: rekod guru tidak hadir, tekan Agih automatik, cetak slip atau salin mesej WhatsApp.', 'Tetapan > Storan: sambung Google Sheets, kongsi pautan guru, atau eksport JSON sebagai backup.'];
    const contact = sup.whatsapp || sup.email
      ? `<p>${sup.whatsapp ? `WhatsApp: <a href="https://wa.me/${esc(UI.waNumber(sup.whatsapp))}" target="_blank" rel="noopener">${esc(sup.whatsapp)}</a><br>` : ''}${sup.email ? `E-mel: <a href="mailto:${esc(sup.email)}">${esc(sup.email)}</a>` : ''}</p>`
      : '<p class="hint">Hubungi pembekal sistem anda.</p>';
    const guide = UI.isGuru() ? 'panduan/#guru' : 'panduan/';
    return head + `<div class="dash"><div class="col-l">
      <section class="card"><div class="ch"><h2>Panduan penuh</h2></div><p>Manual lengkap bergambar, langkah demi langkah, dan senarai video panduan.</p>
        <div class="row"><a class="btn primary" href="${guide}" target="_blank" rel="noopener">Buka panduan</a><a class="btn" href="panduan/Panduan-Annur-Time-Table.pdf" target="_blank" rel="noopener">PDF</a></div></section>
      <section class="card"><div class="ch"><h2>Langkah kerja</h2></div><ol class="steps">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
      <section class="card"><div class="ch"><h2>Tentang</h2></div><p><b>${esc(cfg.appName || 'Annur Time Table')}</b> versi ${esc(cfg.version || '')}${cfg.vendor ? `<br>${esc(cfg.vendor)}` : ''}</p>${contact}</section></div>
      <div class="col-r"><section class="card"><div class="ch"><h2>Tanya soalan</h2></div><label class="fld"><span>Taip soalan anda, contoh "dua sesi", "waktu berganda" atau "lupa kata laluan"</span><input id="faqQ" type="search" autocomplete="off" placeholder="Cari jawapan..."></label><div class="row tight faqchips">${SUGGEST.map((x) => `<button class="pill" data-act="faqAsk" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div><div id="faqOut">${UI.faqHtml('')}</div></section></div></div>`;
  };
})();
