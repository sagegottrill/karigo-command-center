/**
 * VPS patch: reject Set New Password when the new value matches the current hash.
 * Run on server: node patch-reject-same-password.js
 */
const fs = require("fs");
const { execSync } = require("child_process");

const INDEX = "/var/www/fleetopsx-api/index.ts";
let index = fs.readFileSync(INDEX, "utf8");

const MARKER = "New password must be different from your current password";

if (index.includes(MARKER)) {
  console.log("index.ts: same-password rejection already present");
} else {
  const from = `app.patch('/api/users/:id', authenticate, async (req, res) => {
  const data: any = { ...req.body };
  // Strip fields Prisma User does not store
  delete data.username;
  delete data.department;
  delete data.staffId;
  delete data.partnerCompanyName;
  delete data.roles;
  delete data.roleNames;
  delete data.email; // keep email stable unless explicitly supported later
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 10);
    // Admin reset / temp password → force Set New Password on next login
    if (data.passwordResetRequired === undefined) data.passwordResetRequired = true;
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(userPayload(user));
});`;

  const to = `app.patch('/api/users/:id', authenticate, async (req, res) => {
  const data: any = { ...req.body };
  // Strip fields Prisma User does not store
  delete data.username;
  delete data.department;
  delete data.staffId;
  delete data.partnerCompanyName;
  delete data.roles;
  delete data.roleNames;
  delete data.email; // keep email stable unless explicitly supported later
  if (data.password) {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (existing?.password && await bcrypt.compare(String(data.password), existing.password)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    data.password = await bcrypt.hash(data.password, 10);
    // Admin reset / temp password → force Set New Password on next login
    if (data.passwordResetRequired === undefined) data.passwordResetRequired = true;
  }
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(userPayload(user));
});`;

  if (!index.includes(from)) {
    console.error("index.ts: expected PATCH /api/users/:id block not found — patch manually");
    process.exit(1);
  }
  index = index.replace(from, to);
  fs.writeFileSync(INDEX, index);
  console.log("index.ts: same-password rejection wired");
}

execSync("npx tsc --noEmit || true", { cwd: "/var/www/fleetopsx-api", stdio: "inherit", shell: true });
execSync("pm2 restart fleetopsx-api", { stdio: "inherit" });
console.log("done");
