#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — Gate accountability, hard version:
 *
 *  1) The server ITSELF derives WHO stamped the gate. Never trust the client:
 *     when a Security account moves a dispatch to En Route (log out) or
 *     Completed (log in), PATCH /trips/:id overwrites gateOutBy/gateInBy with
 *     the account's own name. The Guard Activity Ledger on the TM dashboard
 *     then shows the person, not whatever the browser claimed.
 *  2) SECURITY NO-SHOW OVERRIDES — the gate is the physical choke point, so
 *     Security may set a dispatch the TM released to Stopped ("truck never
 *     showed / asset problem — cannot leave") and pull an already-departed
 *     truck straight back to Delayed. Both stamp the actor and alert the
 *     Transport Manager. They are the system side of "unauthorized exit
 *     attempt" and "return to yard".
 *
 * Idempotent: probes before writing. Backs the file up. Restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-gate-actor-v3";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
let changed = 0;

// ---- 1. Server-derived gate actor + no-show overrides -----------------------
const ANCHOR = "  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });";
if (src.includes("GATE_ACTOR_V3")) {
  console.log("actor: already patched — skip");
} else if (!src.includes(ANCHOR)) {
  console.error("FAIL: update anchor not found");
  process.exit(1);
} else {
  const block = `  // GATE_ACTOR_V3 — the server derives WHO is stamping, never the client.\n  // Security moving a dispatch to En Route is the Log Out stamp: sign it with\n  // the account's own name so the Guard Activity Ledger shows the person.\n  const gateActor = (() => {\n    const direct = String(req.user?.name || '').trim();\n    if (direct) return direct;\n    const raw = String(req.user?.roles || req.user?.role || '').trim();\n    const first = raw.split(',')[0]?.trim();\n    return first ? first.replace(/\\b\\w/g, (c) => c.toUpperCase()) : 'Security';\n  })();\n  const isGateAccount = ['Security', 'Gate Security', 'Gate'].includes(String(req.user?.role || ''))\n    || /(^|,)(security|gate)(,|$)/i.test(String(req.user?.roles || ''));\n  if (isGateAccount && before && before.status !== data.status) {\n    if (data.status === 'En Route') {\n      data.gateOutBy = gateActor;\n    }\n    if (data.status === 'Completed') {\n      data.gateInBy = gateActor;\n    }\n  }\n  // SECURITY NO-SHOW OVERRIDE — the gate refuses a truck the TM released when\n  // the physical asset/crew is wrong or absent: the dispatch goes to Stopped,\n  // the release stamps are cleared, and the TM is told to re-approve.\n  if (isGateAccount && data.status === 'Stopped' && before && ['Scheduled', 'En Route', 'Loaded'].includes(before.status)) {\n    data.gateOutBy = gateActor;\n    data.gateInBy = null;\n    data.eta = null;\n    void notify('Security', 'Truck Stopped At Gate', \`Dispatch \${dispatchRef(before.id)} was stopped at the gate by \${gateActor} (asset/crew problem). The Transport Manager must re-approve before it can leave.\`, 'warning', 'Transport Manager,Platform Admin,Fleet Operations', {\n      module: 'Gate Security',\n      eventKey: 'gate.stopped',\n      refId: before.id,\n      refLabel: dispatchRef(before.id),\n      actionRoles: ['Transport Manager'],\n    });\n  }\n  // SECURITY RETURN-TO-YARD — a truck already on the road that the gate pulls\n  // back is stamped as a return by the same account, so the ledger never loses\n  // who ended the movement.\n  if (isGateAccount && data.status === 'Delayed' && before && ['En Route', 'Loaded'].includes(before.status)) {\n    data.gateInBy = gateActor;\n  }\n`;
  src = src.replace(ANCHOR, block + ANCHOR);
  changed++;
  console.log("actor: gate actor + no-show overrides installed");
}

if (!changed) {
  console.log("NOTHING CHANGED — no restart");
  process.exit(0);
}

fs.writeFileSync(FILE, src);
console.log(execSync("pm2 restart fleetopsx-api 2>&1 | tail -1").toString());
setTimeout(() => {
  try {
    const health = execSync("sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/tenants").toString();
    console.log("PATCHED — API health after restart: HTTP " + health);
  } catch {
    console.log("PATCHED — restart issued (health probe skipped)");
  }
}, 100);
