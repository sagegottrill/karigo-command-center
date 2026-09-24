/**
 * Server patch: a gate return stamp ends the cycle SERVER-SIDE.
 *
 * The client (lib/fleetopsx/return-trip.ts) already closes a returned dispatch —
 * Completed, gateInBy stamped, truck to Check Up, driver freed — but each of
 * those steps is a separate call wrapped in a best-effort try/catch, so a failed
 * driver write leaves the man committed with nothing left to retry it.
 *
 * This makes the end of the cycle a property of the record: the moment a return
 * stamp (gateInBy) lands on a trip that is Completed, the driver named on it
 * comes back to the board. One fact, written where it cannot be half-applied.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const ANCHOR = `  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });`;

const REPLACEMENT = `  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });
  /*
   * THE RETURN STAMP FREES THE DRIVER (return-frees-driver).
   *
   * A dispatch that came back must not leave its driver committed: availability
   * is derived from the LIVE dispatch list, so a Completed trip with the man
   * still marked 'On Trip' is a driver the fleet desk can never offer again —
   * which is exactly how men ended up stranded. The client closes the trip and
   * the truck; the driver is released HERE, in the same write that records the
   * return, so no half-finished return can strand anyone.
   */
  if ((raw.gateInBy !== undefined || data.gateInBy !== undefined) && String(trip.status) === 'Completed' && trip.driverName) {
    try {
      await prisma.driver.updateMany({
        where: { name: trip.driverName, status: 'On Trip' },
        data: { status: 'Active' },
      });
    } catch (e: any) {
      console.error('return could not free the driver:', e?.message || e);
    }
  }`;

must(src.includes(ANCHOR), "trip PATCH anchor found");
must(!src.includes("return-frees-driver"), "patch not already applied");

src = src.replace(ANCHOR, REPLACEMENT);

fs.writeFileSync("/tmp/index.patched.ts", src);
const ESBUILD = "/var/www/fleetopsx-api/node_modules/.bin/esbuild";
try {
  execFileSync(ESBUILD, ["/tmp/index.patched.ts", "--outfile=/tmp/index.patched.js"], { stdio: "pipe" });
  console.log("ok: esbuild compiles the patched file");
} catch (e) {
  console.error("FAIL: esbuild rejected the patch — nothing written");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log("PATCHED " + FILE);
