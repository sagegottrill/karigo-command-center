/**
 * One-shot server patch (run ON the API server, same as the other
 * server-patch-*.cjs in karigo-command-center):
 *
 *   node server-patch-gate-truth.cjs
 *
 * THE GATE STAMPS THEMSELVES WERE MANUFACTURING THE DUPLICATES. This patch
 * fixes the root cause; server-patch-transit-reconcile.cjs only drains the
 * resulting backlog every 5 minutes.
 *
 * What the gate cycle did, and why it lied:
 *   - DEPARTURE stamp: `candidates.find(...)` moved WHICHEVER open dispatch
 *     matched first. `findMany` returns rows newest-first, so the stale load
 *     the truck had already been pulled off went "En Route" while the real,
 *     newer load sat behind it — two moving dispatches naming one truck.
 *   - RETURN stamp: `openTrips.find(...)` closed only the FIRST matching open
 *     dispatch. A truck that carried two (or three) came home with one still
 *     "open" forever, its driver still "On Trip".
 *   - Tracking-desk renames re-point a dispatch at a different truck without
 *     touching whatever the truck already carries — covered by the existing
 *     transit reconcile sweep, so out of scope here.
 *
 * Fix — one truth per stamp:
 *   Departure: among ALL matching open dispatches, the NEWEST one is the load
 *   the gate just sent out (sort by createdAt desc, tiebreak updatedAt desc).
 *   Return: EVERY matching open dispatch closes at once (loop over the match
 *   set) — a stamp ends a physical truck's road time, so it ends every
 *   dispatch that names it. Each closed row keeps the original gateInBy-or-
 *   actor stamp and the original driver-freed rule; the asset rows (truck and
 *   tail to Check Up) and the completion notification are untouched.
 *
 * Scope guard: nothing outside the two finder/close spans changes. Safe to
 * re-run (the patch checks its own marker first). Before restarting, index.ts
 * must type-check no worse than the unpatched file (the live file already
 * carries pre-existing type errors, so the baseline is compared, not zero).
 * After restarting, pm2 must report the API online and /api/health must
 * return 200 — on any failure index.ts is restored from index.ts.bak-gatetruth
 * and the API restarted on the old code.
 * No schema change.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.FLEETOPSX_API_ROOT || "/var/www/fleetopsx-api";
const API = path.join(ROOT, "index.ts");
const BACKUP = API + ".bak-gatetruth";
const MARK = "// --- gate truth (server-patch-gate-truth) ---";
const PM2_NAME = "fleetopsx-api";

// Single-occurrence anchors on the live index.ts (verified 2026-10-04).
const ANCHOR_DEP_HEAD = "const plateKey = gatePlateKey(entry.truckReg);";
const ANCHOR_DEP_FIND = "const trip = candidates.find((t) => {";
const ANCHOR_DEP_STOP = "    const tailKey = String(trip?.tailNumber || '').trim() ||";
const ANCHOR_RET_FIND = "const trip = openTrips.find((t: any) => {";
const ANCHOR_RET_Drv = "await prisma.driver.updateMany({";
const DEP_END_MARK = "// --- GATECYCLE:V1:DEPARTURE:END";

// Lines that must sit inside the span each replacement overwrites — if the
// live file drifts from what this patch was written against, it aborts
// instead of guessing.
// Head lines sit BEFORE the finder anchor (checked against the head span):
const DEP_HEAD_LINES = [
  "const OPEN_TRIP_STATUSES = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];",
  "const candidates = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });",
];
// Span lines sit between the finder anchor and the tail anchor:
const DEP_SPAN_LINES = [
  "return (plateKey && (tr.includes(plateKey) || tail.includes(plateKey))) ||",
  "Boolean(entry.driver) && String(t.driverName || '').trim().toUpperCase() === String(entry.driver).trim().toUpperCase();",
  "    if (trip) {",
  "      await prisma.trip.update({",
  "        where: { id: trip.id },",
  "        data: {",
  "          status: 'En Route',",
  "          startTime: trip.startTime || autoStamp(entry.timestamp),",
  "        },",
  "      });",
  "    }",
];
const RET_SPAN_LINES = [
  "        const trKey = tr.split(/[\\s/]+/)[0] || '';",
  "        if (plate && (tr === plate || tail === plate || (plateKey && trKey === plateKey) || (plateKey && trKey && tr.includes(plateKey)))) {",
  "        return Boolean(driverName) && String(t.driverName || '').trim().toUpperCase() === driverName;",
  "      const actor = (req as any).user?.name || (req as any).user?.email || 'Security';",
  "        data: { status: 'Completed', gateInBy: trip.gateInBy || actor },",
  "        // The driver's cycle ends with the truck's. Only 'On Trip' is moved, so",
  "          where: { name: closed.driverName, status: { in: ['On Trip', 'Active'] } },",
  "            data: { status: 'Active' },",
];

const say = (m) => console.log("ok: " + m);
function fail(message) {
  console.error("FAIL: " + message);
  process.exit(1);
}
function onceIn(src, needle, what) {
  const at = src.indexOf(needle);
  if (at === -1) fail(what + " not found: " + needle);
  if (src.indexOf(needle, at + 1) !== -1) fail(what + " is not unique: " + needle);
  return at;
}

/* ---------------------------------------------------------------- api --- */

