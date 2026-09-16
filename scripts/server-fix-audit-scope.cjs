/** Fixes audit middleware scope bug: path used before declaration in finish handler. */
const fs = require("fs");
const F = "/var/www/fleetopsx-api/index.ts";
let s = fs.readFileSync(F, "utf8");
const must = (c, l) => { if (!c) { console.error("FAIL: " + l); process.exit(1); } console.log("ok: " + l); };

const BROKEN = [
  "    const authPath = path.startsWith('auth/');",
  "    if (authPath && req.path !== '/api/auth/logout') return; // logins live in LoginReport",
].join("\n");
const FIXED = [
  "    const path = String(req.path).replace(/^\\/+/, '').replace(/^api\\//, '');",
  "    const authPath = path.startsWith('auth/');",
  "    if (authPath && path !== 'auth/logout') return; // logins live in LoginReport",
].join("\n");

must(s.includes(BROKEN), "broken block found");
s = s.replace(BROKEN, FIXED);
// Remove the now-duplicate declaration inside the async block.
s = s.replace(
  "    (async () => {\n      const path = String(req.path).replace(/^\\/+/, '').replace(/^api\\//, '');\n      const segs",
  "    (async () => {\n      const segs"
);
must(!s.includes("      const path = String(req.path).replace"), "no duplicate path decl");

fs.writeFileSync(F, s);
console.log("SCOPE FIX OK");
