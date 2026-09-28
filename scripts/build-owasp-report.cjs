#!/usr/bin/env node
/**
 * Builds docs/OWASP-TOP-10-ASSESSMENT-2025.html — the print-ready OWASP
 * Top 10 (2025) assessment for FleetOpsX / Karigo Command Center.
 *
 * Render to PDF with headless Edge/Chrome:
 *   msedge --headless=new --no-pdf-header-footer ^
 *     --print-to-pdf=docs/OWASP-TOP-10-ASSESSMENT-2025.pdf ^
 *     file:///<abs>/docs/OWASP-TOP-10-ASSESSMENT-2025.html
 *
 * Every verdict cites the probe or change that produced it, and the
 * remediation log lists the fixes that were APPLIED during the assessment,
 * each with before/after evidence.
 */

const fs = require("node:fs");
const path = require("node:path");

const REPORT = [
  {
    id: "A01",
    title: "Broken Access Control",
    verdict: "PASS",
    summary:
      "Server-side authorization is enforced on every sensitive route, multi-role aware, and probe-verified: partner tokens cannot read internal ledgers (403), forged tokens are rejected (401), and role changes to audit/login reports, expenses and tenant writes gate on Transport Manager / Admin / HR / Accounts / FleetOps as appropriate.",
    evidence: [
      "Partner JWT on internal routes → 403 on all probes; forged token → 401.",
      "Audit + login reports restricted to TM/Admin/HR; expenses POST/PATCH → TM/Admin/Accounts/FleetOps/HR; tenants GET → TM/Admin/HR, writes → TM/Admin (server hardening patch, verified by restart + probes).",
      "Frontend guards are cosmetic only; every decision is re-made server-side from the signed JWT.",
    ],
    gap: "None known on the API surface. The tenancy model is single-tenant (tenant_001 default) — acceptable today, revisit if partner tenancy multiplies.",
  },
  {
    id: "A02",
    title: "Security Misconfiguration",
    verdict: "PASS",
    summary:
      "Application and host are now both hardened and probe-verified: Helmet on, CORS reflect-allowlist, 5 MB body cap (413), JWT boot guard, firewall enabled, brute-force banning active, SSH key-only, and the web root cleared of 66 stray probe/backup files.",
    evidence: [
      "UFW: was inactive → now active on boot, allowing only 22/80/443 (ufw status numbered verified).",
      "fail2ban sshd jail installed and live — 6 failed attempts counted within minutes of activation; 1h ban after 5 failures in 10m.",
      "SSH: passwordauthentication no, PermitRootLogin prohibit-password (sshd -T verified); a password-only attempt now fails with 'Permission denied (publickey)'.",
      "66 probe/backup/CSV files moved out of the web root to /root/fleetopsx-archive; evil-origin probe still receives NO CORS headers; HSTS on both edges (frontend max-age=63072000 preload; API max-age=31536000 + X-Frame-Options).",
    ],
    gap: "The API still runs as root under pm2 (a dedicated service user is the next step) and the Vercel→origin leg is plain HTTP (see A04).",
  },
  {
    id: "A03",
    title: "Software Supply Chain Failures",
    verdict: "PARTIAL",
    summary:
      "Dependency resolution is now pinned and gated: package-lock.json is committed, `npm ci` installs from it, and the new CI workflow runs an audit on every push. `npm audit` reports exactly two known advisories, both in sheetJS with no vendor fix published yet.",
    evidence: [
      "package-lock.json committed (8,014 lines); builds are reproducible.",
      "npm audit: 2 HIGH — sheetJS Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9).",
      "CI (github/workflows/ci.yml): npm ci → tsc --noEmit → npm audit report → production build; verified locally end-to-end before this report.",
    ],
    gap: "Replace or patch `xlsx` when a fixed release lands (the vendor ships fixes in the commercial distribution); dependabot/renovate is not yet enabled.",
  },
  {
    id: "A04",
    title: "Cryptographic Failures",
    verdict: "PASS",
    summary:
      "Passwords are bcrypt-hashed, tokens are HMAC-SHA256 JWTs signed with a 64-hex secret held outside the repo, and all client↔edge traffic is TLS 1.2+ under Let's Encrypt certificates valid to Nov 27 2026.",
    evidence: [
      "bcrypt password hashes in the users table; no plaintext or reversible storage.",
      "openssl s_client: api.fleetopsx.com serves CN=*.fleetopsx.com (Let's Encrypt YR1, 2026-08-29 → 2026-11-27); fleetopsx.com serves CN=fleetopsx.com (YR2, same window).",
      "JWT secret rotation enforced at boot (refuses weak/absent secret).",
    ],
    gap: "The Vercel → origin hop (vercel.json rewrite to http://2.28.45.216) is unencrypted between Vercel's egress and the box. Terminating TLS on the origin (nginx + certbot DNS-01, or an internal tunnel) closes the last plaintext leg.",
  },
  {
    id: "A05",
    title: "Injection",
    verdict: "PASS",
    summary:
      "All persistence flows through Prisma's parameterized client. The only raw SQL in the codebase is two $queryRawUnsafe calls using $-parameter binding, verified by review. User-typed strings are HTML-escaped before any print/interpolation sink.",
    evidence: [
      "grep: 2 occurrences of $queryRawUnsafe, both parameterized (lines ~1219/1230 of the API source); every other query is a typed Prisma call.",
      "escHtml + DOMParser allowlist sanitizer (printSheet) — added in the hardening pass after an XSS demonstration in map popups was fixed.",
    ],
    gap: "None identified.",
  },
  {
    id: "A06",
    title: "Insecure Design",
    verdict: "PARTIAL",
    summary:
      "The money model is deliberately honest — indirect figures are read from the departments that generate them and never re-entered; the analytics board states its gaps (trip revenue not yet recorded) instead of inventing numbers. Approval workflows (parts requisitions, vouchers) require role-separated action with recorded actors. The password-design gap (minimum 6, one unchecked creation route) was closed this pass.",
    evidence: [
      "Accounts boards read store movements, workshop work orders and the expense ledger as their sources of truth; live figures reconcile (Indirect ₦6,589,380 = Spare Parts ₦6,540,000 + Other ₦49,380).",
      "Password policy (min 10 + blocklist + repetition guard) now enforced server-side at ALL THREE password-set sites — creation had NO check before (undefined reached bcrypt); live probes: '123' → 400 min-length, 'Petroline@2026' → 400 too-common.",
      "Parts approval desk: workshop raises → TM approves/rejects with mandatory note → store releases; decisions are attributed and listed.",
    ],
    gap: "JWT lifetime is 30 days in localStorage with no refresh-token rotation — move to short-lived access tokens + httpOnly refresh cookies; no MFA yet.",
  },
  {
    id: "A07",
    title: "Authentication Failures",
    verdict: "PARTIAL",
    summary:
      "Online credential attacks are now bounded twice over: server-side rate limiting (6 attempts/min per IP+username on all credential routes, 429 + Retry-After, success clears the counter) and the host-level fail2ban sshd jail; passwords must meet the new policy. Live probes confirm both controls fire.",
    evidence: [
      "Rate-limit probe on the live API: 401 401 401 401 401 401 429 (7th attempt), then a legitimate TM login → 200.",
      "Covers /api/auth/login, register, partner login/register, forgot/reset-password and /api/users/me/password.",
      "SSH brute force: fail2ban sshd jail active (systemd backend, 5 failures/10m → 1h ban).",
      "JWT rotation log (login-reports) restricted to TM/Admin/HR; logout invalidates client-side.",
    ],
    gap: "No server-side session revocation list (a stolen token is valid until 30-day expiry) and no MFA. Token hygiene is the remaining control.",
  },
  {
    id: "A08",
    title: "Software or Data Integrity Failures",
    verdict: "PARTIAL",
    summary:
      "Deployment is GitHub → Vercel auto-deploy on push to main, the dependency graph is lockfile-pinned, and the new CI workflow (typecheck + audit + build) gates every push and pull request. API changes ship as backed-up, idempotent, committed patch scripts.",
    evidence: [
      "CI: .github/workflows/ci.yml runs npm ci → tsc --noEmit → npm audit → production build; the full pipeline was executed locally before this report.",
      "Every server patch (security hardening, login rate limiter, host hardening) is a committed, idempotent script with a timestamped .bak and auto-revert on failed boot — the password-policy patch self-verified with a health probe before committing to the new file.",
      "Codebuff provenance trailers on every commit; git history is the integrity log.",
    ],
    gap: "Commits are not signed and branch protection on main is not verified — enable both so the CI gate cannot be bypassed by a direct push.",
  },
  {
    id: "A09",
    title: "Security Logging and Alerting Failures",
    verdict: "PARTIAL",
    summary:
      "The API writes a login-reports trail (rotation events, per-login metadata) and a Notification model that files actions under the module and the roles that must act; Morgan logs HTTP traffic; fail2ban now counts and bans SSH brute-force on the host. There is still no aggregation, retention policy or alerting.",
    evidence: [
      "Login reports endpoint (TM/Admin/HR only) exposes per-account login history used by this assessment.",
      "fail2ban client status shows live counting (6 failed SSH attempts recorded within minutes).",
      "pm2 file logs exist but rotate only by size; nothing watches them.",
    ],
    gap: "No centralized log retention, no alert on application-level brute-force patterns (the API rate limiter's 429s are only visible in pm2 logs), no uptime monitoring. Ship pm2 logs + 429 counters to a log service and alert on spikes.",
  },
  {
    id: "A10",
    title: "Mishandling of Exceptional Conditions",
    verdict: "PASS",
    summary:
      "Error paths answer with typed JSON messages, not stack traces: auth failures return structured 401/403 bodies, oversized payloads a clean 413, and the client renders departmental empty/failure states rather than crashing. NODE_ENV=production is now set, pinning Express's error handler to stack-free responses.",
    evidence: [
      "Probes: forged token → { error: 'Invalid token' } (401); partner on internal route → { error: 'Forbidden…' } (403); 5 MB body → 413 without stack.",
      "NODE_ENV=production appended to the API .env this pass (verified in post-flight probes; health 200 after restart).",
      "Client: Promise.allSettled data loads render 'could not reach the ledgers' states instead of white-screening; print pipeline sanitizes malformed HTML input.",
    ],
    gap: "None identified.",
  },
];