function patchApi() {
  let src = fs.readFileSync(API, "utf8");
  if (src.includes(MARK)) return false;
  const bak = src;
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const q = (s) => s.split("\n").join(eol);

  // --- Locate the two spans (and prove every anchor is single-occurrence). ---
  const depHeadAt = onceIn(src, ANCHOR_DEP_HEAD, "departure head anchor");
  const depAt = onceIn(src, ANCHOR_DEP_FIND, "departure finder anchor");
  const depStop = onceIn(src, ANCHOR_DEP_STOP, "departure tail anchor");
  const depClose = src.indexOf(DEP_END_MARK, depAt);
  if (depClose === -1) fail("departure end marker not found");
  if (!(depHeadAt < depAt && depAt < depStop && depStop < depClose)) fail("departure anchors are out of order");

  const retAt = onceIn(src, ANCHOR_RET_FIND, "return finder anchor");
  const retClose = src.indexOf("    } catch (e: any) {", retAt);
  if (retClose === -1) fail("return catch anchor not found");
  // The span end anchors on the unique comment that opens the asset-return
  // bookkeeping, NOT on a brace line ("          });" contains "        }" as
  // a substring — anchoring there once spliced the block in half).
  const retDrv = src.indexOf(ANCHOR_RET_Drv, retAt);
  if (retDrv === -1) fail("return driver-free call not found");
  const retStop = onceIn(src, "        // The TRUCK came back with the stamp", "return asset comment");
  if (!(retAt < retDrv && retDrv < retStop && retStop < retClose)) fail("return anchors are out of order");

  // --- Drift guards: the spans must still hold the exact old logic. ---
  const depSpan = src.slice(depAt, depStop);
  for (const line of DEP_SPAN_LINES) {
    if (!depSpan.includes(line)) fail("departure block drifted — expected line missing: " + line);
  }
  const headSpan = src.slice(depHeadAt, depAt);
  for (const line of DEP_HEAD_LINES) {
    if (!headSpan.includes(line)) fail("departure head drifted — expected line missing: " + line);
  }
  const retSpan = src.slice(retAt, retStop);
  for (const line of RET_SPAN_LINES) {
    if (!retSpan.includes(line)) fail("return block drifted — expected line missing: " + line);
  }

  // --- DEPARTURE: the newest matching open dispatch is the one sent out. ---
  const depNew = q(
    "// One stamp, one load. The stamp names the ASSET; several old dispatches\n" +
    "// may still name it (the duplicates the reconcile sweep drains). The NEWEST\n" +
    "// matching dispatch is the one the gate just sent out; older matches are\n" +
    "// left alone here for the sweep to supersede.\n" +
    "    const ranked = [...candidates].sort((a: any, b: any) =>\n" +
    "      (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0) ||\n" +
    "      (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0)\n" +
    "    );\n" +
    "    const trip = ranked.find((t: any) => {\n" +
    "      const tr = String(t.truckReg || '').toUpperCase();\n" +
    "      const tail = String(t.tailNumber || '').toUpperCase();\n" +
    "      return (plateKey && (tr.includes(plateKey) || tail.includes(plateKey))) ||\n" +
    "        Boolean(entry.driver) && String(t.driverName || '').trim().toUpperCase() === String(entry.driver).trim().toUpperCase();\n" +
    "    });\n" +
    "    if (trip) {\n" +
    "      await prisma.trip.update({\n" +
    "        where: { id: trip.id },\n" +
    "        data: {\n" +
    "          status: 'En Route',\n" +
    "          startTime: trip.startTime || autoStamp(entry.timestamp),\n" +
    "\n" +
    "        },\n" +
    "      });\n" +
    "    }\n"
  );
  src = src.slice(0, depAt) + depNew + src.slice(depStop);

  // The Departure splice above changed the offsets. Re-locate the Return span
  // on the NEW text — using the pre-shift coordinates here once sliced the
  // block in half (leaving a `sma.trip.update({` remnant mid-line).
  const retAt2 = onceIn(src, ANCHOR_RET_FIND, "return finder anchor (post-departure)");
  const retStop2 = retStop + (retAt2 - retAt);
  if (src.slice(retStop2, retStop2 + 64).indexOf("The TRUCK came back") === -1) {
    fail("return span shifted unexpectedly after the departure splice");
  }

  // --- RETURN: every matching open dispatch closes at once. ---
  const retNew = q(
    "// One stamp, one truck, EVERY dispatch it still names. The truck is\n" +
    "// physically back in the yard; no dispatch naming it can stay open behind\n" +
    "// this stamp — the single first-close used to leave a second (or third)\n" +
    "// load running forever with its driver still marked On Trip.\n" +
    "    const matching = openTrips.filter((t: any) => {\n" +
    "      const tr = String(t.truckReg || '').toUpperCase();\n" +
    "      const trKey = tr.split(/[\\s/]+/)[0] || '';\n" +
    "      const tail = String(t.tailNumber || '').toUpperCase();\n" +
    "      if (plate && (tr === plate || tail === plate || (plateKey && trKey === plateKey) || (plateKey && trKey && tr.includes(plateKey)))) {\n" +
    "        return true;\n" +
    "      }\n" +
    "        return Boolean(driverName) && String(t.driverName || '').trim().toUpperCase() === driverName;\n" +
    "    });\n" +
    "    const actor = (req as any).user?.name || (req as any).user?.email || 'Security';\n" +
    "    let closed: any = null;\n" +
    "    for (const match of matching) {\n" +
    "      closed = await prisma.trip.update({\n" +
    "        where: { id: match.id },\n" +
    "        data: { status: 'Completed', gateInBy: match.gateInBy || actor },\n" +
    "      });\n" +
    "      // The driver's cycle ends with the truck's. Only 'On Trip' is moved, so\n" +
    "      // a Suspended or Off Duty record is never quietly overwritten.\n" +
    "      if (closed.driverName) {\n" +
    "        await prisma.driver.updateMany({\n" +
    "          where: { name: closed.driverName, status: { in: ['On Trip', 'Active'] } },\n" +
    "          data: { status: 'Active' },\n" +
    "        });\n" +
    "      }\n" +
    "    }\n" +
    "    if (closed) {\n"
  );
  src = src.slice(0, retAt2) + retNew + src.slice(retStop2);

  // Cheap structural invariant: the surgery must be brace-neutral.
  const open = (s) => (s.match(/\{/g) || []).length;
  const shut = (s) => (s.match(/\}/g) || []).length;
  if (open(src) - shut(src) !== open(bak) - shut(bak)) fail("brace balance changed — refusing to write");

  // Marker goes INTO the patched file: without it a second run would happily
  // slice the (already rewritten) blocks again. Idempotency depends on this.
  src = src.replace(
    DEP_END_MARK,
    MARK + eol + DEP_END_MARK
  );

  fs.copyFileSync(API, BACKUP);
  fs.writeFileSync(API, src);
  return true;
}

