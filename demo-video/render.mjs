// node render.mjs full demo.mp4   (perlukan ffmpeg); PAGE=tutorial.html node render.mjs full out/tutorial.mp4
// node render.mjs stills                          (snapshot ke stills/ untuk semak layout)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
const [,, mode, out = 'demo.mp4'] = process.argv;
const PAGE = process.env.PAGE || 'demo.html'; // PAGE=tutorial.html untuk video tutorial
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + process.cwd() + '/' + PAGE, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const dur = await page.evaluate(() => window.DURATION);
if (mode === 'stills') {
  fs.mkdirSync('stills', { recursive: true });
  // tanpa argumen: satu gambar bagi setiap babak, pada ~80% tempoh babak (selepas animasi masuk selesai)
  const segs = await page.evaluate(() => window.SEGS);
  const times = process.argv.slice(3).length ? process.argv.slice(3).map(Number) : segs.filter(([a, b]) => b - a > 0.6).map(([a, b]) => +(a + 0.8 * (b - a)).toFixed(2));
  for (const t of times) {
    await page.evaluate((t) => window.setT(t), t);
    await page.screenshot({ path: `stills/s_${String(t).padStart(5, '0')}.png` });
  }
} else {
  const fps = 30, n = Math.round(dur * fps);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.setT(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
if (errors.length) console.error('RALAT HALAMAN:', errors);
await browser.close();
