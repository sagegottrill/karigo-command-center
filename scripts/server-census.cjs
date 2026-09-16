/** Live DB census — what actually exists right now (run ON the box). */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const counts = {
    users: await p.user.count(),
    trips: await p.trip.count(),
    expenses: await p.expense.count(),
    gate: await p.gateEntry.count(),
    notifications: await p.notification.count(),
    audit: await p.auditLog.count(),
    loginReports: await p.loginReport.count(),
    conversations: await p.conversation.count(),
    checkpoints: await p.trackingCheckpoint.count(),
    fuelReq: await p.fuelRequisition.count(),
    inventory: await p.inventoryItem.count(),
    workOrders: await p.workOrder.count(),
    procurement: await p.procurementRequest.count(),
    drivers: await p.driver.count(),
    trucks: await p.truck.count(),
    tails: await p.tail.count(),
    tenants: await p.tenant.count(),
  };
  console.log("COUNTS", JSON.stringify(counts, null, 2));

  const users = await p.user.findMany({
    select: { email: true, name: true, roles: true, status: true, passwordResetRequired: true },
    orderBy: { email: "asc" },
  });
  console.log("\nUSERS (" + users.length + "):");
  for (const u of users) {
    console.log(` ${String(u.email).padEnd(34)} ${String(u.status).padEnd(10)} reset=${String(u.passwordResetRequired).padEnd(5)} roles=${JSON.stringify(u.roles)}`);
  }
  await p.$disconnect();
})().catch(async (e) => { console.error("ERR", e.message); await p.$disconnect(); process.exit(1); });
