import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { gateService, driverService, fleetService } from "@/lib/fleetopsx/services";
import type { GateEntry } from "@/lib/fleetopsx/types";

const FILTERS = ["Today", "Incoming", "Outgoing", "All"] as const;

export const Route = createFileRoute("/app/gate")({
  loader: async () => {
    const [drivers, heads, tails] = await Promise.all([
      driverService.list(),
      fleetService.listHeads(),
      fleetService.listTails(),
    ]);
    return {
      drivers,
      trucks: [...heads, ...tails],
    };
  },
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Security"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "Gate & Security | FleetOpsX" },
      { name: "description", content: "Digital gate logbook for vehicle movements, visitors and asset transfers." },
      { property: "og:title", content: "Gate & Security | FleetOpsX" },
      { property: "og:description", content: "Digital gate logbook and security movements." },
    ],
  }),
  component: GatePage,
});

function GatePage() {
  const { drivers: DRIVERS, trucks: TRUCKS } = Route.useLoaderData();
  const [rows, setRows] = useState<GateEntry[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Today");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    asset: "", driver: "", purpose: "Trip departure", direction: "Outgoing" as "Incoming" | "Outgoing",
    yard: "Lagos Yard", cargo: "", reference: "", officer: "Sec. Okon",
  });

  const refresh = () => gateService.list().then(setRows);
  useEffect(() => { void refresh(); }, []);

  const incoming = rows.filter((r) => r.direction === "Incoming").length;
  const outgoing = rows.filter((r) => r.direction === "Outgoing").length;
  const inside = Math.max(0, incoming - Math.floor(outgoing * 0.55));

  const view = useMemo(() => {
    if (filter === "Incoming") return rows.filter((r) => r.direction === "Incoming");
    if (filter === "Outgoing") return rows.filter((r) => r.direction === "Outgoing");
    return rows;
  }, [rows, filter]);

  const columns: Column<GateEntry>[] = useMemo(() => [
    { key: "time", header: "Time", sortValue: (r) => r.time, cell: (r) => <span className="num text-muted-foreground">{r.time}</span> },
    { key: "asset", header: "Asset", sortValue: (r) => r.asset, cell: (r) => <span className="num font-semibold">{r.asset}</span> },
    { key: "driver", header: "Driver", cell: (r) => r.driver },
    { key: "dir", header: "Direction", sortValue: (r) => r.direction, cell: (r) => <StatusBadge status={r.direction} /> },
    { key: "purpose", header: "Purpose", cell: (r) => r.purpose },
    { key: "officer", header: "Officer", cell: (r) => r.officer },
  ], []);

  const submit = async () => {
    if (!form.asset || !form.driver || !form.purpose) {
      toast.error("Missing information", { description: "Vehicle, driver and purpose are required." });
      return;
    }
    const id = await gateService.create({
      time: "12 Aug 2026 — 10:42:31",
      asset: form.asset,
      driver: form.driver,
      direction: form.direction,
      purpose: form.purpose,
      yard: form.yard,
      cargo: form.cargo || "—",
      officer: form.officer,
      reference: form.reference || `REF-${Math.floor(1000 + Math.random() * 9000)}`,
    });
    toast.success(`Gate entry ${id} recorded`, { description: "SERVER TIMESTAMP locked." });
    setOpen(false);
    setForm({
      asset: "", driver: "", purpose: "Trip departure", direction: "Outgoing",
      yard: "Lagos Yard", cargo: "", reference: "", officer: "Sec. Okon",
    });
    await refresh();
  };

  return (
    <>
      <PageHeader
        title="Gate & Security"
        description="Yard in/out log with time, officer and purpose on every entry."
        meta={<StatusBadge status="Online" />}
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
            <ShieldCheck className="h-3.5 w-3.5" />New Entry
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Vehicles Inside" value={inside} accent />
        <MetricCard label="Vehicles Exited" value={outgoing} />
        <MetricCard label="Visitors" value={4} hint="today" />
        <MetricCard label="Assets Moved" value={rows.length} />
        <MetricCard label="Pending Gate Actions" value={2} hint="document checks" />
      </div>

      <SectionPanel title="Gate Activity" description={`${view.length} movements`} bodyClassName="p-0">
        <DataTable
          rows={view}
          columns={columns}
          searchKeys={(r) => `${r.asset} ${r.driver} ${r.purpose} ${r.officer} ${r.reference} ${r.cargo}`}
          pageSize={12}
          toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
        />
      </SectionPanel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">Gate Entry</DialogTitle>
            <DialogDescription>Record vehicle or asset movement with a server-locked timestamp.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="rounded-[18px] border border-black/[0.05] bg-black/[0.03] px-3 py-2">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Server Timestamp</p>
              <p className="num mt-0.5 text-sm font-semibold text-foreground">12 Aug 2026 — 10:42:31</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Vehicle</Label>
                <Select value={form.asset} onValueChange={(v) => setForm((f) => ({ ...f, asset: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>
                    {TRUCKS.slice(0, 20).map((t) => (
                      <SelectItem key={t.id} value={t.registration} className="text-xs">{t.registration}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Driver</Label>
                <Select value={form.driver} onValueChange={(v) => setForm((f) => ({ ...f, driver: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {DRIVERS.slice(0, 20).map((d) => (
                      <SelectItem key={d.id} value={d.name} className="text-xs">{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Direction</Label>
                <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v as "Incoming" | "Outgoing" }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Incoming" className="text-xs">Incoming</SelectItem>
                    <SelectItem value="Outgoing" className="text-xs">Outgoing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Yard</Label>
                <Select value={form.yard} onValueChange={(v) => setForm((f) => ({ ...f, yard: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Lagos Yard", "Abuja Depot", "PH Terminal", "Kano Hub"].map((y) => (
                      <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purpose</Label>
              <Select value={form.purpose} onValueChange={(v) => setForm((f) => ({ ...f, purpose: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Trip departure", "Trip return", "Maintenance", "Fueling", "Visitor", "Asset transfer"].map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo</Label>
                <Input value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} className="h-9 text-xs" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reference</Label>
                <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} className="num h-9 text-xs" placeholder="Trip / WO ID" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Security officer</Label>
              <Input value={form.officer} onChange={(e) => setForm((f) => ({ ...f, officer: e.target.value }))} className="h-9 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => void submit()}>Record Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
