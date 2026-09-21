#!/usr/bin/env node
/**
 * Dev-only DOM probe: drive a headless Chrome over CDP, then run an arbitrary
 * expression in the page and print the JSON result.
 *
 * Usage:
 *   node scripts/probe.cjs <url> <expression-file|expression> [--w 1440] [--h 1000]
 *   node scripts/probe.cjs <url> --seed [<expr>]      # sign in first, then probe /workspace/app
 *
 * Chromium's --screenshot fires on `load`, which is far too early for this app
 * (everything is client-rendered from live API calls), so both screenshotting
 * and measuring have to go through CDP with an explicit wait.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const args = process.argv.slice(2);
const url = args[0];
const rest = args.slice(1);
const width = Number(rest.includes("--w") ? rest[rest.indexOf("--w") + 1] : 1440);
const height = Number(rest.includes("--h") ? rest[rest.indexOf("--h") + 1] : 1000);
const shotAt = rest.includes("--shot") ? rest[rest.indexOf("--shot") + 1] : null;
let expression = rest.find((a) => !a.startsWith("--") && a !== String(width) && a !== String(height) && a !== shotAt);

if (!url || !expression) {
  console.error("usage: node scripts/probe.cjs <url> '<expr>' [--w 1440] [--h 1000] [--shot out.png]");
  process.exit(1);
}
if (fs.existsSync(expression)) expression = fs.readFileSync(expression, "utf8");

const PORT = 9700 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(pathname, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`, { method });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${pathname} -> ${text.slice(0, 120)}`);
  }
}

async function main() {
  let version;
  for (let i = 0; i < 60; i++) {
    try {
      version = await getJson("/json/version");
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error("chrome did not open a debug port");

  const target = await getJson("/json/new?about:blank", "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || "evaluate failed");
    }
    return r.result?.value;
  };

  // `--seed` signs in through the same-origin API and writes the keys apiClient
  // reads, so a probe can target a real authenticated page with no helper page
  // shipped in `public/` (which would otherwise deploy to production).
  if (rest.includes("--seed")) {
    const origin = new URL(url).origin;
    await send("Page.navigate", { url: `${origin}/` });
    await sleep(2500);
    const seeded = await evaluate(`
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "manager@petroline.ng", password: "Petroline@2026" }),
      });
      const body = await res.json();
      if (!res.ok || !body.token) return "login failed: " + (body.error || res.status);
      localStorage.setItem("fleetopsx_token", body.token);
      localStorage.setItem("fleetopsx_user", JSON.stringify(body.user));
      localStorage.setItem("fleetopsx_user_id", body.user.id);
      localStorage.setItem("fleetopsx_roles", JSON.stringify(body.user.roles || []));
      if (body.user.name) localStorage.setItem("fleetopsx_user_name", body.user.name);
      if ((body.user.roles || [])[0]) localStorage.setItem("fleetopsx_active_role", body.user.roles[0]);
      return "seeded";
    `);
    if (seeded !== "seeded") throw new Error(String(seeded));
  }

  await send("Page.navigate", { url });
  await sleep(3500);

  const result = await evaluate(expression);
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));

  if (shotAt) {
    const metrics = await send("Page.getLayoutMetrics");
    const full = metrics.cssContentSize || metrics.contentSize;
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.min(Math.ceil(full.height), 7000), scale: 1 },
    });
    fs.writeFileSync(path.resolve(shotAt), Buffer.from(shot.data, "base64"));
  }

  ws.close();
  chrome.kill();
}

main()
  .catch((err) => {
    console.error("probe failed:", err.message);
    chrome.kill();
    process.exit(1);
  })
  .finally(() => {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  });
