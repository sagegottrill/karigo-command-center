/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Three gaps, one pass:
 *
 *  1) LOADING SITES WERE GLOBAL. The request form offered one hardcoded list to
 *     every partner, so the yards Saba Steel loads from (Saba Factory, Ijesha,
 *     Babangida…) were shown to every other customer — and no partner could add
 *     its own. Sites now live on the partner COMPANY (User.loadingSites) and are
 *     read/written through /api/partner-sites. A partner sees its own list only,
 *     and a site typed into a request is collected onto that company's list.
 *
 *  2) TWO DEPARTMENTS, ONE TRUTH. Loading and Tracking both log loading, so the
 *     same site could be recorded twice with two timestamps. POST /api/tracking
 *     now returns the existing checkpoint instead of writing a duplicate, so the
 *     first person to mark a site loaded is the record and the second simply
 *     agrees with it.
 *
 *  3) MULTI-ROLE USERS MISSED NOTIFICATIONS. The audience filter joined every
 *     held role into ONE string ('A|B') and asked for a literal substring match,
 *     which no audience ever contains. Each role is now matched on its own.
 *
 * Idempotent: safe to re-run.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

const ROUTES = [
  "",
  "// --- PARTNER LOADING SITES ---",
  "// Each partner COMPANY keeps its own loading sites. The list used to be global,",
  "// so every partner saw Saba Steel's yards. Stored on the company's own user rows",
  "// ('|'-separated, because a site name may contain a comma) so every account of",
  "// one company shares ONE list — one source of truth, no per-login copies.",
  "const SITE_SEP = '|';",
  "function splitSites(raw) {",
  "  const list = [];",
  "  for (const part of String(raw || '').split(SITE_SEP)) {",
  "    const v = part.trim().replace(/\\s+/g, ' ');",
  "    if (v && !list.some((s) => s.toLowerCase() === v.toLowerCase())) list.push(v);",
  "  }",
  "  return list;",
  "}",
  "function joinSites(list) {",
  "  return list.join(SITE_SEP);",
  "}",
  "function siteKey(value) {",
  "  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');",
  "}",
  "async function readPartnerSites(company) {",
  "  if (!company) return [];",
  "  const rows = await prisma.$queryRawUnsafe('SELECT \"loadingSites\" FROM \"User\" WHERE \"partnerCompanyName\" ILIKE $1', company);",
  "  const merged = [];",
  "  for (const row of rows) {",
  "    for (const site of splitSites(row.loadingSites)) {",
  "      if (!merged.some((m) => m.toLowerCase() === site.toLowerCase())) merged.push(site);",
  "    }",
  "  }",
  "  return merged;",
  "}",
  "async function writePartnerSites(company, sites) {",
  "  if (!company) return;",
  "  await prisma.$executeRawUnsafe('UPDATE \"User\" SET \"loadingSites\" = $1 WHERE \"partnerCompanyName\" ILIKE $2', joinSites(sites), company);",
  "}",
  "async function addPartnerSites(company, names) {",
  "  if (!company) return [];",
  "  const sites = await readPartnerSites(company);",
  "  let changed = false;",
  "  for (const name of names) {",
  "    const v = String(name || '').trim().replace(/\\s+/g, ' ');",
  "    if (!v) continue;",
  "    if (!sites.some((s) => s.toLowerCase() === v.toLowerCase())) {",
  "      sites.push(v);",
  "      changed = true;",
  "    }",
  "  }",
  "  if (changed) await writePartnerSites(company, sites);",
  "  return sites;",
  "}",
  "/** Whose site list a call is about: a partner's own company, or one a manager names. */",
  "async function resolveSiteCompany(req) {",
  "  const own = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);",
  "  if (own) return own;",
  "  const held = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];",
  "  const canCurate = held.some((r) => ['Transport Manager', 'Platform Admin', 'HR'].includes(r));",
  "  if (!canCurate) return null;",
  "  const asked = String(req.query?.company || req.body?.company || '').trim();",
  "  return asked || null;",
  "}",
  "",
  "app.get('/api/partner-sites', authenticate, async (req, res) => {",
  "  try {",
  "    const company = await resolveSiteCompany(req);",
  "    if (!company) return res.json({ company: null, sites: [] });",
  "    res.json({ company, sites: await readPartnerSites(company) });",
  "  } catch (err) {",
  "    console.error('GET /api/partner-sites failed:', err?.message || err);",
  "    res.status(500).json({ error: 'Server error' });",
  "  }",
  "});",
  "",
  "app.post('/api/partner-sites', authenticate, async (req, res) => {",
  "  try {",
  "    const name = String(req.body?.name || '').trim().replace(/\\s+/g, ' ');",
  "    if (!name) return res.status(400).json({ error: 'A loading site name is required.' });",
  "    const company = await resolveSiteCompany(req);",
  "    if (!company) return res.status(400).json({ error: 'No partner company to attach this loading site to.' });",
  "    const before = await readPartnerSites(company);",
  "    const sites = await addPartnerSites(company, [name]);",
  "    res.json({ company, sites, added: sites.length !== before.length });",
  "  } catch (err) {",
  "    console.error('POST /api/partner-sites failed:', err?.message || err);",
  "    res.status(500).json({ error: 'Server error' });",
  "  }",
  "});",
  "",
  "app.delete('/api/partner-sites', authenticate, async (req, res) => {",
  "  try {",
  "    const name = String(req.query?.name || req.body?.name || '').trim();",
  "    const company = await resolveSiteCompany(req);",
  "    if (!company) return res.status(400).json({ error: 'No partner company to update.' });",
  "    const sites = (await readPartnerSites(company)).filter((s) => s.toLowerCase() !== name.toLowerCase());",
  "    await writePartnerSites(company, sites);",
  "    res.json({ company, sites });",
  "  } catch (err) {",
  "    console.error('DELETE /api/partner-sites failed:', err?.message || err);",
  "    res.status(500).json({ error: 'Server error' });",
  "  }",
  "});",
  "",
].join("\n");

