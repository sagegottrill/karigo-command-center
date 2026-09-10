import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { authService, driverService, fleetService, tripService } from "@/lib/fleetopsx/services";
import type { Trip, Driver, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { redirect } from "@tanstack/react-router";
import { ChevronLeft, ArrowUpRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { DispatchLiveMap } from "@/components/fleetopsx/dispatch-live-map";

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

const formatN = (num: number) => {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

function DispatchPage() {
  const navigate = useNavigate();
  const { heads: TRUCK_HEADS, tails: TRUCK_TAILS, drivers, pendingOrders } = Route.useLoaderData();
  
  const router = useRouter();
  const [selectedOrder, setSelectedOrder] = useState<Trip | null>(null);
  const [mobileView, setMobileView] = useState<"form" | "audit">("form");
  const [viewMode, setViewMode] = useState<"queue" | "tracking">("queue");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTrip, setNewTrip] = useState({ customer: "", cargo: "", pickup: "", dropoff: "" });

  const handleCreateTrip = async () => {
    if (!newTrip.customer || !newTrip.pickup || !newTrip.dropoff) {
      toast.error("Please fill in customer, pickup, and dropoff.");
      return;
    }
    await tripService.create({
      customer: newTrip.customer,
      cargo: newTrip.cargo || "General Cargo",
      pickup: newTrip.pickup,
      dropoff: newTrip.dropoff,
      priority: "Normal",
      distanceKm: 150,
      durationLabel: "2 days",
      scheduledDate: new Date().toLocaleDateString(),
      startTime: "08:00",
      lat: 6.524,
      lng: 3.379,
      revenue: 150000,
      status: "Requested",
    } as any);
    toast.success("Trip requested successfully! Sent to Approvals.");
    setIsCreateOpen(false);
    setNewTrip({ customer: "", cargo: "", pickup: "", dropoff: "" });
    router.invalidate();
  };

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
    
    // Update the existing trip record in the store instead of creating a new one
    await tripService.update(selectedOrder!.id, {
      headId: head.id,
      tailId: tail.id,
      tailType: tail.type,
      tailNumber: tail.number,
      truckReg: `${head.registration} / ${tail.registration}`,
      driverId: driver.id,
      driverName: driver.name,
      directCosts: {
        tripAllowance: Number(tripAllowance) || 0,
        returnWaybill: Number(returnWaybill) || 0,
        motorBoy: Number(motorBoy) || 0,
        ticket: Number(ticketCost) || 0,
        extraAllowance: Number(extraAllowance) || 0,
        lubricantType: lubricant,
      },
      status: "Awaiting Approval",
    });
    
    toast.success(`Dispatch Configured`, { description: `${selectedOrder!.id} assigned to ${head.registration}` });
    navigate({ to: "/workspace/app/dispatch-history" });
  };

  const handleBackToQueue = () => {
    setSelectedOrder(null);
    setMobileView("form");
  };

  const activeTrips = pendingOrders;

  const queueColumns: Column<Trip>[] = [
    { key: "id", header: "ID No.", sortValue: (r) => r.id, cell: (r) => <span className="font-semibold text-[#5c6470]">{r.id}</span> },
    { key: "customer", header: "Customer Name", sortValue: (r) => r.customer, cell: (r) => <span className="font-semibold text-[#141a1f]">{r.customer}</span> },
    { key: "cargo", header: "Product", sortValue: (r) => r.cargo, cell: (r) => <span className="font-semibold text-[#141a1f]">{r.cargo}</span> },
    { key: "truckType", header: "Truck Type", sortValue: () => "Flat", cell: () => <span className="font-semibold text-[#141a1f]">Flat</span> },
    { key: "pickup", header: "Pickup Location", sortValue: (r) => r.pickup, cell: (r) => <span className="text-[#5c6470]">{r.pickup}</span> },
    { key: "dropoff", header: "Destination", sortValue: (r) => r.dropoff, cell: (r) => <span className="text-[#5c6470]">{r.dropoff}</span> },
    {
      key: "action",
      header: "Action",
      cell: (r) => (
        <button 
          onClick={() => setSelectedOrder(r)}
          className="bg-[#1B2432] hover:bg-black text-white text-[12px] font-medium h-8 px-4 rounded-[4px] flex items-center gap-1.5 transition-colors"
        >
          Assign Dispatch
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )
    }
  ];

  const renderQueue = () => (
    <div className="w-full mt-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        {/* Toggle Button for mobile and desktop */}
        <div className="flex bg-white rounded-md border border-[#e2e5e9] p-1 shadow-sm shrink-0 w-full sm:w-auto">
          <button 
            onClick={() => setViewMode("queue")}
            className={cn("px-5 py-2 sm:py-1.5 text-[13px] font-semibold rounded-[4px] transition-colors flex-1 sm:flex-none", viewMode === "queue" ? "bg-[#ea3a3d] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
          >
            Dispatch Queue
          </button>
          <button 
            onClick={() => setViewMode("tracking")}
            className={cn("px-5 py-2 sm:py-1.5 text-[13px] font-semibold rounded-[4px] transition-colors flex-1 sm:flex-none", viewMode === "tracking" ? "bg-[#ea3a3d] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
          >
            Dispatch Live Tracking
          </button>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-[36px] sm:h-[40px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] px-4 text-[13px] sm:text-[14px] font-[500] text-white shadow-none transition-colors ml-auto sm:ml-0">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Dispatch
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Trip Request</DialogTitle>
              <DialogDescription>
                Initiate a new dispatch request for Transport Manager approval.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customer" className="text-right">Customer</Label>
                <Input id="customer" value={newTrip.customer} onChange={(e) => setNewTrip({...newTrip, customer: e.target.value})} placeholder="e.g. Dangote Refinery" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cargo" className="text-right">Cargo</Label>
                <Input id="cargo" value={newTrip.cargo} onChange={(e) => setNewTrip({...newTrip, cargo: e.target.value})} placeholder="e.g. AGO" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pickup" className="text-right">Pickup</Label>
                <Input id="pickup" value={newTrip.pickup} onChange={(e) => setNewTrip({...newTrip, pickup: e.target.value})} placeholder="e.g. Lagos" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dropoff" className="text-right">Dropoff</Label>
                <Input id="dropoff" value={newTrip.dropoff} onChange={(e) => setNewTrip({...newTrip, dropoff: e.target.value})} placeholder="e.g. Abuja" className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTrip} className="bg-[#1d1d1f] text-white">Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 mb-4 md:hidden">
        <h2 className="text-lg font-bold text-[#141a1f]">Fleet Register</h2>
        <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
          {pendingOrders.length}
        </span>
      </div>
      
      <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden hidden md:block">
        <div className="p-4 border-b border-[#e2e5e9] flex items-center gap-2">
          <h2 className="text-lg font-bold text-[#141a1f]">Dispatch Queue</h2>
          <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
            {pendingOrders.length}
          </span>
        </div>
        <DataTable
          rows={pendingOrders.slice(0, 4)} 
          columns={queueColumns}
          pageSize={10}
        />
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden flex flex-col gap-3 pb-24">
        {pendingOrders.map(r => (
          <div key={r.id} className="bg-white rounded-[8px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9]">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-[11px] text-[#5c6470] mb-1">02 Sept 2026</div>
                <h3 className="font-bold text-[#1a2332] text-[15px]">{r.customer}</h3>
              </div>
              <button 
                onClick={() => setSelectedOrder(r)}
                className="bg-[#1B2432] hover:bg-black text-white text-[11px] font-medium h-7 px-3 rounded-[4px] flex items-center gap-1.5 transition-colors"
              >
                Assign Dispatch
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-y-1.5 text-[13px]">
              <span className="text-[#5c6470]">ID No:</span>
              <span className="text-[#ea3a3d] font-semibold">{r.id}</span>
              
              <span className="text-[#5c6470]">Product:</span>
              <span className="text-[#3c4250]">{r.cargo}</span>
              
              <span className="text-[#5c6470]">Truck Type:</span>
              <span className="text-[#3c4250]">Flat</span>
              
              <span className="text-[#5c6470]">Destination:</span>
              <span className="text-[#3c4250]">{r.dropoff}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="w-full rounded-md bg-white shadow-[0px_4px_24px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden flex-1">
      {/* Form Header */}
      <div className="bg-[#1B2432] p-6 text-white">
        <h2 className="text-xl font-bold tracking-tight">Fleet Dispatch</h2>
        <p className="text-xs text-slate-300 font-medium tracking-wider mt-1 uppercase">TICKET REQ-8126 &bull; SABA STEEL</p>
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
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm"
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
                className="w-full h-10 px-3 bg-white border border-[#e2e5e9] rounded-sm text-sm focus:outline-none focus:border-blue-500"
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
                <option value="PMS">PMS</option>
                <option value="AGO">AGO</option>
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

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col font-['Inter',sans-serif]">
      {/* Desktop Page Header */}
      <div className="hidden md:flex w-full bg-white border-b border-[#e2e5e9] px-6 py-4 mb-6 flex-col justify-center">
        <h1 className="text-xl font-bold text-[#141a1f]">Fleet Operations Portal</h1>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Manage the lifecycle of every dispatch within the company</p>
      </div>
      
      <div className="px-4 md:px-6 pb-10 flex-1 max-w-[1400px] w-full mx-auto">
        {/* Mobile Page Header */}
        <div className="md:hidden mt-4 mb-6">
          <h1 className="text-[22px] font-bold text-[#141a1f]">Fleet Dispatch</h1>
          <p className="text-[13px] text-slate-500 leading-snug mt-1.5">
            Dispatch vehicles, assign trips to drivers and track live fleet status.
          </p>
        </div>

        {!selectedOrder ? (
          viewMode === "queue" ? renderQueue() : (
            <div className="w-full mt-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                {/* Toggle Button for mobile and desktop */}
                <div className="flex bg-white rounded-md border border-[#e2e5e9] p-1 shadow-sm shrink-0 w-full sm:w-auto">
                  <button 
                    onClick={() => setViewMode("queue")}
                    className={cn("px-5 py-2 sm:py-1.5 text-[13px] font-semibold rounded-[4px] transition-colors flex-1 sm:flex-none", viewMode === "queue" ? "bg-[#ea3a3d] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
                  >
                    Dispatch Queue
                  </button>
                  <button 
                    onClick={() => setViewMode("tracking")}
                    className={cn("px-5 py-2 sm:py-1.5 text-[13px] font-semibold rounded-[4px] transition-colors flex-1 sm:flex-none", viewMode === "tracking" ? "bg-[#ea3a3d] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
                  >
                    Dispatch Live Tracking
                  </button>
                </div>
              </div>
              <DispatchLiveMap trips={activeTrips} />
            </div>
          )
        ) : (
          <div>
            <button 
              onClick={handleBackToQueue} 
              className="flex items-center gap-2 text-[13px] md:text-[14px] font-bold text-[#141a1f] mb-6 hover:text-black transition-colors"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5}/>
              <span className="hidden md:inline">Assign Truck and make Cost Configuration for Dispatch</span>
              <span className="md:hidden text-[12px] leading-tight text-left">Assign Truck and make Cost Configuration<br/>for Dispatch</span>
            </button>
            <div className="flex flex-col lg:flex-row gap-6">
              <div className={cn("w-full lg:flex-1", mobileView === "audit" && "hidden lg:block")}>
                {renderForm()}
              </div>
              <div className={cn("w-full lg:w-auto", mobileView === "form" && "hidden lg:block")}>
                {renderAudit()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
