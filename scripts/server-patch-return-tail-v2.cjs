#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — RETURN-COUPLES-TAIL v2.
 *
 * Security's truck-level return (POST /api/gate/return) sent the truck HEAD to
 * Check Up but never touched the TAIL riding on it, so bodies stayed
 * "Assigned" / "Out of Yard" — reading as "in transit" — while the truck stood
 * in the yard. The dispatch-level return (client completeTripReturn) already
 * releases the tail; this brings the truck-level route to the same standard,
 * in both places a tail is reachable:
 *
 *   1. inside the dispatch-closing loop — the tail each closed trip names
 *      goes to Check Up with the head;
 *   2. the truck-level block — the tail the gate was told about (or any closed
 *      dispatch carried) couples even when no open dispatch named it, and the
 *      response reports tailsReleased.
 *
 * Idempotent. Backs the file up. esbuild-verifies before writing.
 * Restarts the API.
 */
const fs = require("fs");
const { execFileSync, execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-return-tail-v2";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const eol = "\n";
const changed = [];

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

/* --- 1: inside the dispatch-closing loop, release the tail the trip names --- */
const OLD_LOOP_TAIL = [
  "      closed += 1;",
  "      if (trip.driverName && trip.driverName !== 'Unassigned') {",
].join(eol);
const NEW_LOOP_TAIL = [
  "      closed += 1;",
  "      // RETURN-COUPLES-TAIL — the TAIL rode in with the truck; it cannot stay",
  "      // 'Assigned'/'Out of Yard' to a completed run while the head stands on",
  "      // Check Up. Same rule the dispatch-level return already applies.",
  "      const tailCode = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();",
  "      if (tailCode) {",
  "        const tk = TRUCK_KEY(tailCode);",
  "        const tails = await prisma.tail.findMany();",
  "        const tailRow = tails.find((t) => TRUCK_KEY(t.number) === tk);",
  "        if (tailRow && !['Check Up', 'Maintenance', 'Accident'].includes(String(tailRow.status))) {",
  "          await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });",
  "          tailsReleased += 1;",
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

/* --- loop counter declaration --- */
const OLD_COUNTER = [
  "    let closed = 0;",
  "    const freed: string[] = [];",
].join(eol);
const NEW_COUNTER = [
  "    let closed = 0;",
  "    const freed: string[] = [];",
  "    let tailsReleased = 0;",
].join(eol);
if (src.includes(NEW_COUNTER)) {
  changed.push("skip: tailsReleased counter already declared");
} else if (src.includes(OLD_COUNTER)) {
  src = src.replace(OLD_COUNTER, NEW_COUNTER);
  changed.push("tailsReleased counter declared");
} else {
  console.error("FAIL: dispatch counters not found — layout changed");
  process.exit(1);
}

/* --- 2: the truck-level block couples the tail registry row --- */
const OLD_TRUCK_SET = [
  "    // The truck itself goes to engineering, exactly as a returned truck should.",
  "    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {",
].join(eol);
const NEW_TRUCK_SET = [
  "    // The truck itself goes to engineering, exactly as a returned truck should.",
  "    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {",
  "      // RETURN-COUPLES-TAIL (truck level) — the tail the gate was told about",
  "      // (or the one any closed dispatch carried) comes home with the head,",
  "      // even when no open dispatch named it (a legacy truck logged by plate).",
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
  "              tailsReleased += 1;",
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

/* --- 3: response reports the tails released --- */
const OLD_RESP = [
  "      dispatchClosed: closed,",
  "      driversFreed: freed,",
].join(eol);
const NEW_RESP = [
  "      dispatchClosed: closed,",
  "      driversFreed: freed,",
  "      tailsReleased,",
].join(eol);
if (src.includes(NEW_RESP)) {
  changed.push("skip: response already reports tailsReleased");
} else if (src.includes(OLD_RESP)) {
  src = src.replace(OLD_RESP, NEW_RESP);
  changed.push("response reports tailsReleased");
} else {
  console.error("FAIL: /gate/return response block not found — layout changed");
  process.exit(1);
}

/* --- esbuild gate: nothing is written unless the patched file compiles --- */
fs.writeFileSync("/tmp/index.tail-v2.ts", src);
const ESBUILD = "/var/www/fleetopsx-api/node_modules/.bin/esbuild";
try {
  execFileSync(ESBUILD, ["/tmp/index.tail-v2.ts", "--outfile=/tmp/index.tail-v2.js"], { stdio: "pipe" });
  console.log("ok: esbuild compiles the patched file");
} catch (e) {
  console.error("FAIL: esbuild rejected the patch — nothing written");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 12).join("\n"));
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
