const fs = require("fs");
// central-dashboard REQUEST_PILL_TONE
let s = fs.readFileSync("src/components/fleetopsx/central-dashboard.tsx", "utf8");
if (s.includes('Seen: "teal",')) {
  s = s.replace('    Seen: "teal",', '    Seen: "teal",\n    Assigned: "teal",');
  fs.writeFileSync("src/components/fleetopsx/central-dashboard.tsx", s);
  console.log("dashboard tone patched");
} else console.log("dashboard MISS");

// partner-requests statusPillClass + filter list
let p = fs.readFileSync("src/routes/workspace.app.partner-requests.tsx", "utf8");
if (p.includes('case "Seen":')) {
  p = p.replace(
    `    case "Seen":
      // Same orange the partner portals use for an acknowledged request.
      return "bg-[#F99E1F] text-white";`,
    `    case "Seen":
      // Same orange the partner portals use for an acknowledged request.
      return "bg-[#F99E1F] text-white";
    case "Assigned":
      // Progress past Seen: Fleet Operations hung a vehicle on it.
      return "bg-[#30B0C7] text-white";`,
  );
  p = p.replace(
    `  "Pending",
  "Seen",
  "Scheduled",`,
    `  "Pending",
  "Seen",
  "Assigned",
  "Scheduled",`,
  );
  fs.writeFileSync("src/routes/workspace.app.partner-requests.tsx", p);
  console.log("partner-requests patched");
} else console.log("partner-requests MISS");

// customer-portal dashboard: its own mapping + class
let d = fs.readFileSync("src/routes/workspace.customer-portal._auth.dashboard.tsx", "utf8");
if (d.includes('      return "Seen";')) {
  d = d.replace(
    `    case "Awaiting Approval":
    case "Approved":
    case "Approved for Dispatch":
      // TM's FIRST approval = acknowledged only (Seen). "Scheduled" comes after
      // the second (final) approval, when the trip is on the dispatch board.
      return "Seen";`,
    `    case "Awaiting Approval":
    case "Approved":
    case "Approved for Dispatch":
      // TM's FIRST approval = acknowledged only (Seen); the word becomes
      // "Assigned" the moment Fleet Operations hangs a vehicle on it, and
      // "Scheduled" after the final approval (Fortune, 31 Oct 2026).
      return trip.truckReg || trip.headId || trip.driverName ? "Assigned" : "Seen";`,
  );
  d = d.replace(
    `    case "Seen":
      return "bg-[#F99E1F] text-white";`,
    `    case "Seen":
      return "bg-[#F99E1F] text-white";
    case "Assigned":
      return "bg-[#30B0C7] text-white";`,
  );
  fs.writeFileSync("src/routes/workspace.customer-portal._auth.dashboard.tsx", d);
  console.log("customer-portal patched");
} else console.log("customer-portal MISS");
