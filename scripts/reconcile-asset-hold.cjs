/**
 * One-shot reconcile of the fleet register against live dispatches.
 *
 * Assigning a truck never moved it to "Assigned" (nothing wrote that state), so
 * today every tail in the fleet reads "Available" — including the ones already
 * hitched to a live dispatch, which is how a body gets double-booked. This walks
 * every live dispatch (anything not Stopped/Completed) and marks what it is
 * actually holding as Assigned / On Trip.
 *
 * Only "Available" assets are claimed: a truck in Maintenance, one on Check Up,
 * a blocked number or one already Out of Yard is left exactly as the fleet team
 * set it. Idempotent — a second run changes nothing. Reversible by hand from the
 * Fleet Registry (Assigned → Available).
 */
const BASE = "https://petrolline.fleetopsx.com/api";

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  try {
    return { status: res.status, payload: text ? JSON.parse(text) : null };
  } catch {
    return { status: res.status, payload: text };
  }
}

const norm = (s) => String(s || "").replace(/\s/g, "").toUpperCase();

(async () => {
  const login = await api(null, "POST", "/auth/login", {
    username: "manager@petroline.ng",
    password: "Petroline@2026",
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const token = login.payload.token;

  const trips = (await api(token, "GET", "/trips")).payload;
  const heads = (await api(token, "GET", "/trucks")).payload;
  const tails = (await api(token, "GET", "/tails")).payload;
  const drivers = (await api(token, "GET", "/drivers")).payload;

  const byPlate = new Map();
  for (const h of heads) {
    byPlate.set(norm(h.registration), h);
    if (h.cabId) byPlate.set(norm(h.cabId), h);
  }
  const byTail = new Map(tails.map((t) => [norm(t.number), t]));
  const driverByName = new Map(drivers.map((d) => [norm(d.name), d]));

  const dead = ["Stopped", "Completed"];
  const live = trips.filter((t) => !dead.includes(String(t.status)));

  const claimedHeads = new Set();
  const claimedTails = new Set();
  const claimedDrivers = new Set();
  const jobs = [];

  for (const t of live) {
    const [plateRaw, tailRaw] = String(t.truckReg || "").split("/").map((p) => p.trim());
    const head = plateRaw && !/unassigned/i.test(plateRaw) ? byPlate.get(norm(plateRaw)) : undefined;
    if (head && head.status === "Available" && !claimedHeads.has(head.id)) {
      claimedHeads.add(head.id);
      jobs.push(api(token, "PATCH", `/trucks/${head.id}`, { status: "Assigned" }));
    }
    const tail = tailRaw ? byTail.get(norm(tailRaw)) : undefined;
    if (tail && tail.status === "Available" && !claimedTails.has(tail.id)) {
      claimedTails.add(tail.id);
      jobs.push(api(token, "PATCH", `/tails/${tail.id}`, { status: "Assigned" }));
    }
    const driver = t.driverName && !/unassigned/i.test(t.driverName) ? driverByName.get(norm(t.driverName)) : undefined;
    if (driver && driver.status === "Available" && !claimedDrivers.has(driver.id)) {
      claimedDrivers.add(driver.id);
      jobs.push(api(token, "PATCH", `/drivers/${driver.id}`, { status: "On Trip" }));
    }
  }

  const results = await Promise.all(jobs);
  const failed = results.filter((r) => r.status >= 400).length;
  console.log(`live dispatches scanned: ${live.length}`);
  console.log(`  heads marked Assigned : ${claimedHeads.size}`);
  console.log(`  tails marked Assigned : ${claimedTails.size}`);
  console.log(`  drivers marked On Trip: ${claimedDrivers.size}`);
  console.log(failed ? `  ${failed} write(s) FAILED` : "  all writes ok");

  const afterHeads = (await api(token, "GET", "/trucks")).payload;
  const afterTails = (await api(token, "GET", "/tails")).payload;
  const count = (rows, s) => rows.filter((r) => r.status === s).length;
  console.log(`\nheads: Assigned ${count(afterHeads, "Assigned")} | Available ${count(afterHeads, "Available")}`);
  console.log(`tails: Assigned ${count(afterTails, "Assigned")} | Available ${count(afterTails, "Available")}`);
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
