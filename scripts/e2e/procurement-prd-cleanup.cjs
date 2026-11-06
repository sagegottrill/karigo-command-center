/**
 * Removes everything scripts/e2e/procurement-prd-walk.mjs created. Run ON THE
 * SERVER, inside /var/www/fleetopsx-api so @prisma/client resolves:
 *
 *   node _procurement-prd-cleanup.cjs
 *
 * Only ZZ- probe rows, probe vendors and their notifications are touched.
 */
const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const probes = await p.inventoryItem.findMany({
    where: { OR: [{ sku: { startsWith: "ZZ-" } }, { name: { startsWith: "ZZ " } }] },
    select: { id: true, sku: true },
  });
  const reqs = await p.inventoryRequisition.findMany({
    where: { OR: [{ part: { startsWith: "ZZ " } }, { workOrder: { startsWith: "ZZ-" } }] },
    select: { id: true },
  });
  const pos = await p.procurementRequest.findMany({
    where: { OR: [{ sku: { startsWith: "ZZ-" } }, { partName: { startsWith: "ZZ " } }] },
    select: { id: true },
  });
  const vendors = await p.vendor.findMany({ where: { name: { startsWith: "ZZ " } }, select: { id: true } });

  const ids = [...reqs.map((r) => r.id), ...pos.map((r) => r.id), ...probes.map((r) => r.id)];
  const notes = ids.length ? await p.notification.deleteMany({ where: { refId: { in: ids } } }) : { count: 0 };
  const docs = pos.length ? await p.procurementDocument.deleteMany({ where: { procurementId: { in: pos.map((r) => r.id) } } }) : { count: 0 };
  const moves = await p.inventoryMovement.deleteMany({
    where: { OR: [{ sku: { startsWith: "ZZ-" } }, { itemName: { startsWith: "ZZ " } }, { itemId: { in: probes.map((r) => r.id) } }] },
  });
  const poDel = pos.length ? await p.procurementRequest.deleteMany({ where: { id: { in: pos.map((r) => r.id) } } }) : { count: 0 };
  const reqDel = reqs.length ? await p.inventoryRequisition.deleteMany({ where: { id: { in: reqs.map((r) => r.id) } } }) : { count: 0 };
  const itemDel = probes.length ? await p.inventoryItem.deleteMany({ where: { id: { in: probes.map((r) => r.id) } } }) : { count: 0 };
  const vendorDel = vendors.length ? await p.vendor.deleteMany({ where: { name: { startsWith: "ZZ " } } }) : { count: 0 };

  const leftoverItems = await p.inventoryItem.count({ where: { sku: { startsWith: "ZZ-" } } });
  const leftoverPos = await p.procurementRequest.count({ where: { sku: { startsWith: "ZZ-" } } });
  const leftoverReqs = await p.inventoryRequisition.count({ where: { workOrder: { startsWith: "ZZ-" } } });
  const leftoverVendors = await p.vendor.count({ where: { name: { startsWith: "ZZ " } } });

  console.log(
    `cleanup: notifications=${notes.count} documents=${docs.count} movements=${moves.count} ` +
      `POs=${poDel.count} requisitions=${reqDel.count} items=${itemDel.count} vendors=${vendorDel.count}`,
  );
  console.log(
    `leftover: items=${leftoverItems} POs=${leftoverPos} requisitions=${leftoverReqs} vendors=${leftoverVendors}`,
  );
  await p.$disconnect();
})();
