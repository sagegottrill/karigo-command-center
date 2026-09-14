# FleetOpsX E2E suite (runs against the live VPS after every deploy)

One command, fully isolated, leaves the database exactly as it found it:

```bash
VPS_PASSWORD='...' npm run test:e2e
```

## What it covers (50 checks)

1. **Auth** — login for all 8 roles (Platform Admin, TM, FO, Security/Gate, Tracking, HR, Accounts, external Partner), wrong password, unknown user, unauthenticated request, role scope
2. **Fleet masters** — real trucks/tails/drivers are seeded and selectable (catches empty-table regressions like the tail dropdown bug)
3. **Full lifecycle** — partner creates request → TM approves → FO assigns truck + tail + driver + direct costs → TM schedules → gate logs departure → tracking logs a checkpoint → FO in-transit → gate return → FO completes → partner sees it
4. **Decline path** — TM stops a request
5. **User management** — TM creates a user with the exact UI payload (`firstName`/`surname`/`username`/`companyId`), duplicate rejected with 409, PATCH ignores unknown UI fields (no 500), suspend → login blocked → reactivate → login works → admin delete → login blocked
6. **Password reset** — HR resets a user, server returns a shareable temp password
7. **RBAC spot checks** — gate can't create tails, FO can't create users, HR can list users, etc.
8. **Module smoke** — inventory, tenants, gate entries, trips reads

## How isolation works

- The suite never logs in with a real account. `e2e_prep.cjs` creates dedicated `e2e.*@livecheck.io` accounts (one per role, tenant `tnt_001` for the partner) with password `FleetOpsx2026!`.
- All trips use consignee names starting with `LIVECHECK `/`E2E ` and tails starting with `LIVEB`, so cleanup can find them.
- `e2e_cleanup.cjs` deletes every E2E account, trip, checkpoint, gate row, and stray tail — plus run-noise notifications and login reports — then prints the final table counts. The runner verifies zero `livecheck.io` users remain.
- A pre-E2E DB backup (`/root/fleetopsx_pre_e2e.sql.gz` on the VPS) is kept as the rollback point.

## Files

- `run_e2e.sh` — uploads the suite, preps accounts, runs, cleans up, verifies. `npm run test:e2e`
- `e2e_suite.sh` — the 50-check suite itself (bash + curl, runs on the VPS against `localhost:3001`)
- `e2e_prep.cjs` / `e2e_cleanup.cjs` — Prisma scripts for account setup and artifact removal

The API server's deployed source and Prisma schema are snapshotted in the repo as
`src/lib/fleetopsx/index.ts.remote` and `src/lib/fleetopsx/schema.prisma.remote`
(the server is hand-patched per this project's workflow; keep those in sync so a
redeploy can't regress live fixes).
