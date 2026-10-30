import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
// LOGIN_DEPT_V1 — Figma department label → RoleKeys the account may hold.
function departmentRoleKeys(department) {
  const map = {
    'Transport Admin': ['Transport Manager', 'Platform Admin'],
    'Fleet Operations': ['Fleet Operations', 'Fuel Management', 'Fuel Manager'],
    'Tracking Operations': ['Tracking', 'Tracking Operations'],
    'Loading Operations': ['Loading', 'Loading Operations'],
    'Lubricant': ['Lubricant', 'Lubricant Manager', 'Lubricant Operations', 'Fuel Manager'],
    'Fuel Management': ['Fleet Operations', 'Fuel Manager', 'Lubricant'],
    'Engineering and Maintenance': ['Engineering'],
    'Parts and Store': ['Parts & Store', 'Parts and Store', 'Inventory', 'Head of Inventory', 'Store Floor Attendant'],
    'Accounts': ['Accounts', 'Accountant'],
    'HR and Personnel': ['HR', 'HR & Personnel', 'HR and Personnel'],
    'Security': ['Security', 'Gate Security', 'Gate'],
    'Drivers': ['Driver'],
  };
  return map[department] || [department];
}

/*
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
}

app.use(helmet());
/*
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
);
app.use(morgan('dev'));
const jsonBody = express.json({ limit: '4mb' });
/*
 * Every route keeps the 4 MB body guard, except the one that carries a
 * scanned licence: that route parses its own body with a higher ceiling,
 * because a 10 MB document is normal for a photographed licence.
 */
app.use((req, res, next) =>
  req.method === 'POST' && /^\/api\/drivers\/[^/]+\/licence$/.test(req.path)
    ? next()
    : jsonBody(req, res, next),
);

const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user) return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    // multi-role: JWT carries roles[]; any held role grants the endpoint.
    const held: string[] = Array.isArray((req.user as any).roles) ? (req.user as any).roles : [req.user.role];
    if (!roles.some((r) => held.includes(r))) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};

async function partnerCompanyForUser(userId: string, email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { partnerCompanyName: true, companyLogo: true, email: true } });
  if (dbUser?.partnerCompanyName) return dbUser.partnerCompanyName;
  // Fallback: derive from the email domain (legacy accounts created before persistence).
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function samePartnerCompany(a?: string | null, b?: string | null) {
  const x = (a || '').trim().toLowerCase();
  const y = (b || '').trim().toLowerCase();
  return !!x && !!y && x === y;
}

function partnerCompanyFromEmailFallback(email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/*
 * PARTNER-ON-BEHALF — the companies the yard serves.
 *
 * A partner (Silver Steel, Saba Steel, Genbrite…) is a company the yard hauls
 * for, and the Transport Manager raises requests for them as often as they
 * raise their own. This is the one list that answers "which partners do we
 * have": portal accounts first (that is the spelling the partner sees when he
 * opens his own dashboard), then the names already used on dispatches.
 */
async function partnerCompanies() {
  const [users, trips] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'Customer Portals (External)' },
      select: { partnerCompanyName: true, email: true },
    }),
    prisma.trip.findMany({
      where: { NOT: { customer: null } },
      select: { customer: true },
      distinct: ['customer'],
    }),
  ]);
  const out = new Map<string, { company: string; accounts: number; source: string }>();
  for (const u of users) {
    const name = String(u.partnerCompanyName || partnerCompanyFromEmailFallback(u.email, 'Customer Portals (External)') || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const row = out.get(key) || { company: name, accounts: 0, source: 'Portal Account' };
    row.accounts += 1;
    out.set(key, row);
  }
  for (const t of trips) {
    const name = String(t.customer || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!out.has(key)) out.set(key, { company: name, accounts: 0, source: 'Dispatch History' });
  }
  return Array.from(out.values()).sort((a, b) => a.company.localeCompare(b.company));
}

/** The exact spelling the system already uses for the partner a caller typed. */
async function canonicalPartnerCompany(name: string) {
  const typed = String(name || '').trim();
  if (!typed) return null;
  const list = await partnerCompanies();
  const key = typed.toLowerCase();
  return list.find((p) => p.company.toLowerCase() === key)?.company || typed;
}

function userPayload(user: { id: string; email: string; name: string; phone?: string | null; role: string; status?: string; tenantId?: string | null; passwordResetRequired?: boolean; partnerCompanyName?: string | null; companyLogo?: string | null }) {
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const extraRoles = String((user as any).roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  const baseRoles = user.role === 'Platform Admin' ? [user.role, 'Transport Manager'] : [user.role];
  const roles = Array.from(new Set([...baseRoles, ...extraRoles]));
  const username = user.email.split('@')[0];
  return {
    id: user.id,
    email: user.email,
    username,
    name: user.name,
    role: user.role,
    roles,
    roleNames: roles,
    department: user.role,
    status: (user.status as any) || 'Active',
    lastActive: 'Just now',
    initials,
    companyId: user.tenantId || 'tnt_001',
    partnerCompanyName: user.partnerCompanyName || partnerCompanyFromEmailFallback(user.email, user.role),
    companyLogo: (user as any).companyLogo || null,
    phone: user.phone || undefined,
    passwordResetRequired: Boolean(user.passwordResetRequired),
  };
}

type NoticeMeta = {
  module?: string;
  eventKey?: string;
  refId?: string;
  refLabel?: string;
  /** Roles that must act. Empty = nobody has to do anything. */
  actionRoles?: string[];
};

/**
 * The one writer every module calls. It files the row under the module that
 * sent it, attaches the record it is about and names the roles that must act —
 * so the Transport Manager's feed can be read by department, and his "needs me"
 * is his own queue rather than the whole company's.
 */
async function notify(
  category: string,
  title: string,
  body: string,
  severity = 'info',
  audience?: string,
  meta?: NoticeMeta,
) {
  const filed = classifyNotification({ category, title, body, audience });
  const actionRoles = meta?.actionRoles ?? [];
  return prisma.notification.create({
    data: {
      category,
      title,
      body,
      severity,
      time: 'Just now',
      read: false,
      audience: audience ?? null,
      module: meta?.module || filed.module,
      eventKey: meta?.eventKey ?? null,
      refId: meta?.refId ?? null,
      refLabel: meta?.refLabel ?? null,
      actionRoles,
      actionRequired: actionRoles.length > 0,
    },
  });
}

// Audience-scoped notifications: null = broadcast (legacy rows), otherwise comma-separated roles.
// Partners are scoped to THEIR company tag (`Partner:<Company>`) so one company
// never sees another's cargo alerts. Legacy rows tagged plain 'Partner' stay
// visible to every partner (nothing already delivered disappears).
// ---- WHICH MODULE AND WHETHER IT NEEDS A DECISION ------------------------
// Every alert is filed under the department that produced it, so the Transport
// Manager can ask "what has Engineering sent me" instead of reading one pile.
// Audience strings stay as they are (they decide WHO), but they are no longer
// the only thing a row is known by.
const NOTIFICATION_MODULES: Array<{ module: string; match: RegExp; action?: RegExp }> = [
  { module: 'Gate Security', match: /gate|security|checkpoint|departure|return/i },
  { module: 'Tracking', match: /track|location|checkpoint|delay/i },
  { module: 'Engineering', match: /engineer|work order|repair|maintenance|parts|inventory|defect/i, action: /awaiting|approval|requisition|requested/i },
  { module: 'Fuel & Lubricant', match: /diesel|lubricant|fuel|tank|pump|restock|disburs/i, action: /authoriz|approval|withdraw|awaiting/i },
  { module: 'HR & Personnel', match: /hr|licence|license|driver|staff|duty/i },
  { module: 'Accounts', match: /expense|accounts|invoice|claim/i, action: /pending|clarification|approval/i },
  { module: 'Partners', match: /partner|customer portal|request submitted/i },
  { module: 'Fleet Operations', match: /dispatch|assignment|truck|tail|asset|fleet|approv|declin/i, action: /awaiting|pending|assignment needed|approval|sent back|action required/i },
];

/**
 * File a notification under a module and decide whether it is work or news.
 * Order matters: the first module whose pattern matches the category, title and
 * body wins, so the department that acted is named rather than the department
 * that was told.
 */
function classifyNotification(input: { category?: string; title?: string; body?: string; audience?: string | null }) {
  const haystack = [input.category, input.title, input.body].filter(Boolean).join(' ');
  for (const entry of NOTIFICATION_MODULES) {
    if (entry.match.test(haystack)) {
      return {
        module: entry.module,
        actionRequired: entry.action ? entry.action.test(haystack) : false,
      };
    }
  }
  return { module: 'System', actionRequired: false };
}

/**
 * Rows this user has NOT read: neither the legacy shared flag nor their own
 * id in `readBy`. Reading is per person, so a colleague's click cannot clear
 * this user's badge.
 */
function unreadForUser(req: any) {
  const me = String(req.user?.id || '');
  return { read: false, NOT: { readBy: { has: me } } };
}

async function notificationScope(req: any) {
  const role: string = req.user?.role || '';
  if (role === 'Customer Portals (External)') {
    let companyTag: string | null = null;
    try {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { partnerCompanyName: true, email: true } });
      const company = u?.partnerCompanyName?.trim();
      if (company) companyTag = 'Partner:' + company;
    } catch {}
    if (companyTag) {
      return { OR: [{ audience: null }, { audience: { contains: companyTag } }, { audience: { equals: 'Partner' } }] };
    }
    return { OR: [{ audience: null }, { audience: { contains: 'Partner' } }] };
  }  const held = (Array.isArray(req.user?.roles) ? req.user.roles : [role]).filter(Boolean);
  // One OR per held role: joining them into 'A|B' asked the database for a
  // literal 'A|B' substring, which no audience contains — multi-role staff
  // silently missed every notification.
  // Chat notifications target USERS by id in the audience list, so the reader
  // also matches on their own id — one comma-delimited list per row.
  return {
    OR: [
      { audience: null },
      ...held.map((r) => ({ audience: { contains: r } })),
      { audience: { contains: String(req.user.id) } },
    ],
  };
}

/**
 * The dispatch reference the product actually shows (DIS-xxxxx).
 *
 * Mirrors the client's displayDispatchId (src/lib/fleetopsx/request-id.ts)
 * exactly, so an alert and the dispatch it describes finally carry ONE name.
 */
function dispatchRef(tripId: any) {
  const id = String(tripId || '');
  if (/^DIS-/i.test(id)) return 'DIS-' + id.slice(4).toUpperCase();
  if (/^REQ-/i.test(id)) return 'DIS-' + id.slice(4).toUpperCase();
  const clean = id.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return 'DIS-' + clean.slice(-5).padStart(5, '0');
}

// Lifecycle status -> notification sent to the right roles (partner stays informed of ITS cargo).
const TRIP_STATUS_NOTICES: Record<string, { category: string; title: string; body: (t: any) => string; audience: string; severity?: string }> = {
  'Approved': { category: 'Approvals', title: 'Request Approved', body: (t) => `Dispatch ${dispatchRef(t.id)} was approved and is awaiting truck assignment.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'success', module: 'Fleet Operations', actionRoles: ['Fleet Operations'] },
  'Scheduled': { category: 'Operations', title: 'Truck Assigned', body: (t) => `Dispatch ${dispatchRef(t.id)} is fully assigned (${t.truckReg} · ${t.driverName}) and scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking,Loading', severity: 'success', module: 'Fleet Operations' },
  'En Route': { category: 'Operations', title: 'Truck Departed', body: (t) => `Dispatch ${dispatchRef(t.id)} departed — truck ${t.truckReg} is En Route to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Security,Tracking', severity: 'info', module: 'Gate Security' },
  'Delayed': { category: 'Operations', title: 'Dispatch Delayed', body: (t) => `Dispatch ${dispatchRef(t.id)} has been marked Delayed.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'warning', module: 'Tracking', actionRoles: ['Tracking'] },
    // returning-notice-removed
  'Completed': { category: 'Operations', title: 'Delivery Completed', body: (t) => `Dispatch ${dispatchRef(t.id)} completed delivery to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'success', module: 'Fleet Operations' },
  'Stopped': { category: 'Approvals', title: 'Request Declined', body: (t) => `Dispatch ${dispatchRef(t.id)} was declined/stopped by Transport Manager.`, audience: 'Partner,Transport Manager', severity: 'error', module: 'Fleet Operations' },
};

// AUDIT-TRAIL-MIDDLEWARE — record every successful mutation (who/what/record/device/ip).
app.use('/api', (req: any, res: any, next: any) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const path = String(req.path).replace(/^\/+/, '').replace(/^api\//, '');
    const authPath = path.startsWith('auth/');
    if (authPath && path !== 'auth/logout') return; // logins live in LoginReport
    (async () => {
      const segs = path.split('/').filter(Boolean);
      const byId = /:|id$/i.test(segs[segs.length - 1] || '') || req.params?.id;
      const moduleMap = {
        trips: 'Dispatch', users: 'Accounts', drivers: 'HR', trucks: 'Fleet',
        tails: 'Fleet', gate: 'Security', tracking: 'Tracking', expenses: 'Accounts',
        fuel: 'Fuel', lubricant: 'Lubricant', 'fuel-prices': 'Fuel', inventory: 'Inventory',
        'inventory-requisitions': 'Inventory', procurement: 'Procurement',
        'work-orders': 'Engineering', notifications: 'Comms', conversations: 'Comms',
        tenants: 'Platform', audit: 'Platform', 'login-reports': 'Platform',
      };
      const moduleName = moduleMap[segs[0]] || segs[0] || 'System';
      const verbMap = { POST: 'Created', PATCH: 'Updated', PUT: 'Updated', DELETE: 'Deleted' };
      const action = authPath
        ? 'Logged Out'
        : (verbMap[req.method] || req.method) + ' ' + moduleName;
      const recordRef =
        (req.body && (req.body.name || req.body.title || req.body.customerConsignee || req.body.defect)) ||
        (req.params && req.params.id) ||
        segs[segs.length - 1] ||
        req.path;
      await prisma.auditLog.create({
        data: {
          user: req.user?.name || req.user?.email || 'Anonymous',
          module: moduleName,
          action,
          record: String(recordRef).slice(0, 120),
          device: 'Web',
          ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '—').toString(),
        },
      }).catch(() => {});
    })().catch(() => {});
  });
  next();
});

// --- AUTH ---

// --- RATELIMIT:LOGIN -------------------------------------------------------------
// Hand-rolled login rate limiter: 6 attempts per minute per IP + username,
// applied to the credential-bearing auth routes. No new dependencies.
const __rlBuckets = new Map(); // key -> { count, resetAt }
const __RL_WINDOW_MS = 60_000;
const __RL_MAX = 6;
function __rlKey(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const body = req.body || {};
  const who = String(body.email || body.username || body.identifier || "").toLowerCase().trim();
  return ip + "|" + who;
}
function __rlRateLimit(req, res, next) {
  const now = Date.now();
  const key = __rlKey(req);
  const bucket = __rlBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    __rlBuckets.set(key, { count: 1, resetAt: now + __RL_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > __RL_MAX) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retry));
    return res.status(429).json({ error: "Too many attempts. Try again in " + retry + "s." });
  }
  return next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of __rlBuckets) if (bucket.resetAt <= now) __rlBuckets.delete(key);
}, 120_000).unref();
// --- RATELIMIT:LOGIN:END ---------------------------------------------------------


// --- RATELIMIT:LOGIN:ROUTES ------------------------------------------------------
if (typeof app !== "undefined" && app) {
  const __credPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/partner/login",
    "/api/auth/partner/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/users/me/password",
    // AUTHSETUP:RATELIMITED — the bootstrap endpoint is unauthenticated by
    // design (it creates the first admin), so it needs the same attempt
    // throttle as every other credential-writing route.
    "/api/auth/setup",
  ];
  const __rlWrapped = new Set();
  for (const p of __credPaths) {
    if (__rlWrapped.has(p)) continue;
    app.post(p, __rlRateLimit);
    __rlWrapped.add(p);
  }
}
// --- RATELIMIT:LOGIN:ROUTES:END --------------------------------------------------

app.post('/api/auth/setup', async (_req, res) => {
  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: 'Platform Admin' } });
    if (existingAdmin) return res.status(400).json({ error: 'Admin already exists' });
    const hashedPassword = await bcrypt.hash('Admin@2026', 10);
    const admin = await prisma.user.create({
      data: { email: 'admin@fleetopsx.com', password: hashedPassword, name: 'System Admin', role: 'Platform Admin' },
    });
    res.json({ message: 'Admin created successfully', email: admin.email });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
  const { password } = req.body || {};
  try {
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    // LOGIN:FAILED-REPORT — every refused sign-in goes into the LoginReport so
    // the audit trail shows probing, not just successes. Success and Logout
    // were recorded all along; the failed attempt was invisible, which is
    // exactly the blind spot an audit must not have.
    const __loginIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '—').toString().split(',')[0].trim() || '—';
    const __loginDevice = /android|iphone|ipad|mobile/i.test(String(req.headers['user-agent'] || '')) ? 'Mobile' : 'Web';
    const __reportFailed = (name: string, role: string, ip: string, device: string) =>
      void prisma.loginReport.create({
        data: { userId: '', name: String(name).slice(0, 120), role, status: 'Failed', ip, device },
      }).catch(() => {});
    // Partner portal Figma uses Username (local-part) — match email prefix when no @ provided.
    // Multiple accounts can share a local-part (e.g. s.ughojo@accessbank.com and
    // s.ughojo@sabasteel.com) — try the password against EVERY candidate.
    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {
      // Username-only login: try the password against every name-match, but ONLY
      // Active ones — probing (or falling back to) a Deleted/Suspended account
      // made real users see "Account suspended" for a simple typo.
      // LOGIN_DEPT_V1 — the department picked on the sign-in form decides which
      // account a shared username opens. Candidates NOT holding the department
      // are excluded entirely: with the right password they are refused, so the
      // oldest same-username account can never answer for the newest one.
      const wantedDept = String(req.body?.department || '').trim();
      const wantedRoles = wantedDept ? departmentRoleKeys(wantedDept) : null;
      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: `${email}@`, mode: 'insensitive' }, status: 'Active' },
        orderBy: { createdAt: 'asc' },
      });
      const holdsWanted = (u) => {
        const own = String(u.roles || '').split(',').map((r) => r.trim()).filter(Boolean).concat([u.role]);
        return wantedRoles ? own.some((r) => wantedRoles.includes(r)) : true;
      };
      const pool = wantedDept ? candidates.filter(holdsWanted) : candidates;
      if (wantedDept && pool.length === 0) {
        __reportFailed(email, 'No Department', __loginIp, __loginDevice);
        return res.status(403).json({ error: `None of the accounts using username "${email}" belong to ${wantedDept}. Pick the department on your credentials, or leave the department blank.` });
      }
      for (const candidate of pool) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }
      if (!user && candidates.length > 0) {
        // Right username, wrong password — never impersonate another match.
        __reportFailed(email, 'Invalid Credentials', __loginIp, __loginDevice);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }
    if (!user) {
      __reportFailed(email, 'Unknown Account', __loginIp, __loginDevice);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'Suspended') {
      __reportFailed(user.name, 'Suspended', __loginIp, __loginDevice);
      return res.status(401).json({ error: 'Your account has been suspended. Contact your administrator.' });
    }
    if (user.status === 'Deleted') {
      __reportFailed(user.name, 'Deleted Account', __loginIp, __loginDevice);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      __reportFailed(user.name, 'Invalid Credentials', __loginIp, __loginDevice);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
      const derived = await partnerCompanyForUser(user.id, user.email, user.role);
      if (derived) {
        // Persist so company matching + canonical spelling work for legacy accounts.
        await prisma.user.update({ where: { id: user.id }, data: { partnerCompanyName: derived } }).catch(() => {});
        user = { ...user, partnerCompanyName: derived };
      }
    }
    const rolesArr = String(user.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    const allRoles = Array.from(new Set([user.role, ...rolesArr]));
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, roles: allRoles, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    await prisma.loginReport.create({
      data: { userId: user.id, name: user.name, role: user.role, status: 'Success', ip: __loginIp, device: __loginDevice },
    });
    res.json({ token, user: userPayload(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/auth/logout', authenticate, async (req: any, res) => {
  try {
    await prisma.loginReport.create({
      data: {
        userId: req.user.id,
        name: req.user.name || '',
        role: req.user.role || '',
        status: 'Logout',
        ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '—').toString().split(',')[0].trim() || '—',
        device: /android|iphone|ipad|mobile/i.test(String(req.headers['user-agent'] || '')) ? 'Mobile' : 'Web',
      },
    });
  } catch {}
  res.json({ ok: true });
});

/*
 * AUDIT:SYS-HELPER — the trail for writes that never pass through HTTP.
 *
 * The middleware above sees requests; the self-heal sweeps below run on
 * timers and poke drivers, trucks, tails and dispatches with NO request
 * attached. Without this helper those writes are invisible to the platform:
 * a 3am sweep closing 20 dispatches leaves no entry anywhere. Now every such
 * act is recorded with System as the actor and Server as the device, so an
 * admin can tell at a glance which rows the machine wrote and which a person
 * did.
 */
async function sysTrail(module: string, action: string, record: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        user: 'System',
        module,
        action,
        record: String(record).slice(0, 240),
        device: 'Server',
        ip: 'internal',
      },
    });
  } catch {
    /* the trail must never break the sweep itself */
  }
}

app.get('/api/auth/me', authenticate, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user && user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
    const derived = await partnerCompanyForUser(user.id, user.email, user.role);
    if (derived) await prisma.user.update({ where: { id: user.id }, data: { partnerCompanyName: derived } });
  }
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: userPayload(user) });
});

// --- USERS (admin) ---
app.get('/api/users', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  // Spec: "Report tells you when a user logged in" — attach each user's latest
  // successful login timestamp from the login reports.
  const latestLogins = await prisma.loginReport.groupBy({ by: ['userId'], _max: { timestamp: true } });
  const lastLoginByUser = new Map(latestLogins.map((r) => [r.userId, r._max.timestamp]));
  res.json(rows.map((u) => ({
    ...userPayload(u),
    lastActive: lastLoginByUser.get(u.id) ? String(lastLoginByUser.get(u.id)) : 'Never',
  })));
});

app.post('/api/users', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (req, res) => {
  try {
    const b = req.body || {};
    // Accept both payload shapes: the admin UI sends firstName/surname/username/companyId,
    // legacy/mock data used name/email/tenantId.
    const firstName = String(b.firstName ?? '').trim();
    const surname = String(b.surname ?? '').trim();
    const name = String(b.name ?? [firstName, surname].filter(Boolean).join(' ')).trim();
    const username = String(b.username ?? '').trim();
    const email = String(b.email ?? (username ? `${username}@petrolline.fleetopsx.com` : '')).trim().toLowerCase();
    const rolesList: string[] = Array.isArray(b.roles) && b.roles.length ? b.roles.map((r: any) => String(r).trim()).filter(Boolean) : [];
    const role = b.role || rolesList[0] || 'Transport Manager';
    const password = b.password || 'ChangeMe@2026';
    const tenantId = b.tenantId || b.companyId || null;
    const isPartnerUser = role === 'Customer Portals (External)';
    // Persist the REAL company name/logo for partner accounts — the UI derives the
    // login email from the company name, but the company itself must not be guessed
    // back out of the email domain (that produced wrong customer details on trips).
    let partnerCompanyName = isPartnerUser ? (String(b.partnerCompanyName || b.company || b.companyName || b.name || '').trim().replace(/\s+/g, ' ') || null) : null;
    if (partnerCompanyName) {
      // Adopt the oldest account's exact company spelling (one company, one dashboard).
      const canonicalCompany = await prisma.user.findFirst({
        where: { role: 'Customer Portals (External)', partnerCompanyName: { equals: partnerCompanyName, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { partnerCompanyName: true },
      });
      if (canonicalCompany?.partnerCompanyName) partnerCompanyName = canonicalCompany.partnerCompanyName;
    }
    const companyLogo = isPartnerUser ? (typeof b.companyLogo === 'string' ? b.companyLogo : null) : null;
    if (!name || !email || !email.includes('@')) {
      return res.status(400).json({ error: 'Name and a valid email are required to create a user.' });
    }
    const __createProblem = __passwordProblem(password);
    if (__createProblem) return res.status(400).json({ error: __createProblem });
    // USERNAME_CONFLICT_V1 — an exact-email match is an error, but a SHARED
    // username (same local part, different domain) is only a warning: legal for
    // partner domains, confusing for sign-in. The TM is told AT CREATION.
    let usernameConflict = null;
    if (username) {
      const clash = await prisma.user.findMany({
        where: { email: { startsWith: `${username}@`, mode: 'insensitive' }, status: 'Active', NOT: { email: { equals: email, mode: 'insensitive' } } },
        select: { email: true, role: true, name: true }, take: 3,
      });
      if (clash.length) usernameConflict = clash;
    }
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) {
      return res.status(409).json({ error: `A user with this email already exists${username ? ` — try a different username (e.g. ${username}2)` : ''}` });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        roles: rolesList.length ? rolesList.join(',') : null,
        password: hashed,
        phone: b.phone,
        tenantId,
        status: b.status || 'Active',
        passwordResetRequired: b.passwordResetRequired !== false,
        partnerCompanyName,
        companyLogo,
      },
    });
    // A company that works from a known set of loading locations gets them with
    // its first account, so nobody has to type the yards in one by one.
    const seededLoadingSites = isPartnerUser
      ? await seedDefaultPartnerSites(partnerCompanyName).catch(() => [] as string[])
      : [];
    void notify('Compliance', 'New Staff Account', `Account created for ${user.name} (${user.role}). A first-login password reset is required.`, 'success', 'Transport Manager,Platform Admin,HR', { module: 'HR & Personnel', eventKey: 'staff.created', refId: user.id, refLabel: user.name });
    res.json({ ...userPayload(user), seededLoadingSites, usernameConflict });
  } catch (err: any) {
    const code = err?.code;
    if (code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists — try another username.' });
    }
    console.error('POST /api/users failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (req, res) => {
  try {
    // Whitelist: only fields the User model stores may pass through to Prisma.
    // Prevents unknown UI fields from triggering PrismaClientValidationError (500).
    const ALLOWED_USER_FIELDS = ['name', 'role', 'roles', 'phone', 'tenantId', 'status', 'password', 'passwordResetRequired', 'partnerCompanyName', 'companyLogo'];
    const data: any = {};
    for (const key of ALLOWED_USER_FIELDS) {
      if (req.body?.[key] !== undefined) data[key] = req.body[key];
    }
    if (Array.isArray(data.roles)) data.roles = data.roles.join(',');
    // GUARD-SELF-ROLES: nobody edits their own access. An HR account (or any
    // manager here) could otherwise grant themself Transport Manager, or
    // quietly demote a colleague — the privilege change would leave behind
    // nothing but the mutation notice, because every admin holds this route.
    const changingAccess =
      data.role !== undefined || data.roles !== undefined || data.status !== undefined;
    if (changingAccess && req.params.id === String(req.user?.id || '')) {
      return res.status(403).json({ error: "You cannot change your own role, roles or status on this account — ask another admin." });
    }
    let generatedTempPassword: string | undefined;
    if (req.body?.resetPassword === true) {
      const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'User not found' });
      // Human-shareable temp password (no ambiguous chars), policy-compliant (>=6 chars, not a default)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let suffix = '';
      for (let i = 0; i < 10; i++) suffix += chars[crypto.randomInt(chars.length)];
      generatedTempPassword = `Fx-${suffix}!9`;
      data.password = generatedTempPassword;
      data.passwordResetRequired = true;
    }
  if (data.password) {
    const __resetProblem = __passwordProblem(data.password);
    if (__resetProblem) return res.status(400).json({ error: __resetProblem });
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (existing?.password && await bcrypt.compare(String(data.password), existing.password)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    data.password = await bcrypt.hash(data.password, 10);
    // Admin reset / temp password → force Set New Password on next login
    if (data.passwordResetRequired === undefined) data.passwordResetRequired = true;
    void notify('Compliance', 'Password Reset', `A new temporary password was issued for ${existing?.name || 'your account'}. Please change it on next login.`, 'warning', 'Transport Manager,Platform Admin,HR', { module: 'Accounts', eventKey: 'account.password_reset' });
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  if (data.status === 'Suspended') {
    void notify('Compliance', 'Account Suspended', ` ${user.name}'s account was suspended. Login access is revoked until reactivated.`, 'error', 'Transport Manager,Platform Admin,HR', { module: 'Accounts', eventKey: 'account.suspended' });
  }
  const payload: any = userPayload(user);
  if (generatedTempPassword) payload.tempPassword = generatedTempPassword;
  res.json(payload);
  } catch (err: any) {
    console.error(`PATCH /api/users/${req.params?.id} failed:`, err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  // SOFT delete per spec: revoke access but keep every historical action
  // (trips, logs, audits) intact so operational/financial history is never corrupted.
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: 'Deleted' } });
    res.status(204).end();
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'User not found' });
    throw e;
  }
});

// Self-service password change — any authenticated user, own account only.
// USERNAME_CONFLICT_V1 — every shared username local-part among ACTIVE users.
// The Manage Account page shows this so same-username collisions are visible
// before they become sign-in surprises.
app.get('/api/users/username-conflicts', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  const users = await prisma.user.findMany({ where: { status: 'Active' }, select: { name: true, email: true, role: true, roles: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const byLocal = new Map();
  for (const u of users) {
    const local = String(u.email || '').split('@')[0]?.toLowerCase();
    if (!local) continue;
    byLocal.set(local, [...(byLocal.get(local) || []), u]);
  }
  const conflicts = [...byLocal.entries()].filter(([, list]) => list.length > 1).map(([local, list]) => ({ username: local, accounts: list }));
  res.json({ conflicts });
});


// --- PASSWORDPOLICY:V1 --------------------------------------------------------------
// One password policy for every password-set site: at least 10 characters,
// not in the top blocked list, not dominated by a single repeated character.
const __BLOCKED = new Set([
  'password', 'password1', 'password123', '123456', '1234567', '12345678',
  '123456789', '1234567890', 'qwerty', 'qwerty123', 'abc123', 'abc123456',
  'letmein', 'welcome', 'welcome1', 'admin123', 'admin@2026', 'petroline',
  'petroline1', 'petroline@2026', 'iloveyou', 'monkey', 'dragon', 'football',
  'passw0rd', 'p@ssw0rd', 'trustno1', 'fleetopsx', 'karigo',
]);
function __passwordProblem(pw) {
  const value = String(pw ?? '');
  if (value.length < 10) return 'Password must be at least 10 characters long.';
  if (__BLOCKED.has(value.toLowerCase())) return 'That password is too common — choose a longer, less predictable one.';
  if (/(.)\1{3,}/.test(value)) return 'Password must not repeat the same character more than three times.';
  return null;
}
// --- PASSWORDPOLICY:V1:END ----------------------------------------------------------

app.patch('/api/users/me/password', authenticate, async (req: any, res) => {
  const { currentPassword, newPassword } = req.body || {};
  try {
    const __pwProblem = __passwordProblem(newPassword);
    if (__pwProblem) {
      return res.status(400).json({ error: __pwProblem });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const sameAsCurrent = currentPassword && await bcrypt.compare(String(currentPassword), user.password);
    if (currentPassword && !sameAsCurrent) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (sameAsCurrent && String(newPassword) === String(currentPassword)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, passwordResetRequired: false } });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('PATCH /api/users/me/password failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- TENANTS ---
app.get('/api/tenants', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  res.json(await prisma.tenant.findMany({ orderBy: { joinedAt: 'desc' } }));
});

app.get('/api/tenants/slug/:slug', async (req, res) => {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ tenantSlug: req.params.slug }, { domain: req.params.slug }] },
  });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json(tenant);
});

app.post('/api/tenants', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  const { name, domain, logo, tenantSlug, status } = req.body;
  const tenant = await prisma.tenant.create({
    data: {
      name,
      domain,
      logo,
      tenantSlug: tenantSlug || domain,
      status: status || 'Active',
    },
  });
  res.json(tenant);
});

app.patch('/api/tenants/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  res.json(await prisma.tenant.update({ where: { id: req.params.id }, data: req.body }));
});

app.delete('/api/tenants/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  await prisma.tenant.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- TRIPS ---
app.get('/api/trips', authenticate, async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  let partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  if (isPartner && partnerName) {
    // One company = one dashboard: adopt the oldest account's exact spelling so
    // "Saba Steel" and "saba steel" accounts share one trip list.
    const canonical = await prisma.user.findFirst({
      where: { role: 'Customer Portals (External)', partnerCompanyName: { equals: partnerName, mode: 'insensitive' }, id: { not: req.user.id } },
      orderBy: { createdAt: 'asc' },
      select: { partnerCompanyName: true },
    });
    if (canonical?.partnerCompanyName) partnerName = canonical.partnerCompanyName;
  }
  const filter = isPartner && partnerName ? { customer: { equals: partnerName, mode: 'insensitive' } } : {};
  res.json(await prisma.trip.findMany({ where: filter, orderBy: { createdAt: 'desc' } }));
});

app.post('/api/trips', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Tracking', 'Customer Portals (External)'), async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  /*
   * PARTNER-ON-BEHALF: the Transport Manager (or Platform Admin / Fleet Ops)
   * raises the very same request FOR a partner. Silver Steel buys haulage from
   * the yard and phones it in; the paperwork should look exactly like a request
   * Silver Steel raised itself — same `customer`, same lifecycle, visible on
   * their own portal. `onBehalfOfPartner` (or `requestedForPartner`) names the
   * company, and the spelling already on file wins, so the partner's own
   * dashboard and this row can never disagree.
   */
  const onBehalfRaw = isPartner
    ? ''
    : String(req.body?.onBehalfOfPartner || req.body?.requestedForPartner || '').trim();
  const onBehalfCompany = onBehalfRaw ? await canonicalPartnerCompany(onBehalfRaw) : null;
  const raisedForPartner = !isPartner && !!onBehalfCompany;
  const raisedForCustomer = !isPartner && !raisedForPartner
    ? (String(req.body.customer || '').trim() || null)
    : null;

  // Prevent mass-assignment by explicitly picking allowed fields
  const data: any = {
    driverName: req.body.driverName || 'Unassigned',
    truckReg: req.body.truckReg || 'Unassigned',
    tailType: req.body.tailType || null,
    // Partner requests carry their own truck type — the assignment PATCH below
    // writes tailType and must never clobber what was requested.
    requestedTruckType:
      req.body.requestedTruckType || req.body.truckType || req.body.tailType || null,
    pickup: req.body.pickup || '',
    dropoff: req.body.dropoff || '',
    // Optional: the street address at the destination, as the partner typed it.
    dropoffAddress: req.body.dropoffAddress || null,
    customerConsignee: req.body.customerConsignee || '',
    customer: isPartner ? partnerName : (raisedForPartner ? onBehalfCompany : raisedForCustomer),
    cargo: req.body.cargo || '',
    loadingSite: req.body.loadingSite || null,
    tailNumber: req.body.tailNumber || null,
    // A request raised FOR a partner enters the lifecycle pending, exactly as
    // if the partner had raised it — it is a request, not a private draft.
    // PARTNER-LOCK (B6): a partner can never start its own dispatch lifecycle
    // however the client sends the payload — its request always enters as
    // 'Requested' and waits for the Transport Manager.
    status: isPartner ? 'Requested' : (req.body.status || (raisedForPartner ? 'Requested' : 'Draft')),
  };
  // Who raised it travels on the row's own cost sheet (the same JSON the
  // approvals live on), so the audit trail survives without a new column.
  if (raisedForPartner) {
    data.directCosts = {
      raisedOnBehalf: {
        company: onBehalfCompany,
        by: req.user?.name || req.user?.email || 'Transport Manager',
        role: req.user?.role || 'Transport Manager',
        at: new Date().toISOString(),
      },
    };
  }
  const trip = await prisma.trip.create({ data });
  // partner-sites-optin-patch: auto-collector removed from POST /api/trips
  if (raisedForPartner) {
    // Both sides are told in ONE write: the partner sees the request on his own
    // dashboard (his bell is scoped to `Partner:<Company>`) and the Transport
    // Manager's queue carries it as work. Nobody re-types anybody's paperwork.
    void notify('Approvals', 'New Delivery Request',
      `${onBehalfCompany} requested a ${data.tailType || 'truck'} for ${data.customerConsignee || 'a customer'} to ${data.dropoff} (raised by ${req.user?.name || 'the Transport Manager'}).`,
      'info', `Partner:${onBehalfCompany},Transport Manager,Fleet Operations`,
      { module: 'Partners', eventKey: 'request.submitted_on_behalf', refId: trip.id, refLabel: dispatchRef(trip.id), actionRoles: ['Transport Manager', 'Fleet Operations'] });
  } else if (isPartner) {
    // A partner's request waits on the Transport Manager FIRST; Fleet Operations
    // is told it exists but has nothing to do until it is approved.
    void notify('Approvals', 'New Delivery Request', `${partnerName} requested a ${data.tailType || 'truck'} for ${data.customerConsignee || 'a customer'} to ${data.dropoff}.`, 'info', 'Transport Manager,Fleet Operations', { module: 'Partners', eventKey: 'request.submitted', refId: trip.id, refLabel: dispatchRef(trip.id), actionRoles: ['Transport Manager'] });
    // partner-received-notice: the partner gets the receipt TOO. Their follow-up
    // starts the moment they send: this lands in their bell immediately, and
    // every later move (approved, truck assigned, departed, checkpoint,
    // completed) rides the same channel.
    void notify('Approvals', 'Request Received', `We received your delivery request ${dispatchRef(trip.id)} — ${data.tailType || 'truck'} for ${data.customerConsignee || 'your customer'} to ${data.dropoff}. The Transport Manager will review it and you will be notified at every step.`, 'info', `Partner:${partnerName}`, { module: 'Partners', eventKey: 'request.received', refId: trip.id, refLabel: dispatchRef(trip.id) });
  } else {
    void notify('Operations', 'Dispatch Created', `Dispatch ${dispatchRef(trip.id)} created for ${data.customer || 'internal operations'} (${data.pickup} → ${data.dropoff}).`, 'info', 'Transport Manager,Fleet Operations', { module: 'Fleet Operations', eventKey: 'dispatch.created', refId: trip.id, refLabel: dispatchRef(trip.id) });
  }
  res.json(trip);
});

