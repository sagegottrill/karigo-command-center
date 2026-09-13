import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error('Usage: node ssh_run.mjs "command"');
    process.exit(1);
  }

  try {
    await ssh.connect({
      host: '2.28.45.216',
      username: 'root',
      password: 'vRNVKHXevpnPTPajVreK'
    });

    const result = await ssh.execCommand(cmd, { cwd: '/var/www/fleetopsx-api' });
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    
    process.exit(result.code === null ? 0 : result.code);
  } catch (err) {
    console.error('SSH connection failed:', err);
    process.exit(1);
  }
}

main();
