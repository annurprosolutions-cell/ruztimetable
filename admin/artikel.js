// Tab Artikel dalam dashboard pemilik: senarai, editor markdown dengan pratonton, muat naik gambar, versi lama.
// Data disimpan dalam KV Worker lesen (/admin/articles); halaman awam di /artikel/ dijana oleh Worker yang sama.
(function () {
  'use strict';
  var A = { list: null, view: 'list', f: null, base: '', oldSlug: '', history: [], dirty: false, slugTouched: false, html: '', minutes: 1, pane: 'tulis', busy: false, root: null, timer: 0, err: '' };
  var M = function () { return window.ADM; };
  var esc = function (s) { return M().esc(s); };
  var todayIso = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var slugify = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, ''); };
  var blank = function () { return { title: '', slug: '', desc: '', cover: '', tags: '', date: '', status: 'draft', body: '' }; };
  var $ = function (id) { return document.getElementById(id); };

  function api(path, opt) { return M().api('/admin/articles' + path, opt); }
  function stateOf(a) {
    if (a.status !== 'published') return ['Draf', 's-mut'];
    if (a.date && a.date > todayIso()) return ['Dijadualkan', 's-grace'];
    return ['Diterbitkan', 's-ok'];
  }
  function loadList() {
    A.list = null; draw();
    api('').then(function (j) { A.list = j.articles || []; draw(); }).catch(function (e) { A.err = e.message; A.list = []; draw(); });
  }

  // ---------- senarai ----------
  function listView() {
    if (!A.list) return '<p class="empty">Memuatkan artikel…</p>';
    var rows = A.list.map(function (a) {
      var s = stateOf(a), live = s[0] === 'Diterbitkan';
      return '<tr><td class="w"><b style="font-weight:600">' + esc(a.title) + '</b><br><small style="color:var(--mut)">/artikel/' + esc(a.slug) + '/</small></td>' +
        '<td><span class="pill ' + s[1] + '">' + s[0] + '</span></td><td>' + (a.date ? M().dmy(a.date) : '-') + '</td><td>' + (a.minutes || 1) + ' min</td>' +
        '<td style="text-align:right"><button class="btn sm" data-ar="edit" data-s="' + esc(a.slug) + '">Edit</button> ' +
        (live ? '<a class="btn sm" href="/artikel/' + esc(a.slug) + '/" target="_blank" rel="noopener" style="text-decoration:none">Lihat</a> ' : '') +
        '<button class="btn sm d" data-ar="del" data-s="' + esc(a.slug) + '">Padam</button></td></tr>';
    }).join('');
    return '<div class="bar2"><button class="btn p" data-ar="new">+ Artikel baharu</button><button class="btn" data-ar="reload">Muat semula</button>' +
      (A.list.length ? '' : '<button class="btn" data-ar="seed">Import 4 draf artikel awal</button>') +
      '<a class="btn" href="/artikel/" target="_blank" rel="noopener" style="text-decoration:none;margin-left:auto">Buka /artikel/ ↗</a></div>' +
      (A.err ? '<p class="err" style="color:var(--bad);font-weight:600">' + esc(A.err) + '</p>' : '') +
      '<div class="tw"><table><thead><tr><th>Tajuk</th><th>Status</th><th>Tarikh terbit</th><th>Bacaan</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="empty">Belum ada artikel. Tekan "Artikel baharu", atau import draf awal yang telah disediakan.</td></tr>') + '</tbody></table></div>' +
      '<p class="note">Draf tidak kelihatan kepada orang awam. Artikel "Terbit" dengan tarikh akan datang dijadualkan dan muncul sendiri pada tarikh itu. Perubahan kelihatan di laman dalam masa sekitar 1 minit. ' +
      'Peta laman untuk Google Search Console: <code>https://annurtimetable.com/artikel/sitemap.xml</code></p>';
  }

  // ---------- editor ----------
  var TOOLS = [['b', 'B', 'Tebal'], ['i', 'I', 'Condong'], ['h2', 'H2', 'Subtajuk'], ['h3', 'H3', 'Subtajuk kecil'], ['ul', '• Senarai', 'Senarai'], ['ol', '1. Senarai', 'Senarai bernombor'],
    ['q', '❝ Petikan', 'Petikan'], ['a', '🔗 Pautan', 'Pautan'], ['img', '🖼 Gambar', 'Muat naik gambar'], ['hr', '— Garis', 'Garis pemisah']];
  function editView() {
    var f = A.f, s = stateOf({ status: f.status, date: f.date }), descLen = f.desc.length;
    var site = 'annurtimetable.com/artikel/' + (f.slug || slugify(f.title) || 'slug') + '/';
    return '<div class="bar2"><button class="btn" data-ar="back">← Senarai</button><b style="font-size:18px;font-weight:600">' + (A.oldSlug ? 'Edit artikel' : 'Artikel baharu') + '</b>' +
      '<span class="pill ' + s[1] + '">' + s[0] + '</span><span id="arDirty" class="note" style="margin:0">' + (A.dirty ? 'Belum disimpan' : '') + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">' +
      (A.history.length ? '<select id="arHist" class="btn" style="padding:7px 12px"><option value="">Versi lama (' + A.history.length + ')</option>' + A.history.map(function (h, i) { return '<option value="' + i + '">' + esc(String(h.at || '').slice(0, 16).replace('T', ' ')) + '</option>'; }).join('') + '</select>' : '') +
      '<button class="btn" data-ar="save">Simpan draf</button><button class="btn p" data-ar="publish">' + (f.status === 'published' ? 'Simpan &amp; kemas kini' : 'Terbitkan') + '</button></span></div>' +
      '<div class="ar-panes"><button data-ar="pane" data-p="tulis" class="' + (A.pane === 'tulis' ? 'on' : '') + '">Tulis</button><button data-ar="pane" data-p="lihat" class="' + (A.pane === 'lihat' ? 'on' : '') + '">Pratonton</button></div>' +
      '<div class="ar-grid ar-' + A.pane + '"><div class="ar-form">' +
      '<label>Tajuk<input id="ar_title" value="' + esc(f.title) + '" placeholder="Contoh: Cara agih guru ganti secara adil" maxlength="150"></label>' +
      '<label>Slug (alamat)<input id="ar_slug" value="' + esc(f.slug) + '" placeholder="dijana daripada tajuk"><small id="arUrl">' + esc(site) + '</small></label>' +
      '<label>Ringkasan (meta description untuk Google) <small id="arDescN" class="' + (descLen > 160 ? 'c-red' : '') + '">' + descLen + '/160</small><textarea id="ar_desc" rows="2" maxlength="300" placeholder="1 hingga 2 ayat yang memancing klik dari carian Google">' + esc(f.desc) + '</textarea></label>' +
      '<div class="ar-row"><label>Gambar utama<span style="display:flex;gap:6px"><input id="ar_cover" value="' + esc(f.cover) + '" placeholder="/artikel/img/... atau https://"><button class="btn sm" data-ar="cover" type="button">Muat naik</button></span></label>' +
      (f.cover ? '<img class="ar-thumb" src="' + esc(f.cover) + '" alt="">' : '') + '</div>' +
      '<div class="ar-row3"><label>Tag (pisah koma)<input id="ar_tags" value="' + esc(f.tags) + '" placeholder="relief, jadual"></label>' +
      '<label>Tarikh terbit<input id="ar_date" type="date" value="' + esc(f.date) + '"></label>' +
      '<label>Status<select id="ar_status"><option value="draft"' + (f.status !== 'published' ? ' selected' : '') + '>Draf</option><option value="published"' + (f.status === 'published' ? ' selected' : '') + '>Terbit</option></select></label></div>' +
      '<div class="ar-tools">' + TOOLS.map(function (t) { return '<button type="button" data-ar="tool" data-t="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<textarea id="ar_body" class="ar-body" placeholder="Tulis isi artikel di sini. ## untuk subtajuk, **tebal**, - untuk senarai.">' + esc(f.body) + '</textarea>' +
      '<p class="note">Format: <code>## Subtajuk</code> · <code>**tebal**</code> · <code>*condong*</code> · <code>- senarai</code> · <code>&gt; petikan</code> · <code>[teks](https://pautan)</code>. Ctrl+S untuk simpan.</p></div>' +
      '<div class="ar-prev"><div class="ar-serp"><small>Pratonton carian Google</small><span class="u">' + esc(site) + '</span><b>' + esc((f.title || 'Tajuk artikel') + ' · Annur Time Table') + '</b><p>' + esc(f.desc || 'Ringkasan artikel akan dipapar di sini.') + '</p></div>' +
      '<article class="ar-art"><h1>' + esc(f.title || 'Tajuk artikel') + '</h1><div class="m">' + (f.date ? M().dmy(f.date) + ' · ' : '') + A.minutes + ' minit bacaan</div>' +
      (f.cover ? '<img class="cv" src="' + esc(f.cover) + '" alt="">' : '') + '<div id="arHtml">' + A.html + '</div></article></div></div>' +
      (A.oldSlug ? '<p class="note">Tukar slug artikel yang telah diterbitkan: alamat lama dialihkan secara automatik ke alamat baharu.</p>' : '');
  }

  function draw() {
    if (!A.root || !document.body.contains(A.root)) return;
    A.root.innerHTML = A.view === 'edit' ? editView() : listView();
    if (A.view === 'edit') bindEditor();
  }
  function markDirty() { A.dirty = true; var d = $('arDirty'); if (d) d.textContent = 'Belum disimpan'; }
  function read() {
    var f = A.f;
    ['title', 'slug', 'desc', 'cover', 'tags', 'date', 'status', 'body'].forEach(function (k) { var el = $('ar_' + k); if (el) f[k] = el.value; });
    f.slug = f.slug.trim().toLowerCase();
  }
  function bindEditor() {
    var title = $('ar_title'), slug = $('ar_slug'), body = $('ar_body'), desc = $('ar_desc');
    var serp = function () {
      read();
      var u = 'annurtimetable.com/artikel/' + (A.f.slug || slugify(A.f.title) || 'slug') + '/';
      $('arUrl').textContent = u;
      var box = A.root.querySelector('.ar-serp');
      box.querySelector('.u').textContent = u; box.querySelector('b').textContent = (A.f.title || 'Tajuk artikel') + ' · Annur Time Table'; box.querySelector('p').textContent = A.f.desc || 'Ringkasan artikel akan dipapar di sini.';
      A.root.querySelector('.ar-art h1').textContent = A.f.title || 'Tajuk artikel';
      var n = $('arDescN'); n.textContent = A.f.desc.length + '/160'; n.className = A.f.desc.length > 160 ? 'c-red' : '';
    };
    title.oninput = function () { if (!A.slugTouched && !A.oldSlug) slug.value = slugify(title.value); markDirty(); serp(); };
    slug.oninput = function () { A.slugTouched = true; markDirty(); serp(); };
    slug.onblur = function () { slug.value = slugify(slug.value); serp(); };
    desc.oninput = function () { markDirty(); serp(); };
    ['ar_cover', 'ar_tags', 'ar_date', 'ar_status'].forEach(function (id) { $(id).oninput = $(id).onchange = function () { markDirty(); read(); if (id === 'ar_cover' || id === 'ar_status' || id === 'ar_date') { var p = body.selectionStart; draw(); var b2 = $('ar_body'); b2.setSelectionRange(p, p); } }; });
    body.oninput = function () { markDirty(); schedulePreview(); };
    body.onkeydown = function (e) { if (e.key === 'Tab') { e.preventDefault(); insert('  ', ''); } };
    var h = $('arHist'); if (h) h.onchange = function () {
      var v = A.history[+h.value]; if (!v) return;
      if (!confirm('Muat versi ' + String(v.at || '').slice(0, 16).replace('T', ' ') + ' ke dalam editor? Versi semasa kekal sehingga anda tekan Simpan.')) { h.value = ''; return; }
      read(); A.f.title = v.title; A.f.desc = v.desc || ''; A.f.body = v.body || ''; A.dirty = true; draw(); preview();
    };
  }
  function schedulePreview() { clearTimeout(A.timer); A.timer = setTimeout(preview, 700); }
  function preview() {
    read();
    return api('/preview', { method: 'POST', body: { body: A.f.body } }).then(function (j) {
      A.html = j.html || ''; A.minutes = j.minutes || 1;
      var el = $('arHtml'); if (el) el.innerHTML = A.html;
      var m = A.root && A.root.querySelector('.ar-art .m'); if (m) m.textContent = (A.f.date ? M().dmy(A.f.date) + ' · ' : '') + A.minutes + ' minit bacaan';
    }).catch(function () { /* pratonton gagal: abaikan, cuba semula pada taipan seterusnya */ });
  }
  function insert(before, after, placeholder) {
    var t = $('ar_body'), s = t.selectionStart, e = t.selectionEnd, sel = t.value.slice(s, e) || placeholder || '';
    t.setRangeText(before + sel + after, s, e, 'end');
    if (!t.value.slice(s, e).length && placeholder) t.setSelectionRange(s + before.length, s + before.length + sel.length);
    t.focus(); markDirty(); schedulePreview();
  }
  function linePrefix(prefix) {
    var t = $('ar_body'), s = t.selectionStart, e = t.selectionEnd, v = t.value;
    var ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', e); if (le < 0) le = v.length;
    var block = v.slice(ls, le).split('\n').map(function (l, i) { return (typeof prefix === 'function' ? prefix(i) : prefix) + l.replace(/^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, ''); }).join('\n');
    t.setRangeText(block, ls, le, 'end'); t.focus(); markDirty(); schedulePreview();
  }
  function tool(k) {
    if (k === 'b') insert('**', '**', 'teks tebal');
    else if (k === 'i') insert('*', '*', 'teks condong');
    else if (k === 'h2') linePrefix('## ');
    else if (k === 'h3') linePrefix('### ');
    else if (k === 'ul') linePrefix('- ');
    else if (k === 'ol') linePrefix(function (i) { return (i + 1) + '. '; });
    else if (k === 'q') linePrefix('> ');
    else if (k === 'hr') insert('\n\n---\n\n', '');
    else if (k === 'a') { var u = prompt('Alamat pautan (https://... atau /salepage/):', 'https://'); if (u && u !== 'https://') insert('[', '](' + u.trim() + ')', 'teks pautan'); }
    else if (k === 'img') pickImage(function (url, name) { insert('\n\n![' + name + '](' + url + ')\n\n', ''); });
  }

  // gambar: dikecilkan di pelayar (lebar maksimum 1600px, WebP/JPEG) sebelum dimuat naik, had 1.5 MB
  function pickImage(done) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/gif';
    inp.onchange = function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      var name = file.name.replace(/\.[^.]+$/, '').replace(/[[\]()]/g, '').slice(0, 60);
      M().toast('Memuat naik gambar…');
      shrink(file).then(function (o) { return api('/image', { method: 'POST', body: o }); })
        .then(function (j) { done(j.url, name); M().toast('Gambar dimuat naik'); })
        .catch(function (e) { alert('Gagal muat naik gambar: ' + e.message); });
    };
    inp.click();
  }
  function toB64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = no; r.readAsDataURL(blob); }); }
  function shrink(file) {
    if (file.type === 'image/gif') return toB64(file).then(function (d) { return { type: file.type, data: d }; });
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = Math.min(1600, img.naturalWidth), hgt = Math.round(img.naturalHeight * w / img.naturalWidth), c = document.createElement('canvas');
        c.width = w; c.height = hgt; c.getContext('2d').drawImage(img, 0, 0, w, hgt); URL.revokeObjectURL(url);
        var tryType = function (type, q) { return new Promise(function (r) { c.toBlob(function (b) { r(b && b.type === type ? b : null); }, type, q); }); };
        tryType('image/webp', 0.82).then(function (b) { return b || tryType('image/jpeg', 0.85); })
          .then(function (b) { return b ? toB64(b).then(function (d) { ok({ type: b.type, data: d }); }) : no(new Error('format gambar tidak disokong')); });
      };
      img.onerror = function () { no(new Error('fail bukan gambar')); };
      img.src = url;
    });
  }

  // ---------- simpan, buka, padam ----------
  function save(publish) {
    if (A.busy) return; read();
    var f = A.f;
    if (!f.title.trim()) return alert('Tajuk diperlukan.');
    if (publish) f.status = 'published';
    if (f.status === 'published' && !f.date) f.date = todayIso();
    if (f.status === 'published' && !f.desc.trim() && !confirm('Ringkasan kosong. Google akan ambil ayat pertama artikel. Teruskan?')) return;
    A.busy = true;
    api('', { method: 'POST', body: { title: f.title, slug: f.slug || slugify(f.title), desc: f.desc, cover: f.cover, tags: f.tags, date: f.date, status: f.status, body: f.body, oldSlug: A.oldSlug, base: A.base } })
      .then(function (j) {
        var a = j.article; A.busy = false; A.dirty = false; A.oldSlug = a.slug; A.base = a.updated; A.history = a.history || [];
        A.f = { title: a.title, slug: a.slug, desc: a.desc, cover: a.cover, tags: (a.tags || []).join(', '), date: a.date, status: a.status, body: a.body };
        draw(); preview();
        M().toast(a.status === 'published' ? (stateOf(a)[0] === 'Dijadualkan' ? 'Dijadualkan pada ' + M().dmy(a.date) : 'Diterbitkan') : 'Draf disimpan');
      }).catch(function (e) { A.busy = false; alert('Gagal simpan: ' + e.message); });
  }
  function open(slug) {
    A.view = 'edit'; A.root.innerHTML = '<p class="empty">Membuka artikel…</p>';
    api('/' + encodeURIComponent(slug)).then(function (j) {
      var a = j.article;
      A.f = { title: a.title, slug: a.slug, desc: a.desc || '', cover: a.cover || '', tags: (a.tags || []).join(', '), date: a.date || '', status: a.status, body: a.body || '' };
      A.oldSlug = a.slug; A.base = a.updated; A.history = a.history || []; A.dirty = false; A.slugTouched = true; A.html = ''; A.pane = 'tulis';
      draw(); preview();
    }).catch(function (e) { alert('Gagal buka: ' + e.message); A.view = 'list'; draw(); });
  }
  function fresh() { A.view = 'edit'; A.f = blank(); A.oldSlug = ''; A.base = ''; A.history = []; A.dirty = false; A.slugTouched = false; A.html = ''; A.minutes = 1; A.pane = 'tulis'; draw(); }
  function seed() {
    fetch('/admin/artikel-awal.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('fail draf tiada'); return r.json(); }).then(function (arr) {
      var n = 0;
      return arr.reduce(function (p, a) {
        return p.then(function () { return api('', { method: 'POST', body: Object.assign({}, a, { status: 'draft' }) }).then(function () { n++; }, function (e) { if (e.status !== 409) throw e; }); });
      }, Promise.resolve()).then(function () { M().toast(n + ' draf diimport'); loadList(); });
    }).catch(function (e) { alert('Gagal import: ' + e.message); });
  }
  function leaveOk() { return !A.dirty || confirm('Ada perubahan belum disimpan. Tinggalkan juga?'); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ar]'); if (!t || !A.root || !A.root.contains(t)) return;
    var k = t.dataset.ar;
    if (k === 'new') fresh();
    else if (k === 'reload') loadList();
    else if (k === 'seed') seed();
    else if (k === 'edit') open(t.dataset.s);
    else if (k === 'del') { if (confirm('Padam artikel "' + t.dataset.s + '"? Tindakan ini tidak boleh diundur.')) api('/' + encodeURIComponent(t.dataset.s), { method: 'DELETE' }).then(function () { M().toast('Dipadam'); loadList(); }).catch(function (x) { alert('Gagal: ' + x.message); }); }
    else if (k === 'back') { if (leaveOk()) { A.dirty = false; A.view = 'list'; loadList(); } }
    else if (k === 'save') save(false);
    else if (k === 'publish') save(true);
    else if (k === 'tool') tool(t.dataset.t);
    else if (k === 'cover') pickImage(function (url) { read(); A.f.cover = url; markDirty(); var p = $('ar_body').selectionStart; draw(); $('ar_body').setSelectionRange(p, p); });
    else if (k === 'pane') { read(); A.pane = t.dataset.p; draw(); if (A.pane === 'lihat') preview(); }
  });
  document.addEventListener('keydown', function (e) { if (A.view === 'edit' && A.root && document.body.contains(A.root) && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); } });
  window.addEventListener('beforeunload', function (e) { if (A.dirty) { e.preventDefault(); e.returnValue = ''; } });

  window.ArtikelAdmin = {
    mount: function (el) { A.root = el; if (A.view === 'edit' && A.f) { draw(); if (!A.html) preview(); } else if (A.list) draw(); else loadList(); },
    dirty: function () { return A.dirty && A.view === 'edit'; }
  };
})();
