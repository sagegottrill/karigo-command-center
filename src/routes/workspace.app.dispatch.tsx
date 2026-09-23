import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DispatchLiveMap } from "@/components/fleetopsx/dispatch-live-map";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayDriverAssigned,
  displayDriverOption,
  displayHeadCap,
  displayRequestedTruckType,
  displayTailOption,
  displayTicket,
  truckHeadChoice,
  truckHeadSpec,
  truckTailChoice,
  truckTailSpec,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { assignableDrivers } from "@/lib/fleetopsx/driver-duty";
import {
  assignmentReleaseService,
  authService,
  driverService,
  fleetService,
  tripService,
} from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { useFuelPrices } from "@/lib/fleetopsx/use-fuel-prices";
import { FO_QUEUE_BUCKETS, isInBucket, queueOrder } from "@/lib/fleetopsx/status-buckets";
// Every loading site on a request, split and de-duplicated — the pricing input
// Fleet Ops must read before assigning a truck.
import { tripLoadingSites } from "@/lib/fleetopsx/tracking-ops";
import type { Driver, Trip, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { SearchableSelect } from "@/components/fleetopsx/searchable-select";
import { cn } from "@/lib/utils";
import { ChevronLeft, Upload } from "lucide-react";

export const Route = createFileRoute("/workspace/app/dispatch")({
  // Live JWT is browser-only — never SSR-fetch (was causing document 500 Unauthorized)
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Fleet Dispatch | FleetOpsX" },
      { name: "description", content: "Assign trucks and drivers from the live dispatch queue." },
    ],
  }),
  component: DispatchPage,
});

const formatN = (num: number) => {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

function requestId(trip: Trip) {
  return displayRequestId(trip);
}

function formatQueueDate(trip: Trip) {
  const raw = trip.scheduledDate?.trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return raw;
}

function companyName(trip: Trip) {
  if (trip.customer && trip.customer !== "Customer Portal") return trip.customer;
  return trip.customerConsignee ?? "";
}

function ViewModeTabs({
  viewMode,
  onChange,
}: {
  viewMode: "queue" | "tracking";
  onChange: (mode: "queue" | "tracking") => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] bg-white p-[5px] shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
      <button
        type="button"
        onClick={() => onChange("queue")}
        className={cn(
          "flex h-8 items-center rounded px-3 text-[14px] font-medium tracking-[0.4px]",
          viewMode === "queue" ? "bg-[#ED351D] text-white" : "text-[#1B2432]",
        )}
      >
        Dispatch Queue
      </button>
      <button
        type="button"
        onClick={() => onChange("tracking")}
        className={cn(
          "flex h-8 items-center rounded px-3 text-[14px] font-medium tracking-[0.4px]",
          viewMode === "tracking" ? "bg-[#ED351D] text-white" : "text-[#1B2432]",
        )}
      >
        Dispatch Live Tracking
      </button>
    </div>
  );
}

