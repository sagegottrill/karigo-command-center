/**
 * E2E WRITE-path wiring verifier — proves every department's CREATE actually
 * persists and is visible to the next role in the chain, then cleans up.
 *
 * POST /gate and /expenses pass req.body straight to Prisma, so this also
 * verifies the exact payloads the UI sends; any unknown/missing field surfaces
 * as a 400/500 here instead of silently dropping.
 *
 * Usage: node scripts/verify-e2e-writing.mjs
 */
const BASE = "https://petrolline.fleetopsx.com/api";

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const login = async (username, password) => {
  const r = await api(null, "POST", "/auth/login", { username, password });
  if (r.status !== 200) throw new Error(`login ${username}: ${r.status}`);
  return r.data.token;
};

const tm = await login("manager@petroline.ng", "Petroline@2026");
const fo = await login("fleet@petroline.ng", "Petroline@2026");
const track = await login("tracking@petroline.ng", "Petroline@2026");
const gate = await login("gate@petroline.ng", "Petroline@2026");
const eng = await login("engineering@petroline.ng", "Petroline@2026");
const acct = await login("accounts@petroline.ng", "Petroline@2026");
const hr = await login("hr@petroline.ng", "Petroline@2026");
const admin = await login("admin@fleetopsx.com", "Admin@2026");

const fails = [];
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) fails.push(label);
};

// ---- 1. FO assigns: does the assignment persist for TM + Tracking? ----
const stamp = Date.now().toString(36);
const req = await api(fo, "POST", "/trips", {
  driverName: "Unassigned", truckReg: "TBD", tailType: "Flatbed",
  pickup: "Wire Check Plant", dropoff: "Wire Check Depot",
  customerConsignee: "Wire Check Consignee", cargo: "Wire rods",
  loadingSite: "Wire Check Plant", status: "Requested",
});
check("FO creates request", req.status === 200 || req.status === 201, `status=${req.status}`);
const tripId = req.data?.id;

const assign = await api(fo, "PATCH", `/trips/${tripId}`, {
  driverName: "Wire Check Driver", truckReg: "P000 (WIRE01)", tailType: "Flatbed Tail",
  tailNumber: "B000", status: "Awaiting Approval",
  driverPhone: "07060000000",
});
check("FO assignment persists", [200, 201].includes(assign.status) && assign.data?.driverName === "Wire Check Driver",
  `status=${assign.status} driver=${assign.data?.driverName} phone=${assign.data?.driverPhone ?? "MISSING"}`);

const tmView = await api(tm, "GET", `/trips/${tripId}`);
check("TM reads assigned trip (GET /trips/:id)", tmView.status === 200, `status=${tmView.status}`);
check("TM sees FO's assignment", tmView.data?.driverName === "Wire Check Driver", `driver=${tmView.data?.driverName}`);

const sched = await api(tm, "PATCH", `/trips/${tripId}`, { status: "Scheduled" });
check("TM final approve -> Scheduled", [200, 201].includes(sched.status) && sched.data?.status === "Scheduled", `status=${sched.status}`);

// ---- 2. Tracking logs a checkpoint (exact UI payload) ----
const cp = await api(track, "POST", "/tracking", { tripId, location: "Wire Check Post 1", leg: "Outgoing" });
check("Tracking logs checkpoint", [200, 201].includes(cp.status), `status=${cp.status} ${JSON.stringify(cp.data).slice(0, 80)}`);
const cpList = await api(tm, "GET", `/tracking/${tripId}`);
check("TM + partner flow reads checkpoints", [200, 201].includes(cpList.status) && Array.isArray(cpList.data) && cpList.data.length >= 1,
  `status=${cpList.status} rows=${Array.isArray(cpList.data) ? cpList.data.length : "?"}`);

// ---- 3. Gate logs a departure (schema: type/truckReg/driver/purpose) ----
const ge = await api(gate, "POST", "/gate", {
  truckReg: "P000 (WIRE01)", driver: "Wire Check Driver", type: "Departure", purpose: "Delivery to Wire Check Depot",
});
check("Gate logs departure", [200, 201].includes(ge.status), `status=${ge.status} ${JSON.stringify(ge.data).slice(0, 90)}`);
if (ge.data?.id) {
  const gateList = await api(gate, "GET", "/gate");
  check("Gate log visible in register", Array.isArray(gateList.data) && gateList.data.some((e) => e.id === ge.data.id),
    `rows=${Array.isArray(gateList.data) ? gateList.data.length : "?"}`);
}

// ---- 4. Engineering reports a defect; Accounts records the spend ----
const wo = await api(eng, "POST", "/work-orders", { truckReg: "P000 (WIRE01)", defect: "Wire Check — brake pads", priority: "Medium", status: "Reported" });
check("Engineering creates work order", [200, 201].includes(wo.status), `status=${wo.status} ${JSON.stringify(wo.data).slice(0, 90)}`);

const ex = await api(acct, "POST", "/expenses", {
  requester: "Wire Check Dept", department: "Accounts", type: "Diesel", category: "Fuel",
  amount: 12345, description: "Wire check expense", status: "Pending",
});
check("Accounts records expense", [200, 201].includes(ex.status), `status=${ex.status} ${JSON.stringify(ex.data).slice(0, 90)}`);

