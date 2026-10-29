/** READ-ONLY probe: Check Up heads vs driver pairings (salary numbers), 29 Oct. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const heads = await p.truck.findMany({ where: { status: 'Check Up' }, orderBy: { cabId: 'asc' } });
  console.log('CHECK UP HEADS:', heads.length);
  for (const h of heads) console.log(h.cabId + ' | ' + h.registration);

  const drivers = await p.driver.findMany({
    orderBy: { staffId: 'asc' },
    select: { staffId: true, name: true, truckReg: true, truckReg2: true, status: true },
  });
  console.log('\nPAIRINGS (driver rows that name a truck):');
  for (const d of drivers) {
    if (d.truckReg || d.truckReg2)
      console.log((d.staffId || '') + ' | ' + d.name + ' | ' + d.truckReg + ' | ' + d.truckReg2 + ' | ' + d.status);
  }
  const blank = drivers.filter((d) => !d.truckReg && !d.truckReg2);
  console.log('\nDRIVERS WITH NO PAIRING:', blank.length, 'of', drivers.length);

  // Which Check Up heads have NO driver row pointing at them?
  const capTok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const pairedCaps = new Set();
  for (const d of drivers) {
    for (const v of [d.truckReg, d.truckReg2]) {
      for (const piece of String(v || '').split(/[^0-9a-zA-Z]+/)) {
        if (piece) pairedCaps.add(capTok(piece));
      }
    }
  }
  console.log('\nCHECK UP HEADS WITH NO DRIVER POINTING AT THEM:');
  for (const h of heads) {
    const cap = capTok(h.cabId);
    const plate = capTok(h.registration);
    if (!pairedCaps.has(cap) && !pairedCaps.has(plate)) console.log(h.cabId + ' | ' + h.registration + '  <-- unpaired');
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
