import { displayCapFromTrip, displayHeadCap, displayPlateFromTrip } from "./display-ids";
import { driverService, fleetService, notificationService, tripService } from "./services";
import type { Trip } from "./types";

/**
 * CLOSING THE CIRCLE — one implementation, used by Security's gate and by the
 * Tracking department's own "Truck Returned" action.
 *
 * A dispatch used to have no end: the only thing that ever completed a trip was
 * the gate's Log Return, and it was never used, so every truck stayed on the
 * Tracking Operations board forever after it had come home. Both the people who
 * physically see the truck arrive now close the trip the same way:
 *
 *   1. the return is stamped (`eta`) — the moment the circle closed,
 *   2. the trip becomes Completed, which takes it off the active boards,
 *   3. the truck head AND its tail go to CHECK UP, not straight back to
 *      Available: the fleet team inspects them and decides Available or
 *      Maintenance from the Fleet Registry,
 *   4. the driver comes off the trip with the truck,
 *   5. Engineering and the Transport Manager are told a truck is waiting.
 *
 * The return itself must stand even when an asset row cannot be updated, so the
 * bookkeeping is best-effort and reported back to the caller.
 */

/** The moment the truck came back, in the same shape the gate writes stamps. */
export function returnStampNow(): string {
  return new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function completeTripReturn(trip: Trip): Promise<{ marked: boolean }> {
  // WHO logged the return — the Gate Security account that stamped it, carried
  // onto the Guard Activity Ledger the Transport Manager audits.
  const gateInBy = (() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("fleetopsx_user_name");
        if (stored && stored.trim()) return stored.trim();
      }
    } catch {
      // ignore
    }
    return "Petroline Security";
  })();
  await tripService.update(trip.id, {
    status: "Completed",
    eta: returnStampNow(),
    gateInBy,
  });

  // The plate as every screen reads it (roster-resolved), normalised for matching
  // against the register's registration column.
  const plate = displayPlateFromTrip(trip).replace(/\s/g, "").toUpperCase();
  // The cap as the trip stores it (plate-resolved when the row carries no head
  // reference), never the raw id — a fallback of "" would blank the message.
  const cap = displayCapFromTrip(trip) || "";
  let marked = false;

  try {
    const heads = await fleetService.listHeads();
    const head =
      (trip.headId ? heads.find((h) => h.id === trip.headId) : undefined) ??
      (plate
        ? heads.find((h) => h.registration.replace(/\s/g, "").toUpperCase() === plate)
        : undefined) ??
      heads.find((h) => cap && cap !== "—" && (displayHeadCap(h) === cap || h.number === cap));
    if (head) {
      await fleetService.updateHeadStatus(
        head.id,
        "Check Up",
        displayHeadCap(head) || head.registration,
      );
      marked = true;
    }
    // The TAIL came back with the truck — and it was set to Assigned when the
    // dispatch took it. Leaving it there would advertise a body that is standing
    // in the yard as fitted to a live run.
    const tailCode = String(trip.tailNumber || (trip.truckReg || "").split("/")[1] || "").trim();
    if (tailCode) {
      const tails = await fleetService.listTails();
      const tail = tails.find(
        (t) =>
          t.number.replace(/\s/g, "").toUpperCase() === tailCode.replace(/\s/g, "").toUpperCase(),
      );
      if (tail && (tail.status === "Assigned" || tail.status === "Out of Yard")) {
        await fleetService.updateTailStatus(tail.id, "Check Up", tail.number);
        marked = true;
      }
    }
    // The DRIVER comes off the trip with the truck. The working driver status in HR
    // and dispatch is "Active". We match by name, staffId, or assigned truck registration/cabId.
    const heldByName = String(trip.driverName || "").trim().toLowerCase();
    const norm = (s: string) => s.replace(/[\s\-_]/g, "").toLowerCase();
    const cleanHeld = norm(heldByName);
    try {
      const drivers = await driverService.list();
      const matchedDrivers = drivers.filter((d: any) => {
        const dn = norm(d.name || "");
        if (cleanHeld && cleanHeld !== "unassigned") {
          if (dn === cleanHeld || (cleanHeld.length >= 4 && (dn.includes(cleanHeld) || cleanHeld.includes(dn)))) return true;
          if (d.staffId && norm(d.staffId) === cleanHeld) return true;
          if (d.employeeId && norm(d.employeeId) === cleanHeld) return true;
        }
        if (plate) {
          const np = norm(plate);
          if (d.truckReg && norm(d.truckReg).includes(np)) return true;
          if (d.truckReg2 && norm(d.truckReg2).includes(np)) return true;
        }
        if (cap && cap !== "—") {
          const nc = norm(cap);
          if (d.truckReg && norm(d.truckReg).includes(nc)) return true;
          if (d.truckReg2 && norm(d.truckReg2).includes(nc)) return true;
        }
        return false;
      });
      for (const driver of matchedDrivers) {
        if (driver.status !== "Active") {
          await driverService.update(driver.id, { status: "Active" });
        }
      }
    } catch (driverErr) {
      console.warn("Could not free driver on return:", driverErr);
    }
  } catch {
    /* the return itself must stand even if the asset row cannot be updated */
  }

  void notificationService.create({
    title: "Truck returned — check-up required",
    body: `${plate || cap || "Truck"} is back in the yard${marked ? " and is now on Check Up" : ""}. Confirm Available or Maintenance.`,
    category: "Operations",
    audience: "Engineering,Transport Manager,Fleet Operations,Platform Admin",
  });

  return { marked };
}
