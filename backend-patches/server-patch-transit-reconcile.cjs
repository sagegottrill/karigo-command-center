/**
 * One-shot server patch (run ON the API server, same as the other
 * scripts/server-patch-*.cjs in karigo-command-center):
 *
 *   node server-patch-transit-reconcile.cjs
 *
 * THE IN-TRANSIT CARD TOLD THE TRUTH — THE DATA LIED. THIS HEALS THE DATA.
 *
 * The TM's Central Dashboard read "In Transit: 80, On the road now" while the
 * Total card's own breakdown said "In transit: 0" for the day, the map plotted
 * "80 of 80", and the Staff Registry counted 55 drivers on active trips. The
 * ledger held trucks named by TWO OR THREE moving dispatches at once — e.g.
 * KRD993YM / B046 sat on three "En Route" loads — because when a truck goes
 * back out, the older load it was taken off never closed:
 *
 *   - the gate RETURN stamp closes only the FIRST open dispatch it matches
 *     (.find), so if a truck carried two, one survived;
 *   - the gate DEPARTURE stamp moves whichever open dispatch matches first,
 *     which can be the stale one, leaving the real load behind;
 *   - tracking-desk edits rename a trip's truck without looking at the trips
 *     the truck already "belongs" to.
 *
 * Fix — one reconcile sweep, one truth:
 *   A truck (or driver) named by MORE THAN ONE moving dispatch is a ledger
 *   error. The NEWEST dispatch is the load the asset was actually sent onto;
 *   every older one is closed as Completed with an honest "superseded" stamp
 *   in directCosts, and a driver is freed ONLY when no moving load of his
 *   remains. The sweep runs at boot, every 5 minutes, and the moment a
 *   dispatch moves through PATCH /api/trips/:id — so no matter which writer
 *   leaves a duplicate behind, it is drained within minutes.
 *
 * Scope: ONLY the five moving statuses the card counts (En Route / Loaded /
 * Offloading / Returning / Delayed). Scheduled, Approved and everything else
 * is never touched by the sweep.
 *
 * Safe to re-run (the patch checks its own marker first). Before restarting it
 * type-checks the patched index.ts; after restarting it requires pm2 to report
 * the API online — on any failure index.ts is restored from
 * index.ts.bak-transit and the API restarted on the old code.
 * No schema change: the boot sweep itself performs the one-time data heal.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.FLEETOPSX_API_ROOT || "/var/www/fleetopsx-api";
const API = path.join(ROOT, "index.ts");
const BACKUP = API + ".bak-transit";
const MARK = "// --- transit reconcile (server-patch-transit-reconcile) ---";
const PM2_NAME = "fleetopsx-api";

const ANCHOR_BOOT =
  "setInterval(() => void autoReconcileGateDepartures(), 3 * 60 * 1000);";
const ANCHOR_UPDATE =
  "const trip = await prisma.trip.update({ where: { id: req.params.id }, data });";

const say = (m) => console.log("ok: " + m);
function fail(message) {
  console.error("FAIL: " + message);
  process.exit(1);
}

/* ------------------------------------------------------------------- api --- */

function reconcileBlock() {
  return `${MARK}
// One truck, one road. An asset named by MORE THAN ONE moving dispatch is a
// ledger error: the older load was never closed when the truck/driver went
// back out. The NEWEST moving dispatch is the one the asset is on; every
// older one closes as Completed with an honest superseded stamp. A driver is
// freed only when no moving load of his remains. Runs at boot, every 5
// minutes, and right after any dispatch moves — the ledger heals itself no
// matter which writer left the duplicate behind.
const RECONCILE_MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

async function reconcileDuplicateTransit(): Promise<number> {
  try {
    const moving = await prisma.trip.findMany({
      where: { status: { in: RECONCILE_MOVING } },
      orderBy: { createdAt: 'desc' },
    });
    const byTruck = new Map<string, any[]>();
    const byDriver = new Map<string, any[]>();
    const keyOf = (v: any) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
    for (const t of moving) {
      const tk = keyOf(t.truckReg);
      if (tk.length > 2) {
        if (!byTruck.has(tk)) byTruck.set(tk, []);
        (byTruck.get(tk) as any[]).push(t);
      }
      const dk = String(t.driverName || '').trim().toUpperCase();
      if (dk && dk !== 'UNASSIGNED' && dk !== 'TBD') {
        if (!byDriver.has(dk)) byDriver.set(dk, []);
        (byDriver.get(dk) as any[]).push(t);
      }
    }
    // Newest of each group wins; every other member is superseded.
    const superseded = new Set<string>();
    for (const group of [...byTruck.values(), ...byDriver.values()]) {
      if (group.length < 2) continue;
      for (const t of group) if (t.id !== group[0].id) superseded.add(t.id);
    }
    if (superseded.size === 0) return 0;
    let closed = 0;
    const closedDrivers: string[] = [];
    for (const id of superseded) {
      // Re-read before closing: the row may have moved on since the sweep began.
      const dup = await prisma.trip.findUnique({ where: { id } });
      if (!dup || !RECONCILE_MOVING.includes(String(dup.status))) continue;
      const costs = dup.directCosts && typeof dup.directCosts === 'object' ? { ...(dup.directCosts as any) } : {};
      costs.supersededByReconcile = true;
      costs.supersededAt = new Date().toISOString();
      await prisma.trip.update({
        where: { id: dup.id },
        data: {
          status: 'Completed',
          eta: dup.eta || autoStamp(dup.createdAt),
          gateInBy: 'Auto-reconciled (superseded — the truck was re-dispatched onto a newer load)',
          directCosts: costs,
        },
      });
      closed += 1;
      const dk = String(dup.driverName || '').trim();
      if (dk && dk.toUpperCase() !== 'UNASSIGNED' && dk.toUpperCase() !== 'TBD') closedDrivers.push(dk);
    }
    // Free a closed load's driver ONLY if no moving load of his remains — the
    // usual case is the same man re-dispatched onto the newer load, still On Trip.
    const freed: string[] = [];
    for (const name of [...new Set(closedDrivers)]) {
      const still = await prisma.trip.findFirst({
        where: { driverName: name, status: { in: RECONCILE_MOVING } },
      });
      if (still) continue;
      try {
        await prisma.driver.updateMany({
          where: { name, status: { in: ['On Trip', 'Active'] } },
          data: { status: 'Active' },
        });
        freed.push(name);
      } catch (_) { /* never block the sweep on the roster */ }
    }
    if (closed) {
      console.log('[transit-reconcile] closed ' + closed + ' superseded dispatch(es) naming an asset already on a newer load' + (freed.length ? '; freed ' + freed.join(', ') : ''));
      void notify('Fleet Operations', 'Stale dispatches closed',
        closed + ' dispatch(es) still named a truck/driver that is on a newer load. They were closed automatically so the In Transit board counts real trucks only.',
        'warning', 'Transport Manager,Platform Admin,Fleet Operations',
        { module: 'Fleet Operations', eventKey: 'dispatch.reconciled' });
    }
    return closed;
  } catch (e: any) {
    console.error('[transit-reconcile] failed:', e?.message || e);
    return 0;
  }
}

void reconcileDuplicateTransit();
setInterval(() => void reconcileDuplicateTransit(), 5 * 60 * 1000);
`;
}

