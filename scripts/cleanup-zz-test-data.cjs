/**
 * Remove the throwaway fixtures our own verification runs left behind in
 * production (partners/trips named "ZZ ...", plus the notifications they raised).
 *
 * Run ON the VPS from /var/www/fleetopsx-api.
 *   node cleanup-zz-test-data.cjs          -> report only, changes nothing
 *   node cleanup-zz-test-data.cjs --apply  -> delete what the report lists
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const LOOKS_TESTY = [
  { customer: { startsWith: "ZZ " } },
  { customerConsignee: { startsWith: "ZZ " } },
  { customer: { contains: "ZZ SENDBACK VERIFY" } },
  { customer: { contains: "ZZ BONUS VERIFY" } },
  { customerConsignee: { contains: "ZZ Verify" } },
  { pickup: { startsWith: "ZZ " } },
  { dropoff: { startsWith: "ZZ " } },
  { loadingSite: { startsWith: "ZZ " } },
];
const USER_LOOKS_TESTY = [
  { email: { startsWith: "zz." } },
  { email: { contains: "@zz-verify.test" } },
  { partnerCompanyName: { contains: "ZZ " } },
  { partnerCompanyName: { startsWith: "ZZ " } },
  { name: { startsWith: "ZZ " } },
];

(async () => {
  const trips = await p.trip.findMany({ where: { OR: LOOKS_TESTY }, orderBy: { createdAt: "asc" } });
  const users = await p.user.findMany({ where: { OR: USER_LOOKS_TESTY } });
  const notes = await p.notification.findMany({
    where: { OR: [{ title: { contains: "ZZ " } }, { body: { contains: "ZZ " } }] },
  });

  console.log(`trips        : ${trips.length}`);
  for (const t of trips) console.log(`   ${t.id}  ${t.status.padEnd(18)} ${t.customer} / ${t.customerConsignee} (${t.pickup} → ${t.dropoff})`);
  console.log(`users        : ${users.length}`);
  for (const u of users) console.log(`   ${u.email}  ${u.role}  ${u.partnerCompanyName || u.name}`);
  console.log(`notifications: ${notes.length}`);
  for (const n of notes.slice(0, 10)) console.log(`   ${n.title} — ${String(n.body).slice(0, 70)}`);
  if (notes.length > 10) console.log(`   …and ${notes.length - 10} more`);

  if (!APPLY) {
    console.log("\nreport only — re-run with --apply to delete these");
    await p.$disconnect();
    return;
  }

  const dTrips = await p.trip.deleteMany({ where: { OR: LOOKS_TESTY } });
  const dUsers = await p.user.deleteMany({ where: { OR: USER_LOOKS_TESTY } });
  const dNotes = await p.notification.deleteMany({
    where: { OR: [{ title: { contains: "ZZ " } }, { body: { contains: "ZZ " } }] },
  });
  console.log(`\ndeleted: ${dTrips.count} trip(s), ${dUsers.count} user(s), ${dNotes.count} notification(s)`);

  const leftTrips = await p.trip.count({ where: { OR: LOOKS_TESTY } });
  const leftUsers = await p.user.count({ where: { OR: USER_LOOKS_TESTY } });
  console.log(`left   : ${leftTrips} trip(s), ${leftUsers} user(s)`);
  await p.$disconnect();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
