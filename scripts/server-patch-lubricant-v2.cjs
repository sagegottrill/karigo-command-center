/**
 * Lubricant module — patch v2 (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Three corrections after the first live probe:
 *
 *   1) VEHICLES NEVER RESOLVED. NOT ONE of the 42 live trips stores driverId /
 *      headId / tailId — the dispatch board carries `truckReg` ("GGE98YK / B035"),
 *      `tailNumber` and `driverName` instead. So the detail modal showed a driver
 *      and a truck with nothing in them. Resolution now prefers the ids when they
 *      exist and falls back to matching the plate, the tail number and the name.
 *
 *   2) THE REQUEST BOARD LISTED TRUCKS THAT HAD ALREADY COME BACK. "Returning"
 *      and "Returned" were treated as active, so a truck on its way home still
 *      asked the department to dispense diesel for it.
 *
 *   3) THE FEED SAID EVERYTHING TWICE. The page builds its rows from what
 *      actually happened AND the persisted Lubricant alerts were appended on top,
 *      so every restock and disbursal appeared twice.
 *
 * Idempotent: re-running is a no-op. Then: pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";
const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const NEW_RESOLVER = `/** Normalised key for matching a plate / tail number / name typed on a trip. */
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
    const name = String(d.name || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    if (name && !driverByName.has(name)) driverByName.set(name, d);
    const phone = String(d.phone || '').replace(/\\D/g, '').slice(-10);
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
      driverByName.get(String(t.driverName || '').trim().toLowerCase().replace(/\\s+/g, ' ')) ||
      null;
    out[t.id] = { driver: driver || null, head: head || null, tail: tail || null };
  }
  return out;
}
`;

function patch() {
  let src = fs.readFileSync(INDEX, "utf8");
  must(src.includes("/api/lubricant/overview"), "index.ts carries the lubricant block");

  const before = src;
  const RESOLVER_RE = /async function lubricantTripVehicles\(trips: any\[\]\) \{[\s\S]*?\n\}\n/;
  must(RESOLVER_RE.test(src), "found lubricantTripVehicles()");
  src = src.replace(RESOLVER_RE, NEW_RESOLVER);

  must(
    src.includes("if (['Stopped', 'Declined', 'Completed', 'Returned'].includes(String(t.status))) continue;"),
    "found the pending status filter",
  );
  src = src.replace(
    "if (['Stopped', 'Declined', 'Completed', 'Returned'].includes(String(t.status))) continue;",
    "// A truck on its way home is not waiting for diesel — only the outbound leg is.\n    if (['Stopped', 'Declined', 'Completed', 'Returning', 'Returned'].includes(String(t.status))) continue;",
  );

  must(src.includes("prisma.notification.findMany({ where: { category: 'Lubricant' }, orderBy: { createdAt: 'desc' }, take: 30 })"), "found the pushed-notice query");
  src = src.replace(
    "prisma.notification.findMany({ where: { category: 'Lubricant' }, orderBy: { createdAt: 'desc' }, take: 30 })",
    "// The rows above are built from the events themselves, so OUR OWN persisted\n      // Lubricant alerts are skipped here — they are what the bell is for, and the\n      // page was otherwise showing every restock and disbursal twice.\n      prisma.notification.findMany({ where: { AND: [{ category: { not: 'Lubricant' } }, { audience: { contains: 'Lubricant' } }] }, orderBy: { createdAt: 'desc' }, take: 30 })",
  );

  must(src !== before, "index.ts actually changed");
  fs.writeFileSync(INDEX + ".bak-lubricant-v2", before);
  fs.writeFileSync(INDEX, src);
  console.log("ok: index.ts written (backup: index.ts.bak-lubricant-v2)");
}

patch();
console.log("PATCH v2 OK — now: pm2 restart fleetopsx-api");
