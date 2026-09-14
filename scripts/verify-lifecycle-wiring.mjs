/** Verify the full request lifecycle wiring against PRODUCTION as each role. */
const BASE = "https://petrolline.fleetopsx.com/api";

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const out = (label, value) => console.log(`${label}: ${value}`);

// --- 1. Login as partner (Musa) ---
const p = await api(null, "POST", "/auth/login", { username: "mdanjuma@sabasteel.com", password: "Petroline@2026" });
out("1. partner login", p.status === 200 ? `200 role=${p.data?.user?.role} partnerCompany=${p.data?.user?.partnerCompanyName}` : `${p.status} ${JSON.stringify(p.data)}`);
const pt = p.data?.token;
const partnerCompany = p.data?.user?.partnerCompanyName;

// --- 2. Partner submits a request (exactly what the UI sends) ---
const submitted = await api(pt, "POST", "/trips", {
  driverName: "Unassigned",
  truckReg: "TBD",
  tailType: "Flatbed",
  pickup: "Saba Factory",
  dropoff: "Abuja Depot",
  customerConsignee: "Lifecycle Test Consignee",
  cargo: "Test rods",
  loadingSite: "Saba Factory",
  status: "Requested",
});
out("2. partner submits request", `${submitted.status} id=${submitted.data?.id} status=${submitted.data?.status} customer=${submitted.data?.customer}`);
const testTripId = submitted.data?.id;

// --- 3. Partner sees their own request (server-side scoping + client filter) ---
const pList = await api(pt, "GET", "/trips");
const pVisible = Array.isArray(pList.data) ? pList.data.find((t) => t.id === testTripId) : null;
out("3. partner sees own request", pVisible ? `YES (status=${pVisible.status}, customer=${pVisible.customer})` : `NO — server list has ${Array.isArray(pList.data) ? pList.data.length : "?"} rows`);

// --- 4. TM sees it in Partner Requests (status Requested) ---
const tm = await api(null, "POST", "/auth/login", { username: "manager@petroline.ng", password: "Petroline@2026" });
const tmt = tm.data?.token;
out("4. TM login", tm.status === 200 ? "200" : `${tm.status} ${JSON.stringify(tm.data)}`);
const tmList = await api(tmt, "GET", "/trips");
const inPartnerRequests = Array.isArray(tmList.data) && tmList.data.some((t) => t.id === testTripId && t.status === "Requested");
out("5. TM sees it as Requested (Partner Requests queue)", inPartnerRequests ? "YES" : "NO");

// --- 5. TM initial approve (exactly what the UI sends: status -> Approved) ---
const approve1 = await api(tmt, "PATCH", `/trips/${testTripId}`, { status: "Approved" });
out("6. TM initial approve", `${approve1.status} status=${approve1.data?.status}`);

// --- 6. FO sees it in Dispatch queue (Requested/Approved/Awaiting) ---
const fo = await api(null, "POST", "/auth/login", { username: "fleet@petroline.ng", password: "Petroline@2026" });
const fot = fo.data?.token;
out("7. FO login", fo.status === 200 ? "200" : `${fo.status} ${JSON.stringify(fo.data)}`);
const foList = await api(fot, "GET", "/trips");
const inFoQueue = Array.isArray(foList.data) && foList.data.some((t) => t.id === testTripId && ["Requested", "Approved"].includes(t.status));
out("8. FO sees it in dispatch queue", inFoQueue ? "YES" : "NO");

// --- 7. FO assigns truck/driver + costs (exactly what Confirm Dispatch PATCHes) ---
const assign = await api(fot, "PATCH", `/trips/${testTripId}`, {
  driverName: "Test Driver",
  truckReg: "TRK-001 / Flat-01",
  tailType: "Flatbed",
  tailNumber: "Flat-01",
  status: "Awaiting Approval",
  directCosts: { tripAllowance: 1000 },
});
out("9. FO assigns (Confirm Dispatch)", `${assign.status} status=${assign.data?.status} driver=${assign.data?.driverName}`);

// --- 8. TM sees it in Fleet Dispatch Requests (Awaiting Approval + assigned) ---
const tmList2 = await api(tmt, "GET", "/trips");
const tmTrip = Array.isArray(tmList2.data) ? tmList2.data.find((t) => t.id === testTripId) : null;
const visibleToFleet = tmTrip && tmTrip.status === "Awaiting Approval" && Boolean(tmTrip.driverName || tmTrip.truckReg);
out("10. TM sees assigned trip in Fleet Dispatch Requests", visibleToFleet ? "YES" : `NO (status=${tmTrip?.status})`);

// --- 9. TM final approve -> Scheduled ---
const approve2 = await api(tmt, "PATCH", `/trips/${testTripId}`, { status: "Scheduled" });
out("11. TM final approve", `${approve2.status} status=${approve2.data?.status}`);

// --- 10. Partner sees it as Approved/In-transit in their dashboard ---
const pList2 = await api(pt, "GET", "/trips");
const pTrip2 = Array.isArray(pList2.data) ? pList2.data.find((t) => t.id === testTripId) : null;
out("12. partner still sees own request (now Scheduled)", pTrip2 ? `YES (status=${pTrip2.status})` : "NO");

// --- 11. Cleanup: remove the test trip ---
if (testTripId) {
  const admin = await api(null, "POST", "/auth/login", { username: "admin@fleetopsx.com", password: "Admin@2026" });
  const del = await api(admin.data?.token, "DELETE", `/trips/${testTripId}`);
  out("13. cleanup test trip", del.status === 204 || del.status === 200 ? "deleted" : `${del.status}`);
}