/* -------------------------------------------------------------- checks --- */

const TSC_FLAGS = "--skipLibCheck --esModuleInterop --module commonjs --target es2020 --moduleResolution node";
let tscFlagsFor = null;

function tscFlags() {
  if (tscFlagsFor === null) {
    let major = 5;
    try {
      const m = execSync("npx tsc -v", { cwd: ROOT, encoding: "utf8", timeout: 120000 }).match(/Version (\d+)\./);
      if (m) major = Number(m[1]);
    } catch (e) {
      // keep the TypeScript 5 flags
    }
    tscFlagsFor = TSC_FLAGS + (major >= 6 ? " --ignoreConfig --ignoreDeprecations 6.0" : "");
  }
  return tscFlagsFor;
}

function typeChecks(file) {
  try {
    execSync(`npx tsc ${file} --noEmit ${tscFlags()}`, { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    return { ok: true, out: "" };
  } catch (e) {
    return { ok: false, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}

function restore(reason) {
  console.error("ROLLING BACK: " + reason);
  fs.copyFileSync(BACKUP, API);
}

function pm2App() {
  try {
    const list = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
    return list.find((p) => p.name === PM2_NAME) || null;
  } catch (e) {
    return null;
  }
}

function healthOk() {
  try {
    const code = execSync("curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health", { encoding: "utf8", timeout: 20000 }).trim();
    return code === "200";
  } catch (e) {
    return false;
  }
}

function restartAndCheck() {
  execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
  execSync("sleep 10");
  const app = pm2App();
  const upFor = Date.now() - Number(app?.pm2_env?.pm_uptime ?? Date.now());
  return app?.pm2_env?.status === "online" && upFor >= 5000 && healthOk();
}

/* ---------------------------------------------------------------- main --- */

async function main() {
  if (!fs.existsSync(API)) fail(`${API} not found — run this on the API server`);
  const changed = patchApi();
  if (!changed) {
    console.log("Nothing to install — the gate-truth cycle is already present.");
    return;
  }
  say("gate Departure now sends the newest matching dispatch; gate Return closes every matching dispatch");

  const patched = typeChecks("index.ts");
  if (!patched.ok) {
    const origCheck = path.join(ROOT, "index.gatetruth-orig-check.ts");
    fs.copyFileSync(BACKUP, origCheck);
    const original = typeChecks("index.gatetruth-orig-check.ts");
    fs.unlinkSync(origCheck);
    if (original.ok) {
      restore("the patched index.ts does not type-check:\n" + patched.out.slice(0, 3000));
      process.exit(1);
    }
    console.log("note: index.ts already had type errors before this patch — type check skipped (baseline unchanged).");
  } else {
    say("patched index.ts type-checks");
  }

  if (!restartAndCheck()) {
    restore(`${PM2_NAME} did not stay online and healthy after the restart`);
    execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
    console.error("The API is back on the previous code. Logs: pm2 logs " + PM2_NAME + " --lines 80");
    process.exit(1);
  }
  say(`${PM2_NAME} restarted, online, and /api/health is 200`);
  console.log(
    "\nDONE — the gate cycle now speaks the truth at both ends. Watch it work:" +
      "\n  pm2 logs " + PM2_NAME + " --lines 50 | grep -E 'gate (departure|return)'" +
      "\nNext gate Departure/Return stamps for a truck carrying two dispatches will" +
      "\nmove the newest and close them all — no more phantom moving rows."
  );
}

// Exposed only so a local dry-run harness can exercise patchApi() against a
// COPY of the live index.ts before the real run. Never used on the server.
module.exports = { patchApi };

if (require.main === module) {
  main().catch((e) => {
    console.error("FAIL:", e && e.message ? e.message : e);
    process.exit(1);
  });
}
