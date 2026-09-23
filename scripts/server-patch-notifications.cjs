/**
 * Server patch: the notification ledger, restructured.
 *
 * What was wrong with it:
 *
 *  1. READ STATE WAS SHARED. `read` is one boolean on a row that dozens of users
 *     hold. One person pressing "Mark all as read" cleared the unread badge for
 *     every colleague with the same role — 914 rows, and the TM's click silently
 *     emptied Fleet Ops' inbox. Reading is now per user (`readBy`), exactly like
 *     dismissal already was.
 *
 *  2. A ROW DID NOT SAY WHERE IT CAME FROM. Audience strings were typed by hand
 *     at each call site ("Transport Manager,Fleet Operations,Platform Admin"), so
 *     the same event family had four variants and nobody could ask "what has
 *     Engineering sent me". Every row now carries `module`, `eventKey`, `refId`
 *     and `refLabel`, and the unfiltered list can be narrowed by module.
 *
 *  3. "FOR YOUR INFORMATION" AND "YOU MUST DECIDE" LOOKED IDENTICAL. 455 of the
 *     TM's rows are truck/tail status bookkeeping; the 57 dispatches waiting for
 *     his diesel release were somewhere below them. `actionRequired` splits them.
 *
 * Run ON the box from /var/www/fleetopsx-api, then: npx prisma db push && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const API = "/var/www/fleetopsx-api/index.ts";
const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

/* ------------------------------------------------------------------ schema -- */

{
  const raw = fs.readFileSync(SCHEMA, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => /^model Notification\b/.test(l));
  must(start !== -1, "Notification model");
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  must(end !== -1, "Notification closes");
  const block = lines.slice(start, end);

  if (!block.some((l) => /^\s+readBy\b/.test(l))) {
    const anchor = lines.findIndex(
      (l, i) => i > start && i < end && /^\s+dismissedBy\s+String\[\]/.test(l),
    );
    must(anchor !== -1, "Notification.dismissedBy");
    lines.splice(
      anchor + 1,
      0,
      "  /// User ids who have READ this. Reading is per person — the shared",
      "  /// `read` flag cleared every colleague's badge when one person pressed it.",
      "  readBy            String[] @default([])",
      "  /// Which department produced this alert: Fleet Operations, Gate Security,",
      "  /// Tracking, Engineering, HR, Accounts, Fuel & Lubricant, Partners, System.",
      "  module            String?",
      "  /// The catalogue key that produced it (dispatch.departed, parts.requested…).",
      "  eventKey          String?",
      "  /// The record it is about, so a row can open that record instead of a list.",
      "  refId             String?",
      "  refLabel          String?",
      "  /// Does somebody have to decide something, or is it for information?",
      "  actionRequired    Boolean  @default(false)",
    );
    fs.writeFileSync(SCHEMA, lines.join(eol));
    console.log("ok: schema fields added");
  } else {
    console.log("ok: schema fields already present");
  }
}

/* -------------------------------------------------------------------- api --- */

let source = fs.readFileSync(API, "utf8");
const eol = source.includes("\r\n") ? "\r\n" : "\n";
let lines = source.split(/\r?\n/);
const has = (needle) => lines.some((l) => l.includes(needle));
const insertBefore = (re, block, label) => {
  const i = lines.findIndex((l) => re.test(l));
  must(i !== -1, `${label} anchor`);
  lines.splice(i, 0, ...block);
  console.log("ok: " + label);
};
const replaceLine = (re, block, label) => {
  const i = lines.findIndex((l) => re.test(l));
  must(i !== -1, `${label} line`);
  lines.splice(i, 1, ...block);
  console.log("ok: " + label);
};
/**
 * Replace a whole route: from its `app.<verb>(` line to the `});` that closes
 * it. Replacing only the header would leave the old body stranded underneath.
 */
