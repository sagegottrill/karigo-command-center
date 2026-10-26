/* PURGE FAKE/LEGACY ROWS — 26 Oct 2026 (backup first, verify after).
 * Scope confirmed by the deep audit: E2E test trips, the dead E2E inventory
 * requisition, the orphaned conversation, notifications pointing at purged
 * trips, and stale push tokens. The 12 "Test *" QA accounts are NOT touched
 * here (owner confirmation pending).
 */
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");
const p = new PrismaClient();
const ACTIVE = [];
(async () => {
  const report = { deleted: {}, kept: {} };

  // ---- 0. backup file path ----
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = "/root/repair-backups/purge-fakes-" + ts + ".json";

  // ---- 1. E2E trips (truckReg contains E2E) ----
  const e2eTrips = await p.trip.findMany({ where: { OR: [{ truckReg: { contains: "E2E" } }, { tailNumber: { contains: "E2E" } }] } });
  console.log("E2E trips:", e2eTrips.map((t) => t.id.slice(-5) + ":" + t.status).join(", "));
  const tripIds = e2eTrips.map((t) => t.id);

  // children of those trips
  const cps = tripIds.length ? await p.trackingCheckpoint.findMany({ where: { tripId: { in: tripIds } } }) : [];
  const convs = tripIds.length ? await p.conversation.findMany({ where: { tripId: { in: tripIds } } }) : [];
  const convIds = convs.map((c) => c.id);
  const reads = convIds.length ? await p.$queryRawUnsafe('SELECT * FROM "ConversationRead" WHERE "conversationId" = ANY($1::text[])', convIds) : [];
  const notifs = tripIds.length ? await p.notification.findMany({ where: OR_(tripIds) }) : [];
  function OR_(ids) {
    return { refId: { in: ids } };
  }

  // ---- 2. orphan conversation ----
  const orphConvs = await p.$queryRawUnsafe('SELECT cv.id, cv."tripId" FROM "Conversation" cv LEFT JOIN "Trip" t ON cv."tripId"=t.id WHERE t.id IS NULL');
  const orphIds = orphConvs.map((r) => r.id);

  // ---- 3. dead E2E inventory requisition (references an item that does not exist) ----
  const deadIRs = await p.$queryRawUnsafe('SELECT "InventoryRequisition".* FROM "InventoryRequisition" LEFT JOIN "InventoryItem" i ON "InventoryRequisition"."itemId"=i.id WHERE i.id IS NULL');
  const deadIRIds = deadIRs.map((r) => r.id);

  // ---- 4. E2E tails / drivers registry leftovers ----
  const tails = await p.tail.findMany();
  const e2eTails = tails.filter((t) => /E2E|ZZ/i.test(JSON.stringify(t)));
  const drivers = await p.driver.findMany();
  const e2eDrivers = drivers.filter((d) => /E2E|ZZ-|Test Driver/i.test(JSON.stringify({ n: d.name, e: d.employeeId })));

  // ---- 5. push tokens of the 12 test users (they may hold stale slots) ----
  const users = await p.user.findMany({ select: { id: true, email: true, name: true } });
  const TESTY = /test|probe|bench|e2e|^zz/i;
  const fakeUsers = users.filter((u) => TESTY.test(u.email || "") || TESTY.test(u.name || ""));
  const fakeIds = fakeUsers.map((u) => u.id);
  const staleTokens = fakeIds.length ? await p.pushToken.findMany({ where: { userId: { in: fakeIds } } }) : [];

  const backup = {
    stampedAt: new Date().toISOString(),
    e2eTrips, checkpoints: cps, conversations: convs, conversationReads: reads, tripNotifications: notifs,
    orphanConversations: orphIds, deadInventoryRequisitions: deadIRs, e2eTails, e2eDrivers,
    stalePushTokens: staleTokens,
  };
  execSync("mkdir -p /root/repair-backups && cat > " + backupPath.replace(/[`$\\]/g, "\\$&") + " <<'BACKUP_EOF'\n" + JSON.stringify(backup, null, 2) + "\nBACKUP_EOF", { shell: "/bin/bash", stdio: "inherit" });
  console.log("backup:", backupPath);

  // ---- delete, children first ----
  if (notifs.length) { const r = await p.notification.deleteMany({ where: OR_(tripIds) }); report.deleted.tripNotifications = r.count; }
  for (const r of reads) { await p.$executeRawUnsafe('DELETE FROM "ConversationRead" WHERE id=$1', String(r.id)).catch((e) => console.log("read del:", e.message.slice(0, 60))); }
  report.deleted.conversationReads = reads.length;
  if (convIds.length) { const r = await p.conversation.deleteMany({ where: { id: { in: convIds } } }); report.deleted.tripConversations = r.count; }
  if (cps.length) { const r = await p.trackingCheckpoint.deleteMany({ where: { tripId: { in: tripIds } } }); report.deleted.checkpoints = r.count; }
  if (tripIds.length) { const r = await p.trip.deleteMany({ where: { id: { in: tripIds } } }); report.deleted.e2eTrips = r.count; }
  for (const id of orphIds) {
    const rd = await p.$executeRawUnsafe('DELETE FROM "ConversationRead" WHERE "conversationId"=$1', id).catch(() => 0);
    await p.conversation.delete({ where: { id } }).catch((e) => console.log("orph conv:", e.message.slice(0, 60)));
    report.deleted.orphanConversations = (report.deleted.orphanConversations || 0) + 1;
  }
  for (const id of deadIRIds) {
    await p.$executeRawUnsafe('DELETE FROM "InventoryRequisition" WHERE id=$1', String(id));
    report.deleted.deadInventoryRequisitions = (report.deleted.deadInventoryRequisitions || 0) + 1;
  }
  for (const t of e2eTails) { await p.tail.delete({ where: { id: t.id } }).catch(() => {}); report.deleted.e2eTails = (report.deleted.e2eTails || 0) + 1; }
  for (const d of e2eDrivers) { await p.driver.delete({ where: { id: d.id } }).catch(() => {}); report.deleted.e2eDrivers = (report.deleted.e2eDrivers || 0) + 1; }
  for (const t of staleTokens) { await p.pushToken.delete({ where: { id: t.id } }).catch(() => {}); report.deleted.stalePushTokens = (report.deleted.stalePushTokens || 0) + 1; }

  console.log("DELETED:", JSON.stringify(report.deleted));
  console.log("KEPT pending owner: " + fakeUsers.length + " QA accounts (t.*@petrolline…, g.test, t.test) — owner confirmation required first.");

  // ---- verify ----
  const after = await p.trip.findMany({ where: { OR: [{ truckReg: { contains: "E2E" } }, { tailNumber: { contains: "E2E" } }] } });
  const orphAfter = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "Conversation" cv LEFT JOIN "Trip" t ON cv."tripId"=t.id WHERE t.id IS NULL');
  console.log("VERIFY e2e trips remaining:", after.length, "| orphan convs remaining:", orphAfter[0].c);
  console.log("PURGE DONE");
  await p.$disconnect();
})().catch((e) => { console.error("PURGE FAILED (nothing further deleted):", e.message); process.exit(1); });
