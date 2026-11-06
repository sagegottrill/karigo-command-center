#!/usr/bin/env bash
# FleetOpsX backup: push every branch/tag to both remotes, then archive the
# code (with history) into ../backups, with a sha256 beside it.
#
# Run from anywhere inside the repo:  bash scripts/backup-push.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M)"
OUT="$ROOT/../backups"
mkdir -p "$OUT"

if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  echo "REFUSING: tracked changes are uncommitted. Commit them first:" >&2
  git status --short | grep -v '^??' >&2
  exit 1
fi

for remote in $(git remote); do
  echo "→ pushing $remote"
  git push "$remote" --all
  git push "$remote" --tags --force-with-lease 2>/dev/null || git push "$remote" --tags
done

# code + full history, without anything npm can reinstall or the build emits
tar -czf "$OUT/fleetopsx-full-$STAMP.tgz" \
  --exclude=node_modules --exclude=.output --exclude=.nitro \
  --exclude=dist --exclude=tmp --exclude=.tmpdev \
  --exclude=.live-pull-20261102 --exclude=design --exclude=figma-ref \
  -C "$ROOT/.." "$(basename "$ROOT")"

# code only (no .git) — smaller, for review copies
tar -czf "$OUT/fleetopsx-source-$STAMP.tgz" \
  --exclude=node_modules --exclude=.output --exclude=.nitro --exclude=.git \
  --exclude=dist --exclude=tmp --exclude=.tmpdev \
  --exclude=.live-pull-20261102 --exclude=design --exclude=figma-ref \
  -C "$ROOT/.." "$(basename "$ROOT")"

(cd "$OUT" && sha256sum "fleetopsx-full-$STAMP.tgz" "fleetopsx-source-$STAMP.tgz" > "fleetopsx-$STAMP.sha256")

echo
echo "backup written:"
ls -lh "$OUT"/fleetopsx-*"$STAMP"* 
