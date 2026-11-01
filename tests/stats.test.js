const test = require('node:test');
const assert = require('node:assert');
const TT = require('../js/stats.js');

test('statsText: langganan hanya bila ada, percubaan sentiasa, tiada nombor palsu', () => {
  assert.strictEqual(TT.statsText({ paid: 12, trial: 30, min: 5 }), '12 akaun berbayar · 30 sedang mencuba percuma');
  assert.strictEqual(TT.statsText({ paid: null, trial: 7, min: 5 }), '7 sedang mencuba percuma');
  assert.strictEqual(TT.statsText({ paid: null, trial: 0, min: 5 }), '');
  assert.strictEqual(TT.statsText({ paid: 5, trial: 0 }), '5 akaun berbayar');
  for (const bad of [null, undefined, 'x', { paid: '9', trial: -1 }, { paid: 1.5, trial: NaN }]) assert.strictEqual(TT.statsText(bad), '');
});

test('fetchStats: pulangkan data, gagal senyap jika ralat atau bukan 200', async () => {
  assert.deepStrictEqual(await TT.fetchStats('https://w.test/', async (u) => { assert.strictEqual(u, 'https://w.test/stats'); return { ok: true, json: async () => ({ paid: 6, trial: 1 }) }; }), { paid: 6, trial: 1 });
  assert.strictEqual(await TT.fetchStats('https://w.test', async () => ({ ok: false })), null);
  assert.strictEqual(await TT.fetchStats('https://w.test', async () => { throw new Error('rangkaian'); }), null);
});
