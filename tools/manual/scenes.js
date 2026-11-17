// Babak video panduan. Sasaran setiap babak ~1 minit. h.say() = kapsyen, h.shot() = gambar skrin untuk manual.
'use strict';
const nextYear = '2027-11-01';

// fail Excel pangkalan data aSc tiruan untuk video import (nama rekaan sahaja)
function fakeAsc() {
  require('../../js/core.js'); require('../../js/xlsx.js');
  const TT = globalThis.TT;
  const HEAD = ['Guru', 'Kelas', 'Kumpulan', 'Subjek', 'Panjang', 'Bil. Pelajaran/Minggu', 'Bilik tersedia', 'Kitaran'];
  const L = (g, k, kp, sj, pj, n) => [g, k, kp, sj, pj, String(n), 'Bilik Kelas', ' Semua minggu'];
  const T = { AINA: 'CIKGU AINA BINTI ALI', KUMAR: 'CIKGU KUMAR A/L RAJAN', LIM: 'CIKGU LIM MEI LING', HAFIZ: 'CIKGU HAFIZ BIN OMAR', SALMA: 'USTAZAH SALMA BINTI YUSOF', TAN: 'CIKGU TAN WEI JIE',
    NURUL: 'CIKGU NURUL BINTI HASSAN', RAVI: 'CIKGU RAVI A/L SAMY', FARAH: 'CIKGU FARAH BINTI IDRIS', AZLAN: 'CIKGU AZLAN BIN KAMAL' };
  const four = '4 ALFA,4 BETA,5 ALFA,5 BETA', whole4 = 'Seluruh kelas,Seluruh kelas,Seluruh kelas,Seluruh kelas';
  const rows = [HEAD, L('Tanpa guru', four, whole4, 'R', 'Single', 1), L('Tanpa guru', four, whole4, 'PERH', 'Single', 1), L(T.AZLAN, 'Tanpa kelas', '', 'GPM', 'Double', 3)];
  [['4 ALFA', 'AINA', 'LIM', 'KUMAR', 'HAFIZ'], ['4 BETA', 'AINA', 'LIM', 'KUMAR', 'HAFIZ'], ['5 ALFA', 'SALMA', 'TAN', 'RAVI', 'NURUL'], ['5 BETA', 'SALMA', 'TAN', 'RAVI', 'NURUL']].forEach(([c, bm, bi, mt, sn]) => {
    rows.push(L(T[bm], c, 'Seluruh kelas', 'BM', 'Double', 1), L(T[bm], c, 'Seluruh kelas', 'BM', 'Single', 1), L(T[bi], c, 'Seluruh kelas', 'BI', 'Double', 1), L(T[bi], c, 'Seluruh kelas', 'BI', 'Single', 1),
      L(T[mt], c, 'Seluruh kelas', 'MATH', 'Double', 1), L(T[mt], c, 'Seluruh kelas', 'MATH', 'Single', 1), L(T[sn], c, 'Seluruh kelas', 'SN', 'Double', 1), L(T.FARAH, c, 'Seluruh kelas', 'SEJ', 'Single', 2));
  });
  rows.push(L(T.TAN + ',' + T.RAVI, '4 ALFA', 'Seluruh kelas', 'RBT', 'Double', 2));
  rows.push(L(T.AZLAN, '4 ALFA,4 BETA', 'Boys,Boys', 'PJPK', 'Double', 1), L(T.NURUL, '4 BETA,4 ALFA', 'Girls,Girls', 'PJPK', 'Double', 1));
  rows.push(L(T.HAFIZ, '4 ALFA', 'ISLAM', 'PI', 'Double', 2), L(T.SALMA, '4 BETA', 'ISLAM', 'PI', 'Double', 2), L(T.FARAH, '4 ALFA,4 BETA', 'BUKAN ISLAM,BUKAN ISLAM', 'PM', 'Double', 2));
  const sheet = (name, r) => ({ name, rows: r });
  return Buffer.from(TT.xlsxWrite([
    sheet('Pelajaran', rows),
    sheet('Kelas', [['Kelas', 'Singkatan', 'Masa Off'], ['4 ALFA', '4 A', ''], ['4 BETA', '4 B', ''], ['5 ALFA', '5 A', ''], ['5 BETA', '5 B', '']]),
    sheet('Bilik', [['', 'Nama', 'Singkatan', 'Jenis']]),
    sheet('Subjek', [['', 'Subjek', 'Singkatan']].concat(['BM', 'BI', 'MATH', 'SN', 'SEJ', 'PI', 'PM', 'PJPK', 'RBT', 'R', 'PERH', 'GPM'].map((x) => ['', x, x]))),
    sheet('Guru', [['', 'Nama', 'Singkatan', 'Guru kelas', 'Kebenaran', 'Kontrak', 'Masa Lapang', 'Masa Off']].concat(Object.entries(T).map(([k, n], i) => ['', n, k, i < 4 ? ['4 A', '4 B', '5 A', '5 B'][i] : '', '', '12', '-', k === 'AZLAN' ? 'ISNIN: 11-14' : '']))),
    sheet('Kontrak', [['Guru', 'Kelas', 'Kumpulan', 'Subjek', 'Panjang', 'Bil. Pelajaran/Minggu']])
  ]));
}

