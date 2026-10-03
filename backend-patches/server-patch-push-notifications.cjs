/**
 * One-shot server patch (run ON the API server, same as the other
 * scripts/server-patch-*.cjs in karigo-command-center):
 *
 *   node server-patch-push-notifications.cjs
 *
 * Push notifications for the FleetOpsX mobile app.
 *
 *   - POST   /api/push-tokens  { token, platform }  — the signed-in phone registers its Expo push token
 *   - DELETE /api/push-tokens  { token }            — sign-out (no login needed: removing a token only
 *                                                    stops pushes to that phone)
 *   - Every 10s, notifications created since the last run are pushed to the phones of the people who can
 *     see them in their OWN feed — the same notificationScope() + notDismissed() rules the bell uses, so a
 *     partner only hears about their own deliveries and a department only about its own work. A row whose
 *     actionRoles include one of the reader's roles arrives as "Action needed: …" on the high-priority
 *     channel; everything else on "Updates". People without a pricing role never see ₦ amounts in a push.
 *
 * Data: a new "PushToken" table and a "pushedAt" column on "Notification" (existing rows are marked as
 * already pushed, so nothing old is sent). Rows are claimed atomically before sending, so two API
 * processes never push the same notification twice.
 *
 * Safe to re-run (each step checks first). Before restarting it type-checks the patched index.ts; after
 * restarting it checks pm2 reports the API online — on any failure index.ts is restored from
 * index.ts.bak-push and the API restarted on the old code.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// The live server's folder (an override exists only for a dry run on a copy).
const ROOT = process.env.FLEETOPSX_API_ROOT || "/var/www/fleetopsx-api";
const API = path.join(ROOT, "index.ts");
const SCHEMA = path.join(ROOT, "prisma/schema.prisma");
const BACKUP = API + ".bak-push";
const MARK = "// --- push notifications (server-patch-push-notifications) ---";
const PM2_NAME = "fleetopsx-api";

const fromRoot = (name) => require(require.resolve(name, { paths: [ROOT, process.cwd(), __dirname] }));
const say = (m) => console.log("ok: " + m);
function fail(message) {
  console.error("FAIL: " + message);
  process.exit(1);
}

/* ------------------------------------------------------------------ data --- */

