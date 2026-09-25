/* One-off audit: who holds which saved loading sites. Run on the API box. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT email, "partnerCompanyName", "loadingSites" FROM "User" WHERE "loadingSites" IS NOT NULL AND "loadingSites" <> \'\'',
  );
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
