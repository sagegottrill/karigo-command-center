/**
 * Server patch: a staff record carries what HR actually files.
 *
 * Staff Records held a name, a phone, a staff id, a licence number and a status
 * — enough to put a man on a truck, not enough to keep his file. The HR screen
 * the Transport Manager works from files four more things per person, and none
 * of them had anywhere to live:
 *
 *   department       which side of the business he belongs to (Driver, Fleet
 *                    Operation, Accounts) — the column that answers "who is
 *                    this?" when two men share a name.
 *   guarantorName    who stands for him
 *   guarantorPhone   and how to reach them
 *   licenseDocument  the licence itself, as a data URL, with the file's name and
 *                    when it was attached. The document leaves the LIST response
 *                    (only a "has one" flag crosses the wire), because a roster
 *                    of 120 people must not ship 120 scanned licences.
 *
 * Additive only: no existing field changes meaning, existing rows read as they
 * do today (the new columns arrive empty), and creating or editing staff keeps
 * working through the same allowlist — which now names the new fields.
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/* ----------------------------------------------------------------- schema ---- */

{
  const raw = fs.readFileSync(SCHEMA, "utf8");
  const eol = eolOf(raw);
  if (!raw.includes("guarantorName")) {
    const lines = raw.split(/\r?\n/);
    const at = lines.findIndex((l) => /^\s+licenseExpiry\s+String\?/.test(l));
    if (at === -1) {
      console.error("Anchor (Driver.licenseExpiry) not found — aborting.");
      process.exit(1);
    }
    lines.splice(
      at + 1,
      0,
      "",
      "  /// Which part of the business he belongs to: Driver, Fleet Operation, Accounts.",
      "  department      String?",
      "  /// Who stands for him, and how to reach them.",
      "  guarantorName   String?",
      "  guarantorPhone  String?",
      "  /// The licence document itself (data URL) with its name and attach date.",
      "  /// Never leaves the list response — staff lists carry the flag, not the bytes.",
      "  licenseDocument String?",
      "  licenseDocName  String?",
      "  licenseDocAt    DateTime?",
    );
    fs.writeFileSync(SCHEMA, lines.join(eol));
    console.log("ok: Driver department / guarantor / licence-document fields added");
  } else {
    console.log("ok: schema already carries the HR fields");
  }
}

/* ------------------------------------------------------------------ index ---- */

