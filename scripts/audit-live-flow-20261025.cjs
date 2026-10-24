/**
 * FULL-FLOW INTEGRITY PROBE (24 Oct 2026) — runs ON the API server.
 * One query per lifecycle stage; every check reports counts + samples.
 * Read-only: never writes.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const OPEN = ['Requested', 'Awaiting Approval', 'Approved', 'Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Assigned'];
const MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

(async () => {
  try {
    const q = (label, fn) => fn().then((rows) => {
      if (!Array.isArray(rows)) { console.log(label, '->', JSON.stringify(rows)); return; }
      console.log('## ' + label + ' [' + rows.length + ']');
      for (const r of rows.slice(0, 8)) console.log('  ', JSON.stringify(r).slice(0, 220));
    }).catch((e) => console.log('## ' + label + ' FAILED:', e.message.slice(0, 160)));

    await q('1. moving trips whose truck sits in the yard (Available/Check Up)', () =>
      p.$queryRawUnsafe(`
        SELECT t.id, t.status, t."truckReg", t."updatedAt", k.status AS truck_status
        FROM "Trip" t
        JOIN "Truck" k ON upper(regexp_replace(k."registration",'[^a-zA-Z0-9]','','g')) = upper(regexp_replace(split_part(t."truckReg"),'[^a-zA-Z0-9]','','g'))
        WHERE t.status = ANY($1) AND k.status::text IN ('Available','Check Up')
        LIMIT 10`, MOVING));

    await q('2. trucks Out of Yard/Assigned with NO open trip', () =>
      p.$queryRawUnsafe(`
        SELECT k."cabId", k."registration", k.status,
               (SELECT count(*)::int FROM "Trip" t
                WHERE upper(regexp_replace(split_part(t."truckReg"),'[^a-zA-Z0-9]','','g')) = upper(regexp_replace(k."registration",'[^a-zA-Z0-9]','','g'))
                  AND t.status = ANY($2)) AS open_trips
        FROM "Truck" k
        WHERE k.status IN ('Out of Yard','Assigned')
        ORDER BY k."updatedAt" DESC LIMIT 10`, OPEN, OPEN));

    await q('3. drivers by status', () =>
      p.driver.groupBy({ by: ['status'], _count: true }));

    await q('4. drivers On Trip with NO open dispatch', () =>
      p.$queryRawUnsafe(`
        SELECT d.name, d.status FROM "Driver" d
        WHERE d.status = 'On Trip'
          AND NOT EXISTS (
            SELECT 1 FROM "Trip" t
            WHERE lower(trim(t."driverName")) = lower(trim(d.name))
              AND t.status = ANY($1)
              AND t."driverName" IS NOT NULL AND length(trim(t."driverName")) > 2)
        LIMIT 10`, OPEN));

    await q('5. open trips older than 14 days', () =>
      p.$queryRawUnsafe(`
        SELECT id, status, "truckReg", "customer", "createdAt", "updatedAt"
        FROM "Trip" WHERE status = ANY($1) AND "createdAt" < now() - interval '14 days'
        ORDER BY "createdAt" ASC LIMIT 10`, OPEN));

    await q('6. Completed trips missing the return stamp (last 7 days)', () =>
      p.$queryRawUnsafe(`
        SELECT id,"truckReg","gateInBy","eta","updatedAt" FROM "Trip"
        WHERE status='Completed' AND "eta" IS NULL AND "updatedAt" > now() - interval '7 days' LIMIT 10`));

    await q('7. users by role/status', () =>
      p.$queryRawUnsafe(`SELECT role, status, count(*)::int AS n FROM "User" GROUP BY 1,2 ORDER BY n DESC LIMIT 30`));

    await q('8. test/e2e accounts', () =>
      p.$queryRawUnsafe(`
        SELECT email,name,role,status,"createdAt" FROM "User"
        WHERE (email LIKE '%test%' OR email LIKE '%e2e%' OR name ILIKE '%test%')
        ORDER BY "createdAt" DESC LIMIT 12`));

    await q('9. GateEntry volume', () =>
      p.$queryRawUnsafe(`SELECT count(*)::int AS n, max("timestamp") AS latest FROM "GateEntry"`));

    await q('10. trip status distribution, last 24h of activity', () =>
      p.$queryRawUnsafe(`
        SELECT status, count(*)::int AS n FROM "Trip"
        WHERE "updatedAt" > now() - interval '24 hours' GROUP BY 1 ORDER BY n DESC`));

    await q('11. same driver holding two open trips', () =>
      p.$queryRawUnsafe(`
        SELECT "driverName", count(*)::int AS n FROM "Trip" WHERE status = ANY($1) AND "driverName" IS NOT NULL AND length(trim("driverName"))>2
        GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC LIMIT 10`, OPEN));

    await q('12. negative lubricant stock', () =>
      p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "LubricantStore" WHERE "liters" < 0`));

    await q('13. FuelRequest by status', () =>
      p.$queryRawUnsafe(`SELECT status, count(*)::int AS n FROM "FuelRequest" GROUP BY 1 ORDER BY n DESC LIMIT 15`));

    await q('14. open work orders (truck registry cross-check)', () =>
      p.$queryRawUnsafe(`
        SELECT w."truckReg", w.status FROM "WorkOrder" w
        WHERE w.status NOT IN ('Completed','Cancelled') LIMIT 12`));

    await q('15. requisitions by status', () =>
      p.$queryRawUnsafe(`
        SELECT status, count(*)::int AS n FROM "InventoryRequisition" GROUP BY 1 ORDER BY n DESC LIMIT 15`));

    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
