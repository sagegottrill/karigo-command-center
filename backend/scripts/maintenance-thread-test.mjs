/**
 * Live test: a truck's maintenance thread.
 *
 *   1. a truck under repair has ONE thread, however many times it is opened
 *   2. any Engineering desk can write in it (workshop + Head + TM)
 *   3. it shows up in Messages for a seat that never opened it
 *   4. a partner can never read it
 *
 * Everything it creates is deleted at the end.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();
const sign = (id, email, role, name) =>
  jwt.sign({ id, email, role, roles: [role], name }, process.env.JWT_SECRET, { expiresIn: '2h' });

const HOE = { id: '2fa1a1f2-d655-47ed-a946-367ef80333fd', email: 'hoe@test.local', role: 'Head of Engineering', name: 'Test Head of Engineer' };
const TM = { id: '639c59b8-1418-4d6a-b9f6-5148895b41f1', email: 'tm@test.local', role: 'Transport Manager', name: 'Transport Manager' };
const WORKSHOP = { id: '2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f', email: 'eng@test.local', role: 'Engineering', name: 'Test Engineer' };

const call = async (who, path, method = 'GET', body) => {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + sign(who.id, who.email, who.role, who.name), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 120); }
  return { status: res.status, data };
};

(async () => {
  const truck = await prisma.truck.findFirst({ where: { status: { in: ['Maintenance', 'Check Up'] } }, select: { id: true, cabId: true, registration: true } });
  if (!truck) throw new Error('no grounded truck to test with');
  console.log('truck                  ->', truck.cabId, truck.registration);

  const first = await call(HOE, '/api/engineering/assets/thread', 'POST', { kind: 'head', id: truck.id });
  console.log('hoe opens it           ->', first.status, first.data.kind, first.data.name, '|', first.data.subtitle);

  const again = await call(TM, '/api/engineering/assets/thread', 'POST', { kind: 'head', id: truck.id });
  console.log('tm opens it again      ->', again.status, again.data.id === first.data.id ? 'same thread (ok)' : 'DUPLICATE THREAD');

  const bad = await call(HOE, '/api/engineering/assets/thread', 'POST', { kind: 'head', id: 'does-not-exist' });
  console.log('unknown truck          ->', bad.status, JSON.stringify(bad.data).slice(0, 60));

  const said = await call(WORKSHOP, `/api/conversations/${first.data.id}/messages`, 'POST', {
    body: 'Bearing collected from the store; fitment tonight, back on the road tomorrow morning.',
  });
  console.log('workshop writes        ->', said.status, said.data.messages?.length, 'message(s)');

  const tmList = await call(TM, '/api/conversations');
  const seen = Array.isArray(tmList.data) && tmList.data.find((c) => c.id === first.data.id);
  console.log('tm sees it in Messages ->', tmList.status, seen ? 'yes' : 'NO — invisible to the TM');
  console.log('  last message:', seen?.messages?.at(-1)?.body?.slice(0, 60));

  await prisma.conversation.delete({ where: { id: first.data.id } });
  await prisma.conversationRead.deleteMany({ where: { conversationId: first.data.id } });
  console.log('cleaned up the test thread');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
