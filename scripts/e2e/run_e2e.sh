#!/bin/bash
# Runs the full FleetOpsX E2E suite against the production VPS.
# Usage:   VPS_PASSWORD='...' npm run test:e2e
# Env:     VPS_PASSWORD (required, unless SSH keys are set up — then drop the askpass bits)
#          VPS_HOST (default 2.28.45.216)
#
# What it does:
#   1. Uploads scripts/e2e/* to /var/www/fleetopsx-api/e2e/
#   2. Creates isolated e2e.*@livecheck.io role accounts (real accounts untouched)
#   3. Runs e2e_suite.sh (50 checks: auth, lifecycle, user mgmt, RBAC, smoke)
#   4. Deletes every E2E artifact — DB is left exactly as it was
set -e
cd "$(dirname "$0")/.."

VPS_HOST="${VPS_HOST:-2.28.45.216}"
API_DIR="/var/www/fleetopsx-api"
APP_URL="https://petrolline.fleetopsx.com"

if [ -n "$VPS_PASSWORD" ]; then
  # Password auth via askpass helper (no password ever lands in argv or files)
  askpass="$(mktemp)"
  printf '#!/bin/sh\necho "$VPS_PASSWORD"\n' > "$askpass"
  chmod +x "$askpass"
  export SSH_ASKPASS="$askpass" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 GIT_TERMINAL_PROMPT=0
  SSH() { setsid ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 "root@$VPS_HOST" "$@"; }
  SCP() { setsid scp -o StrictHostKeyChecking=no "$@"; }
else
  SSH() { ssh -o ConnectTimeout=15 "root@$VPS_HOST" "$@"; }
  SCP() { scp "$@"; }
fi

echo "==> Uploading E2E suite to $VPS_HOST"
SSH "mkdir -p $API_DIR/e2e"
SCP scripts/e2e/e2e_prep.cjs scripts/e2e/e2e_cleanup.cjs scripts/e2e/e2e_suite.sh "root@$VPS_HOST:$API_DIR/e2e/"

echo "==> Preparing isolated E2E accounts"
SSH "cd $API_DIR && node e2e/e2e_prep.cjs"

echo "==> Running E2E suite"
set +e
SSH "cd $API_DIR && BASE=http://localhost:3001 bash e2e/e2e_suite.sh"
SUITE_RC=$?
set -e

echo "==> Cleaning up all E2E artifacts"
SSH "cd $API_DIR && node e2e/e2e_cleanup.cjs"

# Sanity: app reachable through its public URL, no leftover E2E users
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$APP_URL/api/health")
echo "==> $APP_URL/api/health -> $STATUS"
LEFTOVER=$(SSH "cd $API_DIR && node -e \"const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{email:{contains:'livecheck.io'}}}).then(c=>{console.log(c);return p.\\\$disconnect()})\"")
if [ "$LEFTOVER" != "0" ]; then echo "WARNING: $LEFTOVER E2E accounts remain — run cleanup again"; fi

if [ $SUITE_RC -ne 0 ]; then echo "E2E FAILED (suite rc=$SUITE_RC)"; exit 1; fi
echo "E2E PASSED"
