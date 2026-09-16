/**
 * Server patch for /var/www/fleetopsx-api: stop announcing "Truck Returning".
 * Every portal (including partners) received a "Truck Returning" notification
 * when a truck headed back. The client wants that internal road-state hidden —
 * a returning truck reads as still In Transit until it is completed.
 * Removes the 'Returning' entry from TRIP_STATUS_NOTICES.
 * Idempotent. Usage: node server-patch-remove-returning-notice.cjs
 */
const fs = require('fs');
const { execSync } = require('child_process');

const INDEX = '/var/www/fleetopsx-api/index.ts';
const MARK = 'returning-notice-removed';

function main() {
  const backup = `${INDEX}.bak-returning-notice`;
  if (!fs.existsSync(backup)) fs.copyFileSync(INDEX, backup);
  let src = fs.readFileSync(INDEX, 'utf8');
  if (src.includes(MARK)) {
    console.log('notice: already removed — skip');
  } else {
    const re = /^\s*'Returning': \{ category: 'Operations'.*\n/m;
    if (!re.test(src)) throw new Error("could not find the 'Returning' status notice");
    src = src.replace(re, `    // ${MARK}\n`);
    fs.writeFileSync(INDEX, src);
    console.log("notice: removed the 'Returning' entry (no more 'Truck Returning' alerts)");
  }
  console.log('restart: pm2 reload…');
  execSync('pm2 reload fleetopsx-api --update-env', { stdio: 'inherit' });
  console.log('DONE');
}

main();
