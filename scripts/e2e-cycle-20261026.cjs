/* E2E CYCLE PROBE — FleetOpsX live API, 26 Oct 2026.
 * Drives the real HTTPS endpoints the departments use, on throwaway rows only:
 *   partner-less internal request → TM approve (NO auto gate-out!) → schedule
 *   → second-trip double-dispatch REFUSED (409) → gate Log Out (stamps) →
 *   gate return closes only the moving dispatch → substring/truncated input
 *   refused → Scheduled trip NOT closed by a return.
 * Cleanup (users, trips, artifacts) runs separately on the VPS afterwards.
 */
const API = "https://api.fleetopsx.com";
const PASSWORD = "Cycle@2026";
const TRUCK = "E2E-CYCLE-TRUCK";
const DRIVER = "E2E Cycle Driver";
let pass = 0, fail = 0, trip1, trip2;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
};
async function login(email) {
  const r = await fetch(API + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j = await r.json();
  if (!r.ok) throw new Error("login " + email + ": " + (j.error || r.status));
  return { token: j.token, user: j.user || j.account };
}
async function call(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}
(async () => {
  console.log("== cycle users login ==");
  const tm = await login("e2e-cycle-tm@petrolline.fleetopsx.com");
  const gate = await login("e2e-cycle-gate@petrolline.fleetopsx.com");
  const fleet = await login("e2e-cycle-fleet@petrolline.fleetopsx.com");
  ok("TM login", !!tm.token); ok("Gate login", !!gate.token); ok("Fleet login", !!fleet.token);

  console.log("== 1. Fleet Ops raises the request ==");
  const created = await call(fleet.token, "POST", "/api/trips", {
    status: "Requested", truckReg: TRUCK, driverName: DRIVER,
    pickup: "Lagos Yard", dropoff: "E2E Drop Point", customer: "E2E Cycle Partner",
    cargo: "E2E cycle cargo", tailType: "Flatbed",
  });
  trip1 = created.json;
  ok("request created", created.status === 200 && !!trip1?.id, trip1?.id);
  ok("request enters as Requested", String(trip1?.status) === "Requested", String(trip1?.status));

  console.log("== 2. Transport Manager approves (Seen) — THE original bug surface ==");
  const approved = await call(tm.token, "PATCH", "/api/trips/" + trip1.id, { status: "Approved" });
  ok("approve accepted", approved.status === 200, "http " + approved.status);
  const t1 = approved.json;
  ok("approval does NOT auto-gate the truck", String(t1?.status) === "Approved", "status=" + String(t1?.status));
  ok("approval writes no departure stamp", !String(t1?.startTime || "").trim() && !String(t1?.gateOutBy || "").trim(), "startTime=" + JSON.stringify(t1?.startTime) + " gateOutBy=" + JSON.stringify(t1?.gateOutBy));

  console.log("== 3. TM schedules dispatch #1 ==");
  const sched = await call(tm.token, "PATCH", "/api/trips/" + trip1.id, { status: "Scheduled" });
  ok("schedule accepted", sched.status === 200, "http " + sched.status);
  ok("dispatch date stamped", !!sched.json?.dispatchedAt, "dispatchedAt=" + String(sched.json?.dispatchedAt || "").slice(0, 19));
  ok("truck not out of yard yet", !String(sched.json?.startTime || "").trim());

  console.log("== 4. DOUBLE-DISPATCH GUARD: second dispatch on the same rig ==");
  const created2 = await call(fleet.token, "POST", "/api/trips", {
    status: "Requested", truckReg: TRUCK, driverName: DRIVER,
    pickup: "Lagos Yard", dropoff: "E2E Drop Point 2", customer: "E2E Cycle Partner",
    cargo: "E2E cycle cargo 2", tailType: "Flatbed",
  });
  trip2 = created2.json;
  ok("second request created", created2.status === 200 && !!trip2?.id, trip2?.id);
  const sched2 = await call(tm.token, "PATCH", "/api/trips/" + trip2.id, { status: "Scheduled" });
  ok("double-dispatch REFUSED", sched2.status === 409, "http " + sched2.status + " — " + String(sched2.json?.error || "").slice(0, 120));

  console.log("== 5. Gate Log Out ==");
  const out = await call(gate.token, "PATCH", "/api/trips/" + trip1.id, { status: "En Route" });
  ok("gate log-out accepted", out.status === 200, "http " + out.status);
  ok("departure signed by the gate account", String(out.json?.gateOutBy) === "E2E Cycle Gate", "gateOutBy=" + String(out.json?.gateOutBy));
  ok("departure time stamped", !!String(out.json?.startTime || "").trim(), "startTime=" + String(out.json?.startTime || "").slice(0, 21));

  console.log("== 6. Gate return (real departure exists) ==");
  const ret = await call(gate.token, "POST", "/api/gate/return", { truck: TRUCK, confirmed: true });
  ok("return accepted", ret.status === 200, "http " + ret.status + " " + JSON.stringify(ret.json || {}).slice(0, 160));
  ok("return closed exactly the moving dispatch", ret.json?.dispatchClosed === 1, "dispatchClosed=" + JSON.stringify(ret.json?.dispatchClosed));
  ok("driver freed by the return", (ret.json?.driversFreed || []).includes(DRIVER), "driversFreed=" + JSON.stringify(ret.json?.driversFreed));

  console.log("== 7. Fragment input closes NOTHING (the substring bug) ==");
  const frag = await call(gate.token, "POST", "/api/gate/return", { truck: "TRUC", confirmed: true });
  ok("fragment return is a safe no-op", frag.json?.dispatchClosed === 0, "dispatchClosed=" + JSON.stringify(frag.json?.dispatchClosed));

  console.log("== 8. Now schedule dispatch 2 (rig is home — allowed) ==");
  const sched2Retry = await call(tm.token, "PATCH", "/api/trips/" + trip2.id, { status: "Scheduled" });
  ok("re-schedule allowed once the truck truly came home", sched2Retry.status === 200, "http " + sched2Retry.status);

  console.log("== 9. Scheduled dispatch 2 survives a gate return (RETURN-ONLY-MOVING) ==");
  const ret2 = await call(gate.token, "POST", "/api/gate/return", { truck: TRUCK, confirmed: true });
  ok("return does NOT close an unstarted dispatch", ret2.json?.dispatchClosed === 0, "dispatchClosed=" + JSON.stringify(ret2.json?.dispatchClosed));
  const after = await call(gate.token, "GET", "/api/trips/" + trip2.id);
  ok("trip 2 still open as Scheduled", String(after.json?.status) === "Scheduled", "status=" + String(after.json?.status));

  console.log(`\nCYCLE RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CYCLE CRASHED:", e.message); process.exit(2); });
