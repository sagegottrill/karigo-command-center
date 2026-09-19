/**
 * Live check: does the API carry the Transport Manager's trip DURATION in days?
 * Writes a probe estimatedDays on one trip, reads it back, then restores the
 * previous value so no real dispatch is left altered.
 */
const BASE = "https://petrolline.fleetopsx.com/api";

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: res.status, payload };
}

(async () => {
  const login = await api(null, "POST", "/auth/login", {
    username: "manager@petroline.ng",
    password: "Petroline@2026",
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  const token = login.payload.token;

  const list = await api(token, "GET", "/trips");
  const trips = Array.isArray(list.payload) ? list.payload : list.payload?.data || [];
  console.log("trips:", trips.length, "| keys carry estimatedDays:", "estimatedDays" in (trips[0] || {}));

  const target = trips.find((t) => t.status === "Scheduled") || trips[0];
  if (!target) throw new Error("no trips to probe");
  const previous = target.estimatedDays ?? null;
  console.log(
    "probe trip:",
    String(target.id).slice(0, 8),
    "| status:",
    target.status,
    "| previous estimatedDays:",
    previous,
  );

  const write = await api(token, "PATCH", `/trips/${target.id}`, { estimatedDays: 4 });
  console.log("PATCH estimatedDays=4 ->", write.status, JSON.stringify(write.payload)?.slice(0, 120));

  const after = await api(token, "GET", "/trips");
  const rows = Array.isArray(after.payload) ? after.payload : after.payload?.data || [];
  const row = rows.find((t) => t.id === target.id);
  console.log("read back:", row?.estimatedDays, Number(row?.estimatedDays) === 4 ? "(MATCH)" : "(MISMATCH)");

  const revert = await api(token, "PATCH", `/trips/${target.id}`, { estimatedDays: previous });
  const final = await api(token, "GET", "/trips");
  const rows2 = Array.isArray(final.payload) ? final.payload : final.payload?.data || [];
  const row2 = rows2.find((t) => t.id === target.id);
  const restored = (row2?.estimatedDays ?? null) === previous;
  console.log("revert ->", revert.status, "| restored:", row2?.estimatedDays, restored ? "(CLEAN)" : "(CHECK)");
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
