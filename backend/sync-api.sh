#!/usr/bin/env bash
#
# The link between the API source in this repo and the API running on the VPS.
# The host has no git checkout — this script IS the connection.
#
#   ./backend/sync-api.sh pull     server → repo (then: git diff)
#   ./backend/sync-api.sh push     repo → server (backup, syntax-check, restart, health)
#   ./backend/sync-api.sh smoke    run the live fuel-desk smoke test
#   ./backend/sync-api.sh logs     last 40 lines of the API's own logs
#
# NOTE: named `backend/`, not `server/`, to stay clear of TanStack Start's SSR
# entry (vite.config.ts: `server: { entry: "server" }` → src/server.ts).
# (A failing Vercel deploy on 2026-10-03 was NOT this folder — it was the
# @tanstack/react-start advisory gate; see API-DEPLOY.md.)
#
set -euo pipefail

HOST="${FLEETOPSX_HOST:-root@2.28.45.216}"
KEY="${FLEETOPSX_KEY:-$HOME/.ssh/id_ed25519}"
DIR="${FLEETOPSX_API_DIR:-/var/www/fleetopsx-api}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCP=(scp -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$HOST")

case "${1:-}" in
  pull)
    "${SCP[@]}" "$HOST:$DIR/index.ts" "$HERE/index.ts"
    "${SCP[@]}" "$HOST:$DIR/prisma/schema.prisma" "$HERE/prisma/schema.prisma"
    echo "pulled from $HOST:$DIR — run 'git diff backend/' to see what the live API changed"
    ;;

  push)
    "${SSH[@]}" "cp $DIR/index.ts $DIR/index.ts.bak-\$(date +%Y%m%d-%H%M%S)"
    "${SCP[@]}" "$HERE/index.ts" "$HOST:$DIR/index.ts"
    # Syntax first — a file esbuild rejects never reaches the restart.
    "${SSH[@]}" "cd $DIR && node_modules/.bin/esbuild index.ts --target=node20 --outfile=/tmp/idx.check.js >/dev/null && echo SYNTAX_OK"
    "${SSH[@]}" "cd $DIR && pm2 restart fleetopsx-api --update-env >/dev/null && sleep 6 && curl -s -m 10 -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:3001/api/health"
    ;;

  smoke)
    "${SSH[@]}" "cd $DIR && node scripts/smoke-fueldesk.cjs --read"
    ;;

  logs)
    "${SSH[@]}" "pm2 logs fleetopsx-api --nostream --lines 40"
    ;;

  *)
    echo "usage: $0 pull | push | smoke | logs" >&2
    exit 1
    ;;
esac
