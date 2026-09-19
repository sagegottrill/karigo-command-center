/**
 * Live check of the end of the cycle: a Completed trip must drop off the Tracking
 * Operations board (the shared active-dispatch buckets) and keep its return stamp.
 * Everything is restored afterwards.
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

const BUCKET_BY_STATUS = {
  Requested: "pending",
  Approved: "approved",
  "Awaiting Approval": "awaiting",
  Scheduled: "scheduled",
  Loaded: "inTransit",
  "En Route": "inTransit",
  Offloading: "inTransit",
  Returning: "inTransit",
  Delayed: "inTransit",
  Completed: "completed",
};
const ACTIVE_BUCKETS = ["scheduled", "inTransit"];
const onBoard = (t) =>
  t.status === "Stopped" ? false : ACTIVE_BUCKETS.includes(BUCKET_BY_STATUS[t.status] ?? "pending");

(async () => {
  const login = await api(null, "POST", "/auth/login", {
    username: "manager@petroline.ng",
    password: "Petroline@2026",
  });
  const token = login.payload.token;
  const list = await api(token, "GET", "/trips");
  const trips = Array.isArray(list.payload) ? list.payload : [];
  const target = trips.find((t) => t.status === "Loaded");
  if (!target) throw new Error("no Loaded trip to probe");

  const before = { status: target.status, eta: target.eta ?? null };
  console.log("probe:", target.id, "| before:", before, "| on board:", onBoard(target));

  const stamp = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const closed = await api(token, "PATCH", `/trips/${target.id}`, {
    status: "Completed",
    eta: stamp,
  });
  console.log("close ->", closed.status);

  const after = await api(token, "GET", "/trips");
  const fresh = (Array.isArray(after.payload) ? after.payload : []).find((t) => t.id === target.id);
  console.log("status:", fresh?.status, "| eta:", JSON.stringify(fresh?.eta));
  console.log(onBoard(fresh) ? "FAIL: still on the active board" : "PASS: left the active board");
  console.log(fresh?.eta ? "PASS: return stamp kept" : "FAIL: return stamp missing");

  const restore = await api(token, "PATCH", `/trips/${target.id}`, {
    status: before.status,
    eta: before.eta,
  });
  const back = await api(token, "GET", "/trips");
  const restored = (Array.isArray(back.payload) ? back.payload : []).find((t) => t.id === target.id);
  console.log("restored ->", restore.status, "|", restored?.status, "| eta:", JSON.stringify(restored?.eta));
})();
