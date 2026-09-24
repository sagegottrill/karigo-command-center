/**
 * Server patch: fuel restock orders — the split the Transport Manager asked for.
 *
 * The low-tank alert told him to buy, but gave him nothing to act with. Now:
 *
 *   1. POST /api/fuel-restock-orders  (TM / Platform Admin)
 *      He raises a PURCHASE ORDER from the reorder drill: fuel type, litres,
 *      vendor, unit price, his authorisation. It lands in the procurement
 *      ledger (ProcurementRequest, kind='Fuel') — NOT in the tank. The vendor
 *      record belongs to procurement; the dashboard only triggered and priced
 *      the buy.
 *
 *   2. Receiving: PATCH /api/procurement/:id { status: 'Procured' } on a fuel
 *      PO writes the inbound tank row (LubricantRestock) AT THE PO'S PRICE, so
 *      the tank's value keeps its single source — priced from the delivery the
 *      buyer authorized. Double-receiving is refused.
 *
 * Schema: ProcurementRequest gains kind / unitPrice / vendor.
 * Run ON the box from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

/** The box keeps CRLF files; match and write in its own endings. */
const readAny = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

/* ------------------------------------------------------------- the schema */
let schema = readAny(SCHEMA);
if (!schema.includes("kind      String   @default(\"Part\")")) {
  const anchor = `model ProcurementRequest {
  id         String   @id @default(uuid())
  partName   String
  quantity   Int
  linkedId   String
  truckReg   String?
  status     String   @default("Requested")`;
  must(schema.includes(anchor), "procurement schema anchor");
  schema = schema.replace(
    anchor,
    `model ProcurementRequest {
  id         String   @id @default(uuid())
  partName   String
  quantity   Int
  linkedId   String
  truckReg   String?
  /// "Part" (workshop store) or "Fuel" (a tank restock PO the TM raised).
  kind       String   @default("Part")
  /// What the buyer agreed to pay per unit — the price receiving posts.
  unitPrice  Float?
  /// Who the buy is from — procurement owns the vendor record.
  vendor     String?
  status     String   @default("Requested")`,
  );
  fs.writeFileSync(SCHEMA, schema.replace(/\n/g, "\r\n"));
  console.log("schema: ProcurementRequest gains kind / unitPrice / vendor");
} else {
  console.log("schema: already patched");
}

/* --------------------------------------------------------- the index routes */
let s = readAny(INDEX);

// 1) The raise-order route, before the procurement GET.
if (!s.includes("app.post('/api/fuel-restock-orders'")) {
  const anchor = "// --- PROCUREMENT ---";
  must(s.includes(anchor), "procurement anchor");
  const route = `// --- FUEL RESTOCK ORDERS (the TM's buy, procurement receives) ---
// The reorder drill raised a purchase: litres, vendor, unit price, his name.
// It posts a PO into the procurement ledger — the tank is NOT touched here;
// receiving the delivery (Procured below) is what writes stock in.
app.post('/api/fuel-restock-orders', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Math.trunc(Number(req.body?.quantity));
  const unitPrice = Number(req.body?.unitPrice);
  const vendor = String(req.body?.vendor || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number of litres' });
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'unitPrice is what the buy costs per litre — it prices the tank on receiving' });
  try {
    const po = await prisma.procurementRequest.create({
      data: {
        partName: fuelType + ' restock — ' + quantity.toLocaleString() + ' L',
        quantity,
        linkedId: fuelType,
        kind: 'Fuel',
        unitPrice,
        vendor: vendor || null,
        status: 'Requested',
      },
    });
    await notify('Fuel & Lubricant', 'Restock order raised — ' + fuelType,
      quantity.toLocaleString() + ' L of ' + fuelType + ' at ' + Math.round(unitPrice).toLocaleString() + '/L' +
      (vendor ? ' from ' + vendor : '') + ' — ' + actingUser(req) + ' authorized the buy. Procurement to deliver.',
      'info', 'Procurement,Head of Inventory,Lubricant,Transport Manager',
      { module: 'Fuel & Lubricant', eventKey: 'fuel.restock_ordered', refId: po.id, refLabel: po.partName, actionRoles: ['Procurement'] });
    res.status(201).json(po);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PROCUREMENT ---`;
  s = s.replace(anchor, route);
  console.log("routes: raise-order route installed");
} else {
  console.log("routes: raise-order already present");
}

