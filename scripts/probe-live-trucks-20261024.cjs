const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const norm = (v) => String(v ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

(async () => {
  try {
    const trucks = await p.truck.findMany({
      select: { id: true, cabId: true, registration: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    console.log('total trucks:', trucks.length);
    const bad = [];
    for (const t of trucks) {
      const cab = norm(t.cabId);
      const reg = norm(t.registration);
      if (!cab || (reg && cab === reg)) bad.push(t);
    }
    console.log('--- trucks whose cap is missing or equals the plate:', bad.length);
    for (const t of bad) console.log(t.cabId, '|', t.registration, '|', t.status, '| created:', t.createdAt);

    // cap-style codes currently in use
    const caps = trucks.map((t) => norm(t.cabId)).filter((c) => /^P\d+$/.test(c));
    console.log('p-codes in use:', caps.length, '| highest:', caps.sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0]);
    const plateLikeCaps = trucks.map((t) => t.cabId).filter((c) => !/^P\d+$/.test(norm(c)));
    console.log('--- cabId values that are NOT P-codes:', plateLikeCaps.length);
    for (const c of plateLikeCaps.slice(0, 20)) console.log(' *', c);
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
