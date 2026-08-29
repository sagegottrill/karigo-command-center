import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/fleetopsx/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Server, Users, CreditCard, Settings, Activity, Building } from "lucide-react";
import { DataTable } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import type { Column } from "@/components/fleetopsx/data-table";
import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { tenantService } from "@/lib/fleetopsx/services";
import type { PlatformTenant } from "@/lib/fleetopsx/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin")({
  component: SuperAdminLayout,
});



const columns: Column<PlatformTenant>[] = [
  {
    key: "name",
    header: "Tenant Name",
    sortValue: (r) => r.name,
    cell: (r) => (
      <div className="flex flex-col">
        <span className="font-semibold">{r.name}</span>
        <span className="text-xs text-muted-foreground">ID: {r.id}</span>
      </div>
    ),
  },
  {
    key: "domain",
    header: "Tenant Domain",
    sortValue: (r) => r.domain,
    cell: (r) => (
      <span className="font-mono text-xs bg-muted px-2 py-1 rounded-md">
        {r.domain}.fleetopsx.com
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortValue: (r) => r.status,
    cell: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "activeTrucks",
    header: "Active Fleet",
    sortValue: (r) => r.activeTrucks,
    cell: (r) => (
      <span className="font-medium">{r.activeTrucks.toLocaleString()}</span>
    ),
  },
  {
    key: "totalOrders",
    header: "Total Orders",
    sortValue: (r) => r.totalOrders,
    cell: (r) => (
      <span className="font-medium text-muted-foreground">{r.totalOrders.toLocaleString()}</span>
    ),
  },
  {
    key: "actions",
    header: "",
    cell: (r) => (
      <div className="flex justify-end gap-2">
        <Link to="/pwa/$tenantId" params={{ tenantId: r.domain }} target="_blank">
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
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", domain: "" });

  const loadTenants = () => {
    tenantService.list().then(setTenants);
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.domain) return;
    await tenantService.create(newTenant.name, newTenant.domain);
    toast.success("Tenant created successfully");
    setIsDialogOpen(false);
    setNewTenant({ name: "", domain: "" });
    loadTenants();
  };

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
          <Link to="/superadmin" className="flex items-center gap-3 px-3 py-2.5 bg-primary/10 text-primary font-medium rounded-md">
            <Users className="h-4 w-4" /> Tenants
          </Link>
          <Link to="/superadmin" className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
            <CreditCard className="h-4 w-4" /> Billing & Revenue
          </Link>
          <Link to="/superadmin" className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
            <Activity className="h-4 w-4" /> System Health
          </Link>
          <Link to="/superadmin" className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground font-medium rounded-md transition-colors">
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
      <main className="flex-1 overflow-auto bg-muted/20">
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <PageHeader 
              title="Tenant Management" 
              description="Manage organizations, multi-tenant billing, and platform-wide settings."
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Onboard Tenant
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Onboard New Tenant</DialogTitle>
                  <DialogDescription>
                    Create a new workspace instance for a customer organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">Name</Label>
                    <Input
                      id="name"
                      value={newTenant.name}
                      onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                      placeholder="e.g. Kiuth Logistics"
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="domain" className="text-right">Domain</Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <Input
                        id="domain"
                        value={newTenant.domain}
                        onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                        placeholder="kiuth"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">.fleetopsx.com</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTenant}>Create Workspace</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* High-level metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Tenants" 
              value={tenants.length.toString()} 
              trend="+1 this month"
              icon={<Building className="h-5 w-5 text-blue-500" />}
            />
            <MetricCard 
              title="Active Vehicles"
              value={tenants.reduce((sum, t) => sum + t.activeTrucks, 0).toLocaleString()}
              trend={{ value: 12, label: "from last month", isPositive: true }}
            />
            <MetricCard 
              title="Platform Orders"
              value={tenants.reduce((sum, t) => sum + t.totalOrders, 0).toLocaleString()}
              trend={{ value: 8, label: "from last month", isPositive: true }}
            />
            <MetricCard 
              title="Active Tenants"
              value={tenants.filter(t => t.status === "Active").length.toString()}
              trend={{ value: 0, label: "trailing 30 days", isPositive: true }}
            />
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <DataTable 
              columns={columns} 
              rows={tenants} 
              searchKeys={(r) => r.name} 
            />
          </div>
        </div>
      </main>
    </div>
  );
}
