/** Read-only: what loading sites the Saba companies have saved, and their open requests. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  for (const company of ['SABA', 'Saba Steel']) {
    const tables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
    );
    void tables;
    // Try the recorded-sites model (naming tolerant); skip cleanly when absent.
    try {
      const sites = await prisma.partnerSite.findMany({ where: { company }, orderBy: { createdAt: 'asc' } });
      console.log(`[ ${company} ] partnerSite rows:`, sites.length, sites.map((s) => s.name || s.site || s.label).join(' | '));
    } catch (e) {
      console.log(`[ ${company} ] agentPartnerSite table not found:`, e.message.split('\n')[0]);
      try {
        const alt = await prisma.$queryRawUnsafe(
          `SELECT column_name FROM information_schema.columns WHERE table_name ILIKE '%site%'`,
        );
        console.log('site tables/columns:', JSON.stringify(alt));
      } catch (e2) {
        console.log('no site table at all:', e2.message.split('\n')[0]);
      }
    }
    const trips = await prisma.trip.findMany({
      where: { customer: company },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, pickup: true, loadingSite: true, createdAt: true },
    });
    console.log(`[ ${company} ] latest requests:`, trips.length);
    for (const t of trips) {
      console.log(`  ${t.id.slice(-6)} | ${t.status} | pickup: ${t.pickup} | loadingSite: ${JSON.stringify(t.loadingSite)} | ${t.createdAt?.toISOString?.()}`);
    }
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
