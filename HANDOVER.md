# FleetOpsX — Petroline Transport Ltd

Handover pack. This document is written for the customer's IT team: what the
system is, where it runs, how to operate and deploy it, and what is still open.
No credentials are written here — they are handed over separately.

---

## 1. What this is

One web application covering the operating life of a haulage business, from a
customer's request to the money it cost, plus a partner portal for the customers
and yards the fleet serves.

| Area | What the department does in it |
|---|---|
| **Partner Portal (external)** | Customers raise requests, track their trucks, ask to change a load, message the haulier. Loader partners see the yard they run and sign trucks off as loaded. |
| **Transport Manager** | The control desk: approves requests and vouchers, allocates trucks/tails/drivers, sets fuel prices, approves restocks, sees every alert. |
| **Fleet Operations** | Dispatch board, driver and asset registers, tracking, gate movements. |
| **Security / Gate** | Logs trucks out and back in; a return frees the driver and the vehicle. |
| **Loading Operations** | Marks a truck loaded at the yard it is bound to. |
| **Engineering / Workshop** | Check-ups and work orders; raises part requests. |
| **Head of Engineering** | Validates engineering part requests before the TM sees them. |
| **Parts & Store** | The shelf: stock lines, issue parts against a signed ticket, print the collection evidence, receive deliveries, count stock. |
| **Procurement** | Buys what the store is short of, raises restock requests for the TM to approve, requests procurement from the store. |
| **Lubricant / Fuel** | Diesel and gas tanks, per-dispatch disbursals, TM review of every dispense. |
| **Accounts** | Disbursements against a dispatch's cost sheet. |
| **HR / Admin** | Staff, roles, departments, accounts, tenant settings. |
| **Platform Admin** | Above a single tenant: tenants, domains, platform-wide settings. |

Roles are additive: one account can hold several departments, and the workspace
rail shows only the departments that account holds.

---

## 2. The shape of the system

```
Browser ──► Web app (TanStack Start / React, SSR)  ──►  REST API (Express + Prisma)
                                                            │
                                                            └─► PostgreSQL
```

* **Web app** — `karigo-command-center/`. TanStack Start (React 19 + Vite), file
  based routes under `src/routes/`, shared UI in `src/components/fleetopsx/`,
  API clients and domain helpers in `src/lib/fleetopsx/`. Built to a Node server
  with `NITRO_PRESET=node-server npm run build`.
* **API** — a single Express application (`backend/index.ts`, mirrored live as
  `/var/www/fleetopsx-api/index.ts`) using Prisma against PostgreSQL. Every route
  is under `/api/…`. Authentication is a JWT bearer token; authorisation is
  per-route role checks plus tenant scoping on every query.
* **Database** — PostgreSQL, schema in `backend/prisma/schema.prisma`. The live
  database is migrated with plain SQL files in `backend/migrations/` (see §5).

Source is in two GitHub repositories (same tree, two remotes):
`origin` → `sagegottrill/karigo-command-center`,
`fleetopsx-frontend` → `sagegottrill/FleetOpsX-Frontend`.

---

## 3. Where it runs

| Piece | Host | Path | Process | Port |
|---|---|---|---|---|
| Web | the VPS handed over | `/var/www/fleetopsx-web` | PM2 app `fleetopsx-web` | 3000 |
| API | same VPS | `/var/www/fleetopsx-api` | PM2 app `fleetopsx-api` (`npx tsx index.ts`) | 3001 |

Both sit behind the reverse proxy that terminates TLS for the customer's domain.
`pm2 list`, `pm2 logs fleetopsx-api`, `pm2 restart fleetopsx-web` are the day-to-day
commands. `backend/API-DEPLOY.md` carries the same detail for the API.

### Environment (values not included here)