/* The Transport Manager's partner picker: every company the yard hauls for. */
app.get('/api/partners', authenticate, async (_req: any, res) => {
  try {
    res.json(await partnerCompanies());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trips/:id', authenticate, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  if (isPartner && !samePartnerCompany(trip.customer, partnerName)) return res.status(403).json({ error: 'Forbidden' });
  res.json(trip);
});

app.patch('/api/trips/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Customer Portals (External)'), async (req: any, res) => {
  // A partner may amend its OWN pending request — and nothing else. These are the
  // only fields a request owns; status/tail/driver/costs stay with the operators.
  const isPartner = req.user.role === 'Customer Portals (External)';
  const PARTNER_EDITABLE_TRIP_FIELDS = [
    'requestedTruckType',
    'pickup',
    'dropoff',
    'customerConsignee',
    'cargo',
    'loadingSite',
    'dropoffAddress',
    // A partner may clear the TM's note once they have corrected the request.
    'partnerNote',
  ];
  const PARTNER_EDITABLE_STATUSES = ['Requested', 'Awaiting Approval'];
  if (isPartner) {
    const existing = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Request not found' });
    const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
    if (!samePartnerCompany(existing.customer, partnerName)) {
      return res.status(403).json({ error: 'You can only modify requests raised by your own company.' });
    }
    if (!PARTNER_EDITABLE_STATUSES.includes(existing.status)) {
      return res
        .status(403)
        .json({ error: 'This request can no longer be modified — it has already been processed.' });
    }
  }

  // Explicitly prevent overriding ID or timestamps. headId/tailId stay UI
  // references, but driverId is now a REAL column (DRIVER-IDENTITY, 30 Oct
  // 2026): the dispatch records the roster row that owns the run, so every
  // guard binds on identity instead of a name two men can share.
  const ALLOWED_TRIP_FIELDS = isPartner
    ? PARTNER_EDITABLE_TRIP_FIELDS
    : ['driverName', 'driverId', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'dropoffAddress', 'customerConsignee', 'customer', 'cargo', 'loadingSite', 'revenue', 'status', 'directCosts', 'tailNumber', 'sendBackReason', 'partnerNote', 'estimatedDate', 'startTime', 'estimatedDays', 'eta', 'gateOutBy', 'gateInBy'];
  const raw = { ...req.body };
  // driverStaffId is SERVER-DERIVED from the roster row, never accepted from
  // the wire — a client cannot stamp identity it invented.
  delete raw.driverStaffId;
  const data: any = {};
  for (const key of ALLOWED_TRIP_FIELDS) {
    if (raw[key] !== undefined) data[key] = raw[key];
  }
  // DRIVER-IDENTITY: a driverId on the wire is validated against the roster,
  // and the row wins over typing — the bound man's name and P-number are
  // written from the row itself, so "mobammed"-grade typos can never create
  // a phantom driver on a live dispatch. Clearing driverId clears the binding
  // (the display name the operator typed remains, if any).
  let boundDriver: { id: string; staffId: string | null; name: string; status: string } | null = null;
  if (!isPartner && data.driverId !== undefined) {
    const did = String(data.driverId || '').trim();
    if (did) {
      const row = await prisma.driver.findUnique({ where: { id: did } });
      if (!row) {
        return res.status(400).json({ error: 'driverId ' + did + ' names no driver in the roster — pick the driver from the Salary Number list.' });
      }
      boundDriver = { id: row.id, staffId: row.staffId, name: row.name, status: row.status };
      data.driverStaffId = row.staffId;
      if (row.name) data.driverName = row.name;
    } else {
      data.driverId = null;
      data.driverStaffId = null;
    }
  }
  // loadingSite is a String column; a list payload is joined, never rejected.
  if (Array.isArray(data.loadingSite)) {
    data.loadingSite = data.loadingSite.filter(Boolean).join(', ') || null;
  }
  const before = await prisma.trip.findUnique({ where: { id: req.params.id } });
  // DRIVER-BUSY GUARD (identity, 30 Oct 2026): assigning a man to a dispatch
  // while ANOTHER open dispatch already binds HIM (by driverId) is refused and
  // names the dispatch holding him — the same one-truck rule the fleet runs,
  // carried to the man. Legacy dispatches without a binding still match by
  // exact full name, so a shared name is resolved by the unique-row rule: only
  // when EXACTLY ONE roster driver carries that name does the legacy trip
  // bind him, which is already the register's evidence rule.
  if (!isPartner && boundDriver && data.driverId !== (before && before.driverId)) {
    const openSibs = await prisma.trip.findMany({
      where: {
        id: { not: before ? before.id : '__none__' },
        status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
      },
      select: { id: true, driverId: true, driverName: true, truckReg: true, status: true },
    });
    const nameKeyOf = (v: any) => String(v || '').trim().toLowerCase();
    // For the legacy name-armed rows: is this exact name held by exactly one driver?
    const rosterSameName = await prisma.driver.count({ where: { name: boundDriver.name } });
    const clash = openSibs.find((t) => {
      if (t.driverId) return t.driverId === boundDriver!.id;
      if (nameKeyOf(t.driverName) !== nameKeyOf(boundDriver!.name)) return false;
      return rosterSameName === 1; // unique-name legacy binding only
    });
    if (clash) {
      return res.status(409).json({
        error:
          (boundDriver.name || 'This driver') + (boundDriver.staffId ? ' (' + boundDriver.staffId + ')' : '') +
          ' is already committed to an open dispatch — ' + dispatchRef(clash.id) + ' (' + clash.status +
          (clash.driverName ? ' · ' + clash.driverName : '') + (clash.truckReg ? ', ' + String(clash.truckReg) : '') +
          '). Close or reassign that dispatch first, or pick another driver. The assignment was not saved.',
        conflict: clash.id,
      });
    }
  }
  // A DECLINED request is CLOSED. No later action may move it back onto the
  // road: a gate departure, a tracking location, a fleet assignment and a
  // scheduling all write a live status, and without this check any one of them
  // turned a declined request back into "In transit" for the customer and for
  // the Transport Manager. The only accepted move away from Stopped is the
  // deliberate reversal — the Transport Manager (or Platform Admin) returning it
  // to the customer as "Requested" to correct.
  if (before && before.status === 'Stopped' && data.status !== undefined && data.status !== 'Stopped') {
    const mayReopen =
      !isPartner &&
      data.status === 'Requested' &&
      ['Transport Manager', 'Platform Admin'].includes(req.user.role);
    if (!mayReopen) {
      return res.status(409).json({
        error:
          'This request was declined and is closed — it cannot be set to "' +
          data.status +
          '". The Transport Manager can return it to the customer to re-raise instead.',
      });
    }
  }
  // GATE_ACTOR_V3 — the server derives WHO is stamping, never the client.
  // Security moving a dispatch to En Route is the Log Out stamp: sign it with
  // the account's own name so the Guard Activity Ledger shows the person.
  const gateActor = (() => {
    const direct = String(req.user?.name || '').trim();
    if (direct) return direct;
    const raw = String(req.user?.roles || req.user?.role || '').trim();
    const first = raw.split(',')[0]?.trim();
    return first ? first.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Security';
  })();
  // RETURN-AUDIT (meeting: "can the back end show which user triggered
  // returns?") — EVERY transition to Completed is stamped by the server with
  // the authenticated account, on any path (the gate window, Tracking's
  // return action, a partner-visible closure). A client-supplied gateInBy no
  // longer decides who the record blames: the token does.
  const completingNow = data.status === 'Completed' && before && before.status !== 'Completed';
  if (completingNow) {
    data.gateInBy = gateActor;
    // RETURN-STAMP-ETA: the same rule the gate account path applies below — a
    // completed run must always carry its own return moment. A Transport
    // Manager (or Tracking) closing a run through the dispatch screen stamped
    // gateInBy but left eta null, so the dispatch history screens showed a
    // return with the name and no date+time (the "Completed but the return
    // went blank" rows the live probe found, 24 Oct 2026).
    if (!String((before as any).eta || data.eta || '').trim()) data.eta = data.eta || autoStamp(new Date());
    const dcAudit =
      data.directCosts && typeof data.directCosts === 'object'
        ? { ...(data.directCosts as any) }
        : before.directCosts && typeof before.directCosts === 'object'
          ? { ...(before.directCosts as any) }
          : {};
    dcAudit.returnedBy = {
      by: gateActor,
      role: req.user?.role || '',
      at: new Date().toISOString(),
      via: 'trip-status-change',
    };
    data.directCosts = dcAudit;
    void notify('Security', 'Return logged outside the gate',
      dispatchRef(before.id) + ' was completed (' + gateActor + ', ' + String(req.user?.role || '') +
      '). If the truck is not physically back, restore it from this dispatch.',
      'warning', 'Transport Manager,Platform Admin,Security',
      { module: 'Gate Security', eventKey: 'gate.remote_return', refId: before.id, refLabel: dispatchRef(before.id), actionRoles: ['Transport Manager'] });
  }
  const isGateAccount = ['Security', 'Gate Security', 'Gate'].includes(String(req.user?.role || ''))
    || /(^|,)(security|gate)(,|$)/i.test(String(req.user?.roles || ''));
  if (isGateAccount && before && before.status !== data.status) {
    if (data.status === 'En Route') {
      data.gateOutBy = gateActor;
      // The gate's Log Out is also the readable departure stamp — without it
      // the departure column had only the status word and no date+time.
      if (!String(before.startTime || '').trim()) data.startTime = data.startTime || autoStamp(new Date());
    }
    if (data.status === 'Completed') {
      data.gateInBy = gateActor;
      // The gate's Log In is the return: stamp `eta` if the run never wrote
      // one, so the return column shows the real moment instead of the bare
      // word "Returned".
      if (!String(before.eta || '').trim()) data.eta = data.eta || autoStamp(new Date());
    }
  }
  // ONE-TERRITORY GUARD (Fortune/Adyems, 26 Oct 2026): one truck, one open
  // dispatch — full stop. The legacy auto-flip built SCHEDULED SIBLINGS on its
  // own, and a re-approval could double-book a rig that already carries a load.
  // Any move that schedules a truck in gets checked against the fleet's
  // dispatch truth first: if another open dispatch names the same truck (exact
  // cap/plate tokens, the GATERETURN:V5 doctrine), the scheduling is refused
  // with the blocking dispatch named, and the Transport Manager resolves it —
  // return the old load or reassign — instead of the gate discovering two
  // drivers drawn to the same rig at 06:00.
  if (data.status === 'Scheduled' && before) {
    const ownReg = String(data.truckReg ?? before.truckReg ?? '').trim();
    if (ownReg) {
      const ownKeys = truckKeysOf({ truckReg: ownReg, tailNumber: String(data.tailNumber ?? before.tailNumber ?? '') });
      const openSiblings = await prisma.trip.findMany({
        where: {
          id: { not: before.id },
          status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
        },
        select: { id: true, truckReg: true, driverName: true, status: true, tailNumber: true },
      });
      const clash = openSiblings.filter((t) => truckKeysOf(t).some((k) => ownKeys.includes(k)));
      if (clash.length) {
        const listing = clash
          .map((t) => dispatchRef(t.id) + ' (' + t.status + (t.driverName ? ' · ' + t.driverName : '') + ', ' + String(t.truckReg) + ')')
          .join('; ');
        // SPEAK THE BLOCKING ASSET (Fortune, 29 Oct: "this error is wrong"): a
        // clash on the TAIL reads as "this truck" and sends the TM hunting a
        // truck that is fine — the head is free, the BODY is out on another
        // load. Name which one it is and the way out: the tail goes back via
        // Send Back to Fleet Ops for a re-pick, the truck via closing that
        // dispatch if it is physically home.
        const ownHead = TRUCK_KEY(String(ownReg).split('/')[0] || '');
        const ownTail = TRUCK_KEY(String(data.tailNumber ?? before.tailNumber ?? '') || String(ownReg).split('/')[1] || '');
        const tailClash = clash.some((t) => {
          if (!ownTail || ownTail.length < 4) return false;
          const theirs = [t.tailNumber, String(t.truckReg || '').split('/')[1]].map((v) => TRUCK_KEY(v));
          return theirs.includes(ownTail);
        });
        const headClash = clash.some((t) => ownHead && ownHead.length >= 4 && truckKeysOf(t).includes(ownHead));
        const what = tailClash && !headClash
          ? 'The tail ' + (String(data.tailNumber ?? before.tailNumber ?? '').trim() || String(ownReg).split('/')[1] || '').trim() + ' on this request is already out on an open dispatch'
          : 'This truck already carries an open dispatch';
        const wayOut = tailClash && !headClash
          ? 'Send this request back to Fleet Operations to pick another tail, or close that dispatch if the body is physically back.'
          : 'Send this request back to Fleet Operations for a re-assignment, or close that dispatch if the truck is physically back in the yard.';
        return res.status(409).json({
          error:
            what + ' — ' + listing + '. ' + wayOut,
          conflict: clash.map((t) => t.id),
        });
      }
    }
  }
  // ASSET-BUSY-AT-ASSIGNMENT (Daniel/Fortune, 29 Oct 2026): the one-truck rule
  // was only enforced at FINAL APPROVAL, so Fleet Ops could hang a tail that is
  // already in transit onto a fresh request — and the refusal surfaced a day
  // later on the TM's desk as "Failed to approve", with trucks queued at the
  // gate and nobody able to say why. The yard rule is enforced WHERE the choice
  // is made now: the moment a truck head or tail body is (re)assigned, any open
  // dispatch that already holds that exact head or body refuses the save and
  // names itself. Registry-resolved: only a REAL Truck row blocks a head and
  // only a REAL Tail row blocks a body, so a tail TYPE word ("Flat") or a test
  // string can never freeze an assignment.
  if (!isPartner && before && (data.truckReg !== undefined || data.tailNumber !== undefined)) {
    const newReg = String(data.truckReg ?? before.truckReg ?? '').trim();
    const newTail = String(data.tailNumber ?? before.tailNumber ?? '').trim();
    const regChanged = Boolean(newReg) && newReg !== String(before.truckReg ?? '').trim();
    const tailChanged = Boolean(newTail) && newTail !== String(before.tailNumber ?? '').trim();
    if (regChanged || tailChanged) {
      const regHeadToken = TRUCK_KEY(String(newReg).split('/')[0] || '');
      const regTailToken = TRUCK_KEY(String(newReg).includes('/') ? String(newReg).split('/')[1] : '');
      const tailToken = TRUCK_KEY(newTail);
      const [trucks, tails] = await Promise.all([prisma.truck.findMany(), prisma.tail.findMany()]);
      const headRow = regHeadToken
        ? trucks.find((t) => TRUCK_KEY(t.cabId) === regHeadToken || TRUCK_KEY(t.registration) === regHeadToken)
        : undefined;
      const tailRow = (tailToken || regTailToken)
        ? tails.find((t) => TRUCK_KEY(t.number) === (tailToken || regTailToken))
        : undefined;
      if (headRow || tailRow) {
        const openSiblings = await prisma.trip.findMany({
          where: {
            id: { not: before.id },
            status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
          },
          select: { id: true, truckReg: true, driverName: true, status: true, tailNumber: true },
        });
        const heldKeys = new Set<string>();
        if (headRow) {
          heldKeys.add(TRUCK_KEY(headRow.cabId));
          heldKeys.add(TRUCK_KEY(headRow.registration));
        }
        const tailHeldKey = tailRow ? TRUCK_KEY(tailRow.number) : '';
        const tailHeldBy = (t: any) => {
          if (!tailHeldKey) return false;
          const own = [t.tailNumber, String(t.truckReg || '').split('/')[1]]
            .map((v) => TRUCK_KEY(v))
            .filter(Boolean);
          return own.includes(tailHeldKey);
        };
        const headHeldBy = (t: any) =>
          Boolean(headRow) && truckKeysOf(t).some((k) => heldKeys.has(k));
        const blocking = openSiblings.filter((t) => headHeldBy(t) || tailHeldBy(t));
        if (blocking.length) {
          // Name the asset the open dispatch ACTUALLY holds — when both the head
          // and the tail resolve, the message must blame the held one, not the
          // first that matched the registry.
          const headBlocked = blocking.some((t) => headHeldBy(t));
          const who = headBlocked
            ? 'Truck ' + String(headRow.cabId || headRow.registration) + (headRow.registration ? ' (' + headRow.registration + ')' : '')
            : 'Tail ' + String(tailRow.number);
          const listing = blocking
            .slice(0, 3)
            .map((t) => dispatchRef(t.id) + ' (' + t.status + (t.driverName ? ' · ' + t.driverName : '') + ', ' + String(t.truckReg) + ')')
            .join('; ');
          return res.status(409).json({
            error:
              who + ' is already held by an open dispatch — ' + listing + '. Close or reassign that dispatch first, or pick another ' + (headBlocked ? 'truck' : 'tail') + '. The assignment was not saved.',
            conflict: blocking.map((t) => t.id),
          });
        }
      }
    }
  }
  // SECURITY NO-SHOW OVERRIDE — the gate refuses a truck the TM released when
  // the physical asset/crew is wrong or absent: the dispatch goes to Stopped,
  // the release stamps are cleared, and the TM is told to re-approve.
  if (isGateAccount && data.status === 'Stopped' && before && ['Scheduled', 'En Route', 'Loaded'].includes(before.status)) {
    data.gateOutBy = gateActor;
    data.gateInBy = null;
    data.eta = null;
    void notify('Security', 'Truck Stopped At Gate', `Dispatch ${dispatchRef(before.id)} was stopped at the gate by ${gateActor} (asset/crew problem). The Transport Manager must re-approve before it can leave.`, 'warning', 'Transport Manager,Platform Admin,Fleet Operations', {
      module: 'Gate Security',
      eventKey: 'gate.stopped',
      refId: before.id,
      refLabel: dispatchRef(before.id),
      actionRoles: ['Transport Manager'],
    });
  }
  // SECURITY RETURN-TO-YARD — a truck already on the road that the gate pulls
  // back is stamped as a return by the same account, so the ledger never loses
  // who ended the movement.
  if (isGateAccount && data.status === 'Delayed' && before && ['En Route', 'Loaded'].includes(before.status)) {
    data.gateInBy = gateActor;
  }
  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });
  /*
   * THE RETURN STAMP FREES THE DRIVER (return-frees-driver).
   *
   * A dispatch that came back must not leave its driver committed: availability
   * is derived from the LIVE dispatch list, so a Completed trip with the man
   * still marked 'On Trip' is a driver the fleet desk can never offer again —
   * which is exactly how men ended up stranded. The client closes the trip and
   * the truck; the driver is released HERE, in the same write that records the
   * return, so no half-finished return can strand anyone.
   */
  /* A MOVEMENT MOVES THE TRUCK. Leaving the gate puts it out of the yard; a
     * logged return sends it to engineering. Nobody types this again. */
    // lifecycle-coupling-v2: the yard follows the TRANSITION, not the fields the
    // client happened to send — the server derives gate stamps for gate accounts,
    // so keying on raw.* left those trucks 'Available' while dispatched.
    const movingHome = String(trip.status) === 'Completed';
    const movingOut =
      ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'].includes(String(trip.status));
    if (movingHome) {
      void coupleTruckRegistry(trip, 'home');
      // The TAIL rode in with the truck — it follows the head home to Check Up
      // in the same transition, so no return can strand a body out of yard.
      void coupleTailRegistry(trip, 'home');
    } else if (movingOut) {
      void coupleTruckRegistry(trip, 'out');
      void coupleTailRegistry(trip, 'out');
    }
    // lifecycle-coupling-v2: a COMPLETED dispatch frees its driver — full stop.
  // The old check demanded gateInBy in the request body, which a tracking-leg
  // completion never carries, stranding the man as 'On Trip' with no load.
  if (String(trip.status) === 'Completed' && before && before.status !== 'Completed' && trip.driverName) {
    try {
      // DRIVER-IDENTITY: free the man the dispatch is BOUND to — by driverId
      // when the binding exists; legacy rows fall back to the exact name, and
      // only when exactly one roster driver carries that name (so freeing a
      // shared name can never release a namesake who did not ride this truck).
      // driver-duty sync is the safety net for any row neither lands on.
      let freedWhere: any = null;
      if (trip.driverId) freedWhere = { id: trip.driverId, status: { in: ['On Trip', 'Active'] } };
      else {
        const sameName = await prisma.driver.count({ where: { name: trip.driverName } });
        if (sameName === 1) freedWhere = { name: trip.driverName, status: { in: ['On Trip', 'Active'] } };
      }
      if (freedWhere) {
        await prisma.driver.updateMany({ where: freedWhere, data: { status: 'Active' } });
      }
    } catch (e: any) {
      console.error('return could not free the driver:', e?.message || e);
    }
  }
  // Stamp first dispatch (final TM approval -> Scheduled) for the Date Dispatched column.
  if (trip.status === 'Scheduled' && !trip.dispatchedAt) {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { dispatchedAt: new Date() } });
    trip.dispatchedAt = stamped.dispatchedAt;
  }
  // First TM approval = "Seen" for the partner; stamp it for the timeline.
  if (trip.status === 'Approved' && !trip.approvedAt) {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { approvedAt: new Date() } });
    trip.approvedAt = stamped.approvedAt;
  }
  /*
   * SUPERSEDE-ON-DEPARTURE (the permanent fix, 29 Oct 2026): a rig cannot be on
   * two loads. The moment the gate logs a truck OUT — this dispatch moves to En
   * Route — any OLDER open moving dispatch naming the same head or tail is
   * provably already over: the yard just physically sent that rig out again on
   * this one. Those stale rows are what blocked approvals with "this truck
   * already carries an open dispatch" for days while the desk waited on a human
   * to close them. They close themselves here — status Completed, the departing
   * stamp as the end of the run, an honest note on the record, a System row in
   * the audit trail and a notice to the Transport Manager. The registry is NOT
   * sent home (the rig is out on the new load — the departure's own coupling
   * already said so), and drivers are left to the duty-sync, which frees anyone
   * the live dispatch list no longer holds.
   */
  if (String(trip.status) === 'En Route' && before && before.status !== 'En Route') {
    try {
      const depKeys = truckKeysOf(trip);
      if (depKeys.length) {
        const older = await prisma.trip.findMany({
          where: {
            id: { not: trip.id },
            status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
          },
        });
        const superseded = older.filter(
          (o) =>
            // Date objects compare by moment — String(Date) drops milliseconds
            // and two trips created in the same second compared EQUAL, skipping
            // the supersede (found live: the 7a95c/a950e pair, 10ms apart).
            new Date(o.createdAt).getTime() < new Date(trip.createdAt).getTime() &&
            truckKeysOf(o).some((k) => depKeys.includes(k)),
        );
        for (const o of superseded) {
          const dc = o.directCosts && typeof o.directCosts === 'object' ? { ...(o.directCosts as any) } : {};
          dc.returnedBy = {
            by: gateActor || 'S.1 Petroline',
            role: req.user?.role || '',
            at: new Date().toISOString(),
            confirmed: true,
            note: 'Superseded: the yard dispatched the same rig on ' + dispatchRef(trip.id) +
              ' — this run was already over. Closed automatically; the registry was left as the new departure set it.',
          };
          await prisma.trip.update({
            where: { id: o.id },
            data: {
              status: 'Completed',
              eta: o.eta || autoStamp(new Date()),
              directCosts: dc,
            },
          });
          void sysTrail(
            'Dispatch',
            'System Closed',
            dispatchRef(o.id) + ' (' + String(o.truckReg || '—') + ') superseded by ' + dispatchRef(trip.id) +
              ' — the gate logged the same head/tail out on the newer load, so the older run was closed.',
          );
          void notify('Transport Manager', 'Stale dispatch closed',
            dispatchRef(o.id) + ' (' + String(o.truckReg || '—') + ') named a rig the gate just dispatched on ' +
            dispatchRef(trip.id) + ' — it was closed automatically. Restore it from this notice if that is wrong.',
            'warning', 'Transport Manager,Platform Admin,Fleet Operations', {
              module: 'Dispatch', eventKey: 'dispatch.superseded', refId: o.id, refLabel: dispatchRef(o.id),
              actionRoles: ['Transport Manager'],
            });
        }
        if (superseded.length) {
          console.log('[supersede] departure of ' + dispatchRef(trip.id) + ' closed ' + superseded.length + ' older dispatch(es) naming the same rig.');
        }
      }
    } catch (e: any) {
      console.error('[supersede] failed:', e?.message || e);
    }
  }
  // Fleet Ops assignment (driver/truck written) — stamp the first assignment.
  const assignmentWritten =
    raw.driverName !== undefined || raw.truckReg !== undefined || raw.tailNumber !== undefined;
  if (assignmentWritten && !trip.assignedAt && trip.status !== 'Requested' && trip.status !== 'Draft') {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { assignedAt: new Date() } });
    trip.assignedAt = stamped.assignedAt;
  }
  const notice = TRIP_STATUS_NOTICES[trip.status];
  // `module` and `action` travel WITH the catalogue entry, so the module that
  // owns the transition is named rather than guessed from the wording.
  const noticeMeta = notice as any;
  if (notice && before && before.status !== trip.status) {
    // Partner notices are additionally tagged with THIS trip's company
    // (Partner:<Company>) so each partner only sees its own cargo alerts.
    const audience = notice.audience.includes('Partner') && trip.customer
      ? notice.audience + ',Partner:' + trip.customer
      : notice.audience;
    void notify(notice.category, notice.title, notice.body(trip), notice.severity, audience, {
      module: noticeMeta.module,
      eventKey: 'dispatch.' + String(trip.status).toLowerCase(),
      refId: trip.id,
      refLabel: dispatchRef(trip.id),
      actionRoles: noticeMeta.action ?? [],
    });
  }
  res.json(trip);
});

