/**
 * One-shot server patch (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * CHAT, end to end. The `Conversation` table existed but was never used: no
 * thread was ever created, the list endpoint returned every row to every user
 * unscoped, `self: true` was written onto every message (so everyone's bubbles
 * claimed to be your own), and reading was a shared counter.
 *
 * This makes it a working trip-context chat:
 *   1) ONE THREAD PER DISPATCH, created lazily and idempotently — every trip
 *      that has been dispatched (Scheduled → Completed) gets a thread keyed to
 *      its tripId, so the conversation lives as long as the dispatch does.
 *   2) PARTNERS SEE ONLY THEIR OWN COMPANY'S THREADS. A partner user's
 *      partnerCompanyName is matched against the trip's customer, so Saba
 *      Steel can never read Metalberg's thread.
 *   3) MESSAGES CARRY THEIR AUTHOR (`authorId` + ISO `at`). `self` is computed
 *      PER VIEWER at read time, never stored.
 *   4) UNREAD IS PER USER: a `ConversationRead` row records how far that user
 *      has read, so opening a thread on one desk does not clear it on another.
 *
 * Additive and idempotent: safe to re-run.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const READ_MODEL = `model ConversationRead {
  id             String   @id @default(uuid())
  userId         String
  conversationId String
  lastReadAt     DateTime @default(now())

  @@unique([userId, conversationId])
}`;

const ENDPOINTS = `// --- MESSAGES / CONVERSATIONS ---
// One thread per dispatch (see ensureDispatchThreads): the contextual
// communication the spec calls for, not a generic inbox.
const CHAT_THREAD_STATUSES = [
  'Scheduled',
  'Loaded',
  'En Route',
  'Offloading',
  'Returning',
  'Delayed',
  'Completed',
];

/** The company a partner user belongs to — the key that scopes what they may read. */
async function partnerCompanyOf(req: any): Promise<string> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { partnerCompanyName: true, email: true, role: true },
    });
    return (
      u?.partnerCompanyName?.trim() ||
      partnerCompanyFromEmailFallback(u?.email || '', u?.role || '') ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

function isPartnerRequest(req: any): boolean {
  return req.user?.role === 'Customer Portals (External)';
}

/**
 * Every dispatched trip gets exactly one thread, created the first time anyone
 * opens Messages. Idempotent: a trip already carrying a conversation is skipped,
 * so history and existing messages are never touched.
 */
async function ensureDispatchThreads() {
  const trips = await prisma.trip.findMany({
    where: { status: { in: CHAT_THREAD_STATUSES } },
    select: {
      id: true,
      customer: true,
      truckReg: true,
      driverName: true,
      dropoff: true,
    },
  });
  if (!trips.length) return;
  const existing = await prisma.conversation.findMany({
    where: { tripId: { in: trips.map((t: any) => t.id) } },
    select: { tripId: true },
  });
  const have = new Set(existing.map((e: any) => e.tripId));
  for (const t of trips) {
    if (have.has(t.id)) continue;
    await prisma.conversation.create({
      data: {
        kind: 'trip',
        name: (t.customer || 'Petroline') + ' · ' + t.dropoff,
        subtitle: [t.truckReg, t.driverName]
          .filter((v: any) => v && String(v).trim() && v !== 'Unassigned')
          .join(' · '),
        tripId: t.id,
        participants: ['Transport Manager', 'Fleet Operations', 'Tracking', 'Security', 'Partner'],
        messages: [],
        unread: 0,
        lastAt: '',
      },
    });
  }
}

/** How far THIS user has read in each conversation (0 = never opened). */
async function readMapFor(userId: string, conversationIds: string[]) {
  const map = new Map<string, number>();
  if (!conversationIds.length) return map;
  const rows = await prisma.conversationRead.findMany({
    where: { userId, conversationId: { in: conversationIds } },
  });
  for (const r of rows) map.set(r.conversationId, new Date(r.lastReadAt as any).getTime());
  return map;
}

function messageTime(m: any): number {
  const raw = m?.at || m?.time;
  const t = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * One conversation, as THIS reader should see it: self-flagged bubbles and an
 * unread count derived from their own read position.
 */
function serializeConversation(c: any, viewerId: string, readAt: number) {
  const raw = Array.isArray(c.messages) ? c.messages : [];
  let unread = 0;
  const messages = raw.map((m: any) => {
    const at = m.at || m.time || '';
    const mine = Boolean(m.authorId) && m.authorId === viewerId;
    if (!mine && messageTime(m) > readAt) unread += 1;
    return {
      id: m.id,
      author: m.author || 'Unknown',
      authorId: m.authorId || null,
      role: m.role || 'Ops',
      body: m.body || '',
      at,
      time: at,
      self: mine,
    };
  });
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    subtitle: c.subtitle,
    tripId: c.tripId || null,
    participants: Array.isArray(c.participants) ? c.participants : [],
    lastAt: c.lastAt || (messages.length ? messages[messages.length - 1].at : ''),
    unread,
    messages,
  };
}

/** May this viewer read/write this conversation? Staff: yes. Partner: own company only. */
async function canAccessConversation(req: any, convo: any): Promise<boolean> {
  if (!isPartnerRequest(req)) return true;
  if (!convo?.tripId) return false;
  const trip = await prisma.trip.findUnique({
    where: { id: convo.tripId },
    select: { customer: true },
  });
  if (!trip) return false;
  return samePartnerCompany(trip.customer, await partnerCompanyOf(req));
}

app.get('/api/conversations', authenticate, async (req: any, res) => {
  try {
    await ensureDispatchThreads();
    const all = await prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
    let visible = all;
    if (isPartnerRequest(req)) {
      const company = await partnerCompanyOf(req);
      const tripIds = all.map((c: any) => c.tripId).filter(Boolean);
      const trips = tripIds.length
        ? await prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, customer: true },
          })
        : [];
      const mine = new Set(
        trips.filter((t: any) => samePartnerCompany(t.customer, company)).map((t: any) => t.id),
      );
      visible = all.filter((c: any) => c.tripId && mine.has(c.tripId));
    }
    const read = await readMapFor(req.user.id, visible.map((c: any) => c.id));
    res.json(visible.map((c: any) => serializeConversation(c, req.user.id, read.get(c.id) || 0)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Sidebar badge: how many messages are waiting for THIS user. */
app.get('/api/conversations/unread', authenticate, async (req: any, res) => {
  try {
    const all = await prisma.conversation.findMany();
    let visible = all;
    if (isPartnerRequest(req)) {
      const company = await partnerCompanyOf(req);
      const tripIds = all.map((c: any) => c.tripId).filter(Boolean);
      const trips = tripIds.length
        ? await prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, customer: true },
          })
        : [];
      const mine = new Set(
        trips.filter((t: any) => samePartnerCompany(t.customer, company)).map((t: any) => t.id),
      );
      visible = all.filter((c: any) => c.tripId && mine.has(c.tripId));
    }
    const read = await readMapFor(req.user.id, visible.map((c: any) => c.id));
    let count = 0;
    for (const c of visible) {
      const raw = Array.isArray(c.messages) ? c.messages : [];
      const readAt = read.get(c.id) || 0;
      for (const m of raw) {
        if (m.authorId === req.user.id) continue;
        if (messageTime(m) > readAt) count += 1;
      }
    }
    res.json({ count });
  } catch {
    res.json({ count: 0 });
  }
});

