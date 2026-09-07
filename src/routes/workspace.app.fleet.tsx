import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { Button } from "@/components/ui/button";
import { X, ExternalLink } from "lucide-react";
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
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  
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
        <Button variant="outline" size="sm" onClick={() => setSelectedTrip(r)}>
          View Details
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

      {/* Dispatch Details Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col font-['Inter',sans-serif]">
            
            <div className="bg-[#1B2432] p-5 flex items-center justify-between text-white">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Dispatch Configuration</h3>
                <p className="text-xs text-slate-300 font-medium tracking-wider mt-1 uppercase">TICKET {selectedTrip.id} &bull; {selectedTrip.customer}</p>
              </div>
              <button onClick={() => setSelectedTrip(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh] bg-[#f4f5f7]">
              
              <div className="bg-white rounded-xl border border-[#e2e5e9] p-5 shadow-sm mb-5">
                <h4 className="text-[13px] font-bold text-[#141a1f] mb-4 uppercase tracking-wide border-b border-[#e2e5e9] pb-2">Vehicle & Operator Details</h4>
                <div className="space-y-3 text-[13px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Truck Head:</span>
                    <span className="font-semibold text-[#141a1f]">{selectedTrip.headId || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Head Plate Number:</span>
                    <span className="font-semibold text-[#141a1f]">{selectedTrip.truckReg || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Truck Tail assigned:</span>
                    <span className="font-semibold text-[#141a1f]">{selectedTrip.tailType ? `${selectedTrip.tailType} (${selectedTrip.tailNumber || ''})` : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-[#e2e5e9]">
                    <span className="text-[#5c6470] font-medium">Driver Assigned:</span>
                    <span className="font-semibold text-[#141a1f]">{selectedTrip.driverName || "—"} ({selectedTrip.driverId || "—"})</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#e2e5e9] p-5 shadow-sm">
                <h4 className="text-[13px] font-bold text-[#141a1f] mb-4 uppercase tracking-wide border-b border-[#e2e5e9] pb-2">Expense Breakdown</h4>
                <div className="space-y-3 text-[13px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Trip Allowance:</span>
                    <span className="font-semibold text-[#141a1f]">{formatNaira(selectedTrip.directCosts?.tripAllowance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Return Waybill:</span>
                    <span className="font-semibold text-[#141a1f]">{formatNaira(selectedTrip.directCosts?.returnWaybill)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Motor Boy Allowance:</span>
                    <span className="font-semibold text-[#141a1f]">{formatNaira(selectedTrip.directCosts?.motorBoy)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Transit Road Tickets:</span>
                    <span className="font-semibold text-[#141a1f]">{formatNaira(selectedTrip.directCosts?.ticket)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#5c6470] font-medium">Extra Contingency:</span>
                    <span className="font-semibold text-[#141a1f]">{formatNaira(selectedTrip.directCosts?.extraAllowance)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 mt-1 border-t border-[#e2e5e9]">
                    <span className="text-[#141a1f] font-bold">Total Configured Expense:</span>
                    <span className="font-bold text-rose-600 text-[15px]">
                      {formatNaira(selectedTrip.directCosts ? Object.values(selectedTrip.directCosts).filter(v => typeof v === 'number').reduce((a, b) => (a as number) + (b as number), 0) as number : 0)}
                    </span>
                  </div>
                </div>
              </div>

            </div>
            
            <div className="p-5 border-t border-[#e2e5e9] bg-white flex justify-end gap-3">
              <Button variant="outline" className="h-10 px-5 font-semibold text-sm" onClick={() => setSelectedTrip(null)}>
                Close
              </Button>
              <Button asChild className="h-10 px-5 font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Link to="/workspace/app/trips/$tripId" params={{ tripId: selectedTrip.id }}>
                  Track Journey <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
