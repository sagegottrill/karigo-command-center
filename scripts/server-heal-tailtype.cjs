/**
 * One-shot data heal (run ON the Hetzner box, from /var/www/fleetopsx-api).
 * The FO assignment form historically wrote the tail NUMBER (B068) into the
 * tailType field. Heal every affected trip from the Tail roster:
 *   tailType = roster type (e.g. "Flatbed Tail"), tailNumber keeps the code.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TAIL_RE = /^[Bb]\d{2,3}$/; // B001…B108 style codes

(async () => {
  const tails = await prisma.tail.findMany();
  const typeByNumber = new Map(tails.map((t) => [t.number.toUpperCase(), t.type || "Trailer Tail"]));

  const trips = await prisma.trip.findMany();
  let healed = 0;
  for (const t of trips) {
    if (t.tailType && TAIL_RE.test(t.tailType.trim())) {
      const rosterType = typeByNumber.get(t.tailType.trim().toUpperCase());
      const fixedType = rosterType || "Trailer Tail";
      await prisma.trip.update({
        where: { id: t.id },
        data: { tailType: fixedType, tailNumber: t.tailType.trim().toUpperCase() },
      });
      healed += 1;
      console.log(`healed ${t.id.slice(0, 8)}: tailType ${t.tailType} -> ${fixedType}`);
    }
  }
  console.log(`done — ${healed} trips healed of ${trips.length}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("HEAL FAILED:", e.message);
  process.exit(1);
});
