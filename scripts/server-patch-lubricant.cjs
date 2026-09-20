/**
 * One-shot server patch for /var/www/fleetopsx-api — the LUBRICANT module.
 * Run ON the Hetzner box, from /var/www/fleetopsx-api.
 *
 * The Lubricant (fuel) department dispenses diesel and gas against a dispatch.
 * Three things had no home at all on the server:
 *
 *   1) INVENTORY. Nothing tracked how much diesel/gas is in the tank, so nothing
 *      could be dispensed against it and nothing could warn when it ran low.
 *   2) RESTOCK. Buying 33,000 L had nowhere to be recorded, so the tank level
 *      could only ever go down.
 *   3) DISBURSAL. Who dispensed what, for which truck, and what it was worth —
 *      the money is computed from the Transport Manager's price per litre, never
 *      typed by the person dispensing.
 *
 * Additive and idempotent: safe to re-run. Then:
 *   npx prisma db push && npx prisma generate && pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// ---------------------------------------------------------------- schema ----

const MODELS = `
/// How much diesel / gas is in the tank right now (one row per fuel type).
model LubricantStock {
  id        String   @id @default(uuid())
  fuelType  String   @unique // "Diesel" | "Gas"
  quantity  Float    @default(0)
  /// Below this the department is warned (the "Min:" caption on the tank card).
  minLevel  Float    @default(0)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

/// A purchase of diesel / gas into the tank (the Restock Records table).
model LubricantRestock {
  id        String   @id @default(uuid())
  reference String   @unique // DSL-00023 | GAS-00023
  fuelType  String
  quantity  Float
  loggedBy  String
  createdAt DateTime @default(now())
}

/// Lubricant handed to one dispatch. unitPrice is the Transport Manager's
/// price per litre SNAPSHOT at the moment of dispensing, so a later price change
/// never re-prices history.
model LubricantDisbursal {
  id          String   @id @default(uuid())
  tripId      String
  fuelType    String
  quantity    Float
  unitPrice   Float    @default(0)
  amount      Float    @default(0)
  dispensedBy String
  /// Drop-off the load is going to, copied at dispense time for the history row.
  destination String?
  createdAt   DateTime @default(now())

  @@index([tripId])
  @@index([createdAt])
}
`;

function patchSchema() {
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (schema.includes("model LubricantStock")) {
    console.log("ok: schema.prisma already carries the lubricant models");
    return;
  }
  must(/model FuelPrice \{/.test(schema), "schema.prisma model FuelPrice anchor");
  fs.writeFileSync(SCHEMA + ".bak-lubricant", schema);
  schema = schema.trimEnd() + "\n" + MODELS;
  fs.writeFileSync(SCHEMA, schema);
  console.log("ok: schema.prisma gained LubricantStock/Restock/Disbursal (backup: schema.prisma.bak-lubricant)");
}

// ----------------------------------------------------------------- index ----

const BLOCK = `
// ---- LUBRICANT: inventory, restock and disbursal --------------------------
// The Lubricant department is the single source of truth for what is in the
// tank. Fleet Operations only ever enters a QUANTITY; every naira figure here is
// computed from the Transport Manager's price per litre (FuelPrice above), so a
// dispatcher can never type a cost and a price change re-prices nothing that has
// already been dispensed.
const LUBRICANT_TYPES = ['Diesel', 'Gas'];
const LUBRICANT_WRITE_ROLES = [
  'Lubricant', 'Lubricant Manager', 'Lubricant Operations', 'Inventory',
  'Fuel Manager', 'Fleet Operations', 'Transport Manager', 'Platform Admin',
];

/** GAS-##### / DSL-##### reference shown on the restock row. */
function lubricantRef(fuelType: string, seq: number) {
  return (fuelType === 'Diesel' ? 'DSL-' : 'GAS-') + String(seq).padStart(5, '0');
}

/** The tank row for a fuel type, created on first read so a fresh install has one. */
async function ensureLubricantStock(fuelType: string) {
  return prisma.lubricantStock.upsert({
    where: { fuelType },
    update: {},
    create: { fuelType, quantity: 0, minLevel: fuelType === 'Diesel' ? 2000 : 100 },
  });
}

/** Unit caption the department reads: litres for diesel, KG for gas. */
function lubricantUnit(fuelType: string) {
  return fuelType === 'Gas' ? 'KG' : 'LITRES';
}

/** The Transport Manager's price per litre, per fuel type. */
async function lubricantPrices() {
  const rows = await prisma.fuelPrice.findMany();
  const out: Record<string, number> = { Diesel: 0, Gas: 0 };
  for (const r of rows) if (LUBRICANT_TYPES.includes(r.fuelType)) out[r.fuelType] = r.pricePerLitre;
  return out;
}

