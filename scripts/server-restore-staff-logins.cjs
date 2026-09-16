/**
 * Restore the documented Petroline department logins (run ON the Hetzner box).
 *
 * The go-live wipe kept only manager@petroline.ng, which also removed the staff
 * logins the business runs on — without them no department can sign in and the
 * whole app is unusable. This re-provisions exactly the documented ops accounts
 * plus the Platform Admin. Idempotent: existing rows are updated in place, so
 * re-running never duplicates. Partner accounts are NOT created here — those are
 * real customers and get issued by the Transport Manager through the UI.
 *
 * Usage: node restore-staff-logins.cjs
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const OPS = "Petroline@2026";

/** role values must match the server's authorize() role names exactly. */
const STAFF = [
  { email: "admin@fleetopsx.com", name: "System Admin", role: "Platform Admin", password: "Admin@2026" },
  { email: "manager@petroline.ng", name: "Petroline Transport Manager", role: "Transport Manager", password: OPS },
  { email: "fleet@petroline.ng", name: "Petroline Fleet Ops", role: "Fleet Operations", password: OPS },
  { email: "hr@petroline.ng", name: "Petroline HR", role: "HR", password: OPS },
  { email: "accounts@petroline.ng", name: "Petroline Accounts", role: "Accounts", password: OPS },
  { email: "engineering@petroline.ng", name: "Petroline Engineering", role: "Engineering", password: OPS },
  { email: "gate@petroline.ng", name: "Petroline Security", role: "Security", password: OPS },
  { email: "tracking@petroline.ng", name: "Petroline Tracking Ops", role: "Tracking", password: OPS },
];

(async () => {
  for (const u of STAFF) {
    const hashed = await bcrypt.hash(u.password, 10);
    const existing = await prisma.user.findFirst({
      where: { email: { equals: u.email, mode: "insensitive" } },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { email: u.email, name: u.name, role: u.role, roles: null, password: hashed, status: "Active", passwordResetRequired: false },
      });
      console.log(`updated ${u.email.padEnd(32)} ${u.role}`);
    } else {
      await prisma.user.create({
        data: { email: u.email, name: u.name, role: u.role, roles: null, password: hashed, status: "Active", passwordResetRequired: false },
      });
      console.log(`created ${u.email.padEnd(32)} ${u.role}`);
    }
  }

  const users = await prisma.user.findMany({ select: { email: true, role: true, status: true }, orderBy: { email: "asc" } });
  console.log(`\nVERIFY: ${users.length} accounts`);
  for (const u of users) console.log(` ${String(u.email).padEnd(34)} ${String(u.role).padEnd(22)} ${u.status}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FAILED:", e.message); await prisma.$disconnect(); process.exit(1); });
