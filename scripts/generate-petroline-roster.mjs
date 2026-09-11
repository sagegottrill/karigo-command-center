import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

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

const drivers = [];
for (const r of sheetRows(drvWb, "Driver Staff List")) {
  const salary = String(r[1] || "").trim();
  const name = String(r[2] || "").trim();
  const phone = String(r[3] || "").trim();
  const cabId = String(r[4] || "").trim();
  if (!/^P\d+/i.test(salary) || !name) continue;
  drivers.push({
    salaryNumber: salary,
    name,
    phone,
    cabId: /^P\d+/i.test(cabId) ? cabId : "",
  });
}

for (const r of sheetRows(drvWb, "Spare Drivers")) {
  const salary = String(r[0] || "").trim();
  const name = String(r[1] || "").trim();
  const phone = String(r[2] || "").trim();
  if (!/^P\d+/i.test(salary) || !name) continue;
  drivers.push({ salaryNumber: salary, name, phone, cabId: "" });
}

const outPath = path.join(root, "src/lib/fleetopsx/petroline-roster.ts");
const out = `/**
 * Petroline Transport Ltd fleet roster — single source of truth for Cap (CAB),
 * Body (tails), and driver salary numbers. Generated from Fortune File + Driver Staff List.
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

export type PetrolineDriver = {
  salaryNumber: string;
  name: string;
  phone: string;
  cabId: string;
};

export const PETROLINE_CABS: PetrolineCab[] = ${JSON.stringify(cab, null, 2)};

export const PETROLINE_BODIES: PetrolineBody[] = ${JSON.stringify(body, null, 2)};

export const PETROLINE_DRIVERS: PetrolineDriver[] = ${JSON.stringify(drivers, null, 2)};
`;

fs.writeFileSync(outPath, out);
console.log("wrote", outPath, "cab", cab.length, "body", body.length, "drivers", drivers.length);