function tripLubricantRequest(directCosts: any) {
  const dc = directCosts && typeof directCosts === 'object' ? directCosts : {};
  const type = LUBRICANT_TYPES.includes(dc.lubricantType) ? dc.lubricantType : null;
  const qty = Number(dc.lubricantQuantity);
  if (!type || !Number.isFinite(qty) || qty <= 0) return null;
  return { fuelType: type as string, quantity: qty };
}

/**
 * Dispatches waiting for lubricant: the load has a diesel/gas request and the
 * department has not dispensed for it yet. Newest first, so the newest truck in
 * the yard is the top row.
 */
async function lubricantPending(limit = 200) {
  const trips = await prisma.trip.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const disbursed = await prisma.lubricantDisbursal.findMany({ select: { tripId: true } });
  const done = new Set(disbursed.map((d) => d.tripId));
  const pending = [];
  for (const t of trips) {
    if (done.has(t.id)) continue;
    if (['Stopped', 'Declined', 'Completed', 'Returned'].includes(String(t.status))) continue;
    const req = tripLubricantRequest(t.directCosts);
    if (!req) continue;
    pending.push({ trip: t, request: req });
    if (pending.length >= limit) break;
  }
  return pending;
}

/** Driver / truck head / tail rows for a set of trips, keyed by trip id. */
async function lubricantTripVehicles(trips: any[]) {
  const driverIds = Array.from(new Set(trips.map((t) => t.driverId).filter(Boolean)));
  const headIds = Array.from(new Set(trips.map((t) => t.headId).filter(Boolean)));
  const tailIds = Array.from(new Set(trips.map((t) => t.tailId).filter(Boolean)));
  const [drivers, heads, tails] = await Promise.all([
    driverIds.length ? prisma.driver.findMany({ where: { id: { in: driverIds as string[] } } }) : [],
    headIds.length ? prisma.truck.findMany({ where: { id: { in: headIds as string[] } } }) : [],
    tailIds.length ? prisma.tail.findMany({ where: { id: { in: tailIds as string[] } } }) : [],
  ]);
  const byId = (rows: any[]) => new Map(rows.map((r) => [r.id, r]));
  const dmap = byId(drivers), hmap = byId(heads), tmap = byId(tails);
  const out: Record<string, any> = {};
  for (const t of trips) {
    out[t.id] = {
      driver: dmap.get(t.driverId) || null,
      head: hmap.get(t.headId) || null,
      tail: tmap.get(t.tailId) || null,
    };
  }
  return out;
}