`/var/www/fleetopsx-api/.env` — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`,
`NODE_ENV`, plus any mail/SMS credentials configured for that tenant.
The web build reads its API base URL from the build environment.

**Back up `JWT_SECRET` with the database.** Rotating it signs every user out.

---

## 4. Operating it

* **Sign-in** — `/workspace/login`, by staff email/username and password, with the
  department selected when an account holds more than one. First sign-in forces a
  password change.
* **Passwords** — self-service from Manage Account; an administrator can reset an
  account from HR / Admin.
* **Adding people** — HR / Admin → Staff. Assign departments there; the person
  sees exactly those departments when they sign in.
* **Partner accounts** — Add Partner creates the external account and the company
  it belongs to. A "Partner Loader" is bound to the yard(s) it runs; a loader can
  only mark loads at its own yard, which the API enforces.
* **Notifications** — the bell in the header. Rows are addressed by department and,
  where relevant, by the role that must act (e.g. restock approvals go to the
  Transport Manager only).

---

## 5. Deploying a change

### Web

```bash
cd karigo-command-center
NITRO_PRESET=node-server npm run build
cd .output && tar czf /tmp/web-deploy.tar.gz nitro.json server public
scp /tmp/web-deploy.tar.gz root@<vps>:/tmp/
ssh root@<vps> 'cd /var/www/fleetopsx-web && tar xzf /tmp/web-deploy.tar.gz && pm2 restart fleetopsx-web'
```

### API

```bash
scp karigo-command-center/backend-live/index.ts root@<vps>:/var/www/fleetopsx-api/index.ts
ssh root@<vps> 'cd /var/www/fleetopsx-api && cp index.ts index.ts.bak-$(date +%s) && pm2 restart fleetopsx-api'
curl -s https://<api-host>/api/health
```

`backend/sync-api.sh push` does the same with a syntax check and a timed backup
in front of it.

### A schema change

1. Edit `backend/prisma/schema.prisma` and add a numbered SQL file under
   `backend/migrations/` (additive where possible).
2. On the server: apply the SQL with `psql "${DATABASE_URL%%\?*}" -f migrations/<file>.sql`.
3. Regenerate the client **with the schema path**:
   `node_modules/.bin/prisma generate --schema prisma/schema.prisma`
   (without `--schema` it can generate a client missing the new models).
4. Restart the API and check `/api/health`.

### Backups

Nightly `pg_dump` of the database plus a copy of the API `.env` is sufficient.
Both are restore-able into a fresh VPS following §3–§5.

---

## 6. What is deliberately enforced in the server

Business rules that a client cannot talk its way around:

* A truck's loading site is its own: a loader may only mark loads at its yard.
* Parts leave the shelf only through a signed handoff (the mechanic's signature is
  required, and it is what the printed collection note carries).
* Stock only goes **up** through a Transport-Manager-approved restock; a stock
  increase typed into an inventory edit is refused for every other role.
* Restock requests cannot be approved by the person who raised them, and one line
  can only have one live request.
* A dispatch's money is only moved by Accounts capture and TM voucher decisions.
* Fuel and gas disbursals never carry a cost from the browser — the server prices
  them from the TM's rate.
* Partner accounts see their own company's dispatches, never the fleet's.

---

## 7. Known gaps / recommended next steps

1. **Bulk Excel import and store delivery receipts still set shelf numbers
   directly.** They are "goods received" rather than "the desk decided to buy", so
   they bypass the restock approval. If the customer wants the TM in front of those
   too, route them through the restock request.
2. **The mobile app is a separate build** and is not in these repositories. Its
   screens read the same API, so server-side rules apply to it — but any change to
   a phone screen has to be made in that project.
3. **Bulk notification backlog.** Long-running tenants accumulate thousands of
   rows; a retention window (or archiving older than N months) will keep the bell
   fast. Recommended before go-live if the history is imported.
4. **Email/SMS sending** depends on credentials the customer supplies; without them
   notifications are in-app only.
5. **Automated tests** cover the navigation contract only (`npm run test:unit`) plus
   a scripted end-to-end smoke (`npm run test:e2e`). The business flows were
   verified by hand against the live deployment; a regression suite for the money
   paths would be the first investment after handover.
6. **Single VPS.** No staging environment. A staging copy on a second host is the
   cheapest insurance for schema changes.

---

## 8. Walkthrough agenda (customer IT, ~60 minutes)

1. **Tenancy and sign-in** (10 min) — domain routing, staff vs partner accounts,
   departments as permissions, first-login password change.
2. **A dispatch end to end** (15 min) — customer raises → TM approves/allocates →
   gate logs out → loading site marks loaded → gate logs return → dispatch closes,
   driver freed, costs posted.
3. **Money path** (10 min) — TM voucher decision, Accounts capture, where the cost
   of a trip appears.
4. **Store room** (10 min) — stock line, engineering part request → HOE → TM →
   store issues against a signature and prints the collection note → issue history.
5. **Procurement** (10 min) — low-stock alert, restock request, TM approval, shelf
   revaluation by weighted average; procurement request to vendor.
6. **Operations** (10 min) — PM2 commands, `.env`, backup/restore, deploying a
   change, applying a migration, health check.
7. **Questions and access handover** — repository access, VPS access, database
   credentials, domain/DNS, third-party accounts.
