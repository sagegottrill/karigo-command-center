import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { PageHeader } from "@/components/fleetopsx/page-header";

export const Route = createFileRoute("/customer-portal/")({
  component: SisterCompanyDashboard,
});

function SisterCompanyDashboard() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<Trip[]>([]);

  useEffect(() => {
    tripService.list().then((allTrips) => {
      // Show trips belonging to Customer Portal
      setRequests(allTrips.filter((t) => t.customer === "Customer Portal"));
    });
  }, []);

  const columns: Column<Trip>[] = [
    { key: "id", header: "Request ID", cell: (r) => <span className="font-medium text-xs">{r.id}</span> },
    { key: "customerConsignee", header: "Consignee", cell: (r) => <span className="text-xs">{r.customerConsignee || "—"}</span> },
    { key: "pickup", header: "Pickup", cell: (r) => <span className="text-xs">{r.pickup}</span> },
    { key: "dropoff", header: "Destination", cell: (r) => <span className="text-xs">{r.dropoff}</span> },
    { key: "tailType", header: "Tail Type", cell: (r) => <span className="text-xs">{r.tailType || "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Track your transport requests and their current statuses."
      />
      <div className="rounded-xl border bg-card shadow-sm p-4">
        <DataTable
          rows={requests}
          columns={columns}
          pageSize={10}
          searchKeys={(r) => `${r.id} ${r.customerConsignee} ${r.dropoff}`}
          onRowClick={(r) => navigate({ to: "/customer-portal/$requestId", params: { requestId: r.id } })}
        />
      </div>
    </div>
  );
}
