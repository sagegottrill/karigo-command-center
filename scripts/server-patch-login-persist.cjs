/** Persist derived partner company during login (legacy accounts self-heal their row). */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

const oldBlock = `    if (user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
      const derived = await partnerCompanyForUser(user.id, user.email, user.role);
      if (derived) user = { ...user, partnerCompanyName: derived };
    }`;
const newBlock = `    if (user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
      const derived = await partnerCompanyForUser(user.id, user.email, user.role);
      if (derived) {
        // Persist so company matching + canonical spelling work for legacy accounts.
        await prisma.user.update({ where: { id: user.id }, data: { partnerCompanyName: derived } }).catch(() => {});
        user = { ...user, partnerCompanyName: derived };
      }
    }`;
must(src.includes(oldBlock), "login hydration block");
src = src.replace(oldBlock, newBlock);

fs.writeFileSync(FILE, src);
console.log("PATCH OK");