// 2) Receiving a fuel PO writes the tank inbound row.
const RECEIVE_OLD = `app.patch('/api/procurement/:id', authenticate, async (req, res) => {
  const pr = await prisma.procurementRequest.update({ where: { id: req.params.id }, data: req.body });
  if (req.body.status === 'Procured') {
    await notify('Engineering', 'Part Procured', \`Procurement request \${pr.id} (\${pr.partName}) marked as Procured.\`, 'success', undefined, { module: 'Engineering', eventKey: 'parts.procured', refId: pr.id, refLabel: pr.partName });
  }
  res.json(pr);
});`;
const RECEIVE_NEW = `app.patch('/api/procurement/:id', authenticate, async (req, res) => {
  const before = await prisma.procurementRequest.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: 'Procurement request not found' });
  const pr = await prisma.procurementRequest.update({ where: { id: req.params.id }, data: req.body });
  if (req.body.status === 'Procured' && before.status !== 'Procured') {
    if (before.kind === 'Fuel') {
      // Receiving a fuel delivery: the tank takes in what was bought, priced at
      // what the PO agreed — the same row the tank's value is measured from.
      // Refusing a second receive keeps one delivery = one tank row.
      try {
        const fuelType = LUBRICANT_TYPES.includes(before.linkedId) ? before.linkedId : 'Diesel';
        const stock = await prisma.lubricantStock.update({
          where: { fuelType },
          data: { quantity: { increment: before.quantity } },
        });
        const count = await prisma.lubricantRestock.count();
        const row = await prisma.lubricantRestock.create({
          data: {
            reference: lubricantRef(fuelType, count + 1),
            fuelType,
            quantity: before.quantity,
            loggedBy: 'PO ' + before.id.slice(0, 8) + ' — received by ' + actingUser(req),
            unitCost: before.unitPrice ?? null,
          },
        });
        await notify('Fuel & Lubricant', fuelType + ' delivery received',
          '+' + before.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' received against PO ' + before.id.slice(0, 8) +
          (before.vendor ? ' (vendor ' + before.vendor + ')' : '') + ' — tank now ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + '.',
          'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
          { module: 'Fuel & Lubricant', eventKey: 'fuel.restocked', refId: row.id, refLabel: row.reference });
      } catch (e: any) {
        console.error('fuel PO receive failed:', e.message);
      }
    } else {
      await notify('Engineering', 'Part Procured', \`Procurement request \${pr.id} (\${pr.partName}) marked as Procured.\`, 'success', undefined, { module: 'Engineering', eventKey: 'parts.procured', refId: pr.id, refLabel: pr.partName });
    }
  }
  res.json(pr);
});`;
if (s.includes(RECEIVE_OLD)) {
  s = s.replace(RECEIVE_OLD, RECEIVE_NEW);
  console.log("routes: receiving writes the tank row");
} else if (s.includes("before.kind === 'Fuel'")) {
  console.log("routes: receiving already patched");
} else {
  must(false, "procurement PATCH anchor");
}

fs.writeFileSync(INDEX, s.replace(/\n/g, "\r\n"));

// 3) Prove it compiles before the API restarts on it.
try {
  execSync(
    "cd /var/www/fleetopsx-api && npx esbuild index.ts --platform=node --format=cjs --outfile=/dev/null --log-level=error",
    { stdio: "inherit" },
  );
  console.log("esbuild: index.ts compiles");
} catch {
  console.error("esbuild FAILED — file left as patched; fix before restart");
  process.exit(1);
}

console.log("PATCH OK — now: npx prisma db push && npx prisma generate && pm2 restart fleetopsx-api");
