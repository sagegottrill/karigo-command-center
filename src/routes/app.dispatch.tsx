import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/karigo/page-header";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DRIVERS, TRUCKS } from "@/lib/karigo/mock-data";
import { tripService } from "@/lib/karigo/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/dispatch")({
  head: () => ({
    meta: [
      { title: "Create Dispatch — Karigo TMS" },
      { name: "description", content: "Guided enterprise dispatch: trip details, vehicle, driver, route and review before release." },
      { property: "og:title", content: "Create Dispatch — Karigo TMS" },
      { property: "og:description", content: "Guided enterprise dispatch across trip, vehicle, driver, route and review." },
    ],
  }),
  component: DispatchPage,
});

const STEPS = ["Trip Information", "Vehicle", "Driver", "Route", "Review"];
const CUSTOMERS = ["NNPC Retail", "Dangote Cement", "TotalEnergies NG", "Lafarge Africa", "Seplat Energy", "Chevron Nigeria"];
const CITIES = ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Warri", "Onitsha", "Kaduna", "Enugu"];

function DispatchPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    customer: "", cargo: "", pickup: "", dropoff: "", date: "2026-08-13",
    priority: "Normal", truckId: "", driverId: "", notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<"customer" | "cargo" | "pickup" | "dropoff" | "truckId" | "driverId", string>>>({});

  const tripId = useMemo(() => `TRP-${String(Math.floor(880 + Math.random() * 90)).padStart(5, "0")}`, []);
  const availableTrucks = TRUCKS.filter((t) => t.status === "Available");
  const truck = TRUCKS.find((t) => t.id === form.truckId);
  const driver = DRIVERS.find((d) => d.id === form.driverId);
  const distance = form.pickup && form.dropoff ? 120 + ((form.pickup.length * 37 + form.dropoff.length * 53) % 780) : 0;
  const duration = distance ? `${Math.floor(distance / 62)}h ${(distance % 60)}m` : "—";

  const validate = () => {
    const e: Partial<Record<"customer" | "cargo" | "pickup" | "dropoff" | "truckId" | "driverId", string>> = {};
    if (step === 0) {
      if (!form.customer) e.customer = "Customer is required";
      if (!form.cargo) e.cargo = "Cargo description is required";
      if (!form.pickup) e.pickup = "Pickup location is required";
      if (!form.dropoff) e.dropoff = "Drop-off location is required";
    }
    if (step === 1 && !form.truckId) e.truckId = "Select an available truck";
    if (step === 2 && !form.driverId) e.driverId = "Select a compliant driver";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) {
      toast.error("Missing information", { description: "Complete the highlighted fields to continue." });
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const submit = async () => {
    if (!truck || !driver) return;
    const trip = await tripService.create({
      customer: form.customer, cargo: form.cargo, pickup: form.pickup, dropoff: form.dropoff,
      truckId: truck.id, truckReg: truck.registration, driverId: driver.id, driverName: driver.name,
      status: "Scheduled", priority: form.priority as never, distanceKm: distance,
      durationLabel: duration, scheduledDate: form.date, startTime: "06:00",
      lat: truck.lat, lng: truck.lng, revenue: distance * 4200,
    });
    toast.success(`Dispatch ${trip.id} created`, { description: `${truck.registration} · ${driver.name}` });
    navigate({ to: "/app/trips/$tripId", params: { tripId: trip.id } });
  };

  return (
    <>
      <PageHeader
        title="Create Dispatch"
        description="Five-step guided workflow — validated before release to the field."
        meta={<><StatusBadge status="Scheduled" /><span className="num text-[11px] text-muted-foreground">Draft {tripId}</span></>}
      />

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
              i === step ? "border-primary/50 bg-primary/10 text-primary"
                : i < step ? "border-success/40 bg-success/8 text-success" : "border-border text-muted-foreground",
            )}
          >
            <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-[10px] font-semibold">
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="truncate font-medium">{label}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionPanel title={`Step ${step + 1} — ${STEPS[step]}`} bodyClassName="space-y-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Trip ID</Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="num text-xs text-muted-foreground">{tripId} — system generated</span>
                </div>
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
                <Select value={form.pickup} onValueChange={(v) => setForm({ ...form, pickup: v })}>
                  <SelectTrigger className={cn("h-9 text-xs", errors.pickup && "border-critical")}><SelectValue placeholder="Select origin" /></SelectTrigger>
                  <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
                {errors.pickup && <p className="text-[11px] text-critical">{errors.pickup}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Drop-off location</Label>
                <Select value={form.dropoff} onValueChange={(v) => setForm({ ...form, dropoff: v })}>
                  <SelectTrigger className={cn("h-9 text-xs", errors.dropoff && "border-critical")}><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
                {errors.dropoff && <p className="text-[11px] text-critical">{errors.dropoff}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Scheduled date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Dispatch instructions</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Loading bay, escort requirements, customer contact…" className="text-xs" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Only vehicles with status <span className="text-success">Available</span> can be selected. Assigned, maintenance and out-of-service units are locked by the system.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRUCKS.slice(0, 12).map((t) => {
                  const selectable = t.status === "Available";
                  return (
                    <button
                      key={t.id}
                      disabled={!selectable}
                      onClick={() => setForm({ ...form, truckId: t.id })}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors",
                        form.truckId === t.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                        !selectable && "cursor-not-allowed opacity-45 hover:border-border",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="num text-xs font-semibold text-foreground">{t.id} · {t.registration}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{t.type} · {t.make} · {t.location}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </button>
                  );
                })}
              </div>
              {errors.truckId && <p className="text-[11px] text-critical">{errors.truckId}</p>}
              <p className="num text-[11px] text-muted-foreground">{availableTrucks.length} of {TRUCKS.length} units available for dispatch.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid gap-2">
                {DRIVERS.slice(0, 10).map((d) => {
                  const selectable = d.status === "Available" && d.compliance !== "Expired";
                  return (
                    <button
                      key={d.id}
                      disabled={!selectable}
                      onClick={() => setForm({ ...form, driverId: d.id })}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 text-left transition-colors",
                        form.driverId === d.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
                        !selectable && "cursor-not-allowed opacity-45 hover:border-border",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-foreground">{d.initials}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">{d.name}</p>
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
              {errors.driverId && <p className="text-[11px] text-critical">{errors.driverId}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pickup</Label>
                  <Input value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} className="h-9 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Destination</Label>
                  <Input value={form.dropoff} onChange={(e) => setForm({ ...form, dropoff: e.target.value })} className="h-9 text-xs" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Estimated Distance", value: `${distance} km` },
                  { label: "Estimated Duration", value: duration },
                ].map((m) => (
                  <div key={m.label} className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{m.label}</p>
                    </div>
                    <p className="num mt-1.5 text-2xl font-semibold text-foreground">{m.value}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">System generated — locked field</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised p-3 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                Route preview will render from the mapping provider once distance services are connected.
              </div>
            </div>
          )}

          {step === 4 && (
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
                <FieldRow label="Truck" value={truck ? `${truck.id} · ${truck.registration}` : "—"} />
                <FieldRow label="Driver" value={driver?.name ?? "—"} />
                <FieldRow label="Route" value={`${form.pickup} → ${form.dropoff}`} />
                <FieldRow label="Distance" value={`${distance} km`} />
                <FieldRow label="Duration" value={duration} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </Button>
            {step < 4 ? (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={next}>Continue<ArrowRight className="h-3.5 w-3.5" /></Button>
            ) : (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={submit}><Check className="h-3.5 w-3.5" />Create Dispatch</Button>
            )}
          </div>
        </SectionPanel>

        <div className="flex flex-col gap-5">
          <SectionPanel title="Dispatch Summary" bodyClassName="pt-1">
            <FieldRow label="Trip ID" value={tripId} />
            <FieldRow label="Customer" value={form.customer || "—"} />
            <FieldRow label="Route" value={form.pickup && form.dropoff ? `${form.pickup} → ${form.dropoff}` : "—"} />
            <FieldRow label="Truck" value={truck?.registration ?? "—"} />
            <FieldRow label="Driver" value={driver?.name ?? "—"} />
            <FieldRow label="Distance" value={distance ? `${distance} km` : "—"} />
          </SectionPanel>

          <SectionPanel title="Compliance Gate" bodyClassName="space-y-2.5">
            {[
              { label: "Vehicle roadworthiness", ok: !!truck },
              { label: "Driver licence validity", ok: driver?.compliance === "Valid" },
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
