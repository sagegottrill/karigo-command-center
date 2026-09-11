/**
 * VPS patch: add passwordResetRequired for first-login force change.
 * Run on server: node patch-password-reset-required.js
 */
const fs = require("fs");
const { execSync } = require("child_process");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

let schema = fs.readFileSync(SCHEMA, "utf8");
if (!schema.includes("passwordResetRequired")) {
  schema = schema.replace(
    /status\s+String\s+@default\("Active"\)\r?\n\s*createdAt/,
    'status    String   @default("Active")\n  passwordResetRequired Boolean @default(false)\n  createdAt',
  );
  fs.writeFileSync(SCHEMA, schema);
  console.log("schema: added passwordResetRequired");
} else {
  console.log("schema: passwordResetRequired already present");
}

let index = fs.readFileSync(INDEX, "utf8");

if (!index.includes("passwordResetRequired")) {
  index = index.replace(
    "function userPayload(user: { id: string; email: string; name: string; role: string; status?: string; tenantId?: string | null }) {",
    "function userPayload(user: { id: string; email: string; name: string; role: string; status?: string; tenantId?: string | null; passwordResetRequired?: boolean }) {",
  );
  index = index.replace(
    "    partnerCompanyName: partnerCompanyFromEmail(user.email, user.role),\n  };",
    "    partnerCompanyName: partnerCompanyFromEmail(user.email, user.role),\n    passwordResetRequired: Boolean(user.passwordResetRequired),\n  };",
  );

  index = index.replace(
    `app.post('/api/users', authenticate, async (req, res) => {
  const { email, name, role, password, phone, tenantId, status } = req.body;
  const hashed = await bcrypt.hash(password || 'ChangeMe@2026', 10);
  const user = await prisma.user.create({
    data: { email, name, role: role || 'Transport Manager', password: hashed, phone, tenantId, status: status || 'Active' },
  });
  res.json(userPayload(user));
});`,
    `app.post('/api/users', authenticate, async (req, res) => {
  const { email, name, role, password, phone, tenantId, status, passwordResetRequired } = req.body;
  const hashed = await bcrypt.hash(password || 'ChangeMe@2026', 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: role || 'Transport Manager',
      password: hashed,
      phone,
      tenantId,
      status: status || 'Active',
      passwordResetRequired: passwordResetRequired !== false,
    },
  });
  res.json(userPayload(user));
});`,
  );

  index = index.replace(
    `app.patch('/api/users/:id', authenticate, async (req, res) => {
  const data: any = { ...req.body };
  if (data.password) data.password = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(userPayload(user));
});`,
    `app.patch('/api/users/:id', authenticate, async (req, res) => {
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
});`,
  );

  fs.writeFileSync(INDEX, index);
  console.log("index.ts: passwordResetRequired wired");
} else {
  console.log("index.ts: already patched");
}

execSync("npx prisma db push --skip-generate", { cwd: "/var/www/fleetopsx-api", stdio: "inherit" });
execSync("npx prisma generate", { cwd: "/var/www/fleetopsx-api", stdio: "inherit" });
execSync("pm2 restart fleetopsx-api", { stdio: "inherit" });
console.log("done");
