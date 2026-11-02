-- DRIVER-IDENTITY (30 Oct 2026): the dispatch carries the roster's own
-- identity, not just a typed name. trip.driverId references Driver.id,
-- trip.driverStaffId mirrors Driver.staffId. Every guard binds on the
-- identity; driverName remains display text. (The boss is right — two men
-- sharing a name must never share a dispatch.)
ALTER TABLE "Trip" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "driverStaffId" TEXT;
