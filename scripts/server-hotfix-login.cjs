/** Hotfix: restore sync fallback used by userPayload (ReferenceError broke all staff logins). */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

// Add a sync fallback right after partnerCompanyForUser
const anchor = `  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}`;
const withFallback = `${anchor}

function partnerCompanyFromEmailFallback(email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}`;
must(src.includes(anchor), "fallback anchor");
src = src.replace(anchor, withFallback);

const callOld = `    partnerCompanyName: user.partnerCompanyName || partnerCompanyFromEmail(user.email, user.role),`;
const callNew = `    partnerCompanyName: user.partnerCompanyName || partnerCompanyFromEmailFallback(user.email, user.role),`;
must(src.includes(callOld), "userPayload call site");
src = src.replace(callOld, callNew);

must(!src.includes("partnerCompanyFromEmail(user"), "no stale references remain");
fs.writeFileSync(FILE, src);
console.log("HOTFIX OK");
