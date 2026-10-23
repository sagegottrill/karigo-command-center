/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) — 2026-10-22.
 *
 * The mobile Loading Site now works on the same endpoints as the web's Loading
 * department: a pickup is a "Loading" tracking checkpoint (POST /api/tracking)
 * for the site. Loading Operations staff can already log it. A Partner Loader
 * account (role "Partner Loader", beside "Customer Portals (External)") was
 * refused with 403, so the partner running the site could see its trucks but
 * not confirm a pickup.
 *
 * This lets "Partner Loader" through the door, and ONLY for the Loading leg —
 * a loader confirms collection at its own yard and nothing else on the
 * journey (In Transit, At Destination, Offloaded stay Tracking's).
 *
 * Run with: node /tmp/server-patch-loader-checkpoints.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

if (src.includes("LOADER-CHECKPOINT")) {
  console.log("skip: patch already applied");
  process.exit(0);
}

const FROM =
  "app.post('/api/tracking', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading'), async (req, res) => {\n  const { tripId, location, leg } = req.body;\n  if (!tripId || !location || !leg) return res.status(400).json({ error: 'Missing required fields' });";
const TO = [
  "app.post('/api/tracking', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading', 'Partner Loader'), async (req, res) => {",
  "  const { tripId, location, leg } = req.body;",
  "  if (!tripId || !location || !leg) return res.status(400).json({ error: 'Missing required fields' });",
  "  // LOADER-CHECKPOINT: a Partner Loader confirms collection at its own site —",
  "  // the Loading leg only. Every other leg stays with the staff roles above.",
  "  {",
  "    const held: string[] = Array.isArray((req as any).user?.roles) ? (req as any).user.roles : [String((req as any).user?.role || '')];",
  "    const staff = ['Platform Admin', 'Transport Manager', 'Fleet Operations', 'Security', 'Tracking', 'Loading'].some((r) => held.includes(r));",
  "    if (!staff && String(leg).trim().toLowerCase() !== 'loading') {",
  "      return res.status(403).json({ error: 'A loading site can only confirm loading.' });",
  "    }",
  "  }",
].join("\n");

const at = src.indexOf(FROM);
if (at < 0 || src.indexOf(FROM, at + FROM.length) >= 0) {
  console.error("FAILED: the POST /api/tracking header was not found exactly once — nothing written.");
  process.exit(1);
}
src = src.slice(0, at) + TO + src.slice(at + FROM.length);
fs.writeFileSync(FILE + ".bak-loader-checkpoints", fs.readFileSync(FILE));
fs.writeFileSync(FILE, src);
console.log("ok: Partner Loader may log Loading checkpoints (backup at " + FILE + ".bak-loader-checkpoints)");
