import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { depreciationService, formatNaira } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";

const FILTERS = ["All", "Head", "Tail"] as const;

import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/app/depreciation")({
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Accounts"];
    if (!allowed.includes(authService.getRole())) {
      throw redirect({ to: "/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Depreciation | FleetOpsX" },
      { name: "description", content: "Asset depreciation and end-of-life tracking." },
    ],
  }),
  component: DepreciationPage,
});

type DepreciationDoc = {
  id: string;
  reg: string;
  type: string;
  purchaseYear: number;
  purchasePrice: number;
  lifespan: number;
  currentValue: number;
  remainingYears: number;
};

function DepreciationPage() {
  const [assets, setAssets] = useState<DepreciationDoc[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [threshold, setThreshold] = useState(2); // years

  const refresh = async () => {
    const list = await depreciationService.getAssetDepreciation();
    setAssets(list);
  };

  useEffect(() => { void refresh(); }, []);

  const view = filter === "All" ? assets : assets.filter((a) => a.type === filter);

  const getStatus = (rem: number) => {
    if (rem <= 0) return "End of Life";
    if (rem <= threshold) return "Approaching EOL";
    return "Active";
  };

  const getStatusBadge = (rem: number) => {
    return <StatusBadge status={getStatus(rem)} />;
  };

  const columns: Column<DepreciationDoc>[] = useMemo(() => [
    { key: "id", header: "Asset", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", cell: (r) => <span className="num">{r.reg}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <span className="text-muted-foreground">{r.type}</span> },
    { key: "year", header: "Purchase Year", align: "right", sortValue: (r) => r.purchaseYear, cell: (r) => <span className="num">{r.purchaseYear}</span> },
    { key: "price", header: "Purchase Price", align: "right", sortValue: (r) => r.purchasePrice, cell: (r) => <span className="num">{formatNaira(r.purchasePrice)}</span> },
    { key: "value", header: "Current Value", align: "right", sortValue: (r) => r.currentValue, cell: (r) => <span className="num font-semibold">{formatNaira(r.currentValue)}</span> },
    { key: "lifespan", header: "Lifespan", align: "right", sortValue: (r) => r.lifespan, cell: (r) => <span className="num">{r.lifespan}y</span> },
    { key: "rem", header: "Remaining", align: "right", sortValue: (r) => r.remainingYears, cell: (r) => <span className={cn("num font-medium", r.remainingYears <= threshold && "text-critical")}>{r.remainingYears}y</span> },
    { key: "status", header: "Status", cell: (r) => getStatusBadge(r.remainingYears) },
  ], [threshold]);

  const atRisk = assets.filter(a => a.remainingYears <= threshold).length;
  const totalVal = assets.reduce((s, a) => s + a.currentValue, 0);

  return (
    <>
      <PageHeader
        title="Asset Depreciation"
        description="Track vehicle lifespans and calculate current depreciated values."
        actions={
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">EOL Threshold (Years)</Label>
            <Input 
              type="number" 
              className="h-8 w-20 num text-xs" 
              value={threshold} 
              onChange={(e) => setThreshold(Number(e.target.value) || 0)} 
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tracked Assets" value={assets.length} accent icon={Calculator} />
        <MetricCard label="Approaching EOL" value={atRisk} deltaTone="down" hint={`≤ ${threshold} years`} />
        <MetricCard label="Current Value (Heads)" value={formatNaira(assets.filter(a => a.type === "Head").reduce((s, a) => s + a.currentValue, 0))} />
        <MetricCard label="Current Value (Tails)" value={formatNaira(assets.filter(a => a.type === "Tail").reduce((s, a) => s + a.currentValue, 0))} />
      </div>

      <SectionPanel title="Depreciation Register" description={`${view.length} assets`} bodyClassName="p-0 mt-4">
        <DataTable
          rows={view}
          columns={columns}
          searchKeys={(r) => `${r.id} ${r.reg} ${r.type}`}
          pageSize={12}
          toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
        />
      </SectionPanel>
    </>
  );
}