async function migrateData() {
  const { PrismaClient } = fromRoot("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "PushToken" (
        "token" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "platform" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PushToken_pkey" PRIMARY KEY ("token")
      )`,
    );
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PushToken_userId_idx" ON "PushToken"("userId")`);
    say("PushToken table");

    const has = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Notification' AND column_name = 'pushedAt'`,
    );
    if (has.length === 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Notification" ADD COLUMN "pushedAt" TIMESTAMP(3)`);
      // Everything that already exists counts as sent — only new notifications are pushed.
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "Notification" SET "pushedAt" = (now() AT TIME ZONE 'UTC') WHERE "pushedAt" IS NULL`,
      );
      say(`Notification.pushedAt added; ${n} existing rows marked as already pushed`);
    } else {
      say("Notification.pushedAt already present");
    }
  } finally {
    await prisma.$disconnect();
  }
}

/* ---------------------------------------------------------------- schema --- */

function patchSchema() {
  const raw = fs.readFileSync(SCHEMA, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  // Keep the schema in step with the database, so a later `prisma db push`
  // never drops the new table or column.
  const start = lines.findIndex((l) => /^model Notification\b/.test(l));
  if (start === -1) fail("model Notification not found in schema.prisma");
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  if (!lines.slice(start, end).some((l) => /^\s+pushedAt\b/.test(l))) {
    // Fields go above the model's @@index/@@map lines, if it has any.
    const attr = lines.findIndex((l, i) => i > start && i < end && /^\s+@@/.test(l));
    const at = attr === -1 ? end : attr;
    lines.splice(at, 0, "  /// When this was pushed to phones (server-patch-push-notifications).", "  pushedAt          DateTime?");
    say("schema: Notification.pushedAt");
  }
  if (!lines.some((l) => /^model PushToken\b/.test(l))) {
    lines.push(
      "",
      "/// A phone that receives push notifications for a user (FleetOpsX mobile).",
      "model PushToken {",
      "  token     String   @id",
      "  userId    String",
      "  platform  String?",
      "  createdAt DateTime @default(now())",
      "  updatedAt DateTime @default(now())",
      "",
      "  @@index([userId])",
      "}",
      "",
    );
    say("schema: model PushToken");
  }
  fs.writeFileSync(SCHEMA, lines.join(eol));
}

/* ------------------------------------------------------------------- api --- */

function pushBlock(src) {
  const dismiss = /function notDismissed\(/.test(src) ? "notDismissed(asReader)" : null;
  const scope = [`{ id: { in: ids } }`, `await notificationScope(asReader)`, dismiss].filter(Boolean).join(", ");
  return `${MARK}
// Every new notification is pushed to the phones of the people who can see it
// in their own feed (notificationScope + notDismissed — the bell's own rules),
// flagged "Action needed" for the roles that must act on it.
const PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_PRICE_ROLES = ['Transport Manager', 'Platform Admin', 'Accounts', 'Finance'];
const pushHttps: any = require('https');

app.post('/api/push-tokens', authenticate, async (req: any, res: any) => {
  const token = String(req.body?.token || '').trim();
  if (!/^Expo(nent)?PushToken\\[[^\\]]+\\]$/.test(token)) {
    return res.status(400).json({ error: 'A valid Expo push token is required.' });
  }
  const platform = String(req.body?.platform || '').slice(0, 16) || null;
  await prisma.$executeRawUnsafe(
    'INSERT INTO "PushToken" ("token", "userId", "platform", "createdAt", "updatedAt") ' +
      "VALUES ($1, $2, $3, (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC')) " +
      'ON CONFLICT ("token") DO UPDATE SET "userId" = EXCLUDED."userId", "platform" = EXCLUDED."platform", ' +
      "\\"updatedAt\\" = (now() AT TIME ZONE 'UTC')",
    token,
    String(req.user.id),
    platform,
  );
  res.json({ ok: true });
});

// No sign-in needed: a phone that signed out with no signal removes its token
// later, and removing a token only stops pushes to that one phone.
app.delete('/api/push-tokens', async (req: any, res: any) => {
  const token = String(req.body?.token || '').trim();
  if (token) await prisma.$executeRawUnsafe('DELETE FROM "PushToken" WHERE "token" = $1', token);
  res.json({ ok: true });
});

function pushPost(payload: any): Promise<any> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const request = pushHttps.request(
      PUSH_SEND_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (response: any) => {
        let text = '';
        response.on('data', (chunk: any) => {
          text += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            resolve(null);
          }
        });
      },
    );
    request.on('error', () => resolve(null));
    request.setTimeout(15000, () => {
      request.destroy();
      resolve(null);
    });
    request.write(body);
    request.end();
  });
}

/** "75 litres • DIS-1 • \\u20A6975 • dispensed by Musa" → no amount, for people who do not price fuel. */
function pushWithoutPrices(text: string): string {
  return text
    .replace(/\\s*[\\u2022\\u00B7]\\s*\\u20A6\\s?[\\d,.]+/g, '')
    .replace(/\\s*\\u20A6\\s?[\\d,.]+/g, '')
    .trim();
}

let pushBusy = false;

