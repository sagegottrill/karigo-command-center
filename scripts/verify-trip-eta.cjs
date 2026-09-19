/** Live check: does the return stamp (eta) survive a PATCH now? */
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
  const trips = Array.isArray(list.payload) ? list.payload : [];
  const target = trips.find((t) => ["Loaded", "En Route"].includes(t.status));
  if (!target) throw new Error("no on-road trip to probe");
  console.log("probe trip:", target.id, "| status:", target.status, "| eta before:", JSON.stringify(target.eta));

  const stamp = new Date().toISOString();
  const patch = await api(token, "PATCH", `/trips/${target.id}`, { eta: stamp });
  console.log("PATCH eta ->", patch.status);

  const after = await api(token, "GET", "/trips");
  const fresh = (Array.isArray(after.payload) ? after.payload : []).find((t) => t.id === target.id);
  console.log("eta read back:", JSON.stringify(fresh?.eta));
  console.log(fresh?.eta === stamp ? "PASS: return stamp persisted" : "FAIL: return stamp dropped");
  console.log("status untouched:", fresh?.status);

  const restore = await api(token, "PATCH", `/trips/${target.id}`, { eta: target.eta ?? null });
  console.log("restore ->", restore.status);
})();
