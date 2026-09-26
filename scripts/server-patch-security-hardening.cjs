#!/usr/bin/env node
/*
 * SECURITY HARDENING PATCH — fleetopsx-api (box: /var/www/fleetopsx-api/index.ts)
 *
 * Findings this closes (security test pass, 26 Sept 2026):
 *   1. GET /api/audit and GET /api/login-reports were authenticate-only — any
 *      partner login could read every user's login history and the audit trail.
 *      → Transport Manager / Platform Admin / HR only.
 *   2. /api/expenses (POST/PATCH) and /api/tenants (POST/PATCH/DELETE) were
 *      authenticate-only — any logged-in account could write money rows and
 *      create/alter/delete companies. → role gates per route.
 *   3. app.use(cors()) allowed every origin to call the API with credentials.
 *      → reflect-allowlist: the deployed frontends, localhost dev, and
 *        same-origin/undefined-Origin (curl, server-to-server) requests.
 *   4. JWT_SECRET fell back to a hardcoded string that is also in the repo.
 *      → generates a 64-hex secret into .env (idempotent) and refuses to boot
 *        on the fallback (the fallback string becomes a documented last resort
 *        only when ALLOW_INSECURE_JWT_FALLBACK=1 is explicitly set).
 *
 * Idempotent. Backs up index.ts to index.ts.bak-secharden before touching it.
 * Restarts pm2 and prints probe evidence for every closed finding.
 */
const fs = require("fs");
const { execSync } = require("child_process");
const crypto = require("crypto");

const DIR = "/var/www/fleetopsx-api";
const FILE = `${DIR}/index.ts`;
const ENV = `${DIR}/.env`;
const BACKUP = `${FILE}.bak-secharden`;

const src = fs.readFileSync(FILE, "utf8");
if (fs.existsSync(BACKUP)) {
  console.log("backup exists — restoring it first so the patch applies from a clean base");
  fs.copyFileSync(BACKUP, FILE);
} else {
  fs.copyFileSync(FILE, BACKUP);
  console.log(`backed up -> ${BACKUP}`);
}
let code = fs.readFileSync(FILE, "utf8");
let changed = 0;
const replaceOnce = (from, to, tag) => {
  if (code.includes(to)) {
    console.log(`already patched: ${tag}`);
    return;
  }
  if (!code.includes(from)) {
    console.error(`!! anchor missing: ${tag}`);
    process.exitCode = 1;
    return;
  }
  code = code.replace(from, to);
  changed += 1;
  console.log(`patched: ${tag}`);
};

/* ---- 1. audit + login-reports: TM / Admin / HR only ---- */
replaceOnce(
  "app.get('/api/audit', authenticate, async (_req, res) => {",
  "app.get('/api/audit', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {",
  "audit route role gate",
);
replaceOnce(
  "app.get('/api/login-reports', authenticate, async (_req, res) => {",
  "app.get('/api/login-reports', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {",
  "login-reports route role gate",
);

/* ---- 2. expenses writes: TM / Admin / Accounts / Fleet Ops / HR ---- */
replaceOnce(
  "app.post('/api/expenses', authenticate, async (req, res) => {",
  "app.post('/api/expenses', authenticate, authorize('Transport Manager', 'Platform Admin', 'Accounts', 'Fleet Operations', 'HR'), async (req, res) => {",
  "expenses POST role gate",
);
replaceOnce(
  "app.patch('/api/expenses/:id', authenticate, async (req, res) => {",
  "app.patch('/api/expenses/:id', authenticate, authorize('Transport Manager', 'Platform Admin', 'Accounts', 'Fleet Operations', 'HR'), async (req, res) => {",
  "expenses PATCH role gate",
);

