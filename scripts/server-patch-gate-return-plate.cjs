/**
 * Server patch: gate RETURN must find the truck by the FULL plate it stamped,
 * not just the first space/slash token.
 *
 * The return handler did `reg === gatePlateKey(entry.truckReg)` — the key is the
 * FIRST token only, so any registration holding a space ("E2E-TRK 2026", or a
 * guard typing "P031 (DKA321XQ)" with the tail of the stored spelling) failed
 * the strict equality and the truck stayed "Out of Yard" for ever after its
 * dispatch closed. Departure already matches loosely (prefix `includes`); the
 * return leg was the odd one out.
 *
 * Also: a head that comes home is only sent to Check Up when NO other
 * still-open dispatch names it — two dispatches can name one truck, and the
 * closing of the first must not yank the truck from under the second.
 *
 * Run ON the VPS from /var/www/fleetopsx-api:  node scripts-patch/e2e-gatereturn.cjs
 * (uploaded by the deploy step). Idempotent via the GATERETURN:V2 marker.
 */
const fs = require("fs");
const path = "/var/www/fleetopsx-api/index.ts";
const ARCHIVE = "/root/fleetopsx-archive";

const OLD = `            const truckRow = trucks.find((t) => {
              const reg = String(t.registration || '').toUpperCase();
              const cab = String(t.cabId || '').toUpperCase();
              return reg === returnPlateKey || cab === returnPlateKey;
            });
            if (truckRow && !['Check Up', 'Maintenance', 'Accident'].includes(String(truckRow.status))) {
              await prisma.truck.update({ where: { id: truckRow.id }, data: { status: 'Check Up' } });
            }`;

const NEW = `            // GATERETURN:V2 — match the head by the FULL plate it stamped (the
            // old strict === against the first-token key silently failed every
            // registration holding a space, e.g. "E2E-TRK 2026"), and do not
            // send it to Check Up while ANOTHER still-open dispatch names it.
            const returnPlate = String(entry.truckReg || '').trim().toUpperCase();
            const truckRow = trucks.find((t) => {
              const reg = String(t.registration || '').toUpperCase();
              const cab = String(t.cabId || '').toUpperCase();
              return reg === returnPlate || reg === returnPlateKey || reg.startsWith(returnPlateKey + ' ') ||
                cab === returnPlate || cab === returnPlateKey || cab.startsWith(returnPlateKey + ' ');
            });
            let truckBusyElsewhere = false;
            if (truckRow) {
              const openTripsForTruck = await prisma.trip.findMany({
                where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
                select: { id: true, truckReg: true },
              });
              truckBusyElsewhere = openTripsForTruck.some((t2) => t2.id !== closed.id &&
                String(t2.truckReg || '').trim().toUpperCase() === String(truckRow.registration || '').trim().toUpperCase());
            }
            if (truckRow && !truckBusyElsewhere && !['Check Up', 'Maintenance', 'Accident'].includes(String(truckRow.status))) {
              await prisma.truck.update({ where: { id: truckRow.id }, data: { status: 'Check Up' } });
            }`;

let js = fs.readFileSync(path, "utf8");
if (js.includes("GATERETURN:V2")) {
  console.log("GATERETURN:V2 already applied — skipping");
  process.exit(0);
}
if (!js.includes(OLD)) {
  const i = js.indexOf("const truckRow = trucks.find");
  console.error("PATCH TARGET NOT FOUND. Window around truckRow lookup:");
  console.error(i >= 0 ? js.slice(Math.max(0, i - 120), i + 420) : "(no truckRow lookup at all)");
  process.exit(1);
}
fs.mkdirSync(ARCHIVE, { recursive: true });
fs.copyFileSync(path, ARCHIVE + "/index.ts.bak-gatereturn");
js = js.replace(OLD, NEW);
fs.writeFileSync(path, js);
console.log("Patched (GATERETURN:V2). Backup: " + ARCHIVE + "/index.ts.bak-gatereturn");
