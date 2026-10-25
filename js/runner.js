(function (root) {
  'use strict';
  const TT = root.TT || (root.TT = {});

  // dijalankan di dalam worker; mesti berdiri sendiri kerana dihantar sebagai teks
  function workerMain() {
    self.onmessage = function (e) {
      var eng = new self.TT.Engine(e.data.state, e.data.opts);
      var ms = Math.max(1, e.data.opts.improveMs || 1);
      (function tick() {
        var pr = eng.step(150);
        var frac = pr.phase === 'construct' ? 0.5 * pr.placed / Math.max(1, pr.total)
          : pr.phase === 'improve' ? 0.5 + 0.5 * Math.min(1, (performance.now() - eng.improveStart) / ms) : 1;
        if (pr.done) self.postMessage({ type: 'done', result: eng.result() });
        else { self.postMessage({ type: 'progress', pr: pr, frac: frac }); setTimeout(tick, 0); }
      })();
    };
  }

  TT.workerSource = () => {
    const m = TT.__mods;
    if (!m || !m.core || !m.engine) return null;
    return `self.TT = {};\n(${m.core.toString()})(self);\n(${m.engine.toString()})(self);\n(${workerMain.toString()})();\n`;
  };

  function runMain(state, opts, onProgress, ctl) {
    return new Promise((resolve, reject) => {
      let eng;
      try { eng = new TT.Engine(state, opts); } catch (e) { reject(e); return; }
      const ms = Math.max(1, opts.improveMs || 1);
      const tick = () => {
        if (ctl.cancelled) return;
        try {
          const pr = eng.step(40);
          const frac = pr.phase === 'construct' ? 0.5 * pr.placed / Math.max(1, pr.total)
            : pr.phase === 'improve' ? 0.5 + 0.5 * Math.min(1, (performance.now() - eng.improveStart) / ms) : 1;
          if (pr.done) resolve({ result: eng.result(), mode: 'main' });
          else { onProgress(pr, frac); setTimeout(tick, 0); }
        } catch (e) { reject(e); }
      };
      setTimeout(tick, 0);
    });
  }

  // Jana jadual tanpa membekukan UI. Guna Web Worker jika boleh, jika tidak jalan di main thread berperingkat.
  TT.runSolver = (state, opts, onProgress) => {
    opts = Object.assign({}, opts);
    onProgress = onProgress || (() => {});
    const ctl = { cancelled: false, worker: null };
    const snap = JSON.parse(JSON.stringify(state));
    const promise = new Promise((resolve, reject) => {
      const main = () => { if (!ctl.cancelled) runMain(snap, opts, onProgress, ctl).then(resolve, reject); };
      const src = !opts.noWorker && typeof Worker !== 'undefined' && typeof Blob !== 'undefined' ? TT.workerSource() : null;
      if (!src) { main(); return; }
      let url = null, w;
      try {
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        w = new Worker(url);
      } catch (e) {
        if (url) URL.revokeObjectURL(url);
        main(); return;
      }
      ctl.worker = w;
      const cleanup = () => { w.terminate(); ctl.worker = null; if (url) { URL.revokeObjectURL(url); url = null; } };
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); cleanup(); main(); };
      w.onmessage = (e) => {
        if (e.data.type === 'progress') onProgress(e.data.pr, e.data.frac);
        else { cleanup(); resolve({ result: e.data.result, mode: 'worker' }); }
      };
      w.postMessage({ state: snap, opts });
    });
    return { promise, cancel() { ctl.cancelled = true; if (ctl.worker) ctl.worker.terminate(); } };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof window !== 'undefined' ? window : globalThis);
