# FleetOpsX / Karigo — Agent Handoff

> **Purpose:** Bring the next agent up to speed immediately.  
> **Update rule:** After every `git push`, update the **Progress log** and **Where we stopped** sections in this file, then commit + push again with the product change (or a tiny follow-up commit).  
> **Secrets:** Live passwords / SSH / tokens live only in `AGENT_SECRETS.local.md` (gitignored). Copy from `AGENT_SECRETS.example.md`. Never commit real secrets.

---

## What we are trying to achieve

1. **Pixel-match the Figma Admin board** (`FleetOpsX--Copy-`) onto the live Petroline Transport Manager Portal, **frame by frame**.
2. **Live API only in production** — Figma supplies layout/copy/tokens; rows and counts come from Hetzner (`/api/*`). Never paste Figma dummy names (Kim Lee, Saba Steel, REQ-85126) into production UI.
3. **Figma sidebar is THE sidebar** for all `/workspace/app*` (Overview first, not “Central Dashboard”). Modules not on Figma go under foldable **More**.
4. **Push after each frame** so `petrolline.fleetopsx.com` (Vercel) stays current. Agent git often hangs on this Windows machine — user’s PowerShell works.

---

## Stack & hosts

| Piece | Detail |
|--------|--------|
| Repo | `https://github.com/sagegottrill/karigo-command-center` (public) |
| Local path | `C:\Users\BICTDA001\Music\SAGE\karigo` |
| Frontend | TanStack Start + Vite + React + TS |
| Domain code | `src/lib/fleetopsx/` |
| UI | `src/components/fleetopsx/` |
| Routes | `src/routes/workspace.app*.tsx` |
| Deploy | Vercel Hobby → rewrite `/api/:path*` → `http://2.28.45.216/api/:path*` (`vercel.json`) |
| Backend | Hetzner `2.28.45.216`, Express + Prisma + Postgres, PM2 `fleetopsx-api`, path `/var/www/fleetopsx-api` |
| Tenant | Petroline `tnt_001`, slug **`petrolline`**, host `petrolline.fleetopsx.com` |
| Mock gate | Live unless `VITE_USE_MOCK=true` (`allowMockFallback` in `apiClient.ts`) |

---

## Credentials & secrets (locations only)

| Secret | Where it lives |
|--------|----------------|
| App logins, VPS SSH password, API notes | **`AGENT_SECRETS.local.md`** (gitignored; not in git) |
| Template | `AGENT_SECRETS.example.md` |
| Env vars | `.env*` (already gitignored) |

**Do not** put passwords, SSH passwords, API keys, or tokens in this file or any committed path.

---

## Figma connection (MCP method)

### File

- URL: https://www.figma.com/design/lj4rA7VMJm03PZOBQyysRL/FleetOpsX--Copy-?node-id=42-1482  
- `fileKey`: `lj4rA7VMJm03PZOBQyysRL`  
- Board / Design Screens: `42:1482`

### Mandatory workflow (design → code)

1. **Read skill first:** `.cursor` / plugin skill `figma-design-to-code` (or `skills-figquery/figma-design-to-code/SKILL.md`).
2. Call MCP **`get_design_context`** with:
   - `fileKey`, `nodeId` (colon form e.g. `327:11712`)
   - `skillNames`: `figma-design-to-code`
   - `clientLanguages`: `typescript`
   - `clientFrameworks`: `react,tanstack-start`
3. Treat returned React/Tailwind as **reference only** — adapt to existing routes, tokens (`#ED351D`, `#1B2432`, `#F1F2F4`), Lucide icons, live services.
4. Gates (skill): G1 after design context; G2–G4 before edit; G5 before finish.
5. Optional: `get_metadata` on `42:1482` to inventory frames; then `get_design_context` per frame.

### One-by-one update process

1. Pick next desktop frame (1440×1024) from board order.  
2. Pull `get_design_context`.  
3. Map to an existing route (or add `workspace.app.*.tsx` + let Vite regenerate `routeTree.gen.ts`).  
4. Wire **live** `adminService` / `tripService` / `fleetService` / `dashboardService` — empty API → Figma empty state component, not “—” spam or mock rows.  
5. Commit + **push** (prefer user’s PowerShell if agent `git` hangs).  
6. Update this handoff **Progress log**.  
7. Hard-refresh `petrolline.fleetopsx.com`.

---

## User rules (do not reverse)

1. Figma sidebar = whole staff workspace; no old prototype Main/Fleet/Tracking sidebar as primary.  
2. First nav item = **Overview**.  
3. Groups: PARTNER Account, INTERNAL Account, DEPARTMENTS.  
4. Non-Figma modules → **More**.  
5. Pixel-perfect frames; live API.  
6. Push after each frame.  
7. Do not background long `git` / `npm` / SSH waits when the user asks to stay fast.  
8. No Figma placeholder data in UI.

---

## Auth (live)

Names only here — passwords in `AGENT_SECRETS.local.md`.

| Email | Role |
|--------|------|
| `manager@petroline.ng` | Transport Manager |
| `admin@fleetopsx.com` | Platform Admin |
| Other Petroline ops emails (`fleet@`, `hr@`, etc.) | See secrets file / reset script |

Reset users on VPS (run **inside** `/var/www/fleetopsx-api`):

