/**
 * Server patch 2: who must ACT, and each module saying what it sent.
 *
 * Patch 1 filed every row under a module and gave it an action flag. The flag
 * was shared, though: "Request Approved" is work for Fleet Operations (assign a
 * truck) and pure news for the Transport Manager, who approved it himself. So
 * his "needs me" list filled up with other departments' queues.
 *
 * `actionRoles` fixes that. A row names the ROLES that must act on it, and each
 * reader is told whether it is their turn: the TM's "needs me" is his queue
 * (requests awaiting approval, diesel to release, parts to authorise, the tank
 * running low), never somebody else's.
 *
 * Each module's writer now states its own module and its own action roles rather
 * than relying on the text classifier, which stays as the fallback for callers
 * that say nothing.
 *
 * Run ON the box from /var/www/fleetopsx-api, then:
 *   npx prisma db push && npx prisma generate && pm2 restart fleetopsx-api
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
  const block = lines.slice(start, end);
  if (!block.some((l) => /^\s+actionRoles\b/.test(l))) {
    const anchor = lines.findIndex(
      (l, i) => i > start && i < end && /^\s+actionRequired\s+Boolean/.test(l),
    );
    must(anchor !== -1, "Notification.actionRequired");
    lines.splice(
      anchor + 1,
      0,
      "  /// The roles that must ACT on this. A reader is told \"this is yours\"",
      "  /// only when one of these is their own role — the Transport Manager's queue",
      "  /// is his decisions, not Fleet Ops' assignments.",
      "  actionRoles       String[] @default([])",
    );
    fs.writeFileSync(SCHEMA, lines.join(eol));
    console.log("ok: schema actionRoles added");
  } else {
    console.log("ok: schema actionRoles already present");
  }
}

/* -------------------------------------------------------------------- api --- */

const eol = fs.readFileSync(API, "utf8").includes("\r\n") ? "\r\n" : "\n";
let lines = fs.readFileSync(API, "utf8").split(/\r?\n/);
const src = () => lines.join("\n");
const has = (needle) => src().includes(needle);

/** Replace a statement starting at `start` and ending at the line that closes its parens. */
const spanFrom = (start, label) => {
  let depth = 0;
  let started = false;
  for (let i = start; i < Math.min(start + 24, lines.length); i += 1) {
    const opens = (lines[i].match(/\(/g) || []).length;
    const closes = (lines[i].match(/\)/g) || []).length;
    if (opens > 0) started = true;
    depth += opens - closes;
    if (started && depth <= 0 && /;\s*$/.test(lines[i])) return i;
  }
  throw new Error(`could not find the end of ${label}`);
};

const replaceStatement = (re, block, label) => {
  const start = lines.findIndex((l) => re.test(l));
  must(start !== -1, `${label} start`);
  const end = spanFrom(start, label);
  lines.splice(start, end - start + 1, ...block);
  console.log("ok: " + label);
};

/* 1 — the writer takes what the module knows about its own alert. */

