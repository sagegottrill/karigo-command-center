/**
 * PURGE TEST SCAFFOLDING FROM PRODUCTION (run ON the VPS, inside
 * /var/www/fleetopsx-api so @prisma/client resolves).
 *
 *   node _purge-test-data.cjs            # dry run: lists candidates, changes nothing
 *   node _purge-test-data.cjs --apply    # backs up every row, then deletes
 *
 * Only unambiguous markers are touched:
 *   users        @livecheck.io and t.test@test.com
 *   trucks       registration E2E-…/TEST…, or cabId E2E-…
 *   drivers      staffId E2E-…, or name exactly "Test Driver"/"QA Test Driver"
 *   trips        customer "Test", or customerConsignee "QA test…"
 *   work orders  truckReg/defect mentioning E2E
 *   notifications the probe chatter those records produced
 *
 * Real petrolline accounts (t.store@, t.driver@, g.test@, …) are NOT matched:
 * their addresses are on petrolline.fleetopsx.com, whatever their display name.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const API = "https://api.fleetopsx.com/api";
const p = new PrismaClient();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

(async () => {
  const candidates = { trips: [], trucks: [], drivers: [], workOrders: [], users: [], notifications: [] };

  candidates.trips = (
    await p.trip.findMany().catch(() => [])
  ).filter(
    (t) =>
      /^test$/i.test(String(t.customer || "").trim()) ||
      /^qa\s*test/i.test(String(t.customerConsignee || "").trim()),
  );

  candidates.trucks = (
    await p.truck.findMany().catch(() => [])
  ).filter(
    (t) =>
      /^(e2e[- ]|test)/i.test(String(t.registration || "").trim()) ||
      /^e2e-/i.test(String(t.cabId || "").trim()),
  );

  // "Test Driver" (staffId P10000) is left alone: that one was created from the
  // petrolline side, not by a probe.
  candidates.drivers = (
    await p.driver.findMany().catch(() => [])
  ).filter(
    (d) =>
      /^e2e/i.test(String(d.staffId || "").trim()) ||
      /^qa test driver$/i.test(String(d.name || "").trim()),
  );

  candidates.workOrders = (
    await (p.workOrder ? p.workOrder.findMany().catch(() => []) : [])
  ).filter((w) => /e2e/i.test(`${w.truckReg || ""} ${w.defect || ""}`));

  const login = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "e2e.admin@livecheck.io", password: "FleetOpsx2026!" }),
  });
  const token = (await login.json()).token;
  if (!token) throw new Error("could not sign in as the cleanup admin");
  const users = await (await fetch(API + "/users", { headers: { authorization: "Bearer " + token } })).json();
  candidates.users = (Array.isArray(users) ? users : []).filter(
    (u) => /@livecheck\.io$/i.test(u.email || "") || /^t\.test@test\.com$/i.test(u.email || ""),
  );

  candidates.notifications = (await p.notification.findMany().catch(() => [])).filter((n) =>
    /e2e|E2E-|ZZ .*Probe|Procurement Desk Probe|EG-[A-Z0-9]{6}|QA test|test fleet/i.test(
      `${n.body || ""} ${n.refLabel || ""}`,
    ),
  );

  fs.mkdirSync("/root/backups", { recursive: true });
  const file = `/root/backups/testdata-removal-${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify(candidates, null, 1));

  const summary = Object.entries(candidates).map(([k, v]) => `${k}=${v.length}`).join(" ");
  console.log("candidates: " + summary);
  console.log("backup written: " + file);
  for (const t of candidates.trucks) console.log("  truck   ", t.registration, "|", t.cabId);
  for (const d of candidates.drivers) console.log("  driver  ", d.name, "|", d.staffId);
  for (const t of candidates.trips) console.log("  trip    ", t.truckReg, "|", t.customer, "|", t.customerConsignee);
  for (const u of candidates.users) console.log("  user    ", u.email);

  if (process.argv[2] !== "--apply") {
    console.log("\nDRY RUN — nothing was deleted. Re-run with --apply to remove these.");
    await p.$disconnect();
    return;
  }

  const ids = (rows) => ({ id: { in: rows.map((r) => r.id) } });
  const del = async (label, rows, fn) => {
    if (!rows.length) return console.log(`deleted ${label} 0`);
    try {
      const r = await fn(ids(rows));
      console.log(`deleted ${label} ${r.count}`);
    } catch (e) {
      console.log(`FAILED ${label}: ${e.message.split("\n")[0]}`);
    }
  };

  // Children first, so no vehicle or driver is pulled out from under a record.
  await del("trips", candidates.trips, (w) => p.trip.deleteMany(w));
  await del("work orders", candidates.workOrders, (w) => p.workOrder.deleteMany(w));
  await del("drivers", candidates.drivers, (w) => p.driver.deleteMany(w));
  await del("trucks", candidates.trucks, (w) => p.truck.deleteMany(w));
  await del("notifications", candidates.notifications, (w) => p.notification.deleteMany(w));

  // The cleanup admin is deleted last so its token stays valid for the rest.
  const ordered = [...candidates.users].sort((a, b) => (/^e2e\.admin@/i.test(a.email) ? 1 : 0) - (/^e2e\.admin@/i.test(b.email) ? 1 : 0));
  let gone = 0;
  const failed = [];
  for (const u of ordered) {
    const r = await fetch(API + "/users/" + u.id, { method: "DELETE", headers: { authorization: "Bearer " + token } });
    if (r.ok) gone++;
    else failed.push(`${u.email}:${r.status}`);
  }
  console.log(`deleted users ${gone}${failed.length ? " — failed: " + failed.join(", ") : ""}`);

  const left = {
    users_total: await p.user.count(),
    users_livecheck: await p.user.count({ where: { email: { endsWith: "@livecheck.io" } } }),
    users_testcom: await p.user.count({ where: { email: { endsWith: "@test.com" } } }),
    trucks_e2e: await p.truck.count({ where: { registration: { startsWith: "E2E-" } } }),
    drivers_e2e: await p.driver.count({ where: { staffId: { startsWith: "E2E-" } } }),
    items_zz: await p.inventoryItem.count({ where: { sku: { startsWith: "ZZ-" } } }),
    vendors_zz: await p.vendor.count({ where: { name: { startsWith: "ZZ " } } }),
    pos_zz: await p.procurementRequest.count({ where: { sku: { startsWith: "ZZ-" } } }),
  };
  console.log("leftovers: " + JSON.stringify(left));
  await p.$disconnect();
})().catch((e) => {
  console.error("purge failed:", e.message);
  process.exit(1);
});
