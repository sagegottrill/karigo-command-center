// One-off guard patch: make window.location reads SSR-safe on two pages
// (same fix add-partner.tsx already has). Idempotent: skips if already guarded.
const fs = require('fs');
const edits = [
  {
    file: 'src/routes/workspace.app.manage-partner.tsx',
    needle: 'Login at: ${window.location.origin}/workspace/customer-portal/login`;',
    repl: 'Login at: ${loginOriginSSRSafe()}/workspace/customer-portal/login`;',
  },
  {
    file: 'src/routes/workspace.app.add-account.tsx',
    needle: 'Login at: ${window.location.origin}/workspace/login`;',
    repl: 'Login at: ${loginOriginSSRSafe()}/workspace/login`;',
  },
];
for (const { file, needle, repl } of edits) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('loginOriginSSRSafe')) {
    console.log(`SKIP (already guarded): ${file}`);
    continue;
  }
  if (!src.includes(needle)) {
    console.log(`MISSING needle in ${file} — abort`);
    process.exit(1);
  }
  src = src.replace(needle, repl);
  const helper = [
    '// window.location here faults the server render (the hydration trap add-partner fixed):',
    '// guard so SSR renders the shell and the browser owns the real origin.',
    'function loginOriginSSRSafe(): string {',
    '  return typeof window === "undefined" ? "" : window.location.origin;',
    '}',
    '',
  ].join('\n');
  const marker = 'const shareText =';
  const idx = src.indexOf(marker);
  if (idx < 0) {
    console.log(`NO shareText anchor in ${file} — abort`);
    process.exit(1);
  }
  src = src.slice(0, idx) + helper + src.slice(idx);
  fs.writeFileSync(file, src);
  console.log(`PATCHED: ${file}`);
}
