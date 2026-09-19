/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * THE RETURN STAMP WAS BEING THROWN AWAY.
 *
 * Security's "Log Return" has always sent `eta` with the moment the truck came
 * back, but the Trip model had no such column and the PATCH whitelist dropped the
 * field. So a returned dispatch could only ever print the bare word "Returned" —
 * no date, no time — and nothing downstream could tell when the circle closed.
 *
 * Additive and idempotent: safe to re-run.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

(async () => {
  // --- 1) column ----------------------------------------------------------
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "eta" TEXT');
  console.log("ok: Trip.eta column present");
  await prisma.$disconnect();

  // --- 2) prisma schema ---------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/^\s*eta\s+String\?/m.test(schema)) {
    console.log("ok: schema.prisma already carries Trip.eta");
  } else {
    // CRLF-safe: keep whatever line ending the schema file already uses.
    const anchor = /(  \/\/\/ The gate stamp Security writes when the truck leaves the yard\.)(\r?\n)(  startTime\s+String\?)(\r?\n)/;
    must(anchor.test(schema), "schema.prisma Trip.startTime anchor");
    schema = schema.replace(anchor, (_m, doc, eol, line) =>
      [
        doc,
        line,
        "  /// When the truck came back — the gate's return stamp (closes the trip).",
        "  eta               String?",
      ].join(eol) + eol,
    );
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained eta");
  }

  // --- 3) index.ts PATCH whitelist ---------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  if (src.includes("'estimatedDate', 'startTime', 'estimatedDays', 'eta']")) {
    console.log("ok: index.ts already accepts eta");
  } else {
    const anchor = "'estimatedDate', 'startTime', 'estimatedDays'];";
    must(src.includes(anchor), "index.ts staff trip-field whitelist anchor");
    fs.writeFileSync(INDEX + ".bak-eta", src);
    src = src.replace(anchor, "'estimatedDate', 'startTime', 'estimatedDays', 'eta'];");
    fs.writeFileSync(INDEX, src);
    console.log("ok: PATCH /api/trips accepts eta (backup: index.ts.bak-eta)");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
