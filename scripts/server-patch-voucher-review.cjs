/**
 * Server patch: the Transport Manager's decision on a dispatch's cost sheet.
 *
 * The design's Direct Cost Vouchers screen is not a new money ledger — every
 * dispatch already stores its own direct-cost breakdown (trip allowance, return
 * waybill, motor boy, transit tickets, contingency, bonus). What did not exist
 * is the DECISION: the six figures were a fact nobody endorsed, so a voucher
 * could be neither approved nor declined, and nothing could say who did either.
 *
 * The decision is written beside the figures it is about — on the trip's own
 * `directCosts`, exactly where the litre release already lives — so a voucher
 * can never drift from the costs it authorises. No new table, no new column,
 * no change to any existing figure.
 *
 *   POST /api/trips/:id/voucher   { status: Approved | Declined | Pending, note? }
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";
const MARK = "// ---- Direct cost voucher: the TM endorses the cost sheet ---------------";
const ANCHOR = "app.get('/api/lubricant/notifications'";

const raw = fs.readFileSync(INDEX, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes(MARK)) {
  console.log("ok: voucher route already present — nothing to do");
  process.exit(0);
}

const ROUTE = `${MARK}
app.post('/api/trips/:id/voucher', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const status = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim();
  if (!['Pending', 'Approved', 'Declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be Pending, Approved or Declined' });
  }
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });
    const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
    const by = req.user.name || req.user.email || 'Transport Manager';
    dc.voucher = { status, by, at: new Date().toISOString(), note: note || null };
    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });
    try {
      const what = dispatchRef(trip.id);
      await notify('Accounts', 'Voucher ' + (status === 'Approved' ? 'approved' : status === 'Declined' ? 'declined' : 'reopened'),
        what + "'s direct-cost voucher was " + (status === 'Approved' ? 'approved' : status === 'Declined' ? 'declined' : 'reopened') +
          ' by ' + by + (note ? ' — ' + note : '') + '.',
        status === 'Declined' ? 'warning' : 'success',
        'Accounts,Transport Manager,Fleet Operations',
        { module: 'Accounts', eventKey: 'accounts.voucher_' + status.toLowerCase(), refId: trip.id, refLabel: what });
    } catch (_) { /* the decision stands even if the alert fails */ }
    res.json({ ok: true, tripId: trip.id, voucher: (updated.directCosts as any)?.voucher ?? null });
  } catch (e: any) {
    console.error('POST /api/trips/:id/voucher failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not record the voucher decision.' });
  }
});

`;

const at = raw.indexOf(ANCHOR);
if (at === -1) {
  console.error("Anchor (lubricant/notifications route) not found — aborting.");
  process.exit(1);
}
fs.writeFileSync(INDEX, raw.slice(0, at) + ROUTE.split("\n").join(eol) + raw.slice(at));
console.log("ok: POST /api/trips/:id/voucher inserted");
