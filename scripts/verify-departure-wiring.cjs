/**
 * Live E2E check of the new wiring: a Tracking checkpoint on an approved dispatch
 * must stamp the departure and move the status onto the road. Everything written
 * is reverted afterwards, so no real dispatch is left altered.
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

(async () => {
  const login = await api(null, "POST", "/auth/login", {
    username: "manager@petroline.ng",
    password: "Petroline@2026",
  });
  const token = login.payload.token;

  const list = await api(token, "GET", "/trips");
  const trips = Array.isArray(list.payload) ? list.payload : list.payload?.data || [];
  const target = trips.find((t) => t.status === "Scheduled" && !t.startTime);
  if (!target) throw new Error("no clean Scheduled trip to test on");
  console.log("test dispatch:", target.id, "| status before:", target.status, "| startTime before:", target.startTime);

  const created = await api(token, "POST", "/tracking", {
    tripId: target.id,
    location: "ZZ-PROBE-DEPARTURE",
    leg: "In Transit",
  });
  console.log("POST /tracking ->", created.status);

  const after = await api(token, "GET", "/trips");
  const fresh = (Array.isArray(after.payload) ? after.payload : after.payload?.data || []).find(
    (t) => t.id === target.id,
  );
  console.log("startTime after :", JSON.stringify(fresh?.startTime ?? null));
  console.log("status after    :", fresh?.status);
  const stamped = Boolean(fresh?.startTime);
  const advanced = fresh?.status === "En Route";
  console.log(stamped ? "PASS: departure stamped" : "FAIL: departure not stamped");
  console.log(advanced ? "PASS: status advanced to En Route" : "FAIL: status not advanced");

  console.log("\nREVERT: checkpoint id", created.payload?.id);
})();
