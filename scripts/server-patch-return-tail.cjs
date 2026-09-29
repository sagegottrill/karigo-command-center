#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — TRUCK-LEVEL RETURN COUPLES THE TAIL.
 *
 * POST /api/gate/return (the gate's "log this truck back in by plate/cap")
 * closed the dispatch, freed the driver and sent the HEAD to Check Up — but
 * never touched the TAIL riding on the truck, so the body stayed "Assigned" /
 * "Out of Yard" while it was physically standing in the yard. The dispatch-
 * level return (client completeTripReturn) already handles the tail; this
 * brings the truck-level route to the same standard:
 *
 *   - the tail named by any dispatch closed by this return goes to Check Up
 *   - the response names it so the gate's toast can say so
 *
 * Idempotent. Backs the file up. Restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-return-tail";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const changed = [];

/* --- 1: inside the dispatch-closing loop, release the tail the trip names --- */
const OLD_LOOP_TAIL = [
  "      closed += 1;",
  "      if (trip.driverName && trip.driverName !== 'Unassigned') {",
].join(eol);
const NEW_LOOP_TAIL = [
  "      closed += 1;",
  "      // The TAIL rode in with the truck — it cannot stay 'Assigned' to a",
  "      // completed run. Check Up with the head, exactly as the dispatch-level",
  "      // return already does.",
  "      const tailCode = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();",
  "      if (tailCode) {",
  "        const tk = TRUCK_KEY(tailCode);",
  "        const tails = await prisma.tail.findMany();",
  "        const tailRow = tails.find((t) => TRUCK_KEY(t.number) === tk);",
  "        if (tailRow && !['Check Up', 'Maintenance', 'Accident'].includes(String(tailRow.status))) {",
  "          await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });",
  "        }",
  "      }",
  "      if (trip.driverName && trip.driverName !== 'Unassigned') {",
].join(eol);

if (src.includes(OLD_LOOP_TAIL)) {
  src = src.replace(OLD_LOOP_TAIL, NEW_LOOP_TAIL);
  changed.push("dispatch-closing loop releases the tail to Check Up");
} else if (src.includes("tailCode = String(trip.tailNumber")) {
  changed.push("skip: tail release already present in the return loop");
} else {
  console.error("FAIL: /gate/return dispatch loop not found — layout changed");
  process.exit(1);
}

/* --- 2: the truck-level return must also flip the tail registry row even when
 * no open dispatch named it (legacy truck with no trip). The truck lookup maps
 * a truck row; find the tail by any key the caller typed. --- */
const OLD_TRUCK_SET = [
  "    // The truck itself goes to engineering, exactly as a returned truck should.",
  "    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {",
].join(eol);
const NEW_TRUCK_SET = [
  "    // The truck itself goes to engineering, exactly as a returned truck should.",
  "    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {",
  "      // The TAIL the gate was told about (or the one any closed dispatch",
  "      // carried) comes home with the head — same Check Up rule.",
  "      try {",
  "        const tailCandidates = [raw, ...stillOpen.map((t) => String(t.tailNumber || (String(t.truckReg || '').split('/')[1] || '')))]",
  "          .map((v) => TRUCK_KEY(v)).filter((k) => k.length > 2);",
  "        if (tailCandidates.length) {",
  "          const tails = await prisma.tail.findMany();",
  "          for (const tailRow of tails) {",
  "            const tn = TRUCK_KEY(tailRow.number);",
  "            if (tailCandidates.some((k) => k === tn || k.includes(tn) || tn.includes(k)) &&",
  "                !['Check Up', 'Maintenance', 'Accident'].includes(String(tailRow.status))) {",
  "              await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });",
  "              break;",
  "            }",
  "          }",
  "        }",
  "      } catch (_) { /* best-effort: the head's return stands */ }",
].join(eol);

if (src.includes(OLD_TRUCK_SET)) {
  src = src.replace(OLD_TRUCK_SET, NEW_TRUCK_SET);
  changed.push("truck-level return couples the tail registry row");
} else if (src.includes("tailCandidates")) {
  changed.push("skip: truck-level tail coupling already present");
} else {
  console.error("FAIL: /gate/return truck block not found — layout changed");
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log("Wrote " + FILE);
for (const line of changed) console.log(" - " + line);

try {
  execSync("pm2 restart fleetopsx-api --update-env", { stdio: "inherit", cwd: "/var/www/fleetopsx-api" });
  console.log("ok: pm2 restart fleetopsx-api");
} catch (e) {
  console.error("WARN: pm2 restart failed (" + e.message + ") — restart the API manually");
}
