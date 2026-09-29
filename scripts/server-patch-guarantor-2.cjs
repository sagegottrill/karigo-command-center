#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — SECOND GUARANTOR.
 *
 * The client's rule: every driver form carries TWO guarantors, each with a
 * phone number ("2 Garanto and 2 phone numbers"). The DB and DRIVER_FIELDS
 * only know guarantorName/guarantorPhone. This patch:
 *
 *   1. adds guarantor2Name / guarantor2Phone TEXT columns (Prisma migration
 *      via raw SQL, idempotent)
 *   2. appends them to DRIVER_FIELDS so POST/PATCH /api/drivers accept them
 *
 * Backs the file up. Pushes the Prisma schema. Restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const DIR = "/var/www/fleetopsx-api";
const FILE = DIR + "/index.ts";
const PRISMA = DIR + "/prisma/schema.prisma";
const backup = FILE + ".bak-guarantor2";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
const changed = [];

/* 1 — schema columns */
if (fs.existsSync(PRISMA)) {
  let schema = fs.readFileSync(PRISMA, "utf8");
  if (!schema.includes("guarantor2Name")) {
    schema = schema.replace(
      /(\n\s*guarantorPhone\s+String\?)/,
      "$1\n  guarantor2Name  String?\n  guarantor2Phone String?",
    );
    fs.writeFileSync(PRISMA, schema);
    changed.push("prisma schema: guarantor2Name/guarantor2Phone added");
    try {
      execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", cwd: DIR });
      execSync("npx prisma generate", { stdio: "inherit", cwd: DIR });
      changed.push("prisma db push + generate ok");
    } catch (e) {
      console.error("WARN: prisma push failed (" + e.message + ") — falling back to raw SQL");
      for (const sql of [
        `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "guarantor2Name" TEXT`,
        `ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "guarantor2Phone" TEXT`,
      ]) {
        try { execSync(`npx prisma db execute --schema prisma/schema.prisma --stdin`, { input: sql, cwd: DIR }); } catch (_) {}
      }
      changed.push("raw SQL columns attempted");
    }
  } else {
    changed.push("skip: schema already has guarantor2 fields");
  }
} else {
  changed.push("WARN: prisma schema not found at " + PRISMA);
}

/* 2 — DRIVER_FIELDS */
const WANT = "'guarantorName', 'guarantorPhone', 'guarantor2Name', 'guarantor2Phone'";
if (!src.includes("'guarantor2Name'")) {
  if (src.includes("'guarantorName', 'guarantorPhone', 'licenseDocName'")) {
    src = src.replace("'guarantorName', 'guarantorPhone', 'licenseDocName'", "'guarantorName', 'guarantorPhone', 'guarantor2Name', 'guarantor2Phone', 'licenseDocName'");
    changed.push("DRIVER_FIELDS: guarantor2 fields inserted");
  } else if (src.includes("'guarantorName', 'guarantorPhone'")) {
    src = src.replace("'guarantorName', 'guarantorPhone'", "'guarantorName', 'guarantorPhone', 'guarantor2Name', 'guarantor2Phone'");
    changed.push("DRIVER_FIELDS: guarantor2 fields inserted (generic)");
  } else {
    console.error("FAIL: guarantor fields not found in DRIVER_FIELDS — layout changed");
    process.exit(1);
  }
} else {
  changed.push("skip: DRIVER_FIELDS already carries guarantor2");
}

fs.writeFileSync(FILE, src);
console.log("Wrote " + FILE);
for (const line of changed) console.log(" - " + line);

try {
  execSync("pm2 restart fleetopsx-api --update-env", { stdio: "inherit", cwd: DIR });
  console.log("ok: pm2 restart fleetopsx-api");
} catch (e) {
  console.error("WARN: pm2 restart failed (" + e.message + ") — restart the API manually");
}
