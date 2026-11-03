const fs = require("fs");
const p = "src/routes/workspace.app.active-dispatch.index.tsx";
let s = fs.readFileSync(p, "utf8");
// 1. Remove the PULSE consts
const cA = s.indexOf("/**\n * FLEET PULSE (the Traccar board");
if (cA === -1) { console.error("consts MISS"); process.exit(1); }
const cAend = s.indexOf("];", s.indexOf("PULSE_DELAYS", cA)) + 2;
s = s.slice(0, cA) + s.slice(cAend);
// 2. Remove the stageFilter state line
s = s.replace(/  \/\/ FLEET PULSE: the stage tile.*\n  const \[stageFilter, setStageFilter\] = useState<string>\("All"\);\n/, "");
// 3. Remove the stageFilter condition in filtered
s = s.replace("      if (stageFilter !== \"All\" && trip.status !== stageFilter) return false;\n", "");
// 4. Fix the deps
s = s.replace("}, [trips, search, filter, partner, driverMatchFor, stageFilter]);", "}, [trips, search, filter, partner, driverMatchFor]);");
// 5. Remove the pulse memo
const mA = s.indexOf("  /** FLEET PULSE counts");
if (mA === -1) { console.error("memo MISS"); process.exit(1); }
const mEnd = s.indexOf("}, [trips]);", mA) + "}, [trips]);".length;
s = s.slice(0, mA) + s.slice(mEnd);
fs.writeFileSync(p, s);
console.log("tiles removed; memo removed; state removed");