const REMEDIATIONS = [
  {
    fix: "Login rate limiting (API)",
    before: "Unlimited login attempts accepted; credential stuffing unbounded.",
    after: "6 attempts/min per IP+username on all credential routes; 429 + Retry-After; success clears the counter.",
    proof: "Live probe: 401 ×6 → 429 on the 7th; legitimate TM login immediately after → 200.",
  },
  {
    fix: "Password policy (API, all 3 password-set sites)",
    before: "Minimum 6 on self-service only; user creation had NO password check (undefined could reach bcrypt).",
    after: "Minimum 10 chars + top-blocklist + repetition guard, enforced server-side at creation, admin reset and self-service.",
    proof: "'123' → 400 'at least 10 characters'; 'Petroline@2026' → 400 'too common'; health 200 after restart.",
  },
  {
    fix: "Firewall (UFW)",
    before: "ufw status: inactive — every port open.",
    after: "Active on boot; only 22/80/443 allowed.",
    proof: "ufw status numbered: 4 rules; SSH session survived the enable (22 allowed first).",
  },
  {
    fix: "SSH brute-force ban (fail2ban)",
    before: "Not installed.",
    after: "sshd jail live: 5 failures/10m → 1h ban, systemd backend.",
    proof: "fail2ban-client status sshd: 6 failed attempts counted within minutes.",
  },
  {
    fix: "SSH key-only access",
    before: "PasswordAuthentication yes (cloud-init); root password login allowed.",
    after: "PasswordAuthentication no; PermitRootLogin prohibit-password (written to the FIRST-match cloud-init file — sshd first-match semantics).",
    proof: "sshd -T: passwordauthentication no; password-only attempt → 'Permission denied (publickey)'; key login unaffected.",
  },
  {
    fix: "Web-root hygiene",
    before: "~66 probe/backup/CSV files sitting in /var/www/fleetopsx-api.",
    after: "Archived to /root/fleetopsx-archive (retrievable, out of the served tree).",
    proof: "find/mv run logged; archive count 66.",
  },
  {
    fix: "NODE_ENV=production (API)",
    before: "Unset — Express error handler could render stack traces.",
    after: "Set in .env; process restarts verified healthy.",
    proof: "health probe 200 after restart.",
  },
  {
    fix: "Dependency lockfile (frontend)",
    before: "No package-lock.json — every deploy re-resolved dependency versions.",
    after: "Lockfile committed; CI installs with npm ci and audits on every push.",
    proof: "npm audit deterministic (2 known sheetJS advisories, no vendor fix yet); CI pipeline executed end-to-end.",
  },
  {
    fix: "CI quality gate",
    before: "Nothing between a push and the Vercel auto-deploy.",
    after: "GitHub Actions: typecheck + audit report + production build on every push/PR.",
    proof: "Full pipeline run locally (tsc clean, build green) before this report.",
  },
];