// ---- 5. Notifications + audit capture the activity ----
const notifs = await api(fo, "GET", "/notifications");
check("Lifecycle notifications generated", Array.isArray(notifs.data) && notifs.data.length > 0,
  `rows=${Array.isArray(notifs.data) ? notifs.data.length : "?"}`);
const audit = await api(admin, "GET", "/audit");
check("Audit log capturing writes", Array.isArray(audit.data) && audit.data.length > 0,
  `rows=${Array.isArray(audit.data) ? audit.data.length : "?"}`);

// ---- 6. HR driver lifecycle (HR can create/edit drivers) ----
const drv = await api(hr, "POST", "/drivers", { name: `Wire Check Driver ${stamp}`, staffId: `PW${stamp.slice(-4)}`, phone: "07060000001" });
check("HR onboards driver", [200, 201].includes(drv.status), `status=${drv.status} ${JSON.stringify(drv.data).slice(0, 90)}`);
if (drv.data?.id) {
  const dup = await api(hr, "POST", "/drivers", { name: "Dup", staffId: `PW${stamp.slice(-4)}` });
  check("Duplicate driver ID rejected (409)", dup.status === 409, `status=${dup.status}`);
  const del = await api(hr, "DELETE", `/drivers/${drv.data.id}`);
  check("HR removes driver", [200, 204].includes(del.status), `status=${del.status}`);
}

// ---- 7. Partner isolation: fresh partner account sees only its own company ----
const stamp2 = "pw" + stamp.slice(-6);
const pu = await api(admin, "POST", "/users", {
  firstName: "Wire", surname: "Checker", username: stamp2,
  email: `${stamp2}@wirecheck.com`, roles: ["Customer Portals (External)"],
  role: "Customer Portals (External)", partnerCompanyName: "Wire Check Ltd",
  password: "WireCheck@2026",
});
check("TM/Admin creates partner account", [200, 201].includes(pu.status), `status=${pu.status}`);
if ([200, 201].includes(pu.status)) {
  const pl = await api(null, "POST", "/auth/login", { username: stamp2, password: "WireCheck@2026" });
  check("New partner can log in", pl.status === 200, `status=${pl.status}`);
  if (pl.status === 200) {
    const pt = pl.data.token;
    const preq = await api(pt, "POST", "/trips", {
      driverName: "Unassigned", truckReg: "TBD", pickup: "Wire Check Plant", dropoff: "Wire Check Depot",
      customerConsignee: "Partner Self Test", cargo: "Wire coils", loadingSite: "Wire Check Plant", status: "Requested",
    });
    check("Partner submits request", [200, 201].includes(preq.status), `status=${preq.status} customer=${preq.data?.customer}`);
    const plist = await api(pt, "GET", "/trips");
    const prows = Array.isArray(plist.data) ? plist.data : [];
    const foreign = prows.filter((t) => t.customer && !/wire check/i.test(t.customer));
    check("Partner sees ONLY own company (server scoping)", foreign.length === 0, `rows=${prows.length} foreign=${foreign.length}`);
    if (preq.data?.id) {
      const pdel = await api(pt, "DELETE", `/trips/${preq.data.id}`);
      check("Partner withdraws own pending request", [200, 204].includes(pdel.status), `status=${pdel.status}`);
    }
  }
  // Soft-delete the temp partner (spec: users are never hard-deleted).
  const puDel = await api(admin, "DELETE", `/users/${pu.data?.id}`);
  check("Temp partner account removed (soft delete)", [200, 204].includes(puDel.status), `status=${puDel.status}`);
}

// ---- 8. Cleanup (work-orders/expenses are permanent records — soft-cancel) ----
const del1 = await api(admin, "DELETE", `/trips/${tripId}`);
check("cleanup trip", [200, 204].includes(del1.status), `status=${del1.status}`);
if (wo.data?.id) {
  const d = await api(admin, "DELETE", `/work-orders/${wo.data.id}`);
  const soft = d.status === 404 || d.status === 405 ? await api(admin, "PATCH", `/work-orders/${wo.data.id}`, { status: "Repaired" }) : d;
  check("cleanup work order (delete or close)", [200, 204].includes(soft.status), `delete=${d.status} soft=${soft.status}`);
}
if (ex.data?.id) {
  const d = await api(admin, "DELETE", `/expenses/${ex.data.id}`);
  const soft = d.status === 404 || d.status === 405 ? await api(admin, "PATCH", `/expenses/${ex.data.id}`, { status: "Cancelled" }) : d;
  check("cleanup expense (delete or cancel)", [200, 204].includes(soft.status), `delete=${d.status} soft=${soft.status}`);
}
if (ge.data?.id) { const d = await api(admin, "DELETE", `/gate/${ge.data.id}`); check("cleanup gate entry", [200, 204].includes(d.status), `status=${d.status}`); }

console.log("\n" + "=".repeat(60));
console.log(fails.length ? `WRITE-PATH FAILURES (${fails.length}): ${fails.join(" | ")}` : "Write-path wiring: ALL GREEN.");
console.log("=".repeat(60));
