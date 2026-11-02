# Licence Worker (Cloudflare Worker + KV)

Working reference: `worker/index.mjs` in `annurprosolutions-cell/ruztimetable`. Export a pure `handle(request, env, deps)` so tests can call it with a Map-backed KV and fake `fetch`.

## Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/check` | Google access token (Bearer) | Validate token via `https://oauth2.googleapis.com/tokeninfo` (audience must equal `GOOGLE_CLIENT_ID`, e-mail verified), find licence, start trial if none. Returns `{ok, email, school, plan, expires, daysLeft, reason, buyUrl}` |
| GET | `/admin/licenses[?semua=1]` | `Bearer ADMIN_TOKEN` | List active licences; `semua=1` adds trials, payments, mandates, 90-day logs |
| POST | `/admin/licenses` | admin | `{email or domain, school, plan, expires}` or `{email, addMonths: 1..120}`; reject a licence with no expiry |
| DELETE | `/admin/licenses?key=<kvkey>` | admin | Remove any key (licence, trial marker, slug) |
| POST | `/bcl/<BCL_WEBHOOK_KEY>` | secret in path | BCL webhook; respond fast and process in `ctx.waitUntil` |
| GET | `/slug/<name>` | origin allow-list | Pretty link lookup `{ok, gid, school}`; 404 `tiada` / `lesen-tamat` |
| GET | `/stats` | public | Counts only: `{paid: n or null, trial, min}`. `paid` is hidden (null) until it reaches `STATS_MIN` (5) so small numbers never hurt trust; owner/test accounts listed in `STATS_EXCLUDE` are not counted; cached in KV (`stats:cache`) for `STATS_TTL` seconds |
| GET | `/admin/overview` | admin | Every record with computed status plus `stats` (paid active, trials, MRR, 30-day revenue, trial-to-paid conversion, failed webhooks) for the owner dashboard |
| POST | `/admin/licenses` + `merge:true` | admin | Change only `school`, `plan` or `expires`, keeping other fields (`day` is recomputed from the new date) |
| POST/DELETE | `/slug` | Google token, paid plan | Claim/rename (409 taken, 429 too soon: one free rename then once per 30 days) / release |

CORS: only origins in `ALLOWED_ORIGINS`; methods `GET, POST, DELETE, OPTIONS`; `cache-control: no-store` on lookups.

## KV keys
| Key | Value |
|---|---|
| `email:<email>` | `{school, plan, expires, day, updatedAt}`; plan `percubaan` (trial), `bulanan`, `tahunan`, `pilot`... |
| `domain:<domain>` | Same shape, for whole Workspace domains |
| `trial:<email>` | Date the trial was granted (marker that stops repeat trials) |
| `bcl:<order>` | Processed payment record (idempotency) |
| `bcl:dd:<ref>` | Processed direct-debit deduction |
| `mandate:<order>` | Direct-debit enrolment `{email, plan}` |
| `slug:<name>`, `slugof:<email>` | Pretty link mapping |
| `log:<ts>` | Webhook log, `expirationTtl` 90 days |

## Rules
- Lookup order: `email:` then `domain:`; if none and no `trial:` marker and `TRIAL_DAYS > 0`, create `email:` with plan `percubaan`, expiry today + TRIAL_DAYS - 1, and write the marker.
- Grace: `GRACE_DAYS` (7) after expiry for paid plans only; trial ends hard.
- Extend: from current expiry if still active, else from today; anchor the day of month (`day`); months = per-item months x quantity, capped 120 per item.
- Plan detection from BCL items: match item names (monthly vs yearly); fall back to amount >= `YEARLY_MIN_AMOUNT` (150) = 12 months.
- Payment e-mail: prefer a custom field containing an e-mail, else the payer e-mail. School name from a custom field when present.
- Only accept the configured form (`BCL_FORM_ID`); ignore test transactions unless `BCL_ACCEPT_TEST=1`.
- Never trust the webhook body for money: re-fetch the transaction (see `bcl.md`).

## Owner dashboard (`/admin/` page on the app site)
Static page that calls `/admin/*` on the licence Worker. Admin auth accepts either `ADMIN_TOKEN` or a Google access token whose verified e-mail is in `OWNER_EMAILS` (so the owner never pastes secrets into a console again). CORS for `/admin/*` follows `ALLOWED_ORIGINS`. Tabs: customers (search, filter, edit, +1/+3/+12 months, move to another e-mail, delete, add, CSV), needs action (trials ending, renewals, failed webhooks with mailto links), payments, webhook log, slugs, performance (link to Cloudflare metrics). Store the payment `amount` in `bcl:<order>` records from day one, otherwise revenue cannot be shown for old payments. Usage analytics are deliberately absent: the app never sends school data to the vendor.

## Env
Secrets: `ADMIN_TOKEN`, `BCL_WEBHOOK_KEY`, `BCL_API_TOKEN`. Vars: `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`, `TRIAL_DAYS`, `GRACE_DAYS`, `BUY_URL`, `BCL_FORM_ID`, `YEARLY_MIN_AMOUNT`, `OWNER_EMAILS`, `STATS_EXCLUDE` (set it to the owner's own e-mail or the counter counts the owner), optional `STATS_MIN`, `STATS_TTL`, `PRICE_MONTH`, `PRICE_YEAR`, `BCL_ACCEPT_TEST`, `BCL_API_URL`. Binding: KV `LICENSES`.

## Admin console snippets (owner pastes in Chrome DevTools on the Worker URL)
```js
const T = 'ISI_ADMIN_TOKEN';
const A = (p, o = {}) => fetch(p, Object.assign({ headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' } }, o)).then((r) => r.json()).then((x) => (console.log(x), x));
A('/admin/licenses');                                   // list
A('/admin/licenses?semua=1');                           // everything incl. payments and logs
A('/admin/licenses', { method: 'POST', body: JSON.stringify({ email: 'x@gmail.com', school: 'SMK X', addMonths: 12 }) });
A('/admin/licenses', { method: 'POST', body: JSON.stringify({ email: 'x@gmail.com', plan: 'tahunan', expires: '2027-12-31' }) });
A('/admin/licenses?key=' + encodeURIComponent('email:x@gmail.com'), { method: 'DELETE' });
```
Moving a licence to a new e-mail: read old expiry, POST the new e-mail with the same `expires`, DELETE the old key.

## Client side
- Call `/check` after Google sign-in; store `{email, ok, plan, expires, checkedAt}`; if the Worker is unreachable, allow cloud features for 7 days from the last good check for the same e-mail.
- Messages per `reason`: `tiada` (no licence), `tamat` (expired), `percubaan-tamat`, `token-tidak-sah`.
- Home-page notices: trial (info >7 days, warning <=7, urgent banner <=3), paid (warning <=14 days, urgent <=3), grace (urgent), expired/denied (critical), each with a Subscribe/Renew button opening `buyUrl` in a new tab (`noopener`).