async function pushNewNotifications() {
  if (pushBusy) return;
  pushBusy = true;
  try {
    // Claim what nobody has pushed yet — atomic, so two API processes never
    // both send one. Older than 30 minutes is news nobody wants buzzing now.
    const rows: any[] = await prisma.$queryRawUnsafe(
      'UPDATE "Notification" SET "pushedAt" = (now() AT TIME ZONE \\'UTC\\') WHERE "id" IN (' +
        'SELECT "id" FROM "Notification" WHERE "pushedAt" IS NULL ' +
        'AND "createdAt" > (now() AT TIME ZONE \\'UTC\\') - INTERVAL \\'30 minutes\\' ' +
        'ORDER BY "createdAt" ASC LIMIT 100 FOR UPDATE SKIP LOCKED) ' +
        'RETURNING "id", "title", "body", "module", "eventKey", "refId", "actionRoles"',
    );
    if (!rows.length) return;
    const holders: any[] = await prisma.$queryRawUnsafe('SELECT "token", "userId" FROM "PushToken"');
    if (!holders.length) return;
    const tokensOf = new Map<string, string[]>();
    for (const h of holders) {
      const key = String(h.userId);
      tokensOf.set(key, [...(tokensOf.get(key) || []), String(h.token)]);
    }
    const people = (await (prisma as any).user.findMany({ where: { status: 'Active' } })).filter((u: any) =>
      tokensOf.has(String(u.id)),
    );
    const ids = rows.map((r: any) => r.id);
    const messages: any[] = [];
    for (const u of people) {
      const roles: string[] = Array.from(
        new Set([u.role, ...String(u.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean)]),
      );
      // Read exactly as this person would — their own feed's rules.
      const asReader: any = { user: { id: u.id, email: u.email, name: u.name, role: u.role, roles }, query: {}, params: {}, headers: {} };
      let visible: any[] = [];
      try {
        visible = await prisma.notification.findMany({
          where: { AND: [${scope}] },
          select: { id: true },
        });
      } catch (e) {
        console.error('[push] could not read the feed of', u.id, e);
        continue;
      }
      const seesPrices = roles.some((r: string) => PUSH_PRICE_ROLES.includes(r));
      for (const v of visible) {
        const row = rows.find((r: any) => String(r.id) === String(v.id));
        if (!row) continue;
        const mustAct = (row.actionRoles || []).some((r: string) => roles.includes(r));
        const text = String(row.body || '');
        for (const to of tokensOf.get(String(u.id)) || []) {
          messages.push({
            to,
            title: mustAct ? 'Action needed: ' + row.title : row.title,
            body: (seesPrices ? text : pushWithoutPrices(text)).slice(0, 300),
            sound: 'default',
            priority: mustAct ? 'high' : 'default',
            channelId: mustAct ? 'action' : 'updates',
            data: {
              notificationId: String(row.id),
              userId: String(u.id),
              module: row.module || null,
              eventKey: row.eventKey || null,
              refId: row.refId || null,
              actionRequired: mustAct,
            },
          });
        }
      }
    }
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const reply = await pushPost(chunk);
      const tickets: any[] = Array.isArray(reply?.data) ? reply.data : [];
      for (let k = 0; k < tickets.length; k += 1) {
        // The app was removed or the token replaced — stop sending to it.
        if (tickets[k]?.details?.error === 'DeviceNotRegistered') {
          await prisma.$executeRawUnsafe('DELETE FROM "PushToken" WHERE "token" = $1', chunk[k].to).catch(() => {});
        }
      }
    }
    if (messages.length) console.log('[push] sent', messages.length, 'for', rows.length, 'notification(s)');
  } catch (e) {
    console.error('[push] run failed', e);
  } finally {
    pushBusy = false;
  }
}

