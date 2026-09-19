/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Notification had no way to be dismissed, so the center could only grow.
 *
 * Dismissal is PER USER (`dismissedBy`), not a row delete: a notification with
 * `audience: null` is visible to everyone, and even role-scoped ones are shared
 * by every holder of that role — one TM tidying his own list must never remove
 * somebody else's alert. Deleting marks it dismissed for the caller only, and
 * every read route filters the caller's own dismissals out.
 *
 * Idempotent.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

(async () => {
  // --- 1) column ---------------------------------------------------------
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dismissedBy" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
  );
  console.log("ok: Notification.dismissedBy column present");
  await prisma.$disconnect();

  // --- 2) prisma schema --------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/dismissedBy/.test(schema)) {
    console.log("ok: schema.prisma already has dismissedBy");
  } else {
    const before = schema;
    schema = schema.replace(
      /(model Notification \{[\s\S]*?\n\s*severity\s+String[^\n]*\n)/,
      "$1  /// User ids who removed this from THEIR notification center.\n  dismissedBy        String[] @default([])\n",
    );
    if (schema === before) {
      console.error("FAIL: could not patch model Notification in schema.prisma");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Notification gained dismissedBy");
  }

  // --- 3) index.ts ------------------------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  if (src.includes("notifications/clear")) {
    console.log("ok: index.ts already serves notification dismissal");
    process.exit(0);
  }

  const UNREAD_ANCHOR = "  const count = await prisma.notification.count({ where: { read: false, ...(await notificationScope(req)) } });";
  const LIST_ANCHOR =
    "app.get('/api/notifications', authenticate, async (req: any, res) => {\n  res.json(await prisma.notification.findMany({ where: await notificationScope(req), orderBy: { createdAt: 'desc' } }));\n});";
  const MARK_ANCHOR = "app.post('/api/notifications/mark-all-read', authenticate, async (req: any, res) => {";
  for (const anchor of [UNREAD_ANCHOR, LIST_ANCHOR, MARK_ANCHOR]) {
    if (!src.includes(anchor)) {
      console.error(`FAIL: anchor not found -> ${JSON.stringify(anchor.slice(0, 60))}`);
      process.exit(1);
    }
  }
  fs.writeFileSync(INDEX + ".bak-notifdismiss", src);

  src = src.replace(
    UNREAD_ANCHOR,
    "  const count = await prisma.notification.count({\n    where: { read: false, AND: [await notificationScope(req), notDismissed(req)], },\n  });",
  );
  src = src.replace(
    LIST_ANCHOR,
    "app.get('/api/notifications', authenticate, async (req: any, res) => {\n  res.json(\n    await prisma.notification.findMany({\n      where: { AND: [await notificationScope(req), notDismissed(req)] },\n      orderBy: { createdAt: 'desc' },\n    }),\n  );\n});",
  );
  src = src.replace(
    MARK_ANCHOR,
    `// A notification is dismissed FOR ONE USER: shared rows (audience null, or a
// whole role) must never vanish from somebody else's center.
function notDismissed(req: any) {
  return { NOT: { dismissedBy: { has: String(req.user?.id || "") } } };
}

async function dismissForUser(req: any, where: any) {
  const rows = await prisma.notification.findMany({
    where: { AND: [where, await notificationScope(req), notDismissed(req)] },
    select: { id: true, dismissedBy: true },
  });
  const me = String(req.user?.id || "");
  for (const row of rows) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { dismissedBy: [...(row.dismissedBy || []), me] },
    });
  }
  return rows.length;
}

app.delete('/api/notifications/:id', authenticate, async (req: any, res) => {
  const removed = await dismissForUser(req, { id: req.params.id });
  if (removed === 0) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true, removed });
});

/** Body: { ids?: string[], read?: boolean } — ids removes those, read clears the read ones. */
app.post('/api/notifications/clear', authenticate, async (req: any, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : null;
  const where = ids ? { id: { in: ids } } : req.body?.read === true ? { read: true } : {};
  const removed = await dismissForUser(req, where);
  res.json({ ok: true, removed });
});

${MARK_ANCHOR}`,
  );
  fs.writeFileSync(INDEX, src);
  console.log("ok: notification dismissal routes installed (backup: index.ts.bak-notifdismiss)");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
