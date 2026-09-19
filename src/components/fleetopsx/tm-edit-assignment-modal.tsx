import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  displayDriverOption,
  displayRequestedTruckType,
  truckHeadChoice,
  truckHeadSpec,
  truckTailChoice,
  truckTailSpec,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { tripService } from "@/lib/fleetopsx/services";
import { useFuelPrices } from "@/lib/fleetopsx/use-fuel-prices";
import type { Driver, Trip, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const formatN = (num: number) =>
  new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

/** Everything about the tail EXCEPT its body — state and where it stands. */
function truckTailRest(tail: TruckTail): string {
  const spec = truckTailSpec(tail);
  const body = (tail.type || "").trim();
  return (body ? spec.replace(body, "") : spec).replace(/^\s*·\s*/, "").trim();
}

function parseAmount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * Transport Manager edit surface for a dispatch that Fleet Operations already
 * configured (status "Awaiting Approval"). Mirrors the FO assignment form:
 * truck head + tail, driver (roster select or manual name+phone override), and
 * the five mandatory direct-cost fields plus lubricant. Saves through the same
 * PATCH the FO flow uses, so every downstream view (detail modal, dispatch
 * history, partner portal, live map) reflects the TM's changes immediately.
 */
export function TmEditAssignmentModal({
  trip,
  heads,
  tails,
  drivers,
  onClose,
  onSaved,
}: {
  trip: Trip;
  heads: TruckHead[];
  tails: TruckTail[];
  drivers: Driver[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // --- Truck head (cap) selection; falls back to the trip's current value ---
  const currentReg = (trip.truckReg || "").split("/")[0]?.trim() ?? "";
  const currentHead =
    heads.find((h) => h.id === trip.headId) ??
    heads.find((h) => h.registration === currentReg) ??
    null;
  const [headId, setHeadId] = useState(currentHead?.id ?? "");
  const head = useMemo(() => heads.find((h) => h.id === headId) ?? null, [heads, headId]);

  // --- Tail selection: match on number, plate or stored tail number ---
  const currentTail =
    tails.find((t) => t.id === trip.tailId) ??
    tails.find((t) => t.number === trip.tailNumber) ??
    tails.find((t) => t.number && trip.tailNumber && t.number === trip.tailNumber) ??
    null;
  const [tailId, setTailId] = useState(currentTail?.id ?? "");
  const [tailNumber, setTailNumber] = useState(trip.tailNumber ?? "");
  const tail = useMemo(() => tails.find((t) => t.id === tailId) ?? null, [tails, tailId]);

  // --- Driver: roster select or manual override (spec requirement) ---
  const currentDriver =
    drivers.find((d) => d.id === trip.driverId) ??
    drivers.find(
      (d) => d.name && trip.driverName && d.name.trim().toLowerCase() === trip.driverName.trim().toLowerCase(),
    ) ??
    null;
  const [driverId, setDriverId] = useState(currentDriver?.id ?? "");
  const [driverName, setDriverName] = useState(
    trip.driverName && trip.driverName !== "Unassigned" ? trip.driverName : "",
  );
  const [driverPhone, setDriverPhone] = useState(currentDriver?.phone ?? "");
  const driver = useMemo(() => drivers.find((d) => d.id === driverId) ?? null, [drivers, driverId]);

  // --- Direct costs (five mandatory fields + lubricant) ---
  const costs = trip.directCosts;
  const [tripAllowance, setTripAllowance] = useState(
    costs?.tripAllowance != null ? String(costs.tripAllowance) : "",
  );
  const [returnWaybill, setReturnWaybill] = useState(
    costs?.returnWaybill != null ? String(costs.returnWaybill) : "",
  );
  const [motorBoy, setMotorBoy] = useState(costs?.motorBoy != null ? String(costs.motorBoy) : "");
  const [ticketCost, setTicketCost] = useState(costs?.ticket != null ? String(costs.ticket) : "");
  const [extraAllowance, setExtraAllowance] = useState(
    costs?.extraAllowance != null ? String(costs.extraAllowance) : "",
  );
  // Bonus is optional: blank reads as zero and never blocks a save.
  const [bonus, setBonus] = useState(costs?.bonus != null ? String(costs.bonus) : "");
  const [lubricant, setLubricant] = useState<"Diesel" | "Gas">(costs?.lubricantType ?? "Diesel");
  const [lubricantQty, setLubricantQty] = useState(
    costs?.lubricantQuantity != null ? String(costs.lubricantQuantity) : "",
  );

  // Fuel pricing: the TM owns the price per litre. Even in this edit modal the
  // cost is derived (qty × TM price) — never typed, so a price change re-prices
  // every open assignment consistently.
  const { price: fuelPricePerLitre } = useFuelPrices();
  const lubricantCost =
    (Number(lubricantQty) || 0) * fuelPricePerLitre(lubricant);

  // When the TM expects this to leave the yard (YYYY-MM-DD, as the date input
  // gives it). Security's real gate stamp supersedes it on the board.
  const [estimatedDate, setEstimatedDate] = useState((trip.estimatedDate ?? "").slice(0, 10));

  const [saving, setSaving] = useState(false);

  const totalExpense =
    (Number(tripAllowance) || 0) +
    (Number(returnWaybill) || 0) +
    (Number(motorBoy) || 0) +
    (Number(ticketCost) || 0) +
    (Number(extraAllowance) || 0) +
    (Number(bonus) || 0) +
    (Number(lubricantCost) || 0);

  const validate = (): string | null => {
    if (!head) return "Select a Truck Head (Cap Number).";
    // Spec: manual override allowed — either a roster driver OR typed name+phone.
    // A driver whose name is unchanged from FO's config counts as intact: the
    // phone number is not returned by the trips list, so demanding a re-typed
    // phone would block a TM who only wants to swap the truck or fix costs.
    const driverUnchanged =
      driverName.trim() !== "" && driverName.trim() === (trip.driverName ?? "").trim();
    if (!driver && !driverUnchanged && !(driverName.trim() && driverPhone.trim())) {
      return "Select a driver by Salary Number, or keep the Driver Name and Phone filled in.";
    }
    for (const [label, v] of [
      ["Trip Allowance", tripAllowance],
      ["Return Waybill", returnWaybill],
      ["Motor Boy", motorBoy],
      ["Ticket", ticketCost],
      ["Extra Allowance", extraAllowance],
    ] as const) {
      if (!String(v).trim() || Number.isNaN(parseAmount(v))) {
        return `${label} is a mandatory direct cost.`;
      }
    }
    return null;
  };

  const handleSave = async (andApprove: boolean) => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!head) return;

    const resolvedTailType = tail?.type || trip.tailType || "";
    const resolvedTailNumber = tail?.number || tailNumber || "";

    setSaving(true);
    try {
      await tripService.update(trip.id, {
        headId: head.id,
        ...(tail?.id ? { tailId: tail.id } : {}),
        ...(resolvedTailType ? { tailType: resolvedTailType } : {}),
        ...(resolvedTailNumber ? { tailNumber: resolvedTailNumber } : {}),
        truckReg: tail
          ? `${head.registration} / ${tail.number || tail.registration}`
          : head.registration,
        ...(driver ? { driverId: driver.id } : { driverId: undefined }),
        driverName: driver ? driver.name : driverName.trim(),
        directCosts: {
          tripAllowance: parseAmount(tripAllowance),
          returnWaybill: parseAmount(returnWaybill),
          motorBoy: parseAmount(motorBoy),
          ticket: parseAmount(ticketCost),
          extraAllowance: parseAmount(extraAllowance),
          bonus: parseAmount(bonus),
          lubricantType: lubricant,
          ...(lubricantQty.trim() ? { lubricantQuantity: parseAmount(lubricantQty) } : {}),
          ...(lubricantCost > 0 ? { lubricantCost } : {}),
        },
        ...(totalExpense > 0 ? { totalCosts: totalExpense } : {}),
        // The TM's estimate — cleared (not left stale) when the field is emptied.
        estimatedDate: estimatedDate.trim() || null,
        ...(andApprove ? { status: "Scheduled" as const } : {}),
      });
      toast.success(
        andApprove
          ? `Dispatch ${displayRequestId(trip)} updated and approved.`
          : `Dispatch ${displayRequestId(trip)} assignment updated.`,
      );
      onSaved();
      onClose();
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(
        offline
          ? "You are offline — changes were NOT saved. Reconnect and try again."
          : err instanceof Error
            ? err.message
            : "Failed to save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
      <div className="flex max-h-[90vh] w-[680px] max-w-full flex-col gap-4 overflow-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] pb-3">
          <div>
            <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
              Modify Assignment
            </h3>
            <p className="mt-1 text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
              Ticket {displayRequestId(trip)} · edit what Fleet Operations configured
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[#5C6470] hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Estimated dispatch date — the working date the board shows until the
            truck actually leaves the gate. */}
        <label className="flex flex-col gap-1.5 border-b border-[#E2E5E9] pb-3">
          <span className="text-[13px] font-medium text-[#141A1F]">Estimated Dispatch Date</span>
          <input
            type="date"
            value={estimatedDate}
            onChange={(e) => setEstimatedDate(e.target.value)}
            className="h-10 w-full max-w-[240px] rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#141A1F] outline-none focus:border-[#1B2432]"
          />
          <span className="text-[12px] leading-4 text-[#5C6470]">
            Shown on the dispatch board until Security logs the truck out of the gate.
          </span>
        </label>

        {/* Step 1: Truck */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Truck Head &amp; Tail</h4>
            {/* The partner asked for this body — shown right where the truck is
                chosen so the wrong body is obvious before it is saved. */}
            {displayRequestedTruckType(trip) ? (
              <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[12px] font-medium tracking-[0.4px] text-[#344256]">
                Requested: <span className="font-semibold text-[#141A1F]">{displayRequestedTruckType(trip)}</span>
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">
                Truck Head (Cap Number) <span className="text-[#ED351D]">*</span>
              </span>
              <select
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={headId}
                onChange={(e) => setHeadId(e.target.value)}
              >
                <option value="">Select head</option>
                {heads
                  .filter((h) => h.status === "Available" || h.id === headId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {truckHeadChoice(h)}
                    </option>
                  ))}
              </select>
              {head ? (
                <span className="text-[12px] leading-4 text-[#5C6470]">{truckHeadSpec(head)}</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Plate Number</span>
              <input
                readOnly
                className="h-10 rounded border border-[#E2E5E9] bg-[#f4f5f7] px-3 text-[14px] text-[#5C6470]"
                value={head?.registration || ""}
                placeholder="Auto-populated"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Truck Tail (Body)</span>
              <select
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={tailId}
                onChange={(e) => {
                  setTailId(e.target.value);
                  const t = tails.find((x) => x.id === e.target.value);
                  setTailNumber(t?.number || "");
                }}
              >
                <option value="">Select tail</option>
                {tails
                  .filter((t) => t.status === "Available" || t.id === tailId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {truckTailChoice(t)}
                    </option>
                  ))}
              </select>
              {tail ? (
                <span className="text-[12px] leading-4 text-[#5C6470]">
                  Body: <span className="font-semibold text-[#141A1F]">{tail.type || "Unknown"}</span>
                  {truckTailRest(tail) ? ` · ${truckTailRest(tail)}` : ""}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Tail Number</span>
              <input
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={tailNumber}
                onChange={(e) => setTailNumber(e.target.value)}
                placeholder="eg: B001"
              />
            </label>
          </div>
        </section>

        {/* Step 2: Driver */}
        <section className="flex flex-col gap-3 border-t border-[#E2E5E9] pt-3">
          <h4 className="text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Driver</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Salary Number</span>
              <select
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={driverId}
                onChange={(e) => {
                  setDriverId(e.target.value);
                  const d = drivers.find((x) => x.id === e.target.value);
                  if (d) {
                    setDriverName(d.name);
                    setDriverPhone(d.phone ?? "");
                  }
                }}
              >
                <option value="">Select driver</option>
                {drivers
                  .filter((d) => d.status === "Available" || d.id === driverId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {displayDriverOption(d)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Driver Name</span>
              <input
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Auto-filled or manual"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Phone Number</span>
              <input
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="Auto-filled or manual"
              />
            </label>
          </div>
          <p className="text-[12px] text-[#5C6470]">
            Manual override allowed — clear the Salary Number and type the name + phone for a
            driver not yet fully registered.
          </p>
        </section>

        {/* Step 3: Direct costs */}
        <section className="flex flex-col gap-3 border-t border-[#E2E5E9] pt-3">
          <h4 className="text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Direct Cost Configuration</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(
              [
                ["Trip Allowance", tripAllowance, setTripAllowance],
                ["Return Waybill", returnWaybill, setReturnWaybill],
                ["Motor Boy", motorBoy, setMotorBoy],
                ["Ticket", ticketCost, setTicketCost],
                ["Extra Allowance", extraAllowance, setExtraAllowance],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-[#141A1F]">
                  {label} <span className="text-[#ED351D]">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">
                Bonus <span className="text-[#627084]">(optional)</span>
              </span>
              <input
                type="number"
                min="0"
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                placeholder="e.g. 5000"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Lubricant</span>
              <select
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={lubricant}
                onChange={(e) => setLubricant(e.target.value === "Gas" ? "Gas" : "Diesel")}
              >
                <option value="Diesel">Diesel</option>
                <option value="Gas">Gas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Lubricant Quantity</span>
              <input
                type="number"
                min="0"
                className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] outline-none focus:border-[#1B2432]"
                value={lubricantQty}
                onChange={(e) => setLubricantQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#141A1F]">Lubricant Cost</span>
              {/* Auto-calculated: qty × TM-managed price per litre. Read-only. */}
              <input
                type="number"
                readOnly
                className="h-10 rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] font-medium text-[#141A1F] outline-none"
                value={lubricantCost > 0 ? String(lubricantCost) : ""}
                placeholder="Auto: qty × price/L"
                title={`Auto-calculated: ${lubricantQty || 0} L × ₦${fuelPricePerLitre(lubricant)} per litre (your TM-set rate)`}
              />
              <span className="text-[11px] tracking-[0.4px] text-[#627084]">
                Auto: {lubricantQty || 0} L × ₦{fuelPricePerLitre(lubricant) || "—"}/L — update the rate in HR → Fuel Pricing
              </span>
            </label>
          </div>
          <div className="flex items-center justify-between border-t border-[#E2E5E9] pt-2.5">
            <span className="text-[14px] font-bold text-[#1B2432]">Total Configured Expense:</span>
            <span className="text-[15px] font-bold text-[#ED351D]">{formatN(totalExpense)}</span>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5E9] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-medium text-[#5C6470] hover:underline"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className={cn(
                "flex h-9 items-center rounded border border-[#1B2432] px-4 text-[14px] font-medium text-[#1B2432]",
                saving ? "opacity-50" : "hover:bg-[#F6F7F9]",
              )}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className={cn(
                "flex h-9 items-center rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white",
                saving ? "opacity-50" : "hover:bg-[#d62e19]",
              )}
            >
              {saving ? "Saving…" : "Save & Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
