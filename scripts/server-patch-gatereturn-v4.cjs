/**
 * Server patch: GATERETURN:V4 — the return ends the cycle BY TRUCK, forever.
 *
 * Reported 15 Oct 2026: security returned Daniel's truck 071 but it stayed
 * "in transit", the driver stayed held and nothing went to Check Up. Root:
 * the handler matched dispatches by the TYPED text only. A guard logs the cap
 * number ("071"); the dispatch may name the plate ("GGE95YK / B055") — the
 * match found nothing, so nothing was closed. Three permanent changes:
 *
 *  1) /api/gate/return resolves the truck register row first, then matches
 *     every open dispatch against the truck's OWN two keys (registration +
 *     cabId) alongside the typed tokens — the typed text can no longer miss.
 *  2) sweepReturnedTrucks() re-checks the truth every 5 minutes: any truck the
 *     gate sent home (status Check Up) can carry NO open dispatch. Whatever
 *     path missed one, it is closed, its driver freed, its tail brought in.
 *  3) Tail release on the truck-level return (already in the repo copy).
 *
 * Run ON the box:  node server-patch-gatereturn-v4.cjs
 * (copies live in /var/www/fleetopsx-api; idempotent — re-running is a no-op)
 */
const fs = require("fs");

const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const before = src;

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// ---- 1) MATCH THE RESOLVED TRUCK, NOT ONLY THE TYPED TEXT ------------------
const TOKEN_ANCHOR = "const matchKeys = [...tokens, key];";
const TOKEN_REPLACEMENT = `// GATERETURN:V4 — match on the RESOLVED truck, not only the typed text. A
    // guard who logs "071" names the cap number; the dispatch's truckReg may
    // carry the plate ("GGE95YK / B055") or vice versa. (ownKeys, above, lists
    // the register row's registration + cabId.) Once the truck is known, its
    // own keys describe it completely — match those too, so the typed text can
    // never miss the truck it belongs to.
    const matchKeys = truck ? [...tokens, key, ...ownKeys(truck)] : [...tokens, key];`;

if (!src.includes(TOKEN_ANCHOR)) {
  must(src.includes("GATERETURN:V4 — match on the RESOLVED truck"), "V4 already applied — part 1 skipped");
} else {
  src = src.replace(TOKEN_ANCHOR, TOKEN_REPLACEMENT);
  must(true, "V4 matchKeys replaced (typed text can no longer miss)");
}

// `truck` must exist before matchKeys: the box copy resolves it just above the
// dispatch query, the same way the repo copy does.
must(/const truck = trucks\.find\(/.test(src), "truck resolution is present above the match");

// ---- 2) THE 5-MINUTE RETURNED-TRUCK SWEEP (one truth, re-checked) ----------
const SWEEP_ANCHOR = "// --- GATECYCLE:V1:HELPERS";
const SWEEP_BLOCK = `// --- GATERETURN:V4 — RETURNED-TRUCK SWEEP: the rule made PERMANENT ----------
// ONE TRUTH, re-checked every 5 minutes: a truck the gate has sent home (its
// register row is on Check Up) can have NO open dispatch left. Whatever path
// logged the return — the gate log, "Return a truck", a dispatch page, even a
// half-failed write from an older run — anything still open that names that
// truck is closed here with the self-heal stamp on the record, its drivers
// freed and its tail brought home. No missed edge case can ever again leave a
// returned truck showing "in transit" (the 071 case, 15 Oct 2026).
async function sweepReturnedTrucks(): Promise<number> {
  try {
    const trucks = await prisma.truck.findMany();
    const homeKeys = new Set<string>();
    for (const t of trucks) {
      if (String(t.status || '') !== 'Check Up') continue;
      for (const v of [t.registration, t.cabId]) {
        const k = TRUCK_KEY(v);
        if (k.length >= 4) homeKeys.add(k);
      }
    }
    if (homeKeys.size === 0) return 0;
    const open = await prisma.trip.findMany({
      where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    });
    const doomed = open.filter((t: any) =>
      truckKeysOf(t).some((k) =>
        Array.from(homeKeys).some((h) => k === h || k.includes(h) || h.includes(k))));
    let closed = 0;
    for (const trip of doomed) {
      try {
        const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
        dc.returnedBy = {
          by: 'Return self-heal',
          role: 'System',
          at: new Date().toISOString(),
          confirmed: true,
          note: 'Gate already logged this truck home — the open dispatch was closed automatically.',
        };
        await prisma.trip.update({
          where: { id: trip.id },
          data: {
            status: 'Completed',
            eta: trip.eta || autoStamp(new Date()),
            gateInBy: trip.gateInBy || 'Petroline Security (self-heal)',
            directCosts: dc,
          },
        });
        closed += 1;
        // The tail rode in with the truck — home to Check Up beside the head.
        const tailCode = String(trip.tailNumber || (String(trip.truckReg || '').split('/')[1] || '')).trim();
        if (tailCode) {
          const tk = TRUCK_KEY(tailCode);
          const tails = await prisma.tail.findMany();
          const tailRow = tails.find((t) => TRUCK_KEY(t.number) === tk);
          if (tailRow && ['Out of Yard', 'Assigned', 'Available'].includes(String(tailRow.status))) {
            await prisma.tail.update({ where: { id: tailRow.id }, data: { status: 'Check Up' } });
          }
        }
      } catch (e: any) {
        console.error('[return-sweep] could not close a stale dispatch:', e?.message || e);
      }
    }
    if (closed) {
      try {
        const remaining = await prisma.trip.findMany({
          where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'] } },
          select: { driverName: true },
        });
        const held = new Set(remaining.map((t: any) => String(t.driverName || '').trim().toLowerCase()).filter(Boolean));
        const names = Array.from(new Set(doomed.map((t: any) => String(t.driverName || '').trim()).filter((n: string) => n && !/^unassigned$/i.test(n))));
        for (const name of names) {
          if (held.has(name.toLowerCase())) continue;
          await prisma.driver.updateMany({
            where: { name, status: { in: ['On Trip', 'Active'] } },
            data: { status: 'Active' },
          });
        }
      } catch (e: any) {
        console.error('[return-sweep] driver release failed:', e?.message || e);
      }
      console.log('[return-sweep] closed ' + closed + ' stale dispatch(es) naming a truck already sent home.');
    }
    return closed;
  } catch (e: any) {
    console.error('[return-sweep] failed:', e?.message || e);
    return 0;
  }
}
void sweepReturnedTrucks();
setInterval(() => void sweepReturnedTrucks(), 5 * 60 * 1000);

`;

// Check both prerequisites the sweep depends on.
must(/^function autoStamp\(/m.test(src) || /const autoStamp\s*=/.test(src), "autoStamp exists in this copy");
must(/^function truckKeysOf\(/m.test(src) || /const truckKeysOf\s*=/.test(src), "truckKeysOf exists in this copy");

if (!src.includes("function sweepReturnedTrucks")) {
  if (!src.includes(SWEEP_ANCHOR)) {
    console.error("FAIL: GATECYCLE anchor not found — write the sweep block manually");
    process.exit(1);
  }
  src = src.replace(SWEEP_ANCHOR, SWEEP_BLOCK + SWEEP_ANCHOR);
  must(true, "5-minute returned-truck sweep installed");
} else {
  must(true, "sweep already present — part 2 skipped");
}

if (src !== before) {
  fs.writeFileSync(FILE, src, "utf8");
  console.log("WROTE " + FILE + " — restart the API (pm2 restart fleetopsx-api) to load it.");
} else {
  console.log("No changes needed — " + FILE + " already carries GATERETURN:V4.");
}
