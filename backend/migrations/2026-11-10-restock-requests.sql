-- Restock requests: the buying desk asks, the Transport Manager approves,
-- and only then does the shelf quantity rise.
-- Additive only: one new table. Safe to re-run.

CREATE TABLE IF NOT EXISTS "RestockRequest" (
  "id"            TEXT NOT NULL,
  "itemId"        TEXT NOT NULL,
  "sku"           TEXT NOT NULL,
  "itemName"      TEXT NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "unitPrice"     DOUBLE PRECISION,
  "note"          TEXT,
  "status"        TEXT NOT NULL DEFAULT 'Pending',
  "requestedBy"   TEXT NOT NULL,
  "requestedById" TEXT,
  "decidedBy"     TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "appliedQty"    INTEGER,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RestockRequest_status_createdAt_idx"
  ON "RestockRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RestockRequest_itemId_idx"
  ON "RestockRequest"("itemId");
