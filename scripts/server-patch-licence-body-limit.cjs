/**
 * The licence upload promised 10 MB and could not accept it.
 *
 * A 10 MB PDF becomes ~13.3 MB once it is a base64 data URL, and the route
 * parsed its body with `express.json({ limit: '12mb' })`. So the route's own
 * "larger than 10 MB" reply was unreachable: anything over roughly 8.9 MB was
 * cut off by the body parser first, and the officer saw a bare 413 instead of
 * being told the file was too big. The ceiling is now 16 MB, which holds a
 * full-size 10 MB scan with room for the JSON around it.
 *
 *   node server-patch-licence-body-limit.cjs
 */
const fs = require('fs');

const INDEX = '/var/www/fleetopsx-api/index.ts';
const FROM = "app.post('/api/drivers/:id/licence', authenticate, express.json({ limit: '12mb' })";
const TO = "app.post('/api/drivers/:id/licence', authenticate, express.json({ limit: '16mb' })";

const raw = fs.readFileSync(INDEX, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';

if (!raw.includes(FROM)) {
  if (raw.includes(TO)) {
    console.log('ok: the licence upload already parses a 16 MB body');
  } else {
    console.error('Anchor (the licence upload route) not found — aborting.');
    process.exit(1);
  }
} else {
  fs.writeFileSync(INDEX, raw.split(FROM).join(TO));
  console.log('ok: licence upload body ceiling 12mb -> 16mb');
}
