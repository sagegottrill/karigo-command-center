import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { MetricCard } from "@/components/karigo/metric-card";
import { DataTable, type Column } from "@/components/karigo/data-table";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { driverService } from "@/lib/karigo/services";
import type { Driver } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/drivers/")({
  head: () => ({
    meta: [
      { title: "Drivers & HR — Karigo TMS" },
      { name: "description", content: "Driver availability, licence compliance and HR records for the transport workforce." },
      { property: "og:title", content: "Drivers & HR — Karigo TMS" },
      { property: "og:description", content: "Driver availability, compliance and HR records." },
    ],
  }),
  component: DriversPage,
});

const FILTERS = ["All", "Available", "On Trip", "Off Duty", "Suspended"] as const;

function DriversPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  useEffect(() => { void driverService.list().then(setRows); }, []);

  const count = (s: Driver["status"]) => rows.filter((d) => d.status === s).length;
  const complianceIssues = rows.filter((d) => d.compliance !== "Valid").length;
  const view = filter === "All" ? rows : rows.filter((d) => d.status === filter);

  const columns: Column<Driver>[] = useMemo(() => [
    {
      key: "driver", header: "Driver", sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-primary/15 text-[10px] font-bold text-primary">{r.initials}</span>
          <span className="font-medium">{r.name}</span>
        </span>
      ),
    },
    { key: "id", header: "ID", sortValue: (r) => r.id, cell: (r) => <span className="num">{r.id}</span> },
    { key: "license", header: "License", cell: (r) => <span className="num text-muted-foreground">{r.licenseNumber}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "trip", header: "Current Trip",
      cell: (r) => r.currentTripId
        ? <Link to="/app/trips/$tripId" params={{ tripId: r.currentTripId }} className="num text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.currentTripId}</Link>
        : <span className="text-muted-foreground">—</span>,
    },
    { key: "compliance", header: "Compliance", sortValue: (r) => r.compliance, cell: (r) => <StatusBadge status={r.compliance} /> },
  ], []);

  return (
    <>
      <PageHeader
        title="Drivers & HR"
        description="Workforce availability, licence compliance and assignment state."
        actions={
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate({ to: "/app/drivers/$driverId", params: { driverId: rows[0]?.id ?? "DRV-001" } })}>
            Open sample profile
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Drivers" value={rows.length} accent icon={Users} />
        <MetricCard label="Available" value={count("Available")} />
        <MetricCard label="On Trip" value={count("On Trip")} />
        <MetricCard label="Off Duty" value={count("Off Duty")} />
        <MetricCard label="Suspended" value={count("Suspended")} />
        <MetricCard label="Compliance Issues" value={complianceIssues} deltaTone="down" hint="expiring / expired" />
      </div>

      <Tabs defaultValue="register">
        <TabsList className="h-9">
          <TabsTrigger value="register" className="text-xs">Drivers</TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <SectionPanel title="Driver Register" description={`${view.length} drivers`} bodyClassName="p-0">
            <DataTable
              rows={view}
              columns={columns}
              searchKeys={(r) => `${r.id} ${r.name} ${r.employeeId} ${r.licenseNumber} ${r.status}`}
              pageSize={12}
              onRowClick={(r) => navigate({ to: "/app/drivers/$driverId", params: { driverId: r.id } })}
              toolbar={
                <div className="flex flex-wrap gap-1">
                  {FILTERS.map((f) => (
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

        <TabsContent value="compliance" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.filter((d) => d.compliance !== "Valid").map((d) => (
            <Link
              key={d.id}
              to="/app/drivers/$driverId"
              params={{ driverId: d.id }}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{d.name}</span>
                <StatusBadge status={d.compliance} />
              </div>
              <p className="num mt-2 text-[11px] text-muted-foreground">{d.id} · {d.licenseNumber} · {d.licenseCategory}</p>
              <p className="num mt-1 text-xs text-foreground">Expires {d.licenseExpiry}</p>
            </Link>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
