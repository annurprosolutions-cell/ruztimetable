// Modul dibungkus sebagai factory supaya sumbernya boleh dihantar ke Web Worker (lihat runner.js)
(function (factory) {
  const root = typeof window !== 'undefined' ? window : globalThis;
  factory(root);
  (root.TT.__mods || (root.TT.__mods = {})).engine = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TT;
})(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const W = { tGap: 4, tRun: 3, tBal: 0.15, cGap: 12, cLate: 8, spread: 6, heavy: 2 };

  /**
   * Penjana jadual. Fasa 1 meletakkan semua unit (letak, jika bertembung tolak keluar
   * unit yang menghalang dan letak semula kemudian). Fasa 2 memperbaiki kos lembut
   * dengan simulated annealing: alih unit atau tukar dua unit, hanya jika sah.
   */
  class Engine {
    constructor(state, opts) {
      opts = opts || {};
      this.state = state;
      this.rand = mulberry32(opts.seed != null ? opts.seed : (Date.now() & 0xffffff));
      this.improveMs = opts.improveMs != null ? opts.improveMs : 4000;
      // jika diberi, fasa 2 berhenti selepas sekian cubaan (bukan masa) supaya hasil deterministik
      this.improveIters = opts.improveIters != null ? opts.improveIters : null;
      this.itersDone = 0;
      const days = TT.days(state), slots = TT.slots(state);
      this.D = days.length; this.P = slots.length;
      this.limit = TT.dayLimits(state);
      this.brk = slots.map((x) => x.breakBefore);
      this.half = Math.ceil(this.P / 2);
      const D = this.D, P = this.P;

      this.tIdx = new Map(state.teachers.map((t, i) => [t.id, i]));
      this.cIdx = new Map(state.classes.map((c, i) => [c.id, i]));
      this.rIdx = new Map(state.rooms.map((r, i) => [r.id, i]));
      this.nT = state.teachers.length; this.nC = state.classes.length; this.nR = state.rooms.length;
      this.tOcc = new Int32Array(this.nT * D * P).fill(-1);
      this.cOcc = new Int32Array(this.nC * D * P).fill(-1);
      this.rOcc = new Int32Array(Math.max(1, this.nR) * D * P).fill(-1);
      this.tBlock = new Uint8Array(this.nT * D * P);
      state.teachers.forEach((t, ti) => {
        for (const k of Object.keys(t.unavailable || {})) {
          if (!t.unavailable[k]) continue;
          const [d, p] = k.split('-').map(Number);
          if (d < D && p < P) this.tBlock[(ti * D + d) * P + p] = 1;
        }
      });
      this.tMax = state.teachers.map((t) => (t.maxPerDay > 0 ? t.maxPerDay : 99));
      this.tDay = new Int16Array(this.nT * D);

      const lessonIdx = new Map(state.lessons.map((l, i) => [l.id, i]));
      this.nL = state.lessons.length;
      this.lUnits = new Int8Array(this.nL * D);
      this.lPer = new Int8Array(this.nL * D);
      const effDays = this.limit.filter((x) => x > 0).length || 1;
      this.lMaxDay = state.lessons.map((l) => Math.max(Math.ceil((l.perWeek | 0) / effDays), (l.doubles | 0) > 0 ? 2 : 1));
      this.relax = false;

      const heavy = new Map(state.subjects.map((x) => [x.id, !!x.heavy]));
      const tLoad = TT.teacherLoad(state);
      this.units = [];
      for (const u of TT.buildUnits(state)) {
        const l = state.lessons[lessonIdx.get(u.lessonId)];
        const cs = l.classIds.map((c) => this.cIdx.get(c)).filter((x) => x != null);
        if (!cs.length) continue;
        const ts = l.teacherIds.map((t) => this.tIdx.get(t)).filter((x) => x != null);
        this.units.push({
          i: this.units.length, id: u.id, li: lessonIdx.get(u.lessonId), lessonId: u.lessonId, len: u.len,
          cs, ts, r: l.roomId && this.rIdx.has(l.roomId) ? this.rIdx.get(l.roomId) : -1,
          heavy: heavy.get(l.subjectId) || false, day: -1, start: -1, locked: false,
          load: Math.max(0, ...l.teacherIds.map((t) => tLoad.get(t) || 0))
        });
      }
      this.byId = new Map(this.units.map((u) => [u.id, u]));
      this.ejected = new Int32Array(this.units.length);
      this.iter = 0; this.maxIter = Math.max(5000, this.units.length * 4000);
      this.stuck = [];
      this.failed = new Set();

      // muatkan penempatan sedia ada
      const keepAll = !!opts.keep;
      for (const pl of state.placements) {
        const u = this.byId.get(pl.unit);
        if (!u || u.day >= 0) continue;
        if (!keepAll && !pl.locked) continue;
        if (!this.legal(u, pl.day, pl.start)) continue;
        const c = this.conflictUnits(u, pl.day, pl.start);
        if (!c || c.length) continue;
        this.place(u, pl.day, pl.start); u.locked = !!pl.locked;
      }

      this.queue = this.units.filter((u) => u.day < 0 && !u.locked);
      this.queue.sort((a, b) => this._difficulty(b) - this._difficulty(a));
      this.phase = 'construct';
      this.improveStart = 0;
      this.curCost = null;
    }

    _difficulty(u) {
      let blocked = 0;
      for (const t of u.ts) for (let k = 0; k < this.D * this.P; k++) blocked += this.tBlock[t * this.D * this.P + k];
      return u.len * 50 + u.load + blocked * 0.6 + u.cs.length * 6 + u.ts.length * 4 + (u.r >= 0 ? 8 : 0) + this.rand() * 6;
    }

    place(u, d, s) {
      const D = this.D, P = this.P;
      for (let k = 0; k < u.len; k++) {
        const p = s + k;
        for (const c of u.cs) this.cOcc[(c * D + d) * P + p] = u.i;
        for (const t of u.ts) this.tOcc[(t * D + d) * P + p] = u.i;
        if (u.r >= 0) this.rOcc[(u.r * D + d) * P + p] = u.i;
      }
      for (const t of u.ts) this.tDay[t * D + d] += u.len;
      this.lUnits[u.li * D + d]++; this.lPer[u.li * D + d] += u.len;
      u.day = d; u.start = s;
    }

    unplace(u) {
      const D = this.D, P = this.P, d = u.day, s = u.start;
      for (let k = 0; k < u.len; k++) {
        const p = s + k;
        for (const c of u.cs) this.cOcc[(c * D + d) * P + p] = -1;
        for (const t of u.ts) this.tOcc[(t * D + d) * P + p] = -1;
        if (u.r >= 0) this.rOcc[(u.r * D + d) * P + p] = -1;
      }
      for (const t of u.ts) this.tDay[t * D + d] -= u.len;
      this.lUnits[u.li * D + d]--; this.lPer[u.li * D + d] -= u.len;
      u.day = -1; u.start = -1;
    }

    // peraturan tetap yang tidak bergantung kepada unit lain
    legal(u, d, s, noCap) {
      const D = this.D, P = this.P;
      if (s < 0 || d < 0 || d >= D || s + u.len > this.limit[d]) return false;
      for (let k = 1; k < u.len; k++) if (this.brk[s + k]) return false;
      const own = u.day === d ? u.len : 0;
      for (const t of u.ts) {
        for (let k = 0; k < u.len; k++) if (this.tBlock[(t * D + d) * P + s + k]) return false;
        if (!noCap && this.tDay[t * D + d] - own + u.len > this.tMax[t]) return false;
      }
      const maxDay = this.lMaxDay[u.li] + (this.relax ? 1 : 0);
      if (this.lPer[u.li * D + d] - own + u.len > maxDay) return false;
      return true;
    }

    // unit lain yang bertindih. null = ada yang dikunci (tak boleh ditolak)
    conflictUnits(u, d, s) {
      const D = this.D, P = this.P, out = [];
      const hit = (v) => {
        if (v < 0 || v === u.i || out.indexOf(v) >= 0) return true;
        if (this.units[v].locked) return false;
        out.push(v); return true;
      };
      for (let k = 0; k < u.len; k++) {
        const p = s + k;
        for (const c of u.cs) if (!hit(this.cOcc[(c * D + d) * P + p])) return null;
        for (const t of u.ts) if (!hit(this.tOcc[(t * D + d) * P + p])) return null;
        if (u.r >= 0 && !hit(this.rOcc[(u.r * D + d) * P + p])) return null;
      }
      return out;
    }

    // had waktu sehari guru boleh dipenuhi dengan menolak keluar unit lain guru itu pada hari yang sama
    _capEjects(u, d, conf) {
      const D = this.D, P = this.P, extra = [];
      for (const t of u.ts) {
        let excess = this.tDay[t * D + d] + u.len - this.tMax[t];
        if (excess <= 0) continue;
        const freed = (v) => { const o = this.units[v]; return o.day === d && o.ts.indexOf(t) >= 0 ? o.len : 0; };
        for (const v of conf) excess -= freed(v);
        for (const v of extra) excess -= freed(v);
        if (excess <= 0) continue;
        const cand = [], base = (t * D + d) * P;
        for (let p = 0; p < this.limit[d]; p++) {
          const v = this.tOcc[base + p];
          if (v >= 0 && v !== u.i && !this.units[v].locked && cand.indexOf(v) < 0 && conf.indexOf(v) < 0 && extra.indexOf(v) < 0) cand.push(v);
        }
        cand.sort((a, b) => (this.ejected[a] - this.ejected[b]) || (this.rand() - 0.5));
        for (const v of cand) { if (excess <= 0) break; extra.push(v); excess -= this.units[v].len; }
        if (excess > 0) return null;
      }
      return extra;
    }

    // ---- kos lembut ----
    _teacherDay(t, d) {
      const base = (t * this.D + d) * this.P, lim = this.limit[d];
      let first = -1, last = -1, cnt = 0, run = 0, over = 0;
      for (let p = 0; p < lim; p++) {
        if (this.tOcc[base + p] >= 0) {
          if (first < 0) first = p;
          last = p; cnt++;
          run = this.brk[p] ? 1 : run + 1;
          if (run > 4) over++;
        } else run = 0;
      }
      if (first < 0) return 0;
      return (last - first + 1 - cnt) * W.tGap + over * W.tRun + cnt * cnt * W.tBal;
    }

    _classDay(c, d) {
      const base = (c * this.D + d) * this.P, lim = this.limit[d];
      let first = -1, last = -1, cnt = 0;
      for (let p = 0; p < lim; p++) if (this.cOcc[base + p] >= 0) { if (first < 0) first = p; last = p; cnt++; }
      if (first < 0) return 0;
      return (last - first + 1 - cnt) * W.cGap + first * W.cLate;
    }

    _lessonDay(li, d) { return Math.max(0, this.lUnits[li * this.D + d] - 1) * W.spread; }

    _unitCost(u) { return u.heavy && u.start >= this.half ? W.heavy * (1 + u.start - this.half) : 0; }

    // jumlah kos bagi semua entiti yang disentuh unit-unit ini pada hari-hari tertentu
    _costFor(units, days) {
      const ts = [], cs = [], ls = []; let c = 0;
      for (const u of units) {
        for (const t of u.ts) if (ts.indexOf(t) < 0) ts.push(t);
        for (const x of u.cs) if (cs.indexOf(x) < 0) cs.push(x);
        if (ls.indexOf(u.li) < 0) ls.push(u.li);
        if (u.day >= 0) c += this._unitCost(u);
      }
      for (const d of days) {
        for (const t of ts) c += this._teacherDay(t, d);
        for (const x of cs) c += this._classDay(x, d);
        for (const l of ls) c += this._lessonDay(l, d);
      }
      return c;
    }

    _scoreAt(u, d, s) {
      const before = this._costFor([u], [d]);
      this.place(u, d, s);
      const after = this._costFor([u], [d]);
      this.unplace(u);
      return after - before;
    }

    totalCost() {
      let c = 0;
      for (let t = 0; t < this.nT; t++) for (let d = 0; d < this.D; d++) c += this._teacherDay(t, d);
      for (let x = 0; x < this.nC; x++) for (let d = 0; d < this.D; d++) c += this._classDay(x, d);
      for (let l = 0; l < this.nL; l++) for (let d = 0; d < this.D; d++) c += this._lessonDay(l, d);
      for (const u of this.units) if (u.day >= 0) c += this._unitCost(u);
      return c;
    }

    // ---- fasa 1 ----
    _construct(end) {
      while (this.queue.length && this.iter < this.maxIter && now() < end) {
        const u = this.queue.shift(); this.iter++;
        let best = null, bestScore = Infinity, bestConf = null;
        for (let d = 0; d < this.D; d++) {
          for (let s = 0; s + u.len <= this.limit[d]; s++) {
            if (!this.legal(u, d, s, true)) continue;
            let conf = this.conflictUnits(u, d, s);
            if (conf === null) continue;
            const extra = this._capEjects(u, d, conf);
            if (extra === null) continue;
            if (extra.length) conf = conf.concat(extra);
            let sc;
            if (!conf.length) sc = this._scoreAt(u, d, s) + this.rand() * 0.5;
            else {
              let w = 0; for (const v of conf) w += 1 + this.ejected[v] * 0.7;
              sc = 1000 * w + this.rand() * 60;
            }
            if (sc < bestScore) { bestScore = sc; best = [d, s]; bestConf = conf; }
          }
        }
        if (!best) { this.stuck.push(u); continue; }
        for (const v of bestConf) { const o = this.units[v]; this.unplace(o); this.ejected[v]++; this.queue.push(o); }
        this.place(u, best[0], best[1]);
      }
      if (!this.queue.length && this.stuck.length && !this.relax) {
        this.relax = true; this.queue = this.stuck; this.stuck = [];
      }
    }

    // ---- fasa 2 ----
    _improve(end, frac0, fracSpan) {
      const mov = this.units.filter((u) => !u.locked && u.day >= 0);
      const cap = this.improveIters;
      if (mov.length < 2) { if (cap != null) this.itersDone = cap; return; }
      if (this.curCost == null) this.curCost = this.totalCost();
      const D = this.D;
      let n = 0;
      while (now() < end && (cap == null || this.itersDone < cap)) {
        const frac = cap != null ? this.itersDone / cap
          : Math.min(1, frac0 + fracSpan * Math.min(1, (now() - this._sliceStart) / Math.max(1, this._sliceLen)));
        if (cap != null) this.itersDone += 200;
        const temp = frac > 0.92 ? 0 : 3 * Math.pow(0.05, frac / 0.92);
        for (let r = 0; r < 200; r++) {
          n++;
          const u = mov[(this.rand() * mov.length) | 0];
          const d = (this.rand() * D) | 0;
          const span = this.limit[d] - u.len + 1;
          if (span <= 0) continue;
          const s = (this.rand() * span) | 0;
          if (d === u.day && s === u.start) continue;
          if (!this.legal(u, d, s)) continue;
          const conf = this.conflictUnits(u, d, s);
          if (conf === null) continue;
          const d0 = u.day, s0 = u.start;
          if (!conf.length) {
            const before = this._costFor([u], [d0, d]);
            this.unplace(u); this.place(u, d, s);
            const delta = this._costFor([u], [d0, d]) - before;
            if (delta <= 0 || (temp > 0 && this.rand() < Math.exp(-delta / temp))) this.curCost += delta;
            else { this.unplace(u); this.place(u, d0, s0); }
          } else if (conf.length === 1) {
            const v = this.units[conf[0]];
            if (v.len !== u.len || v.locked) continue;
            const d1 = v.day, s1 = v.start;
            const before = this._costFor([u, v], [d0, d1]);
            this.unplace(u); this.unplace(v);
            let ok = false;
            if (this.legal(u, d1, s1)) {
              const c1 = this.conflictUnits(u, d1, s1);
              if (c1 && !c1.length) {
                this.place(u, d1, s1);
                if (this.legal(v, d0, s0)) {
                  const c2 = this.conflictUnits(v, d0, s0);
                  if (c2 && !c2.length) { this.place(v, d0, s0); ok = true; }
                }
                if (!ok) this.unplace(u);
              }
            }
            if (ok) {
              const delta = this._costFor([u, v], [d0, d1]) - before;
              if (delta <= 0 || (temp > 0 && this.rand() < Math.exp(-delta / temp))) { this.curCost += delta; continue; }
              this.unplace(u); this.unplace(v);
            }
            this.place(u, d0, s0); this.place(v, d1, s1);
          }
        }
      }
      this.moves = (this.moves || 0) + n;
    }

    // kerja sehingga `sliceMs`; panggil berulang sehingga done
    step(sliceMs) {
      const end = now() + sliceMs;
      if (this.phase === 'construct') {
        this._construct(end);
        if (!this.queue.length || this.iter >= this.maxIter) { this.phase = 'improve'; this.improveStart = now(); }
      } else if (this.phase === 'improve' && this.improveIters != null) {
        this._improve(end, 0, 0);
        if (this.itersDone >= this.improveIters || !this.units.some((u) => !u.locked && u.day >= 0)) this.phase = 'done';
      } else if (this.phase === 'improve') {
        const el = now() - this.improveStart;
        this._sliceStart = now(); this._sliceLen = Math.max(1, Math.min(sliceMs, this.improveMs - el));
        this._improve(Math.min(end, this.improveStart + this.improveMs), Math.min(1, el / this.improveMs), Math.min(1, this._sliceLen / this.improveMs));
        if (now() - this.improveStart >= this.improveMs || !this.units.some((u) => !u.locked && u.day >= 0)) this.phase = 'done';
      }
      return this.progress();
    }

    progress() {
      const placed = this.units.filter((u) => u.day >= 0).length;
      return { phase: this.phase, placed, total: this.units.length, done: this.phase === 'done' };
    }

    metrics() {
      let tGaps = 0, cGaps = 0, repeats = 0;
      for (let t = 0; t < this.nT; t++) for (let d = 0; d < this.D; d++) {
        const base = (t * this.D + d) * this.P; let f = -1, l = -1, c = 0;
        for (let p = 0; p < this.limit[d]; p++) if (this.tOcc[base + p] >= 0) { if (f < 0) f = p; l = p; c++; }
        if (f >= 0) tGaps += l - f + 1 - c;
      }
      for (let x = 0; x < this.nC; x++) for (let d = 0; d < this.D; d++) {
        const base = (x * this.D + d) * this.P; let f = -1, l = -1, c = 0;
        for (let p = 0; p < this.limit[d]; p++) if (this.cOcc[base + p] >= 0) { if (f < 0) f = p; l = p; c++; }
        if (f >= 0) cGaps += l - f + 1 - c;
      }
      for (let l = 0; l < this.nL; l++) for (let d = 0; d < this.D; d++) if (this.lUnits[l * this.D + d] > 1) repeats += this.lUnits[l * this.D + d] - 1;
      return { teacherGaps: tGaps, classGaps: cGaps, repeats, cost: Math.round(this.totalCost()) };
    }

    // sebab ringkas kenapa satu unit tak dapat diletak
    diagnose(u) {
      let legalSlots = 0, tFree = 0, cFree = 0, both = 0;
      const D = this.D, P = this.P;
      const free = (arr, ids, d, s) => {
        for (let k = 0; k < u.len; k++) for (const id of ids) if (arr[(id * D + d) * P + s + k] >= 0) return false;
        return true;
      };
      for (let d = 0; d < D; d++) for (let s = 0; s + u.len <= this.limit[d]; s++) {
        let ok = true;
        for (let k = 1; k < u.len; k++) if (this.brk[s + k]) ok = false;
        for (const t of u.ts) for (let k = 0; k < u.len; k++) if (this.tBlock[(t * D + d) * P + s + k]) ok = false;
        if (!ok) continue;
        legalSlots++;
        const tf = free(this.tOcc, u.ts, d, s), cf = free(this.cOcc, u.cs, d, s);
        if (tf) tFree++; if (cf) cFree++; if (tf && cf) both++;
      }
      if (!legalSlots) return 'tiada slot sah (guru tidak hadir / waktu berganda / had waktu hari)';
      if (!both) return `guru kosong ${tFree} slot, kelas kosong ${cFree} slot, tiada yang sama`;
      return 'terhalang had harian guru atau had pelajaran sehari';
    }

    result() {
      const out = [], un = [];
      for (const u of this.units) {
        if (u.day >= 0) out.push({ unit: u.id, lessonId: u.lessonId, len: u.len, day: u.day, start: u.start, locked: u.locked });
        else un.push({ unit: u.id, lessonId: u.lessonId, reason: this.diagnose(u) });
      }
      return { placements: out, unplaced: un, metrics: this.metrics() };
    }
  }

  TT.Engine = Engine;

  TT.generate = (state, opts) => {
    const e = new Engine(state, opts);
    while (!e.step(50).done);
    return e.result();
  };

});
