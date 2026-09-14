/**
 * Server patch for /var/www/fleetopsx-api/index.ts (run via ssh_run.mjs).
 * 1) notificationScope: partners only see notifications addressed to their own
 *    company tag (`Partner:<Company>`) or broadcasts (audience null). Staff see
 *    their role's + broadcasts. Legacy `Partner`-tagged rows stay visible to all
 *    partners so nothing already sent disappears.
 * 2) notifyPartner(): stamps partner lifecycle notices with `Partner:<Company>`
 *    in addition to 'Partner', so each company sees only its own cargo alerts.
 * 3) TRIP_STATUS_NOTICES: add 'Tracking' to operational audiences so the
 *    Tracking Ops portal receives dispatch alerts (was: zero notifications).
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const before = src;

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// --- 1. notificationScope: company-scoped for partners ---
const oldScope = `// Audience-scoped notifications: null = broadcast (legacy rows), otherwise comma-separated roles.
function notificationScope(req: any) {
  const role: string = req.user?.role || '';
  if (role === 'Customer Portals (External)') return { OR: [{ audience: null }, { audience: { contains: 'Partner' } }] };
  return { OR: [{ audience: null }, { audience: { contains: role } }] };
}`;
const newScope = `// Audience-scoped notifications: null = broadcast (legacy rows), otherwise comma-separated roles.
// Partners are scoped to THEIR company tag (\`Partner:<Company>\`) so one company
// never sees another's cargo alerts. Legacy rows tagged plain 'Partner' stay
// visible to every partner (nothing already delivered disappears).
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
  }
  return { OR: [{ audience: null }, { audience: { contains: role } }] };
}`;
must(src.includes(oldScope), "old notificationScope found");
src = src.replace(oldScope, newScope);

// --- notificationScope is now async: await all call sites ---
src = src.replace(
  "const count = await prisma.notification.count({ where: { read: false, ...notificationScope(req) } });",
  "const count = await prisma.notification.count({ where: { read: false, ...(await notificationScope(req)) } });",
);
src = src.replace(
  "res.json(await prisma.notification.findMany({ where: notificationScope(req), orderBy: { createdAt: 'desc' } }));",
  "res.json(await prisma.notification.findMany({ where: await notificationScope(req), orderBy: { createdAt: 'desc' } }));",
);
src = src.replace(
  "await prisma.notification.updateMany({ where: notificationScope(req), data: { read: true } });",
  "await prisma.notification.updateMany({ where: await notificationScope(req), data: { read: true } });",
);
must(src.includes("await notificationScope(req)"), "notificationScope call sites awaited");

// --- 2. lifecycle notify(): stamp partner notices with their company tag ---
const oldNotifyBlock = `  const notice = TRIP_STATUS_NOTICES[trip.status];
  if (notice && before && before.status !== trip.status) {
    void notify(notice.category, notice.title, notice.body(trip), notice.severity, notice.audience);
  }`;
const newNotifyBlock = `  const notice = TRIP_STATUS_NOTICES[trip.status];
  if (notice && before && before.status !== trip.status) {
    // Partner notices are additionally tagged with THIS trip's company
    // (Partner:<Company>) so each partner only sees its own cargo alerts.
    const audience = notice.audience.includes('Partner') && trip.customer
      ? notice.audience + ',Partner:' + trip.customer
      : notice.audience;
    void notify(notice.category, notice.title, notice.body(trip), notice.severity, audience);
  }`;
must(src.includes(oldNotifyBlock), "lifecycle notify block found");
src = src.replace(oldNotifyBlock, newNotifyBlock);
console.log("ok: lifecycle notify stamped with company tag");

// --- 3. TRIP_STATUS_NOTICES: include Tracking in operational audiences ---
const audienceUpdates = [
  ["'En Route': { category: 'Operations', title: 'Truck Departed', body: (t) => `Dispatch ${t.id.slice(0, 8)} departed — truck ${t.truckReg} is En Route to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Security', severity: 'info' }",
   "'En Route': { category: 'Operations', title: 'Truck Departed', body: (t) => `Dispatch ${t.id.slice(0, 8)} departed — truck ${t.truckReg} is En Route to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Security,Tracking', severity: 'info' }"],
  ["'Scheduled': { category: 'Operations', title: 'Truck Assigned', body: (t) => `Dispatch ${t.id.slice(0, 8)} is fully assigned (${t.truckReg} · ${t.driverName}) and scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'success' }",
   "'Scheduled': { category: 'Operations', title: 'Truck Assigned', body: (t) => `Dispatch ${t.id.slice(0, 8)} is fully assigned (${t.truckReg} · ${t.driverName}) and scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'success' }"],
  ["'Delayed': { category: 'Operations', title: 'Dispatch Delayed', body: (t) => `Dispatch ${t.id.slice(0, 8)} has been marked Delayed.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'warning' }",
   "'Delayed': { category: 'Operations', title: 'Dispatch Delayed', body: (t) => `Dispatch ${t.id.slice(0, 8)} has been marked Delayed.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'warning' }"],
  ["'Returning': { category: 'Operations', title: 'Truck Returning', body: (t) => `Dispatch ${t.id.slice(0, 8)} is returning to base.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'info' }",
   "'Returning': { category: 'Operations', title: 'Truck Returning', body: (t) => `Dispatch ${t.id.slice(0, 8)} is returning to base.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'info' }"],
  ["'Completed': { category: 'Operations', title: 'Delivery Completed', body: (t) => `Dispatch ${t.id.slice(0, 8)} completed delivery to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'success' }",
   "'Completed': { category: 'Operations', title: 'Delivery Completed', body: (t) => `Dispatch ${t.id.slice(0, 8)} completed delivery to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'success' }"],
];
for (const [from, to] of audienceUpdates) {
  if (!src.includes(from)) {
    console.error("PATCH FAILED AT: audience row missing: " + from.slice(0, 60));
    process.exit(1);
  }
  src = src.replace(from, to);
}
console.log("ok: Tracking added to 5 operational audiences");

// --- checkpoint notice: include Tracking (they log these themselves) ---
src = src.replace(
  "void notify('Operations', 'New Location has been Logged', `Dispatch checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations');",
  "void notify('Operations', 'New Location has been Logged', `Dispatch checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking');",
);
console.log("ok: checkpoint notice audience includes Tracking");

if (src === before) {
  console.error("NOTHING CHANGED");
  process.exit(1);
}
fs.writeFileSync(FILE, src);
console.log("PATCH APPLIED OK");
