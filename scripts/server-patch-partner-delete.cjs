/** Backend patch: partners may delete their OWN pending requests. */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

const oldDelete = `app.delete('/api/trips/:id', authenticate, authorize('Platform Admin'), async (req, res) => {
  await prisma.trip.delete({ where: { id: req.params.id } });
  res.status(204).end();
});`;
const newDelete = `app.delete('/api/trips/:id', authenticate, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const isPartner = req.user.role === 'Customer Portals (External)';
  if (isPartner) {
    // Partners may withdraw their OWN request while it is still pending.
    const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
    if (trip.customer !== partnerName || !['Requested'].includes(trip.status)) {
      return res.status(403).json({ error: 'Only pending requests you created can be deleted.' });
    }
  } else if (req.user.role !== 'Platform Admin') {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }
  await prisma.trip.delete({ where: { id: req.params.id } });
  res.status(204).end();
});`;
must(src.includes(oldDelete), "DELETE /trips anchor");
src = src.replace(oldDelete, newDelete);

fs.writeFileSync(FILE, src);
console.log("PATCH OK");
