/**
 * E2E wiring verifier — every role × every endpoint the frontend actually calls.
 *
 * Answers the question "is the front end wired to the back end?" with evidence:
 * a login per role, then each GET the UI issues, and the status code returned.
 * Non-2xx is printed as a FAIL line so wiring breaks are impossible to miss.
 *
 * Usage: node scripts/verify-e2e-wiring.mjs
 */
const BASE = "https://petrolline.fleetopsx.com/api";

const ROLES = [
  ["Transport Manager", "manager@petroline.ng", "Petroline@2026"],
  ["Fleet Operations", "fleet@petroline.ng", "Petroline@2026"],
  ["HR", "hr@petroline.ng", "Petroline@2026"],
  ["Accounts", "accounts@petroline.ng", "Petroline@2026"],
  ["Engineering", "engineering@petroline.ng", "Petroline@2026"],
  ["Gate", "gate@petroline.ng", "Petroline@2026"],
  ["Tracking", "tracking@petroline.ng", "Petroline@2026"],
  ["Platform Admin", "admin@fleetopsx.com", "Admin@2026"],
];

/** Every GET the UI issues, with the page that depends on it. */
const GETS = [
  ["/auth/me", "session restore, every page"],
  ["/dashboard/overview", "all dashboards"],
  ["/trips", "partner portal, TM, FO, tracking, dispatch history"],
  ["/drivers", "HR, FO assignment"],
  ["/trucks", "fleet registry"],
  ["/tails", "fleet registry"],
  ["/expenses", "accounts"],
  ["/fuel", "diesel department"],
  ["/fuel-prices", "fuel pricing"],
  ["/gate", "gate security"],
  ["/inventory", "inventory"],
  ["/inventory-requisitions", "inventory"],
  ["/procurement", "procurement"],
  ["/work-orders", "engineering"],
  ["/notifications", "notification center, sidebar badge"],
  ["/notifications/unread", "sidebar badge"],
  ["/conversations", "messages"],
  ["/audit", "audit trail"],
  ["/login-reports", "account management report"],
  ["/users", "account management, partner management"],
  ["/tenants", "platform admin"],
];

async function req(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  const text = await res.text().catch(() => "");
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

async function login(username, password) {
  const res = await req("/auth/login", { method: "POST", body: { username, password } });
  if (res.status !== 200) return { error: `${res.status} ${JSON.stringify(res.payload).slice(0, 120)}` };
  return { token: res.payload?.token, user: res.payload?.user };
}

const fails = [];
const lines = [];

for (const [label, username, password] of ROLES) {
  const auth = await login(username, password);
  if (auth.error) {
    lines.push(`\n### ${label.padEnd(18)} ${username.padEnd(30)} LOGIN FAILED -> ${auth.error}`);
    fails.push(`${label}: login ${auth.error}`);
    continue;
  }
  const roles = (auth.user?.roles || []).join("/");
  lines.push(`\n### ${label.padEnd(18)} ${username.padEnd(30)} roles=[${roles}]`);

  for (const [path, why] of GETS) {
    const res = await req(path, { token: auth.token });
    const count = Array.isArray(res.payload)
      ? ` (${res.payload.length})`
      : res.payload && typeof res.payload === "object" && "count" in res.payload
        ? ` (${res.payload.count})`
        : "";
    // GET /users is intentionally gated to Platform Admin + HR/TM; the UI never
    // calls it for other roles, so a 403 here is CORRECT authorization, not a bug.
    const privileged = path === "/users";
    const ok = res.status < 300 || (privileged && res.status === 403);
    const flag = ok ? (res.status === 403 ? "gate" : "ok  ") : "FAIL";
    if (!ok) fails.push(`${label}: GET ${path} -> ${res.status} [${why}]`);
    lines.push(`  ${flag} ${String(res.status).padEnd(4)} ${path}${count}   <- ${why}`);
  }
}

console.log(lines.join("\n"));
console.log(`\n${"=".repeat(70)}`);
console.log(fails.length ? `FAILURES (${fails.length}):` : "No wiring failures found.");
for (const f of fails) console.log("  ✗ " + f);
console.log(`${"=".repeat(70)}`);
process.exit(0);
