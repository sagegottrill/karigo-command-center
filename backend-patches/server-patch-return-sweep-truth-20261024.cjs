/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) — 24 Oct 2026.
 *
 * WHAT THE FRONT OFFICE REPORTED (23–24 Oct):
 *   1. Dispatches were closed/"returned" by themselves, several at one
 *      identical timestamp, with Security never signing anything.
 *   2. The gate log names the closer as "Petroline Security" — an account
 *      that does not exist on the platform (only "S.1 Petroline" does).
 *
 * ROOT CAUSES FIXED HERE:
 *   C1. sweepReturnedTrucks ("GATERETURN:V4") treated a truck being on
 *       "Check Up" as proof it must have no open dispatch, and force-closed
 *       ANY dispatch naming it — including freshly approved live runs —
 *       several in the same second, stamped with a fabricated guard name.
 *       Fix: the same DORMANT-ONLY guard already written into the repo copy
 *       on 21 Oct (a dispatch a department is still logging against, or one
 *       raised inside the last 12 hours, is live work and is never swept).
 *   C2. The sweep's stamp `gateInBy: 'Petroline Security (self-heal)'`
 *       invented a guard account that does not exist. Fix: an honest
 *       bookkeeping stamp `System (return sweep)` — the real guard who
 *       logged the gate return keeps their own name on the record.
 *
 * The frontend (gate.tsx / dashboard-departments.ts) is patched in the repo
 * to display "System (no guard signed)" and "Unsigned" instead of the
 * phantom name — no historical data needs rewriting after this.
 *
 * APPLIED AND VERIFIED (2026-10-24): C1 skip-detected (the live file already
 * carried the 21 Oct V5 dormant-only guard), C1b and C2 applied, pm2
 * restarted, API serving 200s on :3001, zero fabricated guard stamps left in
 * the live file, sweep closing only genuine stragglers. Backup at
 * /var/www/fleetopsx-api/index.ts.bak-return-sweep-truth on the server.
 *
 * Run with: node /tmp/server-patch-return-sweep-truth-20261024.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
let changed = 0;
let skipped = 0;

function replaceOnce(id, { from, to, alreadyAppliedTest }) {
  if (alreadyAppliedTest ? src.includes(alreadyAppliedTest) : src.includes(to)) {
    console.log("skip: " + id + " already in place");
    skipped++;
    return;
  }
  const at = src.indexOf(from);
  if (at < 0 || src.indexOf(from, at + from.length) >= 0) {
    console.error("FAILED (" + id + "): the expected code was not found exactly once — nothing written.");
    process.exit(1);
  }
  src = src.slice(0, at) + to + src.slice(at + from.length);
  changed++;
  console.log("ok: " + id + " applied");
}

// --- C1: dormant-only sweep (port of the 21 Oct GATERETURN:V5 guard) --------
// NOTE: if the live file already carries the V5 guard (as this deployment did
// on 24 Oct — the sweep block starts with ACTIVE_WINDOW_MS), C1 is a no-op.
replaceOnce(
  "C1-dormant-only-sweep",
  {
    from:
      "    const doomed = open.filter((t: any) =>\n" +
      "      truckKeysOf(t).some((k) =>\n" +
      "        Array.from(homeKeys).some((h) => k === h || k.includes(h) || h.includes(k))));\n" +
      "    let closed = 0;",
    to:
      "    // DORMANT-ONLY (GATERETURN:V5, 24 Oct 2026): \"Check Up\" is NOT proof —\n" +
      "    // engineering parks healthy trucks there mid-flow, and the yard coupling\n" +
      "    // can lag a fresh departure. Closing a truck's dispatches wholesale on a\n" +
      "    // stale word made LIVE RUNS vanish from the boards with no gate action\n" +
      "    // anywhere — the fleet \"returned by itself\" at one identical timestamp\n" +
      "    // while Security never signed anything. The distinguishing signal is\n" +
      "    // TRACKING FRESHNESS: a run a department is still logging against — or\n" +
      "    // one raised inside the window — is live work, whatever the registry\n" +
      "    // word says. Only dormant stragglers are swept.\n" +
      "    const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;\n" +
      "    const now = Date.now();\n" +
      "    const doomed = [];\n" +
      "    for (const t of open) {\n" +
      "      if (!truckKeysOf(t).some((k) =>\n" +
      "        Array.from(homeKeys).some((h) => k === h || k.includes(h) || h.includes(k)))) continue;\n" +
      "      // DORMANT-ONLY: a dispatch raised inside the window is live work.\n" +
      "      const born = new Date(t.createdAt || 0).getTime();\n" +
      "      if (!isNaN(born) && now - born < ACTIVE_WINDOW_MS) continue;\n" +
      "      const lastCp = await prisma.trackingCheckpoint.findFirst({\n" +
      "        where: { tripId: t.id },\n" +
      "        orderBy: { at: 'desc' },\n" +
      "      });\n" +
      "      if (lastCp) {\n" +
      "        const seen = new Date(lastCp.at).getTime();\n" +
      "        if (!isNaN(seen) && now - seen < ACTIVE_WINDOW_MS) continue;\n" +
      "      }\n" +
      "      doomed.push(t);\n" +
      "    }\n" +
      "    let closed = 0;",
    alreadyAppliedTest: "const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours of tracked life",
  },
);

