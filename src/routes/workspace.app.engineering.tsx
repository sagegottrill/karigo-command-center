import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Camera, Plus, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { engineeringService, formatNaira, fleetService } from "@/lib/fleetopsx/services";
import type { WorkOrder } from "@/lib/fleetopsx/types";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/engineering")({
  loader: async () => {
    const [heads, tails] = await Promise.all([
      fleetService.listHeads(),
      fleetService.listTails(),
    ]);
    return { trucks: [...heads, ...tails] };
  },
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Engineering"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Engineering | FleetOpsX" },
      { name: "description", content: "Workshop queue, defect reporting, work orders and critical repair tracking." },
      { property: "og:title", content: "Engineering | FleetOpsX" },
      { property: "og:description", content: "Workshop queue, defects and work orders." },
    ],
  }),
  component: EngineeringPage,
});

const CATEGORIES = ["Brakes", "Engine", "Tyres", "Electrics", "Hydraulics", "Body", "Transmission"];
const FILTERS = ["All", "Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed"] as const;

function EngineeringPage() {
  const { trucks: TRUCKS } = Route.useLoaderData();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState(false);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [form, setForm] = useState({
    truckReg: "", category: "", defect: "", priority: "Medium", location: "Lagos Yard",
  });
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({ truckReg: "", defect: "", category: "", amount: "" });

  const refresh = () => engineeringService.listWorkOrders().then(setRows);
  useEffect(() => { void refresh(); }, []);

  const openDefects = rows.filter((w) => w.status !== "Completed").length;
  const activeRepairs = rows.filter((w) => ["Repairing", "Testing"].includes(w.status)).length;
  const awaitingParts = rows.filter((w) => w.status === "Awaiting Parts").length;
  const critical = rows.filter((w) => w.priority === "Critical" && w.status !== "Completed").length;
  const completed = rows.filter((w) => w.status === "Completed").length;
  const active = rows.filter((w) => w.status !== "Completed");

  const view = filter === "All" ? rows : rows.filter((w) => w.status === filter);

  const columns: Column<WorkOrder>[] = useMemo(() => [
    { key: "id", header: "Work Order", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "truck", header: "Truck", cell: (r) => <span className="num">{r.truckReg}</span> },
    { key: "defect", header: "Defect", cell: (r) => <span className="max-w-[220px] truncate block">{r.defect}</span> },
    { key: "priority", header: "Priority", sortValue: (r) => r.priority, cell: (r) => <StatusBadge status={r.priority} dot={false} /> },
    { key: "mechanic", header: "Mechanic", cell: (r) => r.mechanic },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "action", header: "Action", align: "right",
      cell: (r) => r.status !== "Completed" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            void engineeringService.advance(r.id).then(() => {
              toast.success(`${r.id} advanced`);
              void refresh();
            });
          }}
        >
          Advance
        </Button>
      ) : <span className="num text-muted-foreground">{formatNaira(r.cost)}</span>,
    },
  ], []);

  const submitDefect = async () => {
    if (!form.truckReg || !form.category || !form.defect) {
      toast.error("Missing information", { description: "Truck, category and description are required." });
      return;
    }
    const id = await engineeringService.createDefect({
      truckReg: form.truckReg,
      defect: form.defect,
      category: form.category,
      priority: form.priority,
      reportedBy: "Field Driver",
    });
    toast.success(`Defect Ticket ${id} Created`, { description: photoName ? `Photo attached: ${photoName}` : "Queued for workshop diagnosis." });
    setOpen(false);
    setPhotoName(null);
    setForm({ truckReg: "", category: "", defect: "", priority: "Medium", location: "Lagos Yard" });
    await refresh();
  };

  return (
    <>
      <PageHeader
        title="Engineering / Workshop"
        description="Workshop queue, defects and work orders."
        meta={<span className="num text-[11px] text-muted-foreground">{active.length} active work orders</span>}
        actions={
          <>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs bg-white text-black hover:bg-black/[0.02]" onClick={() => setLogOpen(true)}>
              <Wrench className="h-3.5 w-3.5" />Log Repair Cost
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs bg-[#c93b3b] text-white hover:bg-[#a62f2f]" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" />Report Defect
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Open Defects" value={openDefects} accent icon={Wrench} />
        <MetricCard label="Active Repairs" value={activeRepairs} />
        <MetricCard label="Awaiting Parts" value={awaitingParts} hint="blocked on store" />
        <MetricCard label="Critical Repairs" value={critical} deltaTone="down" />
        <MetricCard label="Completed" value={completed} hint="this cycle" />
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="h-9">
          <TabsTrigger value="queue" className="text-xs">Workshop Queue</TabsTrigger>
          <TabsTrigger value="defects" className="text-xs">Defect Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <SectionPanel title="Workshop Queue" description={`${view.length} work orders`} bodyClassName="p-0">
            <DataTable
              rows={view}
              columns={columns}
              searchKeys={(r) => `${r.id} ${r.truckReg} ${r.defect} ${r.mechanic} ${r.category}`}
              pageSize={12}
              toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="defects" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.filter((w) => ["Reported", "Diagnosing"].includes(w.status)).map((w) => (
            <div key={w.id} className="flex flex-col rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] p-[16px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between gap-2">
                <span className="num text-[12px] font-[600] text-[#141a1f]">{w.id}</span>
                <StatusBadge status={w.priority} dot={false} />
              </div>
              <p className="mt-[8px] text-[14px] font-[600] text-[#141a1f]">{w.defect}</p>
              <p className="mt-[4px] text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">{w.truckReg} · {w.category} · {w.reportedBy}</p>
              <div className="mt-[12px] flex items-center justify-between">
                <StatusBadge status={w.status} />
                <span className="num text-[12px] font-[400] text-[#5c6470]">{w.reportedAt}</span>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">Report Vehicle Defect</DialogTitle>
            <DialogDescription>Driver / field defect submission. Creates a workshop work order.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Truck</Label>
              <Select value={form.truckReg} onValueChange={(v) => setForm((f) => ({ ...f, truckReg: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {TRUCKS.slice(0, 20).map((t) => (
                    <SelectItem key={t.id} value={t.registration} className="text-xs">{t.id} · {t.registration}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Defect category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Severity</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Low", "Medium", "High", "Critical"].map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.defect}
                onChange={(e) => setForm((f) => ({ ...f, defect: e.target.value }))}
                className="min-h-20 text-xs"
                placeholder="Describe the defect observed..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date / time</Label>
                <Input readOnly value="12 Aug 2026 — 10:42:31" className="num h-9 text-xs" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhotoName(`defect-${Date.now()}.jpg`);
                toast.success("Photo attached");
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-black/10 bg-black/[0.015] px-4 py-8 text-center transition-colors hover:border-black/20"
            >
              {photoName ? <Camera className="h-5 w-5 text-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
              <span className="text-xs font-medium text-foreground">
                {photoName ? photoName : "Drag photo here or Upload Image"}
              </span>
              <span className="text-[10px] text-muted-foreground">JPG or PNG, up to 5 MB</span>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => void submitDefect()}>Submit Defect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Repair Cost</DialogTitle>
            <DialogDescription>Mark a truck 'Not Ready', log the repair cost, and automatically create an expense or procurement request.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Truck</Label>
              <Select value={logForm.truckReg} onValueChange={(v) => setLogForm((f) => ({ ...f, truckReg: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {TRUCKS.map((t) => <SelectItem key={t.id} value={t.registration} className="text-xs">{t.registration}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Defect Description</Label>
              <Input value={logForm.defect} onChange={(e) => setLogForm((f) => ({ ...f, defect: e.target.value }))} className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cost Category</Label>
              <Select value={logForm.category} onValueChange={(v) => setLogForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (₦)</Label>
              <Input type="number" value={logForm.amount} onChange={(e) => setLogForm((f) => ({ ...f, amount: e.target.value }))} className="h-9 text-xs num" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => {
              void engineeringService.logRepair(logForm.truckReg, logForm.defect, logForm.category, Number(logForm.amount)).then(() => {
                toast.success("Repair Logged", { description: "Truck marked out of service and expense/procurement created." });
                setLogOpen(false);
                setLogForm({ truckReg: "", defect: "", category: "", amount: "" });
                refresh();
              });
            }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

