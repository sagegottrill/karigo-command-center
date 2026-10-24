/** Follow-up probe: the 3 checks that failed in run 1 (read-only). */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
const OPEN = ['Requested', 'Awaiting Approval', 'Approved', 'Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Assigned'];

(async () => {
  try {
    const q = (label, fn) => fn().then((rows) => {
      console.log('## ' + label + ' [' + rows.length + ']');
      for (const r of rows.slice(0, 12)) console.log('  ', JSON.stringify(r).slice(0, 220));
    }).catch((e) => console.log('## ' + label + ' FAILED:', e.message.slice(0, 200)));

    await q('1. moving trips whose truck sits in the yard', () =>
      p.$queryRawUnsafe(`
        SELECT t.id, t.status, t."truckReg" AS trip_truck, t."updatedAt", k.status AS truck_status, k."updatedAt" AS truck_seen_at
        FROM "Trip" t
        JOIN "Truck" k ON upper(regexp_replace(k."registration",'[^a-zA-Z0-9]','','g')) = upper(regexp_replace(split_part(t."truckReg", '/', 1),'[^a-zA-Z0-9]','','g'))
        WHERE t.status = ANY($1) AND k.status::text IN ('Available','Check Up')
        ORDER BY t."updatedAt" DESC LIMIT 12`, MOVING));

    await q('2. trucks marked Out of Yard/Assigned with NO open trip', () =>
      p.$queryRawUnsafe(`
        SELECT k."cabId", k."registration", k.status::text AS status, k."updatedAt",
               (SELECT count(*)::int FROM "Trip" t
                WHERE upper(regexp_replace(split_part(t."truckReg", '/', 1),'[^a-zA-Z0-9]','','g')) = upper(regexp_replace(k."registration",'[^a-zA-Z0-9]','','g'))
                  AND t.status = ANY($2)) AS open_trips
        FROM "Truck" k
        WHERE k.status::text IN ('Out of Yard','Assigned')
        ORDER BY k."updatedAt" DESC LIMIT 12`, OPEN, OPEN));

    await q('12. negative / zero-check lubricant + fuel stock', () =>
      p.$queryRawUnsafe(`SELECT "fuelType","quantity","minLevel","updatedAt" FROM "LubricantStock" WHERE "quantity" < 0 LIMIT 10`));

    await q('12b. disbursals exceeding current stock sanity (last 7d negative deltas)', () =>
      p.$queryRawUnsafe(`
        SELECT count(*)::int AS disbursal_rows, sum("quantity")::float AS litres_out
        FROM "LubricantDisbursal" WHERE "createdAt" > now() - interval '7 days'`));

    await q('16. full trip status distribution (all time)', () =>
      p.$queryRawUnsafe(`SELECT status, count(*)::int AS n FROM "Trip" GROUP BY 1 ORDER BY n DESC`));

    await q('17. heads vs tails counts', () =>
      p.$queryRawUnsafe(`SELECT 'heads' AS kind, count(*)::int AS n, sum((status::text='Blocked')::int)::int AS blocked FROM "Truck"
                         UNION ALL SELECT 'tails', count(*)::int, sum((status::text='Blocked')::int)::int FROM "Tail"`));

    await q('18. gate entries vs gate-in trips (last 7 days)', () =>
      p.$queryRawUnsafe(`
        SELECT count(*)::int AS trips_gate_in FROM "Trip" t WHERE t."updatedAt" > now() - interval '7 days' AND t.status='Completed'`));

    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
