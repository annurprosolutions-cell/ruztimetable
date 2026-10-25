const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/core.js');
require('../js/engine.js');
require('../js/sample.js');
require('../js/runner.js');

test('modul core dan engine didaftarkan sebagai factory untuk worker', () => {
  assert.strictEqual(typeof TT.__mods.core, 'function');
  assert.strictEqual(typeof TT.__mods.engine, 'function');
  const src = TT.workerSource();
  assert.match(src, /self\.TT = \{\}/);
  assert.match(src, /class Engine/);
  // sumber worker mesti boleh dinilai dalam skop kosong dan menghasilkan Engine yang berfungsi
  const self = {};
  new Function('self', 'performance', 'setTimeout', src)(self, { now: () => Date.now() }, () => {});
  assert.strictEqual(typeof self.TT.Engine, 'function');
  assert.strictEqual(typeof self.onmessage, 'function');
  const s = TT.sample();
  const r = new self.TT.Engine(s, { seed: 2, improveMs: 0 });
  while (!r.step(50).done);
  assert.strictEqual(r.result().unplaced.length, 0);
});

test('runSolver (fallback main thread di Node) menghasilkan jadual lengkap', async () => {
  const s = TT.sample();
  const seen = [];
  const job = TT.runSolver(s, { seed: 3, improveMs: 300 }, (pr, frac) => seen.push(frac));
  const { result, mode } = await job.promise;
  assert.strictEqual(mode, 'main');
  assert.strictEqual(result.unplaced.length, 0);
  assert.ok(seen.length > 0 && seen.every((f) => f >= 0 && f <= 1));
  s.placements = result.placements;
  assert.deepStrictEqual(TT.validate(s).issues.filter((i) => i.sev === 'error'), []);
});

test('runSolver tidak mengubah state asal', async () => {
  const s = TT.sample();
  const before = JSON.stringify(s);
  await TT.runSolver(s, { seed: 1, improveMs: 50 }).promise;
  assert.strictEqual(JSON.stringify(s), before);
});
