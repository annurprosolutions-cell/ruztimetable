# Manuals and tutorial videos

Produce three things before selling: a user manual (public, HTML + PDF), an owner manual (private), and one short video per function. Use real screens from the actual app with demo data, never a customer's data.

## User manual outline (Malay, for customers)
1 Kenali sistem (roles, requirements, demo link) · 2 Mula cepat (5-7 numbered steps) · 3 Log masuk kali pertama (screens) · 4 Skrin utama · 5..N one chapter per function in the order of real work · Storan/backup · Pautan untuk pengguna baca sahaja · Arkib · Langganan dan lesen (prices, how to pay, "use the same Google e-mail", notices, what stops, data never deleted) · Soalan lazim / masalah biasa · Privasi · Senarai video · Hubungi kami.
Style: numbered steps, button names exactly as in the UI, one screenshot per step group with a caption, tip/warning boxes, short sentences. Verify every label against the code before writing it.

## Owner manual outline (private, never in a public repo)
One-page summary · architecture diagram (inline SVG) · accounts and assets table · secrets (names only) and where they live · licence model and KV keys · admin console snippets · payment provider setup and testing · customer lifecycle · daily/weekly/monthly/yearly routine · support SOP table with reply template · deploy and rollback · config fields · Google OAuth/Search Console status · domain/DNS/old hosts · security and rotation · costs and free-tier limits (flag uncertain numbers) · code map · tests and tools · emergency plan · open issues and roadmap.

## Recorder design (`assets/record-template.js`)
- Serve the repo under the real domain inside Playwright with `context.route(/^https:\/\/yourdomain\.com\//, ...)` so screenshots show the real address; no network needed.
- Seed state once (demo data copied into real storage with an admin session) and reuse it through `storageState`.
- Per scene: fresh backend (fake Sheets, in-process licence Worker with Map KV, mocked Google token client, tokeninfo, userinfo, Drive, gviz); fixed clock; `serviceWorkers: 'block'`.
- Two modes from the same scene code: `shot` (no overlay, fast, JPEG screenshots for the manual) and `video` (overlay: caption bar, fake cursor that follows mouse/drag events, click ripple, title and end cards, highlight box; `recordVideo` at 1280x720 or a phone viewport).
- Show print layouts by calling the app's print action with `window.print` stubbed, then `page.emulateMedia({ media: 'print' })`.
- Trim the blank start with ffmpeg `-ss <seconds until ready>` and encode H.264 (`-crf 20 -pix_fmt yuv420p -movflags +faststart`). Record one scene at a time: three parallel recordings on 4 CPUs starved the input events and added 10-25 s of frozen screen per video. Screenshot mode can run fast and sequentially too.
- Check each video before sending: total length, and a 1 fps contact sheet of the first 20 s (`ffmpeg -t 20 -i v.mp4 -vf fps=1,scale=400:-1,tile=6x4 -frames:v 1 sheet.jpg`). A static stretch with no caption change means a helper waited on something.
- Pace for ~60 s: caption time about 50 ms per character (min ~2.3 s), clicks 0.8 s, title card 2.7 s, end card 2.3 s. Give every wait helper a short timeout; one missing selector with a default 30 s wait adds half a minute.
- Scenes that need prior state (e.g. a shared data sheet before showing the phone view) get a `prep()` that runs unrecorded in the same backend and returns the URL to open.

## PDF and single-file HTML (`scripts/build_manual.js`)
`node build_manual.js manual.html manual.pdf manual-single.html` - A4 with page numbers in the footer, print CSS (`h2 { page-break-before: always }`, `figure { break-inside: avoid }`, `print-color-adjust: exact` for coloured boxes), and a copy with images embedded as base64 so the HTML can be sent as one file. Inter is installed in the sandbox; check pages with `pdftoppm -r 40` and a contact sheet before sending.

## Publishing
- Put the user manual in a public folder of the site (e.g. `/panduan/`) with `img/` and the PDF; link it from the app's Help page and landing page.
- Videos (2-5 MB each) are better on YouTube (unlisted) or a CDN than in git; list them in the manual.
