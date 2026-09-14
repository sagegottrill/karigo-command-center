/** Backend patch: one company = one shared partner dashboard (case/space-insensitive). */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const must = (cond, label) => {
  if (!cond) { console.error("PATCH FAILED AT: " + label); process.exit(1); }
  console.log("ok: " + label);
};

// 1. Shared comparator helper
const helperAnchor = `function partnerCompanyFromEmailFallback(email: string, role: string) {`;
must(src.includes(helperAnchor), "helper anchor");
src = src.replace(
  helperAnchor,
  `function samePartnerCompany(a?: string | null, b?: string | null) {
  const x = (a || '').trim().toLowerCase();
  const y = (b || '').trim().toLowerCase();
  return !!x && !!y && x === y;
}

${helperAnchor}`,
);

// 2. GET /trips — case-insensitive company scope
const listOld = `  const filter = isPartner && partnerName ? { customer: partnerName } : {};`;
const listNew = `  const filter = isPartner && partnerName ? { customer: { equals: partnerName, mode: 'insensitive' } } : {};`;
must(src.includes(listOld), "GET /trips filter");
src = src.replace(listOld, listNew);

// 3. POST /trips — stamp trips with the company's canonical spelling
const postOld = `  const isPartner = req.user.role === 'Customer Portals (External)';
  const partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);`;
const postNew = `  const isPartner = req.user.role === 'Customer Portals (External)';
  let partnerName = await partnerCompanyForUser(req.user.id, req.user.email, req.user.role);
  if (isPartner && partnerName) {
    // One company = one dashboard: adopt the oldest account's exact spelling so
    // "Saba Steel" and "saba steel" accounts share one trip list.
    const canonical = await prisma.user.findFirst({
      where: { role: 'Customer Portals (External)', partnerCompanyName: { equals: partnerName, mode: 'insensitive' }, id: { not: req.user.id } },
      orderBy: { createdAt: 'asc' },
      select: { partnerCompanyName: true },
    });
    if (canonical?.partnerCompanyName) partnerName = canonical.partnerCompanyName;
  }`;
must(src.includes(postOld), "POST /trips canonical");
src = src.replace(postOld, postNew);

// 4. GET /trips/:id — insensitive ownership check
const getIdOld = `  if (isPartner && trip.customer !== partnerName) return res.status(403).json({ error: 'Forbidden' });`;
const getIdNew = `  if (isPartner && !samePartnerCompany(trip.customer, partnerName)) return res.status(403).json({ error: 'Forbidden' });`;
must(src.includes(getIdOld), "GET /trips/:id check");
src = src.replace(getIdOld, getIdNew);

// 5. DELETE own-request — insensitive ownership check
const delOld = `    if (trip.customer !== partnerName || !['Requested'].includes(trip.status)) {`;
const delNew = `    if (!samePartnerCompany(trip.customer, partnerName) || !['Requested'].includes(trip.status)) {`;
must(src.includes(delOld), "DELETE check");
src = src.replace(delOld, delNew);

// 6. POST /users — normalize + canonicalize new partner company spelling
const userOld = `    const partnerCompanyName = isPartnerUser ? (String(b.partnerCompanyName || b.company || b.companyName || b.name || '').trim() || null) : null;`;
const userNew = `    let partnerCompanyName = isPartnerUser ? (String(b.partnerCompanyName || b.company || b.companyName || b.name || '').trim().replace(/\\s+/g, ' ') || null) : null;
    if (partnerCompanyName) {
      // Adopt the oldest account's exact company spelling (one company, one dashboard).
      const canonicalCompany = await prisma.user.findFirst({
        where: { role: 'Customer Portals (External)', partnerCompanyName: { equals: partnerCompanyName, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { partnerCompanyName: true },
      });
      if (canonicalCompany?.partnerCompanyName) partnerCompanyName = canonicalCompany.partnerCompanyName;
    }`;
must(src.includes(userOld), "POST /users normalize");
src = src.replace(userOld, userNew);

fs.writeFileSync(FILE, src);
console.log("PATCH OK — shared company dashboard");