app.delete('/api/trips/:id', authenticate, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const isPartner = req.user.role === 'Customer Portals (External)';
  if (isPartner) {
    // Partners may withdraw their OWN request while it is still pending.
    const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
    if (
      !samePartnerCompany(trip.customer, partnerName) ||
      !['Requested', 'Awaiting Approval'].includes(trip.status)
    ) {
      return res.status(403).json({ error: 'Only pending requests you created can be deleted.' });
    }
  } else if (req.user.role !== 'Platform Admin') {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }
  await prisma.trip.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- EXPENSES ---
app.get('/api/expenses', authenticate, async (_req, res) => {
  res.json(await prisma.expense.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/expenses', authenticate, authorize('Transport Manager', 'Platform Admin', 'Accounts', 'Fleet Operations', 'HR'), async (req, res) => {
  // Whitelist the Expense columns the board actually edits. Straying client
  // fields used to 500 the write, and `amount` arrived as text half the time.
  const ALLOWED_EXPENSE_FIELDS = ['requester', 'department', 'type', 'category', 'amount', 'description', 'status'];
  const data: any = {};
  for (const key of ALLOWED_EXPENSE_FIELDS) if (req.body?.[key] !== undefined) data[key] = req.body[key];
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount must be a non-negative number' });
  data.amount = amount;
  res.json(await prisma.expense.create({ data }));
});
app.patch('/api/expenses/:id', authenticate, authorize('Transport Manager', 'Platform Admin', 'Accounts', 'Fleet Operations', 'HR'), async (req, res) => {
  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  const ALLOWED_EXPENSE_FIELDS = ['requester', 'department', 'type', 'category', 'amount', 'description', 'status'];
  const data: any = {};
  for (const key of ALLOWED_EXPENSE_FIELDS) if (req.body?.[key] !== undefined) data[key] = req.body[key];
  if (data.amount !== undefined) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount must be a non-negative number' });
    data.amount = amount;
  }
  res.json(await prisma.expense.update({ where: { id: req.params.id }, data }));
});

// --- WORK ORDERS ---
app.get('/api/work-orders', authenticate, async (_req, res) => {
  res.json(await prisma.workOrder.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/work-orders', authenticate, authorize('Engineering', 'Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  // Validate before writing: `truckReg` is the record's identity (the fleet
  // audit matches it against the registry) and an empty defect produced a job
  // no workshop could act on.
  const truckReg = String(req.body?.truckReg || '').trim();
  const defect = String(req.body?.defect || '').trim();
  if (!truckReg) return res.status(400).json({ error: 'Name the truck this job is for.' });
  if (!defect) return res.status(400).json({ error: 'Log the defect the workshop must fix.' });
  const ALLOWED_WO_FIELDS = ['truckReg', 'defect', 'category', 'priority', 'mechanic', 'reportedBy', 'cost', 'notes', 'status', 'severity', 'inspectedBy', 'startedAt', 'estimatedReadyAt', 'completedAt'];
  const data: any = {};
  for (const key of ALLOWED_WO_FIELDS) if (req.body?.[key] !== undefined) data[key] = req.body[key];
  res.json(await prisma.workOrder.create({ data }));
});
app.patch('/api/work-orders/:id', authenticate, authorize('Engineering', 'Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  // Same whitelist as create — an unknown field in an update payload must
  // correct the job, not kill the save with a Prisma 500.
  const ALLOWED_WO_FIELDS = ['truckReg', 'defect', 'category', 'priority', 'mechanic', 'reportedBy', 'cost', 'notes', 'status', 'severity', 'inspectedBy', 'startedAt', 'estimatedReadyAt', 'completedAt'];
  if (req.body?.cost !== undefined && (!Number.isFinite(Number(req.body.cost)) || Number(req.body.cost) < 0)) {
    return res.status(400).json({ error: 'cost must be a non-negative number' });
  }
  if (req.body?.status !== undefined && !["Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed", "Cancelled"].includes(String(req.body.status))) {
    return res.status(400).json({ error: 'Unknown work-order status: ' + String(req.body.status) });
  }
  const data: any = {};
  if (req.body?.status === 'Completed' && !req.body?.completedAt) data.completedAt = new Date();
  for (const key of ALLOWED_WO_FIELDS) if (req.body?.[key] !== undefined) data[key] = req.body[key];
  res.json(await prisma.workOrder.update({ where: { id: req.params.id }, data }));
});
// Incorrect records (e.g. sent back) can be removed entirely — Engineering /
// TM only, so the workshop board keeps its audit trail by default.
app.delete('/api/work-orders/:id', authenticate, authorize('Engineering', 'Platform Admin', 'Transport Manager'), async (req, res) => {
  await prisma.workOrder.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/**
 * The check-up verdict, exactly as the approved design inspects it.
 *
 * No issues  → the truck returns to Available (and any open job closes).
 * Issues     → the truck goes Under Maintenance, a work order carries the
 *               defect + severity + inspector, and any listed spare parts land
 *               on the Head of Engineering's desk as one grouped request.
 */
app.get('/api/engineering/technicians', authenticate, async (req: any, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'Active',
        OR: [{ role: { contains: 'Engin' } }, { roles: { contains: 'Engin' } }],
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    res.json(users.map((u: any) => u.name).filter(Boolean));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/engineering/inspections', authenticate, authorize('Engineering', 'Engineering & Maintenance', 'Engineering and Maintenance', 'Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req: any, res) => {
  const headId = String(req.body?.headId || '').trim() || null;
  const tailId = String(req.body?.tailId || '').trim() || null;
  const truckReg = String(req.body?.truckReg || '').trim();
  const result = String(req.body?.result || '').trim();
  const defect = String(req.body?.defect || '').trim();
  const severity = String(req.body?.severity || '').trim();
  const inspectedBy = String(req.body?.inspectedBy || req.user?.name || '').trim();
  // ASSIGN-ENGINEER: the hands-on engineer the defect is given to — travels on
  // the work order as `mechanic`, the field every surface already shows.
  const assignedTo = String(req.body?.assignedTo || '').trim();
  const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
  if (!headId && !tailId) return res.status(400).json({ error: 'Choose the truck that was inspected.' });
  if (!['no-issues', 'issues'].includes(result)) return res.status(400).json({ error: 'result must be no-issues or issues.' });
  if (result === 'issues' && !defect) return res.status(400).json({ error: 'Log the defect that was found.' });
  try {
    const by = actingUser(req);
    if (result === 'no-issues') {
      if (headId) await prisma.truck.updateMany({ where: { id: headId }, data: { status: 'Available' } });
      if (tailId) await prisma.tail.updateMany({ where: { id: tailId }, data: { status: 'Available' } });
      const open = await prisma.workOrder.findMany({ where: { truckReg, status: { notIn: ['Completed', 'Cancelled'] } }, orderBy: { createdAt: 'desc' }, take: 1 });
      if (open.length) {
        await prisma.workOrder.update({ where: { id: open[0].id }, data: { status: 'Completed', completedAt: new Date(), inspectedBy: inspectedBy || by } });
      }
      await notify('Engineering', 'Check-up passed — truck available', `${truckReg} passed inspection by ${inspectedBy || by} and is back to Available.`, 'success', 'Engineering,Fleet Operations,Transport Manager,Platform Admin', { module: 'Engineering', eventKey: 'engineering.checkup_passed', refLabel: truckReg });
      return res.json({ ok: true, result, truckReg });
    }
    if (headId) await prisma.truck.updateMany({ where: { id: headId }, data: { status: 'Maintenance' } });
    if (tailId) await prisma.tail.updateMany({ where: { id: tailId }, data: { status: 'Maintenance' } });
    const job = await prisma.workOrder.create({
      data: {
        truckReg,
        defect,
        category: 'General',
        priority: severity === 'Critical (Grounded)' ? 'Critical' : severity.startsWith('Major') ? 'High' : 'Medium',
        mechanic: assignedTo || '',
        reportedBy: inspectedBy || by,
        cost: 0,
        notes: `Check-up: ${defect}`,
        status: 'Reported',
        severity: severity || null,
        inspectedBy: inspectedBy || by,
      },
    });
    let group: string | null = null;
    const validParts = parts.filter((p: any) => String(p?.part || '').trim() && Math.trunc(Number(p?.quantity)) > 0);
    if (validParts.length) {
      group = 'EG-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      for (const p of validParts) {
        await prisma.inventoryRequisition.create({
          data: {
            workOrder: job.id,
            truckReg,
            mechanic: inspectedBy || by,
            part: String(p.part).trim(),
            itemId: String(p.itemId || '') || null,
            quantity: Math.trunc(Number(p.quantity)),
            reason: defect,
            unitCost: Number(p.unitCost) || 0,
            status: 'Awaiting HOE Review',
            requestGroup: group,
            description: defect,
            targetType: tailId && !headId ? 'Truck Tail' : 'Truck Head',
          },
        });
      }
    }
    await notify('Engineering', 'Defect logged — truck under maintenance', `${truckReg}: ${defect} (${severity || 'severity not set'}) — inspected by ${inspectedBy || by}.${group ? ` Parts ${group} awaiting HOE review.` : ''}`, 'warning', 'Engineering,Transport Manager,Platform Admin', { module: 'Engineering', eventKey: 'engineering.defect_logged', refId: job.id, refLabel: truckReg });
    res.status(201).json({ ok: true, result, job, group });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- GATE ---
// ---- Gate backfill: record trucks that left BEFORE the app went live ------
//
// Security ran the yard on paper until Tuesday. A truck already on the road
// has no dispatch to stamp, so its return could never be logged and it sat
// 'out of yard' forever. One endpoint, Security-only: it files a minimal
// dispatch marked En Route (the departure it never got), so the return flow —
// Log Return → Completed, tail to Check Up, driver freed — works unchanged.
app.post('/api/gate/backfill', authenticate, authorize('Security', 'Platform Admin', 'Transport Manager'), async (req: any, res) => {
  const plate = String(req.body?.plate || '').trim();
  if (!plate) return res.status(400).json({ error: 'plate (cap number or registration) is required' });
  const driverName = String(req.body?.driverName || '').trim() || 'Unassigned (pre-app trip)';
  const head = String(req.body?.head || '').trim();
  const tailNumber = String(req.body?.tailNumber || '').trim() || null;
  const tailType = String(req.body?.tailType || '').trim() || null;
  const note = String(req.body?.note || '').trim();
  const consignee = String(req.body?.customer || '').trim() || 'Pre-app dispatch';
  const when = req.body?.leftAt ? new Date(req.body.leftAt) : new Date();
  const stamp = isNaN(when.getTime())
    ? new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : when.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  try {
    const trip = await prisma.trip.create({
      data: {
        driverName,
        truckReg: head ? (plate.toUpperCase().startsWith(head.toUpperCase() + ' (') ? plate : head + ' (' + plate + ')') : plate,
        tailNumber,
        tailType,
        pickup: 'Yard',
        dropoff: String(req.body?.dropoff || '').trim() || note || 'Pre-app movement (backfilled)',
        customerConsignee: consignee,
        customer: String(req.body?.customer || '').trim() || null,
        cargo: 'Backfilled — departed before go-live',
        status: 'En Route',
        startTime: stamp,
        gateOutBy: (req.user?.name || 'Security') + ' (backfill)',
      },
    });
    res.json({ ok: true, tripId: trip.id, reference: dispatchRef(trip.id) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- The yard keeps itself true -------------------------------------------
//
// A truck's movement state is not an opinion someone types; it follows the
// dispatch. These helpers match a truck's own numbers (cap, plate) against the
// ones a dispatch carries — Trip.truckReg holds them TOGETHER, as
// "P062 (GGE98YK)", which is why matching is by containment rather than equality.
const TRUCK_KEY = (v: any) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

function truckKeysOf(trip: any): string[] {
  // "P062 (GGE98YK)" is TWO keys, not one combined: the cap AND the plate, and
  // either must match EXACTLY (GATERETURN:V5). A string match against the join
  // ("P062GGE98YK".includes(key)) is how one truck's plate closed other
  // trucks' dispatches. So the field is split into its whole tokens; the
  // joined key is kept as well — under EQUALITY only, never containment.
  const out = new Set<string>();
  for (const v of [trip?.truckReg, trip?.tailNumber]) {
    const whole = TRUCK_KEY(v);
    if (whole.length > 3) out.add(whole);
    for (const token of String(v || '').split(/[^0-9a-zA-Z]+/)) {
      const k = TRUCK_KEY(token);
      // TOKEN:FLOOR-4 (29 Oct 2026, the "wrong error" ticket): identity in this
      // fleet is never shorter than four characters — caps are P0xx, tails
      // B0xx, plates longer. A 3-char fragment is a hyphen artifact ("ABC" out
      // of TEST-ABC-123 and ABC-GRA-67 alike) and under exact equality it
      // made two DIFFERENT trucks clash on approval. Four or more, or not at all.
      if (k && k.length > 3) out.add(k);
    }
  }
  return Array.from(out);
}

function truckMatches(truck: any, keys: string[]): boolean {
  const own = [TRUCK_KEY(truck?.registration), TRUCK_KEY(truck?.cabId)].filter((k) => k.length > 3);
  // TRUCKMATCH:V2 (29 Oct 2026) — EXACT token equality only. The bidirectional
  // containment arm ("k.includes(o) || o.includes(k)") is how cap and plate
  // families moved each other: key "P062" contains "P06" and "B1001"
  // contains "B100", so stamping one dispatch could drag a NEIGHBOUR truck
  // to Out of Yard or Check Up. truckKeysOf() already hands in the whole
  // tokens (cap and plate split apart), so equality is all that is needed —
  // the same rule the gate return and the gate book now run.
  return own.some((o) => keys.includes(o));
}

/**
 * Move the trucks a dispatch names to the state the movement implies.
 * "out" = it has left the yard; "home" = it has come back to engineering.
 * Engineering's own verdicts (Maintenance, Accident) are never overwritten by
 * a movement; everything else follows the yard.
 */
async function coupleTruckRegistry(trip: any, movement: 'out' | 'home'): Promise<number> {
  try {
    const keys = truckKeysOf(trip);
    if (!keys.length) return 0;
    const trucks = await prisma.truck.findMany();
    const named = trucks.filter((t) => truckMatches(t, keys));
    let moved = 0;
    for (const truck of named) {
      const current = String(truck.status || '');
      if (movement === 'out') {
        if (current === 'Out of Yard') continue;
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Out of Yard' } });
        moved += 1;
      } else {
        if (current === 'Check Up' || current === 'Maintenance' || current === 'Accident') continue;
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Check Up' } });
        moved += 1;
      }
    }
    return moved;
  } catch (e: any) {
    console.error('[yard] couple failed:', e?.message || e);
    return 0;
  }
}

/**
 * RETURN-COUPLES-TAIL — the tail rode out with the truck, so the tail follows
 * the truck's movement too. "home" = the body came back with the head: it
 * goes to Check Up beside the head, never left 'Assigned'/'Out of Yard' to a
 * completed run. Engineering's own verdicts (Maintenance, Accident) are never
 * overwritten. Every return path funnels through here (trip completion and
 * the truck-level gate return), so no return can strand a body out of yard.
 */
async function coupleTailRegistry(trip: any, movement: 'out' | 'home'): Promise<number> {
  try {
    const code = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();
    const key = TRUCK_KEY(code);
    if (!key || key.length < 3) return 0;
    const tails = await prisma.tail.findMany();
    const tail = tails.find((t) => TRUCK_KEY(t.number) === key);
    if (!tail) return 0;
    const current = String(tail.status || '');
    if (movement === 'out') {
      if (current === 'Out of Yard') return 0;
      await prisma.tail.update({ where: { id: tail.id }, data: { status: 'Out of Yard' } });
    } else {
      if (current === 'Check Up' || current === 'Maintenance' || current === 'Accident') return 0;
      await prisma.tail.update({ where: { id: tail.id }, data: { status: 'Check Up' } });
    }
    return 1;
  } catch (e: any) {
    console.error('[yard] tail couple failed:', e?.message || e);
    return 0;
  }
}

// ---- A truck comes home, dispatch or not -----------------------------------
app.post('/api/gate/return', authenticate, authorize('Security', 'Platform Admin', 'Transport Manager'), async (req: any, res) => {
  const raw = String(req.body?.truck || req.body?.plate || '').trim();
  if (!raw) return res.status(400).json({ error: 'truck (cap number or plate) is required' });
  // CONFIRM-RETURN: the meeting's "someone triggers return while the truck is
  // still outside" — a server flag forces the client to have put the operator
  // through an explicit confirmation step. One careless click can no longer
  // close dispatches, strand a driver in transit and send wrong assets to Check Up.
  if (!req.body?.confirmed) {
    return res.status(428).json({ error: 'Confirm the truck is physically back in the yard before logging the return (send confirmed: true).' });
  }
  // RETURN-ACTOR-V2: the stamp IS the authenticated account — not a name the
  // client typed. "Which user triggered this return?" is answered from the
  // row's own gateInBy / directCosts.returnedBy, readable on every dispatch it closed.
  const actor = req.user?.name || req.user?.email || 'Security';
  const stamp = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  try {
    const key = TRUCK_KEY(raw);
    const SAFE_MIN_KEY = 4;
    // GATERETURN:V3 (B4): a combined stamp "GGE95YK / B055" is split into its
    // whole tokens, and a fragment shorter than four characters is REFUSED — a
    // 2-3 char text is a substring of half the fleet's plates and tails, and
    // matching on it closed whole families of dispatches in one request. One
    // return closes one truck's trips, exactly.
    const tokens = raw.split(/[\s/]+/).map((v) => TRUCK_KEY(v)).filter((k) => k.length >= SAFE_MIN_KEY);
    if (key.length < SAFE_MIN_KEY) {
      return res.status(400).json({ error: 'That input is too short to match a truck safely — type the full cap number or plate.' });
    }
    const trucks = await prisma.truck.findMany();
    const ownKeys = (t: any) => [TRUCK_KEY(t.registration), TRUCK_KEY(t.cabId)].filter((k: string) => k.length >= SAFE_MIN_KEY);
    const truck = trucks.find((t) => [...tokens, key].some((m) => ownKeys(t).includes(m))) || null;
    // GATERETURN:V4 — match on the RESOLVED truck, not only the typed text. A
    // guard who logs "071" names the cap number; the dispatch's truckReg may
    // carry the plate ("GGE95YK / B055") or vice versa, and the typed-token
    // match above then finds nothing and the returned truck stayed "in transit"
    // with its driver held. Once the register row is known, its own two keys
    // (registration + cabId) describe the truck completely — match those too.
    const matchKeys = truck ? [...tokens, key, ...ownKeys(truck)] : [...tokens, key];

    // Any dispatch still naming this truck is over — the truck is at the gate.
    // RETURN-ONLY-MOVING (Fortune/Adyems, 26 Oct 2026): a SCHEDULED trip never
    // left the yard — a plate typed at the gate completed unstarted dispatches
    // and handed trucks to Diesel without the fuel ever being drawn (the
    // ticketed "auto-returns" at 10:39). Only a dispatch the gate itself sent
    // out (En Route and beyond) can be closed by a return; a Scheduled trip is
    // called back or reassigned, never Completed from here.
    const open = await prisma.trip.findMany({
      where: {
        status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
      },
    });
    // GATERETURN:V5 (Fortune/Adyems, 26 Oct 2026) — EXACT match ONLY. The old
    // containment arm ("k.includes(m)" for 4+ char keys) is what made a plate
    // typed at the gate close OTHER trucks' dispatches: plate families share
    // long prefixes (GGE102/GGE107, B1001/B1006). A return closes the
    // dispatches THIS truck row (cap + plate, both resolved above) owns —
    // nothing else.
    const stillOpen = open.filter((t) => {
      const keys = truckKeysOf(t);
      return keys.some((k) => matchKeys.includes(k));
    });
    if (stillOpen.length > 3) {
      // FLEET-GUARD (B4): several open dispatches on the SAME truck are
      // expected (re-baked siblings), but matching most of the fleet is a bug.
      return res.status(409).json({ error: stillOpen.length + ' dispatches matched "' + raw + '" — too many to close on one return. Type the exact cap number or plate.' });
    }
    // OPEN-BOOK-BUSY (Daniel, 27 Oct 2026) — gate-book rule carried to the
    // truck endpoint: a truck still BOOKED on an open dispatch that this
    // return does NOT close (a Scheduled load waiting on it) is not free to
    // go to engineering. The booking owns the truck's word. Its authority is
    // the same exact token match the closure above runs (GATERETURN:V5).
    const openAny = await prisma.trip.findMany({
      where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
      select: { id: true, truckReg: true, tailNumber: true },
    });
    const closedIds = new Set(stillOpen.map((t) => String(t.id)));
    const stillBookedTruck = openAny.some(
      (t2) => !closedIds.has(String(t2.id)) && truckKeysOf(t2).some((k) => matchKeys.includes(k)),
    );
    // And the booking's OWN tail: a Scheduled dispatch waiting on a body
    // keeps that body too — the return may not stamp Check Up over a booking.
    const stillBookedTailKeys = new Set<string>();
    for (const t2 of openAny) {
      if (closedIds.has(String(t2.id))) continue;
      for (const v of [t2.tailNumber, String(t2.truckReg || '').split('/')[1]]) {
        const k = TRUCK_KEY(v);
        if (k.length > 3) stillBookedTailKeys.add(k);
      }
    }

    let closed = 0;
    const freed: string[] = [];
    let tailsReleased = 0;
    for (const trip of stillOpen) {
      const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
      // RETURN-AUDIT-TRAIL: who closed it, from where, and whether the truck was
      // still shown out of the yard at that moment — the record the Transport
      // Manager needs when he asks why a driver is standing "in transit".
      dc.returnedBy = {
        by: actor,
        role: req.user?.role || '',
        at: new Date().toISOString(),
        confirmed: true,
        note: closed === 0 && stillOpen.length === 1 ? 'Gate return logged' : `Part of ${stillOpen.length} dispatch(es) closed by this return`,
      };
      await prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'Completed', eta: trip.eta || stamp, gateInBy: trip.gateInBy || actor, directCosts: dc },
      });
      closed += 1;
      // RETURN-COUPLES-TAIL — the TAIL rode in with the truck; it cannot stay
      // 'Assigned'/'Out of Yard' to a completed run while the head stands on
      // Check Up. Same rule the dispatch-level return (completeTripReturn)
      // already applies.
      const tailCode = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();
      if (tailCode) {
        const tk = TRUCK_KEY(tailCode);
        const tails = await prisma.tail.findMany();
        const tailRow = tails.find((t) => TRUCK_KEY(t.number) === tk);
        // STILL-BOOKED-TAIL: a Scheduled dispatch booked on this body keeps it —
        // the return never stamps Check Up over a booking's tail.
        if (tailRow && !stillBookedTailKeys.has(tk) &&
            !['Check Up', 'Maintenance', 'Accident'].includes(String(tailRow.status))) {
          await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });
          tailsReleased += 1;
        }
      }
      if (trip.driverName && trip.driverName !== 'Unassigned') {
        // DRIVER-IDENTITY: the name only frees when no binding exists AND the
        // name is unique in the roster — a shared name must never be released
        // wholesale by one truck's return (this held two Mohammeds hostage).
        // The duty-sync net catches anything left.
        let freedWhere: any = null;
        if (trip.driverId) freedWhere = { id: trip.driverId, status: { in: ['On Trip', 'Active'] } };
        else {
          const sameName = await prisma.driver.count({ where: { name: trip.driverName } });
          if (sameName === 1) freedWhere = { name: trip.driverName, status: { in: ['On Trip', 'Active'] } };
        }
        if (freedWhere) {
          await prisma.driver.updateMany({ where: freedWhere, data: { status: 'Active' } });
          freed.push(String(trip.driverStaffId || trip.driverName));
        }
      }
    }

    // The truck itself goes to engineering, exactly as a returned truck should.
    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {
      // RETURN-COUPLES-TAIL (truck level) — the tail the gate was told about (or
      // the one any closed dispatch carried) comes home with the head, even when
      // no open dispatch named it (a legacy truck logged in by plate alone).
      try {
        const tailCandidates = [raw, ...stillOpen.map((t) => String(t.tailNumber || (String(t.truckReg || '').split('/')[1] || '')))]
          .map((v) => TRUCK_KEY(v)).filter((k) => k.length > 2);
        if (tailCandidates.length) {
          const tails = await prisma.tail.findMany();
          // TAIL:EXACT (27 Oct 2026, Daniel) — equality on the whole key only.
          // The old containment both ways ("k.includes(tn) || tn.includes(k)")
          // is exactly what cross-closed plate-sibling families before; a tail
          // is named by its OWN code, never by a prefix of another's.
          for (const tailRow of tails) {
            const tn = TRUCK_KEY(tailRow.number);
            if (tailCandidates.some((k) => k === tn) &&
                !stillBookedTailKeys.has(tn) &&
                !['Check Up', 'Maintenance', 'Accident'].includes(String(tailRow.status))) {
              await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });
              tailsReleased += 1;
              break;
            }
          }
        }
      } catch (_) { /* best-effort: the head's return stands */ }
      // OPEN-BOOK-BUSY: a Scheduled booking keeps the truck in its own word —
      // it stays whatever the register said, ready for the load that is
      // waiting on it. Only a FREE truck goes to engineering.
      if (!stillBookedTruck) {
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Check Up' } });
      }
    }

    try {
      await notify('Security', 'Truck returned',
        (truck ? truck.cabId + ' (' + truck.registration + ')' : raw) + ' was logged back into the yard by ' + actor +
          (closed ? '. ' + closed + ' open dispatch' + (closed === 1 ? '' : 'es') + ' closed with it.' : '.'),
        'success', 'Transport Manager,Security,Fleet Operations,Engineering',
        { module: 'Gate Security', eventKey: 'gate.truck_returned' });
    } catch (_) { /* the movement stands even if the alert fails */ }

    res.json({
      ok: true,
      // The word the register actually wears at the end of this return: when a
      // Scheduled booking keeps the truck, the response reports THAT, not a
      // Check Up that was never written true.
      truck: truck ? { id: truck.id, capId: truck.cabId, registration: truck.registration, status: stillBookedTruck ? String(truck.status || 'Booked') : 'Check Up' } : null,
      dispatchClosed: closed,
      driversFreed: freed,
      tailsReleased,
      stamp,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- The gate log heals itself (auto-reconcile) ----------------------------
//
// A truck is out if a dispatch says it is moving. If the gate never stamped its
// departure — the pre-go-live fleet, or any movement the gate house was unable
// to write — the stamp is filled in from the dispatch's own dates, and the
// record says so. No one has to notice, remember or type anything.
const AUTO_OPEN_MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

function autoStamp(value: any): string {
  const date = value ? new Date(value) : new Date();
  const when = isNaN(date.getTime()) ? new Date() : date;
  return when.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function autoReconcileGateDepartures(): Promise<number> {
  try {
    const moving = await prisma.trip.findMany({ where: { status: { in: AUTO_OPEN_MOVING } } });
    let stamped = 0;
    for (const trip of moving) {
      if (String(trip.startTime ?? '').trim()) continue; // already logged by the gate
      const costs = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
      if (costs.autoReconciledDeparture) continue;
      costs.autoReconciledDeparture = true;
      costs.autoReconciledAt = new Date().toISOString();
      await prisma.trip.update({
        where: { id: trip.id },
        data: {
          // The best evidence of when it really left, in that order of trust.
          startTime: autoStamp(trip.dispatchedAt || trip.assignedAt || trip.approvedAt || trip.createdAt),
          gateOutBy: 'Auto-reconciled (departure predates the gate log)',
          directCosts: costs,
        },
      });
      stamped += 1;
    }
    if (stamped) {
      console.log('[gate-reconcile] departure stamped on ' + stamped + ' moving dispatch' + (stamped === 1 ? '' : 'es') + ' that had none.');
    }
    return stamped;
  } catch (e: any) {
    console.error('[gate-reconcile] failed:', e?.message || e);
    return 0;
  }
}

// DISABLED (B5): the self-heal invented departures — and their author — for
// the gate without the gate logging anything. A departure now exists only when
// the gate window, "Return a truck" or the department screens write it with
// their own account stamped on it. POST /api/gate/backfill still covers
// pre-go-live history by hand.
// void autoReconcileGateDepartures();
// setInterval(() => void autoReconcileGateDepartures(), 3 * 60 * 1000);


/*
 * DRIVER-DUTY SYNC (safety net) — the roster follows the live dispatch list
 * unconditionally, so no missed code path can ever strand a man "On Trip"
 * after his truck is home. This is deliberately NOT the old auto-sweep: it
 * never closes a dispatch and never moves a truck or tail — it only corrects
 * a driver's status word when the dispatch list proves he is out of work.
 */
async function syncDriverDuty(): Promise<number> {
  try {
    const OPEN_TRIP_STATUSES = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
    const openTrips = await prisma.trip.findMany({
      where: { status: { in: OPEN_TRIP_STATUSES } },
      select: { driverName: true, truckReg: true, tailNumber: true },
    });
    const headKeyOf = (v: any) => {
      const k = TRUCK_KEY(String(v || '').split(/[/\s]+/)[0]);
      return k && k.length >= 3 ? k : null;
    };
    const onTrip = await prisma.driver.findMany({
      where: { status: 'On Trip' },
      select: { id: true, name: true, truckReg: true, truckReg2: true },
    });
    let flipped = 0;
    const freedNames: string[] = [];
    for (const d of onTrip) {
      if (['Suspended', 'Off Duty', 'Deleted'].includes(String(d.status))) continue;
      const nameKey = String(d.name || '').trim().toLowerCase();
      const own = [d.truckReg, d.truckReg2].map((v) => headKeyOf(v)).filter(Boolean);
      const stillOn = openTrips.some((t: any) => {
        if (String(t.driverName || '').trim().toLowerCase() === nameKey) return true;
        const headKey = headKeyOf(String(t.truckReg || '').trim());
        const tailKey = headKeyOf(String(t.tailNumber || '').trim());
        return own.includes(headKey) || own.includes(tailKey);
      });
      if (!stillOn) {
        await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
        flipped++;
        freedNames.push(String(d.name || '').trim());
      }
    }
    if (flipped) {
      console.log('[driver-duty] freed ' + flipped + ' driver(s) the dispatch list no longer holds.');
      // AUDIT:SYSTEM — the sweep is a server write with no HTTP request, so it
      // records itself here; otherwise duty flips were invisible to the trail.
      void sysTrail(
        'HR',
        'System Freed',
        'Auto duty-sync released ' + flipped + ' driver(s) no longer on an open dispatch: ' + freedNames.join(', ')
      );
    }
    return flipped;
  } catch (e: any) {
    console.error('[driver-duty] sync failed:', e?.message || e);
    return 0;
  }
}
void syncDriverDuty();
setInterval(() => void syncDriverDuty(), 10 * 60 * 1000);

// --- GATERETURN:V4 — RETURNED-TRUCK SWEEP: the rule made PERMANENT ----------
// ONE TRUTH, re-checked every 5 minutes: a truck the gate has sent home (its
// register row is on Check Up) can have NO open dispatch left. Whatever path
// logged the return — the gate log, "Return a truck", a dispatch page, even a
// half-failed write from an older run — anything still open that names that
// truck is closed here with the self-heal stamp on the record, its drivers
// freed and its tail brought home. This is the difference between fixing a
// screen and fixing the system: no missed edge case can ever again leave a
// returned truck showing "in transit" (the P109/071 case, 15 Oct 2026).
//
// GATERETURN:V5 GUARD (21 Oct 2026): "Check Up" is NOT proof by itself —
// engineering also parks healthy trucks there mid-flow, and the yard coupling
// can lag a fresh departure. Closing a truck's dispatches wholesale on a stale
// word made live runs vanish from the Tracking board with no gate action
// anywhere. The distinguishing signal is TRACKING FRESHNESS: a run that is
// genuinely moving has a checkpoint (or a birth) inside the last 12 hours —
// one closed-and-forgotten behind the gate does not. Only dormant dispatches
// are swept; anything with recent tracking activity is left exactly as it is.
async function sweepReturnedTrucks(): Promise<number> {
  try {
    const trucks = await prisma.truck.findMany();
    const homeKeys = new Set<string>();
    for (const t of trucks) {
      if (String(t.status || '') !== 'Check Up') continue;
      for (const v of [t.registration, t.cabId]) {
        const k = TRUCK_KEY(v);
        if (k.length >= 4) homeKeys.add(k);
      }
    }
    if (homeKeys.size === 0) return 0;
    // SWEEP-NEEDS-GATE-RETURN (Daniel, 27 Oct 2026): quiet hours alone were no
    // proof the truck came HOME — a truck that LEFT while reading Check Up
    // kept that word all trip (Departure only moved Active/Available/Assigned
    // out of the yard), and 12 silent hours then closed a genuinely out
    // dispatch. So a sweep may close only on BOTH signals now: the truck
    // reads Check Up AND the gate logged a RETURN stamp for it after the trip
    // set out. Latest Return stamp per truck key wins ('Return' entries only).
    const gateReturns = await prisma.gateEntry.findMany({ where: { type: 'Return' } });
    const homeStampBy = new Map<string, number>();
    for (const ge of gateReturns) {
      const stamp = new Date(ge.timestamp).getTime();
      if (isNaN(stamp)) continue;
      for (const k of String(ge.truckReg || '')
        .split(/[^0-9a-zA-Z]+/)
        .map((v) => TRUCK_KEY(v))
        .filter((k) => k.length > 3)) {
        const cur = homeStampBy.get(k);
        if (!cur || stamp > cur) homeStampBy.set(k, stamp);
      }
    }
    // SWEEP-ONLY-MOVING (Fortune/Adyems, 26 Oct 2026): a Scheduled trip is
    // unstarted work — the sweep used to complete Scheduled dispatches whose
    // truck row happened to sit in Check Up (engineering parks healthy trucks
    // there mid-flow), which is the "truck auto-returned out of Diesel" ticket.
    const open = await prisma.trip.findMany({
      where: { status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    });
    const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours of tracked life
    const now = Date.now();
    const doomed = [];
    for (const t of open) {
      if (!truckKeysOf(t).some((k) =>
        Array.from(homeKeys).some((h) => k === h))) continue; // EXACT match — a plate's suffix never owns another truck's load
      // DORMANT-ONLY (V5B, 24 Oct 2026): a dispatch the lifecycle touched
      // inside the window is live work, whatever the registry word says.
      // The born check alone left a hole the front office caught — long
      // raised requests approved and departed TODAY have no checkpoints
      // yet, so the sweep still closed them at one identical timestamp and
      // stamped a fake guard name. updatedAt is the trip's last lifecycle
      // write (re-approval edit, approval, assignment, departure); a
      // record no path has written to in 12 hours is the only kind the
      // sweep may close.
      const born = new Date(t.createdAt || 0).getTime();
      const touched = new Date(t.updatedAt || '').getTime();
      if (!isNaN(born) && now - born < ACTIVE_WINDOW_MS) continue;
      if (!isNaN(touched) && now - touched < ACTIVE_WINDOW_MS) continue;
      const lastCp = await prisma.trackingCheckpoint.findFirst({
        where: { tripId: t.id },
        orderBy: { at: 'desc' },
      });
      if (lastCp) {
        const seen = new Date(lastCp.at).getTime();
        if (!isNaN(seen) && now - seen < ACTIVE_WINDOW_MS) continue;
      }
      // THE GATE'S OWN PROOF (the second half of SWEEP-NEEDS-GATE-RETURN): a
      // Return stamp for this truck AFTER the trip set out. The gate stamps
      // start times in its own en-GB words ("27 Oct 2026, 10:39"), which
      // Date() does not always read — so the parse falls back through the
      // same field formats the yard itself writes. No readable stamp after
      // a readable departure = no proof anyone brought this load home.
      const setOut = (function () {
        for (const v of [t.startTime, t.createdAt]) {
          if (!v) continue;
          const d = new Date(String(v).replace(', ', ' ')).getTime();
          if (!isNaN(d)) return d;
          const dRaw = new Date(v).getTime();
          if (!isNaN(dRaw)) return dRaw;
        }
        return 0;
      })();
      let gateHomeAfterDeparture = false;
      for (const k of truckKeysOf(t)) {
        const home = homeStampBy.get(k);
        if (home !== undefined && (!setOut || home > setOut)) {
          gateHomeAfterDeparture = true;
          break;
        }
      }
      if (!gateHomeAfterDeparture) continue;
      doomed.push(t);
    }
    let closed = 0;
    for (const trip of doomed) {
      try {
        const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
        dc.returnedBy = {
          by: 'Return self-heal',
          role: 'System',
          at: new Date().toISOString(),
          confirmed: true,
          note: 'Gate already logged this truck home — the open dispatch was closed automatically.',
        };
        await prisma.trip.update({
          where: { id: trip.id },
          data: {
            status: 'Completed',
            eta: trip.eta || autoStamp(new Date()),
            // S.1-PETROLINE-STAMP (24 Oct 2026, owner instruction): the desk stamp
            // is the STATION, never a person — the front office must never read
            // a phantom guard or a confusing system note. The truthful audit
            // stays on the record's directCosts.returnedBy object; the readable
            // stamp reads the desk:
            gateInBy: trip.gateInBy || 'S.1 Petroline',
            directCosts: dc,
          },
        });
        closed += 1;
        // AUDIT:SYSTEM — a self-heal close is a server write with no HTTP
        // request; it records itself here so the trail shows WHO closed a
        // dispatch the human never touched ('System', device 'Server').
        void sysTrail(
          'Dispatch',
          'System Closed',
          (String(trip.driverName || '').trim() || 'unassigned') + ' · ' + (trip.truckReg || '—') + ' · dispatch ' + dispatchRef(trip.id) +
            ' closed by the auto-return sweep (gate return proof + 12h dormant).'
        );
        // The tail rode in with the truck — home to Check Up beside the head.
        const tailCode = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();
        if (tailCode) {
          const tk = TRUCK_KEY(tailCode);
          const tails = await prisma.tail.findMany();
          const tailRow = tails.find((t) => TRUCK_KEY(t.number) === tk);
          if (tailRow && ['Out of Yard', 'Assigned', 'Available'].includes(String(tailRow.status))) {
            await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });
            void sysTrail('Fleet', 'System Updated', 'Tail ' + tailCode + ' returned to Check Up by the auto-return sweep after ' + dispatchRef(trip.id) + ' closed.');
          }
        }
      } catch (e: any) {
        console.error('[return-sweep] could not close a stale dispatch:', e?.message || e);
      }
    }
    if (closed) {
      // Free the drivers the sweep just unburdened — but only those the LIVE
      // dispatch list no longer holds anywhere (the same guard every path uses).
      try {
        const remaining = await prisma.trip.findMany({
          where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'] } },
          select: { driverName: true },
        });
        const held = new Set(remaining.map((t: any) => String(t.driverName || '').trim().toLowerCase()).filter(Boolean));
        const names = Array.from(new Set(doomed.map((t: any) => String(t.driverName || '').trim()).filter((n: string) => n && !/^unassigned$/i.test(n))));
        for (const name of names) {
          if (held.has(name.toLowerCase())) continue;
          await prisma.driver.updateMany({
            where: { name, status: { in: ['On Trip', 'Active'] } },
            data: { status: 'Active' },
          });
        }
        void sysTrail('HR', 'System Freed', 'Auto-return sweep released driver(s) back to Active: ' + (names.length ? names.join(', ') : 'none'));
      } catch (e: any) {
        console.error('[return-sweep] driver release failed:', e?.message || e);
      }
      console.log('[return-sweep] closed ' + closed + ' stale dispatch(es) naming a truck already sent home.');
    }
    return closed;
  } catch (e: any) {
    console.error('[return-sweep] failed:', e?.message || e);
    return 0;
  }
}
void sweepReturnedTrucks();
setInterval(() => void sweepReturnedTrucks(), 5 * 60 * 1000);

// --- GATECYCLE:V1:HELPERS ------------------------------------------------------
// The gate's stamps name the truck; the register holds the rest. One matcher
// for both directions: a GateEntry's plate/tail text vs a Trip's truckReg/tail,
// compared by stripped keys ("GML368XX" vs "GML368XX / B1001" must match).
function gatePlateKey(v) {
  return String(v || '').trim().toUpperCase().split(/[\s/]+/)[0] || '';
}
async function gateCycleAssetsOut(truckReg, tailNumber) {
  const norm = (v) => String(v || '').trim().toUpperCase();
  try {
    if (norm(truckReg)) {
      const trucks = await prisma.truck.findMany();
      const truck = trucks.find((t) => norm(t.registration) === norm(truckReg) || norm(t.cabId) === norm(truckReg));
      // DEPARTURE-FOLLOWS-THE-GATE (Daniel, 27 Oct 2026): Departure used to
      // move only Active/Available/Assigned trucks out of the yard, so a
      // truck that rolled off while still reading Check Up kept that word
      // for the whole trip — and the returned-truck sweep, whose rule is
      // "Check Up = home", then closed its dispatch from the wrong end
      // after 12 quiet hours. A gate Departure stamp is the yard's own
      // proof the truck LEFT, and Out of Yard is the word for that;
      // Engineering's harder verdicts (Maintenance, Accident) are still
      // untouched — only the release state follows the gate.
      if (truck && ['Active', 'Available', 'Assigned', 'Check Up'].includes(String(truck.status))) {
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Out of Yard' } });
      }
    }
    if (norm(tailNumber)) {
      const tails = await prisma.tail.findMany();
      const tail = tails.find((t) => norm(t.number) === norm(tailNumber));
      if (tail && ['Available', 'Assigned'].includes(String(tail.status))) {
        await prisma.tail.update({ where: { id: tail.id }, data: { status: 'Out of Yard' } });
      }
    }
  } catch (e) {
    console.error('gate cycle (out) bookkeeping failed:', e?.message || e);
  }
}
async function gateCycleDriverOnTrip(driverName) {
  const name = String(driverName || '').trim();
  if (!name || /^unassigned$/i.test(name)) return;
  try {
    await prisma.driver.updateMany({
      where: { name, status: { in: ['Available', 'Active'] } },
      data: { status: 'On Trip' },
    });
  } catch (e) {
    console.error('gate cycle (driver out) failed:', e?.message || e);
  }
}
// --- GATECYCLE:V1:HELPERS:END --------------------------------------------------

app.get('/api/gate', authenticate, async (_req, res) => {
  res.json(await prisma.gateEntry.findMany({ orderBy: { timestamp: 'desc' } }));
});
app.post('/api/gate', authenticate, authorize('Security', 'Gate Security', 'Gate', 'Platform Admin', 'Transport Manager'), async (req, res) => {
  const entry = await prisma.gateEntry.create({ data: req.body });
  /*
   * CYCLE END. The gate's Return stamp is the one moment a trip is provably
   * over: the truck is physically back in the yard. Nothing used to read it, so
   * dispatches sat in 'Returning' for ever, the tracking board never let them go,
   * and their drivers stayed committed — invisible to the fleet desk and unable
   * to be handed another truck. Closing it here ends the cycle for the truck,
   * the board and the driver at the same instant.
   */

// --- GATECYCLE:V1:DEPARTURE ----------------------------------------------------
// CYCLE OPEN. The gate's Departure stamp is the moment the truck physically
// left: the trip moves (if the stamp did not already carry it), the ASSET rows
// follow (truck and tail to Out of Yard — what the TM/Fleet availability
// boards read), and the driver goes On Trip. Without this, the boards kept
// saying "in the yard" while the gate had the truck on the road.
if (entry.type === 'Departure' && (entry.truckReg || entry.driver)) {
  try {
    // GATECYCLE:V2 (owner word, 26 Oct 2026) — the gate book is a HUMAN stamp:
    // it moves exactly the truck Security typed, exactly the load it carries.
    // The old matcher ran on substring containment ("GGE10" typed matched
    // GGE102YK AND GGE107YE; B1001 matched B1006's trip) and a driver-name
    // fallback that grabbed ANY open trip naming the man — the last of the
    // "auto-something flipped it" family: a Departure stamped for one truck
    // sent ANOTHER truck's Scheduled load to En Route with no gate log on it.
    // Whole tokens, EXACT equality — the same rule /api/gate/return now runs.
    const stampTokens = new Set(
      String(entry.truckReg || '')
        .split(/[^0-9a-zA-Z]+/)
        .map((v) => TRUCK_KEY(v))
        .filter((k) => k.length > 3),
    );
    const stampDriver = String(entry.driver || '').trim().toUpperCase();
    const OPEN_TRIP_STATUSES = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
    const candidates = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
    const trip = stampTokens.size
      ? candidates.find((t) => truckKeysOf(t).some((k) => stampTokens.has(k))) || null
      : // The driver-name fallback ONLY when the stamp ran without a readable
        // truck — a guard names the truck first, so a plate in hand must never
        // let a name sweep other trucks' dispatches.
        (candidates.find((t) =>
          Boolean(stampDriver) &&
          String(t.driverName || '').trim().toUpperCase() === stampDriver,
        ) || null);
    if (trip) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: 'En Route',
          startTime: trip.startTime || autoStamp(entry.timestamp),

        },
      });
    }
    const tailKey = String(trip?.tailNumber || '').trim() ||
      (String(entry.truckReg || '').includes('/') ? String(entry.truckReg).split('/')[1].trim() : '');
    await gateCycleAssetsOut(entry.truckReg, tailKey);
    await gateCycleDriverOnTrip(entry.driver);
  } catch (e) {
    console.error('gate departure cycle failed:', e?.message || e);
  }
}
// --- GATECYCLE:V1:DEPARTURE:END ------------------------------------------------
  if (entry.type === 'Return' && (entry.truckReg || entry.driver)) {
    try {
      /*
       * The stamp names the TRUCK and the GUARD-READ DRIVER — GateEntry has no
       * trip column. So the open dispatch is found by the plate on the stamp,
       * falling back to the driver's name: the gate reads both off the windscreen,
       * and either is enough to end the cycle that man and machine are on.
       */
      // RETURN-ONLY-MOVING (the rule /api/gate/return got, applied to the gate
      // book too, 26 Oct 2026): a Scheduled trip never left the yard and a
      // Stopped one was DECLINED by the TM — a return stamp completes neither.
      // Only loads the gate itself sent out can be ended here; the Scheduled
      // dispatch is called back or reassigned, never Completed.
      const OPEN_TRIP_STATUSES: string[] = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
      const returnTokens = new Set(
        String(entry.truckReg || '')
          .split(/[^0-9a-zA-Z]+/)
          .map((v) => TRUCK_KEY(v))
          .filter((k) => k.length > 3),
      );
      const driverName = String(entry.driver || '').trim().toUpperCase();
      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      const matches = openTrips.filter((t: any) => {
        if (returnTokens.size && truckKeysOf(t).some((k) => returnTokens.has(k))) return true;
        // Driver-name fallback ONLY when the stamp ran without a readable
        // truck — the guard names the truck first at the barrier, so a plate
        // in hand must never let the name sweep unrelated dispatches in.
        return !returnTokens.size && Boolean(driverName) &&
          String(t.driverName || '').trim().toUpperCase() === driverName;
      });
      const trip = matches[0] || null;
      if (trip) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
        let lastClosed: any = null;
        for (const mt of matches) {
          lastClosed = await prisma.trip.update({
            where: { id: mt.id },
            // return-stamp-on-gate-return: the return stamp the gate log shows is
            // `eta` — leaving it empty made the board print the bare word
            // "Returned" where every other row shows a real date+time.
            data: { status: 'Completed', eta: mt.eta || autoStamp(entry.timestamp), gateInBy: mt.gateInBy || actor },
          });
        }
        const closed = lastClosed || trip;
        /* THE DRIVERS' CYCLE ENDS WITH THE TRUCK'S. Whoever the closed dispatches
         * named — by exact roster name or by the truck he is registered on (the
         * "UMAR"/"ali"-style fragment names cannot be resolved to one man, his
         * truck can) — goes Active again, unless a sibling dispatch still holds
         * him or HR already decided otherwise: Suspended / Off Duty / Deleted
         * are never quietly overwritten.
         */
        const plateKeyOf = (v: any) => {
          const k = String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
          return k.length >= 3 ? k : null;
        };
        const closedNames = new Set(
          matches.map((mt: any) => String(mt.driverName || '').trim().toUpperCase()).filter(Boolean),
        );
        const closedPlates = new Set(
          matches.flatMap((mt: any) => [plateKeyOf(String(mt.truckReg || '').split(/[\s/]+/)[0]), plateKeyOf(mt.tailNumber)]).filter(Boolean),
        );
        const remaining = openTrips.filter((t: any) => !matches.some((m: any) => m.id === t.id));
        const remainingNames = new Set(remaining.map((t: any) => String(t.driverName || '').trim().toUpperCase()).filter(Boolean));
        const remainingPlates = new Set(
          remaining.flatMap((t: any) => [plateKeyOf(String(t.truckReg || '').split(/[\s/]+/)[0]), plateKeyOf(t.tailNumber)]).filter(Boolean),
        );
        const roster = await prisma.driver.findMany({
          select: { id: true, name: true, status: true, truckReg: true, truckReg2: true },
        });
        for (const d of roster) {
          const status = String(d.status || '');
          if (status !== 'On Trip') continue;
          if (['Suspended', 'Off Duty', 'Deleted'].includes(status)) continue;
          const nameKey = String(d.name || '').trim().toUpperCase();
          const dPlates = [plateKeyOf(d.truckReg), plateKeyOf(d.truckReg2)].filter(Boolean);
          const onThisReturn = closedNames.has(nameKey) || dPlates.some((k) => closedPlates.has(k));
          if (!onThisReturn) continue;
          const stillOut = remainingNames.has(nameKey) || dPlates.some((k) => remainingPlates.has(k));
          if (!stillOut) {
            await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
          }
        }
        // The TRUCK came back with the stamp — take the asset rows off the road
        // too (the availability boards read them): head and tail to Check Up,
        // exactly as the "Return a truck" quick action does.
        try {
          if (returnTokens.size) {
            const trucks = await prisma.truck.findMany();
            // GATERETURN:V5 exactness carried into the book: equality on whole
            // tokens — a prefix never owns another truck's load.
            const truckRow = trucks.find((t) =>
              [t.registration, t.cabId]
                .flatMap((v) => String(v || '').split(/[^0-9a-zA-Z]+/))
                .map((w) => TRUCK_KEY(w))
                .filter((k) => k.length > 2)
                .some((k) => returnTokens.has(k)),
            );
            let truckBusyElsewhere = false;
            if (truckRow) {
              const openTripsForTruck = await prisma.trip.findMany({
                where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
                select: { id: true, truckReg: true },
              });
              truckBusyElsewhere = openTripsForTruck.some((t2) => t2.id !== closed.id &&
                String(t2.truckReg || '').trim().toUpperCase() === String(truckRow.registration || '').trim().toUpperCase());
            }
            if (truckRow && !truckBusyElsewhere && !['Check Up', 'Maintenance', 'Accident'].includes(String(truckRow.status))) {
              await prisma.truck.update({ where: { id: truckRow.id }, data: { status: 'Check Up' } });
            }
            const tailCode = String(closed.tailNumber || '').trim();
            if (tailCode) {
              const tailRow = await prisma.tail.findUnique({ where: { number: tailCode } });
              if (tailRow && ['Out of Yard', 'Assigned', 'Available'].includes(String(tailRow.status))) {
                await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });
              }
            }
          }
        } catch (e2) {
          console.error('gate return asset cycle failed:', e2?.message || e2);
        }
        // RECIPIENT-FIX: "TransportManager" (no space) matches no role — every
        // gate-closed dispatch silently skipped the Transport Manager's bell.
        void notify('Gate Security', 'Dispatch Completed', 'Truck ' + closed.truckReg + ' is back in the yard — dispatch ' + dispatchRef(closed.id) + ' closed and the driver freed.', 'info', 'Transport Manager,Fleet Operations,Security,Tracking', { module: 'Gate Security', eventKey: 'dispatch.completed', refId: closed.id, refLabel: dispatchRef(closed.id) });
      }
    } catch (e: any) {
      // A failed closure must never lose the gate stamp itself.
      console.error('gate return could not close the dispatch:', e?.message || e);
    }
  }
    // The gate logged this itself, so it is a record for everyone else — nobody
    // is being asked to act.
    // partner-gate-notice: tagged like every other notice — the trip's own
    // company (Partner:<Company>) instead of the bare 'Partner' word, so the
    // partner sees its truck's gate departures and returns. Transport Manager
    // regains its space (TransportManager matched nobody).
    const gateAudience = ['Fleet Operations', 'Security', 'Transport Manager'];
    const gateTrip = entry.tripId ? await prisma.trip.findUnique({ where: { id: entry.tripId }, select: { customer: true } }).catch(() => null) : null;
    if (gateTrip?.customer) gateAudience.push('Partner:' + gateTrip.customer);
    void notify('Security', entry.type === 'Return' ? 'Gate Return Logged' : 'Gate Departure Logged', `Truck ${entry.truckReg} (${entry.driver}) — ${entry.type} logged at the gate.`, 'info', gateAudience.join(','), { module: 'Gate Security', eventKey: entry.type === 'Return' ? 'gate.return' : 'gate.departure', refId: entry.tripId ?? entry.id, refLabel: entry.truckReg });
  res.json(entry);
});


// --- PARTNER LOADING SITES ---
// Each partner COMPANY keeps its own loading sites. The list used to be global,
// so every partner saw Saba Steel's yards. Stored on the company's own user rows
// ('|'-separated, because a site name may contain a comma) so every account of
// one company shares ONE list — one source of truth, no per-login copies.
const SITE_SEP = '|';
function splitSites(raw) {
  const list = [];
  for (const part of String(raw || '').split(SITE_SEP)) {
    const v = part.trim().replace(/\s+/g, ' ');
    if (v && !list.some((s) => s.toLowerCase() === v.toLowerCase())) list.push(v);
  }
  return list;
}
function joinSites(list) {
  return list.join(SITE_SEP);
}
function siteKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
async function readPartnerSites(company) {
  if (!company) return [];
  const rows = await prisma.$queryRawUnsafe('SELECT "loadingSites" FROM "User" WHERE "partnerCompanyName" ILIKE $1', company);
  const merged = [];
  for (const row of rows) {
    for (const site of splitSites(row.loadingSites)) {
      if (!merged.some((m) => m.toLowerCase() === site.toLowerCase())) merged.push(site);
    }
  }
  return merged;
}
async function writePartnerSites(company, sites) {
  if (!company) return;
  await prisma.$executeRawUnsafe('UPDATE "User" SET "loadingSites" = $1 WHERE "partnerCompanyName" ILIKE $2', joinSites(sites), company);
}
// partner-site-defaults-patch
/**
 * Loading locations a company starts with.
 *
 *   Petroline — Apapa: ENL, Eco Support, Dangote
 *               Tincan: Port and Cargo, Niger Dock, Joseph Dam
 *               (Kirikiri: none recorded yet)
 */
const DEFAULT_PARTNER_SITES: Record<string, string[]> = {
  petroline: ['ENL', 'Eco Support', 'Dangote', 'Port and Cargo', 'Niger Dock', 'Joseph Dam'],
};

function defaultPartnerSites(company: string | null): string[] {
  const key = String(company || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return [];
  const exact = DEFAULT_PARTNER_SITES[key];
  if (exact) return exact;
  // The form may carry the full legal name ("Petroline Transport Ltd") rather
  // than the short one the list is keyed by — a leading match still applies.
  for (const [name, sites] of Object.entries(DEFAULT_PARTNER_SITES)) {
    if (name.length >= 6 && key.startsWith(name)) return sites;
  }
  return [];
}

/**
 * Give a company its known loading locations — but only when it has none.
 * Returns the list the company now holds, so the caller can report it.
 */
async function seedDefaultPartnerSites(company: string | null): Promise<string[]> {
  const seed = defaultPartnerSites(company);
  if (!company || seed.length === 0) return [];
  const existing = await readPartnerSites(company);
  if (existing.length > 0) return existing;
  await writePartnerSites(company, seed);
  return seed;
}
// partner-site-defaults-patch-end
async function addPartnerSites(company, names) {
  if (!company) return [];
  const sites = await readPartnerSites(company);
  let changed = false;
  for (const name of names) {
    const v = String(name || '').trim().replace(/\s+/g, ' ');
    if (!v) continue;
    if (!sites.some((s) => s.toLowerCase() === v.toLowerCase())) {
      sites.push(v);
      changed = true;
    }
  }
  if (changed) await writePartnerSites(company, sites);
  return sites;
}
/** Whose site list a call is about: a partner's own company, or one a manager names. */
async function resolveSiteCompany(req) {
  const own = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  if (own) return own;
  const held = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
  const canCurate = held.some((r) => ['Transport Manager', 'Platform Admin', 'HR'].includes(r));
  if (!canCurate) return null;
  const asked = String(req.query?.company || req.body?.company || '').trim();
  return asked || null;
}

app.get('/api/partner-sites', authenticate, async (req, res) => {
  try {
    const company = await resolveSiteCompany(req);
    if (!company) return res.json({ company: null, sites: [] });
    res.json({ company, sites: await readPartnerSites(company) });
  } catch (err) {
    console.error('GET /api/partner-sites failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/partner-sites', authenticate, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return res.status(400).json({ error: 'A loading site name is required.' });
    const company = await resolveSiteCompany(req);
    if (!company) return res.status(400).json({ error: 'No partner company to attach this loading site to.' });
    const before = await readPartnerSites(company);
    const sites = await addPartnerSites(company, [name]);
    res.json({ company, sites, added: sites.length !== before.length });
  } catch (err) {
    console.error('POST /api/partner-sites failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/partner-sites', authenticate, async (req, res) => {
  try {
    const name = String(req.query?.name || req.body?.name || '').trim();
    const company = await resolveSiteCompany(req);
    if (!company) return res.status(400).json({ error: 'No partner company to update.' });
    const sites = (await readPartnerSites(company)).filter((s) => s.toLowerCase() !== name.toLowerCase());
    await writePartnerSites(company, sites);
    res.json({ company, sites });
  } catch (err) {
    console.error('DELETE /api/partner-sites failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});
// checkpoint-departure-patch
/**
 * The trip status each tracking leg moves a dispatch to, and how far along that
 * is. A leg can only ever push the status FORWARD: a truck that has been logged
 * "In Transit" can never fall back to "Loaded" because someone re-logged an
 * earlier stop.
 */
const LEG_STATUS: Record<string, string> = {
  loading: 'Loaded',
  'in transit': 'En Route',
  'at destination': 'Offloading',
  offloaded: 'Offloading',
  // NO 'return' MAPPING (Fortune/Daniel, 21 Oct 2026): Tracking logging a
  // "Return" checkpoint used to flip the dispatch to Returning — which the
  // gate log reads as the truck already home, so Security lost the track while
  // the truck was still on the road. Tracking now STOPS at Offloading; only
  // Security's gate (or the TM) closes the circle to Completed.
};
const ON_ROAD_RANK: Record<string, number> = {
  Scheduled: 0,
  Loaded: 1,
  'En Route': 2,
  Offloading: 3,
  Returning: 4,
  Completed: 5,
};

/** Advance a dispatch along the road from a logged leg (forward only). */
function statusFromLeg(current: string, leg: string): string | null {
  const target = LEG_STATUS[String(leg || '').trim().toLowerCase()];
  if (!target) return null;
  const from = ON_ROAD_RANK[String(current || '').trim()];
  const to = ON_ROAD_RANK[target];
  if (from === undefined || to === undefined) return null; // not on the road yet
  return to > from ? target : null;
}
// checkpoint-departure-patch-end

// --- TRACKING ---
app.get('/api/tracking/:tripId', authenticate, async (req, res) => {
  const checkpoints = await prisma.trackingCheckpoint.findMany({
    where: { tripId: req.params.tripId },
    orderBy: { at: 'desc' }
  });
  res.json(checkpoints);
});

app.post('/api/tracking', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading', 'Partner Loader'), async (req, res) => {
  const { tripId, location, leg } = req.body;
  if (!tripId || !location || !leg) return res.status(400).json({ error: 'Missing required fields' });
  // LOADER-CHECKPOINT: a Partner Loader confirms collection at its own site —
  // the Loading leg only. Every other leg stays with the staff roles above.
  {
    const held: string[] = Array.isArray((req as any).user?.roles) ? (req as any).user.roles : [String((req as any).user?.role || '')];
    const staff = ['Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading'].some((r) => held.includes(r));
    if (!staff && String(leg).trim().toLowerCase() !== 'loading') {
      return res.status(403).json({ error: 'A loading site can only confirm loading.' });
    }
  }
  // TRACKING CANNOT CLOSE THE TRIP (Fortune/Daniel, 21 Oct 2026): a "Return"
  // leg flipped the dispatch to Returning — the gate log then read the truck
  // as already home and Security lost the track while it was still on the
  // road. The return is Security's gate (+ check-up) flow, so the leg is
  // REFUSED here outright — not just hidden in the UI — so even a stale open
  // client, an old cached bundle or a hand-rolled API call can never flip a
  // truck to Return from the Tracking board again.
  const legTrim = String(leg || '').trim().toLowerCase();
  if (legTrim === 'return' || legTrim === 'returning') {
    return res.status(400).json({
      error: 'Tracking stops at Offloading — the return is logged by Security at the gate, not here.',
    });
  }
  // Tracking AND Loading both log loading — one source of truth, never a second row.
  const siteKeyOf = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const siblings = await prisma.trackingCheckpoint.findMany({ where: { tripId } });
  const already = siblings.find(
    (cp) => String(cp.leg).trim().toLowerCase() === String(leg).trim().toLowerCase() && siteKeyOf(cp.location) === siteKeyOf(location),
  );
  if (already) {
    return res.json({ ...already, duplicate: true, loggedBy: already.loggedBy || null });
  }
  const checkpoint = await prisma.trackingCheckpoint.create({
    data: { tripId, location, leg }
  });
  // FIRST MOVEMENT = DEPARTURE (checkpoint-departure-patch).
  // Security's gate page is the intended departure stamp, but in the field the
  // tracking crew's first checkpoint is what actually gets logged. Without this
  // the board's Dispatched Date, the delay clock, the partner's timeline and
  // Fleet Ops' "In Transit" all stayed empty on a truck that was plainly out.
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip) {
      // GATE-FIRST DEPARTURE (Fortune/Adyems, 26 Oct 2026): a checkpoint must
      // NOT dispatch a truck. On a SCHEDULED trip — approved but never logged
      // out by Security — a tracking leg used to write the departure stamp,
      // advance the trip to Loaded/En Route and mark the head and tail Out of
      // Yard. That is exactly the trucks the gate log showed "automatically
      // dispatched" (046, 116, 078, 093…) without the gate having done
      // anything. A checkpoint recorded while the truck is still undispatched
      // is stored and announced, and NOTHING in this block is moved: the
      // first movement of a load belongs to Security's Log Out. Once the gate
      // has stamped a departure the convoy keeps logging legs as before —
      // those trips are already moving.
      const undispatched = String(trip.status || '').trim() === 'Scheduled';
      if (!undispatched) {
      const data: Record<string, any> = {};
      if (!trip.startTime || !String(trip.startTime).trim()) {
        data.startTime = (checkpoint.at instanceof Date ? checkpoint.at : new Date()).toISOString();
      }
      const next = statusFromLeg(trip.status, leg);
      if (next) data.status = next;
      // return-stamp-on-offload REMOVED (21 Oct 2026): this used to write the
      // offload checkpoint's time into `eta`, and `eta` IS the gate log's
      // RETURN stamp — so Tracking logging Offloaded made the gate log show
      // the truck as Returned (and it left Security's "still out" list) while
      // it was still on the road. The return stamp now comes from one place:
      // Security's gate. No tracking checkpoint may ever write it again.
      if (Object.keys(data).length > 0) {
        await prisma.trip.update({ where: { id: tripId }, data });
        // lifecycle-coupling-v2: a checkpoint that advances the dispatch moves the
        // named trucks with it — first leg out of the yard, the arrival leg home.
        // END-TO-END FLOW (head + tail + driver): the checkpoint's transition
        // moves the head AND the tail it hauled, home or out — the tail can
        // never be left behind because the move came from a checkpoint instead
        // of the gate. The driver rides the same couple (coupleTruckRegistry
        // 'home' frees him through the HR-protected routine).
        const movedTrip = { ...trip, ...data };
        if (String(movedTrip.status) === 'Completed') {
          void coupleTruckRegistry(movedTrip, 'home');
          void coupleTailRegistry(movedTrip, 'home');
        } else {
          void coupleTruckRegistry(movedTrip, 'out');
          void coupleTailRegistry(movedTrip, 'out');
        }
      }
      } else {
        console.log('[tracking] checkpoint held — dispatch ' + dispatchRef(tripId) + ' is still Scheduled; Security has not logged its departure, so nothing was moved.');
      }
    }
  } catch (e: any) {
    // A checkpoint must still be recorded even if the trip cannot be moved.
    console.error('departure stamp failed', e?.message);
  }
    // partner-checkpoint-notice: the trip's OWN partner is tagged
    // (Partner:<Company>) — the partner scope only matches its company tag or
    // the exact word 'Partner', so the bare 'Partner' used here reached NO
    // partner at all: the trucks moved and the owner never got the track.
    // 'TransportManager' was also missing its space, so the Transport Manager
    // missed every checkpoint too.
    const checkpointTrip = await prisma.trip.findUnique({ where: { id: tripId }, select: { customer: true } }).catch(() => null);
    const checkpointAudience = ['Fleet Operations', 'Tracking', 'Loading', 'Transport Manager'];
    if (checkpointTrip?.customer) checkpointAudience.push('Partner:' + checkpointTrip.customer);
    void notify('Operations', 'New Location has been Logged', `Dispatch ${dispatchRef(tripId)} checkpoint recorded at ${location} (${leg}).`, 'info', checkpointAudience.join(','), { module: 'Tracking', eventKey: 'tracking.checkpoint', refId: tripId, refLabel: dispatchRef(tripId) });
  res.json(checkpoint);
});

// --- TRUCKS ---
app.get('/api/trucks', authenticate, async (_req, res) => {
  res.json(await prisma.truck.findMany({ orderBy: { cabId: 'asc' } }));
});
// The cap number is UNIQUE: a duplicate is the operator's mistake, not a crash.
// TRUCK-CAP-AUTO (24 Oct 2026): the cap number (cabId, "P0xx") is the identity
// every board, gate log and assignment picker reads. Fleet adds new trucks with
// nothing but a plate — or with the plate pasted into the cap field — and every
// screen then showed the bare plate ("AAA395YP") where its neighbours read
// "P0xx (PLATE)". The server now owns the cap: it trims what arrives, refuses a
// truck with no plate, and AUTO-ISSUES the next free P-code whenever the cap
// field is blank or merely repeats the plate, so a truck added by anyone in any
// department carries a usable cap number from the moment it exists.
const truckCapKey = (v: string) => String(v ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
async function nextFreeTruckCap(): Promise<string> {
  const rows = await prisma.truck.findMany({ select: { cabId: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^P(\d+)$/i.exec(String(r.cabId || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `P${max + 1}`;
}

app.post('/api/trucks', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;
    data.registration = String(data.registration ?? data.plate ?? '').trim();
    if (!data.registration) return res.status(400).json({ error: 'The plate number is required — the cap alone does not identify the truck.' });
    const cap = String(data.cabId ?? data.capNumber ?? '').trim();
    data.cabId = !cap || truckCapKey(cap) === truckCapKey(data.registration) ? await nextFreeTruckCap() : cap;
    delete data.capNumber;
    delete data.plate;
    res.json(await prisma.truck.create({ data }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    throw e;
  }
});
// FIELD-OPS-STATUS — the yard desk flips a head's registry status (Available,
// Check Up, Maintenance, Out of Yard…) as it inspects trucks returning from
// trip; the status is the one column the whole availability story hangs on.
app.patch('/api/trucks/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;
    // Same cap rule on edit: the cap can be trimmed, but never blanked out and
    // never turned into the plate — the registry row keeps a real cap number.
    if (data.registration !== undefined) data.registration = String(data.registration ?? '').trim();
    if (data.cabId !== undefined || data.capNumber !== undefined) {
      const cap = String(data.cabId ?? data.capNumber ?? '').trim();
      if (!cap || truckCapKey(cap) === truckCapKey(data.registration ?? '')) {
        const row = await prisma.truck.findUnique({ where: { id: req.params.id }, select: { registration: true } });
        const refPlate = String(row?.registration ?? '').trim();
        if (!refPlate && !data.registration) return res.status(400).json({ error: 'A truck with no plate cannot be saved — add the plate number.' });
        data.cabId = await nextFreeTruckCap();
      } else data.cabId = cap;
      delete data.capNumber;
    }
    res.json(await prisma.truck.update({ where: { id: req.params.id }, data }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Truck not found' });
    throw e;
  }
});
app.delete('/api/trucks/:id', authenticate, authorize('Platform Admin', 'Transport Manager'), async (req, res) => {
  await prisma.truck.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- TAILS (real tail inventory — previously mock-only) ---
app.get('/api/tails', authenticate, async (_req, res) => {
  res.json(await prisma.tail.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/tails', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  const data = { number: req.body.number, type: req.body.type || null, status: req.body.status || 'Available' };
  if (!data.number) return res.status(400).json({ error: 'Tail number is required' });
  try {
    res.json(await prisma.tail.create({ data }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A tail with this number already exists' });
    throw e;
  }
});
app.patch('/api/tails/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  const data = { ...req.body };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  res.json(await prisma.tail.update({ where: { id: req.params.id }, data }));
});
app.delete('/api/tails/:id', authenticate, authorize('Platform Admin', 'Transport Manager'), async (req, res) => {
  await prisma.tail.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- DRIVERS ---
// driver-onboarding-hardening
const DRIVER_FIELDS = ['name', 'phone', 'staffId', 'truckReg', 'truckReg2', 'category', 'status', 'licenseNumber', 'licenseExpiry', 'department', 'guarantorName', 'guarantorPhone', 'licenseDocName'];

/** Next free P-number (P0001…) — used when the client sends no Driver ID. */
async function nextFreeDriverId(): Promise<string> {
  const existing = await prisma.driver.findMany({ select: { staffId: true } });
  const used = new Set(existing.map((d) => (d.staffId || '').toUpperCase()));
  let n = 1;
  while (used.has('P' + String(n).padStart(4, '0'))) n++;
  return 'P' + String(n).padStart(4, '0');
}

app.get('/api/drivers', authenticate, async (_req, res) => {
  const [drivers, openTrips, trucks] = await Promise.all([
    prisma.driver.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.trip.findMany({
      where: {
        status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'] },
      },
      select: { driverName: true, truckReg: true },
    }),
    prisma.truck.findMany(),
  ]);
  //
  // SHARED-NAMES BOUNDARY (Fortune/Adyems, 28 Oct 2026): the count keyed on
  // the NAME alone, so the open KNT785XP run typed "MOHAMMED" held every man
  // filed under exactly that word — three of them (P0293, P0901, P0932). The
  // man back at the yard carried an open-dispatch count he never touched, the
  // register read him On Trip, and no desk would offer him. A name shared by
  // more than one row now binds a dispatch only on EVIDENCE naming that man:
  // his own record claims the road (stored 'On Trip'), or the dispatch's
  // truck resolves through the registry to a cap HR paired with him.
  // Unambiguous names count exactly as they always did.
  const nameKeyOf = (v) => String(v || '').trim().toLowerCase();
  const capTokOf = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const nameBank = new Map();
  for (const d of drivers) nameBank.set(nameKeyOf(d.name), (nameBank.get(nameKeyOf(d.name)) || 0) + 1);
  const capByToken = new Map();
  for (const t of trucks) {
    const cap = capTokOf(t.cabId);
    for (const raw of [t.registration, t.cabId]) {
      for (const piece of String(raw || '').split(/[^0-9a-zA-Z]+/)) {
        const k = capTokOf(piece);
        if (k.length > 2) capByToken.set(k, cap);
      }
    }
  }
  const counts = new Map();
  for (const d of drivers) counts.set(d.id, 0);
  for (const t of openTrips) {
    // DRIVER-IDENTITY (30 Oct 2026): whenever the trip is BOUND to a roster
    // row, the count follows the binding — a shared name can only ever paint
    // the wrong man. Legacy unbound rows fall through to the name rules:
    // unique name binds as it always did; a shared name needs evidence tanker
    // (stored duty word or HR pairing) before it counts.
    if (t.driverId && counts.has(t.driverId)) {
      counts.set(t.driverId, (counts.get(t.driverId) || 0) + 1);
      continue;
    }
    const nameKey = nameKeyOf(t.driverName);
    if (!nameKey || !nameBank.has(nameKey)) continue;
    const candidates = drivers.filter((d) => nameKeyOf(d.name) === nameKey);
    let owners = candidates;
    if (candidates.length > 1) {
      let tripCap = null;
      for (const piece of String(t.truckReg || '').split(/[^0-9a-zA-Z]+/)) {
        const c = capByToken.get(capTokOf(piece));
        if (c) { tripCap = c; break; }
      }
      const paired = tripCap
        ? candidates.filter((d) => [d.truckReg, d.truckReg2].some((v) => capTokOf(v) === tripCap))
        : [];
      owners = paired.length ? paired : candidates.filter((d) => String(d.status) === 'On Trip');
    }
    for (const d of owners) counts.set(d.id, (counts.get(d.id) || 0) + 1);
  }
  res.json(
    drivers.map(({ licenseDocument, ...d }) => ({
      ...d,
      hasLicenseDoc: Boolean(licenseDocument),
      openDispatches: counts.get(d.id) || 0,
    })),
  );
});
app.post('/api/drivers', authenticate, authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Driver name is required.' });
    let staffId = String(b.staffId ?? b.employeeId ?? b.driverId ?? '').trim().toUpperCase();
    if (!staffId) staffId = await nextFreeDriverId();
    const dupe = await prisma.driver.findFirst({ where: { staffId } });
    if (dupe) {
      return res.status(409).json({ error: 'Driver ID ' + staffId + ' is already assigned to ' + dupe.name + '.' });
    }
    const data: any = { name, staffId, status: b.status || 'Active' };
    for (const key of DRIVER_FIELDS) {
      if (key === 'name' || key === 'staffId' || key === 'status') continue;
      if (b[key] !== undefined && b[key] !== null && String(b[key]).trim() !== '') data[key] = String(b[key]).trim();
    }
    const driver = await prisma.driver.create({ data });
    void notify('HR', 'New Staff Onboarded', name + ' (' + staffId + ') was added to the driver roster.', 'success', 'Transport Manager,HR', { module: 'HR & Personnel', eventKey: 'staff.onboarded', refLabel: name });
    res.json(driver);
  } catch (e: any) {
    console.error('POST /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not save the driver. Please try again.' });
  }
});
app.patch('/api/drivers/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    const b = req.body || {};
    const data: any = {};
    for (const key of DRIVER_FIELDS) {
      if (b[key] !== undefined) data[key] = b[key] === null ? null : String(b[key]).trim();
    }
    /*
     * THE TRANSPORT MANAGER'S ABSOLUTE RELEASE (driver-release-patch).
     *
     * Availability comes from the dispatch list, which is the safe default — but
     * it lets a dispatch nobody closed hold a man hostage: he cannot be offered a
     * truck and the duty word cannot free him. closeDispatches ends those stale
     * trips as Completed as he is released, so the roster and the dispatch list
     * tell one story instead of two.
     *
     * RELEASE-GUARD (Fortune/Adyems, 26 Oct 2026): the release used to fire on
     * EVERY save that carried it — editing a man's phone number closed his live
     * trips AND his unstarted Scheduled ones, handing trucks back to the yard
     * before Security had ever logged a departure (trucks "auto-returned" out
     * of Diesel & Gas). Two stops, matching the rule the mobile HR app always
     * applied:
     *   1. the release runs only when the save moves the man OUT of employment
     *      (On Leave / Off Duty / Suspended). An Active save closes nothing.
     *   2. a Scheduled dispatch is UNSTARTED work — no release may complete it.
     *      It is reassigned or cancelled by the fleet desk, never closed
     *      Completed here.
     */
    if (b.closeDispatches) {
      const OPEN_TRIP_STATUSES: string[] = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
      const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
      const nextStatus = String(data.status ?? driver?.status ?? '').trim();
      const leavesEmployment = ['On Leave', 'Off Duty', 'Suspended'].includes(nextStatus);
      if (driver && driver.name && leavesEmployment) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Transport Manager';
        const stuck = await prisma.trip.findMany({
          where: { driverName: driver.name, status: { in: OPEN_TRIP_STATUSES } },
        });
        for (const trip of stuck) {
          const closedTrip = await prisma.trip.update({
            where: { id: trip.id },
            data: { status: 'Completed', gateInBy: trip.gateInBy || actor },
          });
          // THE RELEASE FOLLOWS THE FLOW (self-return fix): a release-closed
          // dispatch runs the same home cycle Security's gate runs — head to
          // Check Up, tail to Check Up — instead of completing the trip bare
          // and scattering the yard. coupleTruckRegistry 'home' also frees the
          // driver; HR's own word for him is applied after this block.
          await coupleTruckRegistry(closedTrip, 'home');
          await coupleTailRegistry(closedTrip, 'home');
        }
        if (stuck.length) {
          void notify('HR & Personnel', 'Driver Released', driver.name + ' was released and ' + stuck.length + ' open dispatch' + (stuck.length === 1 ? '' : 'es') + ' closed with him.', 'warning', 'Transport Manager,HR & Personnel,Fleet Operations,Tracking', { module: 'HR & Personnel', eventKey: 'driver.released', refId: driver.id, refLabel: driver.staffId || driver.name });
        }
      }
    }
    if (data.staffId) {
      data.staffId = data.staffId.toUpperCase();
      const dupe = await prisma.driver.findFirst({ where: { staffId: data.staffId, NOT: { id: req.params.id } } });
      if (dupe) {
        return res.status(409).json({ error: 'Driver ID ' + data.staffId + ' is already assigned to ' + dupe.name + '.' });
      }
    }
    res.json(await prisma.driver.update({ where: { id: req.params.id }, data }));
  } catch (e: any) {
    console.error('PATCH /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not update the driver.' });
  }
});
// ---- A staff member's licence document ----------------------------------
/*
 * The licence itself.
 *
 * Scanned licences are the one part of a staff file that is genuinely a
 * document: the record has to be able to say what is attached and hand it back
 * to the Transport Manager, without every roster load carrying it. The upload
 * takes a data URL (the same shape a captured signature already travels in)
 * and is capped at the 10 MB the form promises, with a route-scoped body limit
 * so the rest of the API keeps its 4 MB ceiling.
 */
app.post('/api/drivers/:id/licence', authenticate, authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), express.json({ limit: '16mb' }), async (req, res) => {
  const fileName = String(req.body?.fileName || '').trim();
  const dataUrl = String(req.body?.dataUrl || '');
  if (!fileName) return res.status(400).json({ error: 'A file name is required.' });
  const match = /^data:([a-z0-9.+\/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'The document must be sent as a base64 data URL.' });
  const mime = match[1].toLowerCase();
  const bytes = Math.floor((match[2].length * 3) / 4);
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mime)) {
    return res.status(400).json({ error: 'The licence must be a PDF or an image (JPG, PNG, WEBP).' });
  }
  if (bytes > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'That file is larger than 10 MB.' });
  }
  try {
    const row = await prisma.driver.update({
      where: { id: req.params.id },
      data: { licenseDocument: dataUrl, licenseDocName: fileName, licenseDocAt: new Date() },
      select: { id: true, name: true, staffId: true, licenseDocName: true, licenseDocAt: true },
    });
    try {
      await notify('HR & Personnel', 'Licence Document Attached',
        row.licenseDocName + ' was attached to ' + row.name + ' (' + row.staffId + ').',
        'info', 'Transport Manager,HR & Personnel',
        { module: 'HR & Personnel', eventKey: 'staff.licence_document', refId: row.id, refLabel: row.staffId });
    } catch (_) { /* the document stands even if the alert fails */ }
    res.json({ ok: true, ...row, hasLicenseDoc: true });
  } catch (e) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Staff record not found' });
    console.error('POST /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not attach the document.' });
  }
});

app.get('/api/drivers/:id/licence', authenticate, async (req, res) => {
  try {
    const row = await prisma.driver.findUnique({
      where: { id: req.params.id },
      select: { name: true, staffId: true, licenseDocName: true, licenseDocAt: true, licenseDocument: true },
    });
    if (!row) return res.status(404).json({ error: 'Staff record not found' });
    res.json({
      fileName: row.licenseDocName || null,
      attachedAt: row.licenseDocAt || null,
      dataUrl: row.licenseDocument || null,
    });
  } catch (e) {
    console.error('GET /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not read the document.' });
  }
});

app.delete('/api/drivers/:id/licence', authenticate, authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    await prisma.driver.update({
      where: { id: req.params.id },
      data: { licenseDocument: null, licenseDocName: null, licenseDocAt: null },
    });
    res.status(204).end();
  } catch (e) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Staff record not found' });
    console.error('DELETE /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not remove the document.' });
  }
});


app.delete('/api/drivers/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    await prisma.driver.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    console.error('DELETE /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not remove the driver.' });
  }
});

