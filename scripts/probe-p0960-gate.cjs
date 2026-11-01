const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  console.log('--- prisma models mentioning gate/log ---');
  const models = p._dmmf ? p._dmmf.datamodel.models.map((m) => m.name) : Object.keys(p).filter((k) => typeof p[k] === 'object' && p[k] && p[k].findMany);
  console.log(Object.keys(p).filter((k) => !k.startsWith('_') && !k.startsWith('$')).join(', '));
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