function DispatchPage() {
  const navigate = useNavigate();
  const [TRUCK_HEADS, setHeads] = useState<TruckHead[]>([]);
  const [TRUCK_TAILS, setTails] = useState<TruckTail[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Trip[]>([]);
  /**
   * Every dispatch, not just the queue — the driver list needs to know who is
   * actually out on the road, which the driver record's duty word cannot say.
   * See lib/fleetopsx/driver-duty.ts.
   */
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshQueue = async () => {
    const [heads, tails, nextDrivers, trips] = await Promise.all([
      fleetService.listHeads(),
      fleetService.listTails(),
      driverService.list(),
      tripService.list(),
    ]);
    setHeads(heads);
    setTails(tails);
    setDrivers(nextDrivers);
    setAllTrips(trips);
    // Queue = TM-approved only (canonical bucket semantics, so the count here
    // always matches the sidebar dot and the FO dashboard card). A closed request
    // (declined / withdrawn / finished) is filtered out explicitly: it must never
    // be assignable again, whatever its bucket says.
    setPendingOrders(
      trips
        .filter(
          (t) => isInBucket(t, FO_QUEUE_BUCKETS) && t.status !== "Stopped" && t.status !== "Completed",
        )
        // One queue, one ranking: the newest approval leads, so the request that
        // has just come through is the one Fleet Ops sees first.
        .sort((a, b) =>
          queueOrder({ rank: 0, at: a.createdAt }, { rank: 0, at: b.createdAt }),
        ),
    );
  };

  useEffect(() => {
    void refreshQueue()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load dispatch queue"))
      .finally(() => setLoading(false));
  }, []);

  const [selectedOrder, setSelectedOrder] = useState<Trip | null>(null);
  const [mobileView, setMobileView] = useState<"form" | "audit">("form");
  const [viewMode, setViewMode] = useState<"queue" | "tracking">("queue");

  // Near real-time: poll the queue every 10s (+focus/visible) so newly approved
  // requests appear without a manual refresh. Paused while an assignment form
  // is open so the operator's in-progress selection is never clobbered.
  useAutoRefresh(
    () => {
      void refreshQueue().catch(() => {});
    },
    [selectedOrder],
    { enabled: !selectedOrder },
  );

  // Form State
  const [headId, setHeadId] = useState("");
  const [tailId, setTailId] = useState("");
  const [tailNumber, setTailNumber] = useState("");

  const [driverId, setDriverId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const [tripAllowance, setTripAllowance] = useState("");
  const [returnWaybill, setReturnWaybill] = useState("");
  const [motorBoy, setMotorBoy] = useState("");
  const [ticketCost, setTicketCost] = useState("");
  const [extraAllowance, setExtraAllowance] = useState("");
  // Bonus is discretionary: empty means zero, and it never blocks a dispatch.
  const [bonus, setBonus] = useState("");
  const [lubricant, setLubricant] = useState("Diesel");
  const [lubricantQty, setLubricantQty] = useState("");

  // Fuel pricing: the TM owns the price per litre (HR → Fuel Pricing). FO only
  // types a quantity — the cost is always qty × TM price, never typed by hand.
  const { price: fuelPricePerLitre } = useFuelPrices();
  const lubricantCost =
    (Number(lubricantQty) || 0) * (fuelPricePerLitre(lubricant as "Diesel" | "Gas") || 0);

  // Selection Lookups
  const head = useMemo(() => TRUCK_HEADS.find(h => h.id === headId), [TRUCK_HEADS, headId]);
  const tail = useMemo(() => TRUCK_TAILS.find(t => t.id === tailId), [TRUCK_TAILS, tailId]);
  const driver = useMemo(() => drivers.find(d => d.id === driverId), [drivers, driverId]);

  // Derived Values
  const totalExpense =
    (Number(tripAllowance) || 0) +
    (Number(returnWaybill) || 0) +
    (Number(motorBoy) || 0) +
    (Number(ticketCost) || 0) +
    (Number(extraAllowance) || 0) +
    (Number(bonus) || 0) +
    (Number(lubricantCost) || 0);

  // Fleet Ops never sees the TM's fuel-rate card: no lubricant cost line, and the
  // audited total covers only the allowances Fleet Ops itself entered. The full
  // total including lubricant is still persisted in `totalCosts` for the TM/Accounts.
  const foVisibleTotal = totalExpense - (Number(lubricantCost) || 0);

  // Auto-fill logic. Fields stay EDITABLE — the spec explicitly allows the
  // operator to manually type a salary number / driver name for drivers not
  // yet fully registered. Selecting a roster driver pre-fills; editing stays.
  useEffect(() => {
    if (driver) {
      setDriverName(driver.name);
      setDriverPhone(driver.phone);
    }
    // No else-branch wipe: clearing the select keeps typed manual values.
  }, [driver]);

  useEffect(() => {
    if (tail) {
      setTailNumber(tail.number || tail.registration);
    } else {
      setTailNumber("");
    }
  }, [tail]);

  const validateForm = (): string | null => {
    if (!head) return "Assign a Truck Head (Cap Number).";
    // Spec: manual override allowed — either a roster driver OR typed name+phone.
    if (!driver && !(driverName.trim() && driverPhone.trim())) {
      return "Select a driver by Salary Number, or type Driver Name and Phone manually.";
    }
    if (driver && driverName.trim() !== driver.name && !driverName.trim()) {
      return "Driver Name is required.";
    }
    // Spec: all five direct-cost fields are mandatory.
    for (const [label, v] of [
      ["Trip Allowance", tripAllowance],
      ["Return Waybill", returnWaybill],
      ["Motor Boy", motorBoy],
      ["Ticket", ticketCost],
      ["Extra Allowance", extraAllowance],
    ] as const) {
      if (!String(v).trim() || Number.isNaN(Number(v))) {
        return `${label} is a mandatory direct cost.`;
      }
    }
    // Fuel price comes from the TM. If it has not been set yet, FO cannot price
    // a lubricant — fail loudly instead of silently saving a zero cost.
    if ((Number(lubricantQty) || 0) > 0 && fuelPricePerLitre(lubricant as "Diesel" | "Gas") <= 0) {
      return "Fuel price not set yet — ask the Transport Manager to set the Diesel/Gas price (HR → Fuel Pricing).";
    }
    return null;
  };

  const handleMobileConfirmDispatch = () => {
    const problem = validateForm();
    if (problem) {
      toast.error(problem);
      return;
    }
    setMobileView("audit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalConfirm = async () => {
    const problem = validateForm();
    if (problem) {
      toast.error("Validation Error", { description: problem });
      return;
    }
    // The request may have been declined or withdrawn while this form sat open.
    // Assigning a truck would resurrect a closed request — the exact bug where a
    // "cancelled" request kept coming back to the queue.
    if (selectedOrder && ["Stopped", "Completed"].includes(selectedOrder.status)) {
      toast.error("This request is no longer open — it was declined or withdrawn. Refresh the queue.");
      navigate({ to: "/workspace/app/dispatch" });
      return;
    }
    if (!head) return; // validateForm guarantees this, TS needs the guard

    // tailType = the BODY TYPE (e.g. "Flatbed Tail"), tailNumber = the code
    // (e.g. B001). Writing the number into tailType corrupted the Truck Type
    // shown across every table and detail view downstream.
    // Never fall back to the REQUEST's truck type ("Full Sided") — requestedTruckType
    // owns that value; tailType must only ever describe the tail being fitted.
    const resolvedTailType = tail?.type || "";
    const resolvedTailNumber = tail?.number || tailNumber || "";

    const assignedHead = head;
    await tripService.update(selectedOrder!.id, {
      headId: assignedHead.id,
      ...(tail?.id ? { tailId: tail.id } : {}),
      ...(resolvedTailType ? { tailType: resolvedTailType } : {}),
      ...(resolvedTailNumber ? { tailNumber: resolvedTailNumber } : {}),
      truckReg: tail
        ? `${assignedHead.registration} / ${tail.number || tail.registration}`
        : assignedHead.registration,
      // Manual override: driverId only when a roster driver was selected.
      ...(driver ? { driverId: driver.id } : {}),
      driverName: driverName.trim(),
      directCosts: {
        tripAllowance: Number(tripAllowance) || 0,
        returnWaybill: Number(returnWaybill) || 0,
        motorBoy: Number(motorBoy) || 0,
        ticket: Number(ticketCost) || 0,
        extraAllowance: Number(extraAllowance) || 0,
        bonus: Number(bonus) || 0,
        lubricantType: lubricant === "Gas" ? "Gas" : "Diesel",
        ...(lubricantQty.trim() ? { lubricantQuantity: Number(lubricantQty) || 0 } : {}),
        ...(lubricantCost > 0 ? { lubricantCost } : {}),
      },
      ...(totalExpense > 0 ? { totalCosts: totalExpense } : {}),
      status: "Awaiting Approval",
      // Re-assignment answers the TM's note — clear it so the next reader is
      // never shown a stale reason.
      sendBackReason: null,
    });

    // "Assigned" now means what it says: the truck, the tail and the driver this
    // dispatch just took are moved to Assigned / On Trip on the fleet board.
    void assignmentReleaseService.claimAssets({
      ...selectedOrder!,
      truckReg: tail
        ? `${assignedHead.registration} / ${tail.number || tail.registration}`
        : assignedHead.registration,
      driverName: driverName.trim(),
    });

      toast.success(`Dispatch Configured`, {
      description: `${displayTicket(selectedOrder!)} assigned to ${displayHeadCap(head) || head.registration} — sent for final TM approval`,
    });
    navigate({ to: "/workspace/app/dispatch-history" });
  };

  const handleBackToQueue = () => {
    setSelectedOrder(null);
    setMobileView("form");
    // Reset entry fields so the next assignment starts clean.
    setHeadId("");
    setTailId("");
    setTailNumber("");
    setDriverId("");
    setDriverName("");
    setDriverPhone("");
    setTripAllowance("");
    setReturnWaybill("");
    setMotorBoy("");
    setTicketCost("");
    setExtraAllowance("");
    setBonus("");
    setLubricantQty("");
  };

  const activeTrips = pendingOrders;

  const renderQueue = () => (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Fleet Dispatch</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Dispatch vehicles, assign trips to drivers and track live fleet status.
          </p>
        </div>
        <ViewModeTabs viewMode={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex items-center gap-2.5 border-b border-[#E2E5E9] pb-2.5 pt-1">
        <h3 className="text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Dispatch Queue</h3>
        <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white">
          {pendingOrders.length}
        </span>
      </div>

      <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        {/* Mobile cards */}
        <div className="flex flex-col gap-2.5 p-3 md:hidden">
          {pendingOrders.map((trip) => (
            <div
              key={`m-${trip.id}`}
              className="flex flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold capitalize tracking-[0.4px] text-[#303D50]">
                  {formatQueueDate(trip)}
                </span>
              </div>
              <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">{companyName(trip) || "—"}</p>
              <div className="flex flex-col gap-1 text-[12px]">
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">Customer:</span>
                  <span className="flex-1 text-[#344256]">{trip.customerConsignee || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">Product:</span>
                  <span className="flex-1 text-[#344256]">{trip.cargo || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">Truck Type:</span>
                  <span className="flex-1 text-[#344256]">{displayRequestedTruckType(trip) || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">Drop-off Location:</span>
                  <span className="flex-1 text-[#344256]">{trip.dropoff || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">Loading Site(s):</span>
                  <span className="flex-1 text-[#344256]">{tripLoadingSites(trip).join(" · ") || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-24 font-medium text-[#5C6470]">ID No.:</span>
                  <span className="flex-1 font-semibold text-[#344256]">{requestId(trip)}</span>
                </div>
              </div>
              {trip.sendBackReason ? (
                <p className="rounded bg-[#FDECEA] px-2.5 py-1.5 text-[12px] text-[#7A271A]">
                  <span className="font-semibold">Sent back:</span> {trip.sendBackReason}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedOrder(trip)}
                className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[#1B2432] px-2.5 text-[13px] font-medium tracking-[0.4px] text-white"
              >
                Assign Dispatch
                <Upload className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
          {pendingOrders.length === 0 && (
            <FigmaEmptyState
              title="No trips in the dispatch queue"
              body="Requests approved by the Transport Manager and waiting for truck and driver assignment will appear here."
            />
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden px-5 py-6 md:block">
          <div className="grid grid-cols-[minmax(100px,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(96px,0.8fr)_auto] items-center gap-x-4 border-b border-[#E2E5E9] py-2.5">
            {["Date", "Company", "Customer", "Product", "Truck Type", "Drop-off Location", "Loading Site(s)", "ID No."].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
            <span className="w-[128px]" />
          </div>

          {pendingOrders.map((trip) => (
            <div
              key={trip.id}
              className="grid grid-cols-[minmax(100px,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(96px,0.8fr)_auto] items-center gap-x-4 border-b border-[#E2E5E9] py-2.5 last:border-b-0"
            >
              <span className="truncate text-[14px] font-semibold capitalize tracking-[0.4px] text-[#5C6470]">{formatQueueDate(trip)}</span>
              <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{companyName(trip)}</span>
              <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.customerConsignee || "—"}</span>
              <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.cargo}</span>
              <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                {displayRequestedTruckType(trip) || "—"}
              </span>
              <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
              <span
                className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]"
                title={tripLoadingSites(trip).join(", ") || undefined}
              >
                {tripLoadingSites(trip).join(" · ") || "—"}
              </span>
              <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{requestId(trip)}</span>
              <div className="flex items-center justify-end gap-2">
                {trip.sendBackReason ? (
                  <span
                    title={`Sent back by the Transport Manager: ${trip.sendBackReason}`}
                    className="shrink-0 rounded bg-[#FDECEA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#B42318]"
                  >
                    Sent back
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedOrder(trip)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Assign Dispatch
                  <Upload className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}

          {pendingOrders.length === 0 && (
            <FigmaEmptyState
              title="No trips in the dispatch queue"
              body="Requests approved by the Transport Manager and waiting for truck and driver assignment will appear here."
            />
          )}
        </div>
      </div>
    </div>
  );

  const renderTracking = () => (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Fleet Dispatch</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Dispatch vehicles, assign trips to drivers and track live fleet status.
          </p>
        </div>
        <ViewModeTabs viewMode={viewMode} onChange={setViewMode} />
      </div>
      <DispatchLiveMap trips={activeTrips} />
    </div>
  );

  const renderForm = () => (
    <div className="w-full rounded-md bg-white shadow-[0px_4px_24px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden flex-1">
      {/* Form Header */}
      <div className="hidden md:block bg-[#1B2432] p-6 text-white">
        <h2 className="text-xl font-bold tracking-tight">Fleet Dispatch</h2>
        <p className="text-xs text-slate-300 font-medium tracking-wider mt-1 uppercase">
          Ticket {selectedOrder ? displayTicket(selectedOrder) : ""}
          {selectedOrder?.customer && selectedOrder.customer !== "Customer Portal" ? `  •  ${selectedOrder.customer}` : ""}
        </p>
      </div>

      <div className="p-5 md:p-6 space-y-6">
        
        {/* The TM sent this dispatch back — show the reason before anything else. */}
        {selectedOrder?.sendBackReason ? (
          <div className="rounded-xl border border-[#F5B5AA] bg-[#FDECEA] p-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-[#B42318]">
              Sent back by the Transport Manager
            </p>
            <p className="mt-1 text-[14px] text-[#7A271A]">{selectedOrder.sendBackReason}</p>
          </div>
        ) : null}

        {/* Everything the partner asked for — Fleet Ops must see EVERY loading
            site (multiple sites = multiple pickups) before choosing a truck. */}
        {selectedOrder && (
          <div className="rounded-xl border border-[#E2E5E9] bg-[#F1F2F4] p-4">
            <h3 className="mb-3 text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Partner Request Details</h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
              {(
                [
                  ["Partner", companyName(selectedOrder) || "—"],
                  ["Customer", selectedOrder.customerConsignee || "—"],
                  ["Product", selectedOrder.cargo || "—"],
                  ["Truck Type Requested", displayRequestedTruckType(selectedOrder) || "—"],
                  ["Drop-off Location", selectedOrder.dropoff || "—"],
                  ["Loading Routing", selectedOrder.loadingRoutingType || "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="text-[#5c6470]">{label}:</span>
                  <span className="text-right font-semibold capitalize text-[#141a1f]">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-[#E2E5E9] pt-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5c6470]">
                Loading Site(s)
              </p>
              {tripLoadingSites(selectedOrder).length > 0 ? (
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px] font-semibold capitalize text-[#141a1f]">
                  {tripLoadingSites(selectedOrder).map((site, i) => (
                    <li key={`${site}-${i}`}>{site}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-[13px] text-[#141a1f]">—</p>
              )}
            </div>
          </div>
        )}

        {/* Step 1 */}
        <div>
          <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] mb-4 border-b border-[#E2E5E9] pb-2">Step 1: Assign Truck</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Assign Truck Head <span className="text-[#ED351D]">*</span>
              </label>
              <SearchableSelect
                value={headId}
                onChange={setHeadId}
                placeholder="eg: P002"
                options={TRUCK_HEADS.filter(h => h.status === "Available" || h.id === headId).map(h => ({
                  value: h.id,
                  label: truckHeadChoice(h),
                  // Searchable too, so typing "UPCOUNTRY" finds those heads.
                  hint: truckHeadSpec(h),
                }))}
              />
              {head ? <p className="mt-1 text-[12px] tracking-[0.4px] text-[#5c6470]">{truckHeadSpec(head)}</p> : null}
            </div>
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Plate Number <span className="text-[#ED351D]">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-sm text-sm text-[#5c6470]"
                placeholder="Auto-populated or manual"
                value={head?.registration || ""}
                readOnly
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Assign Truck Tail <span className="text-[#ED351D]">*</span>
              </label>
              <SearchableSelect
                value={tailId}
                onChange={setTailId}
                placeholder="Select Tail (Body)"
                options={TRUCK_TAILS.filter(t => t.status === "Available" || t.id === tailId).map(t => ({
                  value: t.id,
                  // The BODY is part of the label ("B010 · Flatbed Tail") — a tail
                  // code alone said nothing about what was being hitched up.
                  label: truckTailChoice(t),
                  hint: truckTailSpec(t),
                }))}
              />
              {tail ? <p className="mt-1 text-[12px] tracking-[0.4px] text-[#5c6470]">{truckTailSpec(tail)}</p> : null}
            </div>
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Tail Number <span className="text-[#ED351D]">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm"
                placeholder="eg: B001"
                value={tailNumber}
                onChange={e => setTailNumber(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div>
          <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] mb-4 border-b border-[#E2E5E9] pb-2">Step 2: Assign Driver</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Salary Number <span className="text-[#ED351D]">*</span>
              </label>
              <SearchableSelect
                value={driverId}
                onChange={setDriverId}
                placeholder="eg: P00851"
                /*
                 * Any driver the live dispatch list says is free — NOT only the
                 * ones whose stored duty word happens to read "Available". A
                 * driver marked On Trip with no job is selectable; a driver who
                 * is genuinely out on one is not (see driver-duty).
                 */
                options={assignableDrivers(drivers, allTrips, selectedOrder?.id).map((d) => ({
                  value: d.id,
                  label: displayDriverOption(d),
                  hint: d.name,
                }))}
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Driver Name <span className="text-[#ED351D]">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm"
                placeholder="Auto-filled or manual"
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium tracking-[0.4px] text-[#141A1F] mb-1.5">
                Phone Number <span className="text-[#ED351D]">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm"
                placeholder="Auto-filled or manual"
                value={driverPhone}
                onChange={e => setDriverPhone(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Step 3 — Figma: Direct Cost Estimation + lubricant Quantity/Cost */}
        <div>
          <h3 className="mb-4 border-b border-[#E2E5E9] pb-2 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
            Step 3: Direct Cost Configuration
          </h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            {(
              [
                ["Trip Allowance", tripAllowance, setTripAllowance],
                ["Return Waybill", returnWaybill, setReturnWaybill],
                ["Motor Boy", motorBoy, setMotorBoy],
                ["Ticket Cost", ticketCost, setTicketCost],
                ["Extra Allowance", extraAllowance, setExtraAllowance],
              ] as const
            ).map(([label, value, setter]) => (
              <div key={label}>
                <label className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  {label} <span className="text-[#ED351D]">*</span>
                </label>
                <input
                  type="number"
                  className="h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-sm"
                  placeholder="Auto-populated or manual"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                />
              </div>
            ))}
            {/* Bonus sits beside Extra Allowance. It is optional — a dispatcher
                may leave it blank (reads as zero) and it still counts into the
                configured total when filled. */}
            <div>
              <label className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Bonus <span className="text-[#627084]">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                className="h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-sm"
                placeholder="e.g. 5000"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <label className="mb-2 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Lubricant <span className="text-[#ED351D]">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-[30px]">
                {(["Diesel", "Gas"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLubricant(opt)}
                    className="flex items-center gap-3 rounded-md p-3"
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-full border shadow-[0px_4px_10px_rgba(0,0,0,0.05)]",
                        lubricant === opt ? "border-[#ED351D]" : "border-[#E2E5E9]",
                      )}
                    >
                      {lubricant === opt ? <span className="size-2.5 rounded-full bg-[#ED351D]" /> : null}
                    </span>
                    <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">{opt}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-col gap-2.5">
                <div>
                  <label className="mb-1 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Quantity</label>
                  <input
                    type="number"
                    className="h-9 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]"
                    placeholder="Auto-populated or manual"
                    value={lubricantQty}
                    onChange={(e) => setLubricantQty(e.target.value)}
                  />
                </div>
                {/* Cost is priced by the Transport Manager's rate card — Fleet Ops
                    enters the litres only and never sees the TM's rate or total. */}
                <p className="text-[11px] tracking-[0.4px] text-[#627084]">
                  Cost is applied automatically by the Transport Manager&apos;s rate card.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions — Figma: Cancel left, Confirm right */}
        <div className="flex items-center justify-between gap-4 border-t border-[#E2E5E9] pt-4">
          <button
            type="button"
            onClick={handleBackToQueue}
            className="text-[14px] font-medium text-[#ED351D] hover:underline"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 1024) {
                handleMobileConfirmDispatch();
              } else {
                void handleFinalConfirm();
              }
            }}
            className="flex h-8 items-center justify-center rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19]"
          >
            Confirm Dispatch
          </button>
        </div>

      </div>
    </div>
  );

  const renderAudit = () => (
    <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 rounded-2xl bg-white shadow-[0px_4px_24px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden self-start sticky top-8">
      {/* Audit Header */}
      <div className="p-6 pb-4 border-b border-[#e2e5e9]">
        <h2 className="text-xl font-bold tracking-tight text-[#1B2432]">Audit Configuration</h2>
        <p className="text-xs text-slate-500 font-medium tracking-wider mt-1 uppercase">
          Ticket {selectedOrder ? requestId(selectedOrder) : ""}
          {selectedOrder && companyName(selectedOrder) ? `  •  ${companyName(selectedOrder)}` : ""}
        </p>
      </div>

      <div className="p-6 space-y-6">
        
        <div className="bg-[#f4f5f7] rounded-xl p-4">
          <h4 className="text-[14px] font-bold text-[#141a1f] mb-4">Vehicle &amp; Operator Details</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Head (Cap Number):</span>
              <span className="font-semibold text-[#141a1f]">{displayHeadCap(head) || "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Head Plate Number:</span>
              <span className="font-semibold text-[#141a1f]">{head?.registration || "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Head Category:</span>
              <span className="font-semibold text-[#141a1f]">
                {head?.make && head.make !== "Unknown" ? head.make : "-"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Tail assigned:</span>
              <span className="font-semibold text-[#141a1f]">
                {tail ? `${displayTailOption(tail)}${tailNumber && tailNumber !== tail.number ? ` · ${tailNumber}` : ""}` : "-"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Body (Tail Type):</span>
              <span className="font-semibold text-[#141a1f]">
                {tail?.type || "-"}
                {selectedOrder && displayRequestedTruckType(selectedOrder)
                  ? ` — requested ${displayRequestedTruckType(selectedOrder)}`
                  : ""}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Driver Assigned:</span>
              <span className="font-semibold text-[#141a1f]">
                {driver ? displayDriverAssigned(driver, driverName) : "-"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Driver Contact Phone:</span>
              <span className="font-semibold text-[#141a1f]">{driverPhone || "-"}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#f4f5f7] rounded-xl p-4">
          <h4 className="text-[14px] font-bold text-[#141a1f] mb-4">Expense Configuration Breakdown</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Trip Allowance:</span>
              <span className="font-semibold text-[#141a1f]">{tripAllowance ? formatN(Number(tripAllowance)) : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Return Waybill:</span>
              <span className="font-semibold text-[#141a1f]">{returnWaybill ? formatN(Number(returnWaybill)) : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Motor Boy Allowance:</span>
              <span className="font-semibold text-[#141a1f]">{motorBoy ? formatN(Number(motorBoy)) : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Transit Road Tickets:</span>
              <span className="font-semibold text-[#141a1f]">{ticketCost ? formatN(Number(ticketCost)) : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Extra Allowance:</span>
              <span className="font-semibold text-[#141a1f]">{extraAllowance ? formatN(Number(extraAllowance)) : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Bonus:</span>
              <span className="font-semibold text-[#141a1f]">{bonus ? formatN(Number(bonus)) : "-"}</span>
            </div>
            <div className="border-t border-[#e2e5e9] my-2"></div>
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-bold text-[#141a1f]">Total Configured Expense:</span>
              <span className="font-bold text-[15px] text-[#f04438]">{foVisibleTotal > 0 ? formatN(foVisibleTotal) : "-"}</span>
            </div>
          </div>
        </div>
        
        {/* Mobile Audit Actions */}
        <div className="lg:hidden flex justify-between items-center pt-2">
          <button 
            onClick={() => setMobileView("form")}
            className="text-[14px] font-bold text-[#f04438] hover:text-[#d92d20]"
          >
            Go Back
          </button>
          
          <button 
            onClick={handleFinalConfirm}
            className="bg-[#f04438] hover:bg-[#d92d20] text-white h-11 px-8 rounded-lg text-[14px] font-bold shadow-sm transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex w-full flex-col bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <FigmaLoadingState label="Loading dispatch queue…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      {!selectedOrder ? (
        viewMode === "queue" ? (
          renderQueue()
        ) : (
          renderTracking()
        )
      ) : (
        <div>
          <button
            type="button"
            onClick={handleBackToQueue}
            className="mb-6 flex items-center gap-2 text-[13px] font-bold tracking-[0.4px] text-[#1B2432] transition-colors hover:text-black md:text-[14px]"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            <span className="hidden md:inline">Assign Truck and make Cost Configuration for Dispatch</span>
            <span className="text-left text-[12px] leading-tight md:hidden">
              Assign Truck and make Cost Configuration
              <br />
              for Dispatch
            </span>
          </button>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className={cn("w-full lg:flex-1", mobileView === "audit" && "hidden lg:block")}>{renderForm()}</div>
            <div className={cn("w-full lg:w-auto", mobileView === "form" && "hidden lg:block")}>{renderAudit()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
