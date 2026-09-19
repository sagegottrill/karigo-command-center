/** Read-only diagnostic: for every live dispatch, what does its truck say it is? */
const BASE = "https://petrolline.fleetopsx.com/api";

async function api(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.json();
}

const norm = (s) => String(s || "").replace(/\s/g, "").toUpperCase();

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "manager@petroline.ng", password: "Petroline@2026" }),
  });
  const token = (await login.json()).token;

  const trips = await api(token, "/trips");
  const heads = await api(token, "/trucks");
  const tails = await api(token, "/tails");

  const byPlate = new Map();
  for (const h of heads) {
    byPlate.set(norm(h.registration), h);
    if (h.cabId) byPlate.set(norm(h.cabId), h);
  }
  const byTail = new Map(tails.map((t) => [norm(t.number), t]));

  const dead = ["Stopped", "Completed"];
  const live = trips.filter((t) => !dead.includes(String(t.status)));
  const tally = new Map();
  const headRows = [];

  for (const t of live) {
    const [plateRaw, tailRaw] = String(t.truckReg || "").split("/").map((p) => p.trim());
    const head = plateRaw ? byPlate.get(norm(plateRaw)) : undefined;
    const tail = tailRaw ? byTail.get(norm(tailRaw)) : undefined;
    const key = `${t.status} → head:${head ? head.status : "n/a"} tail:${tail ? tail.status : "n/a"}`;
    tally.set(key, (tally.get(key) || 0) + 1);
    if (head) headRows.push({ trip: t.status, cap: head.cabId, plate: head.registration, asset: head.status });
  }

  console.log(`live dispatches: ${live.length} of ${trips.length}`);
  console.log("\nstatus combinations:");
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(3)}  ${k}`);

  const wrong = headRows.filter((r) => r.asset === "Available");
  console.log(`\ntrucks on a live dispatch that still read Available: ${wrong.length}`);
  for (const r of wrong.slice(0, 10)) console.log(`   ${r.cap} (${r.plate}) — dispatch ${r.trip}`);

  const headStatuses = new Map();
  for (const h of heads) headStatuses.set(h.status, (headStatuses.get(h.status) || 0) + 1);
  console.log("\nall heads by status:", JSON.stringify(Object.fromEntries(headStatuses)));
  const tailStatuses = new Map();
  for (const t of tails) tailStatuses.set(t.status, (tailStatuses.get(t.status) || 0) + 1);
  console.log("all tails by status:", JSON.stringify(Object.fromEntries(tailStatuses)));
})();
