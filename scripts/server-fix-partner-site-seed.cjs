/**
 * One-shot correction on the Hetzner box (inside /var/www/fleetopsx-api).
 *
 * The first pass seeded every partner with the loading sites its OWN past
 * requests used — which, because the list used to be global, leaked Saba Steel's
 * yards (Saba Factory, Happy Home, Babangida…) onto other companies. Those names
 * were never theirs; they were inherited from a list they could not escape.
 *
 * This pass takes the shared legacy names back off every company except Saba
 * Steel, with one exception: a site that is NAMED after the company (Metalberg
 * keeps "Metalberg.K") stays. Everything a partner genuinely typed itself is
 * untouched — nothing of their own is ever removed.
 *
 * Idempotent.
 */
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

const normalize = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const splitSites = (raw) => {
  const list = [];
  for (const part of String(raw || "").split("|")) {
    const v = part.trim().replace(/\s+/g, " ");
    if (v && !list.some((s) => s.toLowerCase() === v.toLowerCase())) list.push(v);
  }
  return list;
};

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: { role: "Customer Portals (External)" },
    select: { partnerCompanyName: true },
  });
  const companies = [];
  for (const u of users) {
    const c = (u.partnerCompanyName || "").trim();
    if (c && !companies.some((x) => x.toLowerCase() === c.toLowerCase())) companies.push(c);
  }

  const legacy = SABA_SEED.map(normalize);
  let changed = 0;

  for (const company of companies) {
    if (normalize(company).includes("saba")) continue;
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "loadingSites" FROM "User" WHERE "partnerCompanyName" ILIKE $1',
      company,
    );
    const current = [];
    for (const row of rows) {
      for (const site of splitSites(row.loadingSites)) {
        if (!current.some((s) => s.toLowerCase() === site.toLowerCase())) current.push(site);
      }
    }
    // A company owns its name: "Metalberg.K" belongs to Metalberg.
    const companyKey = normalize(company);
    const firstToken = normalize(company).slice(0, 6);
    const keep = current.filter((site) => {
      const key = normalize(site);
      if (!legacy.includes(key)) return true;
      return (companyKey.length > 3 && key.includes(companyKey.slice(0, 5))) ||
        (firstToken.length > 3 && key.includes(firstToken));
    });
    if (keep.length !== current.length) {
      await prisma.$executeRawUnsafe(
        'UPDATE "User" SET "loadingSites" = $1 WHERE "partnerCompanyName" ILIKE $2',
        keep.join("|"),
        company,
      );
      changed += 1;
      const dropped = current.filter((s) => !keep.includes(s));
      console.log(`${company}: dropped ${dropped.join(", ") || "nothing"} — now: ${keep.join(", ") || "(none)"}`);
    } else {
      console.log(`${company}: unchanged`);
    }
  }
  console.log(`ok: corrected ${changed} company list(s)`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