app.delete('/api/gate/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Security'), async (req, res) => {
  try {
    await prisma.gateEntry.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Gate entry not found' });
    res.status(500).json({ error: e?.message || 'Could not delete gate entry' });
  }
});

// --- INVENTORY ---
/**
 * Write a movement to the store's ledger.
 *
 * Fire-and-forget: the stock change is the business write and it has already
 * happened, so a ledger failure is logged rather than thrown back at the user.
 */
async function writeMovement(row: any) {
  try {
    return await prisma.inventoryMovement.create({ data: row });
  } catch (e: any) {
    console.error('movement write failed:', e?.message);
    return null;
  }
}

const inventoryStatus = (stock: number, reorderLevel: number) =>
  stock === 0 ? 'Out of Stock' : stock <= reorderLevel ? 'Low Stock' : 'In Stock';

/** Who touched it — the name on the token, or the email behind it. */
const actingUser = (req: any) =>
  String(req?.user?.name || req?.user?.fullName || req?.user?.email || 'System');
app.get('/api/inventory', authenticate, async (_req, res) => {
  res.json(await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }));
});
app.post('/api/inventory', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const stock = Number(req.body.stock ?? 0);
  const reorderLevel = Number(req.body.reorderLevel ?? 5);
  const status = stock === 0 ? 'Out of Stock' : stock <= reorderLevel ? 'Low Stock' : 'In Stock';
  res.json(await prisma.inventoryItem.create({ data: { ...req.body, stock, reorderLevel, status } }));
});
app.patch('/api/inventory/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Whitelist exactly the columns the store board edits. Spreading req.body
  // straight through meant an unknown UI field (or a hand-crafted payload with
  // `id`/`createdAt`) crashed the write with a Prisma 500 — the stock number
  // never saved and the ledger never recorded the edit.
  const ALLOWED_ITEM_FIELDS = ['name', 'sku', 'category', 'stock', 'reorderLevel', 'unitCost', 'vehicleCompatibility', 'supplier', 'location'];
  const body: any = {};
  for (const key of ALLOWED_ITEM_FIELDS) if (req.body?.[key] !== undefined) body[key] = req.body[key];
  if (body.stock != null && (!Number.isFinite(Number(body.stock)) || Number(body.stock) < 0)) {
    return res.status(400).json({ error: 'stock must be a non-negative number' });
  }
  if (body.reorderLevel != null && (!Number.isFinite(Number(body.reorderLevel)) || Number(body.reorderLevel) < 0)) {
    return res.status(400).json({ error: 'reorderLevel must be a non-negative number' });
  }
  if (body.unitCost != null && (!Number.isFinite(Number(body.unitCost)) || Number(body.unitCost) < 0)) {
    return res.status(400).json({ error: 'unitCost must be a non-negative number' });
  }
  const stock = body.stock != null ? Number(body.stock) : existing.stock;
  const reorderLevel = body.reorderLevel != null ? Number(body.reorderLevel) : existing.reorderLevel;
  const status = stock === 0 ? 'Out of Stock' : stock <= reorderLevel ? 'Low Stock' : 'In Stock';
  const updated = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { ...body, stock, reorderLevel, status } });
  // Editing a stock number is a movement like any other: it goes on the ledger,
  // with who did it, so a shelf that changes with no purchase behind it is
  // visible instead of silent.
  const delta = stock - existing.stock;
  if (delta !== 0) {
    await writeMovement({
      itemId: existing.id,
      itemName: existing.name,
      sku: existing.sku,
      kind: delta < 0 ? 'Write-off' : 'Adjustment',
      quantity: delta,
      unitCost: existing.unitCost,
      value: Math.abs(delta) * existing.unitCost,
      note: 'Stock edited on the store board',
      actedBy: actingUser(req),
    });
  }
  res.json(updated);
});
app.delete('/api/inventory/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/** The ledger, newest first — one line's history, or the whole store's. */
app.get('/api/inventory-movements', authenticate, async (req, res) => {
  const itemId = String(req.query.itemId || '');
  res.json(await prisma.inventoryMovement.findMany({
    where: itemId ? { itemId } : undefined,
    orderBy: { actedAt: 'desc' },
    take: 500,
  }));
});

/**
 * Stock in from a vendor.
 *
 * The purchase price replaces the line's book price, so the shelf is always
 * valued at the most recent thing actually paid for it — the same rule the
 * diesel tank is valued by.
 */
app.post('/api/inventory/:id/purchase', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const qty = Math.floor(Number(req.body.qty ?? 0));
  if (!qty || qty <= 0) return res.status(400).json({ error: 'A purchase needs a quantity.' });
  const unitPrice = Number(req.body.unitPrice ?? 0) || item.unitCost;
  const vendor = String(req.body.vendor || '').trim();
  // Weighted average cost: the line's unit cost becomes the blend of
  // everything bought for it, so the valuation moves by what was actually paid
  // and one expensive delivery cannot spike a truck's maintenance file.
  const existingQty = Math.max(0, item.stock);
  const existingCost = item.unitCost ?? 0;
  const wac =
    unitPrice > 0 && existingQty + qty > 0
      ? (existingQty * existingCost + qty * unitPrice) / (existingQty + qty)
      : existingCost || unitPrice;
  const stock = item.stock + qty;
  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: {
      stock,
      status: inventoryStatus(stock, item.reorderLevel),
      unitCost: unitPrice > 0 ? wac : existingCost,
      supplier: vendor || item.supplier,
    },
  });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: 'Purchase',
    quantity: qty,
    unitCost: unitPrice,
    value: qty * unitPrice,
    vendor,
    reference: String(req.body.reference || ''),
    note: String(req.body.note || ''),
    actedBy: actingUser(req),
  });
  // A vendor moving their price more than 15% above the line's existing cost is
  // flagged, not silently absorbed into the average.
  if (existingCost > 0 && unitPrice > existingCost * 1.15) {
    const pct = Math.round(((unitPrice - existingCost) / existingCost) * 100);
    await notify('Inventory', 'Vendor price increase', `${item.name}: ${vendor || 'the vendor'} moved the unit price from ${Math.round(existingCost).toLocaleString()} to ${Math.round(unitPrice).toLocaleString()} (+${pct}%).`, 'warning', 'Head of Inventory,Transport Manager', { module: 'Inventory', eventKey: 'inventory.price_increase', refId: item.id, refLabel: item.name, actionRoles: ['Head of Inventory'] });
  }
  // Auto-reactivation: the shelf now covers a ticket that was paused for
  // procurement — hand it back to the store floor queue. The guard reads the
  // POST-purchase stock: `item` was fetched before this delivery was applied,
  // which is exactly the moment (bin empty, delivery just landed) the loop
  // exists for.
  const postStock = stock; // auto-reactivation reads the shelf AFTER the delivery
  if (postStock > 0) {
    // Oldest first, and every ticket the shelf now covers resumes — not just
    // the single oldest one. `coverable` stops the queue from promising more
    // than the shelf holds: a ticket too big for what arrived stays paused
    // until the next delivery.
    let coverable = stock;
    const paused = await prisma.inventoryRequisition.findMany({
      where: { itemId: item.id, status: 'Awaiting Procurement' },
      orderBy: { date: 'asc' },
    });
    for (const ticket of paused) {
      if (ticket.quantity > coverable) continue;
      coverable -= ticket.quantity;
      await prisma.inventoryRequisition.update({
        where: { id: ticket.id },
        data: { status: 'Awaiting Pickup' },
      });
      await notify('Inventory', 'Back in stock — handoff resumed', `${item.name} is back on the shelf; ${ticket.part} for ${ticket.truckReg} returned to the store floor queue.`, 'info', 'Inventory,Head of Inventory,Store Floor Attendant,Engineering', { module: 'Inventory', eventKey: 'inventory.reactivated', refId: ticket.id, refLabel: ticket.part, actionRoles: ['Head of Inventory', 'Store Floor Attendant', 'Inventory'] });
    }
  }
  res.json(updated);
});

