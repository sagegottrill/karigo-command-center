import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/trips/")({
  loader: () => tripService.list(),
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Trips | FleetOpsX" },
      { name: "description", content: "All scheduled, active, delayed and completed trips with progress, ETA and assignment detail." },
      { property: "og:title", content: "Trips | FleetOpsX" },
      { property: "og:description", content: "Scheduled, active, delayed and completed trips with progress and ETA." },
    ],
  }),
  component: TripsPage,
});

const FILTERS = ["All", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Scheduled", "Completed"] as const;

function TripsPage() {
  const TRIPS = Route.useLoaderData();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const navigate = useNavigate();
  const rows = filter === "All" ? TRIPS : TRIPS.filter((t) => t.status === filter);

  const columns: Column<Trip>[] = [
    { key: "id", header: "Trip", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold text-foreground">{r.id}</span> },
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
            <div className="h-full rounded-full bg-[#1d1d1f]" style={{ width: `${r.progress}%` }} />
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
        description="Live trips with status, progress and delays."
        actions={<Button asChild size="sm" className="h-8 gap-1.5 text-xs"><Link to="/workspace/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link></Button>}
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
          onRowClick={(r) => navigate({ to: "/workspace/app/trips/$tripId", params: { tripId: r.id } })}
          toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
        />
      </SectionPanel>
    </>
  );
}

