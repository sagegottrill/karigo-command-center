import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { TRIPS } from "@/lib/karigo/mock-data";
import type { Trip } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/trips/")({
  head: () => ({
    meta: [
      { title: "Trips — Karigo TMS" },
      { name: "description", content: "All scheduled, active, delayed and completed trips with progress, ETA and assignment detail." },
      { property: "og:title", content: "Trips — Karigo TMS" },
      { property: "og:description", content: "Scheduled, active, delayed and completed trips with progress and ETA." },
    ],
  }),
  component: TripsPage,
});

const FILTERS = ["All", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Scheduled", "Completed"];

function TripsPage() {
  const [filter, setFilter] = useState("All");
  const navigate = useNavigate();
  const rows = filter === "All" ? TRIPS : TRIPS.filter((t) => t.status === filter);

  const columns: Column<Trip>[] = [
    { key: "id", header: "Trip", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold text-primary">{r.id}</span> },
    { key: "route", header: "Route", sortValue: (r) => r.pickup, cell: (r) => `${r.pickup} → ${r.dropoff}` },
    { key: "customer", header: "Customer", sortValue: (r) => r.customer, cell: (r) => <span className="text-muted-foreground">{r.customer}</span> },
    { key: "truck", header: "Truck", cell: (r) => <span className="num">{r.truckReg}</span> },
    { key: "driver", header: "Driver", cell: (r) => r.driverName },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", header: "Priority", sortValue: (r) => r.priority, cell: (r) => <StatusBadge status={r.priority} dot={false} /> },
    { key: "dist", header: "Distance", align: "right", sortValue: (r) => r.distanceKm, cell: (r) => <span className="num">{r.distanceKm} km</span> },
    {
      key: "progress", header: "Progress", align: "right", sortValue: (r) => r.progress,
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${r.progress}%` }} />
          </div>
          <span className="num text-[11px] text-muted-foreground">{r.progress}%</span>
        </div>
      ),
    },
  ];

  const count = (s: string) => TRIPS.filter((t) => t.status === s).length;

  return (
    <>
      <PageHeader
        title="Trips"
        description="Every dispatch under execution, with live status, progress and exceptions."
        actions={<Button asChild size="sm" className="h-8 gap-1.5 text-xs"><Link to="/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link></Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Trips" value={TRIPS.length} accent />
        <MetricCard label="En Route" value={count("En Route")} />
        <MetricCard label="Delayed" value={count("Delayed")} delta="exception" deltaTone="down" />
        <MetricCard label="Completed" value={count("Completed")} />
        <MetricCard label="Scheduled" value={count("Scheduled")} />
      </div>

      <SectionPanel title="Trip Register" description={`${rows.length} trips`} bodyClassName="p-0">
        <DataTable
          rows={rows}
          columns={columns}
          pageSize={12}
          searchKeys={(r) => `${r.id} ${r.customer} ${r.pickup} ${r.dropoff} ${r.driverName} ${r.truckReg}`}
          onRowClick={(r) => navigate({ to: "/app/trips/$tripId", params: { tripId: r.id } })}
          toolbar={
            <div className="flex flex-wrap items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    filter === f ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />
      </SectionPanel>
    </>
  );
}
