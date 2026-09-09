import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { authService, fleetService } from "@/lib/fleetopsx/services";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import type { TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/workspace/app/fleet")({
  loader: async () => {
    let heads = [];
    try {
      const rawTrucks = await fetchApi('/trucks');
      heads = rawTrucks.map((t: any) => ({
        id: t.id,
        number: t.cabId,
        registration: t.registration,
        make: t.category || "Unknown Category",
        year: 2024,
        status: t.status === "Active" ? "Available" : "Out of Service",
        location: t.destination || "Depot",
        odometer: 0,
        standardEfficiency: 0,
        lastMaintenance: new Date().toISOString().split('T')[0],
      }));
    } catch(e) {
      console.warn("Live API failed, using mock", e);
      heads = await fleetService.listHeads();
    }
    const tails = await fleetService.listTails();
    return { heads, tails };
  },
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Fleet Registry | FleetOpsX" },
      { name: "description", content: "Manage fleet availability, dispatch, and live location" },
    ],
  }),
  component: FleetRegistryPage,
});

const FILTERS = ["All", "Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const;

function FleetRegistryPage() {
  const { heads, tails } = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState<"head" | "tail">("head");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const countHeads = (status?: string) => status ? heads.filter(h => h.status === status).length : heads.length;
  const countTails = (status?: string) => status ? tails.filter(t => t.status === status).length : tails.length;

  const filteredHeads = heads.filter(h => {
    if (filter !== "All" && h.status !== filter) return false;
    if (searchQuery && !`${h.number} ${h.registration} ${h.status}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredTails = tails.filter(t => {
    if (filter !== "All" && t.status !== filter) return false;
    if (searchQuery && !`${t.type} ${t.registration} ${t.status}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const headColumns: Column<TruckHead>[] = [
    { key: "headNo", header: "Head No", sortValue: (r) => r.number, cell: (r) => <span className="font-semibold text-[#141a1f]">{r.number}</span> },
    { key: "registration", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="text-[#ea3a3d] font-medium">{r.registration}</span> },
    { key: "brand", header: "Truck Brand", sortValue: (r) => r.make, cell: (r) => <span className="text-[#5c6470]">{r.make}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "location", header: "Location", sortValue: (r) => r.location, cell: (r) => <span className="text-[#5c6470]">{r.location}</span> }
  ];

  const tailColumns: Column<TruckTail>[] = [
    { key: "tailType", header: "Tail Type", sortValue: (r) => r.type, cell: (r) => <span className="font-semibold text-[#141a1f]">{r.type}</span> },
    { key: "registration", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="text-[#ea3a3d] font-medium">{r.registration}</span> },
    { key: "brand", header: "Truck Brand", cell: () => <span className="text-[#5c6470]">IVECO Stralis</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "location", header: "Location", sortValue: (r) => r.location, cell: (r) => <span className="text-[#5c6470]">{r.location}</span> }
  ];

  return (
    <>
      <PageHeader
        title="Fleet Registry"
        description="Manage fleet availability, dispatch, and live location"
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6 mt-4">
        {/* Mobile Interleaved Layout */}
        <div className="contents lg:hidden">
          <MetricCard label="Total Head" value={countHeads()} />
          <MetricCard label="Total Tails" value={countTails()} />
          
          <MetricCard label="Available Head" value={countHeads("Available")} hint={<span className="text-[#34c759]">ready for dispatch</span>} />
          <MetricCard label="Available Tail" value={countTails("Available")} hint={<span className="text-[#34c759]">ready for dispatch</span>} />
          
          <MetricCard label="Head In Transit" value={countHeads("In Transit")} />
          <MetricCard label="Tail In Transit" value={countTails("In Transit")} />
          
          <MetricCard label="Head in Maintenance" value={countHeads("Maintenance")} />
          <MetricCard label="Tail in Maintenance" value={countTails("Maintenance")} />
          
          <MetricCard label="Head Out of Service" value={countHeads("Out of Service")} hint={<span className="text-[#ff3b30]">unavailable</span>} />
          <MetricCard label="Head Out of Service" value={countTails("Out of Service")} hint={<span className="text-[#ff3b30]">unavailable</span>} />
        </div>

        {/* Desktop Block Layout */}
        <div className="hidden lg:contents">
          {/* Row 1 */}
          <MetricCard label="Total Head" value={countHeads()} />
          <MetricCard label="Available Head" value={countHeads("Available")} hint={<span className="text-[#34c759]">ready for dispatch</span>} />
          <MetricCard label="Head In Transit" value={countHeads("In Transit")} />
          <MetricCard label="Head in Maintenance" value={countHeads("Maintenance")} />
          <MetricCard label="Head Out of Service" value={countHeads("Out of Service")} hint={<span className="text-[#ff3b30]">unavailable</span>} />
          
          {/* Row 2 */}
          <MetricCard label="Total Tail" value={countTails()} />
          <MetricCard label="Available Tail" value={countTails("Available")} hint={<span className="text-[#34c759]">ready for dispatch</span>} />
          <MetricCard label="Tail In Transit" value={countTails("In Transit")} />
          <MetricCard label="Tail in Maintenance" value={countTails("Maintenance")} />
          <MetricCard label="Tail Out of Service" value={countTails("Out of Service")} hint={<span className="text-[#ff3b30]">unavailable</span>} />
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex w-full md:w-auto bg-white rounded-md border border-[#e2e5e9] p-1 shadow-sm">
          <button
            className={cn("flex-1 md:flex-none px-5 py-2 md:py-1.5 text-sm font-semibold rounded-[4px] transition-colors", activeTab === 'head' ? "bg-[#1B2432] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
            onClick={() => setActiveTab('head')}
          >
            Truck Head
          </button>
          <button
            className={cn("flex-1 md:flex-none px-5 py-2 md:py-1.5 text-sm font-semibold rounded-[4px] transition-colors", activeTab === 'tail' ? "bg-[#1B2432] text-white" : "text-[#5c6470] hover:text-[#141a1f]")}
            onClick={() => setActiveTab('tail')}
          >
            Truck Tails
          </button>
        </div>

        <FilterPills options={FILTERS} value={filter} onChange={setFilter} className="flex-wrap" />
      </div>

      <SectionPanel bodyClassName="p-0 border-t-0 shadow-none bg-transparent">
        <div className="md:bg-white md:rounded-xl md:border border-[#e2e5e9] overflow-hidden md:shadow-sm">
          <div className="p-0 md:p-4 md:border-b border-[#e2e5e9] flex flex-col md:flex-row justify-between md:items-center mb-4 md:mb-0 gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#141a1f]">Fleet Register</h2>
              <span className="flex items-center justify-center bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px]">
                {activeTab === "head" ? filteredHeads.length : filteredTails.length}
              </span>
            </div>
            
            {/* Mobile Search */}
            <div className="flex md:hidden gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-[4px] border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                />
              </div>
              <button className="h-10 w-10 bg-[#ea3a3d] text-white rounded-[4px] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div className="hidden md:block">
            <DataTable
              rows={activeTab === "head" ? filteredHeads : filteredTails}
              columns={activeTab === "head" ? (headColumns as any) : (tailColumns as any)}
              pageSize={10}
            />
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden flex flex-col gap-3">
            {activeTab === "head" ? (
              filteredHeads.map(r => (
                <div key={r.id} className="bg-white rounded-[8px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-[#1a2332] text-[14px]">Head No: {r.number}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-[90px_1fr] gap-y-1 text-[13px]">
                    <span className="text-[#5c6470]">Registration:</span>
                    <span className="text-[#ea3a3d] font-medium">{r.registration}</span>
                    
                    <span className="text-[#5c6470]">Truck Brand:</span>
                    <span className="text-[#3c4250]">{r.make}</span>
                    
                    <span className="text-[#5c6470]">Location:</span>
                    <span className="text-[#3c4250]">{r.location}</span>
                  </div>
                </div>
              ))
            ) : (
              filteredTails.map(r => (
                <div key={r.id} className="bg-white rounded-[8px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-[#1a2332] text-[14px]">Tail Type: {r.type}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-[90px_1fr] gap-y-1 text-[13px]">
                    <span className="text-[#5c6470]">Registration:</span>
                    <span className="text-[#ea3a3d] font-medium">{r.registration}</span>
                    
                    <span className="text-[#5c6470]">Truck Brand:</span>
                    <span className="text-[#3c4250]">IVECO Stralis</span>
                    
                    <span className="text-[#5c6470]">Location:</span>
                    <span className="text-[#3c4250]">{r.location}</span>
                  </div>
                </div>
              ))
            )}
            
            {(activeTab === "head" ? filteredHeads : filteredTails).length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm bg-white rounded-lg">
                No records found matching your filters.
              </div>
            )}
          </div>
          
        </div>
      </SectionPanel>
    </>
  );
}