/** Inventory + money at a glance: the tank cards and the department's counters. */
app.get('/api/lubricant/overview', authenticate, async (_req: any, res) => {
  try {
    const stocks = await Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock));
    const [prices, restockCount, disbursals, pending] = await Promise.all([
      lubricantPrices(),
      prisma.lubricantRestock.count(),
      prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' } }),
      lubricantPending(),
    ]);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = disbursals.filter((d) => new Date(d.createdAt) >= startOfDay);
    const dayLitres: Record<string, number> = { Diesel: 0, Gas: 0 };
    let dayAmount = 0;
    for (const d of today) {
      dayLitres[d.fuelType] = (dayLitres[d.fuelType] || 0) + d.quantity;
      dayAmount += d.amount;
    }
    res.json({
      stocks: stocks.map((s) => ({ ...s, unit: lubricantUnit(s.fuelType), low: s.quantity < s.minLevel })),
      prices,
      counts: { restock: restockCount, disbursal: disbursals.length, requests: pending.length },
      daily: { litres: dayLitres, amount: dayAmount, trucks: new Set(today.map((d) => d.tripId)).size },
      totals: {
        litres: LUBRICANT_TYPES.reduce((acc, t) => {
          acc[t] = disbursals.filter((d) => d.fuelType === t).reduce((s, d) => s + d.quantity, 0);
          return acc;
        }, {} as Record<string, number>),
        amount: disbursals.reduce((s, d) => s + d.amount, 0),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Restock records: buying diesel / gas back into the tank ----------------
app.get('/api/lubricant/restocks', authenticate, async (_req: any, res) => {
  try {
    const rows = await prisma.lubricantRestock.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lubricant/restocks', authenticate, authorize(...LUBRICANT_WRITE_ROLES), async (req: any, res) => {
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Number(req.body?.quantity);
  const loggedBy = String(req.body?.loggedBy || '').trim();
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  if (!loggedBy) return res.status(400).json({ error: 'loggedBy is required' });
  try {
    const count = await prisma.lubricantRestock.count();
    const row = await prisma.lubricantRestock.create({
      data: { reference: lubricantRef(fuelType, count + 1), fuelType, quantity, loggedBy },
    });
    const stock = await prisma.lubricantStock.update({
      where: { fuelType },
      data: { quantity: { increment: quantity } },
    });
    try {
      await notify('Lubricant', fuelType + ' Restocked',
        '+' + quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' logged by ' + loggedBy +
        ' — available now ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + '.',
        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager');
    } catch (_) { /* notification must never fail the restock */ }
    res.status(201).json({ ...row, stock: { ...stock, unit: lubricantUnit(fuelType) } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Disbursal requests: dispatches still waiting for lubricant -------------
app.get('/api/lubricant/requests', authenticate, async (_req: any, res) => {
  try {
    const pending = await lubricantPending();
    const vehicles = await lubricantTripVehicles(pending.map((p) => p.trip));
    const prices = await lubricantPrices();
    res.json(pending.map(({ trip, request }) => ({
      ...trip,
      ...vehicles[trip.id],
      request,
      unitPrice: prices[request.fuelType] || 0,
      estimatedAmount: (prices[request.fuelType] || 0) * request.quantity,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Disbursal history ------------------------------------------------------
app.get('/api/lubricant/disbursals', authenticate, async (_req: any, res) => {
  try {
    const rows = await prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
    const trips = rows.length
      ? await prisma.trip.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.tripId))) } } })
      : [];
    const vehicles = await lubricantTripVehicles(trips);
    const tripById = new Map(trips.map((t) => [t.id, t]));
    res.json(rows.map((r) => {
      const trip = tripById.get(r.tripId);
      return {
        ...r,
        unit: lubricantUnit(r.fuelType),
        reference: dispatchRef(r.tripId),
        ...(vehicles[r.tripId] || { driver: null, head: null, tail: null }),
        trip: trip || null,
      };
    }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Dispense lubricant against a dispatch.
 *
 * The amount is quantity × the Transport Manager's price per litre, read here
 * and SNAPSHOT onto the row — the dispatcher cannot type a cost, and a later
 * price change never rewrites what a delivery already cost.
 */
app.post('/api/lubricant/disbursals', authenticate, authorize(...LUBRICANT_WRITE_ROLES), async (req: any, res) => {
  const tripId = String(req.body?.tripId || '').trim();
  const fuelType = String(req.body?.fuelType || '').trim();
  const quantity = Number(req.body?.quantity);
  const dispensedBy = String(req.body?.dispensedBy || '').trim();
  if (!tripId) return res.status(400).json({ error: 'tripId is required' });
  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
  if (!dispensedBy) return res.status(400).json({ error: 'dispensedBy is required' });
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const duplicate = await prisma.lubricantDisbursal.findFirst({ where: { tripId } });
    if (duplicate) {
      return res.status(409).json({
        error: 'Lubricant was already dispensed for ' + dispatchRef(tripId) + ' (' +
          duplicate.quantity.toLocaleString() + ' ' + lubricantUnit(duplicate.fuelType) +
          ' by ' + duplicate.dispensedBy + '). One disbursal per dispatch.',
      });
    }
    const stock = await ensureLubricantStock(fuelType);
    if (quantity > stock.quantity) {
      return res.status(409).json({
        error: 'Only ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) +
          ' of ' + fuelType + ' is in the tank — restock before dispensing ' + quantity.toLocaleString() + '.',
      });
    }
    const prices = await lubricantPrices();
    const unitPrice = prices[fuelType] || 0;
    if (unitPrice <= 0) {
      return res.status(409).json({ error: 'The Transport Manager has not set the ' + fuelType + ' price per litre yet — the cost cannot be computed.' });
    }
    const row = await prisma.lubricantDisbursal.create({
      data: {
        tripId, fuelType, quantity, dispensedBy,
        unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100,
        destination: trip.dropoff || null,
      } as any,
    });
    const after = await prisma.lubricantStock.update({
      where: { fuelType },
      data: { quantity: { decrement: quantity } },
    });
    try {
      await notify('Lubricant', 'Successful ' + fuelType.toLowerCase() + ' disbursal',
        quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' \u2022 ' + dispatchRef(tripId) +
        ' \u2022 \u20A6' + (row.amount).toLocaleString() + ' \u2022 dispensed by ' + dispensedBy,
        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager');
      if (after.quantity < after.minLevel) {
        await notify('Lubricant', fuelType + ' Inventory is running low',
          'Current Stock: ' + after.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) +
          ' (minimum ' + after.minLevel.toLocaleString() + ')',
          'warning', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager');
      }
    } catch (_) { /* the disbursal stands even if the alert fails */ }
    res.status(201).json({ ...row, unit: lubricantUnit(fuelType), reference: dispatchRef(tripId), stock: after });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * The department's notification feed.
 *
 * Built from what actually happened (tanks low, trucks waiting, what was
 * dispensed and restocked) rather than only from pushed rows, so the page is
 * true the moment it opens — including for the alerts the department never
 * received because nobody had wired them.
 */
app.get('/api/lubricant/notifications', authenticate, async (_req: any, res) => {
  try {
    const [stocks, pending, disbursals, restocks, pushed] = await Promise.all([
      Promise.all(LUBRICANT_TYPES.map(ensureLubricantStock)),
      lubricantPending(20),
      prisma.lubricantDisbursal.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.lubricantRestock.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.notification.findMany({ where: { category: 'Lubricant' }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const vehicles = await lubricantTripVehicles(pending.map((p) => p.trip));
    const feed: any[] = [];
    for (const s of stocks) {
      if (s.quantity < s.minLevel) {
        feed.push({
          id: 'low-' + s.fuelType, kind: 'low-stock', severity: 'warning',
          title: s.fuelType + ' Inventory is running low',
          body: 'Current Stock: ' + s.quantity.toLocaleString() + ' ' + lubricantUnit(s.fuelType),
          at: s.updatedAt,
        });
      }
    }
    for (const { trip, request } of pending) {
      const v = vehicles[trip.id] || {};
      feed.push({
        id: 'wait-' + trip.id, kind: 'request', severity: 'info', tripId: trip.id,
        title: 'New Dispatch waiting for Lubricant',
        body: (v.driver?.name || trip.driverName || 'Unassigned') + ' \u2022 ' + dispatchRef(trip.id) +
          ' \u2022 ' + request.quantity.toLocaleString() + ' ' + lubricantUnit(request.fuelType),
        at: trip.assignedAt || trip.updatedAt || trip.createdAt,
      });
    }
    for (const d of disbursals) {
      feed.push({
        id: 'dis-' + d.id, kind: 'disbursal', severity: 'success', tripId: d.tripId,
        title: 'Successful ' + String(d.fuelType).toLowerCase() + ' disbursal',
        body: d.quantity.toLocaleString() + ' ' + lubricantUnit(d.fuelType) + ' \u2022 ' + dispatchRef(d.tripId),
        at: d.createdAt,
      });
    }
    for (const r of restocks) {
      feed.push({
        id: 'res-' + r.id, kind: 'restock', severity: 'success',
        title: String(r.fuelType) + ' restocked',
        body: r.reference + ' \u2022 +' + r.quantity.toLocaleString() + ' ' + lubricantUnit(r.fuelType) + ' \u2022 ' + r.loggedBy,
        at: r.createdAt,
      });
    }
    for (const n of pushed) {
      feed.push({
        id: 'note-' + n.id, kind: 'note', severity: n.severity, persisted: true,
        title: n.title, body: n.body, at: n.createdAt,
      });
    }
    feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    res.json(feed);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

`;

function patchIndex() {
  let src = fs.readFileSync(INDEX, "utf8");
  if (src.includes("/api/lubricant/overview")) {
    console.log("ok: index.ts already carries the lubricant endpoints");
    return;
  }
  const ANCHOR = "// ---- Fuel prices: TM-managed price per litre — source of truth for all modules ----";
  must(src.includes(ANCHOR), "index.ts fuel-prices anchor");
  must(/async function notify\(/.test(src), "index.ts notify() helper");
  must(/function dispatchRef\(/.test(src), "index.ts dispatchRef() helper");
  src = src.replace(ANCHOR, BLOCK.trim() + "\n\n" + ANCHOR);
  // The audit middleware names the module for every mutation — teach it this one.
  if (src.includes("fuel: 'Fuel', 'fuel-prices': 'Fuel'")) {
    src = src.replace("fuel: 'Fuel', 'fuel-prices': 'Fuel'", "fuel: 'Fuel', lubricant: 'Lubricant', 'fuel-prices': 'Fuel'");
    console.log("ok: audit middleware maps /lubricant to the Lubricant module");
  }
  fs.writeFileSync(INDEX + ".bak-lubricant", fs.readFileSync(INDEX, "utf8"));
  fs.writeFileSync(INDEX, src);
  console.log("ok: index.ts written (backup: index.ts.bak-lubricant)");
}

function seedTanks() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  return (async () => {
    for (const [fuelType, minLevel] of [["Diesel", 2000], ["Gas", 100]]) {
      const row = await prisma.lubricantStock.upsert({
        where: { fuelType },
        update: {},
        create: { fuelType, quantity: 0, minLevel },
      });
      console.log("ok: tank " + fuelType + " = " + row.quantity + " (min " + row.minLevel + ")");
    }
    const prices = await prisma.fuelPrice.findMany();
    console.log("ok: prices in force — " + prices.map((p) => p.fuelType + " \u20A6" + p.pricePerLitre).join(", "));
    await prisma.$disconnect();
  })();
}

(async () => {
  patchSchema();
  patchIndex();
  await seedTanks();
  console.log("PATCH OK — now: npx prisma db push && npx prisma generate && pm2 restart fleetopsx-api");
})();
