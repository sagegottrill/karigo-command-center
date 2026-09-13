const fs = require('fs');
const files = [
  'src/components/fleetopsx/fleet-operations-sidebar.tsx',
  'src/components/fleetopsx/gate-security-sidebar.tsx',
  'src/components/fleetopsx/tracking-operations-sidebar.tsx',
  'src/components/fleetopsx/transport-admin-sidebar.tsx',
  'src/components/fleetopsx/app-sidebar.tsx',
  'src/routes/superadmin.index.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Add import if needed
  if (!content.includes('import { hardLogout }')) {
    content = content.replace(/import \{.*?\} from "@\/lib\/fleetopsx\/services";/, match => match + '\nimport { hardLogout } from "@/lib/fleetopsx/session";');
    changed = true;
  }

  // Replace authService.logout() with hardLogout()
  if (content.includes('authService.logout();')) {
    content = content.replace(/authService\.logout\(\);\s*(navigate\(\{ to: "\/workspace\/login" \}\);)?/g, 'hardLogout("/workspace/login");');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}
