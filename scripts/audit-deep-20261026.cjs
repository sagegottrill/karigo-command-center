/* DEEP AUDIT v2 (read-only) — fixed field list, adds last-activity per test user */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const K = (v) => String(v || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
const TESTY = /test|probe|bench|dummy|sample|demo|e2e|zz-/i;
const ACTIVE = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"];
const short = (id) => String(id || "").slice(-5);

function head(text) { console.log("\n=== " + text + " ==="); }
const show = (rows, fmt) => { for (const r of rows.slice(0, 40)) console.log("  " + fmt(r)); };

(async () => {
  head("TABLES");
  const tables = await p.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const names = tables.map((r) => r.table_name);
  console.log(names.join(", "));

  head("TEST USERS + LAST ACTIVITY");
  const userCols = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='User'");
  const uCols = new Set(userCols.map((r) => r.column_name));
  const users = await p.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  // last activity: use any per-user audit rows if present
  let lastLogin = new Map();
  if (names.includes("LoginReport")) {
    const lr = await p.$queryRawUnsafe('SELECT "userId", max("timestamp") last FROM "LoginReport" WHERE "status" = \x27SUCCESS\x27 GROUP BY "userId"');
    for (const r of lr) lastLogin.set(String(r.userId).toLowerCase(), r.last);
  }
  const fakeUsers = users.filter((u) => TESTY.test(u.email || "") || TESTY.test(u.name || ""));
  console.log("test-looking users:", fakeUsers.length, "of", users.length);
  const now = Date.now();
  for (const u of fakeUsers) {
    const last = lastLogin.get((u.email || "").toLowerCase());
    const stale = last ? Math.round((now - new Date(last).getTime()) / 86400000) + "d ago" : "never";
    console.log("  ", u.email, "|", u.name, "|", u.role, "| lastLogin:", stale);
  }

  head("TRIPS — ghosts, fakes, ISO fingerprints");
  const tripCols = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='Trip'");
  const tCols = new Set(tripCols.map((r) => r.column_name));
  const statusField = tCols.has("status") ? "status" : null;
  const trips = await p.trip.findMany({});
  console.log("total trips:", trips.length, "| status field cols:", [...tCols].filter((c) => /status|gate|start|return|display/i.test(c)).join(", "));
  const st = (t) => t[statusField];
  const fakeTrips = trips.filter((t) => TESTY.test(t.truckReg || "") || TESTY.test(t.driverName || ""));
  console.log("testy trips:", fakeTrips.length);
  show(fakeTrips, (t) => short(t.id) + " | " + st(t) + " | " + t.truckReg + " | " + t.driverName + " | upd " + String(t.updatedAt).slice(0, 16));
  const isoAuto = trips.filter((t) => t.startTime && /\d{4}-\d{2}-\d{2}T/.test(String(t.startTime)) && !t.gateOutBy && ACTIVE.includes(st(t)));
  console.log("ACTIVE + ISO startTime + no gateOutBy (old auto-path survivors):", isoAuto.length);
  show(isoAuto, (t) => short(t.id) + " | " + st(t) + " | " + t.truckReg + " | " + String(t.startTime).slice(0, 19));
  const ghostReturn = trips.filter((t) => (t.gateInBy || t.returnedAt) && ACTIVE.includes(st(t)));
  console.log("ACTIVE trips carrying a return stamp:", ghostReturn.length);
  show(ghostReturn, (t) => short(t.id) + " | " + st(t) + " | " + t.truckReg + " | in:" + t.gateInBy + " | " + String(t.returnedAt || "").slice(0, 19));
  const activeTrips = trips.filter((t) => ACTIVE.includes(st(t)));
  const byTruck = new Map();
  for (const t of activeTrips) {
    const reg = K((t.truckReg || "").split("(")[0]);
    if (!reg) continue;
    byTruck.set(reg, (byTruck.get(reg) || 0) + 1);
  }
  const multi = [...byTruck.entries()].filter(([, c]) => c > 1);
  console.log("trucks named on >1 ACTIVE trip:", multi.length);
  for (const [reg, c] of multi.slice(0, 30)) {
    const rows = activeTrips.filter((t) => K((t.truckReg || "").split("(")[0]) === reg).map((t) => short(t.id) + ":" + st(t));
    console.log("  ", reg, "x" + c, "->", rows.join(", "));
  }
  const emptyActive = activeTrips.filter((t) => !t.driverName && !t.truckReg);
  console.log("ACTIVE with no driver and no truck:", emptyActive.length);
  show(emptyActive, (t) => short(t.id) + " | " + st(t) + " | upd " + String(t.updatedAt).slice(0, 16));
  const sentBackish = trips.filter((t) => st(t) === "Scheduled" && t.sendBackReason);
  console.log("Scheduled trips still owning a sendBackNote (stale send-back notes):", sentBackish.length);
  show(sentBackish, (t) => short(t.id) + " | " + t.truckReg + " | " + (t.sendBackReason || "").slice(0, 40));

  head("TOW (tails)");
  try {
    const tails = await p.truckTail.findMany();
    const dup = new Map();
    for (const t of tails) {
      const key = K(t.registration || t.plateNumber || "");
      if (key) dup.set(key, (dup.get(key) || 0) + 1);
    }
    console.log("total tails:", tails.length, "| dup registrations:", [...dup.entries()].filter(([, c]) => c > 1).map(([k, c]) => k + "x" + c).join(", ") || "none");
    const fake = tails.filter((t) => TESTY.test(t.registration || t.plateNumber || ""));
    console.log("testy tails:", fake.length);
    show(fake, (t) => (t.registration || t.plateNumber));
  } catch (e) { console.log("(tails:", e.message.slice(0, 90) + ")"); }

  head("FUEL REQUESTS fakes");
  try {
    const fr = await p.fuelRequest.findMany({ select: { id: true, plateNumber: true, driverName: true, status: true, quantity: true, requestedBy: true, date: true }, orderBy: { date: "desc" }, take: 300 });
    const fake = fr.filter((r) => TESTY.test(r.plateNumber || "") || TESTY.test(r.driverName || "") || TESTY.test(r.requestedBy || ""));
    console.log("testy fuel requests (last 300):", fake.length);
    show(fake, (r) => (r.plateNumber || "") + " | " + (r.driverName || "") + " | " + r.status + " | " + r.date);
  } catch (e) { console.log("(fuel:", e.message.slice(0, 90) + ")"); }

  head("INVENTORY + MOVEMENTS");
  try {
    const inv = await p.inventoryItem.findMany({ select: { id: true, name: true, sku: true, stock: true, reorderLevel: true } });
    const neg = inv.filter((i) => (i.stock ?? 0) < 0);
    const fake = inv.filter((i) => TESTY.test(i.name || "") || TESTY.test(i.sku || ""));
    console.log("inventory:", inv.length, "| negative:", neg.length, "| testy:", fake.length);
    show(neg, (i) => i.name + " | " + i.sku + " | stock " + i.stock);
    show(fake, (i) => i.name + " | " + i.sku);
  } catch (e) { console.log("(inv:", e.message.slice(0, 90) + ")"); }
  try {
    const orphanMove = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "InventoryMovement" mv LEFT JOIN "InventoryItem" i ON mv."itemId"=i.id WHERE i.id IS NULL');
    console.log("movements with no item:", orphanMove[0].c);
  } catch (e) { console.log("(orphanMove:", e.message.slice(0, 90) + ")"); }

  head("PROCUREMENT fakes + ownerless");
  try {
    const pr = await p.procurementRequest.findMany({ select: { id: true, item: true, vendor: true, quantity: true, unitPrice: true, status: true, requestedBy: true, createdAt: true } });
    const fake = pr.filter((r) => TESTY.test(r.item || "") || TESTY.test(r.vendor || "") || (r.quantity ?? 0) <= 0);
    console.log("procurement:", pr.length, "| testy/qty<=0:", fake.length);
    show(fake, (r) => short(r.id) + " | " + r.item + " | " + r.vendor + " | qty " + r.quantity + " | " + r.status + " | " + String(r.createdAt).slice(0, 10));
    const nullReq = pr.filter((r) => r.requestedBy == null && new Date(r.createdAt) < new Date("2026-09-24"));
    console.log("pre-Sep24 rows with no requester:", nullReq.length);
    show(nullReq, (r) => short(r.id) + " | " + r.item + " | " + r.status);
  } catch (e) { console.log("(proc:", e.message.slice(0, 90) + ")"); }

  head("CONVERSATIONS orphans");
  try {
    const orph = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "Conversation" cv LEFT JOIN "Trip" t ON cv."tripId"=t.id WHERE t.id IS NULL');
    console.log("conversations with no trip:", orph[0].c);
  } catch (e) { console.log("(conv:", e.message.slice(0, 90) + ")"); }

  head("TRUCKS ghost states");
  try {
    const regCols = new Set((await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='Truck'")).map((r) => r.column_name));
    const sts = regCols.has("status") ? "status" : "state";
    const trucks = await p.truck.findMany();
    for (const regPrefix of Object.keys({})) {}
    const activeByReg = byTruck;
    let outNoTrip = 0, availWithTrip = 0;
    for (const t of trucks) {
      const reg = K(t.cabId);
      const act = [...activeByReg.entries()].find(([k]) => k.includes(reg) || reg.includes(k));
      const c = act ? act[1] : 0;
      if (String(t[sts]).toLowerCase().includes("out") && c === 0) { outNoTrip++; if (outNoTrip <= 25) console.log("  OUT-NO-TRIP", t.cabId, t.registration, t[sts]); }
      if (String(t[sts]).toLowerCase().includes("avail") && c > 1) { availWithTrip++; }
    }
    console.log("Out-of-yard trucks with zero active trips:", outNoTrip);
    console.log("Available trucks with >1 active trip:", availWithTrip);
  } catch (e) { console.log("(ghostTrucks:", e.message.slice(0, 90) + ")"); }

  console.log("\nAUDIT DONE");
  await p.$disconnect();
})().catch((e) => { console.error("AUDIT FAILED", e.message); process.exit(1); });
