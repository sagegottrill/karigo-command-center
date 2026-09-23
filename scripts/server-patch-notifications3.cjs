/**
 * Server patch 3: the summary needs the SIZE of a reader's queue, not just how
 * much of it is unread.
 *
 * `action` counts the unread rows that name the reader, which is right for a
 * badge and wrong for a filter chip: the Transport Manager's "Needs me" list
 * holds every request that names him (read or not), so the chip said 9 while the
 * list behind it said 72. `actionAll` is that number, and the chip opens the
 * list it matches.
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const API = "/var/www/fleetopsx-api/index.ts";
const eol = fs.readFileSync(API, "utf8").includes("\r\n") ? "\r\n" : "\n";
let lines = fs.readFileSync(API, "utf8").split(/\r?\n/);
const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};
const already = (needle) => lines.some((l) => l.includes(needle));

/** Replace a line that must match exactly, and say which line it was. */
const swapLine = (from, to, label) => {
  const i = lines.findIndex((l) => l === from);
  must(i !== -1, `${label} (looking for: ${from.trim()})`);
  lines.splice(i, 1, ...(Array.isArray(to) ? to : [to]));
  console.log("ok: " + label);
};
const insertAfterLine = (after, block, label) => {
  const i = lines.findIndex((l) => l === after);
  must(i !== -1, `${label} anchor`);
  lines.splice(i + 1, 0, ...block);
  console.log("ok: " + label);
};
const insertBeforeLine = (before, block, label) => {
  const i = lines.findIndex((l) => l === before);
  must(i !== -1, `${label} anchor`);
  lines.splice(i, 0, ...block);
  console.log("ok: " + label);
};

if (already("actionAll")) {
  console.log("ok: actionAll already present");
} else {
  // 1 — the bucket carries the queue size as well as its unread part.
  swapLine(
    "  const byModule: Record<string, { module: string; total: number; unread: number; action: number }> = {};",
    [
      "  const byModule: Record<",
      "    string,",
      "    { module: string; total: number; unread: number; action: number; actionAll: number }",
      "  > = {};",
    ],
    "bucket type",
  );

  // 2 — the running total.
  insertAfterLine("  let action = 0;", ["  let actionAll = 0;"], "actionAll counter");

  // 3 — a new module's bucket starts at zero.
  insertAfterLine("      action: 0,", ["      actionAll: 0,"], "bucket seed");

  // 4 — count every row that names the reader, not only its unread ones.
  insertBeforeLine(
    "    if (needsMe && !isRead) {",
    ["    // The queue itself, not only the part of it still unread."],
    "actionAll comment",
  );
  insertAfterLine("    // The queue itself, not only the part of it still unread.", ["    if (needsMe) actionAll += 1;"], "top-level tally");
  insertAfterLine("      bucket.action += 1;", ["      bucket.actionAll += 1;"], "bucket tally");

  // 5 — and it is answered.
  insertAfterLine("    action,", ["    actionAll,"], "summary response");
}

fs.writeFileSync(API, lines.join(eol));
console.log("index.ts written");

try {
  execFileSync("npx", ["esbuild", API, "--outfile=/tmp/_syntax-check.js"], { stdio: "pipe" });
  console.log("ok: index.ts compiles");
  fs.unlinkSync("/tmp/_syntax-check.js");
} catch (error) {
  const out = String(error.stdout || "") + String(error.stderr || "");
  console.error("FAIL: index.ts does not compile:\n" + out.split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}