{
  const raw = fs.readFileSync(INDEX, "utf8");
  const eol = eolOf(raw);
  const lines = raw.split(/\r?\n/);
  let touched = 0;

  // 1. The write allowlist, so create and edit persist the new fields.
  const fieldsAt = lines.findIndex((l) => /^const DRIVER_FIELDS = \[/.test(l));
  if (fieldsAt === -1) {
    console.error("Anchor (DRIVER_FIELDS) not found — aborting.");
    process.exit(1);
  }
  const WANTED = "'name', 'phone', 'staffId', 'truckReg', 'truckReg2', 'category', 'status', 'licenseNumber', 'licenseExpiry', 'department', 'guarantorName', 'guarantorPhone', 'licenseDocName'";
  if (!lines[fieldsAt].includes("'department'")) {
    lines[fieldsAt] = `const DRIVER_FIELDS = [${WANTED}];`;
    touched += 1;
    console.log("ok: DRIVER_FIELDS now name department, guarantor and licence file");
  }

  // 2. The list must not carry the document bytes.
  const mapAt = lines.findIndex((l) => /^\s+drivers\.map\(\(d\) => \(\{$/.test(l));
  if (mapAt === -1) {
    console.error("Anchor (GET /api/drivers map) not found — aborting.");
    process.exit(1);
  }
  if (!lines.slice(mapAt, mapAt + 5).join("\n").includes("hasLicenseDoc")) {
    lines.splice(
      mapAt,
      4,
      "    drivers.map(({ licenseDocument, ...d }) => ({",
      "      ...d,",
      "      hasLicenseDoc: Boolean(licenseDocument),",
      "      openDispatches: counts.get(String(d.name || '').trim().toLowerCase()) || 0,",
      "    })),",
    );
    touched += 1;
    console.log("ok: GET /api/drivers strips the document, keeps the flag");
  }

  // 3. A scanned licence is bigger than the API's 4 MB body guard, so the
  //    upload path parses its own body and everything else keeps the guard.
  const guardAt = lines.findIndex((l) => /^app\.use\(express\.json\(\{ limit: '4mb' \}\)\);$/.test(l));
  if (guardAt === -1) {
    console.error("Anchor (global express.json limit) not found — aborting.");
    process.exit(1);
  }
  if (!lines.some((l) => l.includes("jsonBody"))) {
    lines.splice(
      guardAt,
      1,
      "const jsonBody = express.json({ limit: '4mb' });",
      "/*",
      " * Every route keeps the 4 MB body guard, except the one that carries a",
      " * scanned licence: that route parses its own body with a higher ceiling,",
      " * because a 10 MB document is normal for a photographed licence.",
      " */",
      "app.use((req, res, next) =>",
      "  req.method === 'POST' && /^\\/api\\/drivers\\/[^/]+\\/licence$/.test(req.path)",
      "    ? next()",
      "    : jsonBody(req, res, next),",
      ");",
    );
    touched += 1;
    console.log("ok: body guard skips the licence upload path");
  }

  // 4. Attach / read / remove the licence document.
  const MARK = "// ---- A staff member's licence document ----------------------------------";
  if (!lines.some((l) => l.includes(MARK.slice(0, 40)))) {
    const anchorAt = lines.findIndex((l) => l.startsWith("app.delete('/api/drivers/:id'"));
    if (anchorAt === -1) {
      console.error("Anchor (DELETE /api/drivers/:id) not found — aborting.");
      process.exit(1);
    }
    const DOC_ROUTES = `${MARK}
/*
 * The licence itself.
 *
 * Scanned licences are the one part of a staff file that is genuinely a
 * document: the record has to be able to say what is attached and hand it back
 * to the Transport Manager, without every roster load carrying it. The upload
 * takes a data URL (the same shape a captured signature already travels in)
 * and is capped at the 10 MB the form promises, with a route-scoped body limit
 * so the rest of the API keeps its 4 MB ceiling.
 */
app.post('/api/drivers/:id/licence', authenticate, express.json({ limit: '12mb' }), async (req, res) => {
  const fileName = String(req.body?.fileName || '').trim();
  const dataUrl = String(req.body?.dataUrl || '');
  if (!fileName) return res.status(400).json({ error: 'A file name is required.' });
  const match = /^data:([a-z0-9.+\\/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'The document must be sent as a base64 data URL.' });
  const mime = match[1].toLowerCase();
  const bytes = Math.floor((match[2].length * 3) / 4);
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mime)) {
    return res.status(400).json({ error: 'The licence must be a PDF or an image (JPG, PNG, WEBP).' });
  }
  if (bytes > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'That file is larger than 10 MB.' });
  }
  try {
    const row = await prisma.driver.update({
      where: { id: req.params.id },
      data: { licenseDocument: dataUrl, licenseDocName: fileName, licenseDocAt: new Date() },
      select: { id: true, name: true, staffId: true, licenseDocName: true, licenseDocAt: true },
    });
    try {
      await notify('HR & Personnel', 'Licence Document Attached',
        row.licenseDocName + ' was attached to ' + row.name + ' (' + row.staffId + ').',
        'info', 'Transport Manager,HR & Personnel',
        { module: 'HR & Personnel', eventKey: 'staff.licence_document', refId: row.id, refLabel: row.staffId });
    } catch (_) { /* the document stands even if the alert fails */ }
    res.json({ ok: true, ...row, hasLicenseDoc: true });
  } catch (e) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Staff record not found' });
    console.error('POST /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not attach the document.' });
  }
});

app.get('/api/drivers/:id/licence', authenticate, async (req, res) => {
  try {
    const row = await prisma.driver.findUnique({
      where: { id: req.params.id },
      select: { name: true, staffId: true, licenseDocName: true, licenseDocAt: true, licenseDocument: true },
    });
    if (!row) return res.status(404).json({ error: 'Staff record not found' });
    res.json({
      fileName: row.licenseDocName || null,
      attachedAt: row.licenseDocAt || null,
      dataUrl: row.licenseDocument || null,
    });
  } catch (e) {
    console.error('GET /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not read the document.' });
  }
});

app.delete('/api/drivers/:id/licence', authenticate, async (req, res) => {
  try {
    await prisma.driver.update({
      where: { id: req.params.id },
      data: { licenseDocument: null, licenseDocName: null, licenseDocAt: null },
    });
    res.status(204).end();
  } catch (e) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Staff record not found' });
    console.error('DELETE /api/drivers/:id/licence failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not remove the document.' });
  }
});

`;
    lines.splice(anchorAt, 0, ...DOC_ROUTES.split("\n"));
    touched += 1;
    console.log("ok: licence document routes inserted");
  }

  if (touched > 0) {
    fs.writeFileSync(INDEX, lines.join(eol));
    console.log(`index.ts written (${touched} change${touched === 1 ? "" : "s"})`);
  } else {
    console.log("ok: index.ts already carries the HR changes");
  }
}

/* ------------------------------------------------------------------- data ---- */

(async () => {
  const prisma = new PrismaClient();
  const columns = [
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "department" TEXT`,
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "guarantorName" TEXT`,
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "guarantorPhone" TEXT`,
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "licenseDocument" TEXT`,
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "licenseDocName" TEXT`,
    `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "licenseDocAt" TIMESTAMP(3)`,
  ];
  for (const sql of columns) await prisma.$executeRawUnsafe(sql);
  const [{ total }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS total FROM "Driver"`);
  const [{ licensed }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS licensed FROM "Driver" WHERE "licenseNumber" IS NOT NULL AND "licenseNumber" <> ''`,
  );
  const [{ docs }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS docs FROM "Driver" WHERE "licenseDocument" IS NOT NULL`,
  );
  const [{ departments }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS departments FROM "Driver" WHERE "department" IS NOT NULL AND "department" <> ''`,
  );
  console.log(`columns applied · ${total} staff · ${licensed} with a licence number · ${departments} with a department · ${docs} document(s) on file`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("DATA STEP FAILED:", e.message);
  process.exit(1);
});
