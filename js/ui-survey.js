(function () {
  'use strict';
  // Survey tester demo (hanya dalam mod ?demo).
  //  Bahagian 1: popup wajib sebelum demo boleh digunakan.
  //  Bahagian 2: selepas cuba demo, melalui butang "Beri maklum balas" dalam bar demo.
  // Jawapan dihantar ke Google Apps Script (config.js: surveyUrl) dan disimpan dalam Google Sheet pemilik demo.
  // Tiada nama, telefon atau e-mel diminta. Soalan dan lajur Sheet datang daripada js/survey.js.
  const { esc, actions } = UI;
  const CFG = UI.cfg;
  const DRAFT = 'jadual-demo-survey', QUEUE = 'jadual-demo-survey-queue';
  const V = UI.survey = { open: 0, step: -1, answers: {}, errors: {}, started: 0 };
  let flushing = false;

  // ---------- storan setempat (draf dan baris gilir hantar) ----------
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storan penuh atau disekat */ } };
  const sv = () => (UI.prefs.survey = UI.prefs.survey || { id: '', p1: null, p2: null });
  const rid = () => {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* guna fallback */ }
    return 'r' + Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');
  };
  const saveDraft = () => { const d = read(DRAFT, {}); d.a = V.answers; d['s' + part()] = V.step; d['t' + part()] = V.started; write(DRAFT, d); };

  const part = () => (sv().p1 ? 2 : 1);
  const secs = () => TT.surveySections(part());
  UI.surveyActive = () => !!(UI.demo && (!sv().p1 || V.open === 2));
  UI.surveyNeedsPart2 = () => !!(sv().p1 && !sv().p2);

  const loadDraft = () => {
    const d = read(DRAFT, {});
    V.answers = d.a && typeof d.a === 'object' ? d.a : {};
    V.step = Number.isInteger(d['s' + part()]) ? d['s' + part()] : -1;
    V.started = d['t' + part()] || 0;
    V.errors = {};
  };
  if (UI.demo) loadDraft();

  // ---------- hantar ----------
  const queue = () => read(QUEUE, []);
  UI.surveyFlush = async () => {
    if (!CFG.surveyUrl || flushing) return;
    flushing = true;
    try {
      for (const item of queue()) {
        const body = JSON.stringify(item);
        try {
          // mod no-cors: Apps Script tidak menghantar pengepala CORS, jadi jawapan tidak boleh dibaca. Ralat rangkaian sahaja dikesan.
          await fetch(CFG.surveyUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: body.length < 60000 });
        } catch (e) { return; }
        write(QUEUE, queue().filter((x) => !(x.id === item.id && x.part === item.part)));
      }
    } finally { flushing = false; }
  };
  window.addEventListener('online', () => UI.surveyFlush());
  setInterval(() => { if (queue().length) UI.surveyFlush(); }, 60000);

  // ---------- paparan ----------
  const checked = (q, v) => { const a = V.answers[q.id]; return Array.isArray(a) ? a.includes(v) : a === v; };
  const wrap = (q, inner, hint) => {
    const er = V.errors[q.id];
    return `<div class="q${er ? ' err' : ''}" data-qwrap="${q.id}"><h4>${esc(q.label)}${q.req ? ' <i class="req" title="Wajib">*</i>' : ''}</h4>${hint || ''}${inner}<p class="qerr">${er ? esc(er) : ''}</p></div>`;
  };
  const otherBox = (q) => {
    if (!(q.options || []).some((o) => o.other)) return '';
    const on = (q.options || []).some((o) => o.other && checked(q, o.v));
    return `<input class="otext${on ? '' : ' off'}" data-other="${q.id}" maxlength="${TT.SURVEY_LIMITS.other}" placeholder="Sila nyatakan" value="${esc(V.answers[q.id + '_lain'] || '')}" aria-label="Nyatakan lain-lain">`;
  };
  function qHtml(q) {
    const id = q.id;
    if (q.type === 'single' || q.type === 'multi') {
      const t = q.type === 'single' ? 'radio' : 'checkbox';
      const opts = q.options.map((o) => `<label class="opt"><input type="${t}" name="${id}" data-q="${id}" value="${o.v}"${checked(q, o.v) ? ' checked' : ''}><span>${esc(o.t)}</span></label>`).join('');
      return wrap(q, `<div class="opts">${opts}</div>${otherBox(q)}`);
    }
    if (q.type === 'scale') {
      const a = V.answers[id];
      let pills = '';
      for (let n = q.min; n <= q.max; n++) pills += `<label class="sc"><input type="radio" name="${id}" data-q="${id}" value="${n}"${a !== undefined && +a === n ? ' checked' : ''}><span>${n}</span></label>`;
      return wrap(q, `<div class="scale">${pills}</div><div class="scalelab"><span>${esc(q.low)}</span><span>${esc(q.high)}</span></div>`);
    }
    if (q.type === 'text') {
      return wrap(q, `<textarea data-q="${id}" rows="3" maxlength="${TT.SURVEY_LIMITS.text}" placeholder="Tulis jawapan anda">${esc(V.answers[id] || '')}</textarea>`);
    }
    if (q.type === 'matrix') {
      const m = V.answers[id] || {};
      const rows = q.rows.map((r) => `<div class="mrow"><div class="mlab">${esc(r.t)}</div><div class="mopts">${q.options.map((o) => `<label class="opt sm"><input type="radio" name="${id}_${r.v}" data-q="${id}" data-row="${r.v}" value="${o.v}"${m[r.v] === o.v ? ' checked' : ''}><span>${esc(o.t)}</span></label>`).join('')}</div></div>`).join('');
      return wrap(q, rows);
    }
    if (q.type === 'numbers') {
      const m = V.answers[id] || {};
      const rows = q.fields.map((f) => `<label class="nrow"><span>${esc(f.t)}</span><span class="rm">RM<input type="number" inputmode="numeric" min="0" max="${TT.SURVEY_LIMITS.rm}" step="1" data-q="${id}" data-f="${f.v}" value="${m[f.v] == null ? '' : esc(m[f.v])}" aria-label="${esc(f.t)} (${esc(q.unit || '')})"></span></label>`).join('');
      return wrap(q, rows, q.unit ? `<p class="qhint">Jumlah dalam ${esc(q.unit)}.</p>` : '');
    }
    return '';
  }

  UI.surveyHtml = () => {
    const p = part(), list = secs(), n = list.length, step = V.step;
    const brand = `<div class="gbrand"><span class="mark">${UI.icon('calendar')}</span><span><b>${esc(CFG.appName || 'Jadual Sekolah')}</b><small>${p === 1 ? 'Survey sebelum cuba demo' : 'Maklum balas selepas cuba demo'}</small></span></div>`;
    let body;
    if (step < 0) {
      body = p === 1
        ? `<h1>Sebelum cuba demo</h1><p class="gsub">Jawab survey ringkas dahulu, kira-kira 7 minit. Jawapan anda membantu kami membina sistem yang sesuai dengan sekolah di Malaysia.</p>
           <ul class="svyinfo"><li>Soalan bertanda <b>*</b> wajib dijawab.</li><li>Tiada nama, nombor telefon atau e-mel diminta.</li><li>Selepas cuba demo, ada beberapa soalan lagi tentang pengalaman anda (kira-kira 3 minit).</li></ul>`
        : `<h1>Terima kasih sudah mencuba</h1><p class="gsub">Beberapa soalan tentang pengalaman anda dengan demo, kira-kira 3 minit.</p>`;
      body += `<div class="row end">${p === 2 ? '<button class="btn" data-act="svyClose">Tutup, kembali ke demo</button>' : ''}<button class="btn primary big" data-act="svyStart">Mula</button></div>`;
    } else {
      const s = list[step];
      const qs = s.questions.filter((q) => TT.surveyVisible(q, V.answers)).map(qHtml).join('');
      const last = step === n - 1;
      body = `<div class="svybar" aria-hidden="true"><i style="width:${Math.round(((step + 1) / n) * 100)}%"></i></div>
        <p class="svystep">Bahagian ${step + 1} daripada ${n}</p><h1>${esc(s.title)}</h1>${s.intro ? `<p class="gsub">${esc(s.intro)}</p>` : ''}
        <div class="svyqs">${qs}</div>
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="err" id="svyMsg" role="alert">${V.msg ? esc(V.msg) : ''}</p>
        <div class="row end"><button class="btn" data-act="svyBack">Kembali</button><button class="btn primary big" data-act="${last ? 'svySubmit' : 'svyNext'}">${last ? (p === 1 ? 'Hantar dan mula demo' : 'Hantar maklum balas') : 'Seterusnya'}</button></div>`;
    }
    return `<div class="gate svy"><div class="gate-card svycard">${brand}${body}</div>
      <p class="gate-foot"><a href="privasi.html" target="_blank" rel="noopener">Privasi</a> · ${esc(CFG.appName || 'Jadual Sekolah')} ${esc(CFG.version || '')}${CFG.vendor ? ' · ' + esc(CFG.vendor) : ''}</p></div>`;
  };

  // pasang semula paparan tanpa kehilangan kedudukan skrol
  const redraw = (top) => {
    const y = window.scrollY;
    UI.render();
    window.scrollTo(0, top ? 0 : y);
  };

  // ---------- tindakan ----------
  actions.svyStart = () => { V.step = 0; if (!V.started) V.started = Date.now(); V.msg = ''; saveDraft(); redraw(true); };
  actions.svyBack = () => {
    V.msg = ''; V.errors = {};
    if (V.step > 0) V.step--; else V.step = -1;
    saveDraft(); redraw(true);
  };
  actions.svyClose = () => { V.open = 0; V.step = -1; V.msg = ''; redraw(true); };
  actions.svyOpen2 = () => {
    if (!UI.surveyNeedsPart2()) return;
    V.open = 2; V.msg = ''; loadDraft(); redraw(true);
  };
  actions.svyNext = () => {
    const res = TT.surveyValidate(part(), V.answers);
    const here = new Set(secs()[V.step].questions.map((q) => q.id));
    V.errors = {};
    Object.keys(res.errors).filter((k) => here.has(k)).forEach((k) => { V.errors[k] = res.errors[k]; });
    if (Object.keys(V.errors).length) { V.msg = 'Sila lengkapkan soalan yang ditanda merah.'; redraw(); focusFirst(); return; }
    V.msg = ''; V.step++; saveDraft(); redraw(true);
  };
  actions.svySubmit = () => {
    const p = part(), res = TT.surveyValidate(p, V.answers);
    if (res.first) {
      V.errors = res.errors;
      // lompat ke bahagian pertama yang belum lengkap
      V.step = Math.max(0, secs().findIndex((s) => s.questions.some((q) => V.errors[q.id])));
      V.msg = 'Masih ada soalan wajib yang belum dijawab.'; redraw(true); focusFirst(); return;
    }
    const hp = (document.querySelector('.svy .hp') || {}).value || '';
    const s = sv(); if (!s.id) s.id = rid();
    const payload = TT.surveyPayload(p, V.answers, { id: s.id, key: CFG.surveyKey || '', hp, ua: String(navigator.userAgent || '').slice(0, 160), dur: Math.round((Date.now() - (V.started || Date.now())) / 1000) });
    write(QUEUE, queue().filter((x) => !(x.id === payload.id && x.part === payload.part)).concat([payload]));
    s['p' + p] = new Date().toISOString();
    UI.savePrefs();
    const d = read(DRAFT, {}); d['s' + p] = -1; d['t' + p] = 0; write(DRAFT, d);
    V.open = 0; V.step = -1; V.errors = {}; V.msg = ''; V.started = 0;
    UI.surveyFlush();
    redraw(true);
    UI.toast(p === 1 ? 'Terima kasih! Selamat mencuba demo.' : 'Terima kasih atas maklum balas anda!');
  };
  function focusFirst() {
    const el = document.querySelector('.svy .q.err');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  }

  // ---------- peristiwa input: kemas kini jawapan tanpa lukis semula supaya fokus dan skrol kekal ----------
  function onInput(e) {
    const el = e.target;
    if (!el || !el.closest || !el.closest('.svy') || !UI.surveyActive()) return;
    const other = el.dataset.other;
    if (other) { V.answers[other + '_lain'] = el.value; saveDraft(); clearErr(other); return; }
    const id = el.dataset.q;
    if (!id) return;
    const q = TT.surveyQuestion(id); if (!q) return;
    if (q.type === 'single' && el.checked) V.answers[id] = el.value;
    else if (q.type === 'scale' && el.checked) V.answers[id] = Number(el.value);
    else if (q.type === 'multi') {
      // kotak semak mencetuskan 'input' dan 'change': pengendali mesti idempotent supaya pilihan tidak berganda
      const arr = (V.answers[id] || []).slice(), at = arr.indexOf(el.value);
      if (!el.checked && at < 0) return; // peristiwa kedua bagi pilihan yang baru ditolak: jangan padam mesej had
      if (el.checked) {
        if (at < 0) {
          if (q.max && arr.length >= q.max) { el.checked = false; setErr(id, `Pilih sehingga ${q.max} sahaja.`); return; }
          arr.push(el.value);
        }
      } else if (at >= 0) arr.splice(at, 1);
      V.answers[id] = arr;
    } else if (q.type === 'text') V.answers[id] = el.value;
    else if (q.type === 'matrix' && el.checked) V.answers[id] = Object.assign({}, V.answers[id], { [el.dataset.row]: el.value });
    else if (q.type === 'numbers') V.answers[id] = Object.assign({}, V.answers[id], { [el.dataset.f]: el.value });
    else return;
    saveDraft(); clearErr(id);
    const box = document.querySelector(`.svy [data-other="${id}"]`);
    if (box) box.classList.toggle('off', !q.options.some((o) => o.other && checked(q, o.v)));
    // soalan lain bergantung pada jawapan ini: lukis semula bahagian itu
    if (TT.SURVEY.sections.some((s) => s.questions.some((x) => x.showIf && x.showIf.id === id))) redraw();
  }
  function setErr(id, msg) {
    const w = document.querySelector(`.svy [data-qwrap="${id}"]`); if (!w) return;
    w.classList.add('err'); w.querySelector('.qerr').textContent = msg;
  }
  function clearErr(id) {
    delete V.errors[id];
    const w = document.querySelector(`.svy [data-qwrap="${id}"]`);
    if (w) { w.classList.remove('err'); w.querySelector('.qerr').textContent = ''; }
  }
  document.addEventListener('change', onInput);
  document.addEventListener('input', onInput);
})();
