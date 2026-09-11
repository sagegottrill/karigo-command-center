/**
 * One-shot patch for fleetopsx-api on VPS:
 * - username (local-part) login for partner portal
 * - partnerCompanyName on Customer Portals users
 */
const fs = require("fs");

const file = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(file, "utf8");

if (!src.includes("partnerCompanyFromEmail")) {
  const marker = "function userPayload(";
  const idx = src.indexOf(marker);
  if (idx < 0) {
    console.error("userPayload not found");
    process.exit(1);
  }
  const end = src.indexOf("\nasync function notify", idx);
  if (end < 0) {
    console.error("notify marker not found after userPayload");
    process.exit(1);
  }
  const replacement = `function partnerCompanyFromEmail(email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function userPayload(user: { id: string; email: string; name: string; role: string; status?: string; tenantId?: string | null }) {
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const roles = user.role === 'Platform Admin' ? [user.role, 'Transport Manager'] : [user.role];
  const username = user.email.split('@')[0];
  return {
    id: user.id,
    email: user.email,
    username,
    name: user.name,
    role: user.role,
    roles,
    roleNames: roles,
    department: user.role,
    status: (user.status as any) || 'Active',
    lastActive: 'Just now',
    initials,
    companyId: user.tenantId || 'tnt_001',
    partnerCompanyName: partnerCompanyFromEmail(user.email, user.role),
  };
}
`;
  src = src.slice(0, idx) + replacement + src.slice(end);
  console.log("patched userPayload");
} else {
  console.log("userPayload already patched");
}

if (!src.includes("Partner portal Figma uses Username")) {
  const oldFind =
    "const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });\n    if (!user) return res.status(401).json({ error: 'Invalid credentials' });";
  const newFind =
    "let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });\n" +
    "    // Partner portal Figma uses Username (local-part) — match email prefix when no @ provided\n" +
    "    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {\n" +
    "      user = await prisma.user.findFirst({\n" +
    "        where: { email: { startsWith: `${email}@`, mode: 'insensitive' } },\n" +
    "      });\n" +
    "    }\n" +
    "    if (!user) return res.status(401).json({ error: 'Invalid credentials' });";
  if (!src.includes(oldFind)) {
    console.error("login findFirst block not found");
    process.exit(1);
  }
  src = src.replace(oldFind, newFind);
  console.log("patched login username match");
} else {
  console.log("login already patched");
}

fs.writeFileSync(file, src);
console.log("wrote", file);