/** A correction that is neither a purchase nor an issue. */
app.post('/api/inventory/:id/adjust', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const delta = Math.trunc(Number(req.body.delta ?? 0));
  if (!delta) return res.status(400).json({ error: 'An adjustment needs a signed quantity.' });
  const stock = Math.max(0, item.stock + delta);
  const applied = stock - item.stock;
  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { stock, status: inventoryStatus(stock, item.reorderLevel) },
  });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: delta < 0 ? 'Write-off' : 'Adjustment',
    quantity: applied,
    unitCost: item.unitCost,
    value: Math.abs(applied) * item.unitCost,
    note: String(req.body.note || ''),
    reference: String(req.body.reference || ''),
    actedBy: actingUser(req),
  });
  res.json(updated);
});

/**
 * The shelf, in bulk: upserted by SKU. Onboarding a store one part at a time is
 * why an empty shelf stays empty.
 */
app.post('/api/inventory/import', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const sku = String(row?.sku || '').trim();
    const name = String(row?.name || '').trim();
    if (!sku || !name) {
      skipped.push(name || sku || 'a row with no name or SKU');
      continue;
    }
    const stock = Math.trunc(Number(row.stock ?? 0)) || 0;
    const reorderLevel = Math.trunc(Number(row.reorderLevel ?? 5)) || 0;
    const data = {
      name,
      category: String(row.category || 'General').trim() || 'General',
      stock,
      reorderLevel,
      unitCost: Number(row.unitCost ?? 0) || 0,
      location: String(row.location || 'Main Store').trim() || 'Main Store',
      supplier: String(row.supplier || '').trim(),
      vehicleCompatibility: String(row.vehicleCompatibility || row.compatibility || '').trim(),
      status: inventoryStatus(stock, reorderLevel),
    };
    const existing = await prisma.inventoryItem.findUnique({ where: { sku } });
    if (existing) {
      await prisma.inventoryItem.update({ where: { sku }, data });
      updated += 1;
    } else {
      await prisma.inventoryItem.create({ data: { sku, ...data } });
      created += 1;
    }
  }
  res.json({ created, updated, skipped });
});

app.get('/api/inventory-requisitions', authenticate, async (_req, res) => {
  res.json(await prisma.inventoryRequisition.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/inventory-requisitions', authenticate, async (req: any, res) => {
  // REQUISITION-CREATE-WHITELIST: only the ticket's own fields are writable at
  // raise time. Passing req.body straight through let any caller fabricate the
  // audit columns the chain is supposed to write — handoffAt, signature,
  // pickedBy, reviewedBy, a forged status — from a raw unauthorised POST.
  const REQ_FIELDS = ['workOrder', 'truckReg', 'mechanic', 'part', 'itemId', 'quantity', 'reason', 'unitCost', 'decisionNote', 'requestGroup', 'description', 'targetType'];
  const body = req.body || {};
  const data: any = {};
  for (const key of REQ_FIELDS) if (body[key] !== undefined) data[key] = body[key];
  for (const required of ['workOrder', 'truckReg', 'mechanic', 'part', 'quantity', 'reason']) {
    if (data[required] === undefined || data[required] === null || String(data[required]).trim() === '') {
      return res.status(400).json({ error: `${required} is required to raise a requisition.` });
    }
  }
  res.json(await prisma.inventoryRequisition.create({ data }));
});
app.patch('/api/inventory-requisitions/:id', authenticate, async (req, res) => {
  // REQUISITION-EDIT-WHITELIST: the screens edit the ticket's own words — the
  // decision (status / decisionNote) or the request's own lines. Identity and
  // audit columns are never client-writable, so a stray client cannot rewrite
  // the queue's bookkeeping.
  const EDITABLE_REQUEST_FIELDS = ['status', 'decisionNote', 'quantity', 'reason', 'part', 'mechanic', 'truckReg', 'workOrder', 'description', 'targetType', 'requestGroup', 'reviewedBy', 'reviewedAt'];
  const body = req.body || {};
  const data: any = {};
  for (const key of EDITABLE_REQUEST_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  // A ticket becomes Released (parts issued) through the store's sign-off, or
  // when the Transport Manager approves a line the store does not stock.
  // Anything else must travel the chain, so a stray write cannot skip it.
  if (data.status === 'Released') {
    const current = await prisma.inventoryRequisition.findUnique({ where: { id: req.params.id } });
    if (!current || !['Pending', 'Awaiting Admin Approval'].includes(current.status)) {
      return res.status(400).json({ error: 'This ticket has already moved down the line.' });
    }
  }
  res.json(await prisma.inventoryRequisition.update({ where: { id: req.params.id }, data }));
});

/**
 * A grouped engineering request: ONE header (target + description) with MANY
 * store lines, the way the approved design raises it.
 *
 * Every line is its own row (the store picks, signs and prices lines
 * independently) sharing a requestGroup, and every line lands on the Head of
 * Engineering's desk as Awaiting HOE Review — never directly with the store.
 */
app.post('/api/inventory-requisitions/group', authenticate, authorize('Engineering', 'Engineering & Maintenance', 'Engineering and Maintenance', 'Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req: any, res) => {
  const targetType = String(req.body?.targetType || '').trim();
  const truckReg = String(req.body?.truckReg || '').trim();
  const description = String(req.body?.description || '').trim();
  const requestedBy = String(req.body?.requestedBy || req.user?.name || '').trim();
  const workOrder = String(req.body?.workOrder || '').trim();
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!['Truck Head', 'Truck Tail', 'Workshop'].includes(targetType)) return res.status(400).json({ error: 'targetType must be Truck Head, Truck Tail or Workshop.' });
  if (targetType !== 'Workshop' && !truckReg) return res.status(400).json({ error: 'Choose the truck this request is for.' });
  if (!description) return res.status(400).json({ error: 'Describe what the parts are needed for.' });
  if (!lines.length) return res.status(400).json({ error: 'Add at least one part line.' });
  const group = 'EG-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  try {
    const created = [];
    for (const line of lines) {
      const part = String(line?.part || '').trim();
      const quantity = Math.trunc(Number(line?.quantity));
      if (!part || !Number.isFinite(quantity) || quantity <= 0) continue;
      created.push(await prisma.inventoryRequisition.create({
        data: {
          workOrder,
          truckReg: targetType === 'Workshop' ? 'WORKSHOP' : truckReg,
          mechanic: requestedBy,
          part,
          itemId: String(line?.itemId || '') || null,
          quantity,
          reason: String(line?.reason || '').trim(),
          unitCost: Number(line?.unitCost) || 0,
          status: 'Awaiting HOE Review',
          requestGroup: group,
          description,
          targetType,
        },
      }));
    }
    if (!created.length) return res.status(400).json({ error: 'No valid part line was supplied.' });
    // The decision now belongs to the Engineering Manager's account, so his
    // roles carry the actionable badge — not the workshop that raised it.
    await notify('Engineering', 'Parts request needs HOE review', `${group} • ${created.length} line(s) for ${targetType === 'Workshop' ? 'the workshop' : truckReg}: ${description} — raised by ${requestedBy}.`, 'warning', 'Head of Engineering,Engineering Manager,Transport Manager,Platform Admin', { module: 'Engineering', eventKey: 'engineering.parts_submitted', refId: group, refLabel: truckReg || 'Workshop', actionRoles: ['Head of Engineering', 'Engineering Manager'] });
    res.status(201).json({ group, lines: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The Head of Engineering's verdict on a grouped request: validate (optionally
 * correcting quantities / names first) and pass it to the Transfer Manager, or
 * decline it with a reason. Only Awaiting HOE Review groups can be decided —
 * the status machine, not the role list, enforces the order.
 */
// HOE-APPROVE-ONLY: the review verdict belongs to the Engineering Manager's
// account — the workshop role raises requests but does not decide them.
function isEngineeringReviewer(user: any): boolean {
  const roles: string[] = Array.isArray(user?.roles) ? user.roles : [user?.role, ...String(user?.roles || '').split(',')].filter(Boolean).map((r: string) => String(r).trim());
  return roles.some((r) => ['Head of Engineering', 'Engineering Manager', 'Platform Admin', 'Transport Manager'].includes(r));
}
// The review routes admit the department roles through the shared `authorize`
// wrapper and then decide, inside, whether THIS account may actually rule:
// the workshop (Engineering) may pass the door but never the verdict — that is
// the Engineering Manager's alone (plus the TM/admin supervisors).
const HOE_REVIEW_ROLES = [
  'Engineering',
  'Engineering & Maintenance',
  'Engineering and Maintenance',
  'Head of Engineering',
  'Engineering Manager',
  'Platform Admin',
  'Transport Manager',
];
app.post('/api/inventory-requisitions/group/:group/review', authenticate, authorize(...HOE_REVIEW_ROLES), async (req: any, res) => {
  const group = String(req.params.group);
  const approve = req.body?.approve !== false;
  const note = String(req.body?.note || '').trim();
  const mods = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!isEngineeringReviewer(req.user)) return res.status(403).json({ error: 'Only the Engineering Manager may review requests here.' });
  try {
    const rows = await prisma.inventoryRequisition.findMany({ where: { requestGroup: group } });
    if (!rows.length) return res.status(404).json({ error: 'Request group not found.' });
    if (rows.some((r) => r.status !== 'Awaiting HOE Review')) {
      return res.status(400).json({ error: 'This request has already been reviewed.' });
    }
    if (!approve && !note) return res.status(400).json({ error: 'A reason is required to decline the request.' });
    const by = actingUser(req);
    const now = new Date();
    for (const row of rows) {
      const mod = mods.find((m: any) => String(m?.id) === row.id);
      const data: any = {
        status: approve ? 'Awaiting Admin Approval' : 'Rejected',
        reviewedBy: by,
        reviewedAt: now,
        decisionNote: note || null,
      };
      if (approve && mod) {
        if (String(mod.part || '').trim()) data.part = String(mod.part).trim();
        const q = Math.trunc(Number(mod.quantity));
        if (Number.isFinite(q) && q > 0) data.quantity = q;
      }
      await prisma.inventoryRequisition.update({ where: { id: row.id }, data });
    }
    const head = rows[0];
    await notify('Engineering', approve ? 'Parts request validated — TM approval needed' : 'Parts request declined by HOE', `${group} for ${head.truckReg}: ${head.description || head.reason} — ${approve ? 'validated by ' + by + ', awaiting the Transfer Manager.' : 'declined: ' + note}`, approve ? 'info' : 'warning', 'Transport Manager,Engineering,Platform Admin,Parts & Store', { module: 'Engineering', eventKey: approve ? 'engineering.hoe_approved' : 'engineering.hoe_declined', refId: group, refLabel: head.truckReg, actionRoles: approve ? ['Transport Manager'] : ['Engineering', 'Head of Engineering', 'Engineering Manager'] });
    res.json({ ok: true, group, approved: approve, count: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The store floor's queue: every approved requisition waiting for a physical
 * handover (and those paused for procurement), oldest approval first.
 */
app.get('/api/inventory-handoffs', authenticate, async (_req, res) => {
  const rows = await prisma.inventoryRequisition.findMany({
    where: { status: { in: ['Awaiting Pickup', 'Awaiting Procurement'] } },
    orderBy: { date: 'asc' },
  });
  res.json(rows);
});

/**
 * A floor attendant confirms the physical pick of one ticket — or reports that
 * the bin is empty.
 *
 * The flag is the procurement loop: the shelf's book is corrected to zero with
 * a write-off on the ledger (a variance the Head of Inventory sees), a
 * Procurement task is raised with the truck waiting on it, and the ticket
 * pauses until stock returns.
 */
app.post('/api/inventory-handoffs/:reqId/pick', authenticate, async (req, res) => {
  const requisition = await prisma.inventoryRequisition.findUnique({ where: { id: req.params.reqId } });
  if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
  const picked = Boolean(req.body.picked);
  if (picked) {
    if (requisition.status !== 'Awaiting Pickup') {
      return res.status(400).json({ error: 'This ticket is not awaiting a handover.' });
    }
    const updated = await prisma.inventoryRequisition.update({
      where: { id: requisition.id },
      data: { pickedBy: actingUser(req) },
    });
    return res.json(updated);
  }
  // The flag for procurement.
  const item = requisition.itemId
    ? await prisma.inventoryItem.findUnique({ where: { id: requisition.itemId } })
    : null;
  if (item && item.stock > 0) {
    await prisma.inventoryMovement.create({
      data: {
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        kind: 'Write-off',
        quantity: -item.stock,
        unitCost: item.unitCost,
        value: item.stock * item.unitCost,
        note: 'Attendant found the bin empty — count corrected',
        reference: requisition.id,
        actedBy: actingUser(req),
      },
    });
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { stock: 0, status: 'Out of Stock' } });
  }
  const updated = await prisma.inventoryRequisition.update({
    where: { id: requisition.id },
    data: { status: 'Awaiting Procurement' },
  });
  await prisma.procurementRequest.create({
    data: {
      partName: requisition.part,
      quantity: requisition.quantity,
      linkedId: requisition.workOrder || requisition.id,
      truckReg: requisition.truckReg,
      status: 'Requested',
    },
  }).catch(() => null);
  await notify('Inventory', 'Out of stock — procurement needed', `${requisition.part} is not on the shelf for ${requisition.truckReg}. A procurement task has been raised.`, 'warning', 'Head of Inventory,Procurement,Transport Manager', { module: 'Inventory', eventKey: 'inventory.out_of_stock', refId: requisition.id, refLabel: requisition.part, actionRoles: ['Head of Inventory', 'Procurement'] });
  res.json(updated);
});

/**
 * The mechanic signs; the store releases.
 *
 * This is the only route in the loop that moves stock: weighted-average costed
 * deduction, the released value attached to the requisition, and the ledger
 * Issue that says which truck took the part out.
 */
app.post('/api/inventory-handoffs/:reqId/complete', authenticate, async (req, res) => {
  const requisition = await prisma.inventoryRequisition.findUnique({ where: { id: req.params.reqId } });
  if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
  if (requisition.status !== 'Awaiting Pickup') {
    return res.status(400).json({ error: 'This ticket is not ready for sign-off.' });
  }
  const signature = String(req.body.signature || '');
  if (!signature) {
    return res.status(400).json({ error: 'The mechanic must sign before the part leaves the store.' });
  }
  const item = requisition.itemId
    ? await prisma.inventoryItem.findUnique({ where: { id: requisition.itemId } })
    : null;
  if (!item) return res.status(400).json({ error: 'This ticket was not drawn from the store.' });
  const qty = Math.max(0, Math.trunc(Number(req.body.qty ?? requisition.quantity)));
  if (item.stock < qty) {
    return res.status(409).json({ error: `Only ${item.stock} on the shelf — the handoff cannot complete.` });
  }
  // The line's unit cost IS its weighted average — recomputed on every inbound
  // batch — so the issue is priced at the blended cost, never the last price.
  const wac = item.unitCost ?? 0;
  const stock = item.stock - qty;
  const status = stock === 0 ? 'Out of Stock' : stock <= item.reorderLevel ? 'Low Stock' : 'In Stock';
  const updatedItem = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { stock, status },
  });
  // LOW-STOCK ALERT (PRD §2) — a disbursement that pushes a line to (or below)
  // its threshold tells the Transport Manager the moment stock moves, so
  // procurement starts before the shelf empties for the next truck. It fires
  // only on the downward crossing: once a line is low/empty, every later issue
  // on it no longer re-alerts.
  if (
    (stock <= item.reorderLevel || stock <= 0) &&
    item.stock > Math.max(item.reorderLevel, 0)
  ) {
    await notify('Inventory', stock <= 0 ? 'Stock depleted' : 'Low stock alert',
      `${item.name} dropped to ${stock} on the shelf (threshold: ${item.reorderLevel}) after ${qty} × ${requisition.part} was released to ${requisition.truckReg}. Initiate procurement to replenish the line.`,
      'warning', 'Transport Manager,Head of Inventory,Store Floor Attendant',
      { module: 'Inventory', eventKey: 'inventory.low_stock', refId: item.id, refLabel: item.name, actionRoles: ['Transport Manager'] });
  }
  const releasedValue = qty * wac;
  const updated = await prisma.inventoryRequisition.update({
    where: { id: requisition.id },
    data: {
      status: 'Released',
      handoffAt: new Date(),
      pickedBy: requisition.pickedBy || actingUser(req),
      signature,
      releasedQty: qty,
      releasedValue,
    },
  });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: 'Issue',
    quantity: -qty,
    unitCost: wac,
    value: releasedValue,
    reference: requisition.id,
    truckReg: requisition.truckReg,
    note: requisition.part,
    actedBy: actingUser(req),
  });
  await notify('Inventory', 'Part handed over', `${requisition.part} x${qty} signed out to ${requisition.truckReg} by ${requisition.mechanic || 'the mechanic'} — ${Math.round(releasedValue).toLocaleString()} posted to the truck.`, 'info', 'Engineering,Head of Inventory,Transport Manager', { module: 'Inventory', eventKey: 'inventory.handoff_complete', refId: requisition.id, refLabel: requisition.part, actionRoles: [] });
  res.json({ requisition: updated, item: updatedItem, releasedValue });
});

/**
 * The store counting: a physical count that disagrees with the book. Filed to
 * the ledger as a variance and flagged to the Head of Inventory and the TM.
 */
app.post('/api/inventory/:id/reconcile', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const observed = Math.trunc(Number(req.body.observed ?? 0));
  const delta = observed - item.stock;
  if (!delta) return res.status(400).json({ error: 'The count matches the book — nothing to reconcile.' });
  const stock = Math.max(0, observed);
  const status = stock === 0 ? 'Out of Stock' : stock <= item.reorderLevel ? 'Low Stock' : 'In Stock';
  const updated = await prisma.inventoryItem.update({ where: { id: item.id }, data: { stock, status } });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: delta < 0 ? 'Write-off' : 'Adjustment',
    quantity: delta,
    unitCost: item.unitCost,
    value: Math.abs(delta) * item.unitCost,
    note: String(req.body.reason || 'Physical count') + ' — variance flag',
    actedBy: actingUser(req),
  });
  await notify('Inventory', 'Stock count variance', `${item.name}: book ${item.stock}, counted ${observed} (${delta > 0 ? '+' : ''}${delta}). Filed by ${actingUser(req)}.`, 'warning', 'Head of Inventory,Transport Manager', { module: 'Inventory', eventKey: 'inventory.variance', refId: item.id, refLabel: item.name, actionRoles: ['Head of Inventory'] });
  res.json(updated);
});

app.post('/api/inventory/:id/release', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  const qty = Number(req.body.qty ?? 0);
  const reqId = req.body.reqId as string | undefined;
  if (!reqId) return res.status(400).json({ error: 'Release requires a valid requisition ID.' });
  const requisition = await prisma.inventoryRequisition.findUnique({ where: { id: reqId } });
  // The Transport Manager approves what the Head of Engineering validated —
  // legacy one-liners still arrive as Pending, grouped engineering requests as
  // Awaiting Admin Approval. Anything else has already moved down the line.
  if (!requisition || !['Pending', 'Awaiting Admin Approval'].includes(requisition.status)) return res.status(400).json({ error: 'Requisition not found or already processed.' });
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  // Approval used to deduct stock immediately — but nothing physical had
  // happened yet. Approval now hands the ticket to the store floor: it sits
  // Awaiting Pickup until an attendant completes the handoff, or Awaiting
  // Procurement when the shelf cannot cover it. Stock moves only at Complete
  // Handoff, when the mechanic has signed.
  await prisma.inventoryRequisition.update({
    where: { id: reqId },
    data: {
      status: item.stock >= qty ? 'Awaiting Pickup' : 'Awaiting Procurement',
      handoffAt: new Date(),
    },
  });
  // Nothing physical has happened at approval — the stock move and the ledger
  // Issue happen at Complete Handoff, when the mechanic has signed.
  await notify('Engineering', 'Part approved — awaiting store handoff', `${requisition.part} for ${requisition.truckReg} approved. The store will pick it and hand it over.`, 'info', 'Inventory,Head of Inventory,Store Floor Attendant,Engineering', { module: 'Inventory', eventKey: 'inventory.handoff_pending', refId: requisition.id, refLabel: requisition.part, actionRoles: ['Head of Inventory', 'Store Floor Attendant', 'Inventory'] });
  res.json({ ok: true });
});

// --- FUEL RESTOCK ORDERS (the TM's buy, procurement receives) ---
// The reorder drill raised a purchase: litres, vendor, unit price, his name.
// It posts a PO into the procurement ledger — the tank is NOT touched here;
// receiving the delivery (Procured below) is what writes stock in.
app.post('/api/fuel-restock-orders', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Math.trunc(Number(req.body?.quantity));
  const unitPrice = Number(req.body?.unitPrice);
  const vendor = String(req.body?.vendor || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number of litres' });
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'unitPrice is what the buy costs per litre — it prices the tank on receiving' });
  try {
    const po = await prisma.procurementRequest.create({
      data: {
        partName: fuelType + ' restock — ' + quantity.toLocaleString() + ' L',
        quantity,
        linkedId: fuelType,
        kind: 'Fuel',
        unitPrice,
        vendor: vendor || null,
        status: 'Requested',
      },
    });
    await notify('Fuel & Lubricant', 'Restock order raised — ' + fuelType,
      quantity.toLocaleString() + ' L of ' + fuelType + ' at ' + Math.round(unitPrice).toLocaleString() + '/L' +
      (vendor ? ' from ' + vendor : '') + ' — ' + actingUser(req) + ' authorized the buy. Procurement to deliver.',
      'info', 'Procurement,Head of Inventory,Lubricant,Transport Manager',
      { module: 'Fuel & Lubricant', eventKey: 'fuel.restock_ordered', refId: po.id, refLabel: po.partName, actionRoles: ['Procurement'] });
    res.status(201).json(po);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PROCUREMENT ---
app.get('/api/procurement', authenticate, async (_req, res) => {
  res.json(await prisma.procurementRequest.findMany({ orderBy: { createdAt: 'desc' } }));
});
/*
 * PROCUREMENT-INTAKE-HARDENED (26 Oct 2026): the raw `req.body` pass-through
 * let a stale/cached client crash the route with a PrismaClientValidationError
 * (the Oct 22 probe: a bare "2026-10-22" string is not a full ISO instant, and
 * a payload without linkedId fails outright). The intake now whitelists the
 * model's own columns, forces an integer quantity, normalizes a day-only date
 * into a real instant, and falls back to a generated linkedId — the columns
 * the store board and the ledger read.
 */
app.post('/api/procurement', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store'), async (req, res) => {
  const b = req.body || {};
  const data: any = {};
  for (const key of ['partName', 'quantity', 'linkedId', 'truckReg', 'kind', 'unitPrice', 'vendor', 'status', 'requestedBy', 'note']) {
    if (b[key] !== undefined && b[key] !== null) data[key] = b[key];
  }
  if (!String(data.partName ?? '').trim()) return res.status(400).json({ error: 'partName is required — what is being bought?' });
  const qty = Math.trunc(Number(b.quantity));
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive whole number' });
  data.quantity = qty;
  if (!String(data.linkedId ?? '').trim()) {
    // The buying reference the board groups by — a generated PO tag when the
    // client sent none, so the row is still one source of truth on its board.
    data.linkedId = 'PO-' + Date.now().toString(36).toUpperCase();
  }
  if (b.date !== undefined) {
    const raw = String(b.date ?? '').trim();
    if (raw) {
      // A cached mobile form sends a day string ("2026-10-22") — normalize to
      // a real instant instead of letting Prisma throw "premature end of input".
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00.000Z' : raw);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'date must be a date, e.g. 2026-10-22' });
      data.date = d;
    }
    // An empty/absent date falls through to the column default (now()).
  }
  try {
    res.json(await prisma.procurementRequest.create({ data }));
  } catch (e: any) {
    console.error('POST /api/procurement failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not raise the procurement request.' });
  }
});
app.patch('/api/procurement/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Parts & Store'), async (req, res) => {
  const before = await prisma.procurementRequest.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: 'Procurement request not found' });
  const pr = await prisma.procurementRequest.update({ where: { id: req.params.id }, data: req.body });
  if (req.body.status === 'Procured' && before.status !== 'Procured') {
    if (before.kind === 'Fuel') {
      // Receiving a fuel delivery: the tank takes in what was bought, priced at
      // what the PO agreed — the same row the tank's value is measured from.
      // Refusing a second receive keeps one delivery = one tank row.
      try {
        const fuelType = LUBRICANT_TYPES.includes(before.linkedId) ? before.linkedId : 'Diesel';
        const stock = await prisma.lubricantStock.update({
          where: { fuelType },
          data: { quantity: { increment: before.quantity } },
        });
        const count = await prisma.lubricantRestock.count();
        const row = await prisma.lubricantRestock.create({
          data: {
            reference: lubricantRef(fuelType, count + 1),
            fuelType,
            quantity: before.quantity,
            loggedBy: 'PO ' + before.id.slice(0, 8) + ' — received by ' + actingUser(req),
            unitCost: before.unitPrice ?? null,
          },
        });
        await notify('Fuel & Lubricant', fuelType + ' delivery received',
          '+' + before.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' received against PO ' + before.id.slice(0, 8) +
          (before.vendor ? ' (vendor ' + before.vendor + ')' : '') + ' — tank now ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + '.',
          'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.restocked', refId: row.id, refLabel: row.reference });
      } catch (e: any) {
        console.error('fuel PO receive failed:', e.message);
      }
    } else {
      await notify('Engineering', 'Part Procured', `Procurement request ${pr.id} (${pr.partName}) marked as Procured.`, 'success', undefined, { module: 'Engineering', eventKey: 'parts.procured', refId: pr.id, refLabel: pr.partName });
    }
  }
  res.json(pr);
});