app.post('/api/conversations', authenticate, async (req: any, res) => {
  try {
    const created = await prisma.conversation.create({
      data: {
        kind: req.body.kind || 'direct',
        name: req.body.name,
        subtitle: req.body.subtitle || '',
        tripId: req.body.tripId || null,
        participants: req.body.participants || [],
        messages: req.body.messages || [],
        unread: 0,
        lastAt: '',
      },
    });
    res.json(serializeConversation(created, req.user.id, 0));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/conversations/:id/messages', authenticate, async (req: any, res) => {
  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (!(await canAccessConversation(req, convo))) {
    return res.status(403).json({ error: 'This conversation belongs to another company' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message body is required' });
  const messages = Array.isArray(convo.messages) ? [...(convo.messages as any[])] : [];
  const at = new Date().toISOString();
  messages.push({
    id: 'm' + (messages.length + 1) + '-' + Date.now().toString(36),
    author: req.user?.name || req.user?.email || 'Unknown',
    authorId: req.user?.id || null,
    role: isPartnerRequest(req) ? 'Partner' : req.user?.role || 'Ops',
    body,
    at,
  });
  const updated = await prisma.conversation.update({
    where: { id: convo.id },
    data: { messages, lastAt: at },
  });
  // The sender has by definition read their own thread up to this message.
  await prisma.conversationRead.upsert({
    where: { userId_conversationId: { userId: req.user.id, conversationId: convo.id } },
    update: { lastReadAt: new Date(at) },
    create: { userId: req.user.id, conversationId: convo.id, lastReadAt: new Date(at) },
  });
  res.json(serializeConversation(updated, req.user.id, new Date(at).getTime()));
});

app.patch('/api/conversations/:id', authenticate, async (req: any, res) => {
  const convo = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!convo) return res.status(404).json({ error: 'Not found' });
  if (!(await canAccessConversation(req, convo))) {
    return res.status(403).json({ error: 'This conversation belongs to another company' });
  }
  const raw = Array.isArray(convo.messages) ? (convo.messages as any[]) : [];
  const latest = raw.reduce((max: number, m: any) => Math.max(max, messageTime(m)), 0);
  const readAt = latest ? new Date(latest) : new Date();
  await prisma.conversationRead.upsert({
    where: { userId_conversationId: { userId: req.user.id, conversationId: convo.id } },
    update: { lastReadAt: readAt },
    create: { userId: req.user.id, conversationId: convo.id, lastReadAt: readAt },
  });
  res.json({ ok: true });
});

`;

(async () => {
  // --- 1) the per-user read table ---------------------------------------
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "ConversationRead" (' +
      '"id" TEXT NOT NULL, "userId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, ' +
      '"lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("id"))',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "ConversationRead_userId_conversationId_key" ON "ConversationRead"("userId", "conversationId")',
  );
  console.log("ok: ConversationRead table present");
  await prisma.$disconnect();

  // --- 2) prisma schema --------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/model ConversationRead/.test(schema)) {
    console.log("ok: schema.prisma already carries ConversationRead");
  } else {
    const anchor = /(model Conversation \{[\s\S]*?\n\})\r?\n/;
    must(anchor.test(schema), "schema.prisma model Conversation anchor");
    fs.writeFileSync(SCHEMA + ".bak-chat", schema);
    schema = schema.replace(anchor, (_m, block) => `${block}\n\n${READ_MODEL}\n`);
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma gained model ConversationRead (backup: schema.prisma.bak-chat)");
  }

  // --- 3) index.ts endpoints --------------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  const START = "// --- MESSAGES / CONVERSATIONS ---";
  const END = "// --- AUDIT / LOGIN REPORTS ---";
  const from = src.indexOf(START);
  const to = src.indexOf(END);
  must(from !== -1 && to !== -1 && to > from, "index.ts conversation block boundaries");
  if (src.slice(from, to).includes("ensureDispatchThreads")) {
    console.log("ok: index.ts already carries the scoped chat endpoints");
  } else {
    fs.writeFileSync(INDEX + ".bak-chat", src);
    src = src.slice(0, from) + ENDPOINTS + src.slice(to);
    fs.writeFileSync(INDEX, src);
    console.log("ok: index.ts conversation endpoints replaced (backup: index.ts.bak-chat)");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