function patchApi() {
  let src = fs.readFileSync(API, "utf8");
  if (src.includes(MARK)) return false;
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  const bootAt = src.indexOf(ANCHOR_BOOT);
  if (bootAt === -1) fail("boot anchor not found: " + ANCHOR_BOOT);
  const bootEnd = src.indexOf(eol, bootAt);
  if (bootEnd === -1) fail("boot anchor line end not found");

  const updateAt = src.indexOf(ANCHOR_UPDATE);
  if (updateAt === -1) fail("update anchor not found: " + ANCHOR_UPDATE);
  const updateEnd = src.indexOf(eol, updateAt);
  if (updateEnd === -1) fail("update anchor line end not found");

  const block = reconcileBlock().split("\n").join(eol);
  const sweepCall =
    eol +
    "  // One truck, one road (server-patch-transit-reconcile): the moment THIS" + eol +
    "  // dispatch goes moving, close any older moving dispatch that still names" + eol +
    "  // the same truck or driver — no waiting for the periodic sweep." + eol +
    "  if (RECONCILE_MOVING.includes(String(trip.status))) void reconcileDuplicateTransit();" + eol;

  // Insert the sweep call FIRST (later in the file), so the earlier index
  // stays valid; then the boot block at the earlier position.
  let out = src.slice(0, updateEnd + eol.length) + sweepCall + src.slice(updateEnd + eol.length);
  const bootEndOut = out.indexOf(ANCHOR_BOOT);
  const bootLineEnd = out.indexOf(eol, bootEndOut);
  out = out.slice(0, bootLineEnd + eol.length) + block + out.slice(bootLineEnd + eol.length);

  fs.copyFileSync(API, BACKUP);
  fs.writeFileSync(API, out);
  return true;
}

/* ----------------------------------------------------------------- checks --- */

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

function restartAndCheck() {
  execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
  execSync("sleep 10");
  const app = pm2App();
  const upFor = Date.now() - Number(app?.pm2_env?.pm_uptime ?? Date.now());
  return app?.pm2_env?.status === "online" && upFor >= 5000;
}

/* ------------------------------------------------------------------- main --- */

async function main() {
  if (!fs.existsSync(API)) fail(`${API} not found — run this on the API server`);
  const changed = patchApi();
  if (!changed) {
    console.log("Nothing to install — the reconcile sweep is already present.");
    return;
  }
  say("reconcile sweep + PATCH hook inserted");

  const patched = typeChecks("index.ts");
  if (!patched.ok) {
    const origCheck = path.join(ROOT, "index.transit-orig-check.ts");
    fs.copyFileSync(BACKUP, origCheck);
    const original = typeChecks("index.transit-orig-check.ts");
    fs.unlinkSync(origCheck);
    if (original.ok) {
      restore("the patched index.ts does not type-check:\n" + patched.out.slice(0, 3000));
      process.exit(1);
    }
    console.log("note: index.ts already had type errors before this patch — type check skipped.");
  } else {
    say("patched index.ts type-checks");
  }

  if (!restartAndCheck()) {
    restore(`${PM2_NAME} did not stay online after the restart`);
    execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
    console.error("The API is back on the previous code. Logs: pm2 logs " + PM2_NAME + " --lines 80");
    process.exit(1);
  }
  say(`${PM2_NAME} restarted and online`);
  console.log(
    "\nDONE — the boot sweep has already healed the ledger. Watch it work:" +
      "\n  pm2 logs " + PM2_NAME + " --lines 50 | grep transit-reconcile" +
      "\nThen reload the Central Dashboard: In Transit now counts real trucks."
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error("FAIL:", e && e.message ? e.message : e);
    process.exit(1);
  });
}
