import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DispatchLiveMap } from "@/components/fleetopsx/dispatch-live-map";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayDriverAssigned,
  displayDriverOption,
  displayHeadCap,
  displayHeadOption,
  displayTailOption,
  displayTicket,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { authService, driverService, fleetService, tripService } from "@/lib/fleetopsx/services";
import type { Driver, Trip, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, Upload } from "lucide-react";

export const Route = createFileRoute("/workspace/app/dispatch")({
  // Live JWT is browser-only — never SSR-fetch (was causing document 500 Unauthorized)
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
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
    setPendingOrders(trips.filter((t) => t.status === "Requested" || t.status === "Awaiting Approval"));
  };

  useEffect(() => {
    void refreshQueue()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load dispatch queue"))
      .finally(() => setLoading(false));
  }, []);

  const [selectedOrder, setSelectedOrder] = useState<Trip | null>(null);
  const [mobileView, setMobileView] = useState<"form" | "audit">("form");
  const [viewMode, setViewMode] = useState<"queue" | "tracking">("queue");

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
  const [lubricant, setLubricant] = useState("Diesel");

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
    (Number(extraAllowance) || 0);

  // Auto-fill logic
  useEffect(() => {
    if (driver) {
      setDriverName(driver.name);
      setDriverPhone(driver.phone);
    } else {
      setDriverName("");
      setDriverPhone("");
    }
  }, [driver]);

  useEffect(() => {
    if (tail) {
      setTailNumber(tail.number || tail.registration);
    } else {
      setTailNumber("");
    }
  }, [tail]);

  const handleMobileConfirmDispatch = () => {
    if (!headId || !driverId) {
      toast.error("Please fill all required fields before reviewing.");
      return;
    }
    setMobileView("audit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalConfirm = async () => {
    if (!head || !driver) {
      toast.error("Validation Error", { description: "Missing Truck Head or Driver information." });
      return;
    }
    
    await tripService.update(selectedOrder!.id, {
      headId: head.id,
      ...(tail?.id ? { tailId: tail.id } : {}),
      ...(tail?.number || tail?.type || selectedOrder!.tailType
        ? { tailType: tail?.number || tail?.type || selectedOrder!.tailType }
        : {}),
      tailNumber: tail?.number || tailNumber,
      truckReg: tail ? `${head.registration} / ${tail.number || tail.registration}` : head.registration,
      driverId: driver.id,
      driverName: driver.name,
      directCosts: {
        tripAllowance: Number(tripAllowance) || 0,
        returnWaybill: Number(returnWaybill) || 0,
        motorBoy: Number(motorBoy) || 0,
        ticket: Number(ticketCost) || 0,
        extraAllowance: Number(extraAllowance) || 0,
        lubricantType: lubricant === "Gas" ? "Gas" : "Diesel",
      },
      status: "Awaiting Approval",
    });
    
    toast.success(`Dispatch Configured`, {
      description: `${displayTicket(selectedOrder!)} assigned to ${displayHeadCap(head) || head.registration}`,
    });
    navigate({ to: "/workspace/app/dispatch-history" });
  };

  const handleBackToQueue = () => {
    setSelectedOrder(null);
    setMobileView("form");
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

      <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-6 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="hidden grid-cols-[81px_167px_200px_150px_119px_1fr_auto] items-center gap-[30px] border-b border-[#E2E5E9] py-2.5 md:grid">
          {["ID No.", "Date", "Company", "Product", "Truck Type", "Destination"].map((h) => (
            <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
          <span className="w-[120px]" />
        </div>

        {pendingOrders.map((trip) => (
          <div
            key={trip.id}
            className="grid grid-cols-1 items-center gap-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0 md:grid-cols-[81px_167px_200px_150px_119px_1fr_auto] md:gap-[30px]"
          >
            <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{requestId(trip)}</span>
            <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">
              {formatQueueDate(trip)}
            </span>
            <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">
              {companyName(trip)}
            </span>
            <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">{trip.cargo}</span>
            <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">{trip.tailType}</span>
            <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">{trip.dropoff}</span>
            <div className="flex items-center justify-between gap-3 md:justify-end">
              <div className="md:hidden">
                <p className="text-[14px] font-medium text-[#1B2432]">{companyName(trip) || trip.cargo}</p>
                <p className="text-[12px] text-[#5C6470]">{trip.dropoff}</p>
              </div>
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
            body="Requests waiting for truck and driver assignment will list here from the live API."
          />
        )}
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
      <div className="bg-[#1B2432] p-6 text-white">
        <h2 className="text-xl font-bold tracking-tight">Fleet Dispatch</h2>
        <p className="text-xs text-slate-300 font-medium tracking-wider mt-1 uppercase">
          Ticket {selectedOrder ? displayTicket(selectedOrder) : ""}
          {selectedOrder?.customer && selectedOrder.customer !== "Customer Portal" ? `  •  ${selectedOrder.customer}` : ""}
        </p>
      </div>

      <div className="p-5 md:p-6 space-y-6">
        
        {/* Step 1 */}
        <div>
          <h3 className="text-[15px] font-bold text-[#1B2432] mb-4 border-b border-[#e2e5e9] pb-2">Step 1: Assign Truck</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Assign Truck Head <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm focus:outline-none focus:border-blue-500"
                value={headId}
                onChange={e => setHeadId(e.target.value)}
              >
                <option value="">eg: P002</option>
                {TRUCK_HEADS.filter(h => h.status === "Available" || h.id === headId).map(h => (
                  <option key={h.id} value={h.id}>{displayHeadOption(h)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Plate Number <span className="text-red-500">*</span>
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
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Assign Truck Tail <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm focus:outline-none focus:border-blue-500"
                value={tailId}
                onChange={e => setTailId(e.target.value)}
              >
                <option value="">Select Tail (Body)</option>
                {TRUCK_TAILS.filter(t => t.status === "Available" || t.id === tailId).map(t => (
                  <option key={t.id} value={t.id}>{displayTailOption(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Tail Number <span className="text-red-500">*</span>
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
          <h3 className="text-[15px] font-bold text-[#1B2432] mb-4 border-b border-[#e2e5e9] pb-2">Step 2: Assign Driver</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Salary Number <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm focus:outline-none focus:border-blue-500"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">eg: P00851</option>
                {drivers.filter(d => d.status === "Available" || d.id === driverId).map(d => (
                  <option key={d.id} value={d.id}>{displayDriverOption(d)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Driver Name <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-sm text-sm text-[#5c6470]"
                placeholder="Auto-populated or manual"
                value={driverName}
                readOnly
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-10 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-sm text-sm text-[#5c6470]"
                placeholder="Auto-populated or manual"
                value={driverPhone}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div>
          <h3 className="text-[15px] font-bold text-[#1B2432] mb-4 border-b border-[#e2e5e9] pb-2">Step 3: Direct Cost Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Trip Allowance <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="Auto-populated or manual"
                value={tripAllowance}
                onChange={e => setTripAllowance(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Return Waybill <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="Auto-populated or manual"
                value={returnWaybill}
                onChange={e => setReturnWaybill(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Motor Boy <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="Auto-populated or manual"
                value={motorBoy}
                onChange={e => setMotorBoy(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Ticket Cost <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="Auto-populated or manual"
                value={ticketCost}
                onChange={e => setTicketCost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Extra Contingency <span className="text-red-500">*</span>
              </label>
              <input 
                type="number" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="Auto-populated or manual"
                value={extraAllowance}
                onChange={e => setExtraAllowance(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Lubricant <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm focus:outline-none focus:border-blue-500"
                value={lubricant}
                onChange={e => setLubricant(e.target.value)}
              >
                <option value="Diesel">Diesel</option>
                <option value="Gas">Gas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center gap-6 pt-4">
          <button 
            onClick={handleBackToQueue}
            className="text-[14px] font-bold text-[#f04438] hover:text-[#d92d20]"
          >
            Cancel
          </button>
          
          <button 
            onClick={() => {
              if (window.innerWidth < 1024) {
                handleMobileConfirmDispatch();
              } else {
                handleFinalConfirm();
              }
            }}
            className="bg-[#f04438] hover:bg-[#d92d20] text-white h-11 px-6 rounded-lg text-[14px] font-bold shadow-sm transition-colors"
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
              <span className="text-[#5c6470]">Truck Tail assigned:</span>
              <span className="font-semibold text-[#141a1f]">
                {tail ? `${displayTailOption(tail)}${tailNumber && tailNumber !== tail.number ? ` · ${tailNumber}` : ""}` : "-"}
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
              <span className="text-[#5c6470]">Extra Contingency:</span>
              <span className="font-semibold text-[#141a1f]">{extraAllowance ? formatN(Number(extraAllowance)) : "-"}</span>
            </div>
            <div className="border-t border-[#e2e5e9] my-2"></div>
            <div className="flex justify-between items-center">
              <span className="text-[14px] font-bold text-[#141a1f]">Total Configured Expense:</span>
              <span className="font-bold text-[15px] text-[#f04438]">{totalExpense > 0 ? formatN(totalExpense) : "-"}</span>
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
