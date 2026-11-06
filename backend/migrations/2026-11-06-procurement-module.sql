-- Procurement & Document Management (PRD, 6 Nov 2026)
-- Additive only: two new tables plus nullable columns on ProcurementRequest.
-- Safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS "Vendor" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "contactName" TEXT,
  "phone"       TEXT,
  "email"       TEXT,
  "location"    TEXT,
  "notes"       TEXT,
  "status"      TEXT NOT NULL DEFAULT 'Active',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_name_key" ON "Vendor"("name");

CREATE TABLE IF NOT EXISTS "ProcurementDocument" (
  "id"            TEXT NOT NULL,
  "procurementId" TEXT,
  "movementId"    TEXT,
  "vendor"        TEXT,
  "kind"          TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "dataUrl"       TEXT NOT NULL,
  "uploadedBy"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcurementDocument_procurementId_idx" ON "ProcurementDocument"("procurementId");

ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'Store';
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "itemId" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "receivedQty" INTEGER;
ALTER TABLE "ProcurementRequest" ADD COLUMN IF NOT EXISTS "receivedUnitCost" DOUBLE PRECISION;
