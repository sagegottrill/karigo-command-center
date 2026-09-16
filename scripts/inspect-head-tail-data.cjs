/**
 * Read-only: show what the real (pre-wipe) trip rows stored for the head/tail
 * fields, so we can tell whether a label is wrong or the data is.
 * Usage on the VPS: node inspect-head-tail-data.cjs
 */
const fs = require('fs');
const path = require('path');

const DIR = '/root/backups';
const file = fs.readdirSync(DIR).filter((f) => f.startsWith('fleetopsx-pre-golive')).sort().pop();
const sql = fs.readFileSync(path.join(DIR, file), 'utf8');

function decode(raw) {
  if (raw === '\\N') return null;
  return raw.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c));
}

function block(table) {
  const re = new RegExp(`^COPY public\\."?${table}"?\\s*\\(([^)]*)\\) FROM stdin;$`, 'm');
  const m = sql.match(re);
  const cols = m[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const rest = sql.slice(m.index + m[0].length + 1);
  const end = rest.indexOf('\n\\.\n');
  return (end === -1 ? rest : rest.slice(0, end))
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const f = line.split('\t').map(decode);
      const o = {};
      cols.forEach((c, i) => { o[c] = f[i]; });
      return o;
    });
}

const trips = block('Trip');
console.log('trips in backup:', trips.length);
console.log('--- truckReg | tailType | tailNumber | requestedTruckType ---');
for (const t of trips.slice(0, 12)) {
  console.log([t.truckReg, t.tailType, t.tailNumber, t.requestedTruckType].map((v) => JSON.stringify(v)).join(' | '));
}

const trucks = block('Truck');
console.log('\n--- truck heads (first 5) ---');
for (const t of trucks.slice(0, 5)) console.log(JSON.stringify(t));

const tails = block('Tail');
console.log('\n--- tails (first 5) ---');
for (const t of tails.slice(0, 5)) console.log(JSON.stringify(t));
