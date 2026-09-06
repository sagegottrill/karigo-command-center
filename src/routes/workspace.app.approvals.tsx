import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, ArrowRight, ShieldCheck, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tripService, accountService, engineeringService, formatNairaFull } from "@/lib/fleetopsx/services";
import type { Trip, Expense, WorkOrder } from "@/lib/fleetopsx/types";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/approvals")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Platform Admin"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Approvals Hub | FleetOpsX" },
      { name: "description", content: "Transport Manager centralized approvals hub for trips, expenses, and maintenance." },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [pendingWO, setPendingWO] = useState<WorkOrder[]>([]);

  const refresh = async () => {
    const [trips, expenses, wos] = await Promise.all([
      tripService.list(),
      accountService.list(),
      engineeringService.listWorkOrders(),
    ]);
    setPendingTrips(trips.filter(t => t.status === "Awaiting Approval"));
    setPendingExpenses(expenses.filter(e => e.status === "Pending"));
    setPendingWO(wos.filter(w => w.status === "Reported"));
  };

  useEffect(() => { void refresh(); }, []);

  const [confirmApproval, setConfirmApproval] = useState<{ id: string, type: "Trip" | "Expense" | "Work Order" } | null>(null);

  const executeApproval = async () => {
    if (!confirmApproval) return;
    const { id, type } = confirmApproval;
    
    if (type === "Trip") {
      await tripService.approveDispatch(id);
      toast.success(`Trip ${id} approved for dispatch.`);
    } else if (type === "Expense") {
      await accountService.setStatus(id, "Approved");
      toast.success(`Expense ${id} approved.`);
    } else if (type === "Work Order") {
      await engineeringService.advance(id);
      toast.success(`Work Order ${id} approved for diagnosis.`);
    }
    
    setConfirmApproval(null);
    await refresh();
  };

  const tripCols: Column<Trip>[] = [
    { key: "id", header: "Trip ID", cell: r => <span className="num font-semibold">{r.id}</span> },
    { key: "route", header: "Route", cell: r => `${r.pickup} → ${r.dropoff}` },
    { key: "driver", header: "Driver", cell: r => r.driverName || "—" },
    { key: "revenue", header: "Revenue", align: "right", cell: r => <span className="num font-medium text-emerald-600">{formatNairaFull(r.revenue)}</span> },
    { key: "cost", header: "Est. Costs", align: "right", cell: r => {
      const costs = r.directCosts;
      const total = costs ? (costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance) : 0;
      return <span className="num font-medium text-rose-600">{formatNairaFull(total)}</span>;
    }},
    { key: "margin", header: "Margin", align: "right", cell: r => {
      const costs = r.directCosts;
      const total = costs ? (costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance) : 0;
      const margin = r.revenue - total;
      return <span className="num font-bold">{formatNairaFull(margin)}</span>;
    }},
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ id: r.id, type: "Trip" })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Approve</Button>
    )}
  ];

  const expCols: Column<Expense>[] = [
    { key: "id", header: "Expense ID", cell: r => <span className="num font-semibold">{r.id}</span> },
    { key: "type", header: "Type", cell: r => <StatusBadge status={r.type} dot={false} tone="neutral" /> },
    { key: "req", header: "Requester", cell: r => r.requester },
    { key: "amount", header: "Amount", align: "right", cell: r => <span className="num font-bold">{formatNairaFull(r.amount)}</span> },
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ id: r.id, type: "Expense" })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Approve</Button>
    )}
  ];

  const woCols: Column<WorkOrder>[] = [
    { key: "id", header: "WO ID", cell: r => <span className="num font-semibold">{r.id}</span> },
    { key: "truck", header: "Truck", cell: r => <span className="num">{r.truckReg}</span> },
    { key: "defect", header: "Reported Defect", cell: r => r.defect },
    { key: "pri", header: "Priority", cell: r => <StatusBadge status={r.priority as any} /> },
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ id: r.id, type: "Work Order" })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">Approve</Button>
    )}
  ];

  return (
    <>
      <PageHeader
        title="Approvals Hub"
        description="Centralized authorization for Dispatches, Expenses, and Fleet Maintenance."
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <MetricCard label="Pending Dispatches" value={pendingTrips.length} accent />
        <MetricCard label="Pending Expenses" value={pendingExpenses.length} />
        <MetricCard label="Maintenance Requests" value={pendingWO.length} />
      </div>

      <Tabs defaultValue="trips">
        <TabsList className="h-9 mb-4">
          <TabsTrigger value="trips" className="text-xs flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5"/> Dispatches ({pendingTrips.length})</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs flex items-center gap-2"><FileText className="h-3.5 w-3.5"/> Expenses ({pendingExpenses.length})</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5"/> Maintenance ({pendingWO.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="trips">
          <SectionPanel title="Dispatch Authorization" description="Review estimated margins before authorizing trucks to leave the gate." bodyClassName="p-0">
            <DataTable rows={pendingTrips} columns={tripCols} searchKeys={(r) => r.id} />
          </SectionPanel>
        </TabsContent>
        
        <TabsContent value="expenses">
          <SectionPanel title="Financial Requisitions" description="Authorize unbudgeted operational expenses." bodyClassName="p-0">
            <DataTable rows={pendingExpenses} columns={expCols} searchKeys={(r) => r.id} />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="maintenance">
          <SectionPanel title="Maintenance Work Orders" description="Authorize grounding of vehicles for reported defects." bodyClassName="p-0">
            <DataTable rows={pendingWO} columns={woCols} searchKeys={(r) => r.id} />
          </SectionPanel>
        </TabsContent>
      </Tabs>

      {confirmApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[16px] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-[#141a1f]">Confirm {confirmApproval.type} Approval</h3>
            <p className="mt-2 text-sm text-[#5c6470]">
              You are about to authorize <strong>{confirmApproval.id}</strong>. This action will advance the workflow and notify relevant parties.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmApproval(null)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={executeApproval}>Authorize</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
