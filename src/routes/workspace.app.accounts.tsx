import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, FileText, MessageSquareWarning, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { accountService, formatNaira, formatNairaFull } from "@/lib/fleetopsx/services";
import type { Expense } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const FILTERS = ["All", "Pending", "Approved", "Rejected", "Clarification"] as const;
const EXPENSE_CATEGORIES = ["Brake Pad", "Tire/Rim", "Police", "Medical", "Other"];
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/accounts")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Accounts"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Accounts | FleetOpsX" },
      { name: "description", content: "Operational expense approvals, variance control and disbursement oversight." },
      { property: "og:title", content: "Accounts | FleetOpsX" },
      { property: "og:description", content: "Expense approvals and financial oversight." },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selected, setSelected] = useState<Expense | null>(null);
  const [tab, setTab] = useState("queue");
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({ category: "", amount: "", notes: "" });

  const refresh = () => accountService.list().then((list) => {
    setRows(list);
    setSelected((cur) => {
      const next = cur ? list.find((e) => e.id === cur.id) : list.find((e) => e.id === "EXP-00481") ?? list.find((e) => e.status === "Pending");
      return next ?? list[0] ?? null;
    });
  });

  useEffect(() => { void refresh(); }, []);

  const pending = rows.filter((e) => e.status === "Pending");
  const approved = rows.filter((e) => e.status === "Approved");
  const rejected = rows.filter((e) => e.status === "Rejected");
  const disbursed = approved.reduce((s, e) => s + e.amount, 0);
  const variance = rows.reduce((s, e) => s + (e.amount - e.standardRate), 0);
  const view = filter === "All" ? rows : rows.filter((e) => e.status === filter);

  const columns: Column<Expense>[] = useMemo(() => [
    { key: "id", header: "Expense ID", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <StatusBadge status={r.type} dot={false} tone="neutral" /> },
    { key: "requester", header: "Requester", cell: (r) => r.requester },
    { key: "amount", header: "Amount", align: "right", sortValue: (r) => r.amount, cell: (r) => <span className="num font-semibold">{formatNairaFull(r.amount)}</span> },
    { key: "trip", header: "Trip", cell: (r) => <span className="num font-semibold text-foreground">{r.tripId}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "approval", header: "Approval", cell: (r) => <span className="text-muted-foreground">{r.approvalLevel}</span> },
  ], []);

  const setStatus = async (status: Expense["status"]) => {
    if (!selected) return;
    await accountService.setStatus(selected.id, status);
    const labels = { Approved: "approved", Rejected: "rejected", Clarification: "sent for clarification", Pending: "reset to pending" } as const;
    toast.success(`${selected.id} ${labels[status]}`);
    setTab("detail");
    await refresh();
  };

  const selectedVariance = selected ? selected.amount - selected.standardRate : 0;

  return (
    <>
      <PageHeader
        title="Accounts & Approvals"
        description="Approvals, variance checks and payout tracking."
        meta={<span className="num text-[11px] text-muted-foreground">{pending.length} pending · {formatNaira(pending.reduce((s, e) => s + e.amount, 0))} exposure</span>}
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setLogOpen(true)}>
            <FileText className="h-3.5 w-3.5" />Log Expense
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pending Approvals" value={pending.length} accent />
        <MetricCard label="Approved Today" value={approved.length} hint="Today" />
        <MetricCard label="Rejected" value={rejected.length} />
        <MetricCard label="Total Disbursed" value={formatNaira(disbursed)} />
        <MetricCard label="Expense Variance" value={formatNaira(Math.abs(variance))} deltaTone={variance > 0 ? "down" : "up"} hint="vs standard rates" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="queue" className="text-xs">Expenses</TabsTrigger>
          <TabsTrigger value="detail" className="text-xs">Expense Detail</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs">Pending Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <SectionPanel title="Expense Register" description={`${view.length} transactions`} bodyClassName="p-0">
            <DataTable
              rows={view}
              columns={columns}
              searchKeys={(r) => `${r.id} ${r.type} ${r.requester} ${r.tripId}`}
              pageSize={12}
              onRowClick={(r) => { setSelected(r); setTab("detail"); }}
              toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="detail" className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <SectionPanel
            title={selected?.id ?? "Select an expense"}
            description="Multi-level approval review"
            actions={selected ? <StatusBadge status={selected.status} /> : undefined}
            bodyClassName="pt-1"
          >
            {selected ? (
              <>
                <div className="mb-4 rounded-[18px] border border-black/[0.05] bg-black/[0.03] p-4">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Requested Amount</p>
                  <p className="num mt-1 text-3xl font-semibold text-foreground">{formatNairaFull(selected.amount)}</p>
                </div>
                <FieldRow label="Requester" value={selected.requester} />
                <FieldRow label="Trip" value={selected.tripId} />
                <FieldRow label="Expense category" value={selected.type} />
                <FieldRow label="Standard rate" value={formatNairaFull(selected.standardRate)} />
                <FieldRow label="Requested amount" value={formatNairaFull(selected.amount)} />
                <FieldRow
                  label="Variance"
                  value={
                    <span className={cn("num", selectedVariance > 0 ? "text-warning" : "text-success")}>
                      {selectedVariance >= 0 ? "+" : ""}{formatNairaFull(selectedVariance)}
                    </span>
                  }
                />
                <FieldRow label="Approval level" value={selected.approvalLevel} />
                <FieldRow label="Date" value={selected.date} />
              </>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">Select an expense to review.</p>
            )}
          </SectionPanel>

          <div className="flex flex-col gap-5">
            <SectionPanel title="Supporting Documents" bodyClassName="space-y-2">
              {(selected?.documents ?? ["receipt.pdf"]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toast("Document preview", { description: d })}
                  className="flex w-full items-center gap-2 rounded-[14px] border border-black/[0.05] bg-white px-3 py-2 text-left text-[12px] hover:bg-black/[0.02]"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="num flex-1 truncate">{d}</span>
                </button>
              ))}
            </SectionPanel>

            <SectionPanel title="Approval History" bodyClassName="space-y-3">
              <div className="space-y-2">
                {[
                  { step: "Submitted", by: selected?.requester ?? "Requester", state: "done" as const },
                  { step: "Supervisor review", by: "Operations Manager", state: selected && selected.status !== "Pending" ? "done" as const : "current" as const },
                  { step: "Accounts approval", by: "Accountant", state: selected?.status === "Approved" ? "done" as const : "pending" as const },
                  { step: "Disbursement", by: "Treasury", state: selected?.status === "Approved" ? "done" as const : "pending" as const },
                ].map((h) => (
                  <div key={h.step} className="flex items-start gap-2.5">
                    <span className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      h.state === "done" && "bg-success",
                      h.state === "current" && "bg-[#1d1d1f]",
                      h.state === "pending" && "bg-muted-foreground/40",
                    )} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{h.step}</p>
                      <p className="text-[11px] text-muted-foreground">{h.by}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selected?.status === "Pending" && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void setStatus("Approved")}>
                    <Check className="h-3.5 w-3.5" />Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void setStatus("Rejected")}>
                    <X className="h-3.5 w-3.5" />Reject
                  </Button>
                  <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={() => void setStatus("Clarification")}>
                    <MessageSquareWarning className="h-3.5 w-3.5" />Request Clarification
                  </Button>
                </div>
              )}
            </SectionPanel>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <SectionPanel title="Pending Approvals Queue" description="Needs a decision" bodyClassName="p-0">
            <DataTable
              rows={pending}
              columns={columns}
              searchKeys={(r) => `${r.id} ${r.type} ${r.requester}`}
              pageSize={10}
              onRowClick={(r) => { setSelected(r); setTab("detail"); }}
              emptyTitle="No pending approvals"
              emptyDescription="All operational expenses have been actioned."
            />
          </SectionPanel>
        </TabsContent>
      </Tabs>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Expense</DialogTitle>
            <DialogDescription>Submit a new operational or repair expense.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Expense Category</Label>
              <Select value={logForm.category} onValueChange={(v) => setLogForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₦)</Label>
              <Input 
                type="number" 
                value={logForm.amount} 
                onChange={(e) => setLogForm((f) => ({ ...f, amount: e.target.value }))} 
                className="h-9 text-xs num" 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes / Tag</Label>
              <Input 
                value="Indirect Cost" 
                readOnly 
                className="h-9 text-xs text-muted-foreground bg-black/[0.02]" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => {
              toast.success("Expense Submitted", { description: "Routed for Accounts approval." });
              setLogOpen(false);
              setLogForm({ category: "", amount: "", notes: "" });
            }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

