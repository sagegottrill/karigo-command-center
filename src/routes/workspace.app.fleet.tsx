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
import { authService, fleetService, engineeringService } from "@/lib/fleetopsx/services";
import { toast } from "sonner";
import { AlertTriangle, Wrench } from "lucide-react";

export const Route = createFileRoute("/workspace/app/fleet")({
  loader: async () => {
    const [heads, tails] = await Promise.all([
      fleetService.listHeads(),
      fleetService.listTails()
    ]);
    return { heads, tails };
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
      { title: "Fleet Operations | FleetOpsX" },
      { name: "description", content: "Fleet Operations: Manage asset availability, assignment, and operational status." },
      { property: "og:title", content: "Fleet Operations | FleetOpsX" },
      { property: "og:description", content: "Fleet Operations: Manage asset availability, assignment, and operational status." },
    ],
  }),
  component: FleetPage,
});

const FILTERS = ["All", "Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const;

function FleetPage() {
  const { heads: TRUCK_HEADS, tails: TRUCK_TAILS } = Route.useLoaderData();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [headsList, setHeadsList] = useState(TRUCK_HEADS);
  const [tailsList, setTailsList] = useState(TRUCK_TAILS);
  
  const refresh = async () => {
    const [h, t] = await Promise.all([fleetService.listHeads(), fleetService.listTails()]);
    setHeadsList(h);
    setTailsList(t);
  };
  
  const [maintenanceModal, setMaintenanceModal] = useState<{ id: string, type: "Head" | "Tail", reg: string } | null>(null);
  const [defectText, setDefectText] = useState("");
  const [priority, setPriority] = useState("Medium");

  const submitMaintenance = async () => {
    if (!maintenanceModal || !defectText) return;
    
    // 1. Change status
    if (maintenanceModal.type === "Head") {
      await fleetService.updateHeadStatus(maintenanceModal.id, "Maintenance");
    } else {
      await fleetService.updateTailStatus(maintenanceModal.id, "Maintenance");
    }

    // 2. Create defect
    await engineeringService.createDefect({
      truckReg: maintenanceModal.reg,
      defect: defectText,
      category: "General",
      priority: priority,
      reportedBy: authService.getCurrentUser()?.name || "System"
    });

    toast.success(`${maintenanceModal.id} grounded. Work order generated.`);
    setMaintenanceModal(null);
    setDefectText("");
    await refresh();
  };
  
  const heads = filter === "All" ? headsList : headsList.filter((t) => t.status === filter);
  const tails = filter === "All" ? tailsList : tailsList.filter((t) => t.status === filter);
  
  const countHead = (s: TruckHead["status"]) => headsList.filter((t) => t.status === s).length;
  const countTail = (s: TruckTail["status"]) => tailsList.filter((t) => t.status === s).length;

  const handleUpdateHead = async (id: string, status: any) => {
    await fleetService.updateHeadStatus(id, status);
    toast.success(`Head ${id} status updated to ${status}.`);
    await refresh();
  };

  const handleUpdateTail = async (id: string, status: any) => {
    await fleetService.updateTailStatus(id, status);
    toast.success(`Tail ${id} status updated to ${status}.`);
    await refresh();
  };

  const headColumns: Column<TruckHead>[] = [
    { key: "id", header: "Head", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="num">{r.registration}</span> },
    { key: "make", header: "Make", sortValue: (r) => r.make, cell: (r) => <span className="text-muted-foreground">{r.make}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", sortValue: (r) => r.location, cell: (r) => r.location },
    { key: "actions", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-2">
        {r.status === "Maintenance" || r.status === "Out of Service" ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-emerald-600" onClick={() => handleUpdateHead(r.id, "Available")}>Make Available</Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 px-2 text-rose-600" onClick={() => setMaintenanceModal({ id: r.id, type: "Head", reg: r.registration })}>Set Maintenance</Button>
        )}
      </div>
    )}
  ];

  const tailColumns: Column<TruckTail>[] = [
    { key: "id", header: "Tail", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", sortValue: (r) => r.registration, cell: (r) => <span className="num">{r.registration}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <span className="text-muted-foreground">{r.type}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", sortValue: (r) => r.location, cell: (r) => r.location },
    { key: "actions", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-2">
        {r.status === "Maintenance" || r.status === "Out of Service" ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-emerald-600" onClick={() => handleUpdateTail(r.id, "Available")}>Make Available</Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 px-2 text-rose-600" onClick={() => setMaintenanceModal({ id: r.id, type: "Tail", reg: r.registration })}>Set Maintenance</Button>
        )}
      </div>
    )}
  ];

  return (
    <>
      <PageHeader
        title="Fleet Operations"
        description="Manage asset availability, assignment, and operational status."
        actions={
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/workspace/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Heads" value={headsList.length} accent />
        <MetricCard label="Available Heads" value={countHead("Available")} hint="ready to dispatch" />
        <MetricCard label="Assigned Heads" value={countHead("Assigned")} />
        <MetricCard label="Total Tails" value={tailsList.length} accent />
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

      {maintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
          <div className="w-full max-w-[420px] rounded-[24px] bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <Wrench className="h-6 w-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-bold text-[#141a1f] tracking-tight">Ground Asset</h3>
              <p className="mt-1 text-sm text-[#8e95a1]">
                You are moving <span className="font-semibold text-[#141a1f]">{maintenanceModal.reg}</span> to Maintenance status. Please report the defect.
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto mt-4 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-[#5c6470] uppercase">Defect Description</label>
                <textarea 
                  className="mt-1 w-full rounded-xl border border-black/[0.1] bg-black/[0.02] p-3 text-sm outline-none focus:border-rose-500 focus:bg-white transition-colors"
                  rows={3}
                  placeholder="E.g. Air brake leak, worn tires..."
                  value={defectText}
                  onChange={e => setDefectText(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[#5c6470] uppercase">Priority</label>
                <div className="mt-1 flex gap-2">
                  {["Low", "Medium", "High", "Critical"].map(p => (
                    <button 
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold border ${priority === p ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-black/[0.1] text-[#5c6470] hover:bg-black/[0.02]'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-900 mt-2">
                <p className="text-[10px] text-rose-500 uppercase font-semibold flex items-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3" /> Warning
                </p>
                <p className="text-xs font-medium">This will instantly generate an Engineering Work Order and ground the truck.</p>
              </div>
            </div>
            
            <div className="flex-shrink-0 mt-6 flex justify-end gap-3 pt-4 border-t border-black/[0.05]">
              <Button variant="outline" className="h-10 rounded-xl px-5 font-semibold" onClick={() => setMaintenanceModal(null)}>Cancel</Button>
              <Button 
                className="h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-6 font-semibold shadow-md hover:shadow-lg transition-all" 
                onClick={submitMaintenance}
                disabled={!defectText}
              >
                Ground Asset
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

