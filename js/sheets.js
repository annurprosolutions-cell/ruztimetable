(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // Format storan Google Sheets. Satu tab bagi setiap jenis data, baris pertama = tajuk lajur.
  // Lajur "(rujukan)" hanya untuk dibaca manusia dan diabaikan semasa memuat.
  const FORMAT = 1;
  TT.SHEET_TABS = ['Meta', 'Sekolah', 'Waktu', 'Subjek', 'Guru', 'Kelas', 'Bilik', 'Pelajaran', 'Jadual', 'TidakHadir', 'Relief'];
  TT.SHEET_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';

  const list = (a) => (a || []).join(',');
  const str = (v) => (v == null ? '' : String(v)).trim();
  const split = (v) => str(v).split(',').map((x) => x.trim()).filter(Boolean);
  const num = (v, d) => { if (v === '' || v == null) return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
  const yes = (v) => v === true || /^(ya|yes|true|1)$/i.test(str(v));
  const yn = (b) => (b ? 'YA' : 'TIDAK');
  // pengguna mungkin edit sel terus dalam Sheets: masa jadi pecahan hari, tarikh jadi nombor siri
  const hhmm = (v) => {
    if (typeof v === 'number' && v >= 0 && v < 1) {
      const t = Math.round(v * 1440);
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    const m = str(v).match(/^(\d{1,2})[:.](\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : str(v);
  };
  const isoDate = (v) => {
    if (typeof v === 'number' && v > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
    const x = str(v);
    let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : x;
  };
  TT._sheetParse = { hhmm, isoDate };

  TT.toSheets = (s, meta) => {
    meta = meta || {};
    const m = TT.maps(s), days = TT.days(s), slots = TT.slots(s);
    const tname = (id) => (m.teacher.get(id) || {}).name || '';
    const sname = (id) => (m.subject.get(id) || {}).name || '';
    const unavail = (t) => Object.keys(t.unavailable || {}).filter((k) => t.unavailable[k])
      .map((k) => k.split('-').map((x) => +x + 1).join('-')).join(',');
    return {
      Meta: [['kunci', 'nilai'], ['format', FORMAT], ['dikemaskini', meta.updatedAt || ''], ['oleh', meta.by || ''], ['aplikasi', meta.app || '']],
      Sekolah: [['kunci', 'nilai'], ['nama', s.school.name], ['minggu', s.school.weekMode], ['had_waktu_sehari', list(s.dayLimits)], ['tetapan_relief', JSON.stringify(s.settings.relief)]],
      Waktu: [['label', 'mula', 'tamat', 'jenis']].concat(s.periods.map((p) => [p.label, p.start, p.end, p.type === 'break' ? 'rehat' : 'belajar'])),
      Subjek: [['id', 'nama', 'kod', 'warna', 'subjek_berat']].concat(s.subjects.map((x) => [x.id, x.name, x.short, x.color, yn(x.heavy)])),
      Guru: [['id', 'nama', 'kod', 'panitia', 'subjek_id', 'had_sehari', 'had_seminggu', 'kecuali_relief', 'tidak_boleh (hari-waktu)', 'subjek (rujukan)']]
        .concat(s.teachers.map((t) => [t.id, t.name, t.short, t.dept || '', list(t.subjectIds), t.maxPerDay, t.maxPerWeek, yn(t.noRelief), unavail(t), t.subjectIds.map(sname).join(', ')])),
      Kelas: [['id', 'nama', 'tingkatan', 'guru_kelas_id', 'guru_kelas (rujukan)']]
        .concat(s.classes.map((c) => [c.id, c.name, c.level == null ? '' : c.level, c.homeroomId || '', tname(c.homeroomId)])),
      Bilik: [['id', 'nama', 'jenis']].concat(s.rooms.map((r) => [r.id, r.name, r.type || ''])),
      Pelajaran: [['id', 'kelas_id', 'subjek_id', 'guru_id', 'waktu_seminggu', 'berganda', 'bilik_id', 'kelas (rujukan)', 'subjek (rujukan)', 'guru (rujukan)']]
        .concat(s.lessons.map((l) => [l.id, list(l.classIds), l.subjectId, list(l.teacherIds), l.perWeek, l.doubles || 0, l.roomId || '', TT.classNames(s, l.classIds), sname(l.subjectId), l.teacherIds.map(tname).join(' + ')])),
      Jadual: [['unit', 'pelajaran_id', 'panjang', 'hari', 'waktu', 'dikunci', 'hari (rujukan)', 'masa (rujukan)', 'pelajaran (rujukan)']]
        .concat(s.placements.map((p) => {
          const l = m.lesson.get(p.lessonId), a = slots[p.start], b = slots[p.start + p.len - 1] || a;
          return [p.unit, p.lessonId, p.len, p.day + 1, p.start + 1, yn(p.locked), (days[p.day] || {}).name || '', a ? `${a.start}-${b.end}` : '', l ? TT.lessonLabel(s, l) : ''];
        })),
      TidakHadir: [['id', 'tarikh', 'guru_id', 'dari_waktu', 'hingga_waktu', 'sebab', 'catatan', 'guru (rujukan)']]
        .concat(s.absences.map((a) => [a.id, a.date, a.teacherId, a.from == null ? '' : a.from + 1, a.to == null ? '' : a.to + 1, a.reason || '', a.note || '', tname(a.teacherId)])),
      Relief: [['id', 'kunci', 'tarikh', 'guru_tiada_id', 'unit', 'pelajaran_id', 'kelas_id', 'subjek_id', 'waktu', 'status', 'guru_ganti_id', 'catatan', 'guru_tiada (rujukan)', 'guru_ganti (rujukan)']]
        .concat(s.reliefs.map((r) => [r.id, r.key, r.date, r.absentTeacherId, r.unitId || '', r.lessonId, list(r.classIds), r.subjectId || '', r.periods.map((p) => p + 1).join(','), r.status, r.reliefTeacherId || '', r.note || '', tname(r.absentTeacherId), tname(r.reliefTeacherId)]))
    };
  };

  const rowsOf = (tabs, name) => {
    const t = tabs[name] || [];
    const head = (t[0] || []).map(str);
    return t.slice(1).filter((r) => r && r.some((c) => str(c) !== '')).map((r) => {
      const o = {}; head.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i]; }); return o;
    });
  };
  const kv = (tabs, name) => { const o = {}; rowsOf(tabs, name).forEach((r) => { o[str(r.kunci)] = r.nilai; }); return o; };
  TT.sheetMeta = (tabs) => kv(tabs, 'Meta');

  TT.fromSheets = (tabs) => {
    const s = TT.newState();
    const sk = kv(tabs, 'Sekolah');
    if (str(sk.nama)) s.school.name = str(sk.nama);
    s.school.weekMode = str(sk.minggu) === 'sun-thu' ? 'sun-thu' : 'mon-fri';
    const lim = split(sk.had_waktu_sehari).map(Number).filter(Number.isFinite);
    if (lim.length) s.dayLimits = lim;
    try { if (str(sk.tetapan_relief)) s.settings.relief = Object.assign(TT.defaultRelief(), JSON.parse(str(sk.tetapan_relief))); } catch (e) { /* kekal nilai asal */ }
    const per = rowsOf(tabs, 'Waktu').map((r) => ({ label: str(r.label), start: hhmm(r.mula), end: hhmm(r.tamat), type: /rehat|break/i.test(str(r.jenis)) ? 'break' : 'lesson' }));
    if (per.length) s.periods = per;
    s.subjects = rowsOf(tabs, 'Subjek').filter((r) => str(r.id)).map((r) => ({
      id: str(r.id), name: str(r.nama), short: str(r.kod) || str(r.nama).slice(0, 3).toUpperCase(), color: str(r.warna) || '#64748b', heavy: yes(r.subjek_berat)
    }));
    s.teachers = rowsOf(tabs, 'Guru').filter((r) => str(r.id)).map((r) => {
      const un = {};
      split(r['tidak_boleh (hari-waktu)']).forEach((k) => { const [d, p] = k.split('-').map(Number); if (d >= 1 && p >= 1) un[`${d - 1}-${p - 1}`] = true; });
      return { id: str(r.id), name: str(r.nama), short: str(r.kod), dept: str(r.panitia), subjectIds: split(r.subjek_id), maxPerDay: num(r.had_sehari, 7), maxPerWeek: num(r.had_seminggu, 36), noRelief: yes(r.kecuali_relief), unavailable: un };
    });
    s.classes = rowsOf(tabs, 'Kelas').filter((r) => str(r.id)).map((r) => ({ id: str(r.id), name: str(r.nama), level: r.tingkatan, homeroomId: str(r.guru_kelas_id) || null }));
    s.rooms = rowsOf(tabs, 'Bilik').filter((r) => str(r.id)).map((r) => ({ id: str(r.id), name: str(r.nama), type: str(r.jenis) }));
    s.lessons = rowsOf(tabs, 'Pelajaran').filter((r) => str(r.id)).map((r) => ({
      id: str(r.id), classIds: split(r.kelas_id), subjectId: str(r.subjek_id), teacherIds: split(r.guru_id),
      perWeek: num(r.waktu_seminggu, 0), doubles: num(r.berganda, 0), roomId: str(r.bilik_id) || null
    }));
    s.placements = rowsOf(tabs, 'Jadual').filter((r) => str(r.unit)).map((r) => ({
      unit: str(r.unit), lessonId: str(r.pelajaran_id), len: num(r.panjang, 1), day: num(r.hari, 1) - 1, start: num(r.waktu, 1) - 1, locked: yes(r.dikunci)
    }));
    s.absences = rowsOf(tabs, 'TidakHadir').filter((r) => str(r.id)).map((r) => ({
      id: str(r.id), date: isoDate(r.tarikh), teacherId: str(r.guru_id),
      from: str(r.dari_waktu) === '' ? null : num(r.dari_waktu, 1) - 1, to: str(r.hingga_waktu) === '' ? null : num(r.hingga_waktu, 1) - 1,
      reason: str(r.sebab) || 'Lain-lain', note: str(r.catatan)
    }));
    s.reliefs = rowsOf(tabs, 'Relief').filter((r) => str(r.id)).map((r) => ({
      id: str(r.id), key: str(r.kunci), date: isoDate(r.tarikh), absentTeacherId: str(r.guru_tiada_id), unitId: str(r.unit), lessonId: str(r.pelajaran_id),
      classIds: split(r.kelas_id), subjectId: str(r.subjek_id), periods: split(r.waktu).map(Number).filter(Number.isFinite).map((p) => p - 1),
      status: str(r.status) || 'assigned', reliefTeacherId: str(r.guru_ganti_id) || null, note: str(r.catatan)
    }));
    TT.migrate(s); TT.reconcile(s); TT.prunePlacements(s);
    return s;
  };

  // ---------- akses Google Sheets API (fetch disuntik supaya boleh diuji) ----------
  const API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const rangeOf = (t) => encodeURIComponent(`'${t}'`);

  class SheetStore {
    constructor(opts) { this.fetch = opts.fetch; this.token = opts.token; }

    async req(method, url, body) {
      const tok = await this.token();
      const headers = { Authorization: 'Bearer ' + tok };
      if (body) headers['Content-Type'] = 'application/json';
      const res = await this.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { /* bukan JSON */ }
        const err = new Error(msg); err.status = res.status; throw err;
      }
      return res.status === 204 ? {} : res.json();
    }

    async create(title) {
      const r = await this.req('POST', API, { properties: { title }, sheets: TT.SHEET_TABS.map((t) => ({ properties: { title: t } })) });
      return { id: r.spreadsheetId, url: r.spreadsheetUrl, title };
    }

    async info(id) {
      const r = await this.req('GET', `${API}/${id}?fields=${encodeURIComponent('properties.title,spreadsheetUrl,sheets.properties.title')}`);
      return { title: r.properties.title, url: r.spreadsheetUrl, tabs: (r.sheets || []).map((x) => x.properties.title) };
    }

    async readMeta(id) {
      try {
        const r = await this.req('GET', `${API}/${id}/values/${rangeOf('Meta')}?valueRenderOption=UNFORMATTED_VALUE`);
        return TT.sheetMeta({ Meta: r.values || [] });
      } catch (e) {
        if (e.status === 400) return {}; // tab Meta tiada
        throw e;
      }
    }

    // tulis dahulu, kemudian kosongkan baris lebihan; jika tulisan gagal, data lama tidak hilang
    async save(id, state, meta) {
      const info = await this.info(id);
      const miss = TT.SHEET_TABS.filter((t) => !info.tabs.includes(t));
      if (miss.length) await this.req('POST', `${API}/${id}:batchUpdate`, { requests: miss.map((t) => ({ addSheet: { properties: { title: t } } })) });
      const tabs = TT.toSheets(state, meta);
      await this.req('POST', `${API}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data: TT.SHEET_TABS.map((t) => ({ range: `'${t}'!A1`, values: tabs[t] })) });
      await this.req('POST', `${API}/${id}/values:batchClear`, { ranges: TT.SHEET_TABS.map((t) => `'${t}'!A${tabs[t].length + 1}:Z`) });
      return { url: info.url, title: info.title };
    }

    async load(id) {
      const info = await this.info(id);
      const want = TT.SHEET_TABS.filter((t) => info.tabs.includes(t));
      if (!want.includes('Guru') || !want.includes('Pelajaran')) {
        const err = new Error('Sheet ini bukan fail Jadual Sekolah (tab Guru / Pelajaran tiada)'); err.status = 422; throw err;
      }
      const qs = want.map((t) => 'ranges=' + rangeOf(t)).join('&');
      const r = await this.req('GET', `${API}/${id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
      const tabs = {};
      (r.valueRanges || []).forEach((vr, i) => { tabs[want[i]] = vr.values || []; });
      return { state: TT.fromSheets(tabs), meta: TT.sheetMeta(tabs), title: info.title, url: info.url };
    }
  }
  TT.SheetStore = SheetStore;

  // ID boleh ditampal sebagai pautan penuh
  TT.sheetIdFrom = (text) => {
    const x = str(text);
    const m = x.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{20,}$/.test(x) ? x : '';
  };

  // ---------- log masuk Google (Google Identity Services, model token) ----------
  TT.GoogleAuth = function (clientId, scope) {
    let token = null, exp = 0;
    const load = () => new Promise((res, rej) => {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) { res(); return; }
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
      sc.onload = () => res();
      sc.onerror = () => rej(new Error('Gagal memuat skrip log masuk Google. Semak sambungan internet.'));
      document.head.appendChild(sc);
    });
    this.has = () => !!token && Date.now() < exp - 60000;
    this.signIn = async (prompt) => {
      await load();
      token = await new Promise((res, rej) => {
        const client = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope,
          callback: (r) => {
            if (r && r.access_token) { exp = Date.now() + (r.expires_in || 3600) * 1000; res(r.access_token); }
            else rej(new Error((r && (r.error_description || r.error)) || 'Log masuk gagal'));
          },
          error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'Tetingkap log masuk ditutup' : (e && (e.message || e.type)) || 'Log masuk gagal'))
        });
        client.requestAccessToken({ prompt: prompt == null ? '' : prompt });
      });
      return token;
    };
    this.token = async () => {
      if (this.has()) return token;
      const err = new Error('Sesi Google tamat. Tekan "Sambung semula".'); err.status = 401; err.needsLogin = true; throw err;
    };
    this.email = async () => {
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
        return r.ok ? (await r.json()).email || '' : '';
      } catch (e) { return ''; }
    };
    this.signOut = () => {
      if (token && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(token, () => {});
      token = null; exp = 0;
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
