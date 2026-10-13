/**
 * BUGFIX-ROUTE-GATES — closes the "any logged-in account can mutate critical
 * tables" holes found in the route sweep:
 *   • Driver roster writes (onboard/edit/delete/licence) now need HR-class
 *     roles — this was the shared-login duty-flip hole from the ops chat.
 *   • Inventory catalog mutations need store/fleet-class roles (requisitions
 *     stay open to every department: requesting is everyone's).
 *   • Work-order edits match the same roles that create them.
 *   • Procurement needs store/management; the legacy fuel approval needs
 *     money-class roles (its approval writes an Expense).
 *   • Inventory-requisition PATCH loses its blind passthrough: only the
 *     ticket's own decision/request fields are client-writable.
 *
 * Usage: node scripts/bugfix-route-gates.mjs <index.ts> [--skip <id,id>]
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
const skipArg = argv.find((a) => a.startsWith('--skip'));
const skipIndex = skipArg ? argv.indexOf(skipArg) : -1;
const skipList = skipArg ? skipArg.includes('=') ? skipArg.split('=')[1] : argv[skipIndex + 1] || '' : '';
const skipped = new Set(skipList.split(',').map((v) => v.trim()).filter(Boolean));

if (!file) {
  console.error('Usage: node scripts/bugfix-route-gates.mjs <path-to-index.ts> [--skip <id>]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const HR_ROLE_LIST = "authorize('Platform Admin', 'Transport Manager', 'HR', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations')";
const STORE_ROLE_LIST = "authorize('Platform Admin', 'Transport Manager', 'Parts & Store', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering')";
const MGMT_ROLE_LIST = "authorize('Platform Admin', 'Transport Manager', 'Parts & Store')";
const MONEY_ROLE_LIST = "authorize('Platform Admin', 'Transport Manager', 'Accounts', 'Accountant')";
const ENG_ROLE_LIST = "authorize('Engineering', 'Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations')";

const patches = [
  {
    id: 'gate-driver-post',
    from: `app.post('/api/drivers', authenticate, async (req, res) => {`,
    to: `app.post('/api/drivers', authenticate, ${HR_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-driver-patch',
    from: `app.patch('/api/drivers/:id', authenticate, async (req, res) => {`,
    to: `app.patch('/api/drivers/:id', authenticate, ${HR_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-driver-delete',
    from: `app.delete('/api/drivers/:id', authenticate, async (req, res) => {`,
    to: `app.delete('/api/drivers/:id', authenticate, ${HR_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-licence-post',
    from: `app.post('/api/drivers/:id/licence', authenticate, express.json({ limit: '16mb' }), async (req, res) => {`,
    to: `app.post('/api/drivers/:id/licence', authenticate, ${HR_ROLE_LIST}, express.json({ limit: '16mb' }), async (req, res) => {`,
  },
  {
    id: 'gate-licence-delete',
    from: `app.delete('/api/drivers/:id/licence', authenticate, async (req, res) => {`,
    to: `app.delete('/api/drivers/:id/licence', authenticate, ${HR_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-workorder-patch',
    from: `app.patch('/api/work-orders/:id', authenticate, async (req, res) => {`,
    to: `app.patch('/api/work-orders/:id', authenticate, ${ENG_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-post',
    from: `app.post('/api/inventory', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-patch',
    from: `app.patch('/api/inventory/:id', authenticate, async (req, res) => {`,
    to: `app.patch('/api/inventory/:id', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-delete',
    from: `app.delete('/api/inventory/:id', authenticate, async (req, res) => {`,
    to: `app.delete('/api/inventory/:id', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-purchase',
    from: `app.post('/api/inventory/:id/purchase', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory/:id/purchase', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-adjust',
    from: `app.post('/api/inventory/:id/adjust', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory/:id/adjust', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-import',
    from: `app.post('/api/inventory/import', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory/import', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-reconcile',
    from: `app.post('/api/inventory/:id/reconcile', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory/:id/reconcile', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-inventory-release',
    from: `app.post('/api/inventory/:id/release', authenticate, async (req, res) => {`,
    to: `app.post('/api/inventory/:id/release', authenticate, ${STORE_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'requisition-whitelist',
    from: `app.patch('/api/inventory-requisitions/:id', authenticate, async (req, res) => {
  res.json(await prisma.inventoryRequisition.update({ where: { id: req.params.id }, data: req.body }));
});`,
    to: `app.patch('/api/inventory-requisitions/:id', authenticate, async (req, res) => {
  // REQUISITION-EDIT-WHITELIST: the screens edit the ticket's own words — the
  // decision (status / decisionNote) or the request's own lines. Identity and
  // audit columns are never client-writable, so a stray client cannot rewrite
  // the queue's bookkeeping.
  const EDITABLE_REQUEST_FIELDS = ['status', 'decisionNote', 'quantity', 'reason', 'part', 'mechanic', 'truckReg', 'workOrder'];
  const body = req.body || {};
  const data: any = {};
  for (const key of EDITABLE_REQUEST_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  res.json(await prisma.inventoryRequisition.update({ where: { id: req.params.id }, data }));
});`,
  },
  {
    id: 'gate-procurement-post',
    from: `app.post('/api/procurement', authenticate, async (req, res) => {`,
    to: `app.post('/api/procurement', authenticate, ${MGMT_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-procurement-patch',
    from: `app.patch('/api/procurement/:id', authenticate, async (req, res) => {`,
    to: `app.patch('/api/procurement/:id', authenticate, ${MGMT_ROLE_LIST}, async (req, res) => {`,
  },
  {
    id: 'gate-fuel-patch',
    from: `app.patch('/api/fuel/:id', authenticate, async (req, res) => {`,
    to: `app.patch('/api/fuel/:id', authenticate, ${MONEY_ROLE_LIST}, async (req, res) => {`,
  },
];

let failed = [];
const applied = [];
for (const p of patches) {
  if (skipped.has(p.id)) continue;
  if (!s.includes(p.from)) {
    failed.push(p.id);
    continue;
  }
  const count = s.split(p.from).length - 1;
  if (count !== 1) {
    failed.push(`${p.id} (anchor found ${count}x, need exactly 1)`);
    continue;
  }
  s = s.replace(p.from, p.to);
  applied.push(p.id);
}

if (failed.length) {
  console.error('PATCH FAILED — no file written. Missing anchors:');
  for (const f of failed) console.error('  -', f);
  process.exit(1);
}
if (!applied.length) {
  console.error('Nothing to apply.');
  process.exit(1);
}

fs.writeFileSync(file, hadCRLF ? s.replace(/\n/g, '\r\n') : s);
console.log('Patched', file, '—', applied.length, 'fixes applied:', applied.join(', '));
