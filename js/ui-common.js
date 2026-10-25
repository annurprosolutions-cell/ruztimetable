(function () {
  'use strict';
  const KEY = 'jadual-sekolah-v1', PKEY = 'jadual-sekolah-prefs';
  const esc = TT.esc;
  const $ = (id) => document.getElementById(id);
  const CFG = window.APP_CONFIG || {};
  const today = TT.todayISO();

  const UI = window.UI = {
    state: null, page: 'utama', dataTab: 'guru', setTab: 'sekolah', myTab: 'akan',
    view: { type: 'class', id: null }, lessonFilter: { cls: '', teacher: '', subject: '' },
    relief: { date: today, tab: 'harian', from: '', to: '', teacher: '', month: today.slice(0, 7) },
    heatMonth: today.slice(0, 7), menu: null, dashAll: false, items: [],
    lastGen: null, actions: {}, changes: {}, pages: {}, esc, $, cfg: CFG, icon: window.UI_ICON
  };

  const monthRange = (iso) => {
    const [y, m] = iso.split('-').map(Number);
    const last = new Date(y, m, 0).getDate(), mm = String(m).padStart(2, '0');
    return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, '0')}`];
  };
  [UI.relief.from, UI.relief.to] = monthRange(today);
  UI.monthRange = monthRange;

  // ---------- data & pilihan peranti ----------
  UI.load = () => {
    try { const raw = localStorage.getItem(KEY); if (raw) return TT.migrate(JSON.parse(raw)); } catch (e) { /* storan tiada atau rosak */ }
    return TT.newState();
  };
  UI.save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(UI.state)); } catch (e) { UI.toast('Gagal simpan ke pelayar (storan penuh atau disekat). Eksport JSON untuk backup.', 'err'); }
    if (UI.sync && !UI.sync.quiet) UI.sync.schedule();
  };
  UI.commit = () => { TT.reconcile(UI.state); TT.prunePlacements(UI.state); UI.save(); UI.render(); };

  // pilihan peranti (peranan, siapa saya, Sheet yang disambung) tidak dikongsi melalui fail data
  const defPrefs = () => ({ role: 'admin', me: null, name: '', deviceId: 'd' + Math.random().toString(36).slice(2, 10), lastBackup: null, sheet: null });
  UI.prefs = (() => { try { return Object.assign(defPrefs(), JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { return defPrefs(); } })();
  UI.savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(UI.prefs)); } catch (e) { /* abaikan */ } };

  UI.isGuru = () => UI.prefs.role === 'guru';
  UI.meTeacher = () => (UI.state.teachers || []).find((t) => t.id === UI.prefs.me) || null;
  UI.displayName = () => (UI.isGuru() ? (UI.meTeacher() || {}).name || 'Guru' : UI.prefs.name || 'Pentadbir');
  UI.greet = () => { const h = new Date().getHours(); return h < 5 ? 'Selamat malam' : h < 12 ? 'Selamat pagi' : h < 14 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam'; };
  UI.initials = (name) => {
    const w = String(name || '').replace(/\b(cikgu|ustaz|ustazah|dr|en|pn|cik|tuan|puan)\.?\s+/gi, '').split(/\s+/)
      .filter((x) => x && !/^(bin|binti|bt|b|a\/l|a\/p)$/i.test(x));
    return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
  };

  UI.toast = (msg, kind) => {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('toast').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
  };

  // ---------- navigasi ----------
  UI.go = (go) => {
    if (!go) return;
    if (go.act) {
      const f = UI.actions[go.act];
      if (f) f({ dataset: Object.assign({}, go) }, { stopPropagation() {}, preventDefault() {} });
      return;
    }
    UI.page = go.page;
    if (go.tab && go.page === 'data') UI.dataTab = go.tab;
    if (go.date) { UI.relief.date = go.date; UI.relief.tab = 'harian'; }
    UI.menu = null; UI.render(); window.scrollTo(0, 0);
  };
  UI.goAttr = (go) => `data-act="go" data-go="${esc(JSON.stringify(go))}"`;
  UI.actions.go = (el) => { try { UI.go(JSON.parse(el.dataset.go)); } catch (e) { /* data rosak */ } };
  UI.actions.goto = (el) => {
    UI.page = el.dataset.p;
    if (el.dataset.t) UI.dataTab = el.dataset.t;
    if (el.dataset.s) UI.setTab = el.dataset.s;
    UI.menu = null; UI.render(); window.scrollTo(0, 0);
  };
  UI.actions.tab = (el) => {
    const { scope, k } = el.dataset;
    if (scope === 'viewType') UI.view = { type: k, id: null };
    else if (scope === 'reliefTab') UI.relief.tab = k;
    else UI[scope] = k;
    UI.render();
  };

  // ---------- komponen ----------
  UI.pageHead = (o) => {
    const crumbs = (o.crumbs || []).map((c, i, a) => (i === a.length - 1 ? `<b>${esc(c[0])}</b>` : `<a data-act="goto" data-p="${c[1]}">${esc(c[0])}</a><span>/</span>`)).join('');
    const tabs = o.tabs ? `<div class="seg sub">${o.tabs.map(([k, t]) => `<button class="${o.tab === k ? 'on' : ''}" data-act="tab" data-scope="${o.scope}" data-k="${k}">${esc(t)}</button>`).join('')}</div>` : '';
    return `<section class="card phead">
      <div class="crumbs"><button class="back" data-act="goto" data-p="${o.back || 'utama'}" aria-label="Kembali">${UI.icon('chevLeft')}</button><a data-act="goto" data-p="utama">Utama</a><span>/</span>${crumbs}</div>
      <div class="ph-row"><div class="ph-text"><h1>${esc(o.title)}</h1>${o.sub ? `<p>${o.sub}</p>` : ''}</div>
        ${o.metric != null ? `<div class="metric ${o.tone || ''}"><b>${esc(o.metric)}</b><span>${esc(o.metricLabel || '')}</span></div>` : ''}</div>
      ${tabs}</section>`;
  };

  UI.gauge = (n, ok) => {
    const C = 2 * Math.PI * 42, frac = ok ? 1 : Math.min(0.92, 0.3 + n * 0.12);
    return `<svg class="gauge${ok ? ' ok' : ''}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="g-bg"/><circle cx="50" cy="50" r="42" class="g-fg" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/><circle cx="50" cy="50" r="34" class="g-in"/><text x="50" y="59" text-anchor="middle">${String(n).padStart(2, '0')}</text></svg>`;
  };

  UI.actList = (items) => items.map((i) => `<div class="act-item sev-${i.sev}"><div><b>${esc(i.title)}</b><small><em>${esc(TT.SEV_LABEL[i.sev])}</em> · ${esc(i.when)}</small></div><button class="pill navy" ${i.go.act ? `data-act="${i.go.act}"${i.go.date ? ` data-date="${i.go.date}"` : ''}` : UI.goAttr(i.go)}>${esc(i.btn)}</button></div>`).join('');

  // ---------- modal ----------
  UI.modalOpen = (title, body, footer, wide) => {
    $('modal').innerHTML = `<div class="overlay" data-act="modalBg"><div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="dlg-h"><h3>${esc(title)}</h3><button class="x" data-act="modalClose" aria-label="Tutup">${UI.icon('x')}</button></div>
      <div class="dlg-b">${body}</div>${footer ? `<div class="dlg-f">${footer}</div>` : ''}</div></div>`;
    const first = $('modal').querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea');
    if (first) first.focus();
  };
  UI.modalClose = () => { $('modal').innerHTML = ''; UI._form = null; };
  UI.confirm = (msg, yes, label) => {
    UI._yes = yes;
    UI.modalOpen('Pengesahan', `<p>${esc(msg)}</p>`, `<button class="btn" data-act="modalClose">Batal</button><button class="btn danger-fill" data-act="confirmYes">${esc(label || 'Teruskan')}</button>`);
  };
  UI.actions.confirmYes = () => { const f = UI._yes; UI.modalClose(); if (f) f(); };
  UI.actions.modalClose = () => UI.modalClose();
  UI.actions.modalBg = (el, e) => { if (e.target === el && !UI._gen) UI.modalClose(); };

  // ---------- borang generik ----------
  const optHtml = (opts, sel) => opts.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(sel) ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  UI.optHtml = optHtml;

  UI.availGrid = (state, value) => {
    const days = TT.days(state), slots = TT.slots(state), lim = TT.dayLimits(state);
    let h = '<div class="tablewrap"><table class="avail"><thead><tr><th></th>' + days.map((d, i) => `<th><button type="button" class="lnk" data-act="availCol" data-d="${i}">${d.short}</button></th>`).join('') + '</tr></thead><tbody>';
    slots.forEach((sl, p) => {
      h += `<tr><th><button type="button" class="lnk" data-act="availRow" data-p="${p}">${esc(sl.label)}</button></th>`;
      days.forEach((_, d) => {
        if (p >= lim[d]) h += '<td class="na">-</td>';
        else h += `<td class="av${value && value[`${d}-${p}`] ? ' off' : ''}" data-k="${d}-${p}" data-act="availCell"></td>`;
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div><p class="hint">Klik petak untuk tanda waktu guru <b>tidak boleh</b> mengajar (merah). Klik tajuk hari atau waktu untuk tanda satu lajur atau baris.</p>';
  };
  UI.actions.availCell = (el) => el.classList.toggle('off');
  UI.actions.availCol = (el) => {
    const cells = [...el.closest('table').querySelectorAll(`td.av[data-k^="${el.dataset.d}-"]`)];
    const on = cells.some((c) => !c.classList.contains('off')); cells.forEach((c) => c.classList.toggle('off', on));
  };
  UI.actions.availRow = (el) => {
    const cells = [...el.closest('tr').querySelectorAll('td.av')];
    const on = cells.some((c) => !c.classList.contains('off')); cells.forEach((c) => c.classList.toggle('off', on));
  };

  UI.openForm = (spec) => {
    const v = spec.values || {};
    const body = spec.fields.map((f) => {
      const val = v[f.key] != null ? v[f.key] : (f.def != null ? f.def : '');
      const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
      switch (f.type) {
        case 'select': return `<label class="fld"><span>${esc(f.label)}</span><select name="${f.key}">${optHtml(f.options, val)}</select>${hint}</label>`;
        case 'checkbox': return `<label class="fld chk"><input type="checkbox" name="${f.key}"${val ? ' checked' : ''}><span>${esc(f.label)}</span>${hint}</label>`;
        case 'multi': return `<div class="fld"><span>${esc(f.label)}</span><div class="multi">${f.options.map((o) => `<label class="chk"><input type="checkbox" name="${f.key}" value="${esc(o.v)}"${(val || []).includes(o.v) ? ' checked' : ''}>${esc(o.t)}</label>`).join('') || '<em>Tiada pilihan lagi</em>'}</div>${hint}</div>`;
        case 'avail': return `<div class="fld"><span>${esc(f.label)}</span>${UI.availGrid(UI.state, val)}</div>`;
        case 'textarea': return `<label class="fld"><span>${esc(f.label)}</span><textarea name="${f.key}" rows="${f.rows || 6}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>${hint}</label>`;
        default: return `<label class="fld"><span>${esc(f.label)}</span><input type="${f.type || 'text'}" name="${f.key}" value="${esc(val)}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>${hint}</label>`;
      }
    }).join('');
    UI._form = spec;
    UI.modalOpen(spec.title, `<form id="theForm" onsubmit="return false">${body}</form><div id="formErr" class="err"></div>`,
      `<button class="btn" data-act="modalClose">Batal</button><button class="btn primary" data-act="formSave">${esc(spec.saveLabel || 'Simpan')}</button>`, spec.wide);
  };
  UI.collect = (spec, root) => {
    const out = {};
    for (const f of spec.fields) {
      if (f.type === 'checkbox') out[f.key] = root.querySelector(`[name="${f.key}"]`).checked;
      else if (f.type === 'multi') out[f.key] = [...root.querySelectorAll(`[name="${f.key}"]:checked`)].map((x) => x.value);
      else if (f.type === 'avail') { out[f.key] = {}; root.querySelectorAll('td.av.off').forEach((td) => { out[f.key][td.dataset.k] = true; }); }
      else {
        const el = root.querySelector(`[name="${f.key}"]`);
        out[f.key] = f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
      }
    }
    return out;
  };
  UI.actions.formSave = () => {
    const spec = UI._form; if (!spec) return;
    const vals = UI.collect(spec, $('theForm'));
    for (const f of spec.fields) if (f.required && (vals[f.key] === '' || vals[f.key] == null)) { $('formErr').textContent = `${f.label} wajib diisi.`; return; }
    const err = spec.onSave(vals);
    if (err) { $('formErr').textContent = err; return; }
    UI.modalClose(); UI.commit();
  };

  // ---------- cetak, muat turun, salin ----------
  UI.print = (html) => {
    $('printArea').innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); $('printArea').innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };
  UI.download = (name, text, type) => {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  UI.csv = (rows) => rows.map((r) => r.map((c) => { const x = String(c == null ? '' : c); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; }).join(',')).join('\r\n');
  UI.copyText = (text) => {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
  };
})();
