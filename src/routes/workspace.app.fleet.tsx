import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { Button } from "@/components/ui/button";
import type { Trip } from "@/lib/fleetopsx/types";
import { authService, tripService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/fleet")({
  loader: async () => {
    return await tripService.list();
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
      { title: "Manage Fleet | FleetOpsX" },
      { name: "description", content: "Manage the lifecycle of every dispatch within the company." },
    ],
  }),
  component: ManageFleetPage,
});

const FILTERS = ["All", "Awaiting Approval", "Scheduled", "En Route", "Completed"] as const;

function formatNaira(amount: number | undefined) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function ManageFleetPage() {
  const TRIPS = Route.useLoaderData();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  
  const filteredTrips = filter === "All" ? TRIPS : TRIPS.filter(t => t.status === filter);
  
  const countByStatus = (status: string) => TRIPS.filter(t => t.status === status).length;

  const tripColumns: Column<Trip>[] = [
    { 
      key: "id", 
      header: "Ticket ID", 
      sortValue: (r) => r.id, 
      cell: (r) => (
        <div>
          <div className="font-semibold text-[#141a1f]">{r.id}</div>
          <div className="text-xs text-slate-500">{r.customer}</div>
        </div>
      ) 
    },
    { 
      key: "truck", 
      header: "Asset Assigned", 
      sortValue: (r) => r.truckReg, 
      cell: (r) => (
        <div>
          <div className="font-medium text-[#141a1f]">{r.headId || "—"}</div>
          <div className="text-xs text-slate-500">{r.truckReg || "—"}</div>
        </div>
      ) 
    },
    { 
      key: "driver", 
      header: "Driver", 
      sortValue: (r) => r.driverName, 
      cell: (r) => (
        <div>
          <div className="font-medium text-[#141a1f]">{r.driverName || "—"}</div>
          <div className="text-xs text-slate-500">{r.driverId || "—"}</div>
        </div>
      ) 
    },
    { 
      key: "expenses", 
      header: "Total Expenses", 
      align: "right",
      sortValue: (r) => {
        const c = r.directCosts;
        return c ? c.tripAllowance + c.returnWaybill + c.motorBoy + c.ticket + c.extraAllowance : 0;
      }, 
      cell: (r) => {
        const c = r.directCosts;
        if (!c) return "—";
        const total = c.tripAllowance + c.returnWaybill + c.motorBoy + c.ticket + c.extraAllowance;
        return <span className="font-medium text-rose-600">{formatNaira(total)}</span>;
      } 
    },
    { 
      key: "status", 
      header: "Status", 
      sortValue: (r) => r.status, 
      cell: (r) => <StatusBadge status={r.status} /> 
    },
    { 
      key: "actions", 
      header: "", 
      align: "right", 
      cell: (r) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/workspace/app/trips/$tripId" params={{ tripId: r.id }}>View Details</Link>
        </Button>
      ) 
    }
  ];

  return (
    <>
      <PageHeader
        title="Manage Fleet"
        description="View and manage all active dispatch tickets and trip life-cycles."
        actions={
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white">
            <Link to="/workspace/app/dispatch"><Plus className="h-3.5 w-3.5" />New Dispatch</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Dispatches" value={TRIPS.length} accent />
        <MetricCard label="Awaiting Approval" value={countByStatus("Awaiting Approval")} hint="Needs review" />
        <MetricCard label="Scheduled" value={countByStatus("Scheduled")} />
        <MetricCard label="En Route" value={countByStatus("En Route")} />
        <MetricCard label="Completed" value={countByStatus("Completed")} />
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-[#141a1f]">Dispatch Register</h2>
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <SectionPanel className="mt-4" bodyClassName="p-0">
        <DataTable
          rows={filteredTrips}
          columns={tripColumns}
          searchKeys={(r) => `${r.id} ${r.customer} ${r.truckReg} ${r.driverName} ${r.status}`}
          pageSize={12}
        />
      </SectionPanel>
    </>
  );
}
