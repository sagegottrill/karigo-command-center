/**
 * Throwaway Transport Manager login for driving the TM portal against live data
 * (run ON the VPS from /var/www/fleetopsx-api):
 *
 *   node ui-temp-tm-account.cjs          -> create/replace the account
 *   node ui-temp-tm-account.cjs --clean  -> delete it again
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const p = new PrismaClient();

const EMAIL = "zz.ui.tm@livecheck.io";
const CLEAN = process.argv.includes("--clean");

(async () => {
  if (CLEAN) {
    const r = await p.user.deleteMany({ where: { email: EMAIL } });
    console.log(`clean: ${r.count} user(s) removed`);
    await p.$disconnect();
    return;
  }
  const hash = await bcrypt.hash("FleetOpsx2026!", 10);
  const u = await p.user.upsert({
    where: { email: EMAIL },
    update: { password: hash, status: "Active", role: "Transport Manager" },
    create: {
      email: EMAIL,
      password: hash,
      name: "ZZ UI Transport Manager",
      role: "Transport Manager",
      status: "Active",
      passwordResetRequired: false,
    },
  });
  console.log(`tm: ${u.email} / FleetOpsx2026!  role=${u.role}`);
  await p.$disconnect();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
