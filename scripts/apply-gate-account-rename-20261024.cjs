const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const FROM = 'Petroline Security';
const TO = 'Petroline Gate (legacy)';

(async () => {
  try {
    const u = await p.user.findUnique({ where: { email: 'gate@petroline.ng' } });
    if (!u) { console.log('account not found — nothing done'); process.exit(0); }
    if (u.name !== FROM) { console.log('account display name is already "' + String(u.name) + '" — nothing done'); process.exit(0); }
    await p.user.update({ where: { email: 'gate@petroline.ng' }, data: { name: TO } });
    console.log('renamed: ' + FROM + ' -> ' + TO + ' (email gate@petroline.ng unchanged)');
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
