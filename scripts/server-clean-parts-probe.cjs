/**
 * Removes the Parts & Inventory verification fixtures created during the
 * dashboard E2E probe: the ZZ probe part, its ledger movements, and the test
 * requisition. Run ON the box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();

  const items = await prisma.inventoryItem.findMany({
    where: { sku: { startsWith: "ZZ-PROBE" } },
    select: { id: true, name: true },
  });
  console.log("probe items:", items.map((i) => i.name).join(", ") || "none");

  for (const item of items) {
    const movs = await prisma.inventoryMovement.deleteMany({ where: { itemId: item.id } });
    console.log(`deleted ${movs.count} movement(s) for ${item.name}`);
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    console.log(`deleted item ${item.name}`);
  }

  const reqs = await prisma.inventoryRequisition.deleteMany({
    where: { mechanic: "Probe Mechanic" },
  });
  console.log(`deleted ${reqs.count} probe requisition(s)`);

  const leftItems = await prisma.inventoryItem.count();
  const leftMovs = await prisma.inventoryMovement.count();
  const leftReqs = await prisma.inventoryRequisition.count();
  console.log(`remaining: items=${leftItems} movements=${leftMovs} requisitions=${leftReqs}`);

  await prisma.$disconnect();
})();
