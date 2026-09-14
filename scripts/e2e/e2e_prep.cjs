/**
 * Create dedicated E2E role accounts (e2e.*@livecheck.io). All share password
 * FleetOpsx2026! and are deleted by cleanup after the run. Real accounts untouched.
 * Run from the API directory on the VPS (needs @prisma/client + bcryptjs).
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

const ACCOUNTS = [
  { email: 'e2e.admin@livecheck.io', role: 'Platform Admin', name: 'E2E Admin' },
  { email: 'e2e.tm@livecheck.io', role: 'Transport Manager', name: 'E2E TM' },
  { email: 'e2e.fo@livecheck.io', role: 'Fleet Operations', name: 'E2E FO' },
  { email: 'e2e.gate@livecheck.io', role: 'Security', name: 'E2E Gate' },
  { email: 'e2e.tracking@livecheck.io', role: 'Tracking', name: 'E2E Tracking' },
  { email: 'e2e.hr@livecheck.io', role: 'HR', name: 'E2E HR' },
  { email: 'e2e.accounts@livecheck.io', role: 'Accounts', name: 'E2E Accounts' },
  { email: 'e2e.partner@livecheck.io', role: 'Customer Portals (External)', name: 'E2E Partner', tenantId: 'tnt_001' },
];

async function main() {
  const hash = await bcrypt.hash('FleetOpsx2026!', 10);
  for (const a of ACCOUNTS) {
    await p.user.upsert({
      where: { email: a.email },
      update: { password: hash, status: 'Active', role: a.role },
      create: { email: a.email, password: hash, name: a.name, role: a.role, tenantId: a.tenantId || null, status: 'Active' },
    });
  }
  console.log('E2E role accounts ready: ' + ACCOUNTS.length);
  await p.$disconnect();
}

main().catch(e => { console.error('E2E PREP FAILED:', e.message); process.exit(1); });
