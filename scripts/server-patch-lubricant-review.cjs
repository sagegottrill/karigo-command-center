/**
 * Server patch: the Transport Manager reviews the lubricant the department logs.
 *
 * The disbursal ledger recorded WHAT was pumped (dispatch, litres, attendant,
 * price snapshot) but never whether the man who owns the money accepted the
 * entry. So a sixty-litre draw sat in history as a fact nobody had endorsed, and
 * a wrong figure could only be corrected by editing the row into a lie. The
 * Figma review screen ("Review lubricant disbursed to dispatch") needs the
 * decision to exist in the data before it can exist on the screen.
 *
 * Additive only — one new column set and one route:
 *
 *   LubricantDisbursal.status       Pending until the TM endorses (Approved) or
 *                                   flags it (Declined). Existing rows land on
 *                                   Pending, which is the honest default: they
 *                                   were never reviewed.
 *   LubricantDisbursal.reviewedBy   who stamped it
 *   LubricantDisbursal.reviewedAt   when
 *   LubricantDisbursal.reviewNote   why, when he declines
 *
 *   PATCH /api/lubricant/disbursals/:id   the review itself (TM / Platform Admin)
 *
 * Nothing existing changes meaning: no row is repriced, no rule about how much
 * may be pumped changes, and the department keeps logging exactly as before.
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

/* ----------------------------------------------------------------- schema ---- */

const raw = fs.readFileSync(SCHEMA, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const INSERT_AFTER = /^\s+destination\s+String\?\s*$/;
const FIELDS = [
  "  /// The Transport Manager's review of a logged dispense. Stays Pending",
  "  /// until he endorses the entry, or Declined when he flags it.",
  '  status      String   @default("Pending")',
  "  reviewedBy  String?",
  "  reviewedAt  DateTime?",
  "  /// Why it was declined — the department has to be able to fix it.",
  "  reviewNote  String?",
];

if (!raw.includes("reviewedBy")) {
  const at = lines.findIndex((l) => INSERT_AFTER.test(l));
  if (at === -1) {
    console.error("Anchor (LubricantDisbursal.destination) not found in schema — aborting.");
    process.exit(1);
  }
  lines.splice(at + 1, 0, ...FIELDS);
  fs.writeFileSync(SCHEMA, lines.join(eol));
  console.log("ok: LubricantDisbursal review fields added to schema");
} else {
  console.log("ok: schema already carries the review fields");
}

/* ------------------------------------------------------------------ route ---- */

const MARK = "// ---- Lubricant review: the TM endorses what the department logged ------";
const ANCHOR = "app.get('/api/lubricant/notifications'";

const ROUTE = `${MARK}
app.patch('/api/lubricant/disbursals/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const status = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!['Pending', 'Approved', 'Declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be Pending, Approved or Declined' });
  }
  try {
    const row = await prisma.lubricantDisbursal.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Disbursal record not found' });
    const reviewedBy = req.user.name || req.user.email || 'Transport Manager';
    const updated = await prisma.lubricantDisbursal.update({
      where: { id: row.id },
      data: { status, reviewedBy, reviewedAt: new Date(), reviewNote: note || null },
    });
    try {
      const unit = lubricantUnit(row.fuelType);
      const what = row.quantity.toLocaleString() + ' ' + unit + ' for ' + dispatchRef(row.tripId);
      await notify('Lubricant',
        status === 'Approved'
          ? 'Disbursal endorsed'
          : status === 'Declined'
            ? 'Disbursal flagged'
            : 'Disbursal reopened',
        status === 'Approved'
          ? what + ' endorsed by ' + reviewedBy + '.'
          : status === 'Declined'
            ? what + ' was flagged by ' + reviewedBy + (note ? ' — ' + note : '') + '.'
            : 'The review of ' + what + ' was reopened.',
        status === 'Declined' ? 'warning' : 'success',
        'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',
        {
          module: 'Fuel & Lubricant',
          eventKey: status === 'Approved' ? 'fuel.disbursal_endorsed' : status === 'Declined' ? 'fuel.disbursal_flagged' : 'fuel.disbursal_reopened',
          refId: row.id,
          refLabel: dispatchRef(row.tripId),
        });
    } catch (_) { /* the review stands even if the alert fails */ }
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

`;

const src = fs.readFileSync(INDEX, "utf8");
if (src.includes(MARK)) {
  console.log("ok: review route already present");
} else {
  const at = src.indexOf(ANCHOR);
  if (at === -1) {
    console.error("Anchor (lubricant/notifications route) not found — aborting.");
    process.exit(1);
  }
  fs.writeFileSync(INDEX, src.slice(0, at) + ROUTE + src.slice(at));
  console.log("ok: PATCH /api/lubricant/disbursals/:id inserted");
}

/* ------------------------------------------------------------------- data ---- */

(async () => {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "LubricantDisbursal" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Pending'`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "LubricantDisbursal" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "LubricantDisbursal" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3)`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "LubricantDisbursal" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT`,
  );
  const [{ count }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "LubricantDisbursal" WHERE "status" = 'Pending'`,
  );
  const [{ total }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS total FROM "LubricantDisbursal"`);
  console.log(`columns applied · ${count} of ${total} logged disbursal(s) awaiting review`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("DATA STEP FAILED:", e.message);
  process.exit(1);
});
