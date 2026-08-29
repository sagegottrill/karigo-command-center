import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Boxes, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { inventoryService, formatNaira, engineeringService } from "@/lib/fleetopsx/services";
import type { InventoryItem, InventoryRequisition, WorkOrder } from "@/lib/fleetopsx/types";

const FILTERS = ["All", "In Stock", "Low Stock", "Out of Stock"] as const;

import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/app/inventory")({
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Engineering", "Parts & Store"];
    if (!allowed.includes(authService.getRole())) {
      throw redirect({ to: "/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Inventory | FleetOpsX" },
      { name: "description", content: "Workshop store stock levels, spare parts requisitions and controlled releases." },
      { property: "og:title", content: "Inventory | FleetOpsX" },
      { property: "og:description", content: "Workshop store stock and spare parts releases." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [reqs, setReqs] = useState<InventoryRequisition[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [form, setForm] = useState({ reqId: "", reason: "Scheduled repair" });

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
  const selectedReq = reqs.find((r) => r.id === form.reqId);
  const selectedPart = items.find((i) => i.name === selectedReq?.part);
  const selectedWo = workOrders.find((w) => w.id === selectedReq?.workOrder);

  const columns: Column<InventoryItem>[] = useMemo(() => [
    { key: "name", header: "Item", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "sku", header: "SKU", sortValue: (r) => r.sku, cell: (r) => <span className="num">{r.sku}</span> },
    { key: "cat", header: "Category", cell: (r) => <span className="text-muted-foreground">{r.category}</span> },
    { key: "stock", header: "Stock", align: "right", sortValue: (r) => r.stock, cell: (r) => <span className="num font-semibold">{r.stock}</span> },
    { key: "reorder", header: "Reorder Level", align: "right", sortValue: (r) => r.reorderLevel, cell: (r) => (
      <Input
        type="number"
        className="h-7 w-16 text-right num text-xs ml-auto"
        defaultValue={r.reorderLevel}
        onBlur={(e) => {
          const val = Number(e.target.value);
          if (!isNaN(val) && val >= 0 && val !== r.reorderLevel) {
            void inventoryService.updateReorderLevel(r.id, val).then(() => refresh());
          }
        }}
      />
    ) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "loc", header: "Location", cell: (r) => r.location },
  ], []);

  const reqColumns: Column<InventoryRequisition>[] = useMemo(() => [
    { key: "id", header: "Requisition", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "wo", header: "Work Order", cell: (r) => <span className="num font-semibold text-foreground">{r.workOrder}</span> },
    { key: "truck", header: "Truck", cell: (r) => <span className="num">{r.truckReg}</span> },
    { key: "part", header: "Part", cell: (r) => r.part },
    { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{r.quantity}</span> },
    { key: "mech", header: "Mechanic", cell: (r) => r.mechanic },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ], []);

  const release = async () => {
    if (!form.reqId || !selectedReq) {
      toast.error("Select a pending requisition.");
      return;
    }
    if (!selectedWo) {
      toast.error("Requisition is not linked to an active Work Order.");
      return;
    }
    if (!selectedPart) {
      toast.error("Part not found in inventory.");
      return;
    }
    if (selectedPart.stock < selectedReq.quantity) {
      toast.error("Insufficient stock for this requisition.");
      return;
    }
    try {
      await inventoryService.release(selectedPart.id, selectedReq.quantity, form.reqId);
      toast.success("Parts released", {
        description: `${selectedPart.name} × ${selectedReq.quantity} against ${selectedWo.id}`,
      });
      setReleaseOpen(false);
      setForm({ reqId: "", reason: "Scheduled repair" });
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to release parts.");
    }
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
              toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
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
            <DialogDescription>Select a pending requisition to release parts.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Requisition</Label>
              <Select value={form.reqId} onValueChange={(v) => setForm((f) => ({ ...f, reqId: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select pending requisition" /></SelectTrigger>
                <SelectContent>
                  {reqs.filter(r => r.status === "Pending").map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">{r.id} · {r.part} ({r.quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Work Order</Label>
                <Input readOnly value={selectedReq?.workOrder ?? "—"} className="num h-9 text-xs bg-black/[0.02]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity to Release</Label>
                <Input readOnly value={selectedReq?.quantity ?? "—"} className="num h-9 text-xs bg-black/[0.02]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="h-9 text-xs" />
            </div>
            {selectedPart && selectedReq && (
              <div className="rounded-[16px] border border-black/[0.05] bg-black/[0.02] p-3">
                <FieldRow label="Requisition" value={selectedReq.id} />
                <FieldRow label="Part" value={selectedPart.name} />
                <FieldRow label="Required Qty" value={String(selectedReq.quantity)} />
                <FieldRow label="Current Stock" value={String(selectedPart.stock)} />
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
