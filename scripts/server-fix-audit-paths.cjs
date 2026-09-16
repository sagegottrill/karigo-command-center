/** Fixes audit middleware path normalization (module names + login skip). */
const fs = require("fs");
const F = "/var/www/fleetopsx-api/index.ts";
let s = fs.readFileSync(F, "utf8");
const must = (c, l) => { if (!c) { console.error("FAIL: " + l); process.exit(1); } console.log("ok: " + l); };

// Path arrives as /api/<module>/... — strip mount + leading slashes ONCE, here.
must(s.includes("const path = String(req.path);"), "path line present");
s = s.replace(
  "const path = String(req.path);",
  "const path = String(req.path).replace(/^\\/+/, '').replace(/^api\\//, '');"
);

// authPath must use the normalized path (login/ me / logout skip; logout still audited).
must(s.includes("const authPath = req.path.startsWith('/auth/');"), "authPath line present");
s = s.replace(
  "const authPath = req.path.startsWith('/auth/');",
  "const authPath = path.startsWith('auth/');"
);

fs.writeFileSync(F, s);
console.log("FIX OK");
