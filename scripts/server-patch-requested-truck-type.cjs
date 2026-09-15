/**
 * One-shot server patch (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Separates the two truck vocabularies that shared one column:
 *   requestedTruckType = what the partner asked for (Full Sided, Flat, Pick Up, …)
 *   tailType           = the type of the tail Fleet Ops actually assigned
 *
 * Until now the partner request wrote the request type into `tailType` and the
 * FO assignment then overwrote it with the roster tail type ("Flatbed Tail") —
 * which is why every assigned row showed "Flatbed Tail" as the requested Truck Type.
 *
 * Run: node /tmp/patch-requested-truck-type.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DIR = "/var/www/fleetopsx-api";
const SCHEMA = path.join(DIR, "prisma/schema.prisma");
const INDEX = path.join(DIR, "index.ts");

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// ---------------------------------------------------------------- 1. schema
let schema = fs.readFileSync(SCHEMA, "utf8");
if (schema.includes("requestedTruckType")) {
  console.log("skip: schema already has requestedTruckType");
} else {
  const anchor = "  tailType          String?\r\n";
  const anchorLf = "  tailType          String?\n";
  const useCrlf = schema.includes(anchor);
  must(useCrlf || schema.includes(anchorLf), "schema tailType anchor");
  const nl = useCrlf ? "\r\n" : "\n";
  const addition =
    (useCrlf ? anchor : anchorLf) +
    "  /// What the partner asked for at request time (never overwritten by assignment)." +
    nl +
    "  requestedTruckType String?" +
    nl;
  schema = schema.replace(useCrlf ? anchor : anchorLf, addition);
  fs.writeFileSync(SCHEMA, schema);
  console.log("ok: schema requestedTruckType added");
}

// ----------------------------------------------------------------- 2. index.ts
let src = fs.readFileSync(INDEX, "utf8");
const before = src;

if (!src.includes("requestedTruckType")) {
  // Partner request creation must record the requested type separately.
  const createAnchor =
    "    tailType: req.body.tailType || null,\r\n    pickup: req.body.pickup || '',";
  const createLf =
    "    tailType: req.body.tailType || null,\n    pickup: req.body.pickup || '',";
  const crlf = src.includes(createAnchor);
  must(crlf || src.includes(createLf), "index.ts trip.create anchor");
  const nl = crlf ? "\r\n" : "\n";
  src = src.replace(
    crlf ? createAnchor : createLf,
    "    tailType: req.body.tailType || null," +
      nl +
      "    // Partner requests carry their own truck type — the assignment PATCH below" +
      nl +
      "    // writes tailType and must never clobber what was requested." +
      nl +
      "    requestedTruckType:" +
      nl +
      "      req.body.requestedTruckType || req.body.truckType || req.body.tailType || null," +
      nl +
      "    pickup: req.body.pickup || '',",
  );
  console.log("ok: POST /api/trips records requestedTruckType");
} else {
  console.log("skip: index.ts already writes requestedTruckType");
}

if (src !== before) fs.writeFileSync(INDEX, src);

// ------------------------------------------------------------- 3. prisma sync
console.log("running prisma db push …");
execSync("npx prisma db push --skip-generate --accept-data-loss", { cwd: DIR, stdio: "inherit" });
console.log("running prisma generate …");
execSync("npx prisma generate", { cwd: DIR, stdio: "inherit" });

console.log("DONE — restart the API: pm2 restart fleetopsx-api");