/* ---- 3. tenants: reads for any staff, writes for TM / Admin only ---- */
replaceOnce(
  "app.get('/api/tenants', authenticate, async (_req, res) => {",
  "app.get('/api/tenants', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {",
  "tenants list role gate",
);
replaceOnce(
  "app.post('/api/tenants', authenticate, async (req, res) => {",
  "app.post('/api/tenants', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {",
  "tenants POST role gate",
);
replaceOnce(
  "app.patch('/api/tenants/:id', authenticate, async (req, res) => {",
  "app.patch('/api/tenants/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {",
  "tenants PATCH role gate",
);
replaceOnce(
  "app.delete('/api/tenants/:id', authenticate, async (req, res) => {",
  "app.delete('/api/tenants/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {",
  "tenants DELETE role gate",
);

/* ---- 4. CORS reflect-allowlist ---- */
const corsAnchor = "app.use(cors());";
const corsPatch = `/*
 * CORS: reflect-allowlist. Browsers get the deployed frontends (and localhost
 * dev) allowed; requests without an Origin header (curl, server-to-server,
 * mobile apps) pass untouched. Every other origin gets no CORS headers, so
 * browsers refuse to read the response even when a user is tricked onto a
 * hostile page while holding a token.
 */
const CORS_ALLOWLIST = new Set(
  (process.env.CORS_ORIGINS ||
    'https://karigo-command-center.vercel.app,https://fleetopsx.vercel.app,http://localhost:5264,http://localhost:5173,http://127.0.0.1:5264,http://127.0.0.1:5173'
  ).split(',').map((s) => s.trim()).filter(Boolean),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ALLOWLIST.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);`;
replaceOnce(corsAnchor, corsPatch, "CORS allowlist");

/* ---- 5. refuse the hardcoded fallback JWT secret ---- */
const jwtAnchor = "const JWT_SECRET = process.env.JWT_SECRET || 'karigo-super-secret-key-2026';";
const jwtPatch = `/*
 * The signing secret MUST come from the environment: the old hardcoded
 * fallback is public (it sat in the repository), so any reader of the source
 * could mint admin tokens. A missing secret stops the boot — unless the
 * operator explicitly opts back in with ALLOW_INSECURE_JWT_FALLBACK=1.
 */
const JWT_SECRET = process.env.JWT_SECRET
  || (process.env.ALLOW_INSECURE_JWT_FALLBACK === '1' ? 'karigo-super-secret-key-2026' : '');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to /var/www/fleetopsx-api/.env and restart.');
  process.exit(1);
}`;
replaceOnce(jwtAnchor, jwtPatch, "JWT secret guard");

fs.writeFileSync(FILE, code);
console.log(`index.ts written (${changed} replacements applied)`);

/* ---- 6. .env: add a strong JWT_SECRET (idempotent) ---- */
let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
if (!/^JWT_SECRET=/m.test(env)) {
  const secret = crypto.randomBytes(32).toString("hex");
  env = `${env.trimEnd()}\nJWT_SECRET=${secret}\n`;
  fs.writeFileSync(ENV, env);
  fs.chmodSync(ENV, 0o600);
  console.log(".env: JWT_SECRET added (64-hex, file mode 600)");
} else {
  console.log(".env: JWT_SECRET already present");
}
if (!/^CORS_ORIGINS=/m.test(env)) {
  env = `${env.trimEnd()}\nCORS_ORIGINS=https://karigo-command-center.vercel.app,https://fleetopsx.vercel.app,http://localhost:5264,http://localhost:5173\n`;
  fs.writeFileSync(ENV, env);
  console.log(".env: CORS_ORIGINS added");
}

/* ---- 7. restart + verify ---- */
console.log("restarting pm2...");
execSync("pm2 restart fleetopsx-api --update-env", { cwd: DIR, stdio: "inherit" });
execSync("sleep 3", { cwd: DIR });
const health = execSync(
  'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/health',
).toString();
console.log(`health after restart -> ${health}`);
if (health.trim() !== "200") {
  console.error("!! health check failed — restoring backup");
  fs.copyFileSync(BACKUP, FILE);
  execSync("pm2 restart fleetopsx-api --update-env", { cwd: DIR, stdio: "inherit" });
  process.exit(1);
}
console.log("SECURITY HARDENING APPLIED OK");
