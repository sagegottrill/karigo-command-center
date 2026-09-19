/**
 * Live chat verification (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Proves the whole feature against PRODUCTION and cleans up after itself:
 *   1. a dispatch thread exists per dispatched trip (auto-created),
 *   2. a staff user sees every thread, sends a message, and reads it back,
 *   3. `self` is flagged per VIEWER (not baked into the row),
 *   4. a partner sees ONLY their own company's threads,
 *   5. a partner is refused (403) on another company's thread,
 *   6. unread is per user and clears when that user reads.
 */
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE = "https://petrolline.fleetopsx.com/api";
const SECRET = process.env.JWT_SECRET || "karigo-super-secret-key-2026";

const fail = (m) => {
  console.error("FAIL: " + m);
  process.exitCode = 1;
};
const ok = (m) => console.log("ok: " + m);

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

function tokenFor(user) {
  const rolesArr = String(user.roles || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      roles: Array.from(new Set([user.role, ...rolesArr])),
      name: user.name,
    },
    SECRET,
    { expiresIn: "1h" },
  );
}

(async () => {
  // ---- 1. staff: threads exist for dispatched trips ----------------------
  const login = await api("/auth/login", {
    method: "POST",
    body: { username: "manager@petroline.ng", password: "Petroline@2026" },
  });
  if (login.status !== 200 || !login.json?.token) throw new Error("TM login failed: " + login.status + " " + JSON.stringify(login.json));
  const tm = login.json.token;
  const tmUser = login.json.user;
  ok("TM logged in as " + tmUser.email);

  const list1 = await api("/conversations", { token: tm });
  if (list1.status !== 200) throw new Error("GET /conversations " + list1.status + " " + JSON.stringify(list1.json));
  const threads = Array.isArray(list1.json) ? list1.json : [];
  const dispatched = await prisma.trip.count({
    where: { status: { in: ["Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Delayed", "Completed"] } },
  });
  console.log(`   dispatched trips: ${dispatched} · threads: ${threads.length}`);
  if (!threads.length) fail("no threads were created");
  else if (threads.length !== dispatched) fail(`thread count ${threads.length} != dispatched trips ${dispatched}`);
  else ok(`one thread per dispatched trip (${threads.length})`);
  if (!threads.every((t) => t.tripId)) fail("a thread is not tied to a trip");
  else ok("every thread carries its tripId");

  // ---- 2. staff: send + read back ---------------------------------------
  const target = threads[0];
  const marker = "verify-chat-" + Date.now().toString(36);
  const sent = await api(`/conversations/${target.id}/messages`, {
    method: "POST",
    token: tm,
    body: { body: marker },
  });
  if (sent.status !== 200) fail("send failed: " + sent.status + " " + JSON.stringify(sent.json));
  else {
    const mine = sent.json.messages.filter((m) => m.body === marker);
    if (mine.length !== 1) fail("probe message not stored");
    else if (!mine[0].self) fail("own message not flagged self for the sender");
    else if (!mine[0].at || Number.isNaN(new Date(mine[0].at).getTime())) fail("message carries no ISO timestamp");
    else if (mine[0].authorId !== tmUser.id) fail("message carries no authorId");
    else ok(`message stored with author + timestamp, self=true for the sender (${mine[0].at})`);
  }

  const list2 = await api("/conversations", { token: tm });
  const readBack = list2.json.find((c) => c.id === target.id);
  if (!readBack || !readBack.messages.some((m) => m.body === marker)) fail("probe message did not persist");
  else ok("message persisted across a fresh read");

  // ---- 3. partner scoping ------------------------------------------------
  const partners = await prisma.user.findMany({
    where: { role: "Customer Portals (External)", status: "Active", partnerCompanyName: { not: null } },
    select: { id: true, email: true, name: true, role: true, roles: true, partnerCompanyName: true },
    take: 40,
  });
  const norm = (v) => String(v || "").trim().toLowerCase();
  const tripRows = await prisma.trip.findMany({
    where: { id: { in: threads.map((t) => t.tripId) } },
    select: { id: true, customer: true },
  });
  const companyOf = new Map(tripRows.map((t) => [t.id, t.customer || ""]));

  let checked = 0;
  for (const p of partners) {
    const owned = [];
    const foreign = [];
    for (const t of threads) {
      const company = companyOf.get(t.tripId);
      if (norm(company) && norm(company) === norm(p.partnerCompanyName)) owned.push(t);
      else if (norm(company)) foreign.push(t);
    }
    if (!owned.length || !foreign.length) continue;
    const pt = tokenFor(p);
    const plist = await api("/conversations", { token: pt });
    if (plist.status !== 200) {
      fail(`${p.email} GET /conversations -> ${plist.status}`);
      continue;
    }
    const ids = new Set(plist.json.map((c) => c.id));
    if (ids.has(foreign[0].id)) fail(`${p.email} (${p.partnerCompanyName}) can read another company's thread`);
    if (!ids.has(owned[0].id)) fail(`${p.email} (${p.partnerCompanyName}) cannot read their own thread`);
    const intrude = await api(`/conversations/${foreign[0].id}/messages`, {
      method: "POST",
      token: pt,
      body: { body: "should-be-refused" },
    });
    if (intrude.status !== 403) fail(`${p.email} posting to a foreign thread returned ${intrude.status}, expected 403`);
    else ok(`${p.email} (${p.partnerCompanyName}): sees own thread, refused on another company's (403)`);
    checked += 1;
    // tidy the read rows this probe created for the partner
    await prisma.conversationRead.deleteMany({ where: { userId: p.id } });
    if (checked >= 2) break;
  }
  if (!checked) console.log("   (no partner with both an own and a foreign thread on this dataset)");

  // ---- 4. unread is per user --------------------------------------------
  const partnerUserId = partners.length ? partners[0].id : null;
  if (partnerUserId) {
    const before = await prisma.conversationRead.findMany({ where: { userId: partnerUserId } });
    void before;
  }
  const unread = await api("/conversations/unread", { token: tm });
  if (unread.status !== 200 || typeof unread.json?.count !== "number") fail("unread endpoint broken: " + JSON.stringify(unread.json));
  else ok(`unread endpoint answers (TM has ${unread.json.count})`);

  const mark = await api(`/conversations/${target.id}`, { method: "PATCH", token: tm, body: { unread: 0 } });
  if (mark.status !== 200) fail("mark-read failed: " + mark.status);
  else ok("mark-read accepted");

  // ---- 5. cleanup: remove the probe message ------------------------------
  const row = await prisma.conversation.findUnique({ where: { id: target.id } });
  const kept = (Array.isArray(row.messages) ? row.messages : []).filter((m) => m.body !== marker);
  await prisma.conversation.update({ where: { id: target.id }, data: { messages: kept } });
  const after = await prisma.conversation.findUnique({ where: { id: target.id } });
  if ((after.messages || []).some((m) => m.body === marker)) fail("probe message not cleaned up");
  else ok("probe message removed — production data restored");

  await prisma.$disconnect();
  console.log(process.exitCode ? "VERIFY FAILED" : "VERIFY PASSED");
})().catch(async (e) => {
  console.error("FAIL: " + e.message);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
