-- The receiving step between the store and the workshop.
-- Additive only: two nullable columns on the requisition. Safe to re-run.

ALTER TABLE "InventoryRequisition"
  ADD COLUMN IF NOT EXISTS "receivedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