if (!(global as any).__fleetopsxPushTimer) {
  (global as any).__fleetopsxPushTimer = setInterval(() => {
    void pushNewNotifications();
  }, 10000);
}
// --- end push notifications ---
`;
}

function patchApi() {
  const src = fs.readFileSync(API, "utf8");
  if (src.includes(MARK)) {
    say("index.ts already has push notifications");
    return false;
  }
  if (!/async function notificationScope\(/.test(src)) fail("notificationScope() not found in index.ts — patch not applied");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  let at = lines.findIndex((l) => /^app\.get\('\/api\/notifications',/.test(l));
  if (at === -1) at = lines.findIndex((l) => /^app\.listen\(/.test(l));
  if (at === -1) fail("no place found for the push routes (no /api/notifications route or app.listen) — nothing changed");
  fs.copyFileSync(API, BACKUP);
  lines.splice(at, 0, ...pushBlock(src).split("\n"));
  fs.writeFileSync(API, lines.join(eol));
  say(`push routes and sender added to index.ts (backup: ${path.basename(BACKUP)})`);
  return true;
}

/* -------------------------------------------------------------- checking --- */

// Same flags the earlier patches build with (server-patch-multi-role.cjs).
const TSC_FLAGS = "--skipLibCheck --esModuleInterop --module commonjs --target es2020 --moduleResolution node";
let tscFlagsFor = null;

/** TypeScript 6 refuses a file-on-the-command-line build next to a tsconfig unless told to ignore it. */
function tscFlags() {
  if (tscFlagsFor === null) {
    let major = 5;
    try {
      const m = execSync("npx tsc -v", { cwd: ROOT, encoding: "utf8", timeout: 120000 }).match(/Version (\d+)\./);
      if (m) major = Number(m[1]);
    } catch (e) {
      // keep the TypeScript 5 flags
    }
    tscFlagsFor = TSC_FLAGS + (major >= 6 ? " --ignoreConfig --ignoreDeprecations 6.0" : "");
  }
  return tscFlagsFor;
}

function typeChecks(file) {
  try {
    execSync(`npx tsc ${file} --noEmit ${tscFlags()}`, { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    return { ok: true, out: "" };
  } catch (e) {
    return { ok: false, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}

function restore(reason) {
  console.error("ROLLING BACK: " + reason);
  fs.copyFileSync(BACKUP, API);
}

function pm2App() {
  try {
    const list = JSON.parse(execSync("pm2 jlist", { encoding: "utf8" }));
    return list.find((p) => p.name === PM2_NAME) || null;
  } catch (e) {
    return null;
  }
}

function buildIfCompiled(app) {
  const exec = String(app?.pm2_env?.pm_exec_path || "");
  if (/\.js$/.test(exec) && /[\\/]dist[\\/]/.test(exec)) {
    console.log("build: pm2 runs compiled JS — compiling index.ts to dist…");
    execSync(`npx tsc index.ts --outDir dist ${tscFlags()}`, { cwd: ROOT, stdio: "inherit", timeout: 300000 });
  }
}

/** Restart, then require the API to have stayed up (no crash loop) for a few seconds. */
function restartAndCheck() {
  execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
  execSync("sleep 10");
  const app = pm2App();
  const upFor = Date.now() - Number(app?.pm2_env?.pm_uptime ?? Date.now());
  return app?.pm2_env?.status === "online" && upFor >= 5000;
}

/* ------------------------------------------------------------------- main --- */

async function main() {
  if (!fs.existsSync(API)) fail(`${API} not found — run this on the API server`);
  await migrateData();
  patchSchema();
  const changed = patchApi();
  if (!changed) {
    console.log("Nothing new to install. If pushes are not arriving, check: pm2 logs " + PM2_NAME + " | grep push");
    return;
  }

  // Type-check before the restart: the old code keeps running if this fails.
  const patched = typeChecks("index.ts");
  if (!patched.ok) {
    // Only blame the patch if the file type-checked before it.
    const origCheck = path.join(ROOT, "index.push-orig-check.ts");
    fs.copyFileSync(BACKUP, origCheck);
    const original = typeChecks("index.push-orig-check.ts");
    fs.unlinkSync(origCheck);
    if (original.ok) {
      restore("the patched index.ts does not type-check:\n" + patched.out.slice(0, 3000));
      process.exit(1);
    }
    console.log("note: index.ts already had type errors before this patch — type check skipped.");
  } else {
    say("patched index.ts type-checks");
  }

  const app = pm2App();
  try {
    buildIfCompiled(app);
  } catch (e) {
    restore("the build failed");
    process.exit(1);
  }
  if (!restartAndCheck()) {
    restore(`${PM2_NAME} did not stay online after the restart`);
    try {
      buildIfCompiled(app);
    } catch (e) {
      // the old code compiled before — nothing more to do here
    }
    execSync(`pm2 restart ${PM2_NAME}`, { stdio: "inherit" });
    console.error("The API is back on the previous code. Logs: pm2 logs " + PM2_NAME + " --lines 80");
    process.exit(1);
  }
  say(`${PM2_NAME} restarted and online`);
  console.log(
    "\nDONE — push notifications are live. Phones register when someone signs in to a FleetOpsX build " +
      "that includes push (not Expo Go). Watch it work: pm2 logs " + PM2_NAME + " | grep push",
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error("FAIL:", e && e.message ? e.message : e);
    process.exit(1);
  });
}

module.exports = { pushBlock, patchSchema, patchApi };
