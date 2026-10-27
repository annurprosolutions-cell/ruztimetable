#!/usr/bin/env node
// Jana blok SCHEMA dalam appscript/Code.gs daripada js/survey.js.
//   node tools/gen-appscript.js           tulis fail
//   node tools/gen-appscript.js --check   gagal (kod keluar 1) jika Code.gs tidak sepadan dengan survey.js
const fs = require('fs');
const path = require('path');
const TT = require('../js/survey.js');

const FILE = path.join(__dirname, '../appscript/Code.gs');
const BEGIN = '/*SCHEMA:BEGIN*/', END = '/*SCHEMA:END*/';

function block() {
  return `${BEGIN}\nconst SCHEMA = ${JSON.stringify(TT.surveySchema(), null, 1)};\n${END}`;
}

const src = fs.readFileSync(FILE, 'utf8');
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0) { console.error('Penanda SCHEMA tiada dalam Code.gs'); process.exit(2); }
const next = src.slice(0, a) + block() + src.slice(b + END.length);

if (process.argv.includes('--check')) {
  if (next !== src) { console.error('appscript/Code.gs tidak sepadan dengan js/survey.js. Jalankan: node tools/gen-appscript.js'); process.exit(1); }
  console.log('Code.gs sepadan dengan survey.js');
} else {
  fs.writeFileSync(FILE, next);
  console.log(`Code.gs dikemas kini: ${TT.surveySchema().columns.length} lajur soalan`);
}
