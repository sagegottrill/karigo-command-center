import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/fleetopsx/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Server, Users, CreditCard, Settings, Activity } from "lucide-react";
import { DataTable } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/superadmin")({
  component: SuperAdminLayout,
});

type Tenant = {
  id: string;
  name: string;
  domain: string;
  status: "Active" | "Suspended" | "Onboarding";
  activeTrucks: number;
  totalOrders: number;
  joinedAt: string;
};

const MOCK_TENANTS: Tenant[] = [
  {
    id: "tnt_001",
    name: "Petroline Logistics",
    domain: "petroline",
    status: "Active",
    activeTrucks: 142,
    totalOrders: 12450,
    joinedAt: "2024-01-15",
  },
  {
    id: "tnt_002",
    name: "Dangote Transport",
    domain: "dangote",
    status: "Active",
    activeTrucks: 850,
    totalOrders: 89000,
    joinedAt: "2023-11-02",
  },
  {
    id: "tnt_003",
    name: "Oando Haulage",
    domain: "oando",
    status: "Suspended",
    activeTrucks: 0,
    totalOrders: 530,
    joinedAt: "2024-05-20",
  },
  {
    id: "tnt_004",
    name: "Bua Group Freight",
    domain: "bua",
    status: "Onboarding",
    activeTrucks: 12,
    totalOrders: 0,
    joinedAt: "2024-08-01",
  },
];

const columns: ColumnDef<Tenant>[] = [
  {
    accessorKey: "name",
    header: "Tenant Name",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-semibold">{row.original.name}</span>
        <span className="text-xs text-muted-foreground">ID: {row.original.id}</span>
      </div>
    ),
  },
  {
    accessorKey: "domain",
    header: "Tenant Domain",
    cell: ({ row }) => (
      <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">
        {row.original.domain}.fleetopsx.com
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "activeTrucks",
    header: "Active Fleet",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.activeTrucks.toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "totalOrders",
    header: "Total Orders",
    cell: ({ row }) => (
      <span className="font-medium text-muted-foreground">{row.original.totalOrders.toLocaleString()}</span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <Link to={`/pwa/${row.original.domain}`} target="_blank">
          <Button variant="outline" size="sm">View PWA</Button>
        </Link>
        <Link to="/app">
          <Button variant="default" size="sm">Login As</Button>
        </Link>
      </div>
    ),
  },
];

function SuperAdminLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Super Admin Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <Server className="h-5 w-5" />
            <span className="font-bold tracking-tight">Platform Admin</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <Link className="flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary font-medium rounded-md">
            <Users className="h-4 w-4" /> Tenants
          </Link>
          <Link className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
            <CreditCard className="h-4 w-4" /> Billing & Revenue
          </Link>
          <Link className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
            <Activity className="h-4 w-4" /> System Health
          </Link>
          <Link className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
            <Settings className="h-4 w-4" /> Global Config
          </Link>
        </nav>
        <div className="p-4 border-t border-border">
          <Link to="/">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground">
              ← Back to Main Site
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-muted/20">
        <PageHeader 
          title="Tenants Overview" 
          description="Manage all companies operating on the FleetOpsX multi-tenant infrastructure."
        >
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Provision New Tenant
          </Button>
        </PageHeader>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* High-level metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Tenants"
              value="4"
              trend={{ value: 25, label: "from last month", isPositive: true }}
            />
            <MetricCard 
              title="Active Vehicles"
              value="1,004"
              trend={{ value: 12, label: "from last month", isPositive: true }}
            />
            <MetricCard 
              title="Platform Orders"
              value="101,980"
              trend={{ value: 8, label: "from last month", isPositive: true }}
            />
            <MetricCard 
              title="System Uptime"
              value="99.99%"
              trend={{ value: 0, label: "trailing 30 days", isPositive: true }}
            />
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <DataTable 
              columns={columns} 
              data={MOCK_TENANTS} 
              searchKey="name" 
            />
          </div>
        </div>
      </main>
    </div>
  );
}
