const fs = require("fs");
const { execSync } = require("child_process");
const path = "/var/www/fleetopsx-api/prisma/schema.prisma";
let text = fs.readFileSync(path, "utf8");

if (!/customer\s+String\?/.test(text)) {
  if (!text.includes("customerConsignee String")) {
    console.error("cannot find customerConsignee");
    process.exit(1);
  }
  text = text.replace(
    "customerConsignee String",
    "customerConsignee String\n  customer          String?",
  );
  fs.writeFileSync(path, text);
  console.log("schema patched");
} else {
  console.log("schema already has customer");
}

console.log(
  text
    .split("model Trip")[1]
    .split("model ")[0]
    .slice(0, 500),
);

execSync("npx prisma db push", { cwd: "/var/www/fleetopsx-api", stdio: "inherit" });
execSync("npx prisma generate", { cwd: "/var/www/fleetopsx-api", stdio: "inherit" });

// Force SQL column
try {
  const env = fs.readFileSync("/var/www/fleetopsx-api/.env", "utf8");
  const m = env.match(/DATABASE_URL=(.+)/);
  if (m) {
    const url = m[1].trim().replace(/^["']|["']$/g, "");
    execSync(
      `psql "${url}" -c 'ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS customer TEXT;'`,
      { stdio: "inherit" },
    );
  }
} catch (e) {
  console.log("psql alter note:", e.message);
}

execSync("pm2 restart fleetopsx-api", { stdio: "inherit" });
console.log("done");
