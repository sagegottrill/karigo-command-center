/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * A new partner company started with an EMPTY loading-site list, so the person
 * creating a request had to type every yard by hand the first time — and the
 * loading locations a company works from are known before the account exists.
 *
 * Creating a partner account for one of the companies below now gives that
 * company its loading locations straight away: the same list the request form
 * offers, the same list `readPartnerSites` hands the API.
 *
 * A company that ALREADY has sites is never touched — seeding only fills an
 * empty list, so a second account for an existing partner cannot wipe yards the
 * company typed itself.
 *
 * Additive and idempotent: safe to re-run.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// Loading locations a company works from, grouped as the client lists them.
// Keys are matched on the company name, case- and spacing-insensitive.
const HELPERS = `
// partner-site-defaults-patch
/**
 * Loading locations a company starts with.
 *
 *   Petroline — Apapa: ENL, Eco Support, Dangote
 *               Tincan: Port and Cargo, Niger Dock, Joseph Dam
 *               (Kirikiri: none recorded yet)
 */
const DEFAULT_PARTNER_SITES: Record<string, string[]> = {
  petroline: ['ENL', 'Eco Support', 'Dangote', 'Port and Cargo', 'Niger Dock', 'Joseph Dam'],
};

function defaultPartnerSites(company: string | null): string[] {
  const key = String(company || '').trim().toLowerCase().replace(/\\s+/g, '');
  return DEFAULT_PARTNER_SITES[key] || [];
}

/**
 * Give a company its known loading locations — but only when it has none.
 * Returns the list the company now holds, so the caller can report it.
 */
async function seedDefaultPartnerSites(company: string | null): Promise<string[]> {
  const seed = defaultPartnerSites(company);
  if (!company || seed.length === 0) return [];
  const existing = await readPartnerSites(company);
  if (existing.length > 0) return existing;
  await writePartnerSites(company, seed);
  return seed;
}
// partner-site-defaults-patch-end
`;

const original = fs.readFileSync(INDEX, "utf8");
let src = original;

if (src.includes("// partner-site-defaults-patch")) {
  console.log("already patched — nothing to do");
  process.exit(0);
}

// --- 1) helpers, right after the partner-site writers they use -------------
const anchor = `async function writePartnerSites(company, sites) {
  if (!company) return;
  await prisma.$executeRawUnsafe('UPDATE "User" SET "loadingSites" = $1 WHERE "partnerCompanyName" ILIKE $2', joinSites(sites), company);
}`;
must(src.includes(anchor), "writePartnerSites anchor");
src = src.replace(anchor, anchor + "\n" + HELPERS.trim());

// --- 2) seed on partner-account creation ----------------------------------
const CREATE_ANCHOR = `    void notify('Compliance', 'New Staff Account', \`Account created for \${user.name} (\${user.role}). A first-login password reset is required.\`, 'success', 'Transport Manager,Platform Admin,HR');
    res.json(userPayload(user));`;
must(src.includes(CREATE_ANCHOR), "POST /api/users response anchor");

const CREATE_NEW = `    // A company that works from a known set of loading locations gets them with
    // its first account, so nobody has to type the yards in one by one.
    const seededLoadingSites = isPartnerUser
      ? await seedDefaultPartnerSites(partnerCompanyName).catch(() => [] as string[])
      : [];
    void notify('Compliance', 'New Staff Account', \`Account created for \${user.name} (\${user.role}). A first-login password reset is required.\`, 'success', 'Transport Manager,Platform Admin,HR');
    res.json({ ...userPayload(user), seededLoadingSites });`;

src = src.replace(CREATE_ANCHOR, CREATE_NEW);

fs.writeFileSync(INDEX + ".bak-sites", original);
fs.writeFileSync(INDEX, src);
console.log("patched:", INDEX, "(backup: index.ts.bak-sites)");
