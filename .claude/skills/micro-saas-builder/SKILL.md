---
name: micro-saas-builder
description: Build, launch and document a small paid subscription web app (micro-SaaS) for Malaysian customers, using the proven Annur Time Table stack - static PWA with no build step, customer data kept in the customer's own Google Sheets (drive.file), Cloudflare Workers hosting, a licence Worker with KV (free trial, monthly/yearly plans, admin console), automatic payments through BCL/Bayarcash webhooks, mocked end-to-end tests, user and owner manuals (HTML + PDF) and 1-minute tutorial videos recorded with Playwright. Use this skill whenever the user wants to start a new "sistem" or app they will sell or charge for, add licensing/trial/subscription/BCL payments to an app, plan pricing and launch for schools, shops, clinics or agencies, or produce manuals and tutorial videos for a web app - even if they never say "SaaS".
---

# Micro-SaaS builder (cara Annur Time Table)

This skill captures how Annur Time Table (school timetable + relief system, annurtimetable.com) was planned, built, sold and documented, so the next system can reuse the same decisions instead of rediscovering them. Reference implementation: GitHub `annurprosolutions-cell/ruztimetable` (public). Read its `worker/index.mjs`, `tests/e2e.js` and `tools/manual/` when you need working code.

The owner is a solo Malaysian founder (AnnurPro Solutions). Talk to them in casual Malaysian Malay with English technical terms, give dashboard instructions click by click, and never ask them to paste secrets (admin tokens, API keys, webhook keys) into the chat - tell them where to paste it instead.

## Why this stack

| Need | Choice | Reason |
|---|---|---|
| App | Static PWA, vanilla JS modules, no bundler | Nothing to build or break; deploy = git push; works offline via service worker |
| Customer data | Browser localStorage + Google Sheet in the customer's own Drive | No customer database to secure or pay for; PDPA risk stays low; customer feels ownership; sheet doubles as backup and export |
| Google scope | `openid email https://www.googleapis.com/auth/drive.file` | Non-sensitive scopes, so no paid CASA security audit; app can only touch files it created |
| Hosting | Cloudflare Workers with static assets (+ custom domain) | Free tier is enough; auto deploy from GitHub; edge code where needed |
| Licensing | Separate Cloudflare Worker + KV namespace | Tiny API (`/check`, `/admin`, `/bcl/<key>`), near-zero cost, easy to inspect |
| Payments | BCL (bcl.my / Bayarcash) form + webhook | FPX and cards in RM, quantity, direct debit; webhook verified through BCL API |
| Read-only users (e.g. teachers) | Second "Data" sheet shared "anyone with link", read via gviz CSV | No accounts for end users; one link in a WhatsApp group |

Pick something else only for a real reason: many concurrent editors on the same record, data that must not live in the customer's Drive, or heavy server-side processing (then consider Supabase/Firebase and accept the cost and security work).

## Workflow

### 1. Discovery (one message, then decide)
Ask only what changes the design: who pays vs who uses, what tool it replaces and its price, data sensitivity (student/patient data?), offline needs, how many users per customer, the deadline and selling season, and pricing. Then present a short decision list (positioning, data storage, pricing, trial length, payment flow, phases) and let the owner confirm before building. For schools: sell in Nov-Dec for the next school year; RM20/month or RM200/year with a 14-day trial worked.

### 2. Build order
Build in this order so every step is testable on its own:
1. **Data model + `migrate()`**: one state object, versioned; every new field gets a default in `migrate` so old saves and old Sheets keep loading.
2. **Core logic as pure functions** (`TT.*`-style namespace usable from browser and Node) with `node --test` unit tests. Keep UI out of it.
3. **UI** with a single `render()` and `data-act` click delegation (`actions[name](el)`), roles (admin vs read-only), demo mode `/?demo` with sample data and no Google.
4. **Admin gate**: Google sign-in first, local admin password (PBKDF2 hash), 30-day device session, setup wizard (name, password, start with sample / empty / import).
5. **Google Sheets sync**: create the sheet, autosave with debounce, status pill (Saved / Saving / Reconnect / Conflict / No licence), conflict dialog when the sheet changed elsewhere (never overwrite silently), JSON export/import as extra backup.
6. **Licence client**: `POST /check` with the Google access token on sign-in; cache the last good answer for 7 days so a Worker outage never locks customers out; notices on the home page (trial days left, 14 days before expiry, grace, expired) with a Subscribe button to the BCL form.
7. **Licence Worker** (see `references/licence-worker.md`): trial on first check, admin endpoints, BCL webhook, slug/pretty links if needed.
8. **Payments** (see `references/bcl.md`): form with monthly and yearly items, a custom field for the Google e-mail used in the app, webhook, RM1 end-to-end test.
9. **Read-only end-user view** (phone first), install-to-home-screen, notifications.
10. **Hosting and domain** (see `references/google-cloudflare.md`): Workers static assets, `.assetsignore`, custom domain, old-host redirect, privacy page, OAuth production + branding verification.
11. **Docs and videos** (see `references/manuals-videos.md`).

