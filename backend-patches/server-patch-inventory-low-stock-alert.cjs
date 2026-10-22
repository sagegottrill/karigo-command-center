/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) for the Storehouse & Inventory PRD (§2):
 *
 *   The moment a physical disbursement (Complete Handoff) pushes a spare part
 *   to or below its reorder threshold — or empties the shelf — the Transport
 *   Manager gets a real-time notification telling him to initiate procurement.
 *
 * Fires ONLY on the downward crossing of the threshold (book above threshold
 * before the issue), so a line already low does not re-alert on every handoff.
 *
 * Run with: node server-patch-inventory-low-stock-alert.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

if (src.includes("inventory.low_stock")) {
  console.log("skip: low-stock alert already present");
  process.exit(0);
}

const ANCHOR = `  const updatedItem = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { stock, status },
  });
  const releasedValue = qty * wac;`;

const REPLACEMENT = `  const updatedItem = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { stock, status },
  });
  // LOW-STOCK ALERT (PRD §2) — a disbursement that pushes a line to (or below)
  // its threshold tells the Transport Manager the moment stock moves, so
  // procurement starts before the shelf empties for the next truck. It fires
  // only on the downward crossing: once a line is low/empty, every later issue
  // on it no longer re-alerts.
  if (
    (stock <= item.reorderLevel || stock <= 0) &&
    item.stock > Math.max(item.reorderLevel, 0)
  ) {
    await notify('Inventory', stock <= 0 ? 'Stock depleted' : 'Low stock alert',
      \`\${item.name} dropped to \${stock} on the shelf (threshold: \${item.reorderLevel}) after \${qty} × \${requisition.part} was released to \${requisition.truckReg}. Initiate procurement to replenish the line.\`,
      'warning', 'Transport Manager,Head of Inventory,Store Floor Attendant',
      { module: 'Inventory', eventKey: 'inventory.low_stock', refId: item.id, refLabel: item.name, actionRoles: ['Transport Manager'] });
  }
  const releasedValue = qty * wac;`;

const occurrences = src.split(ANCHOR).length - 1;
if (occurrences !== 1) {
  console.error(
    `FAILED: the handoff anchor was found ${occurrences} time(s) (expected exactly once) — nothing written.`
  );
  process.exit(1);
}

fs.writeFileSync(FILE + ".bak-low-stock-alert", fs.readFileSync(FILE));
fs.writeFileSync(FILE, src.replace(ANCHOR, REPLACEMENT));

// Self-verify: the marker and the threshold guard must both be in the file now.
const out = fs.readFileSync(FILE, "utf8");
if (!out.includes("inventory.low_stock") || !out.includes("item.stock > Math.max(item.reorderLevel, 0)")) {
  console.error("FAILED (verify): the marker is missing after the write — restore the .bak-low-stock-alert backup.");
  process.exit(1);
}
console.log("ok: low-stock threshold alert wired into Complete Handoff (backup at " + FILE + ".bak-low-stock-alert)");
