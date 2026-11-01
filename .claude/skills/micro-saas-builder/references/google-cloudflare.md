# Google sign-in/Sheets and Cloudflare hosting

## Google Cloud (OAuth)
- Google Identity Services token model (`google.accounts.oauth2.initTokenClient`) from a click handler (popups need a user gesture). Token lasts ~1 h; show a "Reconnect" state instead of failing silently.
- Scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/drive.file`. All non-sensitive: no CASA assessment.
- Sheets API v4 for read/write; Drive API v3 `files.list` (only app-created files are visible), `permissions.create` with `{role:'reader', type:'anyone'}` to share the read-only data sheet; read that sheet without auth via `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<tab>`.
- Consent screen: start in Testing (add test users), switch to Production before selling (any Google account can sign in; unverified-app warning may show until branding is verified).
- Branding verification: needs home page and privacy policy on a domain you own, the domain verified in Google Search Console (DNS TXT), and authorized domains listed. Submit the app name first; upload the logo after the name is approved (a logo triggers extra review).
- Malaysian schools: DELIMa (@moe-dl.edu.my) Workspace admins can block third-party apps ("Access blocked"). Offer a Gmail fallback and ask state admins to trust the client id.
- Privacy page must state: what is stored where, Google user data use complies with the Google API Services User Data Policy including Limited Use, payment data handled by the payment provider.

## Cloudflare Workers with static assets
- `wrangler.jsonc`: `{ "name": "...", "main": "edge/worker.js", "compatibility_date": "2025-06-01", "assets": { "directory": ".", "binding": "ASSETS", "run_worker_first": ["/s/*"] } }`.
- `.assetsignore` keeps tests, tools, worker source, docs, README, package.json and private folders off the public site. Anything not ignored is public (good for `/panduan/`).
- Connect the GitHub repo in Workers Builds: every push to `main` deploys in ~30 s. Roll back from Deployments.
- Custom domain + www on the Worker; keep `*.workers.dev` working for checks.
- Pretty path `/s/<name>`: edge Worker fetches `/` from `env.ASSETS` and uses `HTMLRewriter` to prepend `<base href="/">` in `<head>` so relative assets load; `cache-control: no-cache`.
- `/index.html` is redirected (307) to `/` by the assets layer: service worker should precache `./`, use `caches.match('./')` as navigation fallback, and only cache `res.ok && !res.redirected`.
- Free plan: static asset requests are free; Worker invocations and KV operations have daily limits (check current Cloudflare pricing before promising capacity).

## Moving hosts (Netlify / GitHub Pages to own domain)
- Add `canonicalUrl` and `oldHosts` to config; a tiny `redirect.js` loaded right after config does `location.replace(canonical + path + search + hash)` when `location.hostname` is an old host, and sets a flag so the app does not boot.
- Keep the old hosts alive (they now only redirect). Add the new origins to OAuth JavaScript origins and the licence Worker `ALLOWED_ORIGINS`.

## Sandbox notes for Claude
- The container proxy may refuse custom domains; verify through the `*.workers.dev` host.
- `wrangler dev --local` (workerd) is good for checking the edge Worker before the owner deploys.
