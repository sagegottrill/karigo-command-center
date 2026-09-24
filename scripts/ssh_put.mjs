/**
 * Uploads a file to the API box and optionally runs a command there.
 *
 *   node scripts/ssh_put.mjs <localPath> <remotePath> [command]
 */
import { NodeSSH } from "node-ssh";

const [, , localPath, remotePath, command] = process.argv;
if (!localPath || !remotePath) {
  console.error("Usage: node scripts/ssh_put.mjs <localPath> <remotePath> [command]");
  process.exit(1);
}

const ssh = new NodeSSH();
await ssh.connect({ host: "2.28.45.216", username: "root", password: "FleetOpsx2026!" });
await ssh.putFile(localPath, remotePath);
console.log("uploaded:", localPath, "->", remotePath);

if (command) {
  const r = await ssh.execCommand(command, { cwd: "/var/www/fleetopsx-api" });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  console.log("exit:", r.code);
}
await ssh.dispose();
