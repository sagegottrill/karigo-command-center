/**
 * Uploads a file to the API box and optionally runs a command there.
 *
 *   node scripts/ssh_put.mjs <localPath> <remotePath> [command]
 */
import { NodeSSH } from "node-ssh";
import { homedir } from "node:os";
import { join } from "node:path";

const [, , localPath, remotePath, command] = process.argv;
if (!localPath || !remotePath) {
  console.error("Usage: node scripts/ssh_put.mjs <localPath> <remotePath> [command]");
  process.exit(1);
}

const ssh = new NodeSSH();
// CREDENTIALS-OFF-REPO (bugfix B3): the production root password used to live
// right here in the repository. Connect with the operator's SSH key instead; a
// different host/key can be provided per environment below. The server-side
// password should be rotated (it is already exposed) and must never be
// committed again.
const sshKeyFile =
  process.env.FLEETOPSX_SSH_KEY || join(homedir(), ".ssh", "id_ed25519");
const sshPassword = process.env.FLEETOPSX_SSH_PASSWORD || undefined;
await ssh.connect({
  host: process.env.FLEETOPSX_HOST || "2.28.45.216",
  username: process.env.FLEETOPSX_USER || "root",
  ...(sshPassword ? { password: sshPassword } : undefined),
  ...(sshPassword ? {} : { privateKey: sshKeyFile }),
});
await ssh.putFile(localPath, remotePath);
console.log("uploaded:", localPath, "->", remotePath);

if (command) {
  const r = await ssh.execCommand(command, { cwd: "/var/www/fleetopsx-api" });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  console.log("exit:", r.code);
}
await ssh.dispose();
