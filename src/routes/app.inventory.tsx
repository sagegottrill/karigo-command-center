import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Boxes, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inventoryService, formatNaira, engineeringService } from "@/lib/karigo/services";
import type { InventoryItem, InventoryRequisition, WorkOrder } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Karigo TMS" },
      { name: "description", content: "Workshop store stock levels, spare parts requisitions and controlled releases." },
      { property: "og:title", content: "Inventory — Karigo TMS" },
      { property: "og:description", content: "Workshop store stock and spare parts releases." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [reqs, setReqs] = useState<InventoryRequisition[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<"All" | "In Stock" | "Low Stock" | "Out of Stock">("All");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [form, setForm] = useState({ workOrder: "", partId: "", quantity: "1", reason: "Scheduled repair" });

  const refresh = async () => {
    const [i, r, w] = await Promise.all([
      inventoryService.list(),
      inventoryService.requisitions(),
      engineeringService.listWorkOrders(),
    ]);
    setItems(i);
    setReqs(r);
    setWorkOrders(w.filter((wo) => wo.status !== "Completed"));
  };

  useEffect(() => { void refresh(); }, []);

  const low = items.filter((i) => i.status === "Low Stock").length;
  const out = items.filter((i) => i.status === "Out of Stock").length;
  const pending = reqs.filter((r) => r.status === "Pending").length;
  const value = items.reduce((s, i) => s + i.stock * i.unitCost, 0);
  const view = filter === "All" ? items : items.filter((i) => i.status === filter);
  const selectedPart = items.find((i) => i.id === form.partId);
  const selectedWo = workOrders.find((w) => w.id === form.workOrder);

  const columns: Column<InventoryItem>[] = useMemo(() => [
    { key: "name", header: "Item", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "sku", header: "SKU", sortValue: (r) => r.sku, cell: (r) => <span className="num">{r.sku}</span> },
    { key: "cat", header: "Category", cell: (r) => <span className="text-muted-foreground">{r.category}</span> },
    { key: "stock", header: "Stock", align: "right", sortValue: (r) => r.stock, cell: (r) => <span className="num font-semibold">{r.stock}</span> },
    { key: "reorder", header: "Reorder Level", align: "right", sortValue: (r) => r.reorderLevel, cell: (r) => <span className="num text-muted-foreground">{r.reorderLevel}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", cell: (r) => r.location },
  ], []);

  const reqColumns: Column<InventoryRequisition>[] = useMemo(() => [
    { key: "id", header: "Requisition", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "wo", header: "Work Order", cell: (r) => <span className="num text-primary">{r.workOrder}</span> },
    { key: "truck", header: "Truck", cell: (r) => <span className="num">{r.truckReg}</span> },
    { key: "part", header: "Part", cell: (r) => r.part },
    { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{r.quantity}</span> },
    { key: "mech", header: "Mechanic", cell: (r) => r.mechanic },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ], []);

  const release = async () => {
    if (!form.workOrder) {
      toast.error("Parts cannot be released without an active Work Order.");
      return;
    }
    if (!form.partId || !selectedPart) {
      toast.error("Select a spare part to release.");
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty < 1) {
      toast.error("Quantity must be at least 1.");
      return;
    }
    await inventoryService.release(form.partId, qty);
    toast.success("Parts released", {
      description: `${selectedPart.name} × ${qty} against ${form.workOrder}`,
    });
    setReleaseOpen(false);
    setForm({ workOrder: "", partId: "", quantity: "1", reason: "Scheduled repair" });
    await refresh();
  };

  return (
    <>
      <PageHeader
        title="Inventory / Workshop Store"
        description="Stock control, reorder thresholds and work-order-linked spare parts release."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setReleaseOpen(true)}>
            <PackageOpen className="h-3.5 w-3.5" />Release Parts
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Stock Items" value={items.length} accent icon={Boxes} />
        <MetricCard label="Low Stock" value={low} deltaTone="down" hint="below reorder" />
        <MetricCard label="Out of Stock" value={out} />
        <MetricCard label="Pending Requisitions" value={pending} />
        <MetricCard label="Inventory Value" value={formatNaira(value)} />
      </div>

      <Tabs defaultValue="stock">
        <TabsList className="h-9">
          <TabsTrigger value="stock" className="text-xs">Stock</TabsTrigger>
          <TabsTrigger value="requisitions" className="text-xs">Requisitions</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <SectionPanel title="Inventory Register" description={`${view.length} items`} bodyClassName="p-0">
            <DataTable
              rows={view}
              columns={columns}
              searchKeys={(r) => `${r.name} ${r.sku} ${r.category} ${r.location}`}
              pageSize={12}
              toolbar={
                <div className="flex flex-wrap gap-1">
                  {(["All", "In Stock", "Low Stock", "Out of Stock"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                        filter === f ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              }
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="requisitions" className="mt-4">
          <SectionPanel title="Spare Parts Requisitions" description={`${reqs.length} requests`} bodyClassName="p-0">
            <DataTable
              rows={reqs}
              columns={reqColumns}
              searchKeys={(r) => `${r.id} ${r.workOrder} ${r.part} ${r.truckReg} ${r.mechanic}`}
              pageSize={10}
            />
          </SectionPanel>
        </TabsContent>
      </Tabs>

      <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">Release Parts</DialogTitle>
            <DialogDescription>Parts cannot be released without an active Work Order.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Work Order</Label>
              <Select value={form.workOrder} onValueChange={(v) => setForm((f) => ({ ...f, workOrder: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select active WO" /></SelectTrigger>
                <SelectContent>
                  {workOrders.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">{w.id} · {w.truckReg} · {w.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Part</Label>
              <Select value={form.partId} onValueChange={(v) => setForm((f) => ({ ...f, partId: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select part" /></SelectTrigger>
                <SelectContent>
                  {items.filter((i) => i.stock > 0).slice(0, 30).map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">{i.name} · {i.sku} ({i.stock})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="num h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Truck</Label>
                <Input readOnly value={selectedWo?.truckReg ?? "—"} className="num h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="h-9 text-xs" />
            </div>
            {selectedPart && selectedWo && (
              <div className="rounded-md border border-border bg-surface-raised p-3">
                <FieldRow label="Work Order" value={selectedWo.id} />
                <FieldRow label="Part" value={selectedPart.name} />
                <FieldRow label="Quantity" value={form.quantity} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReleaseOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => void release()}>Release Parts</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
