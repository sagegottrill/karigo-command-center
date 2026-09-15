/**
 * One-shot server patch (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * The partner portal lets a customer amend or withdraw their OWN request while
 * it is still pending — but the API answered every one of those saves with
 * 403 "Forbidden: Insufficient privileges" because the PATCH/DELETE routes only
 * listed internal roles.
 *
 * Now, for the partner role only:
 *   PATCH  — allowed on THEIR company's trip, while Requested / Awaiting Approval,
 *            limited to request-owned fields (never status, tail, driver, costs).
 *   DELETE — allowed on THEIR company's trip in the same two states.
 *
 * Run: node /tmp/patch-partner-trip-edits.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

if (src.includes("PARTNER_EDITABLE_TRIP_FIELDS")) {
  console.log("skip: partner trip edits already patched");
} else {
  // ---------------------------------------------------------------- PATCH route
  const patchAnchor =
    "app.patch('/api/trips/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking'), async (req, res) => {";
  must(src.includes(patchAnchor), "PATCH authorize anchor");

  src = src.replace(
    patchAnchor,
    "app.patch('/api/trips/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Customer Portals (External)'), async (req: any, res) => {\n  // A partner may amend its OWN pending request — and nothing else. These are the\n  // only fields a request owns; status/tail/driver/costs stay with the operators.\n  const isPartner = req.user.role === 'Customer Portals (External)';\n  const PARTNER_EDITABLE_TRIP_FIELDS = [\n    'requestedTruckType',\n    'pickup',\n    'dropoff',\n    'customerConsignee',\n    'cargo',\n    'loadingSite',\n  ];\n  const PARTNER_EDITABLE_STATUSES = ['Requested', 'Awaiting Approval'];\n  if (isPartner) {\n    const existing = await prisma.trip.findUnique({ where: { id: req.params.id } });\n    if (!existing) return res.status(404).json({ error: 'Request not found' });\n    const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);\n    if (!samePartnerCompany(existing.customer, partnerName)) {\n      return res.status(403).json({ error: 'You can only modify requests raised by your own company.' });\n    }\n    if (!PARTNER_EDITABLE_STATUSES.includes(existing.status)) {\n      return res\n        .status(403)\n        .json({ error: 'This request can no longer be modified — it has already been processed.' });\n    }\n  }\n",
  );
  console.log("ok: PATCH allows the owning partner on pending requests");

  // Restrict the field whitelist for partners.
  const listAnchor =
    "  const ALLOWED_TRIP_FIELDS = ['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'customerConsignee', 'customer', 'cargo', 'loadingSite', 'revenue', 'status', 'directCosts', 'tailNumber'];";
  must(src.includes(listAnchor), "ALLOWED_TRIP_FIELDS anchor");
  src = src.replace(
    listAnchor,
    "  const ALLOWED_TRIP_FIELDS = isPartner\n    ? PARTNER_EDITABLE_TRIP_FIELDS\n    : ['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'customerConsignee', 'customer', 'cargo', 'loadingSite', 'revenue', 'status', 'directCosts', 'tailNumber'];",
  );
  console.log("ok: partner field whitelist applied");

  // --------------------------------------------------------------- DELETE route
  const delAnchor = "    if (!samePartnerCompany(trip.customer, partnerName) || !['Requested'].includes(trip.status)) {";
  must(src.includes(delAnchor), "DELETE partner condition anchor");
  src = src.replace(
    delAnchor,
    "    if (\n      !samePartnerCompany(trip.customer, partnerName) ||\n      !['Requested', 'Awaiting Approval'].includes(trip.status)\n    ) {",
  );
  console.log("ok: partner may withdraw a pending request");

  fs.writeFileSync(FILE, src);
}

console.log("DONE — restart the API: pm2 restart fleetopsx-api");
