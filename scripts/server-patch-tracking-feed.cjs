/**
 * One-shot server patch + backfill (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * TRACKING UPDATES, end to end. The Transport Manager is supposed to be told what
 * the Tracking department is doing on the road, and the API already writes those
 * notifications — but the text could not be tied back to a dispatch:
 *
 *   1) THE CHECKPOINT NOTICE NAMED NO DISPATCH AT ALL.
 *      `Dispatch checkpoint recorded at Warri (In Transit).` — true, but which
 *      truck? Every checkpoint produced an alert the reader could not act on.
 *
 *   2) EVERY OTHER NOTICE NAMED THE WRONG KIND OF ID.
 *      `t.id.slice(0, 8)` printed a raw UUID prefix ("Dispatch 6f3a1b2c …"),
 *      which matches NOTHING the user can see anywhere else in the product. The
 *      app shows its own derived DIS-xxxxx on every board, detail page and
 *      printout, so an alert and the dispatch it described carried two different
 *      names for the same thing.
 *
 *   3) AND THE ALERTS ALREADY SENT KEPT THE OLD TEXT. The dashboard feed shows
 *      the newest dozen, so the TM would have stared at unclickable rows until
 *      the next truck rolled — history is backfilled below.
 *
 * Additive and idempotent: safe to re-run. Then: pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

/** Mirrors the client's displayDispatchId (src/lib/fleetopsx/request-id.ts). */
function dispatchRef(tripId) {
  const id = String(tripId || "");
  if (/^DIS-/i.test(id)) return "DIS-" + id.slice(4).toUpperCase();
  if (/^REQ-/i.test(id)) return "DIS-" + id.slice(4).toUpperCase();
  const clean = id.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  return "DIS-" + clean.slice(-5).padStart(5, "0");
}

const HELPER = `/**
 * The dispatch reference the product actually shows (DIS-xxxxx).
 *
 * Mirrors the client's displayDispatchId (src/lib/fleetopsx/request-id.ts)
 * exactly, so an alert and the dispatch it describes finally carry ONE name.
 */
function dispatchRef(tripId: any) {
  const id = String(tripId || '');
  if (/^DIS-/i.test(id)) return 'DIS-' + id.slice(4).toUpperCase();
  if (/^REQ-/i.test(id)) return 'DIS-' + id.slice(4).toUpperCase();
  const clean = id.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return 'DIS-' + clean.slice(-5).padStart(5, '0');
}

`;

const TRACK_OLD =
  "void notify('Operations', 'New Location has been Logged', `Dispatch checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking,Loading');";
const TRACK_NEW =
  "void notify('Operations', 'New Location has been Logged', `Dispatch ${dispatchRef(tripId)} checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,Transport Manager,Fleet Operations,Tracking,Loading');";

const CHECKPOINT_TITLE = "New Location has been Logged";
/** Same key the server uses to decide two site names are the same place. */
const siteKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function patchIndex() {
  let src = fs.readFileSync(INDEX, "utf8");
  let changed = false;

  if (/function dispatchRef\(/.test(src)) {
    console.log("ok: dispatchRef helper already present");
  } else {
    const anchor = "// Lifecycle status -> notification sent to the right roles";
    must(src.includes(anchor), "TRIP_STATUS_NOTICES anchor");
    src = src.replace(anchor, HELPER + anchor);
    changed = true;
    console.log("ok: dispatchRef helper added");
  }

  const rawUuids =
    (src.match(/t\.id\.slice\(0, 8\)/g) || []).length +
    (src.match(/trip\.id\.slice\(0, 8\)/g) || []).length;
  if (rawUuids > 0) {
    src = src
      .replace(/t\.id\.slice\(0, 8\)/g, "dispatchRef(t.id)")
      .replace(/trip\.id\.slice\(0, 8\)/g, "dispatchRef(trip.id)");
    changed = true;
    console.log("ok: " + rawUuids + " raw UUID prefixes replaced with the DIS- reference");
  } else {
    console.log("ok: no raw UUID prefixes left in notices");
  }

  if (src.includes(TRACK_NEW)) {
    console.log("ok: checkpoint notice already names the dispatch");
  } else {
    must(src.includes(TRACK_OLD), "checkpoint notice text");
    src = src.replace(TRACK_OLD, TRACK_NEW);
    changed = true;
    console.log("ok: checkpoint notice now names the dispatch");
  }

  if (changed) {
    fs.writeFileSync(INDEX + ".bak-tracking-feed", fs.readFileSync(INDEX));
    fs.writeFileSync(INDEX, src);
    console.log("ok: index.ts written (backup: index.ts.bak-tracking-feed)");
  } else {
    console.log("ok: index.ts already up to date");
  }
}

async function backfill() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const trips = await prisma.trip.findMany({ select: { id: true } });
    const tripIds = trips.map((t) => t.id);

    // (a) The uuid-prefix notices. Eight hex characters identify a trip on their
    //     own — and if they ever do not (0 or 2 hits) the row is left alone,
    //     because a wrong link is worse than no link.
    const all = await prisma.notification.findMany();
    let uuidFixed = 0;
    let uuidSkipped = 0;
    for (const n of all) {
      const body = String(n.body || "");
      const m = body.match(/Dispatch ([0-9a-fA-F]{8})\b/);
      if (!m) continue;
      const prefix = m[1].toLowerCase();
      const hits = tripIds.filter((id) => id.toLowerCase().startsWith(prefix));
      if (hits.length !== 1) {
        uuidSkipped++;
        continue;
      }
      await prisma.notification.update({
        where: { id: n.id },
        data: { body: body.replace(/Dispatch [0-9a-fA-F]{8}\b/, "Dispatch " + dispatchRef(hits[0])) },
      });
      uuidFixed++;
    }
    console.log(`ok: uuid-prefix notices backfilled=${uuidFixed}, left alone=${uuidSkipped}`);

    // (b) Checkpoint notices that name no dispatch. Matched back to the
    //     checkpoint row on site name + leg, nearest write time, and only when
    //     exactly ONE trip owns that match.
    const notes = all.filter(
      (n) => String(n.title || "").trim() === CHECKPOINT_TITLE && !/DIS-[0-9A-Z]{5}/i.test(String(n.body || "")),
    );
    let cpFixed = 0;
    let cpSkipped = 0;
    if (notes.length) {
      const checkpoints = await prisma.trackingCheckpoint.findMany();
      for (const n of notes) {
        const m = String(n.body || "").match(/^Dispatch checkpoint recorded at ([\s\S]*) \((.*)\)\.$/);
        if (!m) {
          cpSkipped++;
          continue;
        }
        const [, location, leg] = m;
        const at = new Date(n.createdAt).getTime();
        const near = checkpoints.filter(
          (cp) =>
            siteKey(cp.location) === siteKey(location) &&
            siteKey(cp.leg) === siteKey(leg) &&
            Math.abs(new Date(cp.at).getTime() - at) <= 180_000,
        );
        const owners = [...new Set(near.map((cp) => cp.tripId))];
        if (owners.length !== 1) {
          cpSkipped++;
          continue;
        }
        await prisma.notification.update({
          where: { id: n.id },
          data: { body: `Dispatch ${dispatchRef(owners[0])} checkpoint recorded at ${location} (${leg}).` },
        });
        cpFixed++;
      }
    }
    console.log(`ok: checkpoint notices backfilled=${cpFixed}, left alone=${cpSkipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  patchIndex();
  await backfill();
  console.log("PATCH OK — restart the API (pm2 restart fleetopsx-api) to load it.");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
