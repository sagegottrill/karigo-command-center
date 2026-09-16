/**
 * Server patch: AUDIT TRAIL — every successful mutation gets recorded.
 *
 * Root cause of the empty audit log: GET /api/audit existed but NOTHING ever
 * wrote an AuditLog row — approvals, declines, assignments, account changes
 * were all invisible. This installs ONE express middleware that records every
 * successful (2xx) non-GET /api call: who, what module, which record, device, ip.
 * Fire-and-forget: audit failure can never break the business write itself.
 *
 * Run ON the Hetzner box: node patch-audit-middleware.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

must(!src.includes("AUDIT-TRAIL-MIDDLEWARE"), "not already applied");

// 1) Install the middleware right before the AUTH section.
const authAnchor = "// --- AUTH ---";
must(src.includes(authAnchor), "auth anchor found");
const middleware = `// AUDIT-TRAIL-MIDDLEWARE — record every successful mutation (who/what/record/device/ip).
app.use('/api', (req: any, res: any, next: any) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const authPath = req.path.startsWith('/auth/');
    if (authPath && req.path !== '/api/auth/logout') return; // logins live in LoginReport
    (async () => {
      const path = req.path.replace(/\\\\/g, '/').replace(/^\\\\/+/, '');
      const segs = path.split('/').filter(Boolean);
      const byId = /:|id$/i.test(segs[segs.length - 1] || '') || req.params?.id;
      const moduleMap = {
        trips: 'Dispatch', users: 'Accounts', drivers: 'HR', trucks: 'Fleet',
        tails: 'Fleet', gate: 'Security', tracking: 'Tracking', expenses: 'Accounts',
        fuel: 'Fuel', 'fuel-prices': 'Fuel', inventory: 'Inventory',
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

// --- AUTH ---`;
src = src.replace(authAnchor, middleware);

// 2) Mount points must precede the middleware for req.params — app.use('/api') with
//    a path runs before routes; express fills params per-layer, so read them defensively.
must(src.includes("AUDIT-TRAIL-MIDDLEWARE"), "middleware installed");
fs.writeFileSync(FILE, src);
console.log("PATCH OK — restart with: pm2 restart fleetopsx-api");
