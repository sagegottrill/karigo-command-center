/**
 * Server patch: the Accounts desk pays against a dispatch's cost sheet.
 *
 * The Transport Manager's side ENDORSES the six figures a dispatch was
 * configured with; this is the other half of the same money — the desk that
 * actually pays it. What did not exist anywhere was the payment itself: which
 * method was used, the bank reference, who disbursed it, and whether the journey
 * was reconciled afterwards. The board the Accounts department works from cannot
 * show "VIA BANK TRANSFER" under a total, or a Disbursed pill, because nothing
 * could write those facts down.
 *
 * Both routes record onto the SAME trip `directCosts` sheet the six figures and
 * the voucher decision already live on, so a disbursal can never drift from the
 * costs it paid, and no new table is needed.
 *
 *   POST /api/trips/:id/disbursement
 *     { amounts?: { tripAllowance, returnWaybill, motorBoy, ticket,
 *                   extraAllowance, bonus },
 *       paymentMethod, bankRef, officer,
 *       status: 'Disbursed (Funds Released to Driver)'
 *             | 'Reconciled (Journey Concluded)'
 *             | 'Pending Disbursal' }        // reopens a mistake
 *
 *   POST /api/trips/:id/direct-cost
 *     { key?: one of the six, label?: string, amount: number }
 *     - a named category CORRECTS that figure on the sheet
 *     - anything else ADDS a line of its own, beside the six
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";
const MARK = "// ---- Accounts desk: the money actually leaves ------------------------";
const ANCHOR = "app.get('/api/lubricant/notifications'";

const raw = fs.readFileSync(INDEX, "utf8");
if (raw.includes(MARK)) {
  console.log("ok: the Accounts disbursal routes are already present - nothing to do");
  process.exit(0);
}

const ROUTE = [
  MARK,
  "const DIRECT_COST_KEYS = ['tripAllowance', 'returnWaybill', 'motorBoy', 'ticket', 'extraAllowance', 'bonus'];",
  "const DISBURSEMENT_STATUSES = ['Disbursed (Funds Released to Driver)', 'Reconciled (Journey Concluded)'];",
  "const PENDING_DISBURSAL = 'Pending Disbursal';",
  "",
  "function costSheet(trip: any) {",
  "  return trip && trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};",
  "}",
  "",
  "// The Accounts desk records that the money left, and how.",
  "app.post('/api/trips/:id/disbursement', authenticate, authorize('Accounts', 'Accountant', 'Platform Admin'), async (req: any, res) => {",
  "  const body = req.body || {};",
  "  const status = String(body.status || '').trim();",
  "  if (status && status !== PENDING_DISBURSAL && !DISBURSEMENT_STATUSES.includes(status)) {",
  "    return res.status(400).json({ error: 'Unknown disbursement status: ' + status });",
  "  }",
  "  try {",
  "    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });",
  "    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });",
  "    const dc = costSheet(trip);",
  "    // The six figures stay the dispatch's own: the desk may correct one it was",
  "    // configured with, but only with a real number.",
  "    const amounts = body.amounts && typeof body.amounts === 'object' ? body.amounts : {};",
  "    let corrected = 0;",
  "    for (const key of DIRECT_COST_KEYS) {",
  "      if (!(key in amounts)) continue;",
  "      const value = Number((amounts as any)[key]);",
  "      if (!Number.isFinite(value) || value < 0) {",
  "        return res.status(400).json({ error: key + ' must be a number of naira or more' });",
  "      }",
  "      if (Number(dc[key] || 0) !== value) corrected += 1;",
  "      dc[key] = value;",
  "    }",
  "    const by = req.user.name || req.user.email || 'Accounts';",
  "    if (status === PENDING_DISBURSAL) {",
  "      // Reopening: a disbursal recorded against the wrong truck has to be",
  "      // withdrawable, or the board keeps a payment that never happened.",
  "      delete dc.disbursement;",
  "    } else {",
  "      dc.disbursement = {",
  "        paymentMethod: String(body.paymentMethod || '').trim(),",
  "        bankRef: String(body.bankRef || '').trim(),",
  "        officer: String(body.officer || '').trim(),",
  "        status,",
  "        at: new Date().toISOString(),",
  "        by,",
  "      };",
  "    }",
  "    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });",
  "    try {",
  "      const what = dispatchRef(trip.id);",
  "      const message = status === PENDING_DISBURSAL",
  "        ? what + ' was reopened by Accounts - the disbursal captured against it was withdrawn.'",
  "        : what + ' was ' + (status === DISBURSEMENT_STATUSES[1] ? 'reconciled' : 'disbursed') +",
  "          ' by ' + by + (dc.disbursement.paymentMethod ? ' via ' + dc.disbursement.paymentMethod : '') +",
  "          (dc.disbursement.bankRef ? ' (ref ' + dc.disbursement.bankRef + ')' : '') +",
  "          (corrected ? ' - ' + corrected + ' cost figure(s) corrected on capture' : '') + '.';",
  "      await notify('Accounts', 'Direct cost ' + (status === PENDING_DISBURSAL ? 'disbursal reopened' : 'disbursed'),",
  "        message, status === PENDING_DISBURSAL ? 'warning' : 'success',",
  "        'Accounts,Transport Manager,Fleet Operations',",
  "        { module: 'Accounts', eventKey: 'accounts.disbursement_' + (status === PENDING_DISBURSAL ? 'reopened' : 'captured'),",
  "          refId: trip.id, refLabel: what });",
  "    } catch (_) { /* the record stands even if the alert fails */ }",
  "    res.json({ ok: true, tripId: trip.id, directCosts: updated.directCosts });",
  "  } catch (e: any) {",
  "    console.error('POST /api/trips/:id/disbursement failed:', e?.message || e);",
  "    res.status(500).json({ error: e?.message || 'Could not record the disbursal.' });",
  "  }",
  "});",
  "",
  "// A cost the six categories do not cover: a line the desk adds, or a correction",
  "// to a category that was configured with the wrong figure.",
  "app.post('/api/trips/:id/direct-cost', authenticate, authorize('Accounts', 'Accountant', 'Platform Admin'), async (req: any, res) => {",
  "  const body = req.body || {};",
  "  const key = String(body.key || '').trim();",
  "  const label = String(body.label || '').trim();",
  "  const amount = Number(body.amount);",
  "  if (!Number.isFinite(amount) || amount < 0) {",
  "    return res.status(400).json({ error: 'Amount must be a number of naira or more' });",
  "  }",
  "  if (!key && !label) {",
  "    return res.status(400).json({ error: 'Name the cost, or pick the category it belongs to' });",
  "  }",
  "  if (key && !DIRECT_COST_KEYS.includes(key)) {",
  "    return res.status(400).json({ error: 'Unknown direct cost category: ' + key });",
  "  }",
  "  try {",
  "    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });",
  "    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });",
  "    const dc = costSheet(trip);",
  "    const by = req.user.name || req.user.email || 'Accounts';",
  "    const at = new Date().toISOString();",
  "    if (key) {",
  "      dc[key] = amount;",
  "    } else {",
  "      const extras = Array.isArray(dc.extras) ? dc.extras.slice() : [];",
  "      const existing = extras.findIndex((line: any) => String(line?.label || '').toLowerCase() === label.toLowerCase());",
  "      // The same extra twice is the same cost corrected, not a second charge.",
  "      if (existing >= 0) extras[existing] = { ...extras[existing], amount, at, by };",
  "      else extras.push({ label, amount, at, by });",
  "      dc.extras = extras;",
  "    }",
  "    const updated = await prisma.trip.update({ where: { id: trip.id }, data: { directCosts: dc } });",
  "    try {",
  "      const what = dispatchRef(trip.id);",
  "      await notify('Accounts', 'Direct cost added',",
  "        what + ': ' + (key || label) + ' recorded at ' + 'NGN ' + amount.toLocaleString() + ' by ' + by + '.',",
  "        'info', 'Accounts,Transport Manager,Fleet Operations',",
  "        { module: 'Accounts', eventKey: 'accounts.direct_cost_added', refId: trip.id, refLabel: what });",
  "    } catch (_) { /* the record stands even if the alert fails */ }",
  "    res.json({ ok: true, tripId: trip.id, directCosts: updated.directCosts });",
  "  } catch (e: any) {",
  "    console.error('POST /api/trips/:id/direct-cost failed:', e?.message || e);",
  "    res.status(500).json({ error: e?.message || 'Could not record the cost.' });",
  "  }",
  "});",
  "",
].join("\n");

const at = raw.indexOf(ANCHOR);
if (at === -1) {
  console.error("Anchor (lubricant/notifications route) not found - aborting.");
  process.exit(1);
}
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
fs.writeFileSync(INDEX, raw.slice(0, at) + ROUTE.split("\n").join(eol) + raw.slice(at));
console.log("ok: the two Accounts disbursal routes inserted");
