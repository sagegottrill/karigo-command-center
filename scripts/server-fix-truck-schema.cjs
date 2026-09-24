/**
 * The schema stopped validating, so `prisma generate` stopped running — and that
 * is why the staff register cannot save a department.
 *
 * A patch that added the Transport Manager's review to a lubricant disbursal
 * ALSO left a copy of those four fields on the `Truck` model, including a second
 * `status` column. Prisma refuses the whole file:
 *
 *   error: Field "status" is already defined on model "Truck".
 *
 * Nothing reads them: the review lives on LubricantDisbursal (index.ts writes
 * `prisma.lubricantDisbursal.update({ status, reviewedBy, reviewedAt,
 * reviewNote })`), and the generated client never carried the stray fields
 * because generation has been failing since the day they were added. Truck keeps
 * its own single `status` — the head's operating state — and the review block on
 * the wrong model goes.
 *
 *   node server-fix-truck-schema.cjs && npx prisma generate
 */
const fs = require('fs');

const SCHEMA = '/var/www/fleetopsx-api/prisma/schema.prisma';
const raw = fs.readFileSync(SCHEMA, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

const STRAY_STATUS = /^\s+status\s+String\s+@default\("Pending"\)\s*$/;
// Scoped to the Truck model: another model's own `status` defaults to Pending
// legitimately, and editing that one would be a different bug entirely.
const modelAt = lines.findIndex((l) => /^model Truck \{/.test(l));
if (modelAt === -1) {
  console.error('Anchor (model Truck) not found — aborting.');
  process.exit(1);
}
const modelEnd = lines.findIndex((l, i) => i > modelAt && /^\}/.test(l));
const at = lines.findIndex((l, i) => i > modelAt && i < modelEnd && STRAY_STATUS.test(l));

if (at === -1) {
  console.log('ok: the Truck model carries no stray review block');
  process.exit(0);
}

const expected = [
  /^\s*\/\/\/ The Transport Manager's review of a logged dispense/,
  /^\s*\/\/\/ until he endorses the entry, or Declined when he flags it\./,
  STRAY_STATUS,
  /^\s+reviewedBy\s+String\?/,
  /^\s+reviewedAt\s+DateTime\?/,
  /^\s*\/\/\/ Why it was declined/,
  /^\s+reviewNote\s+String\?/,
  /^\s+status\s+String\s+@default\("Active"\)\s*$/,
];

const window = lines.slice(at - 2, at + 6);
expected.forEach((re, i) => {
  if (!re.test(window[i] ?? '')) {
    console.error(`Refusing to edit: line ${at - 2 + i + 1} is not the stray review block.`);
    console.error(`  expected ${re} but found: ${JSON.stringify(window[i])}`);
    process.exit(1);
  }
});

// Drop the seven stray lines; the truck's own `status` line stays.
lines.splice(at - 2, 7);
fs.writeFileSync(SCHEMA, lines.join(eol));

const start = lines.findIndex((l) => /^model Truck \{/.test(l));
const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
const model = lines.slice(start, end + 1);
console.log('ok: stray review block removed from model Truck');
console.log(model.join('\n'));
