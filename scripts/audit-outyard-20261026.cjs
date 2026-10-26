/* OUT-OF-YARD TRUCK CLASSIFIER (read-only) — dispatch truth per truck */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const ACTIVE = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"];
const K = (v) => String(v || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
(async () => {
  const trucks = await p.truck.findMany();
  const tails = await p.tail.findMany();
  const trips = await p.trip.findMany({ select: { id: true, status: true, truckReg: true, driverName: true, gateOutBy: true, gateInBy: true, returnedAt: true, updatedAt: true, createdAt: true, startTime: true, displayKey: true } }).catch(async () => {
    return p.trip.findMany();
  });
  const tripRegKey = (t) => {
    const truckPart = String(t.truckReg || "").split("/")[0];
    return K(truckPart);
  };
  const classify = (reg, cap, plate) => {
    const plateKey = K(plate);
    const capKey = K(cap).replace(/^P/, "");
    const mine = trips.filter((t) => {
      const regK = tripRegKey(t);
      return (plateKey && regK.includes(plateKey)) || (capKey && /^\d+$/.test(capKey) && regK.includes("P" + capKey));
    });
    const open = mine.filter((t) => ACTIVE.includes(String(t.status)));
    const closed = mine.filter((t) => !ACTIVE.includes(String(t.status)));
    const gatedClosed = closed.filter((t) => t.gateInBy || t.returnedAt);
    return { mine, open, closed, gatedClosed };
  };
  let out = { active: [], home: [], dead: [], none: [] };
  for (const trk of trucks) {
    if (!String(trk.status || "").toLowerCase().includes("out")) continue;
    const c = classify(trk.cabId, trk.cabId, trk.registration);
    const last = c.mine.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    if (c.open.length) out.active.push({ cab: trk.cabId, reg: trk.registration, openStats: c.open.map((t) => String(t.id).slice(-5) + ":" + t.status), last: last && String(last.updatedAt).slice(0, 16) });
    else if (c.gatedClosed.length) out.home.push({ cab: trk.cabId, reg: trk.registration, closedTrips: c.closed.length, gateInCount: c.gatedClosed.length, last: last && String(last.updatedAt).slice(0, 16) });
    else if (c.closed.length) out.dead.push({ cab: trk.cabId, reg: trk.registration, closedTrips: c.closed.length, last: last && String(last.updatedAt).slice(0, 16) });
    else out.none.push({ cab: trk.cabId, reg: trk.registration });
  }
  console.log("OUT-NO-RETURN trucks WITH an open dispatch (genuinely moving; leave):", out.active.length);
  for (const s of out.active) console.log("  ", s.cab, s.reg, "| open:", s.openStats.join(","), "| last", s.last);
  console.log("\nSTUCK HOME — all trips closed AND at least one carry a gate log-in (reset to Available):", out.home.length);
  for (const s of out.home) console.log("  ", s.cab, s.reg, "| closed", s.closedTrips, "| gate-in stamps", s.gateInCount, "| last", s.last);
  console.log("\nSTUCK — trips closed but NO gate log-in ever (ambiguous; hold for yard):", out.dead.length);
  for (const s of out.dead) console.log("  ", s.cab, s.reg, "| closed", s.closedTrips, "| last", s.last);
  console.log("\nOUT with NO trips at all (registry never had a dispatch):", out.none.length);
  for (const s of out.none) console.log("  ", s.cab, s.reg);
  // tails too
  let tout = { active: 0, home: 0, dead: 0, none: 0 };
  for (const tl of tails) {
    if (!String(tl.status || "").toLowerCase().includes("out")) continue;
    }
  console.log("\n(out-yard tails:", tout.active, "+", tout.home, "+", tout.dead, "+", tout.none, ")");
  await p.$disconnect();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
