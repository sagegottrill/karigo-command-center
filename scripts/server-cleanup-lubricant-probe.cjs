/**
 * Removes the rows my own endpoint probe wrote (run ON the Hetzner box, from
 * /var/www/fleetopsx-api).
 *
 * The probe had to prove the money and the double-entry guard work against the
 * real API, which left one restock (DSL-00001, +20,000 L, loggedBy "Probe") and
 * one disbursal (DIS-28044, 525 L, dispensedBy "Probe"). Nobody dispensed that
 * diesel and nobody bought it, so it must not sit in the live tank — the
 * department starts from a real count.
 *
 * Only rows logged by "Probe" are touched. Safe to re-run.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const restocks = await prisma.lubricantRestock.deleteMany({ where: { loggedBy: "Probe" } });
  const disbursals = await prisma.lubricantDisbursal.deleteMany({ where: { dispensedBy: "Probe" } });
  console.log("removed restocks:", restocks.count, "disbursals:", disbursals.count);

  for (const fuelType of ["Diesel", "Gas"]) {
    const row = await prisma.lubricantStock.update({
      where: { fuelType },
      data: { quantity: 0 },
    });
    console.log("tank", row.fuelType, "=", row.quantity, row.fuelType === "Gas" ? "KG" : "LITRES", "min", row.minLevel);
  }

  const [restockCount, disbursalCount] = await Promise.all([
    prisma.lubricantRestock.count(),
    prisma.lubricantDisbursal.count(),
  ]);
  console.log("remaining restock rows:", restockCount, "disbursal rows:", disbursalCount);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