// --- C1b: sweep may only close records the lifecycle never touched recently --
// The V5 "born" check alone left a hole the front office caught on 23 Oct:
// long-raised requests (14–19 Oct) approved and departed TODAY have no
// checkpoints yet, so the sweep still closed them at one identical timestamp
// and stamped a fake guard. updatedAt is the trip's last lifecycle write —
// approval, assignment, departure, dispatch edit — so a record no path has
// written to in 12 hours is the only kind the sweep may close.
replaceOnce(
  "C1b-sweep-requires-untouched-lifecycle",
  {
    from:
      "      // DORMANT-ONLY: a dispatch a department is still logging against — or one\n" +
      "      // raised within the window — is live work, whatever the registry word says.\n" +
      "      const born = new Date(t.createdAt || 0).getTime();\n" +
      "      if (!isNaN(born) && now - born < ACTIVE_WINDOW_MS) continue;",
    to:
      "      // DORMANT-ONLY (V5B, 24 Oct 2026): a dispatch the lifecycle touched\n" +
      "      // inside the window is live work, whatever the registry word says.\n" +
      "      // The born check alone left a hole the front office caught — long\n" +
      "      // raised requests approved and departed TODAY have no checkpoints\n" +
      "      // yet, so the sweep still closed them at one identical timestamp and\n" +
      "      // stamped a fake guard name. updatedAt is the trip's last lifecycle\n" +
      "      // write (re-approval edit, approval, assignment, departure); a\n" +
      "      // record no path has written to in 12 hours is the only kind the\n" +
      "      // sweep may close.\n" +
      "      const born = new Date(t.createdAt || 0).getTime();\n" +
      "      const touched = new Date(t.updatedAt || '').getTime();\n" +
      "      if (!isNaN(born) && now - born < ACTIVE_WINDOW_MS) continue;\n" +
      "      if (!isNaN(touched) && now - touched < ACTIVE_WINDOW_MS) continue;",
    alreadyAppliedTest: "const touched = new Date(t.updatedAt || '').getTime();",
  },
);

// --- C2: truthful sweep stamp (no invented guard) ---------------------------
replaceOnce(
  "C2-truthful-sweep-stamp",
  {
    from: "            gateInBy: trip.gateInBy || 'Petroline Security (self-heal)',",
    to:
      "            // TRUTHFUL-RETURN-NAME (24 Oct 2026): the sweep is bookkeeping, not\n" +
      "            // a signature — the stamp must never name a guard that did not\n" +
      "            // sign: \"Petroline Security\" is not an account on this platform,\n" +
      "            // and the front office reads it as a security officer closing trucks.\n" +
      "            gateInBy: trip.gateInBy || 'System (return sweep)',",
  },
);

if (changed === 0) {
  console.log("nothing to do — patch already fully applied.");
  process.exit(0);
}

fs.writeFileSync(FILE + ".bak-return-sweep-truth", fs.readFileSync(FILE));
fs.writeFileSync(FILE, src);
console.log(
  "done: " + changed + " change(s) written (backup at " + FILE + ".bak-return-sweep-truth), " +
    skipped + " already in place.",
);
