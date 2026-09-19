/**
 * Live check of the writes the new claim logic performs when a dispatch takes a
 * truck, a tail and a driver. One Available head and one Available driver are
 * moved to their held states and then put back exactly as they were.
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
  const token = login.payload.token;

  const heads = (await api(token, "GET", "/trucks")).payload;
  const tails = (await api(token, "GET", "/tails")).payload;
  const drivers = (await api(token, "GET", "/drivers")).payload;
  const count = (rows, status) => rows.filter((r) => r.status === status).length;
  console.log(
    "heads:", heads.length, "| Available:", count(heads, "Available"), "| Assigned:", count(heads, "Assigned"),
    "| Blocked:", count(heads, "Blocked"),
  );
  console.log("tails:", tails.length, "| Available:", count(tails, "Available"), "| Assigned:", count(tails, "Assigned"));
  console.log("drivers:", drivers.length, "| Available:", count(drivers, "Available"), "| On Trip:", count(drivers, "On Trip"));

  const head = heads.find((h) => h.status === "Available");
  if (head) {
    const claim = await api(token, "PATCH", `/trucks/${head.id}`, { status: "Assigned" });
    console.log("head -> Assigned:", claim.status, "| reads:", claim.payload?.status);
    const back = await api(token, "PATCH", `/trucks/${head.id}`, { status: head.status });
    console.log("head restored:", back.status, "| reads:", back.payload?.status);
  } else {
    console.log("no Available head to probe (nothing changed)");
  }

  const tail = tails.find((t) => t.status === "Available");
  if (tail) {
    const claim = await api(token, "PATCH", `/tails/${tail.id}`, { status: "Assigned" });
    console.log("tail -> Assigned:", claim.status, "| reads:", claim.payload?.status);
    const back = await api(token, "PATCH", `/tails/${tail.id}`, { status: tail.status });
    console.log("tail restored:", back.status, "| reads:", back.payload?.status);
  } else {
    console.log("no Available tail to probe (nothing changed)");
  }

  const driver = drivers.find((d) => d.status === "Available");
  if (driver) {
    const claim = await api(token, "PATCH", `/drivers/${driver.id}`, { status: "On Trip" });
    console.log("driver -> On Trip:", claim.status, "| reads:", claim.payload?.status);
    const back = await api(token, "PATCH", `/drivers/${driver.id}`, { status: driver.status });
    console.log("driver restored:", back.status, "| reads:", back.payload?.status);
  } else {
    console.log("no Available driver to probe (nothing changed)");
  }

  const after = (await api(token, "GET", "/trucks")).payload;
  console.log(
    count(after, "Available") === count(heads, "Available") && count(after, "Assigned") === count(heads, "Assigned")
      ? "CLEAN — fleet left exactly as found"
      : "CHECK — a head was left changed",
  );
})().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
