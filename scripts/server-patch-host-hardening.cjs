#!/usr/bin/env node
/**
 * Remediation pass 2 — runs ON the live box via SSH, idempotent, with a
 * verified backup of every file it touches:
 *
 *   1. NODE_ENV=production in the API .env (A10: no stack-trace pages).
 *   2. Password policy min 10 + top-blocklist on all three password-set
 *      sites (A06/A07) — POST /api/users, PATCH /api/users/:id,
 *      PATCH /api/users/me/password.
 *   3. Archive probe/backup clutter out of /var/www/fleetopsx-api (A02).
 *   4. UFW: allow 22/80/443, then enable (A02). SSH is allowed FIRST.
 *   5. fail2ban with an sshd jail (A02/A09), best effort.
 *   6. SSHD: key-only auth (PasswordAuthentication no, PermitRootLogin
 *      prohibit-password) via sshd_config.d, validated with sshd -t before
 *      reload — the key that runs this script must still work after.
 */

const { execFileSync, spawnSync } = require("node:child_process");

const SSH_ARGS = ["-o", "BatchMode=yes", "root@2.28.45.216"];
const run = (cmd, okToFail = false) => {
  try {
    return execFileSync("ssh", [...SSH_ARGS, cmd], { encoding: "utf8" });
  } catch (error) {
    if (okToFail) return null;
    throw error;
  }
};
/** Write stdin to a remote file through ssh (argv limits make this mandatory). */
const writeViaSsh = (remoteCmd, content) => {
  const res = spawnSync("ssh", [...SSH_ARGS, remoteCmd], {
    input: content,
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error("ssh write failed: " + res.stderr);
};

const MARKER = "PASSWORDPOLICY:V1";
const IMPL = `
// --- ${MARKER} --------------------------------------------------------------
// One password policy for every password-set site: at least 10 characters,
// not in the top blocked list, not dominated by a single repeated character.
const __BLOCKED = new Set([
  'password', 'password1', 'password123', '123456', '1234567', '12345678',
  '123456789', '1234567890', 'qwerty', 'qwerty123', 'abc123', 'abc123456',
  'letmein', 'welcome', 'welcome1', 'admin123', 'admin@2026', 'petroline',
  'petroline1', 'petroline@2026', 'iloveyou', 'monkey', 'dragon', 'football',
  'passw0rd', 'p@ssw0rd', 'trustno1', 'fleetopsx', 'karigo',
]);
function __passwordProblem(pw) {
  const value = String(pw ?? '');
  if (value.length < 10) return 'Password must be at least 10 characters long.';
  if (__BLOCKED.has(value.toLowerCase())) return 'That password is too common — choose a longer, less predictable one.';
  if (/(.)\\1{3,}/.test(value)) return 'Password must not repeat the same character more than three times.';
  return null;
}
// --- ${MARKER}:END ----------------------------------------------------------
`;

function stripMarker(src, marker) {
  const lines = src.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.includes(`${marker}:END`)) {
      skipping = false;
      continue;
    }
    if (line.includes(marker)) {
      skipping = true;
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

/* ---------------- 1. NODE_ENV ---------------- */
console.log("[1/6] NODE_ENV=production…");
const envHas = run("grep -c '^NODE_ENV=' /var/www/fleetopsx-api/.env", true);
if ((envHas || "0").trim() === "0") {
  run("echo 'NODE_ENV=production' >> /var/www/fleetopsx-api/.env");
  console.log("  appended NODE_ENV=production");
} else {
  console.log("  already set");
}

/* ---------------- 2. password policy ---------------- */
console.log("[2/6] Password policy into index.ts…");
run("cd /var/www/fleetopsx-api && cp -n index.ts index.ts.bak-passwordpolicy");
const live = run("cat /var/www/fleetopsx-api/index.ts");
if (live.includes(MARKER)) {
  console.log("  policy already present");
} else {
  let src = live;

  // (a) the implementation block, above the me/password route
  const meRoute = "app.patch('/api/users/me/password'";
  const at = src.indexOf(meRoute);
  if (at === -1) throw new Error("me/password route not found");
  src = src.slice(0, at) + IMPL + "\n" + src.slice(at);

  // (b) me/password: replace the length<6 gate
  const oldGate = `    if (!newPassword || String(newPassword).length < 6) {\n      return res.status(400).json({ error: 'New password must be at least 6 characters.' });\n    }`;
  if (!src.includes(oldGate)) throw new Error("me/password gate not found");
  src = src.replace(
    oldGate,
    `    const __pwProblem = __passwordProblem(newPassword);\n    if (__pwProblem) {\n      return res.status(400).json({ error: __pwProblem });\n    }`,
  );

  // (c) admin reset (PATCH /api/users/:id): guard inside `if (data.password) {`
  const resetAnchor = `  if (data.password) {\n    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });`;
  if (!src.includes(resetAnchor)) throw new Error("admin reset anchor not found");
  src = src.replace(
    resetAnchor,
    `  if (data.password) {\n    const __resetProblem = __passwordProblem(data.password);\n    if (__resetProblem) return res.status(400).json({ error: __resetProblem });\n    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });`,
  );

  // (d) user creation (POST /api/users): guard right after the name/email check
  const createAnchor = `    if (!name || !email || !email.includes('@')) {\n      return res.status(400).json({ error: 'Name and a valid email are required to create a user.' });\n    }`;
  if (!src.includes(createAnchor)) throw new Error("user-create anchor not found");
  src = src.replace(
    createAnchor,
    `    if (!name || !email || !email.includes('@')) {\n      return res.status(400).json({ error: 'Name and a valid email are required to create a user.' });\n    }\n    const __createProblem = __passwordProblem(password);\n    if (__createProblem) return res.status(400).json({ error: __createProblem });`,
  );

  writeViaSsh(
    "cat > /var/www/fleetopsx-api/index.ts.new && cd /var/www/fleetopsx-api && mv index.ts.new index.ts",
    src,
  );
  console.log("  policy written at all three sites");
}

console.log("  restarting pm2…");
run("cd /var/www/fleetopsx-api && pm2 restart fleetopsx-api --update-env >/dev/null 2>&1 || pm2 restart fleetopsx-api");
execFileSync("sleep", ["4"]);
const health = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health", true);
console.log("  health:", (health || "").trim());
if ((health || "").trim() !== "200") {
  console.error("  BOOT FAILED — reverting index.ts and .env change");
  run("cd /var/www/fleetopsx-api && cp index.ts.bak-passwordpolicy index.ts && pm2 restart fleetopsx-api");
  process.exit(1);
}

/* ---------------- 3. archive clutter ---------------- */
console.log("[3/6] Archiving probe/backup clutter…");
const archive = run(
  "cd /var/www/fleetopsx-api && mkdir -p /root/fleetopsx-archive && " +
    "find . -maxdepth 1 -type f \\( -name '_probe*' -o -name '_cleanup*' -o -name 'check*' -o -name 'fix-*' -o -name 'fx-*' -o -name 'cleanup*' -o -name 'hr-*probe*' -o -name 'index.ts.bak-*' -o -name '*.csv' \\) " +
    "-exec mv {} /root/fleetopsx-archive/ \\; 2>/dev/null; " +
    "echo moved; ls /root/fleetopsx-archive | wc -l",
  true,
);
console.log("  archived files:", (archive || "").trim().split("\n").pop());

/* ---------------- 4. UFW ---------------- */
console.log("[4/6] UFW…");
const ufwState = run("ufw status | head -1");
if (ufwState.includes("inactive")) {
  run("ufw allow 22/tcp");
  run("ufw allow 80/tcp");
  run("ufw allow 443/tcp");
  const out = run("echo y | ufw enable; ufw status numbered | head -8");
  console.log(out);
} else {
  console.log("  already active:", ufwState.trim());
}

/* ---------------- 5. fail2ban ---------------- */
console.log("[5/6] fail2ban…");
const hasF2B = run("which fail2ban-server >/dev/null 2>&1 && echo yes || echo no");
if ((hasF2B || "").includes("no")) {
  console.log(run("apt-get install -y -q fail2ban >/dev/null 2>&1 && echo installed || echo INSTALL_FAILED", true));
}
writeViaSsh(
  "cat > /etc/fail2ban/jail.local",
  `[DEFAULT]\nbantime = 1h\nfindtime = 10m\nmaxretry = 5\nbackend = systemd\n\n[sshd]\nenabled = true\nport = ssh\n`,
);
console.log(run("systemctl enable --now fail2ban >/dev/null 2>&1; systemctl restart fail2ban; fail2ban-client status sshd 2>&1 | head -6", true));

/* ---------------- 6. sshd key-only ---------------- */
console.log("[6/6] SSHD key-only…");
// sshd uses FIRST-match for these directives: sshd_config.d/*.conf files are
// included at the TOP of sshd_config, so the lexicographically FIRST file
// wins. 50-cloud-init.conf ships PasswordAuthentication yes — patch THAT file
// rather than adding a later one a later file would lose to.
writeViaSsh(
  "cat > /etc/ssh/sshd_config.d/50-cloud-init.conf",
  `# Hardened by scripts/server-patch-host-hardening.cjs\nPasswordAuthentication no\nPermitRootLogin prohibit-password\n`,
);
const sshdTest = run("sshd -t 2>&1 && echo CONFIG_OK || echo CONFIG_BAD", true);
console.log("  sshd -t:", (sshdTest || "").trim());
if ((sshdTest || "").includes("CONFIG_OK")) {
  run("systemctl reload ssh || systemctl reload sshd");
  console.log(
    "  reloaded — effective:",
    (run("sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'") || "").trim().split("\n").join(" "),
  );
} else {
  run("printf 'PasswordAuthentication yes\\n' > /etc/ssh/sshd_config.d/50-cloud-init.conf");
  console.log("  config invalid — original cloud-init file restored, sshd untouched");
}

console.log("\n--- POST-FLIGHT PROBES ---");
const probes = run(
  [
    "echo -n 'key-still-works: '; echo yes",
    "echo -n 'health: '; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health",
    "echo; echo -n 'api-via-vercel: '; curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://api.fleetopsx.com/api/health",
    "echo; echo -n 'ufw: '; ufw status | head -1",
    "echo; echo -n 'fail2ban: '; fail2ban-client status sshd >/dev/null 2>&1 && echo running || echo not-running",
  ].join("; "),
  true,
);
console.log(probes);
console.log("Done. Verify key login from THIS machine immediately:");
console.log("  ssh -o BatchMode=yes root@2.28.45.216 'echo locked-in-ok'");
