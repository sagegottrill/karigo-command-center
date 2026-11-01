const fs = require("fs");
const p = "src/routes/workspace.app.fleet.tsx";
let s = fs.readFileSync(p, "utf8");
let ok = true;
const aOld = "? `Dispatch ${dispatchId(clash.conflicts[0])} closed";
const aNew = "? `Dispatch ${dispatchId(clash.conflicts[0] ?? clash.pending)} closed";
if (s.includes(aOld)) { s = s.replace(aOld, aNew); console.log("toast patched"); } else { ok = false; console.log("MISS toast"); }
const bOld = [
  "        confirmLabel={",
  "          clash",
  "            ? clash.conflicts.length === 1",
  "              ? `Close ${dispatchId(clash.conflicts[0])} & Approve`",
  "              : `Close ${clash.conflicts.length} old dispatches & Approve`",
  '            : "Close & Approve"',
  "        }",
].join("\n");
const bNew = [
  "        confirmLabel={",
  "          clash && clash.conflicts[0]",
  "            ? `Close ${dispatchId(clash.conflicts[0])} & Approve`",
  '            : "Close & Approve"',
  "        }",
].join("\n");
if (s.includes(bOld)) { s = s.replace(bOld, bNew); console.log("label patched"); } else { ok = false; console.log("MISS label"); }
fs.writeFileSync(p, s);
process.exit(ok ? 0 : 1);
