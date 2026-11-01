const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const entries = await p.gateEntry.findMany({ where: { OR: [{ truck: { contains: 'JHN506XA' } }, { truck: { contains: 'P021' } }, { trailer: { contains: 'B1002' } }] }, orderBy: { id: 'asc' }, take: 40 }).catch((e) => { console.error('gate err', e.message); return []; });
  // try other column guesses if empty
  if (!entries.length) {
    const any = await p.gateEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 1 }).catch(() => []);
    if (any.length) console.log('gateEntry cols:', Object.keys(any[0]).join(', '));
  }
  for (const e of entries) {
    const slim = {};
    for (const k of Object.keys(e)) slim[k] = e[k] && typeof e[k] === 'object' ? (e[k].toISOString ? e[k].toISOString() : '[obj]') : e[k];
    console.log('GATE =', JSON.stringify(slim));
  }
  const dc = await p.expense.findMany({ where: { tripId: '9f7023c1-22ef-4b6c-8e8e-d63c02ed91df' } }).catch((e) => { console.error('expense err', e.message); return []; });
  console.log('direct costs on trip:', dc.length);
  for (const d0 of dc) console.log(' -', d0.id, d0.description || d0.category, d0.amount, d0.createdAt && d0.createdAt.toISOString());
  const cp = await p.trackingCheckpoint.findMany({ where: { tripId: '9f7023c1-22ef-4b6c-8e8e-d63c02ed91df' }, orderBy: { createdAt: 'desc' }, take: 8 }).catch((e) => { return []; });
  console.log('checkpoints:', cp.length);
  for (const c0 of cp) console.log(' -', c0.createdAt && c0.createdAt.toISOString(), c0.note || c0.location || '');
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
