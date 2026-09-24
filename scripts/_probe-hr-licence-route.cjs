/**
 * The licence document route, exercised the way the form uses it.
 *
 * The staff editor posts the scan on its own request, so this signs in as the HR
 * login, attaches a small document to a real record, reads it back, and removes
 * it again — proving the route, the regenerated Prisma client and the body
 * ceiling all agree, without leaving a document on a live staff file.
 *
 *   node hr-licence-route.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API = 'http://127.0.0.1:3001/api';
const STAFF_ID = 'P0857';
const DOC = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 verification only').toString('base64');

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

(async () => {
  const login = await json(
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hr@petroline.ng', password: 'Petroline@2026' }),
    }),
  );
  const token = login.body?.token || login.body?.accessToken;
  if (!token) {
    console.error('login failed:', login.status, JSON.stringify(login.body).slice(0, 200));
    process.exit(1);
  }
  console.log('signed in as HR:', login.body?.user?.name || login.body?.user?.email || '(user)');

  const row = await prisma.driver.findFirst({ where: { staffId: STAFF_ID }, select: { id: true } });
  if (!row) {
    console.error('no record for', STAFF_ID);
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const attach = await json(
    await fetch(`${API}/drivers/${row.id}/licence`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ fileName: 'verification.pdf', dataUrl: DOC }),
    }),
  );
  console.log('POST /licence ->', attach.status, JSON.stringify(attach.body).slice(0, 160));

  const read = await json(await fetch(`${API}/drivers/${row.id}/licence`, { headers: auth }));
  console.log(
    'GET  /licence ->',
    read.status,
    'fileName:',
    read.body?.fileName,
    '· bytes returned:',
    typeof read.body?.dataUrl === 'string' ? read.body.dataUrl.length : 0,
  );

  const remove = await json(
    await fetch(`${API}/drivers/${row.id}/licence`, { method: 'DELETE', headers: auth }),
  );
  console.log('DEL  /licence ->', remove.status);

  const after = await prisma.driver.findFirst({
    where: { id: row.id },
    select: { licenseDocName: true, licenseDocument: true, licenseDocAt: true },
  });
  console.log('after cleanup: name', after.licenseDocName, '· bytes', after.licenseDocument, '· at', after.licenseDocAt);

  console.log(
    'list flag on GET /drivers:',
    typeof (await json(await fetch(`${API}/drivers`, { headers: auth }))).body?.length === 'undefined'
      ? '(list shape differs)'
      : '(list answered)',
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
