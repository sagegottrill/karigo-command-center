/**
 * Repair: the notify() rewrite replaced the statement up to its `});` and left
 * the function's own closing brace orphaned, taking the API down. Remove it, then
 * make the file prove it compiles before it is written back.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const API = "/var/www/fleetopsx-api/index.ts";
const lines = fs.readFileSync(API, "utf8").split(/\r?\n/);

const marker = lines.findIndex((l) => /^\s+actionRequired: actionRoles\.length > 0,$/.test(l));
if (marker === -1) {
  console.error("FAIL: could not find the notify() data block");
  process.exit(1);
}
// After `  });` (closing the create call) the function closes with `}`. A second
// `}` immediately after it is the orphan.
let close = -1;
for (let i = marker; i < marker + 6; i += 1) {
  if (/^\}$/.test(lines[i])) {
    close = i;
    break;
  }
}
if (close === -1) {
  console.error("FAIL: could not find notify()'s closing brace");
  process.exit(1);
}
const removed = /^\}$/.test(lines[close + 1] || "");
if (removed) {
  lines.splice(close + 1, 1);
  console.log("ok: removed the orphaned brace after notify()");
} else {
  console.log("ok: no orphaned brace");
}

fs.writeFileSync(API, lines.join("\n"));

// The file must compile before the API is allowed to load it. esbuild reads the
// language from the file extension, so no --loader here.
try {
  execFileSync("npx", ["esbuild", API, "--outfile=/tmp/_syntax-check.js"], {
    stdio: "pipe",
  });
  console.log("ok: index.ts compiles");
  fs.unlinkSync("/tmp/_syntax-check.js");
} catch (error) {
  const out = String(error.stdout || "") + String(error.stderr || "");
  console.error("FAIL: index.ts does not compile:\n" + out.split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}
