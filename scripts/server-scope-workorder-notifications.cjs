/**
 * Follow-up data fix: the broadcast audit turned up more than the internal
 * request. "New Work Order" and the fleet bookkeeping rows carried no audience,
 * so partners were being shown the workshop's jobs and the yard's asset flips.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();

  const scopes = [
    {
      title: "New Work Order",
      audience: "Engineering,Parts & Store,Transport Manager,Platform Admin",
      module: "Engineering",
    },
    {
      title: "Repair Logged",
      audience: "Engineering,Parts & Store,Transport Manager,Platform Admin",
      module: "Engineering",
    },
  ];
  for (const scope of scopes) {
    const { count } = await prisma.notification.updateMany({
      where: { title: scope.title, audience: null },
      data: { audience: scope.audience, module: scope.module },
    });
    console.log(`ok: ${count} × "${scope.title}" scoped to ${scope.audience}`);
  }

  const left = await prisma.notification.findMany({
    where: { audience: null },
    select: { title: true, body: true, module: true },
  });
  console.log("still broadcast:", JSON.stringify(left, null, 1));
  await prisma.$disconnect();
})();
