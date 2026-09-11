const fs = require("fs");
const { execSync } = require("child_process");

const path = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(path, "utf8");

if (src.includes("app.get('/api/trips/:id'")) {
  console.log("GET /api/trips/:id already present");
} else {
  const needle =
    "app.post('/api/trips', authenticate, async (req, res) => {\n  res.json(await prisma.trip.create({ data: req.body }));\n});";
  const insert =
    needle +
    "\napp.get('/api/trips/:id', authenticate, async (req, res) => {\n  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });\n  if (!trip) return res.status(404).json({ error: 'Trip not found' });\n  res.json(trip);\n});";
  if (!src.includes(needle)) {
    console.error("needle not found");
    process.exit(1);
  }
  src = src.replace(needle, insert);
  fs.writeFileSync(path, src);
  console.log("added GET /api/trips/:id");
}

execSync("pm2 restart fleetopsx-api", { stdio: "inherit" });
console.log("restarted");