if (!has("actionRoles?: string[];")) {
  const i = lines.findIndex((l) => /^async function notify\(category: string/.test(l));
  must(i !== -1, "notify()");
  const end = spanFrom(i, "notify()");
  lines.splice(
    i,
    end - i + 1,
    "type NoticeMeta = {",
    "  module?: string;",
    "  eventKey?: string;",
    "  refId?: string;",
    "  refLabel?: string;",
    "  /** Roles that must act. Empty = nobody has to do anything. */",
    "  actionRoles?: string[];",
    "};",
    "",
    "/**",
    " * The one writer every module calls. It files the row under the module that",
    " * sent it, attaches the record it is about and names the roles that must act —",
    " * so the Transport Manager's feed can be read by department, and his \"needs me\"",
    " * is his own queue rather than the whole company's.",
    " */",
    "async function notify(",
    "  category: string,",
    "  title: string,",
    "  body: string,",
    "  severity = 'info',",
    "  audience?: string,",
    "  meta?: NoticeMeta,",
    ") {",
    "  const filed = classifyNotification({ category, title, body, audience });",
    "  const actionRoles = meta?.actionRoles ?? [];",
    "  return prisma.notification.create({",
    "    data: {",
    "      category,",
    "      title,",
    "      body,",
    "      severity,",
    "      time: 'Just now',",
    "      read: false,",
    "      audience: audience ?? null,",
    "      module: meta?.module || filed.module,",
    "      eventKey: meta?.eventKey ?? null,",
    "      refId: meta?.refId ?? null,",
    "      refLabel: meta?.refLabel ?? null,",
    "      actionRoles,",
    "      actionRequired: actionRoles.length > 0,",
    "    },",
    "  });",
    "}",
  );
  console.log("ok: notify() takes a module and its action roles");
} else {
  console.log("ok: notify() already extended");
}

/* 2 — the trip lifecycle catalogue declares its module and its owner. */

const noticeMetaMarker = "const noticeMeta = notice as any;";
if (!has(noticeMetaMarker)) {
  const rows = [
    [
      "'Approved': { category: 'Approvals', title: 'Request Approved', body: (t) => `Dispatch ${dispatchRef(t.id)} was approved and is awaiting truck assignment.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'success' },",
      "'Approved': { category: 'Approvals', title: 'Request Approved', body: (t) => `Dispatch ${dispatchRef(t.id)} was approved and is awaiting truck assignment.`, audience: 'Partner,Transport Manager,Fleet Operations', severity: 'success', module: 'Fleet Operations', action: ['Fleet Operations'] },",
    ],
    [
      "'Scheduled': { category: 'Operations', title: 'Truck Assigned', body: (t) => `Dispatch ${dispatchRef(t.id)} is fully assigned (${t.truckReg} · ${t.driverName}) and scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking,Loading', severity: 'success' },",
      "'Scheduled': { category: 'Operations', title: 'Truck Assigned', body: (t) => `Dispatch ${dispatchRef(t.id)} is fully assigned (${t.truckReg} · ${t.driverName}) and scheduled for ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking,Loading', severity: 'success', module: 'Fleet Operations' },",
    ],
    [
      "'En Route': { category: 'Operations', title: 'Truck Departed', body: (t) => `Dispatch ${dispatchRef(t.id)} departed — truck ${t.truckReg} is En Route to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Security,Tracking', severity: 'info' },",
      "'En Route': { category: 'Operations', title: 'Truck Departed', body: (t) => `Dispatch ${dispatchRef(t.id)} departed — truck ${t.truckReg} is En Route to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Security,Tracking', severity: 'info', module: 'Gate Security' },",
    ],
    [
      "'Delayed': { category: 'Operations', title: 'Dispatch Delayed', body: (t) => `Dispatch ${dispatchRef(t.id)} has been marked Delayed.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'warning' },",
      "'Delayed': { category: 'Operations', title: 'Dispatch Delayed', body: (t) => `Dispatch ${dispatchRef(t.id)} has been marked Delayed.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'warning', module: 'Tracking', action: ['Tracking'] },",
    ],
    [
      "'Completed': { category: 'Operations', title: 'Delivery Completed', body: (t) => `Dispatch ${dispatchRef(t.id)} completed delivery to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'success' },",
      "'Completed': { category: 'Operations', title: 'Delivery Completed', body: (t) => `Dispatch ${dispatchRef(t.id)} completed delivery to ${t.dropoff}.`, audience: 'Partner,Transport Manager,Fleet Operations,Tracking', severity: 'success', module: 'Fleet Operations' },",
    ],
    [
      "'Stopped': { category: 'Approvals', title: 'Request Declined', body: (t) => `Dispatch ${dispatchRef(t.id)} was declined/stopped by Transport Manager.`, audience: 'Partner,Transport Manager', severity: 'error' },",
      "'Stopped': { category: 'Approvals', title: 'Request Declined', body: (t) => `Dispatch ${dispatchRef(t.id)} was declined/stopped by Transport Manager.`, audience: 'Partner,Transport Manager', severity: 'error', module: 'Fleet Operations' },",
    ],
  ];
  for (const [before, after] of rows) {
    const i = lines.findIndex((l) => l.trim() === before);
    must(i !== -1, `notice ${before.slice(0, 20)}`);
    lines.splice(i, 1, "  " + after);
  }

  {
    const i = lines.findIndex((l) => /^\s+const notice = TRIP_STATUS_NOTICES\[trip\.status\];/.test(l));
    must(i !== -1, "notice lookup");
    lines.splice(i + 1, 0, "  // `module` and `action` travel WITH the catalogue entry, so the module that",
      "  // owns the transition is named rather than guessed from the wording.",
      "  const noticeMeta = notice as any;");
    console.log("ok: notice meta");
  }

  replaceStatement(
    /^\s+void notify\(notice\.category, notice\.title, notice\.body\(trip\), notice\.severity, audience\);/,
    [
      "    void notify(notice.category, notice.title, notice.body(trip), notice.severity, audience, {",
      "      module: noticeMeta.module,",
      "      eventKey: 'dispatch.' + String(trip.status).toLowerCase(),",
      "      refId: trip.id,",
      "      refLabel: dispatchRef(trip.id),",
      "      actionRoles: noticeMeta.action ?? [],",
      "    });",
    ],
    "lifecycle notice filed",
  );
} else {
  console.log("ok: lifecycle catalogue already filed");
}

/* 3 — every other module names itself and its owner. */

const callSites = [
  {
    label: "new staff account",
    marker: "eventKey: 'staff.created'",
    re: /^\s+void notify\('Compliance', 'New Staff Account'/,
    block: [
      "    void notify('Compliance', 'New Staff Account', `Account created for ${user.name} (${user.role}). A first-login password reset is required.`, 'success', 'Transport Manager,Platform Admin,HR', { module: 'HR & Personnel', eventKey: 'staff.created', refId: user.id, refLabel: user.name });",
    ],
  },
  {
    label: "password reset",
    marker: "eventKey: 'account.password_reset'",
    re: /^\s+void notify\('Compliance', 'Password Reset'/,
    block: [
      "    void notify('Compliance', 'Password Reset', `A new temporary password was issued for ${existing?.name || 'your account'}. Please change it on next login.`, 'warning', existing?.role, { module: 'Accounts', eventKey: 'account.password_reset' });",
    ],
  },
  {
    label: "account suspended",
    marker: "eventKey: 'account.suspended'",
    re: /^\s+void notify\('Compliance', 'Account Suspended'/,
    block: [
      "    void notify('Compliance', 'Account Suspended', ` ${user.name}'s account was suspended. Login access is revoked until reactivated.`, 'error', 'Transport Manager,Platform Admin,HR', { module: 'Accounts', eventKey: 'account.suspended' });",
    ],
  },
  {
    label: "new delivery request",
    marker: "eventKey: 'request.submitted'",
    re: /^\s+void notify\('Approvals', 'New Delivery Request'/,
    block: [
      "    // A partner's request waits on the Transport Manager FIRST; Fleet Operations",
      "    // is told it exists but has nothing to do until it is approved.",
      "    void notify('Approvals', 'New Delivery Request', `${partnerName} requested a ${data.tailType || 'truck'} for ${data.customerConsignee || 'a customer'} to ${data.dropoff}.`, 'info', 'Transport Manager,Fleet Operations', { module: 'Partners', eventKey: 'request.submitted', refId: trip.id, refLabel: dispatchRef(trip.id), actionRoles: ['Transport Manager'] });",
    ],
  },
  {
    label: "dispatch created",
    marker: "eventKey: 'dispatch.created'",
    re: /^\s+void notify\('Operations', 'Dispatch Created'/,
    block: [
      "    void notify('Operations', 'Dispatch Created', `Dispatch ${dispatchRef(trip.id)} created for ${data.customer || 'internal operations'} (${data.pickup} → ${data.dropoff}).`, 'info', 'Transport Manager,Fleet Operations', { module: 'Fleet Operations', eventKey: 'dispatch.created', refId: trip.id, refLabel: dispatchRef(trip.id) });",
    ],
  },
  {
    label: "gate movement",
    marker: "eventKey: entry.type === 'Return'",
    re: /^\s+void notify\('Security', entry\.type === 'Return'/,
    block: [
      "    // The gate logged this itself, so it is a record for everyone else — nobody",
      "    // is being asked to act.",
      "    void notify('Security', entry.type === 'Return' ? 'Gate Return Logged' : 'Gate Departure Logged', `Truck ${entry.truckReg} (${entry.driver}) — ${entry.type} logged at the gate.`, 'info', 'Partner,TransportManager,Fleet Operations,Security', { module: 'Gate Security', eventKey: entry.type === 'Return' ? 'gate.return' : 'gate.departure', refId: entry.tripId ?? entry.id, refLabel: entry.truckReg });",
    ],
  },
  {
    label: "checkpoint logged",
    marker: "eventKey: 'tracking.checkpoint'",
    re: /^\s+void notify\('Operations', 'New Location has been Logged'/,
    block: [
      "    void notify('Operations', 'New Location has been Logged', `Dispatch ${dispatchRef(tripId)} checkpoint recorded at ${location} (${leg}).`, 'info', 'Partner,TransportManager,Fleet Operations,Tracking,Loading', { module: 'Tracking', eventKey: 'tracking.checkpoint', refId: tripId, refLabel: dispatchRef(tripId) });",
    ],
  },
  {
    label: "staff onboarded",
    marker: "eventKey: 'staff.onboarded'",
    re: /^\s+void notify\('HR', 'New Staff Onboarded'/,
    block: [
      "    void notify('HR', 'New Staff Onboarded', name + ' (' + staffId + ') was added to the driver roster.', 'success', 'Transport Manager,HR', { module: 'HR & Personnel', eventKey: 'staff.onboarded', refLabel: name });",
    ],
  },
  {
    label: "part procured",
    marker: "eventKey: 'parts.procured'",
    re: /^\s+await notify\('Engineering', 'Part Procured'/,
    block: [
      "    await notify('Engineering', 'Part Procured', `Procurement request ${pr.id} (${pr.partName}) marked as Procured.`, 'success', undefined, { module: 'Engineering', eventKey: 'parts.procured', refId: pr.id, refLabel: pr.partName });",
    ],
  },
  {
    label: "diesel authorization",
    marker: "eventKey: revoke ? 'fuel.release_withdrawn' : 'fuel.released'",
    re: /^\s+await notify\('Lubricant',$/,
    block: [
      "      await notify('Lubricant',",
      "        revoke ? 'Diesel authorization withdrawn' : 'Diesel allocation authorized',",
      "        revoke",
      "          ? 'The allocation for ' + dispatchRef(tripId) + ' was withdrawn by ' + by + '.'",
      "          : litres.toLocaleString() + ' ' + (dc.lubricantType || 'Diesel') + ' authorized for ' +",
      "            dispatchRef(tripId) + ' by ' + by + '.',",
      "        revoke ? 'warning' : 'success',",
      "        'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',",
      "        {",
      "          module: 'Fuel & Lubricant',",
      "          eventKey: revoke ? 'fuel.release_withdrawn' : 'fuel.released',",
      "          refId: tripId,",
      "          refLabel: dispatchRef(tripId),",
      "          // Released litres are the department's to collect — Fleet Ops' queue,",
      "          // not another decision for the Transport Manager.",
      "          actionRoles: revoke ? [] : ['Fleet Operations'],",
      "        });",
    ],
  },
  {
    label: "restock",
    marker: "eventKey: 'fuel.restocked'",
    re: /^\s+await notify\('Lubricant', fuelType \+ ' Restocked'/,
    block: [
      "      await notify('Lubricant', fuelType + ' Restocked',",
      "        '+' + quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' logged by ' + loggedBy +",
      "        ' — available now ' + stock.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + '.',",
      "        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',",
      "        { module: 'Fuel & Lubricant', eventKey: 'fuel.restocked' });",
    ],
  },
  {
    label: "disbursal",
    marker: "eventKey: 'fuel.dispensed'",
    re: /^\s+await notify\('Lubricant', 'Successful '/,
    block: [
      "      await notify('Lubricant', 'Successful ' + fuelType.toLowerCase() + ' disbursal',",
      "        quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) + ' • ' + dispatchRef(tripId) +",
      "        ' • ₦' + (row.amount).toLocaleString() + ' • dispensed by ' + dispensedBy,",
      "        'success', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',",
      "        { module: 'Fuel & Lubricant', eventKey: 'fuel.dispensed', refId: tripId, refLabel: dispatchRef(tripId) });",
    ],
  },
  {
    label: "low stock",
    marker: "eventKey: 'fuel.low_stock'",
    re: /^\s+await notify\('Lubricant', fuelType \+ ' Inventory is running low'/,
    block: [
      "        await notify('Lubricant', fuelType + ' Inventory is running low',",
      "          'Current Stock: ' + after.quantity.toLocaleString() + ' ' + lubricantUnit(fuelType) +",
      "          ' (minimum ' + after.minLevel.toLocaleString() + ')',",
      "          'warning', 'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager',",
      "          {",
      "            module: 'Fuel & Lubricant',",
      "            eventKey: 'fuel.low_stock',",
      "            refLabel: fuelType,",
      "            // Buying more is the Transport Manager's decision.",
      "            actionRoles: ['Transport Manager'],",
      "          });",
    ],
  },
  {
    label: "fuel price updated",
    marker: "eventKey: 'fuel.price_updated'",
    re: /^\s+await notify\('Operations', 'Fuel Price Updated'/,
    block: [
      "      await notify('Operations', 'Fuel Price Updated',",
      "        `${t} price is now ₦${p.toLocaleString()} per litre (set by ${req.user.name || 'Transport Manager'}).`,",
      "        'info', 'Transport Manager,Fleet Operations',",
      "        { module: 'Fuel & Lubricant', eventKey: 'fuel.price_updated', refLabel: t });",
    ],
  },
];

for (const site of callSites) {
  if (has(site.marker)) {
    console.log("ok: " + site.label + " (already filed)");
    continue;
  }
  replaceStatement(site.re, site.block, site.label);
}

/* 4 — the list and the summary resolve "needs me" against the reader's roles. */

if (!has("const mineToAct = (row: any) =>")) {
  const start = lines.findIndex((l) => /^  const readIds = new Set\($/.test(l));
  must(start !== -1, "list readIds");
  const end = lines.findIndex((l, i) => i > start && /^  \);$/.test(l));
  must(end !== -1, "list response end");
  lines.splice(
    start,
    end - start + 1,
    "  const me = String(req.user?.id || '');",
    "  const myRoles = [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].filter(",
    "    Boolean,",
    "  );",
    "  const readIds = new Set(",
    "    notifRows",
    "      .filter((row: any) => row.read || (row.readBy || []).includes(me))",
    "      .map((row: any) => row.id),",
    "  );",
    "  // \"Needs me\" is this reader's own work: the row names the roles that must act.",
    "  const mineToAct = (row: any) =>",
    "    (row.actionRoles || []).some((role: string) => myRoles.includes(role));",
    "  res.json(",
    "    notifRows.map((row: any) => ({",
    "      ...row,",
    "      read: readIds.has(row.id),",
    "      actionRequired: mineToAct(row),",
    "      actionRoles: row.actionRoles || [],",
    "      readBy: undefined,",
    "    })),",
    "  );",
  );
  console.log("ok: list resolves action against the reader");
}

{
  const i = lines.findIndex((l) => /if \(notifAction\) where\.AND\.push\(\{ actionRequired: true \}\);/.test(l));
  if (i !== -1) {
    lines.splice(
      i,
      1,
      "  if (notifAction) {",
      "    // A reader's own queue: rows whose action roles include one of theirs.",
      "    const askedRoles = [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].filter(Boolean);",
      "    where.AND.push({ actionRoles: { hasSome: askedRoles } });",
      "  }",
    );
    console.log("ok: action filter is per reader");
  }
}

if (!has("const needsMe = (row.actionRoles || []).some")) {
  const j = lines.findIndex((l) => /const isRead = row\.read \|\| \(row\.readBy \|\| \[\]\)\.includes\(me\);/.test(l));
  must(j !== -1, "summary isRead");
  lines.splice(
    j + 1,
    0,
    "    const needsMe = (row.actionRoles || []).some((role: string) =>",
    "      [req.user?.role, ...(Array.isArray(req.user?.roles) ? req.user.roles : [])].includes(role),",
    "    );",
  );
  const k = lines.findIndex((l) => /if \(row\.actionRequired && !isRead\) \{/.test(l));
  must(k !== -1, "summary action counter");
  lines.splice(k, 1, "    if (needsMe && !isRead) {");
  console.log("ok: summary counts only the reader's own work");
}

{
  const i = lines.findIndex((l) => /select: \{ module: true, category: true, title: true, body: true, read: true, readBy: true, actionRequired: true \},/.test(l));
  if (i !== -1) {
    lines.splice(
      i,
      1,
      "    select: { module: true, category: true, title: true, body: true, read: true, readBy: true, actionRequired: true, actionRoles: true },",
    );
    console.log("ok: summary selects actionRoles");
  }
}

/* 5 — the create route keeps whatever the caller filed. */

{
  const i = lines.findIndex((l) => /const filed = classifyNotification\(req\.body \|\| \{\}\);/.test(l));
  if (i !== -1 && !lines.slice(i, i + 16).some((l) => /actionRoles: Array\.isArray/.test(l))) {
    const j = lines.findIndex((l, idx) => idx > i && /actionRequired: req\.body\?\.actionRequired \?\? filed\.actionRequired,/.test(l));
    must(j !== -1, "create route action line");
    lines.splice(
      j + 1,
      0,
      "        actionRoles: Array.isArray(req.body?.actionRoles) ? req.body.actionRoles : [],",
      "        eventKey: req.body?.eventKey ?? null,",
      "        refId: req.body?.refId ?? null,",
      "        refLabel: req.body?.refLabel ?? null,",
    );
    console.log("ok: create route keeps module and action roles");
  }
}

fs.writeFileSync(API, lines.join(eol));
console.log("index.ts written");

/* ------------------------------------------------------------------- data --- */

(async () => {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "actionRoles" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
  );
  console.log("applied: actionRoles column");

  /**
   * Re-file the existing action rows. Guessing "needs a decision" from the
   * wording is exactly how the TM's list filled up with other departments' work,
   * so the two families that really are his are named, and the rest are dropped
   * to news.
   */
  const actionRules = [
    { match: /New Delivery Request|Request Submitted/i, roles: ["Transport Manager"] },
    { match: /Request Approved/i, roles: ["Fleet Operations"] },
    { match: /Dispatch Delayed/i, roles: ["Tracking"] },
    { match: /running low/i, roles: ["Transport Manager"] },
    { match: /authoriz/i, roles: ["Transport Manager"] },
    { match: /Awaiting Parts|Part Requested|Requisition/i, roles: ["Transport Manager"] },
  ];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, title, body FROM "Notification" WHERE "actionRequired" = true`,
  );
  for (const row of rows) {
    const rule = actionRules.find((r) => r.match.test(row.title || ""));
    const roles = rule ? rule.roles : [];
    await prisma.$executeRawUnsafe(
      `UPDATE "Notification" SET "actionRoles" = $1, "actionRequired" = $2 WHERE "id" = $3`,
      roles,
      roles.length > 0,
      row.id,
    );
  }
  console.log(`applied: re-filed ${rows.length} action rows by role`);

  const check = await prisma.$queryRawUnsafe(
    `SELECT "actionRoles", COUNT(*)::int AS n FROM "Notification" WHERE "actionRequired" = true GROUP BY "actionRoles" ORDER BY n DESC`,
  );
  console.log("action queues now:", JSON.stringify(check));
  await prisma.$disconnect();
})();
