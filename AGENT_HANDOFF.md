# Agent handoff

**One file has everything** (aim, live API wiring, secrets, SSH, Figma MCP, progress):

`AGENT_HANDOFF.local.md` (gitignored — not on GitHub)

**Rule for every AI:** after every task/commit/push, append §20 Progress log and update §18 Where we stopped in that file.

### 25 Oct 2026 — Store portal UX pass (double-highlight, half-width, add-flow)
- `department-sidebar.tsx`: `isActiveRoute` — most-specific `to` wins, so `/store/parts-request` no longer keeps BOTH "Parts Request" and "Store Inventory" lit (rail, tab strip and mobile nav all share the helper).
- All four store routes: dropped the `max-w-[1160px]` cap — pages now run the full content width (`px-4 pt-6 md:px-[30px]`), card grids gain a 4th column at 2xl.
- `workspace.app.store.index.tsx`: hidden "Import Inventory" menu replaced by two plain buttons — dark "Add Inventory" (manual add modal, retitled "Add Inventory") and white "Bulk Import From File". Empty-state button/copy updated to match.
- Verified signed-in as a fresh bench "Parts & Store" account on :8080 (rail/tab show exactly one active item per route; content spans 1680/1920; Add Inventory modal opens with the full form). Bench accounts bench.probe + bench.probe2 deleted afterwards. `tsc --noEmit` clean.
