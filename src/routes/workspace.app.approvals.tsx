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

function TripSummary({ record }: { record: Trip }) {
  const costs = record.directCosts;
  const total = costs ? (costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance) : 0;
  const margin = record.revenue - total;
  const marginPct = record.revenue > 0 ? (margin / record.revenue) * 100 : 0;
  
  return (
    <div className="text-sm text-[#141a1f] space-y-4 text-left mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-black/[0.03] rounded-xl">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Route</p>
          <p className="font-medium mt-1 truncate">{record.pickup} &rarr; {record.dropoff}</p>
        </div>
        <div className="p-3 bg-black/[0.03] rounded-xl">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Asset</p>
          <p className="font-medium mt-1 truncate">{record.truckReg}</p>
        </div>
      </div>
      
      <div className="p-3 bg-black/[0.03] rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Driver</p>
          <p className="font-medium mt-1">{record.driverName}</p>
        </div>
        <StatusBadge status="Valid" dot={false} />
      </div>

      <div className="border border-black/[0.05] rounded-xl p-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Financials</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Est. Revenue</span>
            <span className="font-mono font-medium">{formatNairaFull(record.revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Direct Costs</span>
            <span className="font-mono font-medium text-[#e3351d]">-{formatNairaFull(total)}</span>
          </div>
          <div className="pt-3 mt-2 border-t border-black/[0.05] flex justify-between items-center">
            <span className="font-semibold text-[15px]">Gross Margin</span>
            <div className="text-right flex items-center gap-2">
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">{marginPct.toFixed(1)}%</span>
              <span className="font-mono font-bold text-[16px] text-emerald-600 block">{formatNairaFull(margin)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpenseSummary({ record }: { record: Expense }) {
  return (
    <div className="text-sm text-[#141a1f] space-y-4 text-left mt-4">
      <div className="p-3 bg-black/[0.03] rounded-xl">
        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Requester</p>
        <p className="font-medium mt-1">{record.requester} &middot; <span className="text-muted-foreground">{record.department}</span></p>
      </div>
      <div className="p-3 bg-black/[0.03] rounded-xl">
        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Description</p>
        <p className="font-medium mt-1">{record.description}</p>
        <div className="mt-2 flex gap-2">
          <StatusBadge status={record.type} dot={false} tone="neutral" />
          <StatusBadge status={record.category} dot={false} tone="neutral" />
        </div>
      </div>
      <div className="border border-black/[0.05] rounded-xl p-4 flex items-center justify-between">
        <span className="font-semibold text-[15px]">Total Amount</span>
        <span className="font-mono font-bold text-[18px] text-[#e3351d] block">{formatNairaFull(record.amount)}</span>
      </div>
    </div>
  );
}

function WOSummary({ record }: { record: WorkOrder }) {
  return (
    <div className="text-sm text-[#141a1f] space-y-4 text-left mt-4">
      <div className="flex gap-3">
        <div className="flex-1 p-3 bg-black/[0.03] rounded-xl">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Asset</p>
          <p className="font-medium mt-1">{record.truckReg}</p>
        </div>
        <div className="flex-1 p-3 bg-black/[0.03] rounded-xl">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Priority</p>
          <div className="mt-1"><StatusBadge status={record.priority as any} /></div>
        </div>
      </div>
      <div className="p-3 bg-[#e3351d]/5 border border-[#e3351d]/20 rounded-xl text-[#e3351d]">
        <p className="text-[10px] text-[#e3351d]/80 uppercase font-semibold flex items-center gap-1 mb-1">
          <AlertTriangle className="h-3 w-3" /> Reported Defect
        </p>
        <p className="font-medium">{record.defect}</p>
      </div>
      <p className="text-[12px] text-muted-foreground px-1 leading-relaxed">
        Authorizing this will change the truck's status to <strong>Maintenance</strong> and ground it from dispatch operations.
      </p>
    </div>
  );
}

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

  type ConfirmState = 
    | { type: "Trip", record: Trip }
    | { type: "Expense", record: Expense }
    | { type: "Work Order", record: WorkOrder };

  const [confirmApproval, setConfirmApproval] = useState<ConfirmState | null>(null);

  const executeApproval = async () => {
    if (!confirmApproval) return;
    const { type, record } = confirmApproval;
    
    if (type === "Trip") {
      await tripService.approveDispatch(record.id);
      toast.success(`Trip ${record.id} approved for dispatch.`);
    } else if (type === "Expense") {
      await accountService.setStatus(record.id, "Approved");
      toast.success(`Expense ${record.id} approved.`);
    } else if (type === "Work Order") {
      await engineeringService.advance(record.id);
      toast.success(`Work Order ${record.id} approved for diagnosis.`);
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
      return <span className="num font-medium text-[#e3351d]">{formatNairaFull(total)}</span>;
    }},
    { key: "margin", header: "Margin", align: "right", cell: r => {
      const costs = r.directCosts;
      const total = costs ? (costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance) : 0;
      const margin = r.revenue - total;
      return <span className="num font-bold">{formatNairaFull(margin)}</span>;
    }},
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ type: "Trip", record: r })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow">Approve</Button>
    )}
  ];

  const expCols: Column<Expense>[] = [
    { key: "id", header: "Expense ID", cell: r => <span className="num font-semibold">{r.id}</span> },
    { key: "type", header: "Type", cell: r => <StatusBadge status={r.type} dot={false} tone="neutral" /> },
    { key: "req", header: "Requester", cell: r => r.requester },
    { key: "amount", header: "Amount", align: "right", cell: r => <span className="num font-bold">{formatNairaFull(r.amount)}</span> },
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ type: "Expense", record: r })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow">Approve</Button>
    )}
  ];

  const woCols: Column<WorkOrder>[] = [
    { key: "id", header: "WO ID", cell: r => <span className="num font-semibold">{r.id}</span> },
    { key: "truck", header: "Truck", cell: r => <span className="num">{r.truckReg}</span> },
    { key: "defect", header: "Reported Defect", cell: r => r.defect },
    { key: "pri", header: "Priority", cell: r => <StatusBadge status={r.priority as any} /> },
    { key: "actions", header: "", align: "right", cell: r => (
      <Button size="sm" onClick={() => setConfirmApproval({ type: "Work Order", record: r })} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow">Approve</Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
          <div className="w-full max-w-[420px] rounded-[24px] bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-[#141a1f] tracking-tight">Authorize {confirmApproval.type}</h3>
              <p className="mt-1 text-sm text-[#8e95a1]">
                Review the details for <span className="font-semibold text-[#141a1f]">{confirmApproval.record.id}</span> before approving.
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-0 sleek-scrollbar py-2">
              {confirmApproval.type === "Trip" && <TripSummary record={confirmApproval.record} />}
              {confirmApproval.type === "Expense" && <ExpenseSummary record={confirmApproval.record} />}
              {confirmApproval.type === "Work Order" && <WOSummary record={confirmApproval.record} />}
            </div>
            
            <div className="flex-shrink-0 mt-6 flex justify-end gap-3 pt-4 border-t border-black/[0.05]">
              <Button variant="outline" className="h-10 rounded-xl px-5 font-semibold" onClick={() => setConfirmApproval(null)}>Cancel</Button>
              <Button className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 font-semibold shadow-md hover:shadow-lg transition-all" onClick={executeApproval}>
                Confirm & Authorize
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