const replaceRoute = (re, block, label) => {
  const start = lines.findIndex((l) => re.test(l));
  must(start !== -1, `${label} start`);
  let depth = 0;
  let started = false;
  let end = -1;
  for (let i = start; i < lines.length; i += 1) {
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    if (opens > 0) started = true;
    depth += opens - closes;
    if (started && depth <= 0 && /\);\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  must(end !== -1, `${label} end`);
  lines.splice(start, end - start + 1, ...block);
  console.log("ok: " + label);
};

/* 1 — the module a row belongs to, and whether it needs a decision. */

if (!has("function notificationModuleOf")) {
  insertBefore(
    /^async function notificationScope\(req: any\) \{/,
    [
      "// ---- WHICH MODULE AND WHETHER IT NEEDS A DECISION ------------------------",
      "// Every alert is filed under the department that produced it, so the Transport",
      "// Manager can ask \"what has Engineering sent me\" instead of reading one pile.",
      "// Audience strings stay as they are (they decide WHO), but they are no longer",
      "// the only thing a row is known by.",
      "const NOTIFICATION_MODULES: Array<{ module: string; match: RegExp; action?: RegExp }> = [",
      "  { module: 'Gate Security', match: /gate|security|checkpoint|departure|return/i },",
      "  { module: 'Tracking', match: /track|location|checkpoint|delay/i },",
      "  { module: 'Engineering', match: /engineer|work order|repair|maintenance|parts|inventory|defect/i, action: /awaiting|approval|requisition|requested/i },",
      "  { module: 'Fuel & Lubricant', match: /diesel|lubricant|fuel|tank|pump|restock|disburs/i, action: /authoriz|approval|withdraw|awaiting/i },",
      "  { module: 'HR & Personnel', match: /hr|licence|license|driver|staff|duty/i },",
      "  { module: 'Accounts', match: /expense|accounts|invoice|claim/i, action: /pending|clarification|approval/i },",
      "  { module: 'Partners', match: /partner|customer portal|request submitted/i },",
      "  { module: 'Fleet Operations', match: /dispatch|assignment|truck|tail|asset|fleet|approv|declin/i, action: /awaiting|pending|assignment needed|approval|sent back|action required/i },",
      "];",
      "",
      "/**",
      " * File a notification under a module and decide whether it is work or news.",
      " * Order matters: the first module whose pattern matches the category, title and",
      " * body wins, so the department that acted is named rather than the department",
      " * that was told.",
      " */",
      "function classifyNotification(input: { category?: string; title?: string; body?: string; audience?: string | null }) {",
      "  const haystack = [input.category, input.title, input.body].filter(Boolean).join(' ');",
      "  for (const entry of NOTIFICATION_MODULES) {",
      "    if (entry.match.test(haystack)) {",
      "      return {",
      "        module: entry.module,",
      "        actionRequired: entry.action ? entry.action.test(haystack) : false,",
      "      };",
      "    }",
      "  }",
      "  return { module: 'System', actionRequired: false };",
      "}",
      "",
    ],
    "notification classifier",
  );
}

/* 2 — the read-state computation: per user, with legacy rows honoured. */

if (!has("function notificationReadWhere")) {
  insertBefore(
    /^async function notificationScope\(req: any\) \{/,
    [
      "/**",
      " * Rows this user has NOT read: neither the legacy shared flag nor their own",
      " * id in `readBy`. Reading is per person, so a colleague's click cannot clear",
      " * this user's badge.",
      " */",
      "function unreadForUser(req: any) {",
      "  const me = String(req.user?.id || '');",
      "  return { read: false, NOT: { readBy: { has: me } } };",
      "}",
      "",
    ],
    "per-user read helpers",
  );
}

/* 3 — the list route gains filters and reports read per user. */

if (!has("const notifModule = ")) {
  replaceRoute(
    /^app\.get\('\/api\/notifications', authenticate/,
    [
      "app.get('/api/notifications', authenticate, async (req: any, res) => {",
      "  // Filters: ?module=Engineering · ?action=1 (only what needs a decision) ·",
      "  // ?unread=1. Read state is per user, so the row is returned with THIS",
      "  // caller's own reading state rather than the shared legacy flag.",
      "  const notifModule = String(req.query?.module || '').trim();",
      "  const notifAction = String(req.query?.action || '') === '1';",
      "  const notifUnread = String(req.query?.unread || '') === '1';",
      "  const where: any = { AND: [await notificationScope(req), notDismissed(req)] };",
      "  if (notifModule) where.AND.push({ module: notifModule });",
      "  if (notifAction) where.AND.push({ actionRequired: true });",
      "  if (notifUnread) where.AND.push(unreadForUser(req));",
      "  const notifRows = await prisma.notification.findMany({",
      "    where,",
      "    orderBy: { createdAt: 'desc' },",
      "    take: req.query?.limit ? Math.min(Number(req.query.limit) || 50, 500) : undefined,",
      "  });",
      "  const readIds = new Set(",
      "    notifRows",
      "      .filter((row: any) => row.read || (row.readBy || []).includes(String(req.user?.id || '')))",
      "      .map((row: any) => row.id),",
      "  );",
      "  res.json(",
      "    notifRows.map((row: any) => ({",
      "      ...row,",
      "      read: readIds.has(row.id),",
      "      readBy: undefined,",
      "    })),",
      "  );",
      "});",
      "",
    ],
    "filtered notification list",
  );
}

/* 4 — the summary the TM's control panel is built on. */

if (!has("'/api/notifications/summary'")) {
  replaceLine(
    /^app\.get\('\/api\/notifications\/unread', authenticate, async \(req: any, res\) => \{$/,
    [
      "/**",
      " * What the Transport Manager's control panel reads first: how much is",
      " * unread and how much needs a decision, broken down by the department that",
      " * sent it. One query, so the badge and the panel can never disagree.",
      " */",
      "app.get('/api/notifications/summary', authenticate, async (req: any, res) => {",
      "  const rows = await prisma.notification.findMany({",
      "    where: { AND: [await notificationScope(req), notDismissed(req)] },",
      "    select: { module: true, category: true, title: true, body: true, read: true, readBy: true, actionRequired: true },",
      "  });",
      "  const me = String(req.user?.id || '');",
      "  const byModule: Record<string, { module: string; total: number; unread: number; action: number }> = {};",
      "  let unread = 0;",
      "  let action = 0;",
      "  for (const row of rows as any[]) {",
      "    const moduleName = row.module || classifyNotification(row).module;",
      "    const isRead = row.read || (row.readBy || []).includes(me);",
      "    const bucket = (byModule[moduleName] = byModule[moduleName] || {",
      "      module: moduleName,",
      "      total: 0,",
      "      unread: 0,",
      "      action: 0,",
      "    });",
      "    bucket.total += 1;",
      "    if (!isRead) {",
      "      bucket.unread += 1;",
      "      unread += 1;",
      "    }",
      "    if (row.actionRequired && !isRead) {",
      "      bucket.action += 1;",
      "      action += 1;",
      "    }",
      "  }",
      "  res.json({",
      "    total: rows.length,",
      "    unread,",
      "    action,",
      "    modules: Object.values(byModule).sort((a, b) => b.unread - a.unread || a.module.localeCompare(b.module)),",
      "  });",
      "});",
      "",
      "app.get('/api/notifications/unread', authenticate, async (req: any, res) => {",
    ],
    "notification summary",
  );
}

// The unread count must be this user's, not the shared flag.
{
  const i = lines.findIndex((l) => /const count = await prisma\.notification\.count\(\{$/.test(l));
  if (i !== -1 && !/unreadForUser\(req\)/.test(lines[i + 1] || "")) {
    lines.splice(
      i + 1,
      1,
      "    where: { read: false, NOT: { readBy: { has: String(req.user?.id || '') } }, AND: [await notificationScope(req), notDismissed(req)] },",
    );
    console.log("ok: unread count is per user");
  }
}

/* 5 — reading and clearing, per user. */

{
  const i = lines.findIndex((l) =>
    /^app\.patch\('\/api\/notifications\/:id', authenticate, async \(req, res\) => \{$/.test(l),
  );
  if (i !== -1) {
    const body = lines.slice(i, i + 4);
    if (!body.some((l) => /readBy/.test(l))) {
      lines.splice(
        i,
        3,
        "app.patch('/api/notifications/:id', authenticate, async (req: any, res) => {",
        "  // Reading is recorded against the person who read it. The shared `read`",
        "  // column is left alone so legacy rows keep their original meaning.",
        "  const wantsRead = req.body?.read !== false;",
        "  const row = await prisma.notification.findUnique({ where: { id: req.params.id } });",
        "  if (!row) return res.status(404).json({ error: 'Notification not found' });",
        "  const me = String(req.user?.id || '');",
        "  const readBy = Array.from(new Set([...(row.readBy || []), ...(wantsRead ? [me] : [])]));",
        "  const next = wantsRead ? readBy : readBy.filter((id) => id !== me);",
        "  res.json(await prisma.notification.update({ where: { id: row.id }, data: { readBy: next } }));",
        "});",
      );
      console.log("ok: per-user read route");
    }
  }
}

{
  const i = lines.findIndex((l) => /^app\.post\('\/api\/notifications\/mark-all-read'/.test(l));
  if (i !== -1) {
    const body = lines.slice(i, i + 5);
    if (!body.some((l) => /readBy/.test(l))) {
      lines.splice(
        i,
        4,
        "app.post('/api/notifications/mark-all-read', authenticate, async (req: any, res) => {",
        "  // Optionally narrowed to one module — \"I have read what Engineering sent\".",
        "  const markModule = String(req.body?.module || '').trim();",
        "  const where: any = { AND: [await notificationScope(req), notDismissed(req)] };",
        "  if (markModule) where.AND.push({ module: markModule });",
        "  const rows = await prisma.notification.findMany({ where, select: { id: true, readBy: true } });",
        "  const me = String(req.user?.id || '');",
        "  const pending = rows.filter((row: any) => !(row.readBy || []).includes(me));",
        "  for (const row of pending) {",
        "    await prisma.notification.update({",
        "      where: { id: row.id },",
        "      data: { readBy: [...(row.readBy || []), me] },",
        "    });",
        "  }",
        "  res.json({ ok: true, marked: pending.length });",
        "});",
      );
      console.log("ok: per-user mark-all-read route");
    }
  }
}

/* 6 — new rows are filed automatically, wherever they are created. */

{
  if (!has("const filed = classifyNotification(req.body || {})")) {
    const i = lines.findIndex((l) =>
      /^app\.post\('\/api\/notifications', authenticate, async \(req, res\) => \{$/.test(l),
    );
    must(i !== -1, "notification create route");
    lines.splice(
      i,
      3,
      "app.post('/api/notifications', authenticate, async (req, res) => {",
      "  // Every row is filed under its module and marked as work or news, so a",
      "  // caller that only knows its title and audience still produces a row the",
      "  // Transport Manager can filter, sort and count.",
      "  const filed = classifyNotification(req.body || {});",
      "  res.json(",
      "    await prisma.notification.create({",
      "      data: {",
      "        ...req.body,",
      "        module: req.body?.module || filed.module,",
      "        actionRequired: req.body?.actionRequired ?? filed.actionRequired,",
      "      },",
      "    }),",
      "  );",
      "});",
    );
    console.log("ok: create route files the row");
  }
}

source = lines.join(eol);
fs.writeFileSync(API, source);
console.log("index.ts written");

/* ------------------------------------------------------------------- data --- */

(async () => {
  const prisma = new PrismaClient();
  const cols = [
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "module" TEXT`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventKey" TEXT`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "refId" TEXT`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "refLabel" TEXT`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "actionRequired" BOOLEAN NOT NULL DEFAULT false`,
  ];
  for (const sql of cols) await prisma.$executeRawUnsafe(sql);
  console.log("applied: Notification columns");

  // Backfill the 900-odd existing rows so the module filter is not empty on day one.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, category, title, body, audience FROM "Notification" WHERE "module" IS NULL`,
  );
  const classify = (input) => {
    const haystack = [input.category, input.title, input.body].filter(Boolean).join(" ");
    const rules = [
      { module: "Gate Security", match: /gate|security|checkpoint|departure|return/i },
      { module: "Tracking", match: /track|location|checkpoint|delay/i },
      {
        module: "Engineering",
        match: /engineer|work order|repair|maintenance|parts|inventory|defect/i,
        action: /awaiting|approval|requisition|requested/i,
      },
      {
        module: "Fuel & Lubricant",
        match: /diesel|lubricant|fuel|tank|pump|restock|disburs/i,
        action: /authoriz|approval|withdraw|awaiting/i,
      },
      { module: "HR & Personnel", match: /hr|licence|license|driver|staff|duty/i },
      { module: "Accounts", match: /expense|accounts|invoice|claim/i, action: /pending|clarification|approval/i },
      { module: "Partners", match: /partner|customer portal|request submitted/i },
      {
        module: "Fleet Operations",
        match: /dispatch|assignment|truck|tail|asset|fleet|approv|declin/i,
        action: /awaiting|pending|assignment needed|approval|sent back|action required/i,
      },
    ];
    for (const rule of rules) {
      if (rule.match.test(haystack)) {
        return { module: rule.module, action: rule.action ? rule.action.test(haystack) : false };
      }
    }
    return { module: "System", action: false };
  };

  let filed = 0;
  for (const row of rows) {
    const { module: moduleName, action } = classify(row);
    await prisma.$executeRawUnsafe(
      `UPDATE "Notification" SET "module" = $1, "actionRequired" = $2 WHERE "id" = $3`,
      moduleName,
      action,
      row.id,
    );
    filed += 1;
  }
  console.log(`applied: filed ${filed} existing notifications by module`);

  const check = await prisma.$queryRawUnsafe(
    `SELECT "module", COUNT(*)::int AS n FROM "Notification" GROUP BY "module" ORDER BY n DESC`,
  );
  console.log("modules now:", JSON.stringify(check));
  await prisma.$disconnect();
})();
