/* DEEP AUDIT v3 (read-only) — counts, columns, forensics on survivors + test users */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const TESTY = /test|probe|bench|dummy|sample|demo|e2e|^zz/i;
const ACTIVE = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"];
const short = (id) => String(id || "").slice(-5);
async function cols(table) {
  const rows = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name=$1", table);
  return rows.map((r) => r.column_name);
}
(async () => {
  const counts = {};
  const CANDIDATES = ["Trip", "Truck", "Tail", "Driver", "User", "Tenant", "FuelRequest", "FuelRequisition", "FuelPrice", "ProcurementRequest", "InventoryItem", "InventoryMovement", "InventoryRequisition", "LubricantStock", "LubricantDisbursal", "LubricantRestock", "GateEntry", "TrackingCheckpoint", "PushToken", "AuditLog", "Expense", "WorkOrder", "LoadingPickup", "Notification", "Conversation", "LoginReport"];
  for (const t of CANDIDATES) {
    try { counts[t] = await p.$queryRawUnsafe(`SELECT count(*)::int c FROM "${t}"`); counts[t] = counts[t][0].c; }
    catch (e) { counts[t] = "ERR:" + e.message.slice(0, 50); }
  }
  console.log("=== COUNTS ===");
  console.log(JSON.stringify(counts));

  console.log("\n=== COLUMNS ===");
  for (const t of ["FuelRequest", "ProcurementRequest", "Tail", "InventoryItem", "InventoryRequisition", "LubricantStock", "Trip"]) {
    try { console.log(t, "|", (await cols(t)).join(",")); } catch (e) {}
  }

  console.log("\n=== THE 3 TRIPS ISO-STAMPED TODAY ~12:06 (who wrote them?) ===");
  const todayStartstmp = ["47eca", "9be97", "145f5"]; // ids
  const trips = await p.trip.findMany({ select: { id: true, status: true, truckReg: true, driverName: true, startTime: true, gateOutBy: true, createdAt: true, updatedAt: true, directCosts: true, eta: true } });
  for (const s of todayStartstmp) {
    const t = trips.find((x) => x.id.endsWith(s) || String(x.id).includes(s));
    if (!t) { console.log(s, "not found"); continue; }
    console.log(JSON.stringify(t).slice(0, 900));
    const cps = await p.$queryRawUnsafe("SELECT id, \"tripId\", label, \"loggedAt\", meta FROM \"TrackingCheckpoint\" WHERE \"tripId\"=$1 ORDER BY \"loggedAt\" DESC LIMIT 5", t.id).catch(() => []);
    for (const c of cps) console.log("   CP:", JSON.stringify(c).slice(0, 200));
  }

  console.log("\n=== ISO SURVIVORS: any TrackingCheckpoint after 12:00 today? ===");
  const isoSurv = trips.filter((t) => t.startTime && /\d{4}-\d{2}-\d{2}T/.test(String(t.startTime)) && !t.gateOutBy && ACTIVE.includes(t.status));
  console.log("iso survivors:", isoSurv.length);
  for (const t of isoSurv) {
    const cps = await p.$queryRawUnsafe("SELECT label, \"loggedAt\" FROM \"TrackingCheckpoint\" WHERE \"tripId\"=$1 ORDER BY \"loggedAt\" DESC LIMIT 3", t.id).catch(() => []);
    const dc = t.directCosts || {};
    console.log(" ", String(t.id).slice(-5), "|", t.status, "|", t.truckReg, "|", String(t.startTime).slice(5, 19), "| DCkeys:", Object.keys(dc).join(",").slice(0, 80));
  }

  console.log("\n=== DOUBLE/TRIPLE BOOKED TRUCKS DETAIL ===");
  const groups = {};
  for (const t of trips.filter((x) => ACTIVE.includes(x.status) && x.truckReg)) {
    const key = String(t.truckReg).split("(")[0].trim().replace(/[^A-Za-z0-9]/g, "");
    (groups[key] ||= []).push(t);
  }
  for (const [reg, list] of Object.entries(groups).filter(([, l]) => l.length > 1)) {
    console.log("\nTRUCK", reg);
    for (const t of list) console.log("  ", String(t.id).slice(-5), "|", t.status, "|", t.driverName, "|", String(t.startTime || "").slice(0, 19), "| gate:", t.gateOutBy, "| created", String(t.createdAt).slice(0, 16), "| DCkeys:", Object.keys(t.directCosts || {}).join(",").slice(0, 60));
  }

  console.log("\n=== 31 STOPPED-EMPTY rows: provenance ===");
  const stoppedEmpty = trips.filter((t) => t.status === "Stopped" && !t.driverName && !t.truckReg);
  for (const t of stoppedEmpty.slice(0, 8)) {
    const cps = await p.$queryRawUnsafe("SELECT count(*)::int c FROM \"TrackingCheckpoint\" WHERE \"tripId\"=$1", t.id).catch(() => [{ c: -1 }]);
    console.log(" ", String(t.id).slice(-5), "| created", String(t.createdAt).slice(0, 16), "| upd", String(t.updatedAt).slice(0, 16), "| cps", cps[0]?.c, "| DCkeys:", Object.keys(t.directCosts || {}).join(",") || "-", "| hint", JSON.stringify(t).slice(0, 120));
  }
  console.log("total stoppedEmpty:", stoppedEmpty.length);

  console.log("\n=== 61 OUT-OF-YARD TRUCKS: which completed trips returned at the gate? ===");
  const trucks = await p.truck.findMany();
  const completed = trips.filter((t) => ["Completed", "Cancelled", "Declined"].includes(t.status));
  let safeReset = [], hold = [];
  for (const trk of trucks) {
    const st = String(trk.status || trk.state || "").toLowerCase();
    if (!st.includes("out")) continue;
    // trips naming this truck
    const mine = trips.filter((t) => {
      const reg = String(t.truckReg || "").replace(/[^A-Za-z0-9]/g, "");
      const cab = String(trk.cabId || "").replace(/[^A-Za-z0-9]/g, "").replace(/^P0*/, "");
      const plate = String(trk.registration || "").replace(/[^A-Za-z0-9]/g, "");
      return (reg && plate && reg.includes(plate)) || (reg && cab && reg.includes("P" + cab));
    });
    const openM = mine.filter((t) => ACTIVE.includes(t.status));
    if (openM.length) continue; // active trip → genuinely out, fine
    const closedM = mine.filter((t) => !ACTIVE.includes(t.status));
    const gateReturned = closedM.filter((t) => t.gateInBy || t.returnedAt);
    (gateReturned.length ? safeReset : hold).push({ cab: trk.cabId, reg: trk.registration, status: trk.status || trk.state, closedTrips: closedM.length, withGateIn: gateReturned.length });
  }
  console.log("SAFE to reset to Available (closed trip shows gate return):", safeReset.length);
  for (const s of safeReset) console.log("  ", s.cab, s.reg, "| trips", s.closedTrips, "| gateIn", s.withGateIn, "| now:", s.status);
  console.log("HOLD (no gate evidence — list for the yard):", hold.length);
  for (const s of hold) console.log("  ", s.cab, s.reg, "| trips", s.closedTrips, "| now:", s.status);

  console.log("\n=== TAILS ghost states (safe/hold split) ===");
  try {
    const tails = await p.tail.findMany();
    console.log("total tails:", tails.length);
    const tailStatusKey = Object.keys(tails[0] || {}).find((k) => /status|state/i.test(k));
    const th = tails.filter((x) => String(x[tailStatusKey] || "").toLowerCase().includes("out"));
    console.log("tails marked out:", th.length, "| statusKey:", tailStatusKey);
  } catch (e) { console.log("(tails:", e.message.slice(0, 80) + ")"); }

  console.log("\n=== TEST USERS forensics ===");
  const users = await p.user.findMany({ select: { id: true, email: true, name: true } });
  const fakeUsers = users.filter((u) => TESTY.test(u.email || "") || TESTY.test(u.name || ""));
  for (const u of fakeUsers) {
    const toks = await p.pushToken.findMany({ where: { userId: u.id } }).catch(() => []);
    const audits = await p.auditLog.findMany({ where: { userId: u.id }, take: 1 }).catch(() => []);
    const logins = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "LoginReport" WHERE "userId"=$1', u.id).catch(() => [{ c: -1 }]);
    const convs = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "Conversation" WHERE "userId"=$1 OR "userIds"::text LIKE $2', u.id, "%" + u.id + "%").catch(() => [{ c: -1 }]);
    const notifs = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "Notification" WHERE "userIds"::text LIKE $1', "%" + u.id + "%").catch(() => [{ c: -1 }]);
    console.log(" ", u.email, "| userid", String(u.id).slice(-6), "| pushToks", toks.length, "| audits", audits.length, "| logins", logins[0].c, "| convs", convs[0].c, "| notifs", notifs[0].c);
  }

  console.log("\n=== MKA434XV / E2E-TAIL-001 ===");
  const tailsAll = await p.tail.findMany().catch(() => []);
  const e2eTail = tailsAll.filter((t) => TESTY.test(t.registration || t.plateNumber || t.tailNumber || "") || /E2E/i.test(JSON.stringify(t).slice(0, 200)));
  console.log("testy tails:", e2eTail.length); for (const t of e2eTail) console.log("  ", JSON.stringify(t).slice(0, 220));
  const mka = trucks.filter((t) => /MKA434/i.test((t.registration || "") + (t.cabId || "")));
  console.log("truck MKA434XV:", JSON.stringify(mka.map((t) => ({ cab: t.cabId, reg: t.registration, st: t.status || t.state }))));
  const e2eTrips = await p.trip.findMany({ where: { OR: [{ truckReg: { contains: "E2E" } }, { truckReg: { contains: "MKA434XV" } }] }, select: { id: true, status: true, truckReg: true, driverName: true, createdAt: true } });
  for (const t of e2eTrips) console.log("  trip", String(t.id).slice(-5), t.status, t.truckReg, t.driverName, String(t.createdAt).slice(0, 16));

  console.log("\n=== orphan conversation ===");
  const orph = await p.$queryRawUnsafe('SELECT cv.id, cv."tripId" FROM "Conversation" cv LEFT JOIN "Trip" t ON cv."tripId"=t.id WHERE t.id IS NULL');
  console.log(JSON.stringify(orph));

  console.log("\n=== LubricantStock / InventoryRequisition rows (shelf sanity) ===");
  try {
    const ls = await p.lubricantStock.findMany();
    console.log("lubricantStock rows:", ls.length, JSON.stringify(ls.slice(0, 5)).slice(0, 400));
  } catch (e) { console.log("(lab:", e.message.slice(0, 80) + ")"); }
  try {
    const ir = await p.inventoryRequisition.findMany({ take: 5, orderBy: { createdAt: "desc" } });
    console.log("inventoryRequisition recent:", JSON.stringify(ir).slice(0, 500));
  } catch (e) { console.log("(ireq:", e.message.slice(0, 80) + ")"); }

  console.log("\nAUDIT3 DONE");
  await p.$disconnect();
})().catch((e) => { console.error("AUDIT3 FAILED", e.message, e.stack?.split("\n")[1]); process.exit(1); });
