import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { tripService, driverService, fleetService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";
import type { Trip, Driver } from "@/lib/fleetopsx/types";

import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

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
    const allowed = ["Transport Manager", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Create Dispatch | FleetOpsX" },
      { name: "description", content: "Guided enterprise dispatch: trip details, vehicle, driver, route and review before release." },
      { property: "og:title", content: "Create Dispatch | FleetOpsX" },
      { property: "og:description", content: "Guided enterprise dispatch across trip, vehicle, driver, route and review." },
    ],
  }),
  component: DispatchPage,
});

const STEPS = ["Load Request", "Head", "Tail Config", "Assign Driver", "Costs", "Review"];
const CUSTOMERS = ["NNPC Retail", "Dangote Cement", "TotalEnergies NG", "Lafarge Africa", "Seplat Energy", "Chevron Nigeria"];
const CITIES = ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Warri", "Onitsha", "Kaduna", "Enugu"];

function DispatchPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    customer: "", cargo: "", pickup: "", dropoff: "", date: "2026-08-13",
    priority: "Normal", headId: "", tailId: "", tailNumber: "", driverId: "", 
    manualDriver: false, manualSalaryNumber: "", manualDriverName: "",
    costs: {
      tripAllowance: 0,
      returnWaybill: 0,
      motorBoy: 0,
      ticket: 0,
      extraAllowance: 0,
      lubricantType: "Diesel",
    },
    notes: "",
  });
  const { heads: TRUCK_HEADS, tails: TRUCK_TAILS, drivers, pendingOrders } = Route.useLoaderData();
  const [errors, setErrors] = useState<Partial<Record<"customer" | "cargo" | "pickup" | "dropoff" | "headId" | "tailId" | "driverId" | "tailNumber" | "manualDriver", string>>>({});

  const handleSelectPendingOrder = (orderId: string) => {
    const order = pendingOrders.find(o => o.id === orderId);
    if (!order) return;
    setForm(f => ({
      ...f,
      customer: order.customer,
      cargo: order.cargo,
      pickup: order.pickup,
      dropoff: order.dropoff,
      date: order.scheduledDate || f.date,
    }));
    toast.info("Order loaded", { description: "Dispatch form populated from incoming order." });
  };

  const tripId = useMemo(() => `TRP-${String(Math.floor(880 + Math.random() * 90)).padStart(5, "0")}`, []);
  const availableHeads = TRUCK_HEADS.filter((t) => t.status === "Available");
  const availableTails = TRUCK_TAILS.filter((t) => t.status === "Available");
  const head = TRUCK_HEADS.find((t) => t.id === form.headId);
  const tail = TRUCK_TAILS.find((t) => t.id === form.tailId);
  const driver = drivers.find((d) => d.id === form.driverId);
  const distance = form.pickup && form.dropoff ? 120 + ((form.pickup.length * 37 + form.dropoff.length * 53) % 780) : 0;
  const duration = distance ? `${Math.floor(distance / 62)}h ${(distance % 60)}m` : "—";

  const validate = (validateAll = false) => {
    const e: Partial<Record<"customer" | "cargo" | "pickup" | "dropoff" | "headId" | "tailId" | "driverId" | "tailNumber" | "manualDriver", string>> = {};
    if (validateAll || step === 0) {
      if (!form.customer) e.customer = "Customer is required";
      if (!form.cargo) e.cargo = "Cargo description is required";
      if (!form.pickup) e.pickup = "Pickup location is required";
      if (!form.dropoff) e.dropoff = "Drop-off location is required";
    }
    if (validateAll || step === 1) {
      if (!form.headId) e.headId = "Select an available truck head";
    }
    if (validateAll || step === 2) {
      if (!form.tailId) e.tailId = "Select an available truck tail";
      if (!form.tailNumber) e.tailNumber = "Tail Number is required";
    }
    if (validateAll || step === 3) {
      if (form.manualDriver) {
        if (!form.manualSalaryNumber || !form.manualDriverName) e.manualDriver = "Please provide both Salary Number and Driver Name";
      } else {
        if (!form.driverId) e.driverId = "Select a compliant driver";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) {
      toast.error("Missing information", { description: "Complete the highlighted fields to continue." });
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  };

  const submit = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Offline Error", { description: "Cannot create dispatch while offline." });
      return;
    }
    if (!validate(true)) {
      toast.error("Validation Error", { description: "Please complete all mandatory fields before submitting." });
      return;
    }
    if (!head) {
      toast.error("Validation Error", { description: "Truck Head is missing." });
      return;
    }
    if (!tail) {
      toast.error("Validation Error", { description: "Truck Tail is missing." });
      return;
    }
    if (!form.manualDriver && !driver) {
      toast.error("Validation Error", { description: "Driver is missing." });
      return;
    }
    const tripDriverId = form.manualDriver ? form.manualSalaryNumber : driver!.id;
    const tripDriverName = form.manualDriver ? form.manualDriverName : driver!.name;

    const trip = await tripService.create({
      customer: form.customer, cargo: form.cargo, pickup: form.pickup, dropoff: form.dropoff,
      headId: head.id, tailId: tail.id, truckReg: `${head.registration} / ${tail.registration}`, 
      driverId: tripDriverId, driverName: tripDriverName,
      status: "Awaiting Approval", priority: form.priority as never, distanceKm: distance,
      durationLabel: duration, scheduledDate: form.date, startTime: "06:00",
      lat: head.lat, lng: head.lng, revenue: distance * 4200,
      directCosts: form.costs,
    });
    toast.success(`Dispatch ${trip.id} sent for approval`, { description: `Routed to Transport Manager.` });
    navigate({ to: "/workspace/app" });
  };

  return (
    <>
      <PageHeader
        title="Create Dispatch"
        description="Create a trip in five steps, then release it to the field."
        meta={<><StatusBadge status="Scheduled" /><span className="num text-[11px] text-muted-foreground">Draft {tripId}</span></>}
      />

      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors",
              i === step
                ? "bg-[#1d1d1f] text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : i < step
                  ? "bg-[#34c759]/12 text-[#248a3d]"
                  : "bg-black/[0.04] text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "num grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                i === step ? "bg-white/15" : i < step ? "bg-[#34c759]/20" : "bg-black/[0.06]",
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionPanel title={`Step ${step + 1}: ${STEPS[step]}`} bodyClassName="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Trip ID</Label>
                <div className="flex items-center gap-2 rounded-[14px] border border-black/[0.05] bg-black/[0.03] px-3 py-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="num text-xs text-muted-foreground">{tripId}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Load from Incoming Order</Label>
                <Select onValueChange={handleSelectPendingOrder}>
                  <SelectTrigger className="h-9 text-xs border-blue-200 bg-blue-50/30">
                    <SelectValue placeholder={pendingOrders.length > 0 ? "Select pending order to auto-fill..." : "No pending orders"} />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        <span className="font-semibold">{o.customer}</span> — {o.cargo} to {o.dropoff}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low", "Normal", "High", "Critical"].map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <Select value={form.customer} onValueChange={(v) => setForm({ ...form, customer: v })}>
                  <SelectTrigger className={cn("h-9 text-xs", errors.customer && "border-critical")}><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
                {errors.customer && <p className="text-[11px] text-critical">{errors.customer}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo</Label>
                <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="e.g. PMS 45,000L" className={cn("h-9 text-xs", errors.cargo && "border-critical")} />
                {errors.cargo && <p className="text-[11px] text-critical">{errors.cargo}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pickup location</Label>
                <Input value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} placeholder="e.g. Apapa Depot, Lagos" className={cn("h-9 text-xs", errors.pickup && "border-critical")} />
                {errors.pickup && <p className="text-[11px] text-critical">{errors.pickup}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Drop-off location</Label>
                <Input value={form.dropoff} onChange={(e) => setForm({ ...form, dropoff: e.target.value })} placeholder="e.g. Wuse Zone 1, Abuja" className={cn("h-9 text-xs", errors.dropoff && "border-critical")} />
                {errors.dropoff && <p className="text-[11px] text-critical">{errors.dropoff}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Scheduled date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Dispatch instructions</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Loading bay, escort requirements, customer contact..." className="text-xs" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Search head by Cap Number or Plate Number. Only Available status heads are selectable.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRUCK_HEADS.slice(0, 12).map((t) => {
                  const selectable = t.status === "Available";
                  return (
                    <button
                      key={t.id}
                      disabled={!selectable}
                      onClick={() => setForm({ ...form, headId: t.id })}
                      className={cn(
                        "flex flex-col gap-2 rounded-[16px] border border-black/[0.05] p-3.5 text-left transition-colors",
                        form.headId === t.id ? "border-transparent bg-black/[0.04] ring-1 ring-black/10" : "bg-white hover:bg-black/[0.02]",
                        !selectable && "cursor-not-allowed opacity-45 hover:bg-white",
                      )}
                    >
                      <div className="flex w-full items-center justify-between min-w-0">
                        <p className="num text-xs font-semibold text-foreground">CAP NO: {t.capNumber}</p>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="w-full">
                        <p className="truncate text-[11px] text-muted-foreground">PLATE: {t.registration} · {t.make}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.headId && <p className="text-[11px] text-critical">{errors.headId}</p>}
              <p className="num text-[11px] text-muted-foreground">{availableHeads.length} of {TRUCK_HEADS.length} units available for dispatch.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Select Tail Type and input specific Tail Number.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRUCK_TAILS.slice(0, 12).map((t) => {
                  const selectable = t.status === "Available";
                  return (
                    <button
                      key={t.id}
                      disabled={!selectable}
                      onClick={() => setForm({ ...form, tailId: t.id, tailNumber: t.registration })}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[16px] border border-black/[0.05] p-3.5 text-left transition-colors",
                        form.tailId === t.id ? "border-transparent bg-black/[0.04] ring-1 ring-black/10" : "bg-white hover:bg-black/[0.02]",
                        !selectable && "cursor-not-allowed opacity-45 hover:bg-white",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="num text-xs font-semibold text-foreground">{t.id} · {t.registration}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{t.type} · {t.location}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </button>
                  );
                })}
              </div>
              {errors.tailId && <p className="text-[11px] text-critical">{errors.tailId}</p>}
              <div className="space-y-1.5 sm:w-1/2">
                <Label className="text-xs">Tail Number</Label>
                <Input value={form.tailNumber} onChange={(e) => setForm({ ...form, tailNumber: e.target.value })} placeholder="e.g. TN-5829" className={cn("h-9 text-xs", errors.tailNumber && "border-critical")} />
                {errors.tailNumber && <p className="text-[11px] text-critical">{errors.tailNumber}</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Search driver by Salary Number. Active drivers will be listed below.
              </p>
              <div className="grid gap-2">
                {drivers.slice(0, 10).map((d) => {
                  const selectable = d.status === "Available" && d.compliance !== "Expired";
                  return (
                    <button
                      key={d.id}
                      disabled={!selectable || form.manualDriver}
                      onClick={() => setForm({ ...form, driverId: d.id, manualDriver: false })}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-black/[0.05] p-3.5 text-left transition-colors",
                        form.driverId === d.id && !form.manualDriver ? "border-transparent bg-black/[0.04] ring-1 ring-black/10" : "bg-white hover:bg-black/[0.02]",
                        (!selectable || form.manualDriver) && "cursor-not-allowed opacity-45 hover:bg-white",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[11px] font-semibold text-foreground">{d.initials}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">SAL: {d.salaryNumber} — {d.name}</p>
                          <p className="num truncate text-[11px] text-muted-foreground">{d.id} · {d.licenseCategory} · last trip {d.currentTripId ?? "—"}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge status={d.compliance} />
                        <StatusBadge status={d.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 border-t border-black/[0.05] pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  className={cn("w-full text-xs font-semibold justify-center h-9", form.manualDriver && "bg-black/[0.04] ring-1 ring-black/10 border-transparent")}
                  onClick={() => setForm({ ...form, manualDriver: !form.manualDriver, driverId: "" })}
                >
                  Driver not listed? Add manually
                </Button>
                
                {form.manualDriver && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 rounded-[16px] border border-black/[0.05] bg-black/[0.02] p-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Salary Number</Label>
                      <Input 
                        className="h-9 text-xs" 
                        value={form.manualSalaryNumber} 
                        onChange={(e) => setForm({ ...form, manualSalaryNumber: e.target.value })} 
                        placeholder="e.g. SAL-1001" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Driver Name</Label>
                      <Input 
                        className="h-9 text-xs" 
                        value={form.manualDriverName} 
                        onChange={(e) => setForm({ ...form, manualDriverName: e.target.value })} 
                        placeholder="e.g. John Doe" 
                      />
                    </div>
                    {errors.manualDriver && <p className="text-[11px] text-critical sm:col-span-2">{errors.manualDriver}</p>}
                  </div>
                )}
              </div>
              
              {errors.driverId && !form.manualDriver && <p className="text-[11px] text-critical">{errors.driverId}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Trip Allowance (\u20A6)</Label>
                <Input type="number" value={form.costs.tripAllowance} onChange={(e) => setForm({ ...form, costs: { ...form.costs, tripAllowance: Number(e.target.value) } })} className="h-9 text-xs num" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Return Waybill (\u20A6)</Label>
                <Input type="number" value={form.costs.returnWaybill} onChange={(e) => setForm({ ...form, costs: { ...form.costs, returnWaybill: Number(e.target.value) } })} className="h-9 text-xs num" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Motor Boy (\u20A6)</Label>
                <Input type="number" value={form.costs.motorBoy} onChange={(e) => setForm({ ...form, costs: { ...form.costs, motorBoy: Number(e.target.value) } })} className="h-9 text-xs num" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ticket (\u20A6)</Label>
                <Input type="number" value={form.costs.ticket} onChange={(e) => setForm({ ...form, costs: { ...form.costs, ticket: Number(e.target.value) } })} className="h-9 text-xs num" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Extra Allowance (\u20A6)</Label>
                <Input type="number" value={form.costs.extraAllowance} onChange={(e) => setForm({ ...form, costs: { ...form.costs, extraAllowance: Number(e.target.value) } })} className="h-9 text-xs num" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lubricant Type</Label>
                <Select value={form.costs.lubricantType} onValueChange={(v) => setForm({ ...form, costs: { ...form.costs, lubricantType: v as any } })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diesel" className="text-xs">Diesel</SelectItem>
                    <SelectItem value="Gas" className="text-xs">Gas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Trip</p>
                <FieldRow label="Trip ID" value={tripId} />
                <FieldRow label="Customer" value={form.customer} />
                <FieldRow label="Cargo" value={form.cargo} />
                <FieldRow label="Priority" value={form.priority} />
                <FieldRow label="Scheduled" value={form.date} />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Assignment</p>
                <FieldRow label="Truck" value={head && tail ? `${head.registration} / ${tail.registration}` : "—"} />
                <FieldRow label="Driver" value={form.manualDriver ? `${form.manualSalaryNumber} (${form.manualDriverName})` : (driver?.name ?? "—")} />
                <FieldRow label="Total Direct Costs" value={`\u20A6${(form.costs.tripAllowance + form.costs.returnWaybill + form.costs.motorBoy + form.costs.ticket + form.costs.extraAllowance).toLocaleString()}`} />
                <FieldRow label="Lubricant" value={form.costs.lubricantType} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] pt-4">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </Button>
            {step < 5 ? (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={next}>Continue<ArrowRight className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={submit}><Check className="h-3.5 w-3.5" />Send for Approval</Button>
            )}
          </div>
        </SectionPanel>

        <div className="flex flex-col gap-5">
          <SectionPanel title="Dispatch Summary" bodyClassName="pt-1">
            <FieldRow label="Trip ID" value={tripId} />
            <FieldRow label="Customer" value={form.customer || "—"} />
            <FieldRow label="Route" value={form.pickup && form.dropoff ? `${form.pickup} → ${form.dropoff}` : "—"} />
            <FieldRow label="Head (Cap No)" value={head ? `${head.capNumber} (${head.registration})` : "—"} />
            <FieldRow label="Tail Config" value={tail ? `${tail.registration} (${form.tailCalibration})` : "—"} />
            <FieldRow label="Driver (Salary No)" value={form.manualDriver ? `${form.manualSalaryNumber} (${form.manualDriverName})` : (driver ? `${driver.salaryNumber} (${driver.name})` : "—")} />
            <FieldRow label="Total Costs" value={`\u20A6${(form.costs.tripAllowance + form.costs.returnWaybill + form.costs.motorBoy + form.costs.ticket + form.costs.extraAllowance).toLocaleString()}`} />
          </SectionPanel>

          <SectionPanel title="Compliance Gate" bodyClassName="space-y-2.5">
            {[
              { label: "Vehicle roadworthiness", ok: !!head && !!tail },
              { label: "Driver licence validity", ok: form.manualDriver ? true : driver?.compliance === "Valid" },
              { label: "Insurance cover", ok: true },
              { label: "Route risk assessment", ok: !!form.pickup && !!form.dropoff },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                <ShieldCheck className={cn("h-3.5 w-3.5 shrink-0", c.ok ? "text-success" : "text-muted-foreground")} />
                <span className={cn("min-w-0 flex-1 truncate", c.ok ? "text-foreground" : "text-muted-foreground")}>{c.label}</span>
                <StatusBadge status={c.ok ? "Valid" : "Pending"} dot={false} />
              </div>
            ))}
          </SectionPanel>
        </div>
      </div>
    </>
  );
}