module.exports = [
  {
    id: 'V01', file: '01-kenali-annur-time-table', title: 'Kenali Annur Time Table', sub: 'Jadual waktu dan relief guru ganti dalam satu sistem',
    async run(h) {
      await h.title('Kenali Annur Time Table', 'Jadual waktu dan relief guru ganti dalam satu sistem');
      await h.shot('utama');
      await h.say('Halaman Utama: ringkasan hari ini, guru tidak hadir dan perkara yang perlu tindakan.');
      await h.hl('.card.dark.today', 1800);
      await h.say('Menu atas: Utama, Data, Jadual, Relief, Laporan dan Tetapan.');
      await h.nav('data'); await h.say('Data: guru, subjek, kelas, bilik dan beban mengajar.');
      await h.nav('jadual'); await h.say('Jadual: jana automatik, laras dengan seret dan lepas, cetak dan Excel.');
      await h.nav('relief'); await h.say('Relief: rekod guru tidak hadir dan agih guru ganti secara adil.');
      await h.nav('laporan'); await h.shot('laporan'); await h.say('Laporan: beban mengajar dan statistik relief.');
      await h.nav('tetapan'); await h.say('Tetapan: sekolah, waktu, sekatan, peraturan relief dan Google Sheets.');
      await h.nav('utama');
      await h.say('Nak cuba dulu? Buka annurtimetable.com/?demo. Data contoh, tiada apa disimpan.');
      await h.end('Seterusnya: Log masuk kali pertama');
    }
  },
  {
    id: 'V02', file: '02-log-masuk-dan-percubaan-14-hari', title: 'Log masuk kali pertama', sub: 'Akaun Google sekolah, kata laluan pentadbir dan percubaan percuma 14 hari', fresh: true,
    async run(h) {
      const { pg } = h;
      await h.title('Log masuk kali pertama', 'Akaun Google, kata laluan pentadbir, percubaan percuma 14 hari');
      await h.shot('login-1-peranan');
      await h.say('Buka annurtimetable.com dan pilih Pentadbir jadual.');
      await h.click('[data-act="gateGo"][data-s="admin"]');
      await h.shot('login-2-google');
      await h.say('Log masuk dengan akaun Google sekolah. DELIMa atau Gmail, kedua-duanya boleh.');
      await h.click('[data-act="gateGoogle"]', { after: 2000 });
      await pg.waitForSelector('#wName, header.topbar, .gate .err', { timeout: 15000 }).catch(() => {});
      if (await pg.locator('#wName').count()) {
        await h.say('Akaun baharu terus dapat percubaan 14 hari. Isi nama sekolah.');
        await h.type('#wName', 'SMK Contoh Jaya');
        await h.shot('login-3-nama-sekolah');
        await h.click('[data-act="gateNext"]');
        await h.say('Tetapkan kata laluan pentadbir (sekurang-kurangnya 6 aksara).');
        await h.type('#wPw', 'rahsia123', { delay: 50 }); await h.type('#wPw2', 'rahsia123', { delay: 50 });
        await h.shot('login-4-kata-laluan');
        await h.click('[data-act="gateNext"]');
        await h.say('Pilih cara mula: data contoh, mula kosong, atau import dari aSc.');
        await h.shot('login-5-pilih-data');
        await h.click('input[name="wData"][value="contoh"]', { after: 500 });
        await h.click('[data-act="gateNext"]', { after: 2000 });
      }
      await pg.waitForSelector('header.topbar', { timeout: 20000 }).catch(() => {});
      await h.shot('login-6-utama-percubaan');
      await h.say('Siap. Baki hari percubaan dipapar di halaman Utama. Semua ciri dibuka.');
      await h.hl('.act-item, .abanner, .banner', 1800);
      await h.nav('tetapan'); await h.tab('setTab', 'storan');
      await h.shot('storan-selepas-log-masuk');
      await h.say('Data disimpan dalam Google Sheet milik sekolah sendiri (Tetapan, Storan & backup).');
      await h.end('Seterusnya: Tetapan sekolah dan waktu');
    }
  },
  {
    id: 'V03', file: '03-tetapan-sekolah-dan-waktu', title: 'Tetapan sekolah dan waktu', sub: 'Nama, logo, warna, waktu pelajaran dan rehat',
    async run(h) {
      await h.title('Tetapan sekolah dan waktu', 'Nama, logo, warna, waktu pelajaran dan rehat');
      await h.nav('tetapan'); await h.tab('setTab', 'sekolah');
      await h.shot('tetapan-sekolah');
      await h.say('Tab Sekolah: nama, logo, warna tema dan minggu persekolahan.');
      await h.say('Nama dan logo sekolah juga menjadi nama dan ikon app bila dipasang di telefon atau komputer.');
      await h.tab('setTab', 'waktu');
      await h.shot('tetapan-waktu');
      await h.say('Tab Waktu & rehat: senarai waktu pelajaran setiap hari, termasuk rehat.');
      await h.scrollTo('[data-act="periodGen"]', 1000);
      await h.hl('[data-act="periodGen"]', 1400);
      await h.say('"Jana waktu" bina senarai sekaligus: masa mula, tempoh setiap waktu dan rehat.');
      await h.scrollTo('input[name="tmode"]', 1000);
      await h.shot('tetapan-mod-waktu');
      await h.say('Waktu Tahap 1 dan Tahap 2 berbeza? Pilih "Waktu berbeza ikut kumpulan kelas".');
      await h.hl('input[name="tmode"][value="1"]', 1300);
      await h.say('Guru tidak akan bertembung walaupun waktu kedua-dua tahap berbeza.');
      await h.say('Jam berbeza setiap hari? Lihat video 14. Semua perubahan disimpan automatik.');
      await h.end('Seterusnya: Data guru, subjek, kelas dan bilik');
    }
  },
  {
    id: 'V04', file: '04-data-guru-subjek-kelas-bilik', title: 'Data guru, subjek, kelas dan bilik', sub: 'Tambah satu-satu, tambah ramai, atau import dari aSc',
    async run(h) {
      await h.title('Data guru, subjek, kelas dan bilik', 'Tambah satu-satu, tambah ramai, atau import dari aSc');
      await h.nav('data'); await h.tab('dataTab', 'guru');
      await h.shot('data-guru');
      await h.say('Halaman Data ada 5 tab: Guru, Subjek, Kelas, Bilik dan Pelajaran.');
      await h.click('button[data-act="edit"][data-kind="guru"]', { after: 1000 });
      await h.shot('data-guru-borang');
      await h.say('Borang guru: kod, panitia, jawatan, had waktu, dan waktu tidak boleh mengajar.');
      await h.scrollDlg(1200);
      await h.click('.overlay [data-act="modalClose"]');
      await h.say('Ramai guru? "Tambah ramai sekaligus" dan tampal terus dari Excel.');
      await h.click('button[data-act="bulk"][data-kind="guru"]', { after: 700 });
      await h.type('textarea[name="text"]', 'Cikgu Aminah binti Ali, AMA, Sains\nCikgu Kumar a/l Rajan, KUM, Matematik\nCikgu Lim Mei Ling, LML, Bahasa', { delay: 14 });
      await h.shot('data-tambah-ramai');
      await h.click('[data-act="formSave"]', { after: 1200 });
      await h.say('Pernah guna aSc? Klik "Import dari aSc / Excel" dan pilih fail eksport aSc.');
      await h.hl('button[data-act="ascImport"]', 1500);
      await h.tab('dataTab', 'kelas'); await h.shot('data-kelas');
      await h.say('Tab Kelas dan Bilik diisi dengan cara yang sama.');
      await h.end('Seterusnya: Pelajaran dan beban mengajar');
    }
  },
  {
    id: 'V05', file: '05-pelajaran-beban-mengajar', title: 'Pelajaran dan beban mengajar', sub: 'Siapa mengajar apa, di kelas mana, berapa waktu seminggu',
    async run(h) {
      await h.title('Pelajaran dan beban mengajar', 'Siapa mengajar apa, di kelas mana, berapa waktu seminggu');
      await h.nav('data'); await h.tab('dataTab', 'pelajaran');
      await h.shot('data-pelajaran');
      await h.say('Tab Pelajaran ialah asas jadual: subjek, kelas, guru dan waktu seminggu.');
      await h.click('[data-act="add-pelajaran"]', { after: 1000 });
      await h.shot('pelajaran-borang');
      await h.say('Pilih subjek, kelas dan guru. Isi waktu seminggu dan bilangan waktu berganda.');
      await h.scrollDlg(1300);
      await h.say('Kelas gabungan atau guru berpasangan: pilih lebih daripada satu.');
      await h.click('.overlay [data-act="modalClose"]');
      await h.say('Sistem beri amaran jika beban guru melebihi had atau slot tidak cukup.');
      await h.scroll(400, 1200); await h.scroll(0, 600);
      await h.end('Seterusnya: Jana dan laras jadual');
    }
  },
  {
    id: 'V06', file: '06-jana-dan-laras-jadual', title: 'Jana dan laras jadual', sub: 'Jadual siap dalam beberapa saat, kemudian laras dengan seret dan lepas',
    async run(h) {
      const { pg } = h;
      await h.title('Jana dan laras jadual', 'Jadual siap dalam beberapa saat, kemudian laras dengan seret dan lepas');
      await h.nav('jadual');
      await h.say('Halaman Jadual. Klik "Jana jadual".');
      await h.click('button[data-act="generate"]', { after: 900 });
      await h.shot('jadual-jana-modal');
      await h.say('Pilih usaha pengoptimuman, kemudian Mula.');
      await h.select('#gEffort', '2000');
      await h.click('button[data-act="genStart"]', { after: 1200 });
      await h.confirmIf();
      await pg.waitForFunction(() => !document.querySelector('.overlay') && UI.lastGen, null, { timeout: 60000 }).catch(() => {});
      await h.W(600);
      await h.shot('jadual-kelas');
      await h.say('Siap. Tiada pertembungan guru, kelas atau bilik.');
      await h.say('Seret satu waktu ke petak lain. Petak hijau bermaksud boleh diletak.');
      try {
        const src = pg.locator('td.cell.filled[draggable="true"]').nth(3);
        await src.scrollIntoViewIfNeeded(); const b = await src.boundingBox();
        if (h.video) await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
        await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await pg.mouse.down();
        await pg.mouse.move(b.x + b.width / 2 + 8, b.y + b.height / 2 + 8, { steps: 4 }); await h.W(500);
        const ok = pg.locator('td.cell.empty.ok').first();
        if (await ok.count()) { const t = await ok.boundingBox(); await pg.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 26 }); await h.W(600); }
        await pg.mouse.up(); await h.W(1000);
      } catch (e) { /* abaikan */ }
      await h.say('Ikon kunci kekalkan waktu itu bila jadual dijana semula.');
      await h.click('button[data-act="tab"][data-scope="viewType"][data-k="teacher"]', { after: 900 });
      await h.shot('jadual-guru');
      await h.say('Tukar paparan: Kelas, Guru, Bilik, atau Induk (semua kelas).');
      await h.click('button[data-act="tab"][data-scope="viewType"][data-k="mclass"]', { after: 1200 });
      await h.shot('jadual-induk');
      await h.end('Seterusnya: Sekatan serentak');
    }
  },
  {
    id: 'V07', file: '07-sekatan-serentak', title: 'Sekatan serentak', sub: 'Mesyuarat panitia, kokurikulum dan aktiviti yang melibatkan ramai guru',
    async run(h) {
      await h.title('Sekatan serentak', 'Mesyuarat panitia, kokurikulum dan aktiviti melibatkan ramai guru');
      await h.nav('tetapan'); await h.tab('setTab', 'sekatan');
      await h.shot('sekatan-senarai');
      await h.say('Tab Sekatan serentak: kosongkan waktu yang sama untuk sekumpulan guru.');
      await h.click('button[data-act="blockEdit"]:not([data-id])', { after: 900 });
      await h.say('Contoh: Mesyuarat Panitia Sains, Rabu waktu 7 hingga 8.');
      await h.type('#theForm [name="name"]', 'Mesyuarat Panitia Sains', { delay: 40 });
      await h.click('#theForm input[name="days"][value="2"]', { after: 400 });
      await h.select('#theForm [name="from"]', { index: 6 });
      await h.select('#theForm [name="to"]', { index: 7 });
      await h.select('#theForm [name="scope"]', 'dept');
      await h.select('#theForm [name="dept"]', { index: 1 });
      await h.shot('sekatan-borang');
      await h.say('Pilih semua guru, satu panitia, atau guru tertentu.');
      await h.click('[data-act="formSave"]', { after: 1200 });
      await h.say('Penjana tidak letak kelas pada waktu itu, dan guru terlibat tidak diberi relief.');
      await h.say('Jana semula jadual selepas tambah sekatan.');
      await h.say('Perhimpunan pagi? Tambah satu lagi sekatan: Isnin, waktu 1, semua guru.');
      await h.click('button[data-act="blockEdit"]:not([data-id])', { after: 900 });
      await h.type('#theForm [name="name"]', 'Perhimpunan', { delay: 40 });
      await h.click('#theForm input[name="days"][value="0"]', { after: 400 });
      await h.select('#theForm [name="from"]', { index: 0 });
      await h.select('#theForm [name="to"]', { index: 0 });
      await h.shot('sekatan-perhimpunan');
      await h.click('[data-act="formSave"]', { after: 1200 });
      await h.nav('jadual', { after: 600 });
      await h.click('button[data-act="generate"]', { after: 600 });
      await h.pg.selectOption('#gMode', 'fresh'); await h.pg.selectOption('#gEffort', '2000');
      await h.click('button[data-act="genStart"]', { after: 600 });
      await h.pg.waitForFunction(() => !document.querySelector('.overlay') && UI.lastGen, null, { timeout: 30000 }).catch(() => {});
      await h.W(700);
      await h.shot('jadual-label-perhimpunan', { wait: 6500 });
      await h.say('Selepas jana semula, petak Isnin waktu 1 bagi setiap kelas bertanda Perhimpunan.');
      await h.end('Seterusnya: Cetak dan muat turun Excel');
    }
  },
  {
    id: 'V08', file: '08-cetak-dan-excel', title: 'Cetak dan muat turun Excel', sub: 'Jadual kelas, guru dan bilik dalam format sedia cetak',
    async run(h) {
      await h.title('Cetak dan muat turun Excel', 'Jadual kelas, guru dan bilik dalam format sedia cetak');
      await h.nav('jadual');
      await h.say('Pilih jadual, kemudian klik Cetak.');
      await h.printPreview(() => h.click('button[data-act="printView"]', { after: 400 }), 4000, 'cetak-jadual-kelas');
      await h.say('Satu jadual satu halaman, dengan nama sekolah dan senarai guru subjek.');
      await h.say('"Cetak semua": semua kelas atau semua guru sekaligus.');
      await h.hl('button[data-act="printAll"]', 1300);
      await h.say('Excel: jadual paparan ini, atau semua jadual dalam satu fail (satu tab setiap satu).');
      await h.hl('button[data-act="xlsxAll"], button[data-act="xlsxView"]', 1300);
      await h.click('button[data-act="xlsxView"]', { after: 1200 });
      await h.say('Fail boleh dibuka dengan Excel atau Google Sheets dan dihantar kepada guru.');
      await h.end('Seterusnya: Relief harian');
    }
  },
  {
    id: 'V09', file: '09-relief-harian', title: 'Relief harian', sub: 'Rekod guru tidak hadir, agih guru ganti, hantar WhatsApp',
    async run(h) {
      await h.title('Relief harian', 'Rekod guru tidak hadir, agih guru ganti, hantar WhatsApp');
      await h.nav('relief');
      await h.shot('relief-harian');
      await h.say('Relief harian: guru tidak hadir dan kelas yang perlu diganti.');
      await h.click('button[data-act="absenceAdd"]', { after: 900 });
      await h.say('Pilih guru, sebab dan tempoh: sehari, waktu tertentu, atau beberapa hari.');
      await h.select('#theForm [name="teacherId"]', { index: 4 });
      await h.select('#theForm [name="reason"]', { index: 1 });
      await h.shot('relief-tidak-hadir-borang');
      await h.click('[data-act="formSave"]', { after: 1300 });
      await h.say('Klik "Agih automatik": guru free yang paling kurang relief bulan ini dipilih.');
      await h.click('button[data-act="reliefAuto"]', { after: 1500 });
      await h.shot('relief-diagih');
      await h.scroll(380, 1200);
      await h.say('Boleh tukar guru ganti melalui menu pada setiap waktu.');
      await h.click('button[data-act="reliefMsg"]', { after: 1200 });
      await h.shot('relief-whatsapp');
      await h.say('WhatsApp: salin mesej relief dan tampal dalam kumpulan guru.');
      await h.click('.overlay [data-act="modalClose"]');
      await h.say('Atau cetak slip relief untuk papan kenyataan.', 2000);
      await h.printPreview(() => h.click('button[data-act="reliefPrint"]', { after: 400 }), 3500, 'relief-slip');
      await h.end('Seterusnya: Relief lanjutan dan peraturan');
    }
  },
  {
    id: 'V10', file: '10-relief-lanjutan-dan-peraturan', title: 'Relief lanjutan dan peraturan', sub: 'Paparan semua guru, kalendar, statistik dan peraturan sekolah',
    async run(h) {
      await h.title('Relief lanjutan dan peraturan', 'Paparan semua guru, kalendar, statistik dan peraturan sekolah');
      await h.nav('relief');
      await h.click('button[data-act="reliefView"][data-v="guru"]', { after: 1200 });
      await h.shot('relief-paparan-semua-guru');
      await h.say('"Paparan semua guru": siapa free setiap waktu. Klik petak untuk pilih guru ganti.');
      await h.click('button[data-act="reliefView"][data-v="senarai"]', { after: 700 });
      await h.tab('reliefTab', 'kalendar');
      await h.shot('relief-kalendar');
      await h.say('Kalendar: semua ketidakhadiran sebulan.');
      await h.tab('reliefTab', 'statistik');
      await h.shot('relief-statistik');
      await h.say('Statistik: jumlah relief setiap guru. Sisihan piawai kecil = adil.');
      await h.tab('reliefTab', 'sejarah');
      await h.shot('relief-sejarah');
      await h.say('Sejarah: semua rekod relief, boleh dimuat turun sebagai CSV.');
      await h.nav('tetapan'); await h.tab('setTab', 'relief');
      await h.shot('peraturan-relief');
      await h.say('Peraturan relief: had sehari dan seminggu, had jumlah waktu, rehat antara waktu.');
      await h.scrollTo('input[data-k="maxStreak"]', 1000);
      await h.hl('input[data-k="maxStreak"]', 1500);
      await h.shot('peraturan-relief-berturut');
      await h.say('Had waktu berturut-turut: kelas sendiri dan relief dikira bersama. Contoh 2, tiada guru jadi 3 waktu berturut-turut.');
      await h.hl('input[data-k="splitDouble"]', 1500);
      await h.say('Pecah pelajaran berganda: Waktu 1-2 boleh diberi kepada dua guru berlainan. Lihat video 15.');
      await h.scroll(350, 1200);
      await h.say('Jawatan tertentu (contoh GPK) boleh dikecualikan daripada relief.');
      await h.end('Seterusnya: Google Sheets, backup dan pautan guru');
    }
  },
  {
    id: 'V11', file: '11-google-sheets-backup-pautan-guru', title: 'Google Sheets, backup dan pautan guru', sub: 'Data dalam Google Drive sekolah sendiri, pautan khas untuk guru',
    licence: { plan: 'tahunan', school: 'SMK Contoh Jaya', expires: nextYear },
    async run(h) {
      const { pg } = h;
      await h.title('Google Sheets, backup dan pautan guru', 'Data dalam Google Drive sekolah sendiri, pautan khas untuk guru');
      await h.nav('tetapan'); await h.tab('setTab', 'storan');
      await h.say('Tetapan, Storan & backup. Log masuk Google untuk simpan ke Google Sheet sekolah.');
      await h.click('button[data-act="syncSignIn"]', { after: 1800 });
      await pg.waitForFunction(() => UI.sync && UI.sync.licensed && UI.sync.licensed(), null, { timeout: 15000 }).catch(() => {});
      await h.shot('storan-log-masuk');
      await h.say('Lesen disemak automatik. Klik "Cipta Google Sheet".');
      await h.click('button[data-act="syncCreate"]', { after: 2000 });
      await h.confirmIf();
      await pg.waitForFunction(() => UI.sync && /saved|off/.test(UI.sync.status) && UI.state.school.guruSheet, null, { timeout: 20000 }).catch(() => {});
      await h.W(800);
      await h.shot('storan-sheets');
      await h.say('Selepas ini setiap perubahan disimpan automatik. Lihat status "Disimpan" di atas.');
      await h.scrollTo('#slugIn', 1000);
      await h.shot('pautan-guru');
      await h.say('Pautan guru: kongsi dalam WhatsApp. Guru pilih nama dan terus nampak jadual sendiri.');
      await h.say('Pelanggan berbayar boleh pilih nama pautan, contoh annurtimetable.com/s/smkcontohjaya.');
      await h.type('#slugIn', 'smkcontohjaya', { delay: 50 });
      await h.click('button[data-act="slugClaim"]', { after: 1800 });
      await h.shot('nama-pautan');
      await h.scrollTo('[data-act="archiveRun"]', 1000);
      await h.shot('arkib');
      await h.say('Arkib: pindahkan rekod relief lama ke fail lain supaya sistem kekal laju.');
      await h.end('Seterusnya: Paparan guru di telefon');
    }
  },
  {
    id: 'V12', file: '12-paparan-guru-di-telefon', title: 'Paparan guru di telefon', sub: 'Guru lihat jadual dan tugas relief sendiri, tanpa log masuk', phone: true, fresh: true, ready: '.gate .pickbtn',
    // pentadbir simpan ke Google Sheets dahulu (tidak dirakam) supaya Sheet Data Guru wujud dan dikongsi
    async prep({ browser, be, seed, base, FIXED, site }) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Kuala_Lumpur', serviceWorkers: 'block', storageState: seed });
      await site(ctx); const pg = await ctx.newPage(); await pg.clock.setFixedTime(FIXED); await be.mocks(pg);
      await pg.goto(base); await pg.waitForSelector('header.topbar');
      await pg.evaluate(() => { UI.page = 'tetapan'; UI.setTab = 'storan'; UI.render(); });
      await pg.click('button[data-act="syncSignIn"]');
      await pg.waitForFunction(() => UI.sync.licensed && UI.sync.licensed(), null, { timeout: 15000 });
      await pg.click('button[data-act="syncCreate"]');
      if (await pg.locator('[data-act="confirmYes"]').count()) await pg.click('[data-act="confirmYes"]');
      await pg.waitForFunction(() => UI.state.school.guruSheet && UI.sync.status === 'saved', null, { timeout: 20000 });
      await pg.evaluate(() => UI.sync.push(true));
      const link = await pg.evaluate(() => UI.sync.guruLink());
      await ctx.close();
      return link;
    },
    async run(h) {
      await h.title('Paparan guru', 'Jadual dan relief sendiri di telefon, tanpa log masuk');
      await h.shot('guru-1-pilih-nama');
      await h.say('Guru buka pautan daripada pentadbir. Tiada akaun, tiada kata laluan.');
      await h.say('Pilih nama sendiri. Telefon ingat pilihan ini.');
      await h.click('.gate .pickbtn >> nth=2', { after: 1500 });
      await h.shot('guru-2-utama');
      await h.say('Utama: kelas hari ini dan tugas relief jika ada.');
      await h.scroll(500, 1200); await h.scroll(0, 600);
      await h.click('nav button[data-p="jadualku"], button[data-p="jadualku"]', { after: 1200 });
      await h.shot('guru-3-jadual-saya');
      await h.say('Jadual saya: jadual mingguan sendiri.');
      await h.scroll(400, 1200); await h.scroll(0, 600);
      await h.click('nav button[data-p="reliefku"], button[data-p="reliefku"]', { after: 1200 });
      await h.shot('guru-4-relief-saya');
      await h.say('Relief saya: tugas relief akan datang dan sejarah bulan ini.');
      await h.say('Tip: tambah ke skrin utama, dan hidupkan notifikasi relief.');
      await h.end('Seterusnya: Langganan dan lesen');
    }
  },
  {
    id: 'V13', file: '13-langganan-dan-lesen', title: 'Langganan dan lesen', sub: 'Notis lesen, cara bayar, dan apa berlaku bila tamat',
    async run(h) {
      const { pg } = h;
      await h.title('Langganan dan lesen', 'Notis lesen, cara bayar, dan apa berlaku bila tamat');
      await pg.evaluate(() => { UI.prefs.license = { email: '', ok: true, plan: 'percubaan', expires: TT.addDays(TT.todayISO(), 2), checkedAt: Date.now() }; UI.sync.license = { allowed: true, state: 'off', message: '' }; UI.page = 'utama'; UI.render(); });
      await h.W(500);
      await h.shot('lesen-percubaan-hampir-tamat');
      await h.say('Bila percubaan atau langganan hampir tamat, notis muncul di halaman Utama.');
      await h.hl('.act-item', 1500);
      await h.say('Harga: RM20 sebulan, atau RM200 setahun (jimat RM40).');
      await pg.evaluate(() => { window.open = () => null; });
      await h.click('button.pill.red, [data-act="openBuy"]', { after: 900 });
      await h.say('Klik Langgan. Dalam borang BCL, isi e-mel Google yang SAMA dengan e-mel log masuk.');
      await h.say('Selepas bayar, lesen aktif sendiri dalam beberapa minit.');
      await pg.evaluate(() => { UI.prefs.license = { email: '', ok: true, plan: 'bulanan', expires: TT.addDays(TT.todayISO(), -3), checkedAt: Date.now() }; UI.render(); });
      await h.W(500);
      await h.shot('lesen-tempoh-ihsan');
      await h.say('Terlepas tarikh? Langganan ada tempoh ihsan 7 hari.');
      await pg.evaluate(() => { UI.prefs.license = { email: '', ok: true, plan: 'bulanan', expires: TT.addDays(TT.todayISO(), -12), checkedAt: Date.now() }; UI.render(); });
      await h.W(500);
      await h.shot('lesen-tamat');
      await h.say('Bila tamat, data TIDAK dipadam. Ia kekal dalam pelayar dan Google Sheet sekolah.');
      await h.end('Terima kasih. WhatsApp 011-2087 9149');
    }
  },
  {
    id: 'V14', file: '14-masa-berbeza-setiap-hari', title: 'Masa berbeza setiap hari', sub: 'Sesi petang atau sekolah yang jam waktunya tidak sama setiap hari',
    async run(h) {
      const { pg } = h;
      await h.title('Masa berbeza setiap hari', 'Untuk sekolah yang jam waktunya tidak sama setiap hari, contoh sesi petang');
      await h.nav('tetapan', { after: 500 }); await h.tab('setTab', 'waktu');
      await h.say('Sesetengah sekolah, terutama sesi petang, mula pada jam berbeza setiap hari.');
      await h.scrollTo('input[data-chg="perDayTime"]', 900);
      await h.shot('masa-hari-suis');
      await h.say('Tetapan, tab Waktu & rehat. Tandakan "Masa berbeza setiap hari".');
      await h.click('input[data-chg="perDayTime"]', { after: 900 });
      await h.scrollTo('table.daytimes', 1000);
      await h.shot('masa-hari-editor');
      await h.say('Jadual hari dan waktu muncul. Isi jam mula dan tamat bagi setiap hari.');
      await h.click('button[data-act="dayTimeCopy"]', { after: 500 });
      await h.say('Tekan "Salin Isnin ke semua hari", kemudian ubah hari yang berbeza sahaja.');
      await h.hover('input[data-chg="dayTime"][data-d="2"][data-i="0"][data-f="start"]', 500);
      await pg.fill('input[data-chg="dayTime"][data-d="2"][data-i="0"][data-f="start"]', '06:50');
      await pg.dispatchEvent('input[data-chg="dayTime"][data-d="2"][data-i="0"][data-f="start"]', 'change');
      await h.say('Contoh: Rabu waktu 1 mula 6:50 pagi.');
      await h.click('input[data-chg="dayOff"][data-d="3"][data-p="0"]', { after: 600 });
      await h.shot('masa-hari-tiada-kelas');
      await h.say('Tanda "tiada kelas" untuk waktu yang tidak digunakan, contoh Khamis waktu 1.');
      await h.nav('jadual', { after: 600 });
      await h.click('button[data-act="generate"]', { after: 600 });
      await pg.selectOption('#gMode', 'fresh'); await pg.selectOption('#gEffort', '2000');
      await h.click('button[data-act="genStart"]', { after: 600 });
      await pg.waitForFunction(() => !document.querySelector('.overlay') && UI.lastGen, null, { timeout: 20000 }).catch(() => {});
      await h.W(700);
      await h.shot('masa-hari-jadual');
      await h.say('Jana jadual semula. Penjana tidak akan meletak pelajaran pada waktu tiada kelas.');
      await h.say('Setiap petak kini tunjuk jam hari itu. Cetakan, Excel, slip dan relief WhatsApp pun guna jam yang sama.');
      await h.end('Seterusnya: Relief, guru berlainan untuk waktu berganda');
    }
  },
  {
    id: 'V15', file: '15-relief-pecah-waktu-berganda', title: 'Relief: guru berlainan untuk waktu berganda', sub: 'Pecah Waktu 1-2 kepada dua guru dan had waktu berturut-turut',
    async run(h) {
      const { pg } = h;
      await h.title('Relief: guru berlainan untuk waktu berganda', 'Pecah Waktu 1-2 kepada dua guru, dan had waktu berturut-turut');
      await h.nav('tetapan', { after: 500 }); await h.tab('setTab', 'relief');
      await h.scrollTo('input[data-k="maxStreak"]', 900);
      await h.shot('relief-tetapan-pecah');
      await h.say('Masalah: pelajaran berganda diberi kepada seorang guru ganti, dan guru boleh jadi 3 atau 4 waktu berturut-turut.');
      await h.say('Tetapan, Peraturan relief. Isi "Had waktu berturut-turut" dengan 2.');
      await h.type('input[data-k="maxStreak"]', '2');
      await pg.dispatchEvent('input[data-k="maxStreak"]', 'change');
      await h.say('Kemudian tandakan "Pecah pelajaran berganda".');
      await h.click('input[data-k="splitDouble"]', { after: 700 });
      const tid = await pg.evaluate(() => { const s = UI.state, m = TT.maps(s); const pl = s.placements.find((p) => p.day === 0 && p.len >= 2 && m.lesson.get(p.lessonId).teacherIds.length === 1); return pl ? m.lesson.get(pl.lessonId).teacherIds[0] : null; });
      await h.nav('relief');
      await h.click('button[data-act="absenceAdd"]', { after: 900 });
      await h.say('Rekod seorang guru yang ada pelajaran berganda hari ini tidak hadir.');
      if (tid) await h.select('#theForm [name="teacherId"]', tid);
      await h.click('[data-act="formSave"]', { after: 1300 });
      await h.say('Relief yang sudah diagih sebelum tetapan dihidupkan kekal satu blok. Tekan "Kosongkan" dahulu untuk agih semula.');
      await h.click('button[data-act="reliefClear"]', { after: 700 });
      await h.confirmIf();
      await h.click('button[data-act="reliefAuto"]', { after: 1500 });
      await h.scroll(380, 1200);
      await h.shot('relief-pecah-diagih', { wait: 5500 });
      await h.say('Waktu 1 dan Waktu 2 kini dua keperluan berasingan, dengan guru ganti berlainan.');
      await h.say('Guru yang sudah ambil satu waktu pelajaran itu diletak paling bawah. Slip dan WhatsApp ditulis satu waktu setiap guru.');
      await h.end('Seterusnya: Import dari aSc');
    }
  },
  {
    id: 'V16', file: '16-import-pangkalan-data-asc', title: 'Import pangkalan data aSc', sub: 'Guru, kelas, subjek dan pelajaran dalam satu fail Excel',
    async run(h) {
      const { pg } = h;
      await h.title('Import pangkalan data aSc', 'Guru, kelas, subjek dan pelajaran dalam satu fail Excel');
      await h.nav('data'); await h.tab('dataTab', 'guru');
      await h.say('Sekolah yang guna aSc boleh import guru, kelas, subjek dan pelajaran sekali gus.');
      await h.click('button[data-act="ascImport"]', { after: 900 });
      await h.shot('import-asc-pintu');
      await h.say('Eksport data aSc ke Excel (tab Pelajaran, Guru, Kelas, Subjek), kemudian pilih fail itu.');
      await h.hl('[data-act="ascPick"]', 1300);
      await pg.setInputFiles('#ascFile', { name: 'pangkalan-data-asc.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fakeAsc() });
      await h.W(1800);
      await h.shot('import-asc-pratonton');
      await h.say('Pratonton: bilangan kelas, guru, subjek dan pelajaran sebelum apa-apa disimpan.');
      await h.scrollDlg(1400);
      await h.shot('import-asc-amaran');
      await h.say('Amaran menyenaraikan apa yang tidak diimport: rehat, perhimpunan dan tugas tanpa kelas.');
      await h.say('Kumpulan seperti PI dan PM, atau lelaki dan perempuan, digabung menjadi satu pelajaran serentak.');
      await h.click('[data-act="ascApply"]', { after: 1800 });
      await h.shot('import-asc-selesai');
      await h.say('Siap. Guru kelas dan subjek setiap guru turut diisi, dan had mengajar guru ikut beban.');
      await h.say('Seterusnya: tetapkan Waktu & rehat, tetapkan perhimpunan di Sekatan serentak, kemudian jana jadual.');
      await h.end('Terima kasih. WhatsApp 011-2087 9149');
    }
  }
];
