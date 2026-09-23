/**
 * Upload a local file to the API box. The base64-over-argv route the earlier
 * patches used breaks once a script grows past the command-line limit, so large
 * patches go over SFTP instead.
 *
 * Usage: node scripts/ssh_put.mjs <local-path> <remote-path>
 */
import { NodeSSH } from "node-ssh";

const [local, remote] = process.argv.slice(2);
if (!local || !remote) {
  console.error("Usage: node scripts/ssh_put.mjs <local-path> <remote-path>");
  process.exit(1);
}

const ssh = new NodeSSH();
await ssh.connect({ host: "2.28.45.216", username: "root", password: "FleetOpsx2026!" });
try {
  await ssh.putFile(local, remote);
  console.log(`uploaded ${local} -> ${remote}`);
} finally {
  await ssh.dispose();
}
