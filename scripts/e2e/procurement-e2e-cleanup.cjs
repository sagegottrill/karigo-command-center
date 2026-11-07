/** Remove every trace of the full-cycle E2E and the browser upload probe. */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.PROCUREMENT_DOCS_DIR || "/var/www/fleetopsx-docs";
const p = new PrismaClient();

(async () => {
  const docs = await p.procurementDocument.findMany();
  let filesRemoved = 0;
  for (const row of docs) {
    const name = String(row.fileName || "");
    const isProbe = /zz-e2e-|zz-ui-|zz-disk-|zz-receive-/.test(name);
    if (!isProbe) continue;
    if (String(row.dataUrl || "").startsWith("file:")) {
      try {
        fs.unlinkSync(path.join(ROOT, String(row.dataUrl).slice(5)));
        filesRemoved++;
      } catch {
        /* already gone */
      }
    }
    await p.procurementDocument.delete({ where: { id: row.id } });
  }

  const movements = await p.inventoryMovement.deleteMany({ where: { sku: { startsWith: "ZZ-E2E-" } } });
  const items = await p.inventoryItem.deleteMany({ where: { sku: { startsWith: "ZZ-E2E-" } } });
  const pos = await p.procurementRequest.deleteMany({ where: { linkedId: { startsWith: "ZZ-E2E-" } } });
  const vendors = await p.vendor.deleteMany({ where: { name: { startsWith: "ZZ " } } }).catch(() => ({ count: 0 }));
  const notes = await p.notification.deleteMany({
    where: { OR: [{ body: { contains: "E2E Brake Shoe" } }, { body: { contains: "E2E Rejected Part" } }] },
  });
  const users = await p.user.deleteMany({ where: { email: "e2e.store@livecheck.io" } });

  console.log(
    JSON.stringify({
      documentsRemoved: docs.filter((d) => /zz-e2e-|zz-ui-|zz-disk-|zz-receive-/.test(String(d.fileName || ""))).length,
      filesRemoved,
      movements: movements.count,
      items: items.count,
      pos: pos.count,
      vendors: vendors.count,
      notes: notes.count,
      users: users.count,
    }),
  );
  console.log(
    "now: inventory",
    await p.inventoryItem.count(),
    "| documents",
    await p.procurementDocument.count(),
    "| procurements",
    await p.procurementRequest.count(),
    "| users",
    await p.user.count(),
    "| vendors",
    await p.vendor.count(),
  );
  process.exit(0);
})();
