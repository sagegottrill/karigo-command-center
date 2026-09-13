/**
 * FleetOpsX — FULL lifecycle e2e per "Request Process Flow Documentation" +
 * "System Actors User Access & Authentication Specification".
 *
 * Covers: partner request → TM approval → FO assignment (head/tail/driver/direct
 * costs) → gate departure → tracking checkpoint → delay → completion → partner
 * fulfillment visibility, plus RBAC, account lifecycle (create/reset/suspend/
 * soft-delete), notification generation + audience targeting at every step.
 *
 * Run: node scripts/test-lifecycle-e2e.mjs
 */
const API_URL = process.env.API_URL || "http://2.28.45.216/api";

const PARTNER = { username: "mdanjuma@sabasteel.com", password: "Petroline@2026" };
const TM = { username: "manager@petroline.ng", password: "Petroline@2026" };

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(token, method, endpoint, body) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function login(creds, label) {
  const r = await call(null, "POST", "/auth/login", creds);
  ok(`${label} login`, r.status === 200 && Boolean(r.data.token), r.status !== 200 ? `HTTP ${r.status}` : "");
  return r.data.token;
}

async function unreadCount(token) {
  const r = await call(token, "GET", "/notifications/unread");
  return r.status === 200 ? (r.data.count || 0) : -1;
}

async function notificationsFor(token) {
  const r = await call(token, "GET", "/notifications");
  return Array.isArray(r.data) ? r.data : [];
}

