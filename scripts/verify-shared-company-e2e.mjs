/** E2E: two accounts, one company ("Saba Steel" vs "saba steel") share ONE dashboard. */
const BASE = "https://petrolline.fleetopsx.com/api";
const rand = Math.random().toString(36).slice(2, 6);

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const out = (l, v) => console.log(`${l}: ${v}`);

// Musa (existing Saba Steel account) logs in
const musa = await api(null, "POST", "/auth/login", { username: "mdanjuma@sabasteel.com", password: "Petroline@2026" });
out("1. Musa login", musa.status === 200 ? `200 company=${musa.data?.user?.partnerCompanyName}` : `${musa.status}`);
const musaToken = musa.data?.token;

// TM creates a SECOND account for the same company, typed differently ("saba steel")
const tm = await api(null, "POST", "/auth/login", { username: "manager@petroline.ng", password: "Petroline@2026" });
const username = `f.bello${rand}`;
const created = await api(tm.data?.token, "POST", "/users", {
  firstName: "Fatima", surname: "Bello", roles: ["Customer Portals (External)"],
  username, email: `${username}@sabasteel.com`, password: "TmpFatima1!",
  partnerCompanyName: "saba steel", companyId: "tnt_001",
});
out("2. TM creates 2nd 'saba steel' account", `${created.status} storedAs="${created.data?.partnerCompanyName}" (should canonicalize to "Saba Steel")`);
const fatimaCompany = created.data?.partnerCompanyName;

// Fatima logs in with temp password, changes it
const f1 = await api(null, "POST", "/auth/login", { username, password: "TmpFatima1!" });
out("3. Fatima temp login", `${f1.status} company=${f1.data?.user?.partnerCompanyName}`);
await api(f1.data?.token, "PATCH", "/users/me/password", { currentPassword: "TmpFatima1!", newPassword: "FatimaNew1!" });
const f2 = await api(null, "POST", "/auth/login", { username, password: "FatimaNew1!" });
const fatimaToken = f2.data?.token;
out("4. Fatima new-password login", f2.status === 200 ? "200" : `${f2.status}`);

// Fatima submits a request
const trip = await api(fatimaToken, "POST", "/trips", {
  driverName: "Unassigned", truckReg: "TBD", tailType: "Flatbed",
  pickup: "Saba Factory", dropoff: "Lagos Port",
  customerConsignee: "Shared Dashboard Test", cargo: "steel coils",
  loadingSite: "Saba Factory", status: "Requested",
});
out("5. Fatima submits request", `${trip.status} stampedAs="${trip.data?.customer}"`);
const tripId = trip.data?.id;

// Musa MUST see Fatima's request (shared company dashboard)
const musaList = await api(musaToken, "GET", "/trips");
const musaSees = Array.isArray(musaList.data) ? musaList.data.find((t) => t.id === tripId) : null;
out("6. Musa sees Fatima's request", musaSees ? "YES" : `NO (${Array.isArray(musaList.data) ? musaList.data.length + " rows" : musaList.status})`);

// Fatima MUST see Musa's pre-existing requests (case-insensitive scope)
const fatimaList = await api(fatimaToken, "GET", "/trips");
const fatimaCount = Array.isArray(fatimaList.data) ? fatimaList.data.length : -1;
const fatimaSeesShared = Array.isArray(fatimaList.data) && fatimaList.data.some((t) => t.id !== tripId);
out("7. Fatima sees company's other requests", fatimaCount > 1 ? `YES (${fatimaCount} rows)` : `NO (${fatimaCount} rows)`);

// TM still sees it for approval
const tmList = await api(tm.data?.token, "GET", "/trips");
const tmSees = Array.isArray(tmList.data) ? tmList.data.some((t) => t.id === tripId) : false;
out("8. TM sees it", tmSees ? "YES" : "NO");

// Cleanup
const admin = await api(null, "POST", "/auth/login", { username: "admin@fleetopsx.com", password: "Admin@2026" });
const delTrip = await api(admin.data?.token, "DELETE", `/trips/${tripId}`);
const users = await api(admin.data?.token, "GET", "/users");
const testUser = Array.isArray(users.data) ? users.data.find((u) => u.username === username) : null;
const delUser = testUser ? await api(admin.data?.token, "DELETE", `/users/${testUser.id}`) : { status: "n/a" };
out("9. cleanup", `trip=${delTrip.status} user=${delUser.status}`);