(async () => {
  // --- 1) column ---------------------------------------------------------
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loadingSites" TEXT');
    console.log("ok: User.loadingSites column present");
    await prisma.$disconnect();
  } catch (e) {
    console.error("FAIL: could not add the column:", e.message);
    process.exit(1);
  }

  // --- 2) prisma schema --------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/loadingSites/.test(schema)) {
    console.log("ok: schema.prisma already has loadingSites");
  } else {
    const before = schema;
    schema = schema.replace(
      /(model User \{[\s\S]*?\n)(\})/,
      (m, head, tail) =>
        head +
        "  /// This partner company's own loading sites ('|'-separated).\n  loadingSites String?\n" +
        tail,
    );
    if (schema === before) {
      console.error("FAIL: could not find model User in schema.prisma");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model User gained loadingSites");
  }

  // --- 3) index.ts -------------------------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  const put = (from, to, label, replacement) => {
    if (!from.test(src)) {
      console.error(`FAIL: anchor not found -> ${label}`);
      process.exit(1);
    }
    src = src.replace(from, () => replacement);
    console.log(`ok: ${label}`);
  };

  const TRACKING_ANCHOR = "// --- TRACKING ---";
  if (src.includes("/api/partner-sites")) {
    console.log("ok: index.ts already serves /api/partner-sites");
  } else {
    put(/\/\/ --- TRACKING ---/, TRACKING_ANCHOR, "partner-site routes inserted", ROUTES + TRACKING_ANCHOR);
  }

  if (src.includes("'Security', 'Tracking', 'Loading'")) {
    console.log("ok: POST /api/tracking already allows Loading");
  } else {
    put(
      /authorize\('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking'\)/,
      "POST /api/tracking authorize",
      "POST /api/tracking allows the Loading department",
      "authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading')",
    );
  }

  // Duplicate checkpoints: the first person to mark a site loaded IS the record.
  if (src.includes("never a second row")) {
    console.log("ok: POST /api/tracking already de-duplicates");
  } else {
    put(
      /  const \{ tripId, location, leg \} = req\.body;\n  if \(!tripId \|\| !location \|\| !leg\) return res\.status\(400\)\.json\(\{ error: 'Missing required fields' \}\);\n  const checkpoint = await prisma\.trackingCheckpoint\.create\(\{\n    data: \{ tripId, location, leg \}\n  \}\);/,
      "POST /api/tracking body",
      "POST /api/tracking returns the existing checkpoint instead of a duplicate",
      [
        "  const { tripId, location, leg } = req.body;",
        "  if (!tripId || !location || !leg) return res.status(400).json({ error: 'Missing required fields' });",
        "  // Tracking AND Loading both log loading — one source of truth, never a second row.",
        "  const siteKeyOf = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');",
        "  const siblings = await prisma.trackingCheckpoint.findMany({ where: { tripId } });",
        "  const already = siblings.find(",
        "    (cp) => String(cp.leg).trim().toLowerCase() === String(leg).trim().toLowerCase() && siteKeyOf(cp.location) === siteKeyOf(location),",
        "  );",
        "  if (already) {",
        "    return res.json({ ...already, duplicate: true, loggedBy: already.loggedBy || null });",
        "  }",
        "  const checkpoint = await prisma.trackingCheckpoint.create({",
        "    data: { tripId, location, leg }",
        "  });",
      ].join("\n"),
    );
  }

  // A partner's typed-in site joins that company's list (so it is offered next time).
  if (src.includes("addPartnerSites(partnerName, splitSitesLess(data.loadingSite))")) {
    console.log("ok: POST /api/trips already collects new loading sites");
  } else {
    put(
      /  const trip = await prisma\.trip\.create\(\{ data \}\);/,
      "POST /api/trips create",
      "POST /api/trips collects a newly typed loading site onto the company list",
      [
        "  const trip = await prisma.trip.create({ data });",
        "  // Whatever the partner typed is now one of THEIR sites — offered next time.",
        "  if (isPartner && partnerName) {",
        "    void addPartnerSites(",
        "      partnerName,",
        "      String(data.loadingSite || '').split(/[;,|]/).map((s) => s.trim()).filter(Boolean),",
        "    ).catch(() => {});",
        "  }",
      ].join("\n"),
    );
  }

  // Loading must hear about a truck that is on its way to be loaded.
  if (src.includes("scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking,Loading'")) {
    console.log("ok: Scheduled notice already reaches Loading");
  } else {
    put(
      /scheduled for \$\{t\.dropoff\}\.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking'/,
      "Scheduled notice audience",
      "Truck Assigned notice reaches the Loading department",
      "scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking,Loading'",
    );
  }

  // A checkpoint is news for BOTH departments that write them: the loaders waiting
  // on the next site and Tracking. One record, both audiences.
  if (src.includes("recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking,Loading'")) {
    console.log("ok: checkpoint notice already reaches Loading");
  } else {
    put(
      /void notify\('Operations', 'New Location has been Logged', `Dispatch checkpoint recorded at \$\{location\} \(\$\{leg\}\)\.`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking'\);/,
      "checkpoint notice audience",
      "checkpoint notice reaches the Loading department",
      "void notify('Operations', 'New Location has been Logged', `Dispatch checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking,Loading');",
    );
  }

  // Multi-role users: match each held role on its own.
  if (src.includes("held.map((r) => ({ audience: { contains: r } }))")) {
    console.log("ok: notificationScope already matches per role");
  } else {
    put(
      /  const held = Array\.isArray\(req\.user\?\.roles\) \? req\.user\.roles : \[role\];\n  const rolePattern = held\.filter\(Boolean\)\.join\('\|'\);\n  return \{ OR: \[\{ audience: null \}, \{ audience: \{ contains: rolePattern \} \}\] \};/,
      "notificationScope multi-role",
      "notification audience matches each held role separately",
      [
        "  const held = (Array.isArray(req.user?.roles) ? req.user.roles : [role]).filter(Boolean);",
        "  // One OR per held role: joining them into 'A|B' asked the database for a",
        "  // literal 'A|B' substring, which no audience contains — multi-role staff",
        "  // silently missed every notification.",
        "  return { OR: [{ audience: null }, ...held.map((r) => ({ audience: { contains: r } }))] };",
      ].join("\n"),
    );
  }

  fs.writeFileSync(INDEX + ".bak-partner-sites", src);
  fs.writeFileSync(INDEX, src);
  console.log("ok: index.ts patched (backup: index.ts.bak-partner-sites)");

  // --- 4) backfill: no partner loses a site its own requests have used ------
  // Same separator rules the server now uses, kept local so this script does not
  // depend on the file it just rewrote.
  const splitSites = (raw) => {
    const list = [];
    for (const part of String(raw || "").split("|")) {
      const v = part.trim().replace(/\s+/g, " ");
      if (v && !list.some((s) => s.toLowerCase() === v.toLowerCase())) list.push(v);
    }
    return list;
  };
  const joinSites = (list) => list.join("|");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  // The yards the old global list came from belong to Saba Steel.
  const SABA_SEED = [
    "Comfortoboh",
    "Happy Home",
    "Ijesha.1",
    "Babangida.1",
    "Babangida.2",
    "Ijesha.2",
    "Babangida.3",
    "Metalberg.K",
    "Saba Factory",
  ];
  const users = await prisma.user.findMany({
    where: { role: "Customer Portals (External)" },
    select: { partnerCompanyName: true, email: true },
  });
  const companies = new Map();
  for (const u of users) {
    const company = (u.partnerCompanyName || "").trim();
    if (company && !companies.has(company.toLowerCase())) companies.set(company.toLowerCase(), company);
  }
  const readSites = async (company) => {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "loadingSites" FROM "User" WHERE "partnerCompanyName" ILIKE $1',
      company,
    );
    const merged = [];
    for (const row of rows) {
      for (const site of splitSites(row.loadingSites)) {
        if (!merged.some((m) => m.toLowerCase() === site.toLowerCase())) merged.push(site);
      }
    }
    return merged;
  };
  const writeSites = async (company, sites) => {
    await prisma.$executeRawUnsafe(
      'UPDATE "User" SET "loadingSites" = $1 WHERE "partnerCompanyName" ILIKE $2',
      joinSites(sites),
      company,
    );
  };
  let seeded = 0;
  for (const [key, company] of companies) {
    const trips = await prisma.trip.findMany({
      where: { customer: { equals: company, mode: "insensitive" } },
      select: { loadingSite: true, pickup: true },
    });
    const used = [];
    for (const t of trips) {
      for (const part of String(t.loadingSite || t.pickup || "").split(/[;,|]/)) {
        const v = part.trim();
        if (v && !used.some((u) => u.toLowerCase() === v.toLowerCase())) used.push(v);
      }
    }
    // Only Saba Steel gets the legacy global list — those are its own yards. A
    // site a partner's own request named but that belongs to the old shared list
    // (Saba Factory, Happy Home…) was never theirs, so it is not handed back to
    // them; a site NAMED after the company stays (Metalberg keeps "Metalberg.K").
    const companyKey = key.replace(/[^a-z0-9]+/g, "");
    const legacy = SABA_SEED.map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    const owned = used.filter((site) => {
      const norm = String(site).toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!legacy.includes(norm)) return true;
      return companyKey.length > 3 && norm.includes(companyKey.slice(0, 5));
    });
    const desired = key.includes("saba") ? [...SABA_SEED, ...used] : owned;
    const current = await readSites(company);
    const merged = current.slice();
    for (const site of desired) {
      if (!merged.some((m) => m.toLowerCase() === site.toLowerCase())) merged.push(site);
    }
    if (merged.length !== current.length) {
      await writeSites(company, merged);
      seeded += 1;
      console.log(`     ${company}: ${merged.length} site(s)`);
    }
  }
  console.log(`ok: seeded ${seeded} partner company site list(s)`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
