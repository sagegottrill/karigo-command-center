import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { authService, driverService, fleetService, tripService } from "@/lib/fleetopsx/services";
import type { Trip, Driver, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { redirect } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/dispatch")({
  loader: async () => {
    const [heads, tails, drivers, trips] = await Promise.all([
      fleetService.listHeads(),
      fleetService.listTails(),
      driverService.list(),
      tripService.list()
    ]);
    return {
      heads,
      tails,
      drivers,
      pendingOrders: trips.filter(t => t.status === "Approved for Dispatch")
    };
  },
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Create Dispatch | FleetOpsX" },
      { name: "description", content: "Assign truck and make cost configuration for dispatch." },
    ],
  }),
  component: DispatchPage,
});

// A simple utility for Naira formatting
const formatN = (num: number) => {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

function DispatchPage() {
  const navigate = useNavigate();
  const { heads: TRUCK_HEADS, tails: TRUCK_TAILS, drivers, pendingOrders } = Route.useLoaderData();
  
  // State for mobile view transition (Form -> Audit)
  const [mobileView, setMobileView] = useState<"form" | "audit">("form");

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
      setTailNumber(tail.registration);
    } else {
      setTailNumber("");
    }
  }, [tail]);

  const handleMobileConfirmDispatch = () => {
    if (!headId || !tailId || !driverId) {
      toast.error("Please fill all required fields before reviewing.");
      return;
    }
    setMobileView("audit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalConfirm = async () => {
    if (!head || !tail || !driver) {
      toast.error("Validation Error", { description: "Missing Truck or Driver information." });
      return;
    }
    
    // Using dummy customer/cargo since Figma mocks it, but we can pull from pendingOrders if we wanted.
    // For now we will just create a generic trip to satisfy the UI requirement.
    const trip = await tripService.create({
      customer: "SABA STEEL", cargo: "General Freight", pickup: "Lagos", dropoff: "Abuja",
      headId: head.id, tailId: tail.id, truckReg: `${head.registration} / ${tail.registration}`, 
      driverId: driver.id, driverName: driver.name,
      status: "Awaiting Approval", priority: "Normal", distanceKm: 700,
      durationLabel: "12h 0m", scheduledDate: new Date().toISOString().split('T')[0], startTime: "06:00",
      lat: head.lat, lng: head.lng, revenue: 800000,
      directCosts: {
        tripAllowance: Number(tripAllowance) || 0,
        returnWaybill: Number(returnWaybill) || 0,
        motorBoy: Number(motorBoy) || 0,
        ticket: Number(ticketCost) || 0,
        extraAllowance: Number(extraAllowance) || 0,
        lubricantType: lubricant,
      },
    });
    
    toast.success(`Dispatch Request Created`);
    navigate({ to: "/workspace/app/fleet" });
  };

  const renderForm = () => (
    <div className="w-full rounded-2xl bg-white shadow-[0px_4px_24px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden flex-1">
      {/* Form Header */}
      <div className="bg-[#1B2432] p-6 text-white">
        <h2 className="text-xl font-bold tracking-tight">Fleet Dispatch</h2>
        <p className="text-xs text-slate-300 font-medium tracking-wider mt-1 uppercase">TICKET REQ-8126 &bull; SABA STEEL</p>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        
        {/* Step 1 */}
        <div>
          <h3 className="text-[15px] font-bold text-[#1B2432] mb-4 border-b border-[#e2e5e9] pb-2">Step 1: Assign Truck</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Assign Truck Head <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={headId}
                onChange={e => setHeadId(e.target.value)}
              >
                <option value="">eg: CAP-101</option>
                {TRUCK_HEADS.filter(h => h.status === "Available" || h.id === headId).map(h => (
                  <option key={h.id} value={h.id}>{h.id} ({h.registration})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Plate Number <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-11 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-lg text-sm text-[#5c6470]"
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
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={tailId}
                onChange={e => setTailId(e.target.value)}
              >
                <option value="">Select Tail Type</option>
                {TRUCK_TAILS.filter(t => t.status === "Available" || t.id === tailId).map(t => (
                  <option key={t.id} value={t.id}>{t.type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Tail Number <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm"
                placeholder="eg: TL-999"
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
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
              >
                <option value="">Select</option>
                {drivers.filter(d => d.status === "Available" || d.id === driverId).map(d => (
                  <option key={d.id} value={d.id}>{d.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#141a1f] mb-1.5">
                Driver Name <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                className="w-full h-11 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-lg text-sm text-[#5c6470]"
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
                className="w-full h-11 px-3 bg-[#f4f5f7] border border-[#e2e5e9] rounded-lg text-sm text-[#5c6470]"
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
                className="w-full h-11 px-3 bg-white border border-[#e2e5e9] rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={lubricant}
                onChange={e => setLubricant(e.target.value)}
              >
                <option value="Diesel">Diesel</option>
                <option value="PMS">PMS</option>
                <option value="AGO">AGO</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end items-center gap-6 pt-4">
          <button 
            onClick={() => navigate({ to: "/workspace/app" })}
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
        <p className="text-xs text-slate-500 font-medium tracking-wider mt-1 uppercase">TICKET REQ-8126 &bull; SABA STEEL</p>
      </div>

      <div className="p-6 space-y-6">
        
        <div className="bg-[#f4f5f7] rounded-xl p-4">
          <h4 className="text-[14px] font-bold text-[#141a1f] mb-4">Vehicle &amp; Operator Details</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Head (Cap Number):</span>
              <span className="font-semibold text-[#141a1f]">{head?.id || "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Head Plate Number:</span>
              <span className="font-semibold text-[#141a1f]">{head?.registration || "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Truck Tail assigned:</span>
              <span className="font-semibold text-[#141a1f]">{tail ? `${tail.type} (${tailNumber})` : "-"}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#5c6470]">Driver Assigned:</span>
              <span className="font-semibold text-[#141a1f]">{driver ? `${driverName} (${driverId})` : "-"}</span>
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

  // Top header to match Figma
  const headerContent = (
    <div className="w-full bg-white border-b border-[#e2e5e9] px-6 py-4 mb-6">
      <h1 className="text-2xl font-semibold text-[#141a1f]">Fleet Operations Portal</h1>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Manage the lifecycle of every dispatch within the company</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f5f7] -m-6 flex flex-col font-['Inter',sans-serif]">
      {headerContent}
      
      <div className="px-6 pb-10 flex-1 max-w-[1400px] w-full mx-auto">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Mobile view handling */}
          <div className={cn("w-full lg:flex-1", mobileView === "audit" && "hidden lg:block")}>
            {renderForm()}
          </div>
          
          <div className={cn("w-full lg:w-auto", mobileView === "form" && "hidden lg:block")}>
            {renderAudit()}
          </div>
        </div>
      </div>
    </div>
  );
}
