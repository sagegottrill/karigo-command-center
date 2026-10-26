/* E2E CYCLE PROBE users — 26 Oct 2026. Run on the VPS: hashed with the app's bcrypt.
 * These are purged afterwards along with every row the cycle created. */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const PASSWORD = "Cycle@2026";
  const hashed = await bcrypt.hash(PASSWORD, 10);
  for (const [email, name, role] of [
    ["e2e-cycle-tm@petrolline.fleetopsx.com", "E2E Cycle TM", "Transport Manager"],
    ["e2e-cycle-gate@petrolline.fleetopsx.com", "E2E Cycle Gate", "Security"],
    ["e2e-cycle-fleet@petrolline.fleetopsx.com", "E2E Cycle Fleet", "Fleet Operations"],
  ]) {
    await p.user.upsert({
      where: { email },
      update: { password: hashed, status: "Active" },
      create: { email, password: hashed, name, role, status: "Active" },
    });
  }
  console.log("CYCLE USERS READY (password Cycle@2026)");
  await p.$disconnect();
})().catch((e) => { console.error("USER SEED FAILED:", e.message); process.exit(1); });