// --- FUEL ---
app.get('/api/fuel', authenticate, async (_req, res) => {
  res.json(await prisma.fuelRequisition.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/fuel', authenticate, async (req: any, res) => {
  // FUEL-CREATE-WHITELIST: the requisition's own lines only. Raw passthrough
  // let any signed-in caller invent approved litrages, costs or dates from
  // fields the client never sent.
  const FUEL_FIELDS = ['tripId', 'truckReg', 'driverName', 'requiredLitres', 'approvedLitres', 'expectedConsumption', 'standardEfficiency', 'odometer', 'cost', 'date'];
  const body = req.body || {};
  const data: any = {};
  for (const key of FUEL_FIELDS) if (body[key] !== undefined) data[key] = body[key];
  for (const required of ['tripId', 'truckReg', 'driverName']) {
    if (data[required] === undefined || data[required] === null || String(data[required]).trim() === '') {
      return res.status(400).json({ error: `${required} is required to raise a fuel requisition.` });
    }
  }
  res.json(await prisma.fuelRequisition.create({ data }));
});
app.patch('/api/fuel/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Accounts', 'Accountant'), async (req, res) => {
  // Every approval is ONE expense: PATCH is also called to correct a field or
  // re-send a status, so without this a second save of the same row (or any
  // swim at the status other than Approved) double-billed the trip in the
  // expense ledger forever.
  const before = await prisma.fuelRequisition.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: 'Fuel record not found' });
  const fuel = await prisma.fuelRequisition.update({ where: { id: req.params.id }, data: req.body });
  const approvedNow = req.body.status === 'Approved' && before.status !== 'Approved';
  if (approvedNow) {
    const dup = await prisma.expense.findFirst({
      where: { requester: fuel.driverName, amount: fuel.cost, description: `Fuel for ${fuel.truckReg} / trip ${fuel.tripId}` },
    });
    if (!dup) {
      await prisma.expense.create({
        data: {
          requester: fuel.driverName,
          department: 'Fleet Manager',
          type: 'Fuel',
          category: 'Fuel',
          amount: fuel.cost,
          description: `Fuel for ${fuel.truckReg} / trip ${fuel.tripId}`,
          status: 'Approved',
        },
      });
    }
  }
  res.json(fuel);
});

// --- NOTIFICATIONS ---
/**
 * What the Transport Manager's control panel reads first: how much is
 * unread and how much needs a decision, broken down by the department that
 * sent it. One query, so the badge and the panel can never disagree.
 */
app.get('/api/notifications/summary', authenticate, async (req: any, res) => {
  const rows = await prisma.notification.findMany({
    where: { AND: [await notificationScope(req), notDismissed(req)] },
    select: { module: true, category: true, title: true, body: true, read: true, readBy: true, actionRequired: true, actionRoles: true },
  });
  const me = String(req.user?.id || '');
  const byModule: Record<
    string,
    { module: string; total: number; unread: number; action: number; actionAll: number }
  > = {};
  let unread = 0;
  let action = 0;
  let actionAll = 0;
  for (const row of rows as any[]) {
    const moduleName = row.module || classifyNotification(row).module;
    const isRead = row.read || (row.readBy || []).includes(me);
    const needsMe = (row.actionRoles || []).some((role: string) =>
      [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].includes(role),
    );
    const bucket = (byModule[moduleName] = byModule[moduleName] || {
      module: moduleName,
      total: 0,
      unread: 0,
      action: 0,
      actionAll: 0,
    });
    bucket.total += 1;
    if (!isRead) {
      bucket.unread += 1;
      unread += 1;
    }
    // The queue itself, not only the part of it still unread.
    if (needsMe) actionAll += 1;
    if (needsMe && !isRead) {
      bucket.action += 1;
      bucket.actionAll += 1;
      action += 1;
    }
  }
  res.json({
    total: rows.length,
    unread,
    action,
    actionAll,
    modules: Object.values(byModule).sort((a, b) => b.unread - a.unread || a.module.localeCompare(b.module)),
  });
});

app.get('/api/notifications/unread', authenticate, async (req: any, res) => {
  const count = await prisma.notification.count({
    where: { read: false, NOT: { readBy: { has: String(req.user?.id || '') } }, AND: [await notificationScope(req), notDismissed(req)] },
  });
  res.json({ count });
});

// ---- LUBRICANT: inventory, restock and disbursal --------------------------
// The Lubricant department is the single source of truth for what is in the
// tank. Fleet Operations only ever enters a QUANTITY; every naira figure here is
// computed from the Transport Manager's price per litre (FuelPrice above), so a
// dispatcher can never type a cost and a price change re-prices nothing that has
// already been dispensed.
const LUBRICANT_TYPES = ['Diesel', 'Gas'];
const LUBRICANT_WRITE_ROLES = [
  'Lubricant', 'Lubricant Manager', 'Lubricant Operations', 'Inventory',
  'Fuel Manager', 'Fleet Operations', 'Transport Manager', 'Platform Admin',
];

/** GAS-##### / DSL-##### reference shown on the restock row. */
function lubricantRef(fuelType: string, seq: number) {
  return (fuelType === 'Diesel' ? 'DSL-' : 'GAS-') + String(seq).padStart(5, '0');
}

/** The tank row for a fuel type, created on first read so a fresh install has one. */
async function ensureLubricantStock(fuelType: string) {
  return prisma.lubricantStock.upsert({
    where: { fuelType },
    update: {},
    create: { fuelType, quantity: 0, minLevel: fuelType === 'Diesel' ? 2000 : 100 },
  });
}

/** Unit caption the department reads: litres for diesel, KG for gas. */
function lubricantUnit(fuelType: string) {
  return fuelType === 'Gas' ? 'KG' : 'LITRES';
}

/** The Transport Manager's price per litre, per fuel type. */
async function lubricantPrices() {
  const rows = await prisma.fuelPrice.findMany();
  const out: Record<string, number> = { Diesel: 0, Gas: 0 };
  for (const r of rows) if (LUBRICANT_TYPES.includes(r.fuelType)) out[r.fuelType] = r.pricePerLitre;
  return out;
}

// The lifecycle gate every lubricant screen and route now shares with the
// UI: the Transport Manager's final approval IS the release, so 'released'
// is a status, not a litres figure somebody recorded beside the trip.
const LUBRICANT_RELEASED_STATUSES = ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'];
function lubricantGate(status: unknown) {
  return LUBRICANT_RELEASED_STATUSES.includes(String(status ?? '').trim()) ? 'released' : 'waiting';
}

function tripLubricantRequest(directCosts: any) {
  const dc = directCosts && typeof directCosts === 'object' ? directCosts : {};
  const type = LUBRICANT_TYPES.includes(dc.lubricantType) ? dc.lubricantType : null;
  const qty = Number(dc.lubricantQuantity);
  if (!type || !Number.isFinite(qty) || qty <= 0) return null;
  return { fuelType: type as string, quantity: qty };
}

/**
 * Dispatches waiting for lubricant: the load has a diesel/gas request and the
 * department has not dispensed for it yet. Newest first, so the newest truck in
 * the yard is the top row.
 */
/**
 * What the Transport Manager authorized for this dispatch, if anything.
 *
 * Stored on the trip's own directCosts JSON beside the request it answers,
 * so an authorization can never drift from the litre figure it is capping.
 */
function tripLubricantApproval(directCosts: any) {
  const dc = directCosts && typeof directCosts === 'object' ? directCosts : {};
  const litres = Number(dc.lubricantApprovedLitres);
  if (!Number.isFinite(litres) || litres <= 0) return null;
  return {
    litres,
    by: String(dc.lubricantApprovedBy || ''),
    at: String(dc.lubricantApprovedAt || ''),
  };
}

async function lubricantPending(limit = 200) {
  const trips = await prisma.trip.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const disbursed = await prisma.lubricantDisbursal.findMany({ select: { tripId: true } });
  const done = new Set(disbursed.map((d) => d.tripId));
  const pending = [];
  for (const t of trips) {
    if (done.has(t.id)) continue;
    // A truck on its way home is not waiting for diesel — only the outbound leg is.
    if (['Stopped', 'Declined', 'Completed', 'Returning', 'Returned'].includes(String(t.status))) continue;
    const req = tripLubricantRequest(t.directCosts);
    if (!req) continue;
    // THE DESK SEES ONLY WHAT THE TM HAS RELEASED (Fortune, 29 Oct 2026): his
    // final approval is the release — Scheduled or already moving. A dispatch
    // still Awaiting Approval or sitting Approved-but-unscheduled used to ride
    // this list with a gate: 'waiting' tag, and the desk read a card with a
    // Disburse button on work the TM had not cleared ("TM has not approved
    // fleet dispatch so why is it showing in diesel here"). The pour endpoint
    // already refuses an un-released trip; the board now agrees with it — no
    // card, no invitation.
    if (lubricantGate(t.status) !== 'released') continue;
    pending.push({ trip: t, request: req, gate: 'released' });
    if (pending.length >= limit) break;
  }
  return pending;
}

