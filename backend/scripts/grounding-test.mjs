/**
 * Expected-resolution check: the Head of Engineering commits a reason and a
 * date on a grounded truck, the workshop seat may not, and the Transport
 * Manager's board reads both back.
 *
 * Runs on a throwaway truck it creates and deletes. Run on the API host:
 *   node scripts/grounding-test.mjs
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const API = 'http://127.0.0.1:3001/api';
const prisma = new PrismaClient();
const PLATE = `TESTETA${Date.now().toString().slice(-4)}`;

const mint = (id, role, name) =>
  jwt.sign({ id, email: `${name.replace(/\s+/g, '.')}@test.local`, role, roles: [role], name },
    process.env.JWT_SECRET, { expiresIn: '1h' });

const HOE = mint('2fa1a1f2-d655-47ed-a946-367ef80333fd', 'Head of Engineering', 'Test Head engineer');
const ENG = mint('2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f', 'Engineering', 'Test Engineer');
const TM = mint('639c59b8-1418-4d6a-b9f6-5148895b41f1', 'Transport Manager', 'Transport Manager');

const call = async (path, token, method = 'GET', body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

let id = null;
try {
  // Fleet Operations' seat adds the asset; Engineering never creates trucks.
  const made = await call('/trucks', TM, 'POST', {
    registration: PLATE, cabId: '', category: 'LOCAL', status: 'Check Up',
  });
  id = made.data?.id;
  console.log('create truck          ->', made.status, id ? 'ok' : JSON.stringify(made.data));
  if (!id) throw new Error('no truck');

  const workshop = await call('/engineering/grounding', ENG, 'PATCH', {
    kind: 'head', id, reason: 'workshop try', expectedReadyAt: '2026-11-20',
  });
  console.log('workshop tries        ->', workshop.status, JSON.stringify(workshop.data).slice(0, 90));

  const hoe = await call('/engineering/grounding', HOE, 'PATCH', {
    kind: 'head', id, reason: 'Brake chamber leaking; part in store, fitment Friday.',
    expectedReadyAt: '2026-11-20',
  });
  console.log('hoe sets it           ->', hoe.status, hoe.data?.holdReason, '|', hoe.data?.expectedReadyAt);

  const bad = await call('/engineering/grounding', HOE, 'PATCH', {
    kind: 'head', id, reason: 'x', expectedReadyAt: 'not-a-date',
  });
  console.log('hoe sends junk date   ->', bad.status, JSON.stringify(bad.data).slice(0, 90));

  const read = await call('/trucks', TM);
  const row = (read.data || []).find((t) => t.id === id);
  console.log('tm reads it back      ->', read.status, row?.status, '|', row?.holdReason, '|', row?.expectedReadyAt);
} finally {
  if (id) await prisma.truck.delete({ where: { id } }).catch(() => {});
  console.log('cleaned up', PLATE);
  await prisma.$disconnect();
}
