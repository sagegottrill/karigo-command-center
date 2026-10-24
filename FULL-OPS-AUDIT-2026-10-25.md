# Full operations audit — 25 Oct 2026

Scope: the whole surface — web (Vite/TanStack) + API (`/var/www/fleetopsx-api`, PM2 port 3001) + mobile (Expo `pfx-backend`). Method: read-only probes run **on** the live database, code-level audit of every timer and every mutating route, and the fix requests from the front office shipped the same day.

---

## 1. What was audited

| Layer | Surface | Verdict |
|---|---|---|
| DB | 18 lifecycle probes (trips × registry × drivers × users × gate log × fuel × requisitions) | 3 fixes shipped this session |
| Server timers | 5 scheduled/self-writing paths inventoried | 1 tightened earlier, all reviewed |
| Authorization | every mutating route (`POST/PUT/PATCH/DELETE`) | 3 hardened this session |
| Gate stamps | "System (no guard signed)" wording | **killed at all layers (owner request)** |

## 2. The stamp fix — "S.1 Petroline" (owner instruction, 25 Oct 2026)

**The confusion:** the gate security Dispatch Logs could show `System (no guard signed)`,
`System (return sweep)`, `Reconciled …`, `Petroline Security` and `Unsigned` in the
"Logged By" column. The front office read them as a phantom guard or a system actor.

**What was killed:**

1. **Web gate log** (`src/routes/workspace.app.gate.tsx` → `formatGateLogger`): every
   system/bookkeeping stamp *and* every unsigned stamp now reads **S.1 Petroline**.
   Real account names still pass through.
2. **Dashboard guard ledger** (`src/lib/fleetopsx/dashboard-departments.ts` →
   `guardDisplayName`): same rule; `S.1 Petroline` is never *counted* as a guard
   signature (`signed: false` accounting stays honest).
3. **Server sweep** (`backend/index.ts` return sweep): when it auto-closes a stale
   dispatch it now stamps `gateInBy = 'S.1 Petroline'` (was `'System (return sweep)'`).
   The truthful audit stays on each trip's `directCosts.returnedBy` object.
4. **Unsigned fallbacks**: the gate screen and the mobile Security screen write
   `S.1 Petroline` instead of the vague `Security` role word when no account name is
   available.
5. **Database backfill**: 30 departure stamps + 179 return stamps rewritten to
   `S.1 Petroline` (one transactional pass; pre-write copy in
   `backups/gate-stamps-2026-10-24T12-55-49-143Z.json` on the server). After the
   rewrite: **0** residual system stamps. The only stragglers are `E2E TM` marks from
   the e2e suite (test-only, harmless) — cleanup candidate in §6.

## 3. Live database findings (probe 24–25 Oct)

Clean (no action needed):
- Every truck marked `Out of Yard`/`Assigned` has exactly **1 open trip** — except
  one (below). No orphaned outward trucks.
- Drivers "On Trip" all have a matching open dispatch — no stranded drivers.
- No negative fuel/lubricant stock.
- Head/tail registries: 115 heads / 117 tails, none Blocked incorrectly.

Findings (counts live as of 24 Oct):
1. **1 double-assigned truck**: head `P090 (KRD993YM)` holds **2 open trips**. Needs de-dup by the TM.
2. **8 open trips older than 14 days** — created 5–9 Oct, still `Offloading`/`En Route`/`Returning` (Saba Steel, Metalberg). Oldest: `APP863YL / B009` (5 Oct, Offloading, untouched since 16 Oct).
3. **39 open requests have driver "Unassigned"** — that is normal pre-dispatch queue (Requested → Approved → Scheduled), not a fault.
4. **Completed trips previously missing their return time** (`eta` null with `gateInBy` set): root cause found — a Transport Manager completing a run **outside the gate screen** stamps who closed it but not when. Fixed this session: `RETURN-STAMP-ETA` in the trip PATCH path — a non-gate completion now also stamps `eta` with the same moment the gate-account path always did.
5. **Test/e2e accounts active in production** (12 found, incl. `t.store2@`, `t.loading3@`, `e2e.partner@livecheck.io` and one work order `E2E-FIELD-HEAD`). The e2e suite has a cleanup script (`scripts/e2e/e2e_cleanup.cjs`) — run it, then decide the standing rule for test accounts.
6. **GateEntry table nearly unused**: 4 rows total (latest 28 Sep) while 101 trips were gate-in'd over the last 7 days — the gate log lives on `Trip` stamps (`gateOutBy`/`gateInBy`), the `GateEntry` table is historical. Documented here so the discrepancy stops looking like a bug.
7. **28,777 L disbursed over the last 7 days** across 79 rows — sane against the tank; no negative stock. No over-disbursal found.

## 4. Server self-writing paths (audit result)

| Path | Cadence | Writes | Verdict |
|---|---|---|---|
| Login rate-limit bucket cleanup | 2 min | memory only | benign |
| `autoReconcileGateDepartures` (invented departures) | was 3 min | — | **already disabled** (B5) — stays off |
| `syncDriverDuty` | 10 min | driver status word only, never trips/trucks | correct safety net |
| `sweepReturnedTrucks` | 5 min | closes **dormant-only** dispatches (truck home + untouched 12 h), stamps `S.1 Petroline`, frees drivers, homes tails | correct; stamp fixed this session |
| push sender | 10 s | sends pushes, deletes dead tokens | benign |
| chat policy filter | read time | silences abusive text in place | not a writer |

## 5. Authorization audit (what each signed-in role can do)

Healthy overall — role gates on ~75 routes; the trip DELETE, partner sites, fuel desk,
handoffs and gate windows self-gate inside their handlers (partner-company scoping,
`mayWorkFuelDesk`, price-ownership, stock guards, confirm-to-return).

Hardened this session (`backend/index.ts`):
1. `POST /api/inventory-requisitions` — was a raw `req.body` passthrough: any signed-in
   caller could fabricate handoff signatures, `reviewedBy`, forged statuses. Now a
   field whitelist + required-field check (mirrors the PATCH whitelist).
2. `POST /api/fuel` — same passthrough on `FuelRequisition` (invented approvals, costs,
   dates). Now whitelisted with required fields.
3. `POST /api/auth/setup` — unauthenticated bootstrap route, now rate-limited with the
   other credential routes. Note: its default password `Admin@2026` only ever seeds an
   empty DB, but rotate the real admin password anyway.

Open gaps (repo-local, not yet shipped — intentional, needs a decision):
- `POST /api/tracking` on the **live** server allows a `Partner Loader` to confirm only
  the Loading leg (live hotfix present in production and now mirrored into the repo).
- Mobile talks to `http://2.28.45.216/api` — **plain HTTP**: JWTs and passwords cross
  the internet unencrypted. Migrate the API to https on `api.fleetopsx.com` (host for
  it exists) and switch `API_BASE_URL` — recommend doing it before more mobile rollout.

## 6. Recommended next steps (in order)

1. De-duplicate the `P090` truck's two open trips and work the stale 8 (they are
   visible on the Active Dispatch board by date).
2. Run `scripts/e2e/e2e_cleanup.cjs`, then delete the 12 test accounts (or disable login for them).
3. Move the API behind HTTPS and switch the mobile `API_BASE_URL`.
4. Rotate the `admin@fleetopsx.com` password (default `Admin@2026` is in the source).
5. Decide the standing rule: test accounts exist only when the e2e suite is running.

*Probe scripts (read-only): `scripts/audit-live-flow-20261025.cjs`, `-r2.cjs`; the
backfill: `scripts/backfill-s1-petroline-stamps.cjs` (idempotent, runs --dry by flag).*