/** Driver / truck head / tail rows for a set of trips, keyed by trip id. */
/** Normalised key for matching a plate / tail number / name typed on a trip. */
function lubricantKey(value: any) {
  return String(value || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/**
 * Driver / truck head / tail rows for a set of trips, keyed by trip id.
 *
 * Trips carry the ids rarely (none of the live ones did) — the dispatch board
 * stores the plate, the tail number and the driver's name — so every lookup
 * falls back to matching those strings. Without the fallback the detail modal's
 * "Vehicle & Operator Details" block came out empty.
 */
async function lubricantTripVehicles(trips: any[]) {
  const [drivers, heads, tails] = await Promise.all([
    prisma.driver.findMany(),
    prisma.truck.findMany(),
    prisma.tail.findMany(),
  ]);
  const driverById = new Map(drivers.map((d: any) => [d.id, d]));
  const headById = new Map(heads.map((h: any) => [h.id, h]));
  const tailById = new Map(tails.map((t: any) => [t.id, t]));

  const headByKey = new Map<string, any>();
  for (const h of heads) {
    for (const key of [lubricantKey(h.registration), lubricantKey((h as any).cabId)]) {
      if (key && !headByKey.has(key)) headByKey.set(key, h);
    }
  }
  const tailByKey = new Map<string, any>();
  for (const t of tails) {
    const key = lubricantKey(t.number);
    if (key && !tailByKey.has(key)) tailByKey.set(key, t);
  }
  const driverByName = new Map<string, any>();
  const driverByPhone = new Map<string, any>();
  for (const d of drivers) {
    const name = String(d.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (name && !driverByName.has(name)) driverByName.set(name, d);
    const phone = String(d.phone || '').replace(/\D/g, '').slice(-10);
    if (phone && !driverByPhone.has(phone)) driverByPhone.set(phone, d);
  }

  const out: Record<string, any> = {};
  for (const t of trips) {
    // "HEADPLATE / TAILNUMBER" is how the board stores the assigned vehicle.
    const parts = String(t.truckReg || '').split('/').map((p: string) => p.trim()).filter(Boolean);
    const headKey = parts.length > 1 ? parts[0] : undefined;
    const tailKey = lubricantKey(t.tailNumber) || lubricantKey(parts.length > 1 ? parts[1] : parts[0]);

    const head = (t.headId && headById.get(t.headId)) || (headKey ? headByKey.get(lubricantKey(headKey)) : undefined) || null;
    const tail = (t.tailId && tailById.get(t.tailId)) || (tailKey ? tailByKey.get(tailKey) : undefined) || null;
    const driver =
      (t.driverId && driverById.get(t.driverId)) ||
      driverByName.get(String(t.driverName || '').trim().toLowerCase().replace(/\s+/g, ' ')) ||
      null;
    out[t.id] = { driver: driver || null, head: head || null, tail: tail || null };
  }
  return out;
}

/** Inventory + money at a glance: the tank cards and the department's counters. */

// lubricant-approvals-endpoint-removed: the release is the Transport Manager's
// final approval in the request lifecycle; the legacy litres endpoint had no
// callers and was removed (scripts/server-patch-remove-lubricant-approvals.cjs).
app.get('/api/lubricant/overview', authenticate, async (_req: any, res) => {
  try {
    const stocks = await Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock));
    const [prices, restockCount, disbursals, pending] = await Promise.all([
      lubricantPrices(),
      prisma.lubricantRestock.count(),
      prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' } }),
      lubricantPending(),
    ]);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = disbursals.filter((d) => new Date(d.createdAt) >= startOfDay);
    const dayLitres: Record<string, number> = { Diesel: 0, Gas: 0 };
    let dayAmount = 0;
    for (const d of today) {
      dayLitres[d.fuelType] = (dayLitres[d.fuelType] || 0) + d.quantity;
      dayAmount += d.amount;
    }
    res.json({
      stocks: stocks.map((s) => ({ ...s, unit: lubricantUnit(s.fuelType), low: s.quantity < s.minLevel })),
      prices,
      counts: { restock: restockCount, disbursal: disbursals.length, requests: pending.length },
      daily: { litres: dayLitres, amount: dayAmount, trucks: new Set(today.map((d) => d.tripId)).size },
      totals: {
        litres: LUBRICANT_TYPES.reduce((acc, t) => {
          acc[t] = disbursals.filter((d) => d.fuelType === t).reduce((s, d) => s + d.quantity, 0);
          return acc;
        }, {} as Record<string, number>),
        amount: disbursals.reduce((s, d) => s + d.amount, 0),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Restock records: buying diesel / gas back into the tank ----------------
app.get('/api/lubricant/restocks', authenticate, async (_req: any, res) => {
  try {
    const rows = await prisma.lubricantRestock.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lubricant/restocks', authenticate, authorize(...LUBRICANT_WRITE_ROLES), async (req: any, res) => {
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Number(req.body?.quantity);
  // RESTOCK-ACTOR — the person doing this IS the authenticated account: the
  // restock is stamped with the name on the token, never a name somebody typed
  // into a form (the modal no longer even asks).
  const loggedBy = actingUser(req);
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
    const unitCost = Number(req.body?.unitCost);
    const restockCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;
  try {
    const count = await prisma.lubricantRestock.count();
    const row = await prisma.lubricantRestock.create({
      data: { reference: lubricantRef(fuelType, count + 1), fuelType, quantity, loggedBy, unitCost: restockCost },
    });
    const stock = await prisma.lubricantStock.update({
      where: { fuelType },
      data: { quantity: { increment: quantity } },
    });
    try {
      await notify('Lubricant', fuelType + ' Restocked',
        '+' + quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' logged by ' + loggedBy +
        ' — available now ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + '.',
        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
        { module: 'Fuel & Lubricant', eventKey: 'fuel.restocked' });
    } catch (_) { /* notification must never fail the restock */ }
    res.status(201).json({ ...row, stock: { ...stock, unit: lubricantUnit(fuelType) } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Disbursal requests: dispatches still waiting for lubricant -------------
app.get('/api/lubricant/requests', authenticate, async (_req: any, res) => {
  try {
    const pending = await lubricantPending();
    const vehicles = await lubricantTripVehicles(pending.map((p) => p.trip));
    const prices = await lubricantPrices();
    res.json(pending.map(({ trip, request }) => ({
      ...trip,
      ...vehicles[trip.id],
      request,
      approval: tripLubricantApproval(trip.directCosts),
      approvedByFleetOps: !!(trip.directCosts as any)?.lubricantApprovedLitres,
      unitPrice: prices[request.fuelType] || 0,
      estimatedAmount: (prices[request.fuelType] || 0) * request.quantity,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Disbursal history ------------------------------------------------------
app.get('/api/lubricant/disbursals', authenticate, async (_req: any, res) => {
  try {
    const rows = await prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
    const trips = rows.length
      ? await prisma.trip.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.tripId))) } } })
      : [];
    const vehicles = await lubricantTripVehicles(trips);
    const tripById = new Map(trips.map((t) => [t.id, t]));
    res.json(rows.map((r) => {
      const trip = tripById.get(r.tripId);
      return {
        ...r,
        unit: lubricantUnit(r.fuelType),
        reference: dispatchRef(r.tripId),
        ...(vehicles[r.tripId] || { driver: null, head: null, tail: null }),
        approval: tripLubricantApproval(trip ? trip.directCosts : null),
        trip: trip || null,
      };
    }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Dispense lubricant against a dispatch.
 *
 * The amount is quantity × the Transport Manager's price per litre, read here
 * and SNAPSHOT onto the row — the dispatcher cannot type a cost, and a later
 * price change never rewrites what a delivery already cost.
 */
app.post('/api/lubricant/disbursals', authenticate, authorize(...LUBRICANT_WRITE_ROLES), async (req: any, res) => {
  const tripId = String(req.body?.tripId || '').trim();
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Number(req.body?.quantity);
  const dispensedBy = String(req.body?.dispensedBy || '').trim();
  if (!tripId) return res.status(400).json({ error: 'tripId is required' });
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  if (!dispensedBy) return res.status(400).json({ error: 'dispensedBy is required' });
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const duplicate = await prisma.lubricantDisbursal.findFirst({ where: { tripId } });
    // The gate before the pump: a dispatch the Transport Manager has not
    // cleared (Requested / Approved / Awaiting Approval) cannot be drawn
    // from, and a declined or finished one is not a ticket at all. Stock
    // checks below only matter once the trip itself is allowed to fuel.
    if (['Stopped', 'Declined'].includes(String(trip.status ?? '').trim())) {
      return res.status(409).json({
        error:
          dispatchRef(tripId) +
          ' was ' +
          (String(trip.status).toLowerCase() === 'stopped' ? 'declined' : String(trip.status).toLowerCase()) +
          ' — there is nothing to dispense for.',
      });
    }
    if (lubricantGate(trip.status) !== 'released') {
      return res.status(409).json({
        error:
          'The Transport Manager has not cleared ' + dispatchRef(tripId) +
          ' yet (status: ' + (String(trip.status || 'Requested') || 'Requested') +
          ') — his approval is the release; ask him to approve the dispatch first.',
      });
    }

    if (duplicate) {
      return res.status(409).json({
        error: 'Lubricant was already dispensed for ' + dispatchRef(tripId) + ' (' +
          duplicate.quantity.toLocaleString() + ' ' + lubricantUnit(duplicate.fuelType) +
          ' by ' + duplicate.dispensedBy + '). One disbursal per dispatch.',
      });
    }
    // The authorization is a cap, not a suggestion: an attendant who is about
    // to dispense more than the Transport Manager released is stopped here,
    // with the figure that was released quoted back.
    const authorizedLitres = tripLubricantApproval((trip as any).directCosts);
    if (authorizedLitres && quantity > authorizedLitres.litres) {
      return res.status(409).json({
        error: 'The Transport Manager authorized ' + authorizedLitres.litres.toLocaleString() +
          ' ' + lubricantUnit(fuelType) + ' for ' + dispatchRef(tripId) + ' — ' +
          quantity.toLocaleString() + ' cannot be dispensed. Ask for the extra litres first.',
      });
    }
    const stock = await ensureLubricantStock(fuelType);
    if (quantity > stock.quantity) {
      return res.status(409).json({
        error: 'Only ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) +
          ' of ' + fuelType + ' is in the tank — restock before dispensing ' + quantity.toLocaleString() + '.',
      });
    }
    const prices = await lubricantPrices();
    const unitPrice = prices[fuelType] || 0;
    if (unitPrice <= 0) {
      return res.status(409).json({ error: 'The Transport Manager has not set the ' + fuelType + ' price per litre yet — the cost cannot be computed.' });
    }
    const row = await prisma.lubricantDisbursal.create({
      data: {
        tripId, fuelType, quantity, dispensedBy,
        unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100,
        destination: trip.dropoff || null,
      } as any,
    });
    const after = await prisma.lubricantStock.update({
      where: { fuelType },
      data: { quantity: { decrement: quantity } },
    });
    try {
      await notify('Lubricant', 'Successful ' + fuelType.toLowerCase() + ' disbursal',
        quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' • ' + dispatchRef(tripId) +
        ' • ₦' + (row.amount).toLocaleString() + ' • dispensed by ' + dispensedBy,
        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
        { module: 'Fuel & Lubricant', eventKey: 'fuel.dispensed', refId: tripId, refLabel: dispatchRef(tripId) });
      if (after.quantity < after.minLevel) {
        await notify('Lubricant', fuelType + ' Inventory is running low',
          'Current Stock: ' + after.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) +
          ' (minimum ' + after.minLevel.toLocaleString() + ')',
          'warning', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
          {
            module: 'Fuel & Lubricant',
            eventKey: 'fuel.low_stock',
            refLabel: fuelType,
            // Buying more is the Transport Manager's decision.
            actionRoles: ['Transport Manager'],
          });
      }
    } catch (_) { /* the disbursal stands even if the alert fails */ }
    res.status(201).json({ ...row, unit: lubricantUnit(fuelType), reference: dispatchRef(tripId), stock: after });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The department's notification feed.
 *
 * Built from what actually happened (tanks low, trucks waiting, what was
 * dispensed and restocked) rather than only from pushed rows, so the page is
 * true the moment it opens — including for the alerts the department never
 * received because nobody had wired them.
 */
// ---- Lubricant review: the TM endorses what the department logged ------
app.patch('/api/lubricant/disbursals/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const status = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!['Pending', 'Approved', 'Declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be Pending, Approved or Declined' });
  }
  try {
    const row = await prisma.lubricantDisbursal.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Disbursal record not found' });
    const reviewedBy = req.user.name || req.user.email || 'Transport Manager';
    const updated = await prisma.lubricantDisbursal.update({
      where: { id: row.id },
      data: { status, reviewedBy, reviewedAt: new Date(), reviewNote: note || null },
    });
    try {
      const unit = lubricantUnit(row.fuelType);
      const what = row.quantity.toLocaleString() + ' ' + unit + ' for ' + dispatchRef(row.tripId);
      await notify('Lubricant',
        status === 'Approved'
          ? 'Disbursal endorsed'
          : status === 'Declined'
            ? 'Disbursal flagged'
            : 'Disbursal reopened',
        status === 'Approved'
          ? what + ' endorsed by ' + reviewedBy + '.'
          : status === 'Declined'
            ? what + ' was flagged by ' + reviewedBy + (note ? ' — ' + note : '') + '.'
            : 'The review of ' + what + ' was reopened.',
        status === 'Declined' ? 'warning' : 'success',
        'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
        {
          module: 'Fuel & Lubricant',
          eventKey: status === 'Approved' ? 'fuel.disbursal_endorsed' : status === 'Declined' ? 'fuel.disbursal_flagged' : 'fuel.disbursal_reopened',
          refId: row.id,
          refLabel: dispatchRef(row.tripId),
        });
    } catch (_) { /* the review stands even if the alert fails */ }
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Direct cost voucher: the TM endorses the cost sheet ---------------
app.post('/api/trips/:id/voucher', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const status = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!['Pending', 'Approved', 'Declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be Pending, Approved or Declined' });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
    const by = req.user.name || req.user.email || 'Transport Manager';
    dc.voucher = { status, by, at: new Date().toISOString(), note: note || null };
    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });
    try {
      const what = dispatchRef(trip.id);
      await notify('Accounts', 'Voucher ' + (status === 'Approved' ? 'approved' : status === 'Declined' ? 'declined' : 'reopened'),
        what + "'s direct-cost voucher was " + (status === 'Approved' ? 'approved' : status === 'Declined' ? 'declined' : 'reopened') +
          ' by ' + by + (note ? ' — ' + note : '') + '.',
        status === 'Declined' ? 'warning' : 'success',
        'Accounts,Transport Manager,Fleet Operations',
        { module: 'Accounts', eventKey: 'accounts.voucher_' + status.toLowerCase(), refId: trip.id, refLabel: what });
    } catch (_) { /* the decision stands even if the alert fails */ }
    res.json({ ok: true, tripId: trip.id, voucher: (updated.directCosts as any)?.voucher ?? null });
  } catch (e: any) {
    console.error('POST /api/trips/:id/voucher failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not record the voucher decision.' });
  }
});

// ---- Accounts desk: the money actually leaves ------------------------
const DIRECT_COST_KEYS = ['tripAllowance', 'returnWaybill', 'motorBoy', 'ticket', 'extraAllowance', 'bonus'];
const DISBURSEMENT_STATUSES = ['Disbursed (Funds Released to Driver)', 'Reconciled (Journey Concluded)'];
const PENDING_DISBURSAL = 'Pending Disbursal';

function costSheet(trip: any) {
  return trip && trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
}

// The Accounts desk records that the money left, and how.
app.post('/api/trips/:id/disbursement', authenticate, authorize('Accounts', 'Accountant', 'Platform Admin'), async (req: any, res) => {
  const body = req.body || {};
  const status = String(body.status || '').trim();
  if (status && status !== PENDING_DISBURSAL && !DISBURSEMENT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown disbursement status: ' + status });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const dc = costSheet(trip);
    // The six figures stay the dispatch's own: the desk may correct one it was
    // configured with, but only with a real number.
    const amounts = body.amounts && typeof body.amounts === 'object' ? body.amounts : {};
    let corrected = 0;
    for (const key of DIRECT_COST_KEYS) {
      if (!(key in amounts)) continue;
      const value = Number((amounts as any)[key]);
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: key + ' must be a number of naira or more' });
      }
      if (Number(dc[key] || 0) !== value) corrected += 1;
      dc[key] = value;
    }
    const by = req.user.name || req.user.email || 'Accounts';
    if (status === PENDING_DISBURSAL) {
      // Reopening: a disbursal recorded against the wrong truck has to be
      // withdrawable, or the board keeps a payment that never happened.
      delete dc.disbursement;
    } else {
      dc.disbursement = {
        paymentMethod: String(body.paymentMethod || '').trim(),
        bankRef: String(body.bankRef || '').trim(),
        officer: String(body.officer || '').trim(),
        status,
        at: new Date().toISOString(),
        by,
      };
    }
    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });
    try {
      const what = dispatchRef(trip.id);
      const message = status === PENDING_DISBURSAL
        ? what + ' was reopened by Accounts - the disbursal captured against it was withdrawn.'
        : what + ' was ' + (status === DISBURSEMENT_STATUSES[1] ? 'reconciled' : 'disbursed') +
          ' by ' + by + (dc.disbursement.paymentMethod ? ' via ' + dc.disbursement.paymentMethod : '') +
          (dc.disbursement.bankRef ? ' (ref ' + dc.disbursement.bankRef + ')' : '') +
          (corrected ? ' - ' + corrected + ' cost figure(s) corrected on capture' : '') + '.';
      await notify('Accounts', 'Direct cost ' + (status === PENDING_DISBURSAL ? 'disbursal reopened' : 'disbursed'),
        message, status === PENDING_DISBURSAL ? 'warning' : 'success',
        'Accounts,Transport Manager,Fleet Operations',
        { module: 'Accounts', eventKey: 'accounts.disbursement_' + (status === PENDING_DISBURSAL ? 'reopened' : 'captured'),
          refId: trip.id, refLabel: what });
    } catch (_) { /* the record stands even if the alert fails */ }
    res.json({ ok: true, tripId: trip.id, directCosts: updated.directCosts });
  } catch (e: any) {
    console.error('POST /api/trips/:id/disbursement failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not record the disbursal.' });
  }
});

// A cost the six categories do not cover: a line the desk adds, or a correction
// to a category that was configured with the wrong figure.
app.post('/api/trips/:id/direct-cost', authenticate, authorize('Accounts', 'Accountant', 'Platform Admin'), async (req: any, res) => {
  const body = req.body || {};
  const key = String(body.key || '').trim();
  const label = String(body.label || '').trim();
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'Amount must be a number of naira or more' });
  }
  if (!key && !label) {
    return res.status(400).json({ error: 'Name the cost, or pick the category it belongs to' });
  }
  if (key && !DIRECT_COST_KEYS.includes(key)) {
    return res.status(400).json({ error: 'Unknown direct cost category: ' + key });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const dc = costSheet(trip);
    const by = req.user.name || req.user.email || 'Accounts';
    const at = new Date().toISOString();
    if (key) {
      dc[key] = amount;
    } else {
      const extras = Array.isArray(dc.extras) ? dc.extras.slice() : [];
      const existing = extras.findIndex((line: any) => String(line?.label || '').toLowerCase() === label.toLowerCase());
      // The same extra twice is the same cost corrected, not a second charge.
      if (existing >= 0) extras[existing] = { ...extras[existing], amount, at, by };
      else extras.push({ label, amount, at, by });
      dc.extras = extras;
    }
    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });
    try {
      const what = dispatchRef(trip.id);
      await notify('Accounts', 'Direct cost added',
        what + ': ' + (key || label) + ' recorded at ' + 'NGN ' + amount.toLocaleString() + ' by ' + by + '.',
        'info', 'Accounts,Transport Manager,Fleet Operations',
        { module: 'Accounts', eventKey: 'accounts.direct_cost_added', refId: trip.id, refLabel: what });
    } catch (_) { /* the record stands even if the alert fails */ }
    res.json({ ok: true, tripId: trip.id, directCosts: updated.directCosts });
  } catch (e: any) {
    console.error('POST /api/trips/:id/direct-cost failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not record the cost.' });
  }
});
app.get('/api/lubricant/notifications', authenticate, async (_req: any, res) => {
  try {
    const [stocks, pending, disbursals, restocks, pushed, fuelDesk] = await Promise.all([
      Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock)),
      lubricantPending(20),
      prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.lubricantRestock.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
      // The rows above are built from the events themselves, so OUR OWN persisted
      // Lubricant alerts are skipped here — they are what the bell is for, and the
      // page was otherwise showing every restock and disbursal twice.
      prisma.notification.findMany({ where: { AND: [{ category: { not: 'Lubricant' } }, { audience: { contains: 'Lubricant' } }] }, orderBy: { createdAt: 'desc' }, take: 30 }),
      // The desk's OWN queue: a walk-in buyer with a paper slip, or an internal
      // draw (a mechanic washing an engine). These live in FuelRequest, not on a
      // dispatch, so they are listed here rather than in the trip feed below —
      // this page is where the diesel attendant looks.
      // (Order matters: this must stay LAST, or `pushed` and `fuelDesk` swap and
      // the feed silently shows neither.)
      prisma.fuelRequest.findMany({ where: { status: { in: ['Requested', 'Authorized'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const vehicles = await lubricantTripVehicles(pending.map((p) => p.trip));
    const feed: any[] = [];
    for (const s of stocks) {
      if (s.quantity < s.minLevel) {
        feed.push({
          id: 'low-' + s.fuelType, kind: 'low-stock', severity: 'warning',
          title: s.fuelType + ' Inventory is running low',
          body: 'Current Stock: ' + s.quantity.toLocaleString() + ' ' + lubricantUnit(s.fuelType),
          at: s.updatedAt,
        });
      }
    }
    for (const { trip, request } of pending) {
      const v = vehicles[trip.id] || {};
      feed.push({
        id: 'wait-' + trip.id, kind: 'request', severity: 'info', tripId: trip.id,
        title: 'New Dispatch waiting for Lubricant',
        body: (v.driver?.name || trip.driverName || 'Unassigned') + ' • ' + dispatchRef(trip.id) +
          ' • ' + request.quantity.toLocaleString() + ' ' + lubricantUnit(request.fuelType),
        at: trip.assignedAt || trip.updatedAt || trip.createdAt,
      });
    }
    for (const d of disbursals) {
      feed.push({
        id: 'dis-' + d.id, kind: 'disbursal', severity: 'success', tripId: d.tripId,
        title: 'Successful ' + String(d.fuelType).toLowerCase() + ' disbursal',
        body: d.quantity.toLocaleString() + ' ' + lubricantUnit(d.fuelType) + ' • ' + dispatchRef(d.tripId),
        at: d.createdAt,
      });
    }
    for (const f of fuelDesk) {
      const unit = lubricantUnit(f.fuelType);
      feed.push({
        id: 'fuel-' + f.id,
        kind: 'fuel-request',
        severity: f.status === 'Authorized' ? 'info' : 'warning',
        title: 'New ' + f.fuelType + ' request — ' + f.quantity.toLocaleString() + ' ' + unit + ' (' + f.reference + ')',
        body: (f.source === 'Walk-In Sale' ? 'Walk-in buyer' : 'Internal draw') +
          ' • ' + f.requestedBy +
          (f.requestedFor ? ' • ' + f.requestedFor : '') +
          (f.purpose ? ' • ' + f.purpose : '') +
          (f.status === 'Authorized' ? ' • cleared, dispense at the pump' : ' • the desk dispenses it'),
        at: f.createdAt,
      });
    }
    for (const r of restocks) {
      feed.push({
        id: 'res-' + r.id, kind: 'restock', severity: 'success',
        title: String(r.fuelType) + ' restocked',
        body: r.reference + ' • +' + r.quantity.toLocaleString() + ' ' + lubricantUnit(r.fuelType) + ' • ' + r.loggedBy,
        at: r.createdAt,
      });
    }
    for (const n of pushed) {
      feed.push({
        id: 'note-' + n.id, kind: 'note', severity: n.severity, persisted: true,
        title: n.title, body: n.body, at: n.createdAt,
      });
    }
    feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    res.json(feed);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Fuel prices: TM-managed price per litre — source of truth for all modules ----
app.get('/api/fuel-prices', authenticate, async (req: any, res) => {
  try {
    res.json(await prisma.fuelPrice.findMany({ orderBy: { fuelType: 'asc' } }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/fuel-prices', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const t = String(req.body?.fuelType || '').trim();
  const p = Number(req.body?.pricePerLitre);
  if (!['Diesel', 'Gas'].includes(t)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(p) || p <= 0) return res.status(400).json({ error: 'pricePerLitre must be a positive number' });
  try {
    const row = await prisma.fuelPrice.upsert({
      where: { fuelType: t },
      update: { pricePerLitre: p, updatedBy: req.user.name || req.user.email },
      create: { fuelType: t, pricePerLitre: p, updatedBy: req.user.name || req.user.email },
    });
    try {
      await notify('Operations', 'Fuel Price Updated',
        `${t} price is now ₦${p.toLocaleString()} per litre (set by ${req.user.name || 'Transport Manager'}).`,
        'info', 'Transport Manager,Fleet Operations',
        { module: 'Fuel & Lubricant', eventKey: 'fuel.price_updated', refLabel: t });
    } catch (_) {}
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- DIESEL / GAS REQUESTS: the desk's OWN queue ---------------------------
/*
 * Two requests reach the fuel desk that a dispatch never covers:
 *
 *   • a WALK-IN buyer walks into the yard holding a paper slip — "I want 50 L
 *     of diesel" — and the diesel attendant must SEE that request;
 *   • an INTERNAL draw on the tank: a yard mechanic washing an engine — "the
 *     boss wants 50 L of diesel to wash the engine" — which is Petroline
 *     asking Petroline, and still has to reach the man at the pump.
 *
 * Whoever takes the slip raises it (gate, fuel desk, Transport Manager, or the
 * mobile app). Every raise pushes a notification at the Lubricant desk AND
 * lands in this queue, so the attendant's screen is the one place the request
 * shows up. Dispensing is the single moment stock moves, priced from the
 * Transport Manager's own price per litre — no dispatcher types a cost.
 */
const FUEL_REQUEST_SOURCES = ['Walk-In Sale', 'Internal Use'];
const FUEL_REQUEST_DESK_ROLES = [
  'Lubricant', 'Lubricant Manager', 'Lubricant Operations', 'Fuel Manager',
  'Fuel Management', 'Fleet Operations', 'Transport Manager', 'Platform Admin',
];

/** FQ-00012 — the reference the slip, the desk screen and the ledger share. */
function fuelRequestRef(seq: number) {
  return 'FQ-' + String(seq).padStart(5, '0');
}

/** 'Walk-In Sale' for a buyer at the desk; otherwise an internal draw. */
function normaliseFuelSource(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (/walk|customer|buyer|external|sale|yard buy/.test(raw)) return 'Walk-In Sale';
  return 'Internal Use';
}

/** Allocate the next FQ reference without ever handing out the same one twice. */
async function createFuelRequestRow(data: any) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = (await prisma.fuelRequest.count()) + 1 + attempt;
    try {
      return await prisma.fuelRequest.create({ data: { ...data, reference: fuelRequestRef(seq) } });
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;
    }
  }
  throw new Error('Could not allocate a fuel request reference');
}

/** May this caller work the desk's queue (authorize / decline / dispense)? */
function mayWorkFuelDesk(req: any) {
  const held: string[] = Array.isArray(req.user?.roles) ? req.user.roles : [String(req.user?.role || '')];
  return FUEL_REQUEST_DESK_ROLES.some((r) => held.includes(r));
}

const isFuelPartner = (req: any) => String(req.user?.role || '') === 'Customer Portals (External)';

/**
 * Raise a fuel request.
 *
 * The gate takes the paper, the desk takes the phone call, the mechanic walks
 * in — all of them raise it the same way, and the request is immediately the
 * Lubricant desk's work.
 */
app.post('/api/fuel-requests', authenticate, async (req: any, res) => {
  if (isFuelPartner(req)) {
    return res.status(403).json({ error: 'Partner accounts cannot open a tank draw — raise it with the fuel desk.' });
  }
  const asked = String(req.body?.fuelType || 'Diesel');
  const fuelType = LUBRICANT_TYPES.includes(asked) ? asked : 'Diesel';
  const quantity = Number(req.body?.quantity);
  const requestedBy = String(req.body?.requestedBy || req.user?.name || '').trim();
  const source = normaliseFuelSource(req.body?.source);
  const typedFor = String(req.body?.requestedFor || '').trim();
  // File the row under the EXACT spelling the partner's own portal reads. A typed
  // variant ("silver steel", "SilverSteel") would sit outside the partner's queue
  // forever, because that queue matches the company name literally. This is the
  // same canonicalisation dispatch already uses for onBehalfOfPartner.
  const requestedFor = typedFor
    ? await canonicalPartnerCompany(typedFor).catch(() => typedFor)
    : null;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity is what is asked for — it must be a positive number of litres' });
  }
  if (!requestedBy) {
    return res.status(400).json({ error: 'requestedBy is who is asking: the buyer on the slip, the mechanic, or the department' });
  }
  try {
    const row = await createFuelRequestRow({
      fuelType,
      quantity,
      source,
      requestedBy,
      requestedById: req.user?.id || null,
      requestedByEmail: req.user?.email || null,
      requestedFor,
      purpose: String(req.body?.purpose || '').trim() || null,
      buyerPhone: String(req.body?.buyerPhone || '').trim() || null,
      plateNumber: String(req.body?.plateNumber || '').trim() || null,
      note: String(req.body?.note || '').trim() || null,
      status: 'Requested',
      targetType: String(req.body?.targetType || '').trim() || null,
    });
    try {
      const unit = lubricantUnit(row.fuelType);
      const who = source === 'Walk-In Sale'
        ? row.requestedBy + ' is at the desk to buy'
        : row.requestedBy + ' raised an internal draw' + (requestedFor ? ' for ' + requestedFor : '');
      await notify('Lubricant', 'New ' + row.fuelType + ' request — ' + row.quantity.toLocaleString() + ' ' + unit,
        row.reference + ' • ' + who + ': ' + row.quantity.toLocaleString() + ' ' + unit + ' of ' + row.fuelType +
        (row.purpose ? ' • ' + row.purpose : '') + '. The diesel desk dispenses it.',
        'warning', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations,Transport Manager',
        {
          module: 'Fuel & Lubricant',
          eventKey: 'fuel.request_raised',
          refId: row.id,
          refLabel: row.reference,
          actionRoles: ['Lubricant', 'Lubricant Manager', 'Fuel Manager'],
        });
    } catch (_) { /* the request stands even if the alert fails */ }
    res.status(201).json({ ...row, unit: lubricantUnit(row.fuelType) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The queue. ?status=Requested,Authorized · ?source=Walk-In Sale · ?mine=1
 *
 * A partner account only ever reads its OWN company's rows; staff read the
 * desk's queue. Tanks and prices ride along so the screen that dispenses can
 * never show a litre figure without the stock that backs it.
 */
app.get('/api/fuel-requests', authenticate, async (req: any, res) => {
  try {
    const statuses = String(req.query?.status || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const source = String(req.query?.source || '').trim();
    const where: any = {};
    if (statuses.length) where.status = { in: statuses };
    if (source) where.source = normaliseFuelSource(source);
    if (isFuelPartner(req)) {
      const company = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
      where.requestedFor = { equals: company || '\u0000', mode: 'insensitive' };
    } else if (String(req.query?.mine || '') === '1') {
      where.requestedById = String(req.user?.id || '');
    }
    const limit = Math.min(Number(req.query?.limit) || 200, 500);
    const [rows, prices, tanks, all] = await Promise.all([
      prisma.fuelRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      lubricantPrices(),
      Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock)),
      prisma.fuelRequest.findMany({ select: { status: true, source: true } }),
    ]);
    const counts = { requested: 0, authorized: 0, dispensed: 0, declined: 0, walkIn: 0, internal: 0 };
    for (const r of all) {
      if (r.status === 'Requested') counts.requested += 1;
      else if (r.status === 'Authorized') counts.authorized += 1;
      else if (r.status === 'Dispensed') counts.dispensed += 1;
      else if (r.status === 'Declined') counts.declined += 1;
      if (r.source === 'Walk-In Sale') counts.walkIn += 1;
      else counts.internal += 1;
    }
    res.json({
      requests: rows.map((r) => ({
        ...r,
        unit: lubricantUnit(r.fuelType),
        unitPrice: r.unitPrice || prices[r.fuelType] || 0,
        estimatedAmount: r.amount || Math.round((prices[r.fuelType] || 0) * r.quantity * 100) / 100,
      })),
      counts,
      tanks: tanks.map((s) => ({ ...s, unit: lubricantUnit(s.fuelType), low: s.quantity < s.minLevel })),
      prices,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The diesel attendant's screen, in one request: what is waiting, what is
 * cleared and un-dispensed, what was dispensed today (and what is still
 * unpaid), plus the tanks. The mobile app polls exactly this.
 */
app.get('/api/fuel-requests/desk', authenticate, async (req: any, res) => {
  if (isFuelPartner(req) && !mayWorkFuelDesk(req)) {
    return res.status(403).json({ error: 'The fuel desk is a yard screen.' });
  }
  try {
    const [waiting, cleared, dispensed, prices, tanks] = await Promise.all([
      prisma.fuelRequest.findMany({ where: { status: 'Requested' }, orderBy: { createdAt: 'asc' } }),
      prisma.fuelRequest.findMany({ where: { status: 'Authorized' }, orderBy: { createdAt: 'asc' } }),
      prisma.fuelRequest.findMany({ where: { status: 'Dispensed' }, orderBy: { dispensedAt: 'desc' }, take: 50 }),
      lubricantPrices(),
      Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock)),
    ]);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = dispensed.filter((r) => r.dispensedAt && new Date(r.dispensedAt) >= startOfDay);
    const decorate = (r: any) => ({
      ...r,
      unit: lubricantUnit(r.fuelType),
      unitPrice: r.unitPrice || prices[r.fuelType] || 0,
    });
    res.json({
      desk: 'Lubricant',
      waiting: waiting.map(decorate),
      cleared: cleared.map(decorate),
      today: today.map(decorate),
      recent: dispensed.map(decorate),
      counts: {
        waiting: waiting.length,
        cleared: cleared.length,
        dispensedToday: today.length,
        litresToday: today.reduce((s, r) => s + r.quantity, 0),
        salesToday: today.reduce((s, r) => s + r.amount, 0),
        unpaid: dispensed.filter((r) => r.paymentStatus === 'Unpaid').length,
      },
      tanks: tanks.map((s) => ({ ...s, unit: lubricantUnit(s.fuelType), low: s.quantity < s.minLevel })),
      prices,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The desk's decision on a request: Authorize it (cleared to draw), push it
 * back to Requested, or Decline it with the reason on the row.
 */
app.patch('/api/fuel-requests/:id', authenticate, async (req: any, res) => {
  if (!mayWorkFuelDesk(req)) {
    return res.status(403).json({ error: 'Only the fuel desk, Fleet Operations or the Transport Manager decide on a tank draw.' });
  }
  // Status is optional now: the same endpoint also carries the raiser's
  // correction (quantity, fuel, who it is for, purpose, plate, note) so a TM
  // who mistyped the litres can fix the draw instead of deleting it.
  const hasStatus = req.body?.status !== undefined && String(req.body?.status || '').trim() !== '';
  const wanted = String(req.body?.status || '').trim();
  if (hasStatus && !['Requested', 'HOE Approved', 'Authorized', 'Declined'].includes(wanted)) {
    return res.status(400).json({ error: 'status must be Requested, HOE Approved, Authorized or Declined' });
  }
  // The chain runs Requested → HOE Approved → Authorized: the desk's
  // authorisation only lands on what the Head of Engineering validated (or a
  // walk-in sale, which never needs HOE review).
  if (hasStatus && wanted === 'Authorized') {
    const current = await prisma.fuelRequest.findUnique({ where: { id: req.params.id } });
    if (current && current.source === 'Internal Use' && (current as any).targetType && !['HOE Approved', 'Authorized'].includes(current.status)) {
      return res.status(400).json({ error: 'This engineering draw needs HOE review before the Transport Manager authorises it.' });
    }
  }
  try {
    const row = await prisma.fuelRequest.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Fuel request not found' });
    const wantsFields =
      req.body?.quantity !== undefined ||
      req.body?.fuelType !== undefined ||
      req.body?.requestedFor !== undefined ||
      req.body?.purpose !== undefined ||
      req.body?.plateNumber !== undefined ||
      req.body?.note !== undefined;
    // A dispensed draw is history — its litres already left the tank, so the
    // quantity, fuel and decision on it can no longer change. Recording the
    // walk-in payment afterwards is the only write still allowed on it.
    if (row.status === 'Dispensed' && (hasStatus || wantsFields)) {
      return res.status(409).json({
        error: row.reference + ' was already dispensed (' + row.quantity.toLocaleString() +
          ' ' + lubricantUnit(row.fuelType) + ' by ' + (row.dispensedBy || 'the desk') + ') — one draw per request.',
      });
    }
    const by = req.user?.name || req.user?.email || 'Fuel desk';
    const reason = String(req.body?.reason || '').trim();
    const data: any = {};
    if (hasStatus) data.status = wanted;
    if (hasStatus && wanted === 'Authorized') {
      data.authorizedBy = by;
      data.authorizedAt = new Date();
      data.declinedBy = null;
      data.declinedAt = null;
      data.declineReason = null;
    } else if (hasStatus && wanted === 'Declined') {
      data.declinedBy = by;
      data.declinedAt = new Date();
      data.declineReason = reason || null;
    } else if (hasStatus) {
      data.authorizedBy = null;
      data.authorizedAt = null;
    }
    // The raiser correcting his own draw before the pump pours it. A smaller
    // quantity never breaks the tank; a larger one is checked against stock
    // at dispense time, so the correction is always safe to accept here.
    if (req.body?.quantity !== undefined) {
      const litres = Number(req.body.quantity);
      if (!Number.isFinite(litres) || litres <= 0) {
        return res.status(400).json({ error: 'quantity must be a positive number of litres' });
      }
      data.quantity = litres;
    }
    if (req.body?.fuelType !== undefined) {
      const t = String(req.body.fuelType || '').trim();
      if (!['Diesel', 'Gas'].includes(t)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
      data.fuelType = t;
    }
    if (req.body?.requestedFor !== undefined) data.requestedFor = String(req.body.requestedFor || '').trim() || null;
    if (req.body?.purpose !== undefined) data.purpose = String(req.body.purpose || '').trim() || null;
    if (req.body?.plateNumber !== undefined) data.plateNumber = String(req.body.plateNumber || '').trim() || null;
    if (req.body?.note !== undefined) data.note = String(req.body.note || '').trim() || null;
    if (!hasStatus && !wantsFields && !req.body?.paymentStatus && req.body?.paymentRef === undefined) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }
    // Payment can be recorded without dispensing again (the buyer came back).
    const paymentStatus = String(req.body?.paymentStatus || '').trim();
    if (['Paid', 'Unpaid', 'Credit'].includes(paymentStatus)) data.paymentStatus = paymentStatus;
    if (req.body?.paymentRef !== undefined) data.paymentRef = String(req.body.paymentRef || '').trim() || null;
    const updated = await prisma.fuelRequest.update({ where: { id: row.id }, data });
    try {
      const unit = lubricantUnit(row.fuelType);
      const what = row.reference + ' • ' + row.quantity.toLocaleString() + ' ' + unit + ' of ' + row.fuelType;
      if ((data.quantity !== undefined || data.fuelType !== undefined) && (!hasStatus || wanted === 'Requested')) {
        const nowFuel = String(data.fuelType ?? row.fuelType);
        await notify('Lubricant', 'Tank draw corrected — ' + row.reference,
          row.reference + ' was corrected by ' + by + ': now ' + Number(data.quantity ?? row.quantity).toLocaleString() + ' ' + lubricantUnit(nowFuel) + ' of ' + nowFuel + ' for ' + ((data.requestedFor ?? row.requestedFor) || row.requestedBy) + '.',
          'info', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.request_corrected', refId: row.id, refLabel: row.reference });
      } else if (hasStatus && wanted === 'Authorized') {
        await notify('Lubricant', 'Diesel request cleared — dispense ' + row.quantity.toLocaleString() + ' ' + unit,
          what + ' for ' + (row.requestedFor || row.requestedBy) + ' was authorized by ' + by + '. Take it to the pump.',
          'info', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.request_authorized', refId: row.id, refLabel: row.reference, actionRoles: ['Lubricant', 'Lubricant Manager', 'Fuel Manager'] });
      } else if (wanted === 'Declined') {
        await notify('Lubricant', 'Diesel request declined — ' + row.reference,
          what + ' was declined by ' + by + (reason ? ' — ' + reason : '') + '.',
          'warning', 'Lubricant,Lubricant Manager,Fuel Manager,Transport Manager,Fleet Operations',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.request_declined', refId: row.id, refLabel: row.reference });
      }
      if (paymentStatus === 'Paid' && row.status === 'Dispensed') {
        await notify('Lubricant', 'Payment recorded — ' + row.reference,
          what + ' marked paid' + (data.paymentRef ? ' (' + data.paymentRef + ')' : '') + ' by ' + by + '.',
          'success', 'Lubricant,Lubricant Manager,Fleet Operations,Accounts,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.request_paid', refId: row.id, refLabel: row.reference });
      }
    } catch (_) { /* the decision stands even if the alert fails */ }
    res.json({ ...updated, unit: lubricantUnit(updated.fuelType) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Dispense against a request: the ONE write that moves the tank.
 *
 * The price per litre is the Transport Manager's, read here and snapshotted
 * onto the row (a later price change never re-prices what was already sold),
 * and the litres leave the tank in the same call. A walk-in desk often clears
 * and dispenses in one breath, so dispensing a Requested row authorizes it on
 * the way through — stamped, not skipped.
 */
/**
 * The Head of Engineering's verdict on an engineering lubricant draw:
 * validate it toward the Transfer Manager, or decline it with a reason.
 * Walk-in sales skip this desk — only engineering draws (targetType set) pass
 * through HOE review.
 */
app.post('/api/fuel-requests/:id/hoe-review', authenticate, authorize(...HOE_REVIEW_ROLES), async (req: any, res) => {
  const approve = req.body?.approve !== false;
  const reason = String(req.body?.reason || '').trim();
  try {
    const row = await prisma.fuelRequest.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Fuel request not found' });
    if (!isEngineeringReviewer(req.user)) return res.status(403).json({ error: 'Only the Engineering Manager may review requests here.' });
  if (row.status !== 'Requested') return res.status(400).json({ error: 'This request has already been reviewed.' });
    if (!approve && !reason) return res.status(400).json({ error: 'A reason is required to decline the request.' });
    const by = actingUser(req);
    const updated = await prisma.fuelRequest.update({
      where: { id: row.id },
      data: approve
        ? { status: 'HOE Approved', reviewedBy: by, reviewedAt: new Date() }
        : { status: 'Declined', declinedBy: by, declinedAt: new Date(), declineReason: reason },
    });
    await notify('Lubricant', approve ? 'Lubricant draw validated — TM authorisation needed' : 'Lubricant draw declined by HOE', `${row.reference} • ${row.quantity.toLocaleString()} L of ${row.fuelType} for ${(row as any).targetType || 'engineering use'} — ${approve ? 'validated by ' + by + ', awaiting the Transfer Manager.' : 'declined: ' + reason}`, approve ? 'info' : 'warning', 'Transport Manager,Lubricant,Head of Engineering,Engineering Manager,Engineering,Platform Admin', { module: 'Fuel & Lubricant', eventKey: approve ? 'fuel.hoe_approved' : 'fuel.hoe_declined', refId: row.id, refLabel: row.reference, actionRoles: approve ? ['Transport Manager'] : ['Engineering', 'Head of Engineering', 'Engineering Manager'] });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/fuel-requests/:id/dispense', authenticate, async (req: any, res) => {
  if (!mayWorkFuelDesk(req)) {
    return res.status(403).json({ error: 'Only the fuel desk, Fleet Operations or the Transport Manager dispense from the tank.' });
  }
  try {
    const row = await prisma.fuelRequest.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Fuel request not found' });
    if (row.status === 'Declined') {
      return res.status(409).json({ error: row.reference + ' was declined' + (row.declineReason ? ' — ' + row.declineReason : '') + '. Raise a new request instead.' });
    }
    if (row.status === 'Dispensed') {
      return res.status(409).json({
        error: row.reference + ' was already dispensed: ' + row.quantity.toLocaleString() + ' ' +
          lubricantUnit(row.fuelType) + ' by ' + (row.dispensedBy || 'the desk') + '.',
      });
    }
    const quantity = Number(req.body?.quantity ?? row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number of litres' });
    }
    const stock = await ensureLubricantStock(row.fuelType);
    if (quantity > stock.quantity) {
      return res.status(409).json({
        error: 'Only ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(row.fuelType) +
          ' of ' + row.fuelType + ' is in the tank — restock before dispensing ' + quantity.toLocaleString() + '.',
      });
    }
    const prices = await lubricantPrices();
    let unitPrice = prices[row.fuelType] || 0;
    // Only the Transport Manager (who owns the price) may override it.
    const typedPrice = Number(req.body?.unitPrice);
    const ownsPricing = ['Transport Manager', 'Platform Admin'].includes(String(req.user?.role || ''))
      || (Array.isArray(req.user?.roles) && req.user.roles.some((r: string) => ['Transport Manager', 'Platform Admin'].includes(r)));
    if (Number.isFinite(typedPrice) && typedPrice > 0) {
      if (!ownsPricing) {
        return res.status(403).json({ error: 'The price per litre is the Transport Manager\'s — the desk cannot type a cost.' });
      }
      unitPrice = typedPrice;
    }
    if (unitPrice <= 0) {
      return res.status(409).json({ error: 'The Transport Manager has not set the ' + row.fuelType + ' price per litre yet — the amount cannot be computed.' });
    }
    const by = String(req.body?.dispensedBy || '').trim() || req.user?.name || req.user?.email || 'Fuel desk';
    const paymentStatus = ['Paid', 'Unpaid', 'Credit'].includes(String(req.body?.paymentStatus || '').trim())
      ? String(req.body.paymentStatus).trim()
      : row.paymentStatus || 'Unpaid';
    const amount = Math.round(quantity * unitPrice * 100) / 100;
    const now = new Date();
    const updated = await prisma.fuelRequest.update({
      where: { id: row.id },
      data: {
        quantity,
        unitPrice,
        amount,
        status: 'Dispensed',
        dispensedBy: by,
        dispensedAt: now,
        paymentStatus,
        paymentRef: String(req.body?.paymentRef || '').trim() || row.paymentRef || null,
        // A desk that clears and draws in one motion still leaves the stamp.
        authorizedBy: row.authorizedBy || by + ' (at the pump)',
        authorizedAt: row.authorizedAt || now,
        note: String(req.body?.note || '').trim() || row.note || null,
      },
    });
    const after = await prisma.lubricantStock.update({
      where: { fuelType: row.fuelType },
      data: { quantity: { decrement: quantity } },
    });
    try {
      const unit = lubricantUnit(row.fuelType);
      await notify('Lubricant', 'Successful ' + row.fuelType.toLowerCase() + ' disbursal at the desk',
        quantity.toLocaleString() + ' ' + unit + ' of ' + row.fuelType + ' • ' + row.reference +
        ' • ₦' + amount.toLocaleString() + ' • dispensed by ' + by +
        (paymentStatus === 'Paid' ? ' (paid)' : ' (' + paymentStatus.toLowerCase() + ')') + '.',
        'success', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations,Transport Manager,Accounts',
        { module: 'Fuel & Lubricant', eventKey: 'fuel.dispensed', refId: row.id, refLabel: row.reference });
      if (after.quantity < after.minLevel) {
        await notify('Lubricant', row.fuelType + ' Inventory is running low',
          'Current Stock: ' + after.quantity.toLocaleString() + ' ' + unit + ' (minimum ' + after.minLevel.toLocaleString() + ')',
          'warning', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.low_stock', refLabel: row.fuelType, actionRoles: ['Transport Manager'] });
      }
      if (paymentStatus === 'Unpaid') {
        await notify('Lubricant', 'Payment pending — ' + row.reference,
          '₦' + amount.toLocaleString() + ' for ' + quantity.toLocaleString() + ' ' + unit + ' of ' + row.fuelType +
          ' (' + (row.requestedFor || row.requestedBy) + ') is still UNPAID. Collect it at the desk.',
          'warning', 'Lubricant,Lubricant Manager,Fleet Operations,Accounts,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.payment_pending', refId: row.id, refLabel: row.reference, actionRoles: ['Lubricant', 'Lubricant Manager'] });
      }
    } catch (_) { /* the disbursal stands even if an alert fails */ }
    res.status(201).json({ ...updated, unit: lubricantUnit(row.fuelType), stock: after });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ONE feed for the mobile / recipient screen.
 *
 * The recipient's phone should not have to ask five endpoints which work is
 * his: this returns exactly what his ROLE must see — the desk's diesel queue,
 * the dispatch requests still awaiting a decision, the trucks waiting at the
 * pump, and his own raises with their current status. Every section is scoped
 * by role, so the same URL serves the diesel attendant, the Transport Manager,
 * the gate and a partner's own login.
 */
app.get('/api/worklist', authenticate, async (req: any, res) => {
  try {
    const me = String(req.user?.id || '');
    const myRoles: string[] = Array.from(new Set([
      String(req.user?.role || ''),
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
    ].filter(Boolean))) as string[];
    const partner = isFuelPartner(req);
    const company = partner ? await partnerCompanyForUser(req.user.id, req.user.email, req.user.role) : null;
    const desk = mayWorkFuelDesk(req);
    const seesDispatch = !partner;

    const fuelWhere: any = partner
      ? { requestedFor: { equals: company || '\u0000', mode: 'insensitive' }, status: { in: ['Requested', 'Authorized', 'Dispensed'] } }
      : { status: { in: desk ? ['Requested', 'Authorized'] : ['Requested', 'Authorized'] } };

    const [fuel, mine, trips, pending] = await Promise.all([
      prisma.fuelRequest.findMany({ where: fuelWhere, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.fuelRequest.findMany({ where: { requestedById: me }, orderBy: { createdAt: 'desc' }, take: 25 }),
      seesDispatch
        ? prisma.trip.findMany({ where: { status: { in: ['Requested', 'Awaiting Approval'] } }, orderBy: { createdAt: 'desc' }, take: 100 })
        : prisma.trip.findMany({ where: { customer: { equals: company || '\u0000', mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, take: 25 }),
      desk ? lubricantPending(50) : Promise.resolve([] as any[]),
    ]);

    res.json({
      user: { id: me, name: req.user?.name || null, role: req.user?.role || null, roles: myRoles, partnerCompany: company || null },
      fuelRequests: fuel.map((r) => ({
        id: r.id, reference: r.reference, fuelType: r.fuelType, quantity: r.quantity,
        unit: lubricantUnit(r.fuelType), source: r.source, status: r.status,
        requestedBy: r.requestedBy, requestedFor: r.requestedFor, purpose: r.purpose,
        amount: r.amount, paymentStatus: r.paymentStatus, createdAt: r.createdAt,
        needs: r.status === 'Requested' ? 'Clear it at the desk' : 'Dispense at the pump',
      })),
      dispatchRequests: trips.map((t) => ({
        id: t.id, reference: dispatchRef(t.id), status: t.status, customer: t.customer,
        requestedTruckType: t.requestedTruckType, pickup: t.pickup, dropoff: t.dropoff,
        cargo: t.cargo, customerConsignee: t.customerConsignee, createdAt: t.createdAt,
        raisedOnBehalf: (t.directCosts as any)?.raisedOnBehalf || null,
      })),
      pumpQueue: pending.map(({ trip, request, gate }) => ({
        tripId: trip.id, reference: dispatchRef(trip.id), fuelType: request.fuelType,
        quantity: request.quantity, unit: lubricantUnit(request.fuelType), gate,
        truckReg: trip.truckReg, driverName: trip.driverName, dropoff: trip.dropoff,
      })),
      mine: mine.map((r) => ({
        id: r.id, reference: r.reference, status: r.status, fuelType: r.fuelType,
        quantity: r.quantity, unit: lubricantUnit(r.fuelType), source: r.source,
        dispensedBy: r.dispensedBy, dispensedAt: r.dispensedAt, createdAt: r.createdAt,
      })),
      counts: {
        fuelWaiting: fuel.filter((r) => r.status === 'Requested').length,
        fuelCleared: fuel.filter((r) => r.status === 'Authorized').length,
        dispatchWaiting: trips.filter((t) => ['Requested', 'Awaiting Approval'].includes(String(t.status))).length,
        pumpQueue: pending.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- push notifications (server-patch-push-notifications) ---
// Every new notification is pushed to the phones of the people who can see it
// in their own feed (notificationScope + notDismissed — the bell's own rules),
// flagged "Action needed" for the roles that must act on it.
const PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_PRICE_ROLES = ['Transport Manager', 'Platform Admin', 'Accounts', 'Finance'];
const pushHttps: any = require('https');

app.post('/api/push-tokens', authenticate, async (req: any, res: any) => {
  const token = String(req.body?.token || '').trim();
  if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
    return res.status(400).json({ error: 'A valid Expo push token is required.' });
  }
  const platform = String(req.body?.platform || '').slice(0, 16) || null;
  await prisma.$executeRawUnsafe(
    'INSERT INTO "PushToken" ("token", "userId", "platform", "createdAt", "updatedAt") ' +
      "VALUES ($1, $2, $3, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC')) " +
      'ON CONFLICT ("token") DO UPDATE SET "userId" = EXCLUDED."userId", "platform" = EXCLUDED."platform", ' +
      "\"updatedAt\" = (now() AT TIME ZONE 'UTC')",
    token,
    String(req.user.id),
    platform,
  );
  res.json({ ok: true });
});

// No sign-in needed: a phone that signed out with no signal removes its token
// later, and removing a token only stops pushes to that one phone.
app.delete('/api/push-tokens', async (req: any, res: any) => {
  const token = String(req.body?.token || '').trim();
  if (token) await prisma.$executeRawUnsafe('DELETE FROM "PushToken" WHERE "token" = $1', token);
  res.json({ ok: true });
});

function pushPost(payload: any): Promise<any> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const request = pushHttps.request(
      PUSH_SEND_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (response: any) => {
        let text = '';
        response.on('data', (chunk: any) => {
          text += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            resolve(null);
          }
        });
      },
    );
    request.on('error', () => resolve(null));
    request.setTimeout(15000, () => {
      request.destroy();
      resolve(null);
    });
    request.write(body);
    request.end();
  });
}

/** "75 litres • DIS-1 • \u20A6975 • dispensed by Musa" → no amount, for people who do not price fuel. */
function pushWithoutPrices(text: string): string {
  return text
    .replace(/\s*[\u2022\u00B7]\s*\u20A6\s?[\d,.]+/g, '')
    .replace(/\s*\u20A6\s?[\d,.]+/g, '')
    .trim();
}

let pushBusy = false;

async function pushNewNotifications() {
  if (pushBusy) return;
  pushBusy = true;
  try {
    // Claim what nobody has pushed yet — atomic, so two API processes never
    // both send one. Older than 30 minutes is news nobody wants buzzing now.
    const rows: any[] = await prisma.$queryRawUnsafe(
      'UPDATE "Notification" SET "pushedAt" = (now() AT TIME ZONE \'UTC\') WHERE "id" IN (' +
        'SELECT "id" FROM "Notification" WHERE "pushedAt" IS NULL ' +
        'AND "createdAt" > (now() AT TIME ZONE \'UTC\') - INTERVAL \'30 minutes\' ' +
        'ORDER BY "createdAt" ASC LIMIT 100 FOR UPDATE SKIP LOCKED) ' +
        'RETURNING "id", "title", "body", "module", "eventKey", "refId", "actionRoles"',
    );
    if (!rows.length) return;
    const holders: any[] = await prisma.$queryRawUnsafe('SELECT "token", "userId" FROM "PushToken"');
    if (!holders.length) return;
    const tokensOf = new Map<string, string[]>();
    for (const h of holders) {
      const key = String(h.userId);
      tokensOf.set(key, [...(tokensOf.get(key) || []), String(h.token)]);
    }
    const people = (await (prisma as any).user.findMany({ where: { status: 'Active' } })).filter((u: any) =>
      tokensOf.has(String(u.id)),
    );
    const ids = rows.map((r: any) => r.id);
    const messages: any[] = [];
    for (const u of people) {
      const roles: string[] = Array.from(
        new Set([u.role, ...String(u.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean)]),
      );
      // Read exactly as this person would — their own feed's rules.
      const asReader: any = { user: { id: u.id, email: u.email, name: u.name, role: u.role, roles }, query: {}, params: {}, headers: {} };
      let visible: any[] = [];
      try {
        visible = await prisma.notification.findMany({
          where: { AND: [{ id: { in: ids } }, await notificationScope(asReader), notDismissed(asReader)] },
          select: { id: true },
        });
      } catch (e) {
        console.error('[push] could not read the feed of', u.id, e);
        continue;
      }
      const seesPrices = roles.some((r: string) => PUSH_PRICE_ROLES.includes(r));
      for (const v of visible) {
        const row = rows.find((r: any) => String(r.id) === String(v.id));
        if (!row) continue;
        const mustAct = (row.actionRoles || []).some((r: string) => roles.includes(r));
        const text = String(row.body || '');
        for (const to of tokensOf.get(String(u.id)) || []) {
          messages.push({
            to,
            title: mustAct ? 'Action needed: ' + row.title : row.title,
            body: (seesPrices ? text : pushWithoutPrices(text)).slice(0, 300),
            sound: 'default',
            priority: mustAct ? 'high' : 'default',
            channelId: mustAct ? 'action' : 'updates',
            data: {
              notificationId: String(row.id),
              userId: String(u.id),
              module: row.module || null,
              eventKey: row.eventKey || null,
              refId: row.refId || null,
              actionRequired: mustAct,
            },
          });
        }
      }
    }
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const reply = await pushPost(chunk);
      const tickets: any[] = Array.isArray(reply?.data) ? reply.data : [];
      for (let k = 0; k < tickets.length; k += 1) {
        // The app was removed or the token replaced — stop sending to it.
        if (tickets[k]?.details?.error === 'DeviceNotRegistered') {
          await prisma.$executeRawUnsafe('DELETE FROM "PushToken" WHERE "token" = $1', chunk[k].to).catch(() => {});
        }
      }
    }
    if (messages.length) console.log('[push] sent', messages.length, 'for', rows.length, 'notification(s)');
  } catch (e) {
    console.error('[push] run failed', e);
  } finally {
    pushBusy = false;
  }
}

if (!(global as any).__fleetopsxPushTimer) {
  (global as any).__fleetopsxPushTimer = setInterval(() => {
    void pushNewNotifications();
  }, 10000);
}
// --- end push notifications ---

app.get('/api/notifications', authenticate, async (req: any, res) => {
  // Filters: ?module=Engineering · ?action=1 (only what needs a decision) ·
  // ?unread=1. Read state is per user, so the row is returned with THIS
  // caller's own reading state rather than the shared legacy flag.
  const notifModule = String(req.query?.module || '').trim();
  const notifAction = String(req.query?.action || '') === '1';
  const notifUnread = String(req.query?.unread || '') === '1';
  const where: any = { AND: [await notificationScope(req), notDismissed(req)] };
  if (notifModule) where.AND.push({ module: notifModule });
  if (notifAction) {
    // A reader's own queue: rows whose action roles include one of theirs.
    const askedRoles = [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].filter(Boolean);
    where.AND.push({ actionRoles: { hasSome: askedRoles } });
  }
  if (notifUnread) where.AND.push(unreadForUser(req));
  const notifRows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: req.query?.limit ? Math.min(Number(req.query.limit) || 50, 500) : undefined,
  });
  const me = String(req.user?.id || '');
  const myRoles = [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].filter(
    Boolean,
  );
  const readIds = new Set(
    notifRows
      .filter((row: any) => row.read || (row.readBy || []).includes(me))
      .map((row: any) => row.id),
  );
  // "Needs me" is this reader's own work: the row names the roles that must act.
  const mineToAct = (row: any) =>
    (row.actionRoles || []).some((role: string) => myRoles.includes(role));
  // ONE response. A second res.json() here sent the same list twice and threw
  // ERR_HTTP_HEADERS_SENT on every poll — the desk's bell polled this route, so
  // the error log filled with a crash that was never a crash. The richer body
  // (per-reader `read`, `actionRequired`, `actionRoles`) is the survivor.
  res.json(
    notifRows.map((row: any) => ({
      ...row,
      read: readIds.has(row.id),
      actionRequired: mineToAct(row),
      actionRoles: row.actionRoles || [],
      readBy: undefined,
    })),
  );
});

app.post('/api/notifications', authenticate, async (req, res) => {
  // Every row is filed under its module and marked as work or news, so a
  // caller that only knows its title and audience still produces a row the
  // Transport Manager can filter, sort and count.
  const filed = classifyNotification(req.body || {});
  res.json(
    await prisma.notification.create({
      data: {
        ...req.body,
        module: req.body?.module || filed.module,
        actionRequired: req.body?.actionRequired ?? filed.actionRequired,
        actionRoles: Array.isArray(req.body?.actionRoles) ? req.body.actionRoles : [],
        eventKey: req.body?.eventKey ?? null,
        refId: req.body?.refId ?? null,
        refLabel: req.body?.refLabel ?? null,
      },
    }),
  );
});
app.patch('/api/notifications/:id', authenticate, async (req: any, res) => {
  // Reading is recorded against the person who read it. The shared `read`
  // column is left alone so legacy rows keep their original meaning.
  const wantsRead = req.body?.read !== false;
  const row = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  const me = String(req.user?.id || '');
  const readBy = Array.from(new Set([...(row.readBy || []), ...(wantsRead ? [me] : [])]));
  const next = wantsRead ? readBy : readBy.filter((id) => id !== me);
  res.json(await prisma.notification.update({ where: { id: row.id }, data: { readBy: next } }));
});
// A notification is dismissed FOR ONE USER: shared rows (audience null, or a
// whole role) must never vanish from somebody else's center.
function notDismissed(req: any) {
  return { NOT: { dismissedBy: { has: String(req.user?.id || "") } } };
}

async function dismissForUser(req: any, where: any) {
  const rows = await prisma.notification.findMany({
    where: { AND: [where, await notificationScope(req), notDismissed(req)] },
    select: { id: true, dismissedBy: true },
  });
  const me = String(req.user?.id || "");
  for (const row of rows) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { dismissedBy: [...(row.dismissedBy || []), me] },
    });
  }
  return rows.length;
}

app.delete('/api/notifications/:id', authenticate, async (req: any, res) => {
  const removed = await dismissForUser(req, { id: req.params.id });
  if (removed === 0) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true, removed });
});

/** Body: { ids?: string[], read?: boolean } — ids removes those, read clears the read ones. */
app.post('/api/notifications/clear', authenticate, async (req: any, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : null;
  const where = ids ? { id: { in: ids } } : req.body?.read === true ? { read: true } : {};
  const removed = await dismissForUser(req, where);
  res.json({ ok: true, removed });
});

app.post('/api/notifications/mark-all-read', authenticate, async (req: any, res) => {
  // Optionally narrowed to one module — "I have read what Engineering sent".
  const markModule = String(req.body?.module || '').trim();
  const where: any = { AND: [await notificationScope(req), notDismissed(req)] };
  if (markModule) where.AND.push({ module: markModule });
  const rows = await prisma.notification.findMany({ where, select: { id: true, readBy: true } });
  const me = String(req.user?.id || '');
  const pending = rows.filter((row: any) => !(row.readBy || []).includes(me));
  for (const row of pending) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { readBy: [...(row.readBy || []), me] },
    });
  }
  res.json({ ok: true, marked: pending.length });
});

// --- MESSAGES / CONVERSATIONS (enterprise chat) ---
// The contextual communication layer: one thread per dispatch (created lazily
// and idempotently), PLUS direct messages and department groups between staff.
// Per-user read receipts, message reactions, recall/edit, presence and typing
// signals live here too, so every department's Messages nav points at the same
// truth.
const CHAT_THREAD_STATUSES = [
  'Scheduled',
  'Loaded',
  'En Route',
  'Offloading',
  'Returning',
  'Delayed',
  'Completed',
];

/** The company a partner user belongs to — the key that scopes what they may read. */
async function partnerCompanyOf(req: any): Promise<string> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { partnerCompanyName: true, email: true, role: true },
    });
    return (
      u?.partnerCompanyName?.trim() ||
      partnerCompanyFromEmailFallback(u?.email || '', u?.role || '') ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

function isPartnerRequest(req: any): boolean {
  return req.user?.role === 'Customer Portals (External)';
}

/**
 * LANGUAGE POLICY — enterprise chat is on the record with partners watching.
 * Profanity, abuse and "go to hell" style attacks are refused at the door and
 * anything that slipped through an older client is purged.
 */
const BANNED_LANGUAGE =
  /\b(fuck|fucking|motherfuck|shit|bitch|bastard|asshole|arsehole|dickhead|cunt|nigga|nigger|retard|go\s*to\s*hell|hell\s+bro|fuck\s+you)\b/i;
function messageRejectedByPolicy(body: string): string | null {
  return BANNED_LANGUAGE.test(body)
    ? 'Blocked by the language policy — this thread is on the record. Keep it professional.'
    : null;
}

/** First name from a full name or email — used in notification copy. */
function firstName(name: string): string {
  const n = String(name || '').trim();
  if (!n) return 'A colleague';
  if (n.includes('@')) return n.split('@')[0] || 'A colleague';
  return n.split(/\s+/)[0] || n;
}
/**
 * EMPTY THREADS are noise, not future: a conversation does not exist until
 * somebody writes in it. Trip threads, DMs and groups alike stay out of the
 * sidebar while they have zero messages — the moment a first message lands
 * (and only then) the thread becomes a chat. Nothing is ever deleted.
 */
function isEmptyThread(c: any): boolean {
  const raw = Array.isArray(c?.messages) ? c.messages : [];
  return raw.length === 0;
}

/**
 * Every dispatched trip gets exactly one thread, created the first time anyone
 * opens Messages. Idempotent: a trip already carrying a conversation is skipped,
 * so history and existing messages are never touched.
 */
async function ensureDispatchThreads() {
  const trips = await prisma.trip.findMany({
    where: { status: { in: CHAT_THREAD_STATUSES } },
    select: {
      id: true,
      customer: true,
      truckReg: true,
      driverName: true,
      dropoff: true,
    },
  });
  if (!trips.length) return;
  const existing = await prisma.conversation.findMany({
    where: { tripId: { in: trips.map((t: any) => t.id) } },
    select: { tripId: true },
  });
  const have = new Set(existing.map((e: any) => e.tripId));
  for (const t of trips) {
    if (have.has(t.id)) continue;
    await prisma.conversation.create({
      data: {
        kind: 'trip',
        name: (t.customer || 'Petroline') + ' · ' + t.dropoff,
        subtitle: [t.truckReg, t.driverName]
          .filter((v: any) => v && String(v).trim() && v !== 'Unassigned')
          .join(' · '),
        tripId: t.id,
        participants: ['Transport Manager', 'Fleet Operations', 'Tracking', 'Security', 'Partner'],
        memberIds: [],
        messages: [],
        unread: 0,
        lastAt: '',
      },
    });
  }
}

/** How far THIS user has read in each conversation (0 = never opened). */
async function readMapFor(userId: string, conversationIds: string[]) {
  const map = new Map<string, number>();
  if (!conversationIds.length) return map;
  const rows = await prisma.conversationRead.findMany({
    where: { userId, conversationId: { in: conversationIds } },
  });
  for (const r of rows) map.set(r.conversationId, new Date(r.lastReadAt as any).getTime());
  return map;
}

function messageTime(m: any): number {
  const raw = m?.at || m?.time;
  const t = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** May this viewer READ this conversation? */
async function canAccessConversation(req: any, convo: any): Promise<boolean> {
  if (!isPartnerRequest(req)) {
    // Staff may always read trip threads and their own DMs/groups.
    return true;
  }
  if (!convo?.tripId) return false;
  const trip = await prisma.trip.findUnique({
    where: { id: convo.tripId },
    select: { customer: true },
  });
  if (!trip) return false;
  return samePartnerCompany(trip.customer, await partnerCompanyOf(req));
}

/** Self-visible chat participants of the STAFF directory (partners excluded). */
async function chatDirectory() {
  const rows = await prisma.user.findMany({
    where: { status: 'Active', role: { not: 'Customer Portals (External)' } },
    select: { id: true, name: true, email: true, role: true, roles: true, phone: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((u: any) => {
    const extra = String(u.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    const roles = Array.from(new Set([u.role, ...extra])).filter(Boolean);
    const initials = String(u.name || '?').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
    return { id: u.id, name: u.name, email: u.email, role: u.role, roles, phone: u.phone || '', initials };
  });
}

/** Staff user IDs allowed into a DM/group thread (the caller plus the picked members). */
async function chatMemberIds(memberIds: any[]): Promise<string[]> {
  const wanted = (Array.isArray(memberIds) ? memberIds : []).map((v: any) => String(v)).filter(Boolean);
  if (!wanted.length) return [];
  const rows = await prisma.user.findMany({
    where: { id: { in: wanted }, role: { not: 'Customer Portals (External)' } },
    select: { id: true },
  });
  return rows.map((r: any) => r.id);
}

/**
 * One conversation, as THIS reader should see it: self-flagged bubbles, unread
 * derived from their own read position, reactions and recall/edit carried on
 * each message.
 */
function serializeConversation(c: any, viewerId: string, readAt: number) {
  const raw = Array.isArray(c.messages)
    ? c.messages
    : [];
  let unread = 0;
  const messages = raw.map((m: any) => {
    const at = m.at || m.time || '';
    const mine = Boolean(m.authorId) && m.authorId === viewerId;
    if (!mine && messageTime(m) > readAt) unread += 1;
    return {
      id: m.id,
      author: m.author || 'Unknown',
      authorId: m.authorId || null,
      role: m.role || 'Ops',
      // Live policy sweep: anything abusive that predates the filter is
      // silenced here too — the record keeps its shape, the words are gone.
      body: m.recalled ? '' : messageRejectedByPolicy(String(m.body || '')) ? '' : String(m.body || ''),
      at,
      time: at,
      self: mine,
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      editedAt: m.editedAt || null,
      recalled: Boolean(m.recalled),
    };
  });
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    subtitle: c.subtitle,
    tripId: c.tripId || null,
    participants: Array.isArray(c.participants) ? c.participants : [],
    memberIds: Array.isArray(c.memberIds) ? c.memberIds : [],
    lastAt: c.lastAt || (messages.length ? messages[messages.length - 1].at : ''),
    unread,
    messages,
  };
}

/** Shared helper: the sender of a message becomes its first reader. */
async function markSelfRead(userId: string, conversationId: string, at: Date) {
  await prisma.conversationRead.upsert({
    where: { userId_conversationId: { userId, conversationId } },
    update: { lastReadAt: at },
    create: { userId, conversationId, lastReadAt: at },
  });
}

app.get('/api/conversations', authenticate, async (req: any, res) => {
  try {
    await ensureDispatchThreads();
    const all = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
    // A chat exists from its first message on — empty threads are invisible
    // to every reader (they reappear the instant somebody writes in them).
    const audible = all.filter((c: any) => !isEmptyThread(c));
    let visible = audible;
    if (isPartnerRequest(req)) {
      const company = await partnerCompanyOf(req);
      const companyKey = company.toLowerCase();
      const uid = String(req.user.id);
      const tripIds = audible.filter((c: any) => c.tripId).map((c: any) => c.tripId);
      const trips = tripIds.length
        ? await prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, customer: true },
          })
        : [];
      const mine = new Set(
        trips.filter((t: any) => samePartnerCompany(t.customer, company)).map((t: any) => t.id),
      );
      // Partners see: their company's dispatch threads, plus the partner chat
      // staff opened with THEIR company (member of it, message present).
      visible = audible.filter(
        (c: any) =>
          (c.tripId && mine.has(c.tripId)) ||
          (c.kind === 'partner' &&
            Array.isArray(c.memberIds) &&
            c.memberIds.map(String).includes(uid)),
      );
      void companyKey;
    } else {
      // Staff see trip threads (minus dead empty closed ones), plus the DMs
      // and groups they belong to.
      const uid = String(req.user.id);
      visible = audible.filter(
        (c: any) =>
          c.tripId ||
          (Array.isArray(c.memberIds) && c.memberIds.map(String).includes(uid)),
      );
    }
    const read = await readMapFor(req.user.id, visible.map((c: any) => c.id));
    res.json(visible.map((c: any) => serializeConversation(c, req.user.id, read.get(c.id) || 0)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Sidebar badge: how many messages are waiting for THIS user. */
app.get('/api/conversations/unread', authenticate, async (req: any, res) => {
  try {
    await ensureDispatchThreads();
    const all = await prisma.conversation.findMany();
    const audible = all.filter((c: any) => !isEmptyThread(c));
    let visible = audible;
    if (isPartnerRequest(req)) {
      const company = await partnerCompanyOf(req);
      const uid = String(req.user.id);
      const tripIds = audible.filter((c: any) => c.tripId).map((c: any) => c.tripId);
      const trips = tripIds.length
        ? await prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, customer: true },
          })
        : [];
      const mine = new Set(
        trips.filter((t: any) => samePartnerCompany(t.customer, company)).map((t: any) => t.id),
      );
      // Same rule as the list: own dispatch threads plus their company's chat.
      visible = audible.filter(
        (c: any) =>
          (c.tripId && mine.has(c.tripId)) ||
          (c.kind === 'partner' &&
            Array.isArray(c.memberIds) &&
            c.memberIds.map(String).includes(uid)),
      );
    } else {
      const uid = String(req.user.id);
      visible = audible.filter(
        (c: any) =>
          c.tripId ||
          (Array.isArray(c.memberIds) && c.memberIds.map(String).includes(uid)),
      );
    }      const read = await readMapFor(req.user.id, visible.map((c: any) => c.id));
      let count = 0;
    for (const c of visible) {
      const raw = Array.isArray(c.messages) ? c.messages : [];
      const readAt = read.get(c.id) || 0;
      for (const m of raw) {
        if (m.authorId === req.user.id) continue;
        if (m.recalled) continue;
        if (messageTime(m) > readAt) count += 1;
      }
    }
    res.json({ count });
  } catch {
    res.json({ count: 0 });
  }
});

/**
 * START A NEW CONVERSATION — direct message or department group.
 *
 * The Transport Manager picks colleagues from the staff directory; a DM to one
 * person reuses the thread that already exists between the two (never a second
 * inbox for the same pair). Groups carry every picked member. Only staff can
 * create these; partners stay on their dispatch threads.
 */
app.post('/api/conversations', authenticate, async (req: any, res) => {
  try {
    if (isPartnerRequest(req)) {
      return res.status(403).json({ error: 'Partners chat on their dispatch threads only' });
    }
    const kind = ['direct', 'group', 'partner'].includes(String(req.body?.kind))
      ? String(req.body.kind)
      : 'direct';
    // PARTNER CHAT — pick a partner company; a thread opens with every staff
    // contact behind that partner's portal as members (the partner accounts
    // see it on their own sidebar once the first message lands).
    if (kind === 'partner') {
      const companyKey = String(req.body?.partnerName || req.body?.partnerId || '').trim().toLowerCase();
      if (!companyKey) return res.status(400).json({ error: 'Name the partner company' });
      const partnerUsers = await prisma.user.findMany({
        where: { status: 'Active', role: 'Customer Portals (External)' },
        select: { id: true, partnerCompanyName: true, email: true, role: true },
      });
      const memberIds = partnerUsers
        .filter((u) => {
          const company = String(u.partnerCompanyName || partnerCompanyFromEmailFallback(u.email, u.role) || '').trim().toLowerCase();
          return company === companyKey;
        })
        .map((u) => u.id);
      if (!memberIds.length) {
        return res.status(400).json({ error: 'That partner has no active portal account to chat with yet' });
      }
      // Reuse the existing partner-company thread (one thread per partner).
      const allPartnerThreads = await prisma.conversation.findMany({ where: { kind: 'partner', tripId: null } });
      for (const c of allPartnerThreads) {
        const ids = Array.isArray(c.memberIds) ? c.memberIds.map(String) : [];
        if (memberIds.every((m) => ids.includes(m))) {
          const read = await readMapFor(req.user.id, [c.id]);
          return res.json(serializeConversation(c, req.user.id, read.get(c.id) || 0));
        }
      }
      const companyDisplay = String(req.body?.partnerName || req.body?.partnerId || '').trim();
      const created = await prisma.conversation.create({
        data: {
          kind: 'partner',
          name: companyDisplay,
          subtitle: 'Partner chat',
          tripId: null,
          participants: ['Partner', req.user?.role || 'Ops'],
          memberIds: Array.from(new Set([String(req.user.id), ...memberIds])),
          messages: [],
          unread: 0,
          lastAt: '',
        },
      });
      return res.json(serializeConversation(created, req.user.id, 0));
    }
    // DISPATCH CHAT — open the dispatch thread directly (it already exists);
    // reusing means there is never a second thread for one dispatch.
    if (String(req.body?.tripId || '').trim()) {
      const tripId = String(req.body.tripId).trim();
      const existingConvo = await prisma.conversation.findFirst({ where: { tripId } });
      if (existingConvo) {
        const read = await readMapFor(req.user.id, [existingConvo.id]);
        return res.json(serializeConversation(existingConvo, req.user.id, read.get(existingConvo.id) || 0));
      }
      return res.status(404).json({ error: 'That dispatch has no chat thread yet' });
    }
    const members = await chatMemberIds(req.body?.memberIds);
    const me = String(req.user.id);
    const allMembers = Array.from(new Set([me, ...members]));

    if (kind === 'direct') {
      const other = allMembers.filter((id) => id !== me);
      if (other.length !== 1) {
        return res.status(400).json({ error: 'A direct message needs exactly one colleague' });
      }
      // Reuse the DM thread that already exists between this exact pair.
      const existing = await prisma.conversation.findFirst({
        where: { kind: 'direct', tripId: null },
      });
      for (const c of (await prisma.conversation.findMany({ where: { kind: 'direct', tripId: null } }))) {
        const ids = Array.isArray(c.memberIds) ? c.memberIds.map(String) : [];
        if (ids.length === 2 && ids.includes(me) && ids.includes(other[0]!)) {
          const read = await readMapFor(me, [c.id]);
          return res.json(serializeConversation(c, me, read.get(c.id) || 0));
        }
      }
    }

    const name = String(req.body?.name || '').trim();
    if (kind === 'group' && !name) {
      return res.status(400).json({ error: 'A group needs a name' });
    }

    const convo = await prisma.conversation.create({
      data: {
        kind,
        name: name || 'Direct message',
        subtitle: kind === 'group' ? `${allMembers.length} members` : '',
        tripId: null,
        participants: [req.user?.role || 'Ops'],
        memberIds: allMembers,
        messages: [],
        unread: 0,
        lastAt: '',
      },
    });
    res.json(serializeConversation(convo, me, 0));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * SEND — into any thread the caller may write to. Trip threads are open to all
 * staff (that is the dispatch's room); DMs and groups only to their members.
 */
app.post('/api/conversations/:id/messages', authenticate, async (req: any, res) => {
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (!(await canAccessConversation(req, convo))) {
      return res.status(403).json({ error: 'This conversation belongs to another company' });
    }
    const isStaff = !isPartnerRequest(req);
    if (isStaff && !convo.tripId) {
      const uid = String(req.user.id);
      const memberIds: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
      if (!memberIds.includes(uid)) {
        return res.status(403).json({ error: 'You are not part of this conversation' });
      }
    }
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message body is required' });
    // Language policy: refuse abuse before it can ever reach the thread.
    const rejected = messageRejectedByPolicy(body);
    if (rejected) return res.status(400).json({ error: rejected });
    const messages = Array.isArray(convo.messages) ? [...(convo.messages as any[])] : [];
    const at = new Date().toISOString();
    messages.push({
      id: 'm' + (messages.length + 1) + '-' + Date.now().toString(36),
      author: req.user?.name || req.user?.email || 'Unknown',
      authorId: req.user?.id || null,
      role: isPartnerRequest(req) ? 'Partner' : req.user?.role || 'Ops',
      body,
      at,
      reactions: [],
    });
    const updated = await prisma.conversation.update({
      where: { id: convo.id },
      data: { messages, lastAt: at },
    });
    // The sender has by definition read their own thread up to this message.
    await markSelfRead(req.user.id, convo.id, new Date(at));
    // NOTIFY — everyone else in the thread learns work came in. Trip threads
    // reach staff through the role audience (that is how every dispatch alert
    // already travels); DMs and groups file a member-targeted row:
    // `dismissedBy` carries user ids, so the feed is scoped per person.
    // Best-effort: the message has already delivered either way.
    void (async () => {
      try {
        if (convo.tripId) {
          await notify(
            'Messages',
            'New Message in Dispatch Thread',
            `${req.user?.name || 'A colleague'} wrote in ${convo.name || 'the dispatch thread'}: "${body.slice(0, 90)}"`,
            'info',
            'Transport Manager,Fleet Operations,Tracking,Security,Lubricant,Engineering,Parts & Store,Accounts,HR,Driver,Fleet Field Ops,Head of Engineering',
            { module: 'Fleet Operations', eventKey: `chat.msg.${convo.id}`, refId: convo.tripId, refLabel: convo.name },
          );
        } else {
          const memberIds: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
          const others = memberIds.filter((id: string) => id !== String(req.user.id));
          if (!others.length) return;
          // `audience` accepts real user ids too (the reader filter matches
          // against the whole comma list), so each member gets one row and
          // nobody outside the thread does.
          const sender = firstName(String(req.user?.name || req.user?.email || 'A colleague'));
          await notify(
            'Messages',
            convo.kind === 'group' ? `${sender} in ${convo.name}` : `New message from ${sender}`,
            body.slice(0, 90),
            'info',
            others.join(','),
            { module: 'Fleet Operations', eventKey: `chat.msg.${convo.id}`, refId: convo.id, refLabel: convo.name },
          );
        }
      } catch {
        /* notification is best-effort; the message itself already delivered */
      }
    })();
    res.json(serializeConversation(updated, req.user.id, new Date(at).getTime()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * EDIT or RECALL a message — the author's own words, their own correction.
 * A recalled message keeps its slot in the thread (so replies still make sense)
 * but its body is replaced by a recall marker and stops counting as unread.
 */
app.patch('/api/conversations/:id/messages/:messageId', authenticate, async (req: any, res) => {
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (!(await canAccessConversation(req, convo))) {
      return res.status(403).json({ error: 'This conversation belongs to another company' });
    }
    const messages = Array.isArray(convo.messages) ? [...(convo.messages as any[])] : [];
    const idx = messages.findIndex((m: any) => m.id === req.params.messageId);
    if (idx === -1) return res.status(404).json({ error: 'Message not found' });
    const m = messages[idx]!;
    if (String(m.authorId || '') !== String(req.user.id)) {
      return res.status(403).json({ error: 'You can only change your own messages' });
    }
    if (req.body?.recall) {
      m.recalled = true;
      m.body = '';
      delete m.editedAt;
    } else {
      const next = String(req.body?.body || '').trim();
      if (!next) return res.status(400).json({ error: 'Message body is required' });
      m.body = next;
      m.editedAt = new Date().toISOString();
    }
    messages[idx] = m;
    const updated = await prisma.conversation.update({
      where: { id: convo.id },
      data: { messages },
    });
    res.json(serializeConversation(updated, req.user.id, Date.now()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * REACT to a message — one emoji per person, toggled by re-sending it. Any
 * reader of the thread may react; the reaction is stamped with their name so
 * the bubble can say who felt what.
 */
app.post('/api/conversations/:id/messages/:messageId/reactions', authenticate, async (req: any, res) => {
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (!(await canAccessConversation(req, convo))) {
      return res.status(403).json({ error: 'This conversation belongs to another company' });
    }
    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });
    const messages = Array.isArray(convo.messages) ? [...(convo.messages as any[])] : [];
    const idx = messages.findIndex((m: any) => m.id === req.params.messageId);
    if (idx === -1) return res.status(404).json({ error: 'Message not found' });
    if (messages[idx]!.recalled) return res.status(400).json({ error: 'Message was recalled' });
    const m = messages[idx]!;
    const reactions: any[] = Array.isArray(m.reactions) ? [...m.reactions] : [];
    const me = String(req.user.id);
    const existingIdx = reactions.findIndex(
      (r: any) => String(r.userId) === me && r.emoji === emoji,
    );
    if (existingIdx !== -1) {
      reactions.splice(existingIdx, 1); // toggle off
    } else {
      // One emoji per person: replace any other reaction they had on this message.
      const mineIdx = reactions.findIndex((r: any) => String(r.userId) === me);
      if (mineIdx !== -1) reactions.splice(mineIdx, 1);
      reactions.push({ emoji, userId: me, name: req.user?.name || 'Unknown' });
    }
    m.reactions = reactions;
    messages[idx] = m;
    const updated = await prisma.conversation.update({
      where: { id: convo.id },
      data: { messages },
    });
    res.json(serializeConversation(updated, req.user.id, Date.now()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Mark read up to now (opening the thread). */
app.patch('/api/conversations/:id', authenticate, async (req: any, res) => {
  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (!(await canAccessConversation(req, convo))) {
    return res.status(403).json({ error: 'This conversation belongs to another company' });
  }
  const raw = Array.isArray(convo.messages) ? (convo.messages as any[]) : [];
  const latest = raw.reduce((max: number, m: any) => Math.max(max, messageTime(m)), 0);
  const readAt = latest ? new Date(latest) : new Date();
  await prisma.conversationRead.upsert({
    where: { userId_conversationId: { userId: req.user.id, conversationId: convo.id } },
    update: { lastReadAt: readAt },
    create: { userId: req.user.id, conversationId: convo.id, lastReadAt: readAt },
  });
  res.json({ ok: true });
});

/**
 * GROUP MEMBERSHIP — view, add and remove the people in a DM/group thread.
 * Only existing members may change the roster. Removing someone never deletes
 * history: their past messages stay, they just stop receiving new ones (and
 * the thread leaves their list).
 */
app.get('/api/conversations/:id/members', authenticate, async (req: any, res) => {
  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (!(await canAccessConversation(req, convo))) {
    return res.status(403).json({ error: 'This conversation belongs to another company' });
  }
  const ids: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
  const rows = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, role: true, roles: true, lastSeen: true },
      })
    : [];
  res.json(rows.map((u: any) => {
    const extra = String(u.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      initials: String(u.name || '?').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(),
      online: u.lastSeen ? Date.now() - new Date(u.lastSeen as any).getTime() < 90_000 : false,
    };
  }));
});

app.post('/api/conversations/:id/members', authenticate, async (req: any, res) => {
  try {
    if (isPartnerRequest(req)) return res.status(403).json({ error: 'Partners do not manage group rosters' });
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (convo.tripId) return res.status(400).json({ error: 'A dispatch thread carries its own participants' });
    const ids: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
    if (!ids.includes(String(req.user.id))) {
      return res.status(403).json({ error: 'Only members of this conversation can add people' });
    }
    const additions = await chatMemberIds(Array.isArray(req.body?.memberIds) ? req.body.memberIds : [req.body?.memberId].filter(Boolean));
    if (!additions.length) return res.status(400).json({ error: 'Name the colleagues to add' });
    const next = Array.from(new Set([...ids, ...additions]));
    const updated = await prisma.conversation.update({
      where: { id: convo.id },
      data: { memberIds: next, subtitle: `${next.length} members` },
    });
    const read = await readMapFor(req.user.id, [convo.id]);
    res.json(serializeConversation(updated, req.user.id, read.get(convo.id) || 0));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/conversations/:id/members/:memberId', authenticate, async (req: any, res) => {
  try {
    if (isPartnerRequest(req)) return res.status(403).json({ error: 'Partners do not manage group rosters' });
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (convo.tripId) return res.status(400).json({ error: 'A dispatch thread carries its own participants' });
    const ids: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
    if (!ids.includes(String(req.user.id))) {
      return res.status(403).json({ error: 'Only members of this conversation can remove people' });
    }
    if (req.params.memberId === String(req.user.id)) {
      return res.status(400).json({ error: 'Leaving a group is not available yet — ask another member to remove you' });
    }
    const next = ids.filter((id: string) => id !== req.params.memberId);
    if (next.length === ids.length) return res.status(404).json({ error: 'That person is not in this group' });
    if (convo.kind === 'direct' && next.length < 2) {
      return res.status(400).json({ error: 'A direct message keeps its two people' });
    }
    const updated = await prisma.conversation.update({
      where: { id: convo.id },
      data: { memberIds: next, subtitle: convo.kind === 'group' ? `${next.length} members` : convo.subtitle },
    });
    const read = await readMapFor(req.user.id, [convo.id]);
    res.json(serializeConversation(updated, req.user.id, read.get(convo.id) || 0));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * READ RECEIPTS — who has SEEN this thread up to when. Returns one entry per
 * member with the time they last read through; the client stamps the check
 * marks under my messages accordingly (seen when the LAST other member's
 * read position passes the message's time).
 */
app.get('/api/conversations/:id/receipts', authenticate, async (req: any, res) => {
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!convo) return res.status(404).json({ error: 'Not found' });
    if (!(await canAccessConversation(req, convo))) {
      return res.status(403).json({ error: 'This conversation belongs to another company' });
    }
    const ids: string[] = Array.isArray(convo.memberIds) ? convo.memberIds.map(String) : [];
    const participants: string[] = convo.tripId || !ids.length
      ? [] // trip threads keep the read positions private to the sender
      : ids;
    if (!participants.length) return res.json([]);
    const rows = await prisma.conversationRead.findMany({
      where: { conversationId: convo.id, userId: { in: participants } },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: participants } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u: any) => [u.id, u.name]));
    const seen = new Map(rows.map((r: any) => [r.userId, new Date(r.lastReadAt as any).toISOString()]));
    res.json(participants
      .filter((id) => id !== String(req.user.id))
      .map((id) => ({
        userId: id,
        name: names.get(id) || 'Member',
        lastReadAt: seen.get(id) || null,
      })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PRESENCE — a lightweight heartbeat from every signed-in desk. Stays last-seen
 * in the User row (no new table), so the directory can show who is online now
 * versus hours ago, without any extra infrastructure.
 */
app.post('/api/chat/presence', authenticate, async (req: any, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { lastSeen: new Date() },
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

/**
 * CHAT TARGETS — what the New Chat picker offers, in one read:
 *   colleagues  — staff directory (departments for the grouped menu)
 *   partners    — partner companies and the staff users behind their portals
 *   dispatches  — open (not finished) dispatches, so a chat can be started
 *                 straight onto the dispatch someone is calling about
 * Starters POST /api/conversations with the same shapes as before — a partner
 * target reseolves to everyone in that company's portal as members.
 */
app.get('/api/chat/targets', authenticate, async (req: any, res) => {
  try {
    const [everyone, companies, trips] = await Promise.all([
      chatDirectory(),
      partnerCompanies(),
      prisma.trip.findMany({
        where: { status: { notIn: ['Completed', 'Stopped', 'Requested', 'Draft', 'Approved', 'Awaiting Approval'] } },
        select: { id: true, customer: true, dropoff: true, truckReg: true, driverName: true },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      }),
    ]);
    const now = Date.now();
    const seen = await prisma.user.findMany({
      where: { id: { in: everyone.map((u: any) => u.id) } },
      select: { id: true, lastSeen: true, typingIn: true, typingAt: true, partnerCompanyName: true },
    });
    const meta = new Map(seen.map((s: any) => [s.id, s]));
    const ONLINE_MS = 90_000;
    const live = everyone.map((u: any) => {
      const m = meta.get(u.id);
      const last = m?.lastSeen ? new Date(m.lastSeen as any).getTime() : 0;
      const typingAt = m?.typingAt ? new Date(m.typingAt as any).getTime() : 0;
      return {
        ...u,
        online: now - last < ONLINE_MS,
        lastSeenAt: m?.lastSeen ? new Date(m.lastSeen as any).toISOString() : null,
        typingIn: now - typingAt < 8_000 ? String(m?.typingIn || '') : '',
        partnerCompanyName: m?.partnerCompanyName || null,
      };
    });
    // Partner portals as companies (grouped), with their member ids.
    const partnerUsers = live.filter((u: any) => u.roles.includes('Customer Portals (External)'));
    void partnerUsers;
    const byCompany = new Map<string, { id: string; name: string; memberIds: string[] }>();
    const partnerUserRows = await prisma.user.findMany({
      where: { status: 'Active', role: 'Customer Portals (External)' },
      select: { id: true, name: true, partnerCompanyName: true, email: true, role: true },
    });
    for (const u of partnerUserRows) {
      const company = String(u.partnerCompanyName || partnerCompanyFromEmailFallback(u.email, u.role) || '').trim();
      if (!company) continue;
      const key = company.toLowerCase();
      const row = byCompany.get(key) || { id: key, name: company, memberIds: [] };
      row.memberIds.push(u.id);
      byCompany.set(key, row);
    }
    // Fill in the known companies (from dispatch history) even when no portal account is live yet.
    for (const c of companies) {
      const key = c.company.toLowerCase();
      if (!byCompany.has(key)) byCompany.set(key, { id: key, name: c.company, memberIds: [] });
    }
    res.json({
      colleagues: live.filter((u: any) => !u.roles.includes('Customer Portals (External)')),
      partners: Array.from(byCompany.values()).sort((a, b) => a.name.localeCompare(b.name)),
      dispatches: trips.map((t: any) => ({
        id: t.id,
        tripId: t.id,
        label: `${t.customer || 'Petroline'} · ${t.dropoff || ''}`.trim(),
        truck: t.truckReg || '',
        driver: t.driverName || '',
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * TYPING — a short-lived signal, also carried on the User row. It is read with
 * presence, and its timestamp is the only truth: anything older than a few
 * seconds is simply nobody typing anymore.
 */
app.post('/api/chat/typing', authenticate, async (req: any, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        lastSeen: new Date(),
        typingIn: String(req.body?.conversationId || ''),
        typingAt: new Date(),
      },
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/api/chat/directory', authenticate, async (req: any, res) => {
  try {
    const everyone = await chatDirectory();
    const now = Date.now();
    const seen = await prisma.user.findMany({
      where: { id: { in: everyone.map((u: any) => u.id) } },
      select: { id: true, lastSeen: true, typingIn: true, typingAt: true },
    });
    const meta = new Map(seen.map((s: any) => [s.id, s]));
    res.json(
      everyone.map((u: any) => {
        const m = meta.get(u.id);
        const last = m?.lastSeen ? new Date(m.lastSeen as any).getTime() : 0;
        const typingAt = m?.typingAt ? new Date(m.typingAt as any).getTime() : 0;
        const ONLINE_MS = 90_000; // heartbeat every 45s ⇒ online within 90
        return {
          ...u,
          online: now - last < ONLINE_MS,
          lastSeenAt: m?.lastSeen ? new Date(m.lastSeen as any).toISOString() : null,
          typingIn: now - typingAt < 8_000 ? String(m?.typingIn || '') : '',
        };
      }),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- AUDIT / LOGIN REPORTS ---
/*
 * AUDIT:READ — the audit trail, queried properly.
 *
 * The old endpoint returned the whole table every poll: unfiltered,
 * unpaginated, growing forever. This one does the server-side work the admin
 * page needs — module/user/kind filters, a search across action+record,
 * a date range, paging — and returns the FACETS (every module and user with
 * live counts) so the page can render its filter chips without guessing.
 */
app.get('/api/audit', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (req: any, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    const module = String(req.query?.module || '').trim();
    const user = String(req.query?.user || '').trim();
    const kind = String(req.query?.kind || '').trim(); // Created | Updated | Deleted | Logged Out | System
    const from = String(req.query?.from || '').trim(); // YYYY-MM-DD
    const to = String(req.query?.to || '').trim(); // YYYY-MM-DD
    const limit = Math.min(Math.max(parseInt(String(req.query?.limit || '300'), 10) || 300, 1), 1000);
    const offset = Math.max(parseInt(String(req.query?.offset || '0'), 10) || 0, 0);

    // PLUMBING-OFF-TRAIL (owner, 29 Oct 2026): the modules that exist for the
    // machine — push-token registration churn, api/health probes — are not
    // business acts. They stayed in the table but never reach the board: the
    // client reads this trail to follow DISPATCH work, and a wall of
    // "Anonymous Deleted push-tokens" reads as back-end noise ("why should
    // they be seeing this?"). Sign-ins live in the Sign-in Reports tab.
    const PLUMBING_MODULES = ['push-tokens', 'api', 'health'];

    const where: any = {};
    if (module) where.module = module;
    else where.module = { notIn: PLUMBING_MODULES };
    if (user) where.user = user;
    if (kind === 'System') where.user = 'System';
    else if (kind) where.action = { startsWith: kind, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { record: { contains: q, mode: 'insensitive' } },
        { module: { contains: q, mode: 'insensitive' } },
        { user: { contains: q, mode: 'insensitive' } },
      ];
    }
    const range: any = {};
    if (from) {
      const d = new Date(from + 'T00:00:00.000Z');
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(to + 'T23:59:59.999Z');
      if (!isNaN(d.getTime())) range.lte = d;
    }
    if (range.gte || range.lte) where.timestamp = range;

    const [rows, total, byModule, byUser] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: limit, skip: offset }),
      prisma.auditLog.count({ where }),
      // Facets read the WHOLE trail (not the current filter) — the chips must
      // keep their counts even while one module is selected. The plumbing
      // modules stay off the chip rail for the same reason they stay off the
      // board: they are the machine's work, not the business's.
      prisma.auditLog.groupBy({ by: ['module'], _count: { _all: true }, where: { module: { notIn: PLUMBING_MODULES } } }),
      prisma.auditLog.groupBy({ by: ['user'], _count: { _all: true } }),
    ]);
    const modules = byModule
      .map((m: any) => ({ name: m.module, count: m._count._all }))
      .sort((a: any, b: any) => b.count - a.count);
    const users = byUser
      .map((u: any) => ({ name: u.user, count: u._count._all }))
      .sort((a: any, b: any) => b.count - a.count);
    res.json({ rows, total, modules, users, limit, offset });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});
/*
 * AUDIT:LOGINS — who signed in, who failed, who signed out. Failed attempts
 * are now written by the login route, so a probing session is visible.
 */
app.get('/api/login-reports', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (req: any, res) => {
  try {
    const where: any = {};
    const status = String(req.query?.status || '').trim();
    if (status) where.status = status;
    res.json(await prisma.loginReport.findMany({ where, orderBy: { timestamp: 'desc' }, take: 5000 }));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
});

// --- DASHBOARD ---
app.get('/api/dashboard/overview', authenticate, async (_req, res) => {
  const [trips, trucks, drivers, expensesAgg, gateEntries, workOrders, inventory, procurement, alerts] = await Promise.all([
    prisma.trip.findMany(),
    prisma.truck.findMany(),
    prisma.driver.findMany(),
    prisma.expense.findMany(),
    prisma.gateEntry.findMany(),
    prisma.workOrder.findMany(),
    prisma.inventoryItem.findMany(),
    prisma.procurementRequest.findMany(),
    prisma.notification.findMany({ where: { read: false }, orderBy: { createdAt: 'desc' }, take: 5 })
  ]);
  
  res.json({
    trips,
    trucks,
    drivers,
    expenses: expensesAgg,
    gateEntries,
    workOrders,
    inventory,
    procurement,
    alerts
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