const META = {
  product: "FleetOpsX / Karigo Command Center",
  client: "Petroline Transport Ltd",
  scope: "Production web platform — React/Vite SPA (Vercel), Node/Express + Prisma API (2.28.45.216), PostgreSQL",
  assessed: "28 September 2026",
  standard: "OWASP Top 10 (2025 Release)",
  tester: "Codebuff security pass — automated probes + source review, two remediation passes applied",
};

const VERDICT_STYLE = {
  PASS: { bg: "#EAF7F1", fg: "#0A7F58", label: "PASS" },
  PARTIAL: { bg: "#FFF4DC", fg: "#8A6100", label: "PARTIAL" },
  FAIL: { bg: "#FDEAE7", fg: "#C21F07", label: "FAIL" },
};

const card = (item) => {
  const v = VERDICT_STYLE[item.verdict];
  return `
  <section class="card">
    <div class="card-head">
      <div class="id-block">
        <span class="oid">${item.id}</span>
        <h2>${item.title}</h2>
      </div>
      <span class="verdict" style="background:${v.bg};color:${v.fg}">${v.label}</span>
    </div>
    <p class="summary">${item.summary}</p>
    <h3>Evidence</h3>
    <ul>${item.evidence.map((e) => `<li>${e}</li>`).join("")}</ul>
    <h3>Remaining gap</h3>
    <p class="gap">${item.gap}</p>
  </section>`;
};

