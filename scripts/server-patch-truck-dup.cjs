/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Adding a truck with a number the fleet already uses crashed with a raw 500
 * (Prisma P2002 escaping the handler), so the Transport Manager's new Manage
 * Fleet form could not tell "that number is taken" from "the server broke".
 * Both fleet asset writes now answer 409 with a sentence.
 *
 * Idempotent.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

let src = fs.readFileSync(INDEX, "utf8");

if (src.includes("A truck with this number already exists")) {
  console.log("ok: truck duplicate handling already installed");
  process.exit(0);
}

const CREATE_RE =
  /app\.post\('\/api\/trucks', authenticate, authorize\('Platform Admin', 'Transport Manager'\), async \(req, res\) => \{\r?\n\s*res\.json\(await prisma\.truck\.create\(\{ data: req\.body \}\)\);\r?\n\}\);/;
const PATCH_RE =
  /app\.patch\('\/api\/trucks\/:id', authenticate, async \(req, res\) => \{\r?\n\s*res\.json\(await prisma\.truck\.update\(\{ where: \{ id: req\.params\.id \}, data: req\.body \}\)\);\r?\n\}\);/;

must(CREATE_RE.test(src), "POST /api/trucks handler");
must(PATCH_RE.test(src), "PATCH /api/trucks/:id handler");

fs.writeFileSync(INDEX + ".bak-truckdup", src);

src = src.replace(
  CREATE_RE,
  [
    "// The cap number is UNIQUE: a duplicate is the operator's mistake, not a crash.",
    "app.post('/api/trucks', authenticate, authorize('Platform Admin', 'Transport Manager'), async (req, res) => {",
    "  try {",
    "    res.json(await prisma.truck.create({ data: req.body }));",
    "  } catch (e: any) {",
    "    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });",
    "    throw e;",
    "  }",
    "});",
  ].join("\n"),
);

src = src.replace(
  PATCH_RE,
  [
    "app.patch('/api/trucks/:id', authenticate, async (req, res) => {",
    "  try {",
    "    res.json(await prisma.truck.update({ where: { id: req.params.id }, data: req.body }));",
    "  } catch (e: any) {",
    "    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });",
    "    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Truck not found' });",
    "    throw e;",
    "  }",
    "});",
  ].join("\n"),
);

fs.writeFileSync(INDEX, src);
console.log("ok: POST/PATCH /api/trucks answer 409 on a duplicate number (backup: index.ts.bak-truckdup)");
