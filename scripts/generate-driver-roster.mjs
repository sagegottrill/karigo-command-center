import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

/**
 * Regenerates the frontend driver roster from Fortune's NEW authoritative
 * sheet ("Fortune File - Driver.xlsx", Driver Staff List: SN / Staff No. /
 * Staff Name / Staff Phone Number — 4-digit P#### numbers).
 * Dedupes: one row per staff number (first wins) and one per person.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const wb = XLSX.readFile(path.join(root, "Fortune File - Driver.xlsx"));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Driver Staff List"], { header: 1, defval: "" });

const drivers = [];
const seenSalary = new Set();
const seenPerson = new Set();
for (const r of rows.slice(3)) {
  const salary = String(r[1] || "").trim();
  const name = String(r[2] || "").trim();
  const phone = String(r[3] || "").trim();
  if (!/^P\d+/i.test(salary) || !name) continue;
  const salaryKey = salary.toUpperCase();
  if (seenSalary.has(salaryKey)) {
    console.warn(`duplicate staff number ${salary} (${name}) — skipped, first row wins`);
    continue;
  }
  seenSalary.add(salaryKey);
  const personKey = `${name.toLowerCase()}|${phone.replace(/\D/g, "").slice(-10)}`;
  if (seenPerson.has(personKey)) continue;
  seenPerson.add(personKey);
  drivers.push({ salaryNumber: salary, name, phone });
}

const out = `/**
 * Petroline driver roster — generated from "Fortune File - Driver.xlsx"
 * (Driver Staff List, Fortune's authoritative staff numbers).
 * Staff numbers are the sheet's own 4-digit format (P0017…P1020).
 * Do not edit by hand; run scripts/generate-driver-roster.mjs.
 */
export type PetrolineDriver = {
  salaryNumber: string;
  name: string;
  phone: string;
};

export const PETROLINE_DRIVERS: PetrolineDriver[] = ${JSON.stringify(drivers, null, 2)};
`;

fs.writeFileSync(path.join(root, "src/lib/fleetopsx/petroline-drivers.ts"), out);
console.log("wrote petroline-drivers.ts with", drivers.length, "drivers");