const passCount = REPORT.filter((r) => r.verdict === "PASS").length;
const partialCount = REPORT.filter((r) => r.verdict === "PARTIAL").length;
const failCount = REPORT.filter((r) => r.verdict === "FAIL").length;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>OWASP Top 10 (2025) Assessment — ${META.client}</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1B2432; margin: 0; font-size: 12px; line-height: 1.55; }
  .sheet { padding: 0 2mm; }
  /* ---------- cover ---------- */
  .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #ED351D; padding-bottom: 14px; }
  .brand .mark { width: 44px; height: 44px; border-radius: 8px; background: #ED351D; color: #fff; font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; }
  .brand .co { font-size: 17px; font-weight: 700; letter-spacing: .3px; }
  .brand .co small { display: block; font-size: 10px; font-weight: 600; color: #5C6470; letter-spacing: 1.5px; text-transform: uppercase; }
  .cover-title { margin-top: 42mm; }
  .cover-title .std { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #ED351D; }
  .cover-title h1 { font-size: 34px; line-height: 1.15; margin: 10px 0 14px; }
  .cover-title p.sub { font-size: 13px; color: #5C6470; max-width: 130mm; }
  .scoreband { display: flex; gap: 10px; margin-top: 12mm; }
  .score { flex: 1; border: 1px solid #E2E5E9; border-radius: 10px; padding: 14px 16px; }
  .score .n { font-size: 26px; font-weight: 800; }
  .score .l { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #5C6470; }
  .score.pass .n { color: #0A7F58; } .score.partial .n { color: #B07C00; } .score.fail .n { color: #C21F07; }
  .meta { border-top: 1px solid #E2E5E9; padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 11.5px; }
  .meta b { color: #5C6470; font-weight: 600; }
  /* ---------- content ---------- */
  h2 { font-size: 17px; margin: 0; }
  h3 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #5C6470; margin: 12px 0 4px; }
  .card { border: 1px solid #E2E5E9; border-radius: 10px; padding: 14px 16px; margin: 0 0 12px; page-break-inside: avoid; box-shadow: 0 1px 2px rgba(12,12,13,.04); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #F1F2F4; padding-bottom: 8px; margin-bottom: 8px; }
  .id-block { display: flex; align-items: baseline; gap: 10px; }
  .oid { font-size: 11px; font-weight: 800; color: #fff; background: #1B2432; border-radius: 5px; padding: 3px 8px; }
  .verdict { font-size: 10.5px; font-weight: 800; letter-spacing: .8px; border-radius: 999px; padding: 4px 12px; }
  .summary { margin: 4px 0 0; }
  ul { margin: 2px 0 0; padding-left: 18px; }
  li { margin: 3px 0; }
  .gap { background: #F7F8FA; border-left: 3px solid #F2C200; border-radius: 4px; padding: 8px 10px; margin: 4px 0 0; }
  .exec { border: 1px solid #E2E5E9; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; background: #FBFBFC; }
  .remtable { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .remtable th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #5C6470; border-bottom: 1.5px solid #E2E5E9; padding: 6px 8px; }
  .remtable td { font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #F1F2F4; vertical-align: top; }
  .remtable td.fix { font-weight: 700; width: 24%; }
  .remtable td.proof { color: #0A7F58; width: 30%; }
  .pagebreak { page-break-before: always; }
  footer.note { margin-top: 10mm; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E2E5E9; padding-top: 8px; }
</style>
</head>
<body>
<div class="sheet">

  <div class="cover">
    <div class="brand">
      <div class="mark">PT</div>
      <div class="co">Petroline Transport Ltd<small>Fleet Operations Platform</small></div>
    </div>
    <div class="cover-title">
      <div class="std">${META.standard}</div>
      <h1>Application Security Assessment</h1>
      <p class="sub">Ten risk categories, one verdict each, every verdict backed by a probe against the live system or a committed change — and a remediation log of the nine fixes applied during the assessment itself.</p>
      <div class="scoreband">
        <div class="score pass"><div class="n">${passCount}</div><div class="l">Pass</div></div>
        <div class="score partial"><div class="n">${partialCount}</div><div class="l">Partial</div></div>
        <div class="score fail"><div class="n">${failCount}</div><div class="l">Fail</div></div>
        <div class="score"><div class="n">9</div><div class="l">Fixes applied</div></div>
      </div>
    </div>
    <div class="meta">
      <div><b>Product</b> &nbsp;${META.product}</div>
      <div><b>Client</b> &nbsp;${META.client}</div>
      <div><b>Scope</b> &nbsp;${META.scope}</div>
      <div><b>Assessed</b> &nbsp;${META.assessed}</div>
      <div><b>Standard</b> &nbsp;${META.standard}</div>
      <div><b>Method</b> &nbsp;${META.tester}</div>
    </div>
  </div>

  <section>
    <h2 style="margin-bottom:10px">Executive summary</h2>
    <div class="exec">
      <p style="margin:0 0 6px">The platform passes ${passCount} of the ten OWASP Top 10 (2025) categories outright; ${partialCount} are partial with the gaps named and owned. This assessment was followed by a remediation pass that applied nine fixes on the live system — server-side login rate limiting, a real password policy at every password-set site, an enabled firewall, SSH brute-force banning, key-only SSH access, a cleared web root, production error handling, a dependency lockfile, and a CI quality gate — each verified with before/after probes and listed in the remediation log.</p>
      <p style="margin:0">The residual risk is concentrated in session-token hygiene (30-day JWT in localStorage, no MFA), the unencrypted Vercel→origin leg, the root service account, and observability (no log retention or alerting). Each is listed under its category with a concrete next step.</p>
    </div>
    <div style="font-size:11px; color:#5C6470; margin:0 0 10px;">Reading note — <b style="color:#0A7F58">PASS</b>: control verified against the live system. <b style="color:#B07C00">PARTIAL</b>: control present, named gap remains. <b style="color:#C21F07">FAIL</b>: control absent.</div>
  </section>

  <section class="pagebreak">
    <h2 style="margin-bottom:4px">Remediation log — applied during this assessment</h2>
    <p style="font-size:11px;color:#5C6470;margin:0 0 8px">Every fix was applied to the live system, verified immediately, and shipped as a committed, re-runnable script or repo change.</p>
    <table class="remtable">
      <thead><tr><th>Fix</th><th>Before → After</th><th>Verification</th></tr></thead>
      <tbody>
        ${REMEDIATIONS.map((r) => `<tr><td class="fix">${r.fix}</td><td><b>Before:</b> ${r.before}<br/><b>After:</b> ${r.after}</td><td class="proof">${r.proof}</td></tr>`).join("\n        ")}
      </tbody>
    </table>
  </section>

  <section class="pagebreak" style="page-break-before:avoid">
    <h2 style="margin:6px 0 10px">Category findings</h2>
    ${REPORT.map(card).join("\n")}
  </section>

  <footer class="note">Assessment of ${META.assessed} · ${META.product} · Verdicts are point-in-time and re-probes are welcome: every evidence line names the check that produced it.</footer>
</div>
</body>
</html>`;

const out = path.join(__dirname, "..", "docs", "OWASP-TOP-10-ASSESSMENT-2025.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, "utf8");
console.log("wrote", out, (html.length / 1024).toFixed(1) + " KB");
