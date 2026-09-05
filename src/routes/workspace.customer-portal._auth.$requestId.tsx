import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip, TimelineStep } from "@/lib/fleetopsx/types";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Navigation, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/$requestId")({
  component: RequestTrackingPage,
});

function RequestTrackingPage() {
  const { requestId } = Route.useParams();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);

  useEffect(() => {
    tripService.get(requestId).then((t) => {
      setTrip(t);
      if (t) setTimeline(tripService.timeline(t));
    });
  }, [requestId]);

  if (!trip) return <div className="p-12 text-center text-muted-foreground">Loading request details...</div>;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3 gap-2 text-muted-foreground hover:text-foreground">
          <Link to="/workspace/customer-portal/dashboard"><ArrowLeft className="h-4 w-4" /> Back to Dashboard</Link>
        </Button>
        <PageHeader
          title={`Request ${trip.id}`}
          description={`Delivery to ${trip.dropoff}`}
          meta={<StatusBadge status={trip.status} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Details */}
        <div className="space-y-6 lg:col-span-1">
          <SectionPanel title="Original Request" bodyClassName="pt-1">
            <FieldRow label="Customer" value={trip.customerConsignee || "—"} />
            <FieldRow label="Cargo Details" value={trip.cargo} />
            <FieldRow label="Loading Location(s)" value={trip.loadingRoutingType === "Multiple" && trip.loadingSite ? trip.loadingSite.join(", ") : trip.pickup} />
            <FieldRow label="Final Destination" value={trip.dropoff} />
            <FieldRow label="Scheduled Date" value={trip.scheduledDate || "—"} />
          </SectionPanel>

          {trip.status !== "Requested" && trip.status !== "Scheduled" ? (
            <SectionPanel title="Fulfillment Details" bodyClassName="pt-1 bg-[#f8f9fa]">
              <div className="mb-3 rounded-md bg-blue-50 p-3 text-xs text-blue-800 flex gap-2 items-start">
                <Truck className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Your request has been approved and assets have been deployed. See assigned details below.</span>
              </div>
              <FieldRow label="Driver Name" value={trip.driverName || "—"} />
              <FieldRow label="Driver Phone" value="+234 800 000 0000" />
              <div className="mt-4 border-t border-black/[0.05] pt-4">
                <FieldRow label="Truck Head" value={trip.truckReg.split(" / ")[0] || "—"} />
                <FieldRow label="Truck Tail" value={`${trip.tailType || "—"} / ${trip.truckReg.split(" / ")[1] || "—"}`} />
                <FieldRow label="Serial Number" value={`SN-${trip.id?.split("-")[1] || "0000"}`} />
              </div>
            </SectionPanel>
          ) : (
            <SectionPanel title="Fulfillment Details" bodyClassName="pt-1">
              <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                Awaiting final asset and driver assignment from Transport Manager.
              </div>
            </SectionPanel>
          )}

          <SectionPanel title="Milestones" bodyClassName="p-4">
            <div className="relative space-y-4 before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-border">
              {timeline.map((step, i) => (
                <div key={i} className={cn("relative flex items-center gap-4 text-sm", step.state === "pending" && "opacity-40")}>
                  <div className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background ring-2", step.state === "current" ? "ring-primary" : step.state === "done" ? "ring-[#34c759]" : "ring-muted")}>
                    <div className={cn("h-2 w-2 rounded-full", step.state === "current" ? "bg-primary animate-pulse" : step.state === "done" ? "bg-[#34c759]" : "bg-muted")} />
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-medium", step.state === "current" ? "text-primary" : "text-foreground")}>{step.label}</p>
                    {step.at && <p className="text-xs text-muted-foreground">{step.at}</p>}
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>
        </div>

        {/* Right Column: Live Map Integration */}
        <div className="lg:col-span-2">
          <SectionPanel title="Live Tracking Map" description="Real-time GPS telemetry from assigned asset." bodyClassName="p-0">
            {trip.status === "Requested" || trip.status === "Scheduled" ? (
              <div className="flex h-[500px] flex-col items-center justify-center bg-[#f5f5f7] p-6 text-center">
                <MapPin className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <h3 className="text-sm font-semibold">Map Offline</h3>
                <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                  Live tracking will automatically activate once a vehicle is dispatched from the depot.
                </p>
              </div>
            ) : (
              <div className="relative h-[500px] w-full overflow-hidden bg-[#e5e5ea]">
                {/* Simulated Map Background */}
                <div className="absolute inset-0 bg-slate-300 opacity-60 mix-blend-multiply grayscale" />
                
                {/* Simulated Map Route & Vehicle */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative h-[300px] w-[400px]">
                    <svg className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
                      <path d="M 50,250 C 100,200 200,250 250,150 C 300,50 350,100 380,50" fill="none" stroke="#0071e3" strokeWidth="4" strokeDasharray="8 4" className="animate-[dash_20s_linear_infinite]" />
                    </svg>
                    <div className="absolute bottom-10 left-10 flex -translate-x-1/2 translate-y-1/2 flex-col items-center gap-1">
                      <div className="rounded border border-black/10 bg-white px-2 py-1 text-[10px] font-bold shadow-sm">{trip.pickup.split(',')[0]}</div>
                      <div className="h-3 w-3 rounded-full border-2 border-white bg-black shadow-sm" />
                    </div>
                    <div className="absolute right-5 top-12 flex -translate-x-1/2 translate-y-1/2 flex-col items-center gap-1">
                      <div className="rounded border border-black/10 bg-white px-2 py-1 text-[10px] font-bold shadow-sm">{trip.dropoff.split(',')[0]}</div>
                      <div className="grid h-4 w-4 place-items-center rounded-full bg-[#34c759] shadow-sm ring-2 ring-white">
                        <MapPin className="h-2.5 w-2.5 text-white" />
                      </div>
                    </div>
                    
                    {/* Simulated Truck Blip */}
                    <div className="absolute left-[200px] top-[180px] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
                      <div className="flex items-center gap-1 rounded bg-[#1d1d1f] px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#34c759] animate-pulse" />
                        {trip.truckReg.split(" / ")[0]}
                      </div>
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-[0_0_15px_rgba(0,113,227,0.3)] ring-2 ring-[#0071e3]">
                        <Navigation className="h-4 w-4 text-[#0071e3] rotate-45" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map Overlay Stats */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur-md">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Current Speed</p>
                    <p className="font-mono text-xl font-semibold">42 <span className="text-sm text-muted-foreground">km/h</span></p>
                  </div>
                  <div className="h-10 w-px bg-black/10" />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">ETA</p>
                    <p className="font-mono text-xl font-semibold">{trip.eta}</p>
                  </div>
                  <div className="h-10 w-px bg-black/10" />
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                    <p className="text-sm font-semibold text-primary">{trip.status}</p>
                  </div>
                </div>
              </div>
            )}
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

