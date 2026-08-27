import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/karigo/filter-pills";
import { procurementService } from "@/lib/karigo/services";
import type { ProcurementRequest } from "@/lib/karigo/types";

const FILTERS = ["All", "Requested", "Sourcing", "Procured"] as const;

import { redirect } from "@tanstack/react-router";
import { CURRENT_ROLE } from "@/lib/karigo/mock-data";

export const Route = createFileRoute("/app/procurement")({
  beforeLoad: () => {
    const allowed = ["Super Admin", "Operations Admin", "Procurement Officer", "Engineering Manager"];
    if (!allowed.includes(CURRENT_ROLE)) {
      throw redirect({ to: "/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Procurement | Karigo" },
      { name: "description", content: "Manage procurement requests for spare parts from Engineering." },
    ],
  }),
  component: ProcurementPage,
});

function ProcurementPage() {
  const [reqs, setReqs] = useState<ProcurementRequest[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const refresh = async () => {
    const list = await procurementService.list();
    setReqs(list);
  };

  useEffect(() => { void refresh(); }, []);

  const requested = reqs.filter((r) => r.status === "Requested").length;
  const sourcing = reqs.filter((r) => r.status === "Sourcing").length;
  const procured = reqs.filter((r) => r.status === "Procured").length;
  const view = filter === "All" ? reqs : reqs.filter((r) => r.status === filter);

  const markProcured = async (id: string) => {
    await procurementService.markProcured(id);
    toast.success("Request marked as Procured", { description: "Engineering and Transport Manager notified." });
    await refresh();
  };

  const columns: Column<ProcurementRequest>[] = useMemo(() => [
    { key: "id", header: "ID", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "part", header: "Part", sortValue: (r) => r.partName, cell: (r) => <span className="font-medium">{r.partName}</span> },
    { key: "qty", header: "Quantity", align: "right", sortValue: (r) => r.quantity, cell: (r) => <span className="num">{r.quantity}</span> },
    { key: "linked", header: "Linked WO/Truck", sortValue: (r) => r.linkedId, cell: (r) => <span className="num">{r.linkedId}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="num">{r.date}</span> },
    {
      key: "action", header: "Action", align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={r.status === "Procured"}
          onClick={() => void markProcured(r.id)}
        >
          {r.status === "Procured" ? "Completed" : "Mark Procured"}
        </Button>
      ),
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Queue of parts requests from Engineering."
        actions={
          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <ShoppingCart className="h-3.5 w-3.5" />New Request
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Requests" value={reqs.length} accent />
        <MetricCard label="Requested" value={requested} hint="needs action" />
        <MetricCard label="Sourcing" value={sourcing} />
        <MetricCard label="Procured" value={procured} />
      </div>

      <SectionPanel title="Procurement Queue" description={`${view.length} items`} bodyClassName="p-0 mt-4">
        <DataTable
          rows={view}
          columns={columns}
          searchKeys={(r) => `${r.id} ${r.partName} ${r.linkedId}`}
          pageSize={12}
          toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
        />
      </SectionPanel>
    </>
  );
}
