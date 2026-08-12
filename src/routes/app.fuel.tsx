import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Fuel, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/karigo/filter-pills";
import { fuelService, formatNaira } from "@/lib/karigo/services";
import type { FuelRequisition } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

const FILTERS = ["All", "Pending", "Approved", "Rejected"] as const;

export const Route = createFileRoute("/app/fuel")({
  head: () => ({
    meta: [
      { title: "Fuel | Karigo" },
      { name: "description", content: "Fuel allocation, requisitions, efficiency and variance control across the fleet." },
      { property: "og:title", content: "Fuel | Karigo" },
      { property: "og:description", content: "Fuel allocation, requisitions and efficiency control." },
    ],
  }),
  component: FuelPage,
});

function FuelPage() {
  const [rows, setRows] = useState<FuelRequisition[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selected, setSelected] = useState<FuelRequisition | null>(null);

  const refresh = () => fuelService.list().then((list) => {
    setRows(list);
    setSelected((cur) => (cur ? list.find((r) => r.id === cur.id) ?? list[0] ?? null : list.find((r) => r.status === "Pending") ?? list[0] ?? null));
  });

  useEffect(() => { void refresh(); }, []);

  const pending = rows.filter((r) => r.status === "Pending");
  const issuedToday = rows.filter((r) => r.status === "Approved").reduce((s, r) => s + (r.approvedLitres ?? 0), 0);
  const monthly = rows.reduce((s, r) => s + r.requiredLitres, 0);
  const avgEff = rows.length ? (rows.reduce((s, r) => s + r.standardEfficiency, 0) / rows.length) : 3.2;
  const variance = rows.reduce((s, r) => s + (r.requiredLitres - r.expectedConsumption), 0);

  const view = filter === "All" ? rows : rows.filter((r) => r.status === filter);

  const columns: Column<FuelRequisition>[] = useMemo(() => [
    { key: "id", header: "Requisition", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "trip", header: "Trip", sortValue: (r) => r.tripId, cell: (r) => <span className="num font-semibold text-foreground">{r.tripId}</span> },
    { key: "truck", header: "Truck", cell: (r) => <span className="num">{r.truckReg}</span> },
    { key: "driver", header: "Driver", cell: (r) => r.driverName },
    { key: "req", header: "Required", align: "right", sortValue: (r) => r.requiredLitres, cell: (r) => <span className="num">{r.requiredLitres} L</span> },
    { key: "exp", header: "Expected", align: "right", sortValue: (r) => r.expectedConsumption, cell: (r) => <span className="num text-muted-foreground">{r.expectedConsumption} L</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "date", header: "Date", align: "right", cell: (r) => <span className="num text-muted-foreground">{r.date}</span> },
  ], []);

  const approve = async (id: string) => {
    await fuelService.approve(id);
    toast.success(`${id} approved`, { description: "Litres released to driver fuel wallet." });
    await refresh();
  };

  const reject = async (id: string) => {
    await fuelService.reject(id);
    toast.error(`${id} rejected`, { description: "Requester notified for clarification." });
    await refresh();
  };

  return (
    <>
      <PageHeader
        title="Fuel Management"
        description="Fuel requests, approvals and how usage compares to the standard."
        meta={<StatusBadge status="Online" />}
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Fuel requisition draft opened")}>
            <Fuel className="h-3.5 w-3.5" />New Requisition
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Today's Fuel Issued" value={issuedToday.toLocaleString()} unit="L" accent icon={Fuel} />
        <MetricCard label="Monthly Consumption" value={monthly.toLocaleString()} unit="L" hint="all requisitions" />
        <MetricCard label="Average Km/L" value={avgEff.toFixed(1)} hint="fleet standard 3.2" />
        <MetricCard label="Pending Requisitions" value={pending.length} delta={formatNaira(pending.reduce((s, r) => s + r.cost, 0))} deltaTone="neutral" />
        <MetricCard label="Fuel Variance" value={`${variance > 0 ? "+" : ""}${variance}`} unit="L" deltaTone={variance > 40 ? "down" : "up"} hint="vs expected" />
      </div>

      <Tabs defaultValue="requisitions">
        <TabsList className="h-9">
          <TabsTrigger value="requisitions" className="text-xs">Requisitions</TabsTrigger>
          <TabsTrigger value="detail" className="text-xs">Requisition Detail</TabsTrigger>
          <TabsTrigger value="consumption" className="text-xs">Consumption</TabsTrigger>
        </TabsList>

        <TabsContent value="requisitions" className="mt-4">
          <SectionPanel title="Fuel Requisitions" description={`${view.length} records`} bodyClassName="p-0">
            <DataTable
              rows={view}
              columns={columns}
              searchKeys={(r) => `${r.id} ${r.tripId} ${r.truckReg} ${r.driverName}`}
              pageSize={10}
              onRowClick={setSelected}
              toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="detail" className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <SectionPanel title={selected?.id ?? "Select a requisition"} description="Efficiency review" bodyClassName="pt-1">
            {selected ? (
              <>
                <FieldRow label="Trip" value={selected.tripId} />
                <FieldRow label="Truck" value={selected.truckReg} />
                <FieldRow label="Driver" value={selected.driverName} />
                <FieldRow label="Required litres" value={`${selected.requiredLitres} L`} />
                <FieldRow label="Approved litres" value={selected.approvedLitres != null ? `${selected.approvedLitres} L` : "—"} />
                <FieldRow label="Expected consumption" value={`${selected.expectedConsumption} L`} />
                <FieldRow label="Standard efficiency" value={`${selected.standardEfficiency} Km/L`} />
                <FieldRow label="Current odometer" value={`${selected.odometer.toLocaleString()} km`} />
                <FieldRow label="Estimated cost" value={formatNaira(selected.cost)} />
                <FieldRow label="Status" value={<StatusBadge status={selected.status} />} />
              </>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">Select a requisition from the list.</p>
            )}
          </SectionPanel>
          <SectionPanel title="Allocation limits" description="Based on trip distance and fleet Km/L" bodyClassName="space-y-4">
            <div className="rounded-[18px] border border-black/[0.05] bg-black/[0.03] p-4">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Expected Efficiency</p>
              <p className="num mt-1 text-3xl font-semibold text-foreground">{selected?.standardEfficiency ?? 3.2} <span className="text-sm text-muted-foreground">Km/L</span></p>
            </div>
            <div className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)]">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Expected Fuel</p>
              <p className="num mt-1 text-3xl font-semibold text-foreground">{selected?.expectedConsumption ?? "—"} <span className="text-sm text-muted-foreground">L</span></p>
            </div>
            {selected?.status === "Pending" && (
              <div className="flex gap-2">
                <Button size="sm" className="h-8 flex-1 gap-1.5 text-xs" onClick={() => void approve(selected.id)}>
                  <Check className="h-3.5 w-3.5" />Approve
                </Button>
                <Button size="sm" variant="outline" className="h-8 flex-1 gap-1.5 text-xs" onClick={() => void reject(selected.id)}>
                  <X className="h-3.5 w-3.5" />Reject
                </Button>
              </div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="consumption" className="mt-4">
          <SectionPanel title="Consumption" description="Expected vs requested for this requisition">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rows.slice(0, 9).map((r) => {
                const delta = r.requiredLitres - r.expectedConsumption;
                return (
                  <div key={r.id} className="rounded-[18px] border border-black/[0.05] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-xs font-semibold">{r.id}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">{r.truckReg} · {r.driverName}</p>
                    <p className={cn("num mt-1 text-sm font-semibold", delta > 10 ? "text-warning" : "text-success")}>
                      {delta > 0 ? "+" : ""}{delta} L variance
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionPanel>
        </TabsContent>
      </Tabs>
    </>
  );
}
