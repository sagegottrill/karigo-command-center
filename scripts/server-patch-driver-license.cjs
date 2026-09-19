/**
 * Server patch: give every driver a LICENCE NUMBER and a LICENCE EXPIRY date.
 * (run ON the Hetzner box: node server-patch-driver-license.cjs, then restart the API)
 *
 * Why: the Driver table only carried staffId/name/phone/truckReg/truckReg2/
 * category/status, so the Staff Records "License" column had nothing to read and
 * printed an empty row for every driver — and there was nowhere to record WHEN a
 * licence runs out, which is the one thing that has to be true before a driver is
 * put on a truck. Two nullable columns are added, the create/update endpoints
 * accept them, and Prisma is regenerated so the API can write them.
 *
 * Idempotent: re-running reports "skip" for each step.
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const API_DIR = "/var/www/fleetopsx-api";
const SCHEMA = `${API_DIR}/prisma/schema.prisma`;
const INDEX = `${API_DIR}/index.ts`;

function ok(what) {
  console.log("ok:", what);
}

async function addColumns() {
  const { PrismaClient } = require(`${API_DIR}/node_modules/@prisma/client`);
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "licenseExpiry" TEXT');
  const cols = await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'Driver' AND column_name IN ('licenseNumber','licenseExpiry')",
  );
  await prisma.$disconnect();
  ok(`columns present: ${cols.map((c) => c.column_name).join(", ")}`);
}

function patchSchema() {
  const src = fs.readFileSync(SCHEMA, "utf8");
  if (src.includes("licenseExpiry")) return console.log("skip: schema already has the licence fields");
  const anchor = "model Driver {";
  if (!src.includes(anchor)) throw new Error("schema.prisma: model Driver not found");
  const patched = src.replace(
    anchor,
    `${anchor}\n  licenseNumber String?\n  licenseExpiry String? // ISO yyyy-mm-dd, as entered in Staff Records`,
  );
  fs.writeFileSync(SCHEMA, patched);
  ok("schema.prisma: licenseNumber + licenseExpiry on Driver");
}

function patchDriverFields() {
  const src = fs.readFileSync(INDEX, "utf8");
  const before = "const DRIVER_FIELDS = ['name', 'phone', 'staffId', 'truckReg', 'truckReg2', 'category', 'status'];";
  const after =
    "const DRIVER_FIELDS = ['name', 'phone', 'staffId', 'truckReg', 'truckReg2', 'category', 'status', 'licenseNumber', 'licenseExpiry'];";
  if (src.includes("'licenseNumber', 'licenseExpiry'")) return console.log("skip: DRIVER_FIELDS already carries them");
  if (!src.includes(before)) throw new Error("index.ts: DRIVER_FIELDS anchor not found");
  fs.writeFileSync(INDEX, src.replace(before, after));
  ok("index.ts: create/update accept licenseNumber + licenseExpiry");
}

(async () => {
  await addColumns();
  patchSchema();
  patchDriverFields();
  console.log("running prisma generate…");
  execFileSync("npx", ["prisma", "generate"], { cwd: API_DIR, stdio: "inherit" });
  console.log("PATCH OK — restart the API (pm2 restart fleetopsx-api) to load it.");
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
