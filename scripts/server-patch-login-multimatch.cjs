/** Backend patch: username-prefix login must try ALL matching accounts (duplicates exist). */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

const oldLogin = `    let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    // Partner portal Figma uses Username (local-part) — match email prefix when no @ provided
    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {
      user = await prisma.user.findFirst({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' } },
      });
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });`;
const newLogin = `    let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    // Partner portal Figma uses Username (local-part) — match email prefix when no @ provided.
    // Multiple accounts can share a local-part (e.g. s.ughojo@accessbank.com and
    // s.ughojo@sabasteel.com) — try the password against EVERY candidate.
    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {
      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      });
      for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }
      if (!user && candidates.length > 0) user = candidates[0];
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });`;
must(src.includes(oldLogin), "login candidate block");
src = src.replace(oldLogin, newLogin);

fs.writeFileSync(FILE, src);
console.log("PATCH OK — multi-match login");
