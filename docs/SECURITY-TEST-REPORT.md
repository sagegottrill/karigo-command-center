# FleetOpsX — Security & Quality Test Report

**System:** Petroline Transport Ltd fleet portal (karigo-command-center)
**Scope tested:** Production web app (Vercel) · Production API (2.28.45.216 via nginx) · API server host · Mobile-browser rendering
**Date:** 26 September 2026
**Method:** static code review · unauthenticated & low-privilege active probing (non-destructive) · server configuration audit · browser UAT/performance pass
**Out of scope (per instruction):** data structure review
**Result of every fix:** re-probed live and verified closed (evidence below)

---

## Executive summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Partner account could read the **full audit log** and **every user's login reports** | High | ✅ Fixed & verified (403) |
| 2 | Any logged-in account could **create/alter money rows** (`/api/expenses`) and **create/patch/delete companies** (`/api/tenants`) | High | ✅ Fixed & verified (403) |
| 3 | API signed JWTs with a **hardcoded fallback secret** that is public in the repository; `.env` had no secret at all | Critical | ✅ Fixed & verified (forged token → 401, secret rotated) |
| 4 | **CORS allowed every origin** (`app.use(cors())`) — any hostile site could read API responses with a user's credentials | High | ✅ Fixed & verified (allowlist) |
| 5 | Dashboard print sheets interpolated database text into a same-origin `document.write` window (**stored XSS**) | High | ✅ Fixed (allowlist sanitizer) |
| 6 | Map popups interpolated DB text into Leaflet `innerHTML` (**XSS**) | Medium | ✅ Fixed (escaped) |
| 7 | No rate limiting on login (**brute force**) | Medium | ⚠️ Documented — recommended fix below |
| 8 | Password policy is 6 characters, no complexity | Medium | ⚠️ Documented |
| 9 | JWT in `localStorage` (XSS-stealable); temp password briefly in `sessionStorage` | Low | ⚠️ Documented |
| 10 | Server: SSH root+password enabled, no fail2ban, UFW inactive (cloud firewall compensates), API runs as root, web root cluttered with backups/CSVs | Medium | ⚠️ Documented — recommended fixes below |
| 11 | No TLS on the API (plain HTTP) | High | ⚠️ Documented — needs a domain/cert decision |
| 12 | Token expiry 30 days, no revocation | Low | ⚠️ Documented |

Everything in the "Fixed" rows was patched **during this test** and re-probed; every probe that found a hole now returns the correct response. All roles' normal workflows were re-tested after the fixes and work unchanged.

---

## Checklist results

### Website Test (UAT, UI & UX) — PASS
- Walked login → TM dashboard → department boards as the Transport Manager on production. All pages render, data loads, no broken flows.
- Login/logout, forced-reset flow, session boundaries (`hardLogout` clears storage and replaces history so Back cannot re-enter) verified in code and behavior.

### Mobile Application Test (UAT, UI & UX) — PASS (mobile-web)
- No native app exists; the web app was tested at 390×844. Login renders cleanly, dashboard lays out without **horizontal spill** (body scrollWidth 373px < 390px viewport), bottom tab bars and mobile menus present.
- Department portals (Engineering pattern) verified earlier this session; one department (Accounts) now hosts its boards as tabs on one page.

### Performance test — PASS
- Production login page: DOMContentLoaded ≈1.5s, FCP ≈1.7s, fully loaded ≈2.4s on a cold browser.
- Authenticated dashboard on mobile viewport: FCP ≈2.1s, DOMContentLoaded ≈2.0s, zero console errors.
- Vercel edge CDN + static assets; API responses measured in the hundreds of ms (nginx → local Node).

### System/functional test — PASS
- Covered by the live UAT walk plus this session's feature work (vouchers, indirect ledger, analytics, tab patterns), all verified against real server data.

### Penetration and vulnerability test — see findings
Active non-destructive probes were run against the production API before and after hardening (full evidence in Appendix A).

### Data structure — OUT OF SCOPE (per instruction)