Keep the free tier honest: what stops after trial/expiry should be the cloud features (Sheets sync, shared links), never the customer's local data. Say clearly in the app and manual that data is not deleted.

### 3. Testing that does not touch real accounts
- Unit: `node --test tests/*.test.js tests/*.test.mjs`, including the licence Worker (import its `handle(request, env, deps)` and pass a Map-backed KV and a fake `fetch` for Google tokeninfo and BCL).
- End to end: Playwright with a fixed clock (`page.clock.setFixedTime`), `serviceWorkers: 'block'` (otherwise route mocks are bypassed), `config.js` rewritten by `page.route` to a fake client id and licence URL, `window.google.accounts.oauth2` mocked in an init script, Sheets API answered by an in-memory fake, and the licence Worker run in-process behind `page.route('https://lesen.test/**')`.
- Avoid time-based assertions (optimisers that "improve for N ms" make tests flaky; pass 0 in tests).
- Never commit real customer files (e.g. an aSc export with real teacher names) - the repo may be public. Keep them in a scratch folder.

### 4. Deploy
- App: push to `main`; Cloudflare Workers Builds deploys in ~30 s. Bump `version` in config and the service worker `CACHE` name on every release so clients refresh.
- Licence Worker: either `wrangler deploy` or paste `worker/index.mjs` into the dashboard editor and Deploy (the owner did the latter). Keep `wrangler.toml` in the repo as documentation of vars, and set secrets in the dashboard (`ADMIN_TOKEN`, `BCL_WEBHOOK_KEY`, `BCL_API_TOKEN`).
- Verify live behaviour yourself where the network allows (custom domains may be blocked from the sandbox; the `*.workers.dev` host usually works).

### 5. Launch checklist
- [ ] RM1 real payment through the BCL form activates the right e-mail within a minute
- [ ] BCL webhook logs show 200; test transactions ignored unless `BCL_ACCEPT_TEST=1`
- [ ] OAuth consent screen in Production, privacy URL on the custom domain, Search Console domain verified, branding verification submitted (logo after name approval)
- [ ] Trial, expiry, grace and "not licensed" notices checked with screenshots
- [ ] Demo mode works without sign-in; survey/feedback path works
- [ ] User manual published at `/panduan/` (HTML + PDF), videos uploaded, support WhatsApp + e-mail in the app
- [ ] Owner manual kept private (not in a public repo), secrets in a password manager, 2FA everywhere
- [ ] Old hosts redirect to the new domain; keep them alive

### 6. Operate
Give the owner browser-console snippets for the licence admin API (list, add months, set expiry, domain licence, delete key) instead of asking them to install tools. Weekly: compare BCL transactions with licences, resend failed webhooks (BCL never retries), follow up trials ending soon. Yearly: renew the BCL API token before it expires, rotate the admin token, renew the domain.

## Lessons that cost time (do these right the first time)
- **Months arithmetic**: anchor the day of month (store `day`) so 31 Jan + 1 month = 28/29 Feb and the next renewal returns to the 31st; multiply months by item quantity; extend from the current expiry when still active.
- **Trial tests**: a Worker that auto-starts trials makes "not licensed" tests pass for the wrong reason; set `TRIAL_DAYS: '0'` where denial is expected.
- **Idempotency**: store `bcl:<order>` before extending so a resent webhook never adds time twice.
- **BCL MCP form update** needs the field `price` (not `amount`).
- **Cloudflare static assets** answer `/index.html` with a 307 to `/`; cache `./` in the service worker, not `index.html`, and only cache `res.ok && !res.redirected`.
- **Pretty paths** like `/s/<name>`: inject `<base href="/">` at the edge with HTMLRewriter (`run_worker_first: ["/s/*"]`); a `document.write` base tag runs too late for the preload scanner.
- **drive.file** only sees files the app created; searching by title can match the wrong file, so give archive/other sheets titles that never contain the master sheet's title.
- **Popups**: Google sign-in must be triggered directly by a click, or browsers block it.
- **Webhook security**: BCL webhooks are unsigned; keep a long random key in the URL path and always re-fetch the transaction from the API (status success, amount and order match) before granting anything.
- **Videos**: Playwright's `locator.evaluate` waits up to 30 s when a selector is missing; always pass a short timeout in recording helpers or videos balloon. Record scenes one at a time; parallel recording starves CPU and leaves 10-25 s of frozen screen.

## Bundled files
- `references/licence-worker.md` - endpoints, KV keys, rules, admin console snippets.
- `references/bcl.md` - BCL form, webhook, verification API, direct debit, testing.
- `references/google-cloudflare.md` - OAuth, verification, DELIMa, Workers static assets, domains, redirects.
- `references/manuals-videos.md` - manual outlines (user and owner), recorder design, PDF build.
- `scripts/build_manual.js` - HTML manual to A4 PDF + single-file HTML with embedded images (Playwright).
- `assets/record-template.js` - Playwright recorder (captions, fake cursor, title cards, screenshot mode, ffmpeg) with mocked Google/Sheets/licence backend; adapt the scenes and selectors to the new app.
