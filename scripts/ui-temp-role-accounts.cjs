/**
 * Throwaway logins for driving the shared Active Dispatch page as two different
 * departments (run ON the VPS from /var/www/fleetopsx-api):
 *
 *   node ui-temp-role-accounts.cjs          -> create/replace TM + Tracking
 *   node ui-temp-role-accounts.cjs --clean  -> delete them again
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const p = new PrismaClient();

const ACCOUNTS = [
  { email: "zz.ui.tm@livecheck.io", role: "Transport Manager", name: "ZZ UI Transport Manager" },
  { email: "zz.ui.tracking@livecheck.io", role: "Tracking", name: "ZZ UI Tracking" },
];
const CLEAN = process.argv.includes("--clean");

(async () => {
  if (CLEAN) {
    const r = await p.user.deleteMany({ where: { email: { in: ACCOUNTS.map((a) => a.email) } } });
    console.log(`clean: ${r.count} user(s) removed`);
    await p.$disconnect();
    return;
  }
  const hash = await bcrypt.hash("FleetOpsx2026!", 10);
  for (const a of ACCOUNTS) {
    const u = await p.user.upsert({
      where: { email: a.email },
      update: { password: hash, status: "Active", role: a.role, roles: a.role },
      create: {
        email: a.email,
        password: hash,
        name: a.name,
        role: a.role,
        // `roles` is a comma-separated column, not an array.
        roles: a.role,
        status: "Active",
        passwordResetRequired: false,
      },
    });
    console.log(`${u.email} / FleetOpsx2026!  role=${u.role}`);
  }
  await p.$disconnect();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
