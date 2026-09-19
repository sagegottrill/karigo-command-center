/**
 * Live check: creating a partner account for a company with known loading
 * locations must leave that company holding them. The probe account is
 * hard-deleted afterwards (see cleanup note printed at the end).
 */
const BASE = "https://petrolline.fleetopsx.com/api";
const PROBE = "zz-site-probe";

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

  // The full legal name on purpose: the match is on the normalised prefix, so
  // "Petroline Transport Ltd" must seed the same list as "Petroline".
  const COMPANY = "Petroline Transport Ltd";

  const before = await api(token, "GET", `/partner-sites?company=${encodeURIComponent(COMPANY)}`);
  console.log(`${COMPANY} sites before:`, JSON.stringify(before.payload));

  const created = await api(token, "POST", "/users", {
    firstName: "Site",
    surname: "Probe",
    roles: ["Customer Portals (External)"],
    username: PROBE,
    email: `${PROBE}@petroline.com`,
    department: "External Partner",
    partnerCompanyName: COMPANY,
    password: "Probe@2026",
  });
  console.log("create ->", created.status);
  if (created.status >= 400) {
    console.log("body:", JSON.stringify(created.payload));
    return;
  }
  console.log("seededLoadingSites:", JSON.stringify(created.payload?.seededLoadingSites));

  const after = await api(token, "GET", `/partner-sites?company=${encodeURIComponent(COMPANY)}`);
  const sites = after.payload?.sites || [];
  console.log(`${COMPANY} sites after:`, JSON.stringify(sites));
  console.log(
    sites.length === 6 ? "PASS: the six loading locations are on the company" : "FAIL: sites not seeded",
  );
  console.log("\nCLEANUP NEEDED for user id:", created.payload?.id);
})();
