# The API behind FleetOpsx / Petroline (how it lives and how it ships)

`server/` is a **mirror** of the API that actually runs on the VPS. The API host
has no git checkout — this folder is where the backend code gets a history, so
it can be read, diffed and reviewed like the frontend.

* Host: `root@2.28.45.216` (ubuntu-8gb-fsn1-1, Falkenstein)
* Path: `/var/www/fleetopsx-api`
* Process: PM2 app `fleetopsx-api` (fork mode, `npx tsx index.ts`), port 3001
* Public: https://api.fleetopsx.com
* Env: `/var/www/fleetopsx-api/.env` (DATABASE_URL, JWT_SECRET, CORS_ORIGINS, NODE_ENV)

## Sync

```bash
./server/sync-api.sh pull     # server → repo (then `git diff` to see what changed)
./server/sync-api.sh push     # repo → server: backup, syntax-check, restart, health
./server/sync-api.sh smoke    # run the fuel-desk smoke test against the live API
```

`push` backs the live file up to `index.ts.bak-<timestamp>` first and refuses to
restart when esbuild rejects the file, so a bad edit cannot take the API down.

## Deploying a schema change — read this first

The database is migrated by hand (no `prisma migrate` history on the host), so:

```bash
# 1. From the repo: edit prisma/schema.prisma, then see EXACTLY what the DB is
#    missing. This is read-only and always safe:
ssh root@2.28.45.216
cd /var/www/fleetopsx-api && set -a && . ./.env && set +a
node_modules/.bin/prisma migrate diff \
  --from-url "${DATABASE_URL%%\?*}" \
  --to-schema-datamodel prisma/schema.prisma --script
```

* `-- This is an empty migration.` → the file matches the DB. Nothing to do.
* Anything else → apply **only the statements you intend** (a `CREATE TABLE`,
  an `ADD COLUMN`) with `psql`, then write them into `server/migrations/`.

**Never run `prisma db push` on this database.** On 2026-10-03 it wanted to
`DROP COLUMN` four live `LubricantDisbursal` columns (`status`, `reviewedBy`,
`reviewedAt`, `reviewNote`) that the schema file was missing — the Transport
Manager's disbursal review. The schema has since been corrected to mirror them,
and the diff is empty, but the lesson stands: **diff first, apply by hand.**

```bash
# 2. Apply a migration file
cd /var/www/fleetopsx-api && set -a && . ./.env && set +a
psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f migrations/<file>.sql

# 3. Regenerate the client and restart ONLY when the schema changed
node_modules/.bin/prisma generate
pm2 restart fleetopsx-api --update-env
```

`psql` rejects Prisma's `?schema=public` suffix — strip it with `${DATABASE_URL%%\?*}`.

## Checking a deploy

```bash
node scripts/smoke-fueldesk.cjs --read      # health of the fuel-desk endpoints
curl -s https://api.fleetopsx.com/api/health
pm2 logs fleetopsx-api --nostream --lines 40     # (plain `pm2 logs` never exits)
```

`smoke-fueldesk.cjs --write` exercises raise → clear → dispense (and the
double-dispense guard) and `--cleanup` removes the test row, restores the tank
and deletes the alerts it created. Leave the yard with no test data.
