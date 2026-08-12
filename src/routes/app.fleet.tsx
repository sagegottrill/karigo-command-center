import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/karigo/filter-pills";
import { TRUCKS } from "@/lib/karigo/mock-data";
import type { Truck } from "@/lib/karigo/types";

export const Route = createFileRoute("/app/fleet")({
  head: () => ({
    meta: [
      { title: "Fleet & Dispatch | Karigo" },
      { name: "description", content: "Fleet availability, assignment and vehicle status across the Petroline heavy transport fleet." },
      { property: "og:title", content: "Fleet & Dispatch | Karigo" },
      { property: "og:description", content: "Fleet availability, assignment and vehicle status across the fleet." },
    ],
  }),
  component: FleetPage,
});

const FILTERS = ["All", "Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const;

function FleetPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const rows = filter === "All" ? TRUCKS : TRUCKS.filter((t) => t.status === filter);
  const count = (s: Truck["status"]) => TRUCKS.filter((t) => t.status === s).length;

  const columns: Column<Truck>[] = [
    { key: "id", header: "Truck", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="num">{r.registration}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <span className="text-muted-foreground">{r.type}</span> },
    { key: "driver", header: "Driver", cell: (r) => r.driverName ?? <span className="text-muted-foreground">Unassigned</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", sortValue: (r) => r.location, cell: (r) => r.location },
    { key: "trip", header: "Trip", cell: (r) => (r.tripId ? <span className="num font-semibold text-foreground">{r.tripId}</span> : <span className="text-muted-foreground">—</span>) },
    {
      key: "action", header: "Action", align: "right",
      cell: (r) => (
        <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
          {r.tripId ? (
            <Link to="/app/trips/$tripId" params={{ tripId: r.tripId }}>View trip</Link>
          ) : (
            <Link to="/app/dispatch">Dispatch</Link>
          )}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fleet & Dispatch"
        description="Vehicle availability, assignment state and live location across all yards."
        actions={
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Trucks" value={TRUCKS.length} accent />
        <MetricCard label="Available" value={count("Available")} hint="ready to dispatch" />
        <MetricCard label="Assigned" value={count("Assigned")} />
        <MetricCard label="In Transit" value={count("In Transit")} />
        <MetricCard label="Maintenance" value={count("Maintenance")} hint="workshop" />
        <MetricCard label="Out of Service" value={count("Out of Service")} />
      </div>

      <SectionPanel title="Fleet Register" description={`${rows.length} vehicles`} bodyClassName="p-0">
        <DataTable
          rows={rows}
          columns={columns}
          searchKeys={(r) => `${r.id} ${r.registration} ${r.type} ${r.driverName ?? ""} ${r.location}`}
          pageSize={12}
          toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
        />
      </SectionPanel>
    </>
  );
}
