// Ujian beban penjana jadual dengan data sintetik bersaiz sekolah sebenar.
// Guna: node tools/bench.js [ms-pengoptimuman]   (lalai 2000)
// Senario meniru sekolah menengah: subjek teras setiap kelas, PI/PM serentak,
// elektif Tingkatan 4-5 sebagai blok gabungan beberapa kelas dengan beberapa guru serentak.
'use strict';
const TT = require('../js/core.js');
require('../js/engine.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// [kod, waktu seminggu, pasang berganda, guna makmal]
const CORE = [['BM', 6, 1, 0], ['BI', 5, 0, 0], ['MT', 5, 1, 0], ['SN', 5, 1, 1], ['SJ', 3, 0, 0], ['GE', 2, 0, 0], ['PJK', 2, 1, 0], ['PSV', 2, 0, 0], ['RBT', 2, 1, 0]];
const ELEKTIF = ['FIZ', 'KIM', 'BIO', 'PERD', 'EKO', 'GKT'];

TT.benchSchool = (nClass, nTeacher, seed) => {
  const rnd = mulberry(seed || 1);
  const s = TT.newState();
  s.school.name = `Ujian ${nClass} kelas ${nTeacher} guru`;
  const sub = {};
  for (const k of CORE.map((c) => c[0]).concat(['PI', 'PM', 'ELK'])) { sub[k] = { id: 's' + k, name: k, short: k, color: '#888', heavy: ['BM', 'MT', 'SN', 'BI'].includes(k) }; s.subjects.push(sub[k]); }
  const lab = Math.max(1, Math.ceil(nClass / 6));
  for (let i = 0; i < lab; i++) s.rooms.push({ id: 'r' + i, name: 'Makmal ' + (i + 1), type: 'Makmal' });
  for (let i = 0; i < nTeacher; i++) s.teachers.push({ id: 't' + i, name: 'Guru ' + (i + 1), short: 'G' + (i + 1), dept: '', subjectIds: [], maxPerDay: 7, maxPerWeek: 36, unavailable: {}, noRelief: false });
  const per = Math.ceil(nClass / 5);
  for (let i = 0; i < nClass; i++) s.classes.push({ id: 'c' + i, name: `${Math.floor(i / per) + 1} K${i % per}`, level: String(Math.floor(i / per) + 1), homeroomId: null });

  // beban guru diagih supaya seimbang: ambil guru paling ringan yang masih muat
  const load = new Array(nTeacher).fill(0);
  const cap = 30;
  const pick = (n, avoid) => {
    const order = [...load.keys()].filter((i) => !(avoid || []).includes(i)).sort((a, b) => load[a] - load[b] || rnd() - 0.5);
    const i = order.find((x) => load[x] + n <= cap);
    const t = i == null ? order[0] : i; load[t] += n; return t;
  };
  let lid = 0;
  const add = (classIds, subj, teacherIdx, perWeek, doubles, room) => s.lessons.push({ id: 'l' + (lid++), classIds, subjectId: sub[subj].id, teacherIds: teacherIdx.map((i) => 't' + i), perWeek, doubles, roomId: room || null });

  for (let i = 0; i < nClass; i++) {
    const c = 'c' + i, lvl = Math.floor(i / per) + 1;
    for (const [k, n, d, useLab] of CORE) {
      if (lvl >= 4 && (k === 'GE' || k === 'PSV' || k === 'RBT')) continue; // T4-5 ganti dengan elektif
      add([c], k, [pick(n)], n, d, useLab ? 'r' + (i % lab) : null);
    }
    const pi = pick(4), pm = pick(4, [pi]);
    add([c], 'PI', [pi, pm], 4, 0); // PI dan PM serentak, kumpulan pelajar berpecah
  }
  // elektif: setiap tingkatan 4 dan 5 ada 2 blok, setiap blok gabung semua kelas tingkatan itu dengan 3-4 guru serentak
  for (const lvl of [4, 5]) {
    const cls = s.classes.filter((c) => c.level === String(lvl)).map((c) => c.id);
    if (!cls.length) continue;
    for (let b = 0; b < 2; b++) {
      const n = Math.min(ELEKTIF.length, Math.max(2, Math.ceil(cls.length * 0.8)));
      const ts = []; for (let k = 0; k < n; k++) ts.push(pick(4, ts));
      add(cls, 'ELK', ts, 4, 1);
    }
  }
  // 5% guru ada slot tidak boleh (contoh mesyuarat panitia)
  s.teachers.forEach((t, i) => { if (rnd() < 0.05) for (let p = 0; p < 4; p++) t.unavailable[`2-${4 + p}`] = true; });
  return s;
};

if (require.main === module) {
  const ms = +process.argv[2] || 2000;
  const cases = [[24, 51], [35, 70], [50, 100], [50, 300], [110, 300]];
  console.log(`pengoptimuman ${ms} ms\n`);
  console.log('kelas  guru  unit   bina(ms)  jumlah(ms)  tak diletak  ralat  kosong guru  kosong kelas');
  for (const [c, t] of cases) {
    const s = TT.benchSchool(c, t, 7);
    const pre = TT.precheck(s).filter((x) => x.sev === 'error');
    const t0 = Date.now();
    const e = new TT.Engine(s, { seed: 7, improveMs: ms });
    let built = 0;
    while (!e.step(50).done) if (!built && e.phase !== 'construct') built = Date.now() - t0;
    const r = e.result(); const total = Date.now() - t0;
    s.placements = r.placements;
    const errs = TT.validate(s).issues.filter((x) => x.sev === 'error').length;
    console.log(`${String(c).padStart(5)} ${String(t).padStart(5)} ${String(r.placements.length + r.unplaced.length).padStart(5)} ${String(built || total).padStart(10)} ${String(total).padStart(11)} ${String(r.unplaced.length).padStart(12)} ${String(errs).padStart(6)} ${String(r.metrics.teacherGaps).padStart(12)} ${String(r.metrics.classGaps).padStart(13)}${pre.length ? '  precheck: ' + pre[0].msg : ''}`);
  }
}

module.exports = TT;
