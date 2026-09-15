import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
// Drivers now come from Fortune File - Driver.xlsx via generate-driver-roster.mjs

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sheetRows(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
}

const cabWb = XLSX.readFile(path.join(root, "Fortune File (1).xlsx"));
const drvWb = XLSX.readFile(path.join(root, "Petroline_Driver_Staff_List_Complete (1).xlsx"));

const cab = sheetRows(cabWb, "CAB")
  .slice(1)
  .map((r) => ({
    cabId: String(r[0] || "").trim(),
    plate: String(r[1] || "")
      .trim()
      .replace(/\s+/g, " "),
    category: String(r[2] || "").trim() || "Unknown",
    destination: String(r[3] || "").trim(),
  }))
  .filter((r) => r.cabId && r.plate);

const body = sheetRows(cabWb, "Body")
  .slice(1)
  .map((r) => ({
    bodyId: String(r[0] || "").trim(),
    plate: "",
    type: "Trailer",
    destination: "",
  }))
  .filter((r) => /^B\d+/i.test(r.bodyId));

const outPath = path.join(root, "src/lib/fleetopsx/petroline-roster.ts");
const out = `/**
 * Petroline Transport Ltd fleet roster — single source of truth for Cap (CAB)
 * and Body (tails). Generated from Fortune File (1).xlsx.
 * Drivers come from "Fortune File - Driver.xlsx" via generate-driver-roster.mjs.
 * Do not show raw API UUIDs in UI; enrich live records via these codes.
 */
export type PetrolineCab = {
  cabId: string;
  plate: string;
  category: string;
  destination: string;
};

export type PetrolineBody = {
  bodyId: string;
  plate: string;
  type: string;
  destination: string;
};

export const PETROLINE_CABS: PetrolineCab[] = ${JSON.stringify(cab, null, 2)};

export const PETROLINE_BODIES: PetrolineBody[] = ${JSON.stringify(body, null, 2)};
`;

fs.writeFileSync(outPath, out);
console.log("wrote", outPath, "cab", cab.length, "body", body.length);