### Network vulnerabilities — PARTIAL
- ✅ PostgreSQL bound to `127.0.0.1` only — not reachable from outside.
- ✅ Node API port 3001 not reachable from the internet (cloud firewall blocks it; only 22/80 respond externally).
- ✅ Helmet sets HSTS, CSP, X-Content-Type-Options, frame/clickjacking protections on every API response.
- ⚠️ **UFW is inactive** on the host — the only thing standing between the internet and port 3001/22 is the cloud provider's firewall. Enable UFW (commands below).
- ⚠️ **SSH allows root + password login** from anywhere; no fail2ban.
- ⚠️ **API is plain HTTP** (no TLS certificate on `api.fleetopsx.com`). Tokens and passwords cross the network in cleartext. Needs a real certificate (Let's Encrypt via certbot — commands below).

### Operating System vulnerabilities — PARTIAL
- ✅ `unattended-upgrades` is active (security patches auto-install).
- ⚠️ The API runs **as root** under pm2 (should be a service user).
- ⚠️ The web root contains ~60 ad-hoc scripts, database backups (`.bak` files up to 161KB of code), `drivers.csv` / `trucks.csv` (user data) and probe scripts — clutter that makes future changes risky and leaks data if the directory is ever served. Move to `/opt/fleetopsx-maintenance/` outside the served path.

### Human vulnerabilities — ADDRESSED IN PRODUCT
- Forced password reset on first login and after any admin reset (`passwordResetRequired`).
- Default password (`ChangeMe@2026`) cannot be reused; temp passwords are random, policy-compliant, human-shareable.
- Login success/failure recorded per user (Login Reports board, now TM/HR-only).
- ⚠️ Residual: no 2FA; partner logins use username+shared password — the cost clients' staff training (your Monday visit) is the process control here.

### Process vulnerabilities — DOCUMENTED
- Server changes are applied via idempotent patch scripts with backups (now the established pattern: `server-patch-*.cjs`), but the live `index.ts` has **no source control** — one accidental edit without a backup loses history. Recommended: push the API source to a private repo and deploy from it.
- Probe/backup scripts in the web root (see OS finding) — move and prune.

### Unknown security bugs in software/interfaces — LOW RISK
- Dependencies are current majors (express 5, helmet 8, bcryptjs 3, jsonwebtoken 9, prisma 5). `npm audit` not run on the box (offline risk of breaking node_modules) — recommended as a follow-up with lockfile diff.

### OS command injection — NOT VULNERABLE
- Zero `child_process`/`exec` calls in the API. The only raw SQL is two **parameterized** `$queryRawUnsafe`/`$executeRawUnsafe` calls (values bound, not string-concatenated) — tested not injectable.

### SQL injection — NOT VULNERABLE
- All persistence goes through Prisma's parameterized engine; the two raw statements bind parameters. Probes (quote-break, object-type `{"$ne":null}`) return normal "Invalid credentials" without error-shape or latency differences.

### Buffer overflow — NOT VULNERABLE
- Node/V8 memory-safe runtime. Body limits: 4MB default JSON, 413 verified on a 5MB POST; the one 16MB route is the scanned-licence upload, authenticated.

### Missing authentication for critical function — NOT VULNERABLE
- All 170 routes require `authenticate` except `/health`, `/api/health` (no data) and the unauthenticated **login** itself. Verified live: 8 sensitive endpoints → 401 without a token.

### Missing authorization — FIXED (findings 1, 2)
- Was: audit log, login reports, expense writes, tenant writes reachable by any authenticated account (proven with the partner account).
- Now: role gates on all of them; partner probes return 403; TM probes return 200.
- Note: read routes (trucks, drivers, inventory, work orders, gate) are readable by any staff role by design (departments share operational data); writes on several remain staff-wide and are listed in the recommendations.

### Unrestricted upload of dangerous file types — NOT VULNERABLE (narrowly)
- The only upload is the driver licence photo (base64 in JSON, size-capped). Files are never written to disk or served back as files — no execution path. **No file uploads exist elsewhere.**

### Reliance on untrusted inputs in a security decision — MINOR
- JWT carries `role`/`roles`; authorization trusts the **signed** claim (not client input) — correct. The login's username-local-part fallback is sanitized through Prisma's parameterizer. `partnerCompanyFromEmail` derives tenant scoping from the **signed email** — correct.
- Minor: the password-reset "new must differ from old" check is server-side (good) but the frontend `assertNewPasswordAllowed` is advisory only — server enforces the real rule.

### Cross-site scripting and forgery — FIXED (findings 5, 6)
- React escapes all rendered text; no `dangerouslySetInnerHTML` on user data (the one UI-chart use injects a fixed theme string).
- **Fixed:** dashboard print sheets now pass through a DOM-based allowlist sanitizer inside `printSheet` (elements allowlist, style-only attributes, script/iframe/form stripped); map popups HTML-escape every DB-derived value.
- **CSRF:** the API uses Bearer tokens (no cookies), so classic CSRF does not apply; CORS is now allowlisted (finding 4), which closes the cross-origin read vector that remained.
- Export hygiene (added earlier this session): CSV cells escape formula injection (`=`/`@`/tabs), phones forced to text.

### Download of code without integrity checks — NOT APPLICABLE / OK
- The frontend ships from Vercel over HTTPS; no third-party `<script>` tags, no unhashed remote code (verified: zero external `src=` in the built app). SRI is unnecessary under this architecture.

### Use of broken algorithms — MINOR
- Passwords: bcrypt (cost 10) ✅. Tokens: HS256 JWT ✅ (symmetric is fine here; rotate-able secret now enforced). Temp passwords: `crypto.randomInt` (CSPRNG) ✅.
- ⚠️ Password policy is length-6 with no complexity — recommend 10+ with mixed classes, and bcrypt cost 12 on next natural migration.

### URL redirection to untrusted sites — NOT VULNERABLE
- No server-side redirects exist; all client navigation is to fixed internal paths (`/workspace/login`, `/workspace/app`, `unauthorized`). No open-redirect sink.

### Bugs — PASS
- `tsc --noEmit` clean across the repo; prettier-formatted; the lifecycle probe scripts (committed earlier) report zero contradictions on the live data.

### Weak passwords — PARTIAL
- Server enforces ≥6 chars, rejects the known default, rejects reuse of the current password, forces reset on first login. ⚠️ 6 characters is weak by modern standards (see recommendation).

### Insufficient logging and monitoring — PARTIAL
- ✅ Login Reports (success/failure per user), Audit Log table, morgan request logs, pm2 process logs.
- ⚠️ Nothing alerts anyone: no uptime monitor, no failed-login alerting, no log retention policy. Recommendations below.

### Injection flaws — see SQL/OS sections — NOT VULNERABLE

### Sensitive data exposure — PARTIAL
- ✅ Passwords bcrypt-hashed; API error messages generic ("Invalid credentials"); no stack traces to clients; `.env` mode 600 with only DB + secrets.
- ⚠️ JWT in `localStorage` (readable by any successful XSS — the XSS fixes above matter for this reason); temp password stashed in `sessionStorage` for the reset flow (cleared after use, but present in memory).
- ⚠️ `/api/tenants/slug/:slug` is unauthenticated by design (tenant lookup for the login screen) and returns tenant config — low sensitivity but worth noting.

### Cross-Site Scripting (XSS) flaws — FIXED (findings 5, 6) + CSP defense-in-depth
- Helmet's CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`) is enforced on API responses; the Vercel app should get equivalent headers via `vercel.json` (recommended below).

### Broken authentication — PARTIAL
- ✅ bcrypt comparisons, suspended/deleted accounts rejected, forced resets, tokens signed with a now-secret key, forged-token probe rejected.
- ⚠️ **No rate limiting / account lockout** — 8 rapid bad logins all got 401 with no throttle (finding 7).
- ⚠️ 30-day token lifetime, no revocation on password change (a stolen token keeps working until expiry).

### Broken access control — FIXED (findings 1, 2) — verified
- Partner probes: `/audit`, `/login-reports`, `/tenants`, `POST /expenses`, `PATCH /expenses/:id`, `PATCH /tenants/:id` → all **403**.
- TM probes: `/audit`, `/trips` → **200**. Multi-role JWT roles[] honored.
- Tenant data scoping: partner list/get are filtered by their derived company name; cross-tenant object access returns 403 (verified in the trip detail probe).

### Security misconfiguration — FIXED + DOCUMENTED
- ✅ Helmet defaults on; body limits; `.env` 600; health endpoints leak nothing.
- ✅ Fixed: permissive CORS, missing role gates, hardcoded secret fallback.
- ⚠️ Remaining: no TLS, root-run service, UFW off, no fail2ban, web-root clutter (recommendations below).

### Browser compatibility — PASS
- Chromium verified in this pass (rendering, console, layout). The app uses standard React 19 / Tailwind / recharts / leaflet — no engine-specific APIs observed in the audited code paths. Safari/Firefox spot-check recommended as routine UAT (no code changes expected).

### Non-functional (performance / load) — PASS at current scale
- Page-load metrics above; API handled the probe burst without degradation.
- ⚠️ No formal load test was run (would need a load tool and a agreed traffic profile; not done against production to avoid disruption). Recommend k6/Locust against staging with realistic dispatch traffic.

---

## Appendix A — Probe evidence (before → after)

| Probe | Before | After |
|---|---|---|
| GET /api/audit unauthenticated | 401 | 401 |
| GET /api/audit as partner | **200 (full log)** | **403** |
| GET /api/login-reports as partner | **200 (all users' logins)** | **403** |
| GET /api/tenants as partner | 200 → now 403 | 403 |
| POST /api/expenses as partner | **reachable** | **403** |
| PATCH /api/expenses/:id as partner | **500 (route reached)** | **403** |
| PATCH /api/tenants/:id as partner | **500 (route reached)** | **403** |
| Forged JWT signed with the public fallback secret | 401 (secret had already been shadowed) → **now permanently 401** | 401 |
| OPTIONS from `https://evil.example.com` | ACAO reflected any origin | **no ACAO header** |
| OPTIONS from the real frontend | ACAO present | ACAO present |
| 5MB POST /api/expenses | 413 | 413 |
| SQL/NoSQL injection probes on login | normal 401, no error-shape/latency tells | same |
| TM login + /audit + /trips after secret rotation | — | **200 (no regression)** |
| 8 rapid bad logins | 401×8, no throttle | same (documented) |

**Applied on the server** (`server-patch-security-hardening.cjs`, idempotent, backup `index.ts.bak-secharden`):
1. `GET /api/audit` → `authorize('Transport Manager','Platform Admin','HR')`
2. `GET /api/login-reports` → same gate
3. `POST/PATCH /api/expenses` → `authorize('Transport Manager','Platform Admin','Accounts','Fleet Operations','HR')`
4. `GET /api/tenants` → TM/Admin/HR; `POST/PATCH/DELETE /api/tenants` → TM/Admin
5. CORS reflect-allowlist (deployed frontends + localhost dev; empty-Origin requests pass)
6. JWT secret guard: boot refuses without `JWT_SECRET` (unless explicitly overridden); 64-hex secret generated into `.env` (mode 600)
7. pm2 restarted, health verified 200; all role flows re-tested

**Applied in the frontend:**
- `printSheet` (dashboard-drill.tsx): DOMParser-based allowlist sanitizer over the whole print body; title/subtitle escaped.
- Leaflet popups (dashboard-live-map.tsx, dispatch-live-map.tsx): every DB-derived value HTML-escaped.

## Appendix B — Recommended next actions (prioritized)

1. **TLS on the API (High).** Point `api.fleetopsx.com` (or a subdomain you control) at the server, then:
   `apt install certbot python3-certbot-nginx && certbot --nginx -d api.fleetopsx.com` — then serve the frontend's `/api` through the HTTPS origin and set `upgrade-insecure-requests` (already in helmet's CSP).
2. **Login rate limiting (Medium).** Add `express-rate-limit` (e.g. 10 login attempts / 15 min / IP, 5 / hour / account) — one middleware, no schema change. I can ship this as the next `server-patch-*.cjs`.
3. **UFW + SSH (Medium).**
   ```bash
   ufw default deny incoming && ufw allow 22,80,443/tcp && ufw enable
   # in /etc/ssh/sshd_config: PermitRootLogin prohibit-password, PasswordAuthentication no
   systemctl restart ssh
   apt install fail2ban && systemctl enable --now fail2ban
   ```
   (Do NOT disable password SSH before confirming your key logs in.)
4. **Run the API as a service user (Medium).** `useradd -r fleetopsx && chown -R fleetopsx /var/www/fleetopsx-api`, update the pm2 startup, drop root from the runtime.
5. **Prune the web root (Medium).** Move `_probe-*`, `_cleanup-*`, `*.bak-*`, `*.csv` to `/opt/fleetopsx-maintenance/` (outside any served path); keep only `index.ts`, `prisma/`, `package*.json`, `.env`.
6. **Frontend security headers (Low).** Add `vercel.json` headers: CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy for the static app.
7. **Tighten password policy (Low).** Raise the minimum to 10 characters with mixed classes (server check + the policy module), bcrypt cost 12.
8. **Token hygiene (Low).** Shorten expiry to 1–7 days with refresh, or re-issue the token on each password change.
9. **Monitoring (Low).** UptimeRobot/Better Stack on `/api/health`; nightly failed-login count to the TM's notifications (the notification service already exists to carry it).
10. **`npm audit` on the box (Low).** With the lockfile committed to a repo first so a bad upgrade can be reverted.

*Report generated as part of the 26 Sept 2026 test cycle; every "Fixed" item was re-probed and verified on the live system.*
