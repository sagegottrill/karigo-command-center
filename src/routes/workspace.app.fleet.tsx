import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { redirect } from "@tanstack/react-router";
import { authService, fleetService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/fleet")({
  loader: async () => {
    const [heads, tails] = await Promise.all([
      fleetService.listHeads(),
      fleetService.listTails()
    ]);
    return { heads, tails };
  },
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Fleet & Dispatch | FleetOpsX" },
      { name: "description", content: "Fleet availability, assignment and vehicle status across the Petroline heavy transport fleet." },
      { property: "og:title", content: "Fleet & Dispatch | FleetOpsX" },
      { property: "og:description", content: "Fleet availability, assignment and vehicle status across the fleet." },
    ],
  }),
  component: FleetPage,
});

const FILTERS = ["All", "Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const;

function FleetPage() {
  const { heads: TRUCK_HEADS, tails: TRUCK_TAILS } = Route.useLoaderData();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  
  const heads = filter === "All" ? TRUCK_HEADS : TRUCK_HEADS.filter((t) => t.status === filter);
  const tails = filter === "All" ? TRUCK_TAILS : TRUCK_TAILS.filter((t) => t.status === filter);
  
  const countHead = (s: TruckHead["status"]) => TRUCK_HEADS.filter((t) => t.status === s).length;
  const countTail = (s: TruckTail["status"]) => TRUCK_TAILS.filter((t) => t.status === s).length;

  const headColumns: Column<TruckHead>[] = [
    { key: "id", header: "Head", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="num">{r.registration}</span> },
    { key: "make", header: "Make", sortValue: (r) => r.make, cell: (r) => <span className="text-muted-foreground">{r.make}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", sortValue: (r) => r.location, cell: (r) => r.location },
  ];

  const tailColumns: Column<TruckTail>[] = [
    { key: "id", header: "Tail", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="num">{r.registration}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <span className="text-muted-foreground">{r.type}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", sortValue: (r) => r.location, cell: (r) => r.location },
  ];

  return (
    <>
      <PageHeader
        title="Fleet & Dispatch"
        description="Vehicle availability, assignment state and live location across all yards."
        actions={
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/workspace/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Heads" value={TRUCK_HEADS.length} accent />
        <MetricCard label="Available Heads" value={countHead("Available")} hint="ready to dispatch" />
        <MetricCard label="Assigned Heads" value={countHead("Assigned")} />
        <MetricCard label="Total Tails" value={TRUCK_TAILS.length} accent />
        <MetricCard label="Available Tails" value={countTail("Available")} />
        <MetricCard label="Maintenance Tails" value={countTail("Maintenance")} />
      </div>

      <Tabs defaultValue="heads" className="mt-4">
        <div className="flex items-center justify-between">
          <TabsList className="h-9">
            <TabsTrigger value="heads" className="text-xs">Truck Heads</TabsTrigger>
            <TabsTrigger value="tails" className="text-xs">Truck Tails</TabsTrigger>
          </TabsList>
          <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        <TabsContent value="heads" className="mt-4">
          <SectionPanel title="Heads Register" description={`${heads.length} units`} bodyClassName="p-0">
            <DataTable
              rows={heads}
              columns={headColumns}
              searchKeys={(r) => `${r.id} ${r.registration} ${r.make} ${r.location}`}
              pageSize={12}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="tails" className="mt-4">
          <SectionPanel title="Tails Register" description={`${tails.length} units`} bodyClassName="p-0">
            <DataTable
              rows={tails}
              columns={tailColumns}
              searchKeys={(r) => `${r.id} ${r.registration} ${r.type} ${r.location}`}
              pageSize={12}
            />
          </SectionPanel>
        </TabsContent>
      </Tabs>
    </>
  );
}

