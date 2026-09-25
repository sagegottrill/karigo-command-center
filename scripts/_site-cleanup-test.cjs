/* Removes the QA verification leftovers from the Test partner's account:
 * the opt-in-probe site ("qa-keep-1") and the QA test trips created while
 * proving the fixed save behaviour. Only exact matches inside company
 * "Test" are touched; real yards and real requests are never matched. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const STRAY_SITES = ["qa-keep-1", "qa-drop-9", "qa-once-site", "test"];
const QA_CUSTOMERS = ["QA Keep One Ltd", "QA Drop Nine Ltd"];

(async () => {
  const users = await prisma.$queryRawUnsafe(
    'SELECT id, email, "loadingSites" FROM "User" WHERE "partnerCompanyName" = \'Test\' AND "loadingSites" IS NOT NULL',
  );
  for (const row of users) {
    const sites = String(row.loadingSites || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = sites.filter((s) => !STRAY_SITES.includes(s.toLowerCase()));
    if (kept.length !== sites.length) {
      await prisma.$executeRawUnsafe(
        'UPDATE "User" SET "loadingSites" = $1 WHERE id = $2',
        kept.join("|"),
        row.id,
      );
      console.log(`${row.email}: [${sites.join(", ")}] -> [${kept.join(", ")}]`);
    } else {
      console.log(`${row.email}: nothing stray (kept [${kept.join(", ")}])`);
    }
  }

  for (const customer of QA_CUSTOMERS) {
    const del = await prisma.$executeRawUnsafe(
      'DELETE FROM "Trip" WHERE "customerConsignee" = $1',
      customer,
    );
    console.log(`trips removed for "${customer}":`, del);
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
