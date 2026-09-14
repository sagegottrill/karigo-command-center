/**
 * One-shot server patch for /var/www/fleetopsx-api/index.ts (run via ssh_run.mjs "node /tmp/patch.cjs").
 * Applies: partner-company persistence + self-service password change route.
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const before = src;

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// 1. partnerCompanyFromEmail -> async, prefers stored partnerCompanyName
const fnOld = `function partnerCompanyFromEmail(email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}`;
const fnNew = `async function partnerCompanyForUser(userId: string, email: string, role: string) {
  if (role !== 'Customer Portals (External)') return undefined;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { partnerCompanyName: true, companyLogo: true, email: true } });
  if (dbUser?.partnerCompanyName) return dbUser.partnerCompanyName;
  // Fallback: derive from the email domain (legacy accounts created before persistence).
  const domain = email.split('@')[1] || '';
  if (domain.includes('sabasteel')) return 'Saba Steel';
  const label = domain.split('.')[0] || 'Partner';
  return label.charAt(0).toUpperCase() + label.slice(1);
}`;
must(src.includes(fnOld), "partnerCompanyFromEmail found");
src = src.replace(fnOld, fnNew);

// 2. POST /api/users — accept + persist partnerCompanyName/companyLogo
const postOld = `    const role = b.role || (Array.isArray(b.roles) && b.roles[0]) || 'Transport Manager';
    const password = b.password || 'ChangeMe@2026';
    const tenantId = b.tenantId || b.companyId || null;`;
const postNew = `    const role = b.role || (Array.isArray(b.roles) && b.roles[0]) || 'Transport Manager';
    const password = b.password || 'ChangeMe@2026';
    const tenantId = b.tenantId || b.companyId || null;
    const isPartnerUser = role === 'Customer Portals (External)';
    // Persist the REAL company name/logo for partner accounts — the UI derives the
    // login email from the company name, but the company itself must not be guessed
    // back out of the email domain (that produced wrong customer details on trips).
    const partnerCompanyName = isPartnerUser ? (String(b.partnerCompanyName || b.company || b.companyName || b.name || '').trim() || null) : null;
    const companyLogo = isPartnerUser ? (typeof b.companyLogo === 'string' ? b.companyLogo : null) : null;`;
must(src.includes(postOld), "POST /users anchor");
src = src.replace(postOld, postNew);

const postCreateOld = `      data: {
        email,
        name,
        role,
        password: hashed,
        phone: b.phone,
        tenantId,
        status: b.status || 'Active',
        passwordResetRequired: b.passwordResetRequired !== false,
      },`;
const postCreateNew = `      data: {
        email,
        name,
        role,
        password: hashed,
        phone: b.phone,
        tenantId,
        status: b.status || 'Active',
        passwordResetRequired: b.passwordResetRequired !== false,
        partnerCompanyName,
        companyLogo,
      },`;
must(src.includes(postCreateOld), "POST /users create data");
src = src.replace(postCreateOld, postCreateNew);

// 3. PATCH /api/users/:id — whitelist partnerCompanyName/companyLogo
const patchOld = `    const ALLOWED_USER_FIELDS = ['name', 'role', 'phone', 'tenantId', 'status', 'password', 'passwordResetRequired'];`;
const patchNew = `    const ALLOWED_USER_FIELDS = ['name', 'role', 'phone', 'tenantId', 'status', 'password', 'passwordResetRequired', 'partnerCompanyName', 'companyLogo'];`;
must(src.includes(patchOld), "PATCH /users whitelist");
src = src.replace(patchOld, patchNew);

// 4. userPayload — read DB row for partner name + expose logo
const payloadOld = `function userPayload(user: { id: string; email: string; name: string; phone?: string | null; role: string; status?: string; tenantId?: string | null; passwordResetRequired?: boolean }) {`;
const payloadNew = `function userPayload(user: { id: string; email: string; name: string; phone?: string | null; role: string; status?: string; tenantId?: string | null; passwordResetRequired?: boolean; partnerCompanyName?: string | null; companyLogo?: string | null }) {`;
must(src.includes(payloadOld), "userPayload signature");
src = src.replace(payloadOld, payloadNew);

const payloadOld2 = `    partnerCompanyName: partnerCompanyFromEmail(user.email, user.role),`;
const payloadNew2 = `    partnerCompanyName: user.partnerCompanyName || partnerCompanyFromEmail(user.email, user.role),
    companyLogo: (user as any).companyLogo || null,`;
must(src.includes(payloadOld2), "userPayload partnerCompanyName line");
src = src.replace(payloadOld2, payloadNew2);

// 5. /api/auth/me + login — hydrate full row so partner fields survive normalization
const meOld = `app.get('/api/auth/me', authenticate, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });`;
const meNew = `app.get('/api/auth/me', authenticate, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (user && user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
    const derived = await partnerCompanyForUser(user.id, user.email, user.role);
    if (derived) await prisma.user.update({ where: { id: user.id }, data: { partnerCompanyName: derived } });
  }`;
must(src.includes(meOld), "/auth/me anchor");
src = src.replace(meOld, meNew);

const loginOld = `    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });`;
const loginNew = `    if (user.role === 'Customer Portals (External)' && !user.partnerCompanyName) {
      const derived = await partnerCompanyForUser(user.id, user.email, user.role);
      if (derived) user = { ...user, partnerCompanyName: derived };
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });`;
must(src.includes(loginOld), "login anchor");
src = src.replace(loginOld, loginNew);

// 6. /api/trips GET + POST — use the persisted partner name
const listOld = `app.get('/api/trips', authenticate, async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = partnerCompanyFromEmail(req.user.email, req.user.role);
  const filter = isPartner && partnerName ? { customer: partnerName } : {};`;
const listNew = `app.get('/api/trips', authenticate, async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  const filter = isPartner && partnerName ? { customer: partnerName } : {};`;
must(src.includes(listOld), "GET /trips anchor");
src = src.replace(listOld, listNew);

const postTripOld = `app.post('/api/trips', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Customer Portals (External)'), async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = partnerCompanyFromEmail(req.user.email, req.user.role);`;
const postTripNew = `app.post('/api/trips', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Customer Portals (External)'), async (req: any, res) => {
  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);`;
must(src.includes(postTripOld), "POST /trips anchor");
src = src.replace(postTripOld, postTripNew);

const getTripOld = `  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = partnerCompanyFromEmail(req.user.email, req.user.role);
  if (isPartner && trip.customer !== partnerName) return res.status(403).json({ error: 'Forbidden' });`;
const getTripNew = `  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  if (isPartner && trip.customer !== partnerName) return res.status(403).json({ error: 'Forbidden' });`;
must(src.includes(getTripOld), "GET /trips/:id anchor");
src = src.replace(getTripOld, getTripNew);

// 7. NEW ROUTE — self-service password change (no role restriction, own account only)
const routeAnchor = `// --- TENANTS ---`;
const newRoute = `// Self-service password change — any authenticated user, own account only.
app.patch('/api/users/me/password', authenticate, async (req: any, res) => {
  const { currentPassword, newPassword } = req.body || {};
  try {
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const sameAsCurrent = currentPassword && await bcrypt.compare(String(currentPassword), user.password);
    if (currentPassword && !sameAsCurrent) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (sameAsCurrent && String(newPassword) === String(currentPassword)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, passwordResetRequired: false } });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('PATCH /api/users/me/password failed:', err?.message || err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- TENANTS ---`;
must(src.includes(routeAnchor), "TENANTS anchor");
src = src.replace(routeAnchor, newRoute);

must(src !== before, "changes applied");
fs.writeFileSync(FILE, src);
console.log("PATCH OK — all changes written");
