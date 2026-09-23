/**
 * Server patch: the store's movement ledger, wired into the routes that change
 * stock.
 *
 * Writes that now leave a trace they did not before:
 *
 *   POST /api/inventory/:id/purchase   stock in from a vendor, at a price. This
 *                                      is also what re-prices the line: like the
 *                                      diesel tank, the shelf is valued at what
 *                                      was last paid for it.
 *   POST /api/inventory/:id/adjust     a signed correction (count, damage,
 *                                      write-off) that is neither a purchase nor
 *                                      an issue.
 *   POST /api/inventory/import         the shelf, in bulk, upserted by SKU —
 *                                      onboarding a store one part at a time is
 *                                      why an empty shelf stays empty.
 *
 * and two existing ones now record themselves: `.../release` writes an Issue
 * against the truck it was drawn for, and editing `stock` on PATCH /inventory/:id
 * writes the difference down as an adjustment, so a shelf that changes with no
 * purchase behind it is visible rather than silent.
 *
 * Run ON the box from /var/www/fleetopsx-api AFTER the ledger schema patch, then:
 * pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const API = "/var/www/fleetopsx-api/index.ts";
const raw = fs.readFileSync(API, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
// Work in LF so the snippets below can be written literally; restore on write.
let text = raw.split("\r\n").join("\n");

const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const replaceOnce = (from, to, label) => {
  const at = text.indexOf(from);
  must(at !== -1, `${label} — anchor not found`);
  must(text.indexOf(from, at + 1) === -1, `${label} — anchor is ambiguous`);
  text = text.slice(0, at) + to + text.slice(at + from.length);
  console.log("ok: " + label);
};

if (text.includes("writeMovement")) {
  console.log("ok: movement routes already present");
} else {
  /* --------------------------------------------------- 1. helpers + routes -- */

  const HELPERS = `// --- INVENTORY ---
/**
 * Write a movement to the store's ledger.
 *
 * Fire-and-forget: the stock change is the business write and it has already
 * happened, so a ledger failure is logged rather than thrown back at the user.
 */
async function writeMovement(row: any) {
  try {
    return await prisma.inventoryMovement.create({ data: row });
  } catch (e: any) {
    console.error('movement write failed:', e?.message);
    return null;
  }
}

const inventoryStatus = (stock: number, reorderLevel: number) =>
  stock === 0 ? 'Out of Stock' : stock <= reorderLevel ? 'Low Stock' : 'In Stock';

/** Who touched it — the name on the token, or the email behind it. */
const actingUser = (req: any) =>
  String(req?.user?.name || req?.user?.fullName || req?.user?.email || 'System');
`;
  replaceOnce("// --- INVENTORY ---\n", HELPERS, "ledger helpers");

  const DELETE_ROUTE = `app.delete('/api/inventory/:id', authenticate, async (req, res) => {
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});`;

  const NEW_ROUTES = `${DELETE_ROUTE}

/** The ledger, newest first — one line's history, or the whole store's. */
app.get('/api/inventory-movements', authenticate, async (req, res) => {
  const itemId = String(req.query.itemId || '');
  res.json(await prisma.inventoryMovement.findMany({
    where: itemId ? { itemId } : undefined,
    orderBy: { actedAt: 'desc' },
    take: 500,
  }));
});

/**
 * Stock in from a vendor.
 *
 * The purchase price replaces the line's book price, so the shelf is always
 * valued at the most recent thing actually paid for it — the same rule the
 * diesel tank is valued by.
 */
app.post('/api/inventory/:id/purchase', authenticate, async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const qty = Math.floor(Number(req.body.qty ?? 0));
  if (!qty || qty <= 0) return res.status(400).json({ error: 'A purchase needs a quantity.' });
  const unitPrice = Number(req.body.unitPrice ?? 0) || item.unitCost;
  const vendor = String(req.body.vendor || '').trim();
  const stock = item.stock + qty;
  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: {
      stock,
      status: inventoryStatus(stock, item.reorderLevel),
      unitCost: unitPrice > 0 ? unitPrice : item.unitCost,
      supplier: vendor || item.supplier,
    },
  });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: 'Purchase',
    quantity: qty,
    unitCost: unitPrice,
    value: qty * unitPrice,
    vendor,
    reference: String(req.body.reference || ''),
    note: String(req.body.note || ''),
    actedBy: actingUser(req),
  });
  res.json(updated);
});

/** A correction that is neither a purchase nor an issue. */
app.post('/api/inventory/:id/adjust', authenticate, async (req, res) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const delta = Math.trunc(Number(req.body.delta ?? 0));
  if (!delta) return res.status(400).json({ error: 'An adjustment needs a signed quantity.' });
  const stock = Math.max(0, item.stock + delta);
  const applied = stock - item.stock;
  const updated = await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { stock, status: inventoryStatus(stock, item.reorderLevel) },
  });
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: delta < 0 ? 'Write-off' : 'Adjustment',
    quantity: applied,
    unitCost: item.unitCost,
    value: Math.abs(applied) * item.unitCost,
    note: String(req.body.note || ''),
    reference: String(req.body.reference || ''),
    actedBy: actingUser(req),
  });
  res.json(updated);
});

/**
 * The shelf, in bulk: upserted by SKU. Onboarding a store one part at a time is
 * why an empty shelf stays empty.
 */
app.post('/api/inventory/import', authenticate, async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!rows.length) return res.status(400).json({ error: 'No rows to import.' });
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const sku = String(row?.sku || '').trim();
    const name = String(row?.name || '').trim();
    if (!sku || !name) {
      skipped.push(name || sku || 'a row with no name or SKU');
      continue;
    }
    const stock = Math.trunc(Number(row.stock ?? 0)) || 0;
    const reorderLevel = Math.trunc(Number(row.reorderLevel ?? 5)) || 0;
    const data = {
      name,
      category: String(row.category || 'General').trim() || 'General',
      stock,
      reorderLevel,
      unitCost: Number(row.unitCost ?? 0) || 0,
      location: String(row.location || 'Main Store').trim() || 'Main Store',
      supplier: String(row.supplier || '').trim(),
      status: inventoryStatus(stock, reorderLevel),
    };
    const existing = await prisma.inventoryItem.findUnique({ where: { sku } });
    if (existing) {
      await prisma.inventoryItem.update({ where: { sku }, data });
      updated += 1;
    } else {
      await prisma.inventoryItem.create({ data: { sku, ...data } });
      created += 1;
    }
  }
  res.json({ created, updated, skipped });
});`;

  replaceOnce(DELETE_ROUTE, NEW_ROUTES, "movements + purchase + adjust + import routes");

  /* -------------------------------------------------- 2. release → Issue --- */

  replaceOnce(
    `  await prisma.inventoryRequisition.update({ where: { id: reqId }, data: { status: 'Released' } });
  res.json({ ok: true });`,
    `  await prisma.inventoryRequisition.update({ where: { id: reqId }, data: { status: 'Released' } });
  // The part physically leaves the shelf here, so this is where consumption is
  // recorded — against the truck it was drawn for, which is the only way to say
  // what one truck costs in parts.
  await writeMovement({
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    kind: 'Issue',
    quantity: -qty,
    unitCost: Number(requisition.unitCost ?? item.unitCost ?? 0),
    value: qty * Number(requisition.unitCost ?? item.unitCost ?? 0),
    reference: reqId,
    truckReg: requisition.truckReg,
    note:
      qty > item.stock
        ? \`\${requisition.part} — issued \${qty} against \${item.stock} on the shelf\`
        : requisition.part,
    actedBy: actingUser(req),
  });
  res.json({ ok: true });`,
    "release writes an issue",
  );

  /* ------------------------------------- 3. a typed stock number is a move --- */

  replaceOnce(
    "  res.json(await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { ...req.body, stock, reorderLevel, status } }));",
    `  const updated = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { ...req.body, stock, reorderLevel, status } });
  // Editing a stock number is a movement like any other: it goes on the ledger,
  // with who did it, so a shelf that changes with no purchase behind it is
  // visible instead of silent.
  const delta = stock - existing.stock;
  if (delta !== 0) {
    await writeMovement({
      itemId: existing.id,
      itemName: existing.name,
      sku: existing.sku,
      kind: delta < 0 ? 'Write-off' : 'Adjustment',
      quantity: delta,
      unitCost: existing.unitCost,
      value: Math.abs(delta) * existing.unitCost,
      note: 'Stock edited on the store board',
      actedBy: actingUser(req),
    });
  }
  res.json(updated);`,
    "PATCH stock writes an adjustment",
  );
}

fs.writeFileSync(API, eol === "\r\n" ? text.split("\n").join("\r\n") : text);
console.log("index.ts written");

try {
  execFileSync("npx", ["esbuild", API, "--outfile=/tmp/_syntax-check.js"], { stdio: "pipe" });
  console.log("ok: index.ts compiles");
  fs.unlinkSync("/tmp/_syntax-check.js");
} catch (error) {
  const out = String(error.stdout || "") + String(error.stderr || "");
  console.error("FAIL: index.ts does not compile — nothing was applied");
  console.error(out.slice(0, 1200));
  process.exit(1);
}
