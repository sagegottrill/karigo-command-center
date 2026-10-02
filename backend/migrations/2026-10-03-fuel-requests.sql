-- 2026-10-03 — diesel/gas requests at the desk (walk-in buyers + internal draws)
--
-- WHY: two requests reach the fuel desk that a dispatch never covers.
--   1. A walk-in buyer holds a paper slip at the yard: "I want 50 L of diesel",
--      and the diesel attendant has to SEE that request.
--   2. An internal draw on the tank — a yard mechanic washing an engine
--      ("the boss wants 50 L of diesel to wash the engine"), Petroline asking
--      Petroline — which still has to reach the man at the pump.
-- Both are raised by whoever takes the slip and land in one queue the desk works.
--
-- HOW: applied by hand (the server has no git + no migrate history), because
-- `prisma db push` also wanted to DROP four live columns on "LubricantDisbursal"
-- (status/reviewedBy/reviewedAt/reviewNote) that the schema file was missing.
-- The schema now mirrors those columns, so a future diff is a clean no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "FuelRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL DEFAULT 'Diesel',
    "quantity" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Internal Use',
    "requestedBy" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedByEmail" TEXT,
    "requestedFor" TEXT,
    "purpose" TEXT,
    "buyerPhone" TEXT,
    "plateNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Requested',
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'Unpaid',
    "paymentRef" TEXT,
    "authorizedBy" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "dispensedBy" TEXT,
    "dispensedAt" TIMESTAMP(3),
    "declinedBy" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FuelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FuelRequest_reference_key" ON "FuelRequest"("reference");
CREATE INDEX IF NOT EXISTS "FuelRequest_status_idx" ON "FuelRequest"("status");
CREATE INDEX IF NOT EXISTS "FuelRequest_createdAt_idx" ON "FuelRequest"("createdAt");
