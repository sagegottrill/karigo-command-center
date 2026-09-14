/** E2E: new partner create → login → self password change → request with correct company. */
const BASE = "https://petrolline.fleetopsx.com/api";
const rand = Math.random().toString(36).slice(2, 8);

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

// --- TM creates a partner account with a REAL company name (as Add Partner does) ---
const tm = await api(null, "POST", "/auth/login", { username: "manager@petroline.ng", password: "Petroline@2026" });
const tmt = tm.data?.token;
const company = `Zenith Cements ${rand}`;
const username = `z.cement${rand.slice(0, 4)}`;
const tempPassword = "TmpTest123!";
const created = await api(tmt, "POST", "/users", {
  firstName: "Ngozi", surname: "Eze", roles: ["Customer Portals (External)"],
  username, email: `${username}@zenithcements.com`, password: tempPassword,
  partnerCompanyName: company, companyId: "tnt_001",
});
out("1. TM creates partner", `${created.status} ${created.status === 200 ? `company=${created.data?.partnerCompanyName}` : JSON.stringify(created.data)}`);

// --- Partner logs in with temp password (reset flag required) ---
const login1 = await api(null, "POST", "/auth/login", { username, password: tempPassword });
out("2. partner login (temp pw)", `${login1.status} resetRequired=${login1.data?.user?.passwordResetRequired} company=${login1.data?.user?.partnerCompanyName}`);
const pt = login1.data?.token;

// --- Partner changes OWN password (was 403-loop before) ---
const pwFail = await api(pt, "PATCH", "/users/me/password", { currentPassword: "WrongOld1!", newPassword: "BrandNew@2026" });
out("3. wrong current password rejected", `${pwFail.status} ${pwFail.status === 400 ? `(${pwFail.data?.error})` : "UNEXPECTED"}`);
const pwOk = await api(pt, "PATCH", "/users/me/password", { currentPassword: tempPassword, newPassword: "BrandNew@2026" });
out("4. self password change", `${pwOk.status} ${pwOk.status === 200 ? "OK" : JSON.stringify(pwOk.data)}`);

// --- Old password must now fail; new one must work ---
const oldTry = await api(null, "POST", "/auth/login", { username, password: tempPassword });
const newTry = await api(null, "POST", "/auth/login", { username, password: "BrandNew@2026" });
out("5. old pw rejected / new pw works", `${oldTry.status} / ${newTry.status}${newTry.status === 200 ? ` (resetRequired=${newTry.data?.user?.passwordResetRequired})` : ""}`);
const pt2 = newTry.data?.token;

// --- Partner submits request; company must be the REAL name, not domain-derived ---
const submit = await api(pt2, "POST", "/trips", {
  driverName: "Unassigned", truckReg: "TBD", tailType: "Tipper",
  pickup: "Zenith Quarry", dropoff: "Abuja Depot",
  customerConsignee: "BuildRight Ltd", cargo: "Cement bags",
  loadingSite: "Zenith Quarry", status: "Requested",
});
const tripId = submit.data?.id;
out("6. partner submits request", `${submit.status} customer=${submit.data?.customer} (expect: ${company})`);
out("7. correct customer stamping", submit.data?.customer === company ? "YES" : "NO — WRONG");

// --- Partner sees it on dashboard ---
const pList = await api(pt2, "GET", "/trips");
const seen = Array.isArray(pList.data) ? pList.data.find((t) => t.id === tripId) : null;
out("8. partner sees own request", seen ? `YES (${seen.status}, customer=${seen.customer})` : "NO");

// --- TM sees it in Partner Requests ---
const tmList = await api(tmt, "GET", "/trips");
const tmSees = Array.isArray(tmList.data) ? tmList.data.find((t) => t.id === tripId) : null;
out("9. TM sees it (Requested)", tmSees ? "YES" : "NO");

// --- TM approves → FO notification audience must include Fleet Operations ---
const approve = await api(tmt, "PATCH", `/trips/${tripId}`, { status: "Approved" });
out("10. TM approves", `${approve.status} status=${approve.data?.status}`);
const fo = await api(null, "POST", "/auth/login", { username: "fleet@petroline.ng", password: "Petroline@2026" });
const foNotifs = await api(fo.data?.token, "GET", "/notifications");
const foGotIt = Array.isArray(foNotifs.data) ? foNotifs.data.some((n) => String(n.body || "").includes(tripId.slice(0, 8))) : false;
out("11. FO notification for approval", foGotIt ? "YES" : `NO (${Array.isArray(foNotifs.data) ? foNotifs.data.length + " notifications" : foNotifs.status})`);

// --- Partner still sees it after approval (status changed) ---
const pList2 = await api(pt2, "GET", "/trips");
const seen2 = Array.isArray(pList2.data) ? pList2.data.find((t) => t.id === tripId) : null;
out("12. partner sees approved request", seen2 ? `YES (${seen2.status})` : "NO");

// --- Cleanup: delete test trip + test user ---
const admin = await api(null, "POST", "/auth/login", { username: "admin@fleetopsx.com", password: "Admin@2026" });
const delTrip = await api(admin.data?.token, "DELETE", `/trips/${tripId}`);
const users = await api(admin.data?.token, "GET", "/users");
const testUser = Array.isArray(users.data) ? users.data.find((u) => u.username === username) : null;
const delUser = testUser ? await api(admin.data?.token, "DELETE", `/users/${testUser.id}`) : { status: "n/a" };
out("13. cleanup", `trip=${delTrip.status} user=${delUser.status}`);
