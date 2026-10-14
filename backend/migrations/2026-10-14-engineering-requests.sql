-- 2026-10-14 — engineering check-up + grouped parts/lubricant requests
--
-- WHY: the Engineering & Maintenance web portal (converted from the approved
-- mobile Figma) works requests as a HEADER with several part LINES, not as
-- loose one-line tickets:
--   Check-up Queue  → inspection verdict (no issues → Available; issues →
--                     Under Maintenance + defect log with severity + parts).
--   Parts form      → target (Truck Head / Truck Tail / Workshop) + description
--                     + several store lines, submitted as ONE request.
--   Lubricant form  → target + Diesel/Gas + quantity + purpose.
--   Review chain    → supervisor raises (Awaiting HOE Review) → Head of
--                     Engineering validates/modifies (Awaiting Admin Approval)
--                     → Transfer Manager approves (Awaiting Pickup, the store's
--                     existing handoff queue) → store hands over (Released).
-- HOW: nullable columns only, applied by hand like the earlier migrations.
-- Old rows keep working: no backfill, no status rewrites.

-- One multi-line request shares a requestGroup; each line stays its own row so
-- the store can pick, sign and price lines independently.
ALTER TABLE "InventoryRequisition" ADD COLUMN IF NOT EXISTS "requestGroup" TEXT;
ALTER TABLE "InventoryRequisition" ADD COLUMN IF NOT EXISTS "description" TEXT;
-- Truck Head | Truck Tail | Workshop — what the request is FOR.
ALTER TABLE "InventoryRequisition" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
-- The Head of Engineering's stamp when the request passes HOE review.
ALTER TABLE "InventoryRequisition" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "InventoryRequisition" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP;

-- The check-up verdict, written onto the work order the inspection raises.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "severity" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "inspectedBy" TEXT;

-- Lubricant draws for engineering use carry the same target + HOE stamp.
-- Chain: Requested → HOE Approved → Authorized (TM) → Dispensed (desk).
ALTER TABLE "FuelRequest" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "FuelRequest" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "FuelRequest" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP;
