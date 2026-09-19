/**
 * Live check of the new fleet management backend paths.
 * Creates a throwaway head and tail, edits one, blocks it, then deletes both —
 * leaving the fleet exactly as it was found.
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

const login = async (username, password) => {
  const res = await api(null, "POST", "/auth/login", { username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status}`);
  return res.payload.token;
};

(async () => {
  const tm = await login("manager@petroline.ng", "Petroline@2026");
  const fo = await login("fleet@petroline.ng", "Petroline@2026");

  const before = await api(tm, "GET", "/trucks");
  const beforeTails = await api(tm, "GET", "/tails");
  console.log("fleet before:", before.payload.length, "heads /", beforeTails.payload.length, "tails");

  // --- add a head ---------------------------------------------------------
  const created = await api(tm, "POST", "/trucks", {
    cabId: "PZZ9",
    registration: "ZZZ999ZZ",
    category: "LOCAL",
    destination: "Depot",
    status: "Available",
  });
  console.log("POST /trucks ->", created.status, created.status === 200 ? "(added)" : JSON.stringify(created.payload));
  if (created.status !== 200) throw new Error("TM could not add a head");
  const headId = created.payload.id;

  // --- edit it ------------------------------------------------------------
  const edited = await api(tm, "PATCH", `/trucks/${headId}`, {
    cabId: "PZZ9",
    registration: "ZZZ999ZZ",
    category: "UPCOUNTRY",
    destination: "Port",
    status: "Maintenance",
  });
  console.log("PATCH /trucks/:id ->", edited.status, "| category now:", edited.payload?.category, "| location:", edited.payload?.destination);

  // --- block it -----------------------------------------------------------
  const blocked = await api(tm, "PATCH", `/trucks/${headId}`, { status: "Blocked" });
  console.log("PATCH status Blocked ->", blocked.status, "| reads:", blocked.payload?.status);

  // --- a duplicate number must be refused ---------------------------------
  const dup = await api(tm, "POST", "/trucks", { cabId: "PZZ9", registration: "OTHER", status: "Available" });
  console.log("duplicate cap ->", dup.status, dup.status === 409 || dup.status === 400 ? "(refused as expected)" : "(UNEXPECTED)");

  // --- Fleet Ops must NOT be able to add or delete ------------------------
  const foCreate = await api(fo, "POST", "/trucks", { cabId: "PFO1", registration: "FOO111", status: "Available" });
  console.log("Fleet Ops POST /trucks ->", foCreate.status, foCreate.status === 403 ? "(refused as expected)" : "(UNEXPECTED)");
  const foDelete = await api(fo, "DELETE", `/trucks/${headId}`);
  console.log("Fleet Ops DELETE /trucks/:id ->", foDelete.status, foDelete.status === 403 ? "(refused as expected)" : "(UNEXPECTED)");

  // --- tail: add + delete -------------------------------------------------
  const tail = await api(tm, "POST", "/tails", { number: "BZZ9", type: "Flatbed Tail", status: "Available" });
  console.log("POST /tails ->", tail.status, tail.status === 200 ? "(added)" : JSON.stringify(tail.payload));
  if (tail.status === 200) {
    const tailPatch = await api(tm, "PATCH", `/tails/${tail.payload.id}`, { type: "Side Guide", destination: "Customer" });
    console.log("PATCH /tails/:id ->", tailPatch.status, "| body:", tailPatch.payload?.type, "| location:", tailPatch.payload?.destination);
    const tailDel = await api(tm, "DELETE", `/tails/${tail.payload.id}`);
    console.log("DELETE /tails/:id ->", tailDel.status);
  }

  // --- clean up the head --------------------------------------------------
  const del = await api(tm, "DELETE", `/trucks/${headId}`);
  console.log("DELETE /trucks/:id ->", del.status);

  const after = await api(tm, "GET", "/trucks");
  const afterTails = await api(tm, "GET", "/tails");
  console.log("fleet after:", after.payload.length, "heads /", afterTails.payload.length, "tails");
  console.log(
    before.payload.length === after.payload.length && beforeTails.payload.length === afterTails.payload.length
      ? "CLEAN — fleet left exactly as found"
      : "CHECK — counts differ, inspect leftovers",
  );
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