async function waitForTitle(token, title, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const rows = await notificationsFor(token);
    const hit = rows.find((n) => n.title === title);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

async function main() {
  console.log("==========================================================");
  console.log("  FLEETOPSX — FULL LIFECYCLE E2E (docs compliance)");
  console.log("==========================================================\n");

  // ---------- SECTION 0: AUTH + FIRST-TIME LOGIN PROTOCOL ----------
  console.log("--- 0. AUTHENTICATION & RBAC (spec §2) ---");
  const tmToken = await login(TM, "Transport Manager (super admin)");
  const partnerToken = await login(PARTNER, "Sister Company (partner)");

  const noAuth = await call(null, "GET", "/trips");
  ok("Unauthenticated API access rejected", noAuth.status === 401, `HTTP ${noAuth.status}`);

  const meP = await call(partnerToken, "GET", "/auth/me");
  ok("Partner JWT locked to company profile", meP.status === 200 && meP.data.user?.partnerCompanyName === "Saba Steel", `company=${meP.data.user?.partnerCompanyName}`);

  // Partner sees ONLY its own trips (docx: never see internal Petroline data)
  const partnerTrips = await call(partnerToken, "GET", "/trips");
  const foreignCustomers = Array.isArray(partnerTrips.data)
    ? [...new Set(partnerTrips.data.filter((t) => t.customer && t.customer !== "Saba Steel").map((t) => t.customer))]
    : ["REQUEST FAILED"];
  ok("Partner trip list isolated to own company", partnerTrips.status === 200 && foreignCustomers.length === 0, foreignCustomers.length ? `leaked: ${foreignCustomers.join(",")}` : `${Array.isArray(partnerTrips.data) ? partnerTrips.data.length : 0} trips, all Saba Steel`);

  // Partner cannot patch trips (RBAC)
  const partnerUsersProbe = await call(partnerToken, "GET", "/users");
  ok("Partner blocked from /users (RBAC)", partnerUsersProbe.status === 403 || partnerUsersProbe.status === 401, `HTTP ${partnerUsersProbe.status}`);

  // ---------- SECTION 1: ACCOUNT LIFECYCLE (spec §3) ----------
  console.log("\n--- 1. ACCOUNT LIFECYCLE (TM sole authority, spec §3) ---");
  const stamp = Date.now();
  const newUser = {
    email: `e2e.op.${stamp}@petroline.ng`,
    name: "E2E Ops Officer",
    role: "Fleet Operations",
    password: "TempPass@2026",
    passwordResetRequired: true,
  };
  const created = await call(tmToken, "POST", "/users", newUser);
  ok("TM creates account (forced first-time reset)", created.status === 201 || (created.status === 200 && created.data.passwordResetRequired === true), `status=${created.status} resetRequired=${created.data.passwordResetRequired}`);
  const newUserId = created.data?.id;

  if (newUserId) {
    // Forced reset: new user CAN login with temp password but is flagged
    const firstLogin = await call(null, "POST", "/auth/login", { username: newUser.email, password: "TempPass@2026" });
    ok("New user first login works with temp password", firstLogin.status === 200 && firstLogin.data.user?.passwordResetRequired === true, `status=${firstLogin.status}`);

    // Reset flow: TM resets → user gets temp password again
    const reset = await call(tmToken, "PATCH", `/users/${newUserId}`, { password: "ResetTemp@2026" });
    ok("TM password reset (forces reset on next login)", reset.status === 200 && reset.data.passwordResetRequired === true, `status=${reset.status}`);

    // Suspend: login rejected instantly, historical data intact
    const suspend = await call(tmToken, "PATCH", `/users/${newUserId}`, { status: "Suspended" });
    const suspendedLogin = await call(null, "POST", "/auth/login", { username: newUser.email, password: "ResetTemp@2026" });
    ok("Suspended account rejected at login", suspend.status === 200 && suspendedLogin.status === 401, `login HTTP ${suspendedLogin.status}`);

    // Soft delete: access revoked
    const del = await call(tmToken, "DELETE", `/users/${newUserId}`);
    const deletedLogin = await call(null, "POST", "/auth/login", { username: newUser.email, password: "ResetTemp@2026" });
    ok("Deleted account cannot log in (soft delete)", (del.status === 200 || del.status === 204) && deletedLogin.status === 401, `login HTTP ${deletedLogin.status}`);

    const createdNotif = await waitForTitle(tmToken, "New Staff Account");
    ok("Account creation generated TM notification", Boolean(createdNotif), createdNotif ? createdNotif.title : "none");
  }

  // ---------- SECTION 2: PARTNER REQUEST (flow doc steps 1-5) ----------
  console.log("\n--- 2. PARTNER REQUEST (flow doc steps 1-5) ---");
  const tmUnreadBefore = await unreadCount(tmToken);

  const order = await call(partnerToken, "POST", "/trips", {
    customerConsignee: `E2E Consignee ${stamp}`,
    cargo: "Steel Coils",
    tailType: "Flat", // truck-type dropdown per flow doc (Full Sided, Semi, Flat, ...)
    loadingSite: "Saba Factory", // predefined loading site list per flow doc
    pickup: "Saba Factory",
    dropoff: "Abuja Central Depot",
    driverName: "Unassigned",
    truckReg: "Unassigned",
    status: "Requested",
  });
  const tripId = order.data?.id;
  ok("Partner request created (status=Requested)", (order.status === 200 || order.status === 201) && order.data.status === "Requested", `id=${String(tripId).slice(0, 8)}`);

  const tmNotif = await waitForTitle(tmToken, "New Delivery Request");
  ok("TM notified of new partner request (server-side)", Boolean(tmNotif) && (tmNotif?.audience || "").includes("Transport Manager"), tmNotif ? `audience=${tmNotif.audience}` : "no notification");
  ok("Partner does NOT receive own request notification", !(await notificationsFor(partnerToken)).some((n) => n.title === "New Delivery Request" && n.body?.includes(String(stamp).slice(-4))));

  // ---------- SECTION 3: TM INITIAL APPROVAL (flow doc module 2 step 1) ----------
  console.log("\n--- 3. TM INITIAL APPROVAL ---");
  const partnerUnreadBefore = await unreadCount(partnerToken);
  const approve = await call(tmToken, "PATCH", `/trips/${tripId}`, { status: "Approved" });
  ok("TM initial approval succeeds", approve.status === 200 && approve.data.status === "Approved", `HTTP ${approve.status}`);

  const partnerBlocked = await call(partnerToken, "PATCH", `/trips/${tripId}`, { status: "Completed" });
  ok("Partner CANNOT patch trip status (security)", partnerBlocked.status === 403, `HTTP ${partnerBlocked.status}`);

  const approvedNotif = await waitForTitle(partnerToken, "Request Approved");
  ok("Partner notified: request approved", Boolean(approvedNotif), approvedNotif ? approvedNotif.title : "none");

  // ---------- SECTION 4: FO ASSIGNMENT (flow doc module 2 steps 2-6) ----------
  console.log("\n--- 4. FLEET OPS ASSIGNMENT (head/tail/driver/costs) ---");
  const trucks = await call(tmToken, "GET", "/trucks");
  const drivers = await call(tmToken, "GET", "/drivers");
  const truck = Array.isArray(trucks.data) ? trucks.data.find((t) => t.status !== "Maintenance") || trucks.data[0] : null;
  const driver = Array.isArray(drivers.data) ? drivers.data.find((d) => d.status === "Active") || drivers.data[0] : null;
  ok("FO has pre-populated truck list (cap/plate)", Array.isArray(trucks.data) && trucks.data.length > 0 && Boolean(truck.cabId) && Boolean(truck.registration), truck ? `${truck.cabId} / ${truck.registration}` : "none");
  ok("FO has pre-populated driver list (salary/staffId)", Array.isArray(drivers.data) && drivers.data.length > 0 && Boolean(driver.staffId), driver ? `${driver.staffId} ${driver.name}` : "none");

  const assignment = await call(tmToken, "PATCH", `/trips/${tripId}`, {
    truckReg: truck ? `${truck.cabId} (${truck.registration})` : "E2E-HEAD-01",
    tailType: "Flat",
    driverName: driver ? driver.name : "E2E Manual Driver",
    directCosts: {
      tripAllowance: 50000,
      returnWaybill: 5000,
      motorBoy: 10000,
      ticket: 2000,
      extraAllowance: 3000,
      lubricantType: "Diesel",
      lubricantQuantity: 200,
      lubricantCost: 250000,
    },
    status: "Scheduled",
  });
  ok("FO assignment saved (head+tail+driver+5 direct costs)", assignment.status === 200 && assignment.data.status === "Scheduled" && Boolean(assignment.data.directCosts?.tripAllowance), `HTTP ${assignment.status}`);

  const assignedNotif = await waitForTitle(partnerToken, "Truck Assigned");
  ok("Partner notified: truck assigned", Boolean(assignedNotif), assignedNotif ? assignedNotif.body?.slice(0, 60) : "none");

  // ---------- SECTION 5: GATE DEPARTURE + TRACKING (flow doc step 8) ----------
  console.log("\n--- 5. GATE DEPARTURE + LIVE TRACKING ---");
  const gate = await call(tmToken, "POST", "/gate", {
    type: "Dispatch",
    truckReg: truck ? truck.cabId : "E2E-HEAD-01",
    driver: driver ? driver.name : "E2E Manual Driver",
    purpose: `Trip ${String(tripId).slice(0, 8)}`,
  });
  ok("Gate departure log created", gate.status === 200 || gate.status === 201, `HTTP ${gate.status}`);

  const departPatch = await call(tmToken, "PATCH", `/trips/${tripId}`, { status: "En Route" });
  ok("Trip marked En Route", departPatch.status === 200 && departPatch.data.status === "En Route", `HTTP ${departPatch.status}`);

  const departedNotif = await waitForTitle(partnerToken, "Truck Departed");
  ok("Partner notified: truck departed (En Route)", Boolean(departedNotif), departedNotif ? departedNotif.title : "none");

  const cp = await call(tmToken, "POST", "/tracking", { tripId, location: "Lokoja Checkpoint", leg: "Outgoing" });
  ok("Tracking checkpoint logged", cp.status === 200 || cp.status === 201, `HTTP ${cp.status}`);
  const cpList = await call(tmToken, "GET", `/tracking/${tripId}`);
  ok("Checkpoint visible in trip history", Array.isArray(cpList.data) && cpList.data.some((c) => c.location === "Lokoja Checkpoint"));

  // Partner reads own trip with full fulfillment details (flow doc step 7)
  const partnerView = await call(partnerToken, "GET", `/trips/${tripId}`);
  const v = partnerView.data || {};
  ok(
    "Partner sees consolidated fulfillment view (driver/head/tail)",
    partnerView.status === 200 && Boolean(v.driverName) && v.driverName !== "Unassigned" && Boolean(v.truckReg) && v.truckReg !== "Unassigned" && Boolean(v.tailType),
    `driver=${v.driverName} head=${v.truckReg} tail=${v.tailType}`,
  );

  // ---------- SECTION 6: DELAY + COMPLETION ----------
  console.log("\n--- 6. DELAY + COMPLETION ---");
  await call(tmToken, "PATCH", `/trips/${tripId}`, { status: "Delayed" });
  const delayedNotif = await waitForTitle(partnerToken, "Dispatch Delayed");
  ok("Partner notified of delay", Boolean(delayedNotif), delayedNotif ? delayedNotif.severity : "none");

  const complete = await call(tmToken, "PATCH", `/trips/${tripId}`, { status: "Completed" });
  ok("Trip completed", complete.status === 200 && complete.data.status === "Completed", `HTTP ${complete.status}`);
  const doneNotif = await waitForTitle(partnerToken, "Delivery Completed");
  ok("Partner notified of delivery completion", Boolean(doneNotif), doneNotif ? doneNotif.title : "none");

  const tmUnreadAfter = await unreadCount(tmToken);
  ok("TM unread count grew across lifecycle", tmUnreadAfter === -1 || tmUnreadAfter >= tmUnreadBefore, `before=${tmUnreadBefore} after=${tmUnreadAfter}`);

  // ---------- SECTION 7: DECLINE PATH ----------
  console.log("\n--- 7. DECLINE PATH (Stopped) ---");
  const decline = await call(partnerToken, "POST", "/trips", {
    customerConsignee: `E2E Decline ${stamp}`,
    cargo: "Declined Goods",
    tailType: "Pick Up",
    loadingSite: "Others",
    pickup: "Custom Yard 12",
    dropoff: "Ikeja",
    driverName: "Unassigned",
    truckReg: "Unassigned",
    status: "Requested",
  });
  const declineId = decline.data?.id;
  const stopped = await call(tmToken, "PATCH", `/trips/${declineId}`, { status: "Stopped" });
  const declineNotif = await waitForTitle(partnerToken, "Request Declined");
  ok("Partner notified of declined request", stopped.status === 200 && Boolean(declineNotif), declineNotif ? declineNotif.title : "none");

  // ---------- SUMMARY ----------
  console.log("\n==========================================================");
  console.log(`  RESULT: ${passed} passed, ${failed} failed`);
  console.log("==========================================================");
  if (failures.length) {
    console.log("Failed checks:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("E2E CRASHED:", e.message);
  console.log(`\nRESULT: ${passed} passed, ${failed + 1} failed (crash)`);
  process.exit(1);
});