```text
scp scripts/reset-petroline-users.js root@2.28.45.216:/var/www/fleetopsx-api/
ssh root@2.28.45.216 "cd /var/www/fleetopsx-api && node reset-petroline-users.js && pm2 restart fleetopsx-api"
```

Script in repo: `scripts/reset-petroline-users.js`.

---

## Key files

| Area | Path |
|------|------|
| Figma Admin sidebar | `src/components/fleetopsx/transport-admin-sidebar.tsx` |
| App shell (always Figma sidebar) | `src/routes/workspace.app.tsx` |
| Header | `src/components/fleetopsx/app-header.tsx` |
| Overview / Central Dashboard | `src/components/fleetopsx/central-dashboard.tsx` + `src/routes/workspace.app.index.tsx` |
| Manage Partner | `src/routes/workspace.app.manage-partner.tsx` |
| Partner Requests | `src/routes/workspace.app.partner-requests.tsx` |
| Fleet / Dispatch Requests UI | `src/routes/workspace.app.fleet.tsx` |
| Empty / loading states | `src/components/fleetopsx/figma-empty-state.tsx` |
| Live API client | `src/lib/fleetopsx/apiClient.ts`, `live-api.ts`, `services.ts` |
| Old prototype nav (More extras only) | `src/components/fleetopsx/app-sidebar.tsx` `NAV` |

---

## Figma frame map (desktop Admin)

| Frame | Node | Route / status |
|--------|------|----------------|
| Landing | `42:2244` | Done (earlier) |
| Account type | `76:632` | Done |
| Sign in | `37:35` / `42:700` | Done |
| Forgot / set password | `59:368` / `42:959` | Done |
| Admin Add Account | `59:1020` | Done |
| Admin Select Department | `93:1374` | Done |
| Admin Manage Account | `93:1637` | Done |
| Admin Password Request | `134:4394` | Done |
| Admin Add Partner | `327:12879` | Mostly done |
| Admin Partner Account (listing) | `327:11712` | Done (live users) |
| Admin Partner Delivery Requests | `480:15293` | Done → `/partner-requests` |
| Admin Central Dashboard | `472:17727` | Done → Overview cards |
| Admin Dispatch Requests | `480:15035` | In progress / partial via `/fleet` |
| Fleet Operations section header | `385:12417` | Section banner only — need real FO screens under that area |
| Partner request portal flows | `164:2656`… | Partner portal (separate track) |

---

## Done so far (high level)

- Live login + JWT (fixed DB password / reset users).  
- Auth + Admin account frames matched to Figma.  
- Figma Admin sidebar on every workspace page; Overview label.  
- Partner Account Management ≠ Partner Requests (unique routes; one active highlight).  
- Manage Partner cleaned (no Username/Ascending chips); empty state when API empty.  
- Partner Requests listing from live trips.  
- Overview replaced with Figma Central Dashboard stat cards from live overview data.  
- Fleet heads list uses live `/trucks` (not mock-only).  
- Empty states component; removed fake Figma fallback names in several places.  
- Commits on `main` include: `574ff85`, `6209ef8`, `87b2984`, `0d556b1` (and earlier auth work).

---

## Where we stopped (2026-09-11)

- Handoff docs created.  
- Local uncommitted / extra work may still include: fleet-registry route, dispatch-details modal, sidebar tweaks, HR/notifications/password-request edits — check `git status`.  
- Next product work: finish **Admin Dispatch Requests** + remaining **Fleet Operations** board frames; keep empty states; push every frame.  
- Agent `git`/`ssh` often hung historically; prefer short commands or user PowerShell for push.

---

## Where we are going (priority)

1. Keep `AGENT_HANDOFF.md` updated after each push.  
2. Complete Admin Dispatch Requests (`480:15035` + details/action variants).  
3. Inventory Fleet Operations frames under board section `385:12417` and match them (registry, create dispatch, history) to live routes.  
4. Partner Add Account variants (name / confirm / share) if not pixel-complete.  
5. HR & Personnel Figma if present.  
6. Do not reintroduce mock sidebar or Figma sample table rows.

---

## Empty states policy

- While loading → `FigmaLoadingState` (“Loading”).  
- After API returns `[]` → `FigmaEmptyState` (title + body + optional CTA).  
- Missing field on a real row → leave blank or omit detail row; **do not** show “—” as a product empty state, and **never** Figma dummy text.

---

## Progress log

| Date | Push / commit | Notes |
|------|----------------|--------|
| 2026-09-11 | (handoff commit) | Created `AGENT_HANDOFF.md`, `AGENT_SECRETS.example.md`; secrets stay in `AGENT_SECRETS.local.md` |
| 2026-09-10 | `0d556b1` | Empty states from live API |
| 2026-09-10 | `87b2984` | Partner pages + Central Dashboard |
| 2026-09-10 | `6209ef8` | Figma Admin sidebar everywhere |

---

## Next agent checklist

1. Read this file + create `AGENT_SECRETS.local.md` from the example (user fills secrets).  
2. `git status` / `git log -10 --oneline`.  
3. Confirm production: login on `petrolline.fleetopsx.com`, Overview cards, Partner nav split.  
4. Pull next Figma frame via MCP as above.  
5. Implement → push → update Progress log here.
