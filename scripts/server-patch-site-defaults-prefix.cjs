/**
 * Follow-up on partner-site-defaults-patch (run ON the Hetzner box).
 *
 * The company name typed on the account form may be the full legal name
 * ("Petroline Transport Ltd"), not the short one the list is keyed by. Match on
 * the normalised PREFIX as well as an exact hit, so the loading locations still
 * land when the operator spells the company out in full.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const OLD = `function defaultPartnerSites(company: string | null): string[] {
  const key = String(company || '').trim().toLowerCase().replace(/\\s+/g, '');
  return DEFAULT_PARTNER_SITES[key] || [];
}`;

const NEW = `function defaultPartnerSites(company: string | null): string[] {
  const key = String(company || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return [];
  const exact = DEFAULT_PARTNER_SITES[key];
  if (exact) return exact;
  // The form may carry the full legal name ("Petroline Transport Ltd") rather
  // than the short one the list is keyed by — a leading match still applies.
  for (const [name, sites] of Object.entries(DEFAULT_PARTNER_SITES)) {
    if (name.length >= 6 && key.startsWith(name)) return sites;
  }
  return [];
}`;

let src = fs.readFileSync(INDEX, "utf8");
if (src.includes("key.startsWith(name)")) {
  console.log("already patched — nothing to do");
  process.exit(0);
}
if (!src.includes(OLD)) {
  console.error("FAIL: defaultPartnerSites anchor not found");
  process.exit(1);
}
fs.writeFileSync(INDEX + ".bak-sites-prefix", src);
fs.writeFileSync(INDEX, src.replace(OLD, NEW));
console.log("ok: company match now tolerates the full legal name");
