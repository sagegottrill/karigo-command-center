import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, Server, Users, CreditCard, Settings, Activity, Building, LogOut, ArrowLeft, MoreHorizontal } from "lucide-react";
import { DataTable } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import type { Column } from "@/components/fleetopsx/data-table";
import { useState, useEffect } from "react";
import { tenantService, authService } from "@/lib/fleetopsx/services";
import type { PlatformTenant } from "@/lib/fleetopsx/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin")({
  beforeLoad: () => {
    if (!authService.isAuthenticated() || !authService.getRoles().includes("Platform Admin")) {
      throw redirect({ to: "/superadmin/login" });
    }
  },
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
    cell: (r) => {
      const handleStatus = async (status: "Active" | "Suspended") => {
        await tenantService.updateTenant(r.id, { status });
        toast.success(`Tenant marked as ${status}`);
        window.location.reload();
      };

      return (
        <div className="flex justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('manage-tenant', { detail: { tenant: r, tab: "Billing Plan" } }))}>Billing & Subscription</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('manage-tenant', { detail: { tenant: r, tab: "Feature Flags" } }))}>Feature Flags</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('manage-tenant', { detail: { tenant: r, tab: "Danger Zone" } }))}>Suspend / Delete</DropdownMenuItem>
              <DropdownMenuSeparator />
              {r.status === "Active" ? (
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => handleStatus("Suspended")}>Quick Suspend</DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-green-600 focus:text-green-600" onClick={() => handleStatus("Active")}>Quick Activate</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="default" size="sm" onClick={() => {
            window.dispatchEvent(new CustomEvent('manage-tenant', { detail: { tenant: r, tab: "Overview" } }));
          }}>
            Manage
          </Button>
        </div>
      );
    },
  },
];

function SuperAdminLayout() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", domain: "", logo: "" });
  const [managingTenant, setManagingTenant] = useState<PlatformTenant | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    const handleManage = (e: any) => {
      setManagingTenant(e.detail.tenant);
      setActiveTab(e.detail.tab || "Overview");
    };
    window.addEventListener('manage-tenant', handleManage);
    return () => window.removeEventListener('manage-tenant', handleManage);
  }, []);

  const loadTenants = () => {
    tenantService.list().then(setTenants);
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleCreateTenant = async () => {
    if (!newTenant.name || !newTenant.domain) return;
    await tenantService.create(newTenant.name, newTenant.domain, newTenant.logo);
    toast.success("Tenant created successfully");
    setIsDialogOpen(false);
    setNewTenant({ name: "", domain: "", logo: "" });
    loadTenants();
  };

  return (
    <div className="flex h-screen w-full bg-[#F9FAFB] font-['Inter',sans-serif]">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-[260px] bg-[#1a232f] h-full shrink-0">
        <div className="pt-[32px] pb-[40px] px-[24px] flex items-center gap-3">
          <div className="w-[32px] h-[32px] rounded bg-[#e3351d] flex items-center justify-center">
            <Server className="h-4 w-4 text-white" />
          </div>
          <span className="text-[16px] font-[600] text-[#ffffff]">Platform Admin</span>
        </div>
        
        <div className="flex flex-col flex-1">
          <div className="flex flex-col gap-1 px-3">
            <Link to="/superadmin" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] bg-[#e3351d] rounded-md">
              <Building className="h-4 w-4 text-white" />
              <span className="text-[13px] font-[500] text-[#ffffff]">Tenants Directory</span>
            </Link>
          </div>
          
          <div className="px-[24px] mt-[32px] mb-[12px]">
            <span className="text-[10px] font-[600] tracking-[0.05em] text-[#8e95a1] uppercase">MODULES</span>
          </div>
          <div className="flex flex-col gap-1 px-3">
            <Link to="/workspace/app" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Activity className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Main Dashboard</span>
            </Link>
            <Link to="/workspace/app/fleet" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Server className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Fleet Management</span>
            </Link>
            <Link to="/workspace/app/trips" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Activity className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Trips & Dispatch</span>
            </Link>
            <Link to="/workspace/app/accounts" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <CreditCard className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Finance & Accounts</span>
            </Link>
            <Link to="/workspace/app/engineering" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Settings className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Engineering</span>
            </Link>
            <Link to="/workspace/app/inventory" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Server className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Inventory</span>
            </Link>
            <Link to="/workspace/app/drivers" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Users className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Drivers & HR</span>
            </Link>
            <Link to="/workspace/app/gate" className="flex flex-row items-center px-[12px] py-[10px] gap-[12px] hover:bg-white/5 transition-colors rounded-md group">
              <Server className="h-4 w-4 text-[#8e95a1] group-hover:text-white transition-colors" />
              <span className="text-[13px] font-[400] text-[#8e95a1] group-hover:text-white transition-colors">Gate Security</span>
            </Link>
          </div>
        </div>

        <div className="mt-auto pb-[24px]">
          <div className="px-[24px] pb-[12px]">
            <Link to="/">
              <button className="w-full flex items-center justify-center gap-2 py-[8px] rounded-[6px] border border-[#8e95a1] hover:bg-white/5 transition-colors mb-3">
                <ArrowLeft className="h-4 w-4 text-[#8e95a1]" />
                <span className="text-[13px] font-[500] text-[#8e95a1]">Back to Main Site</span>
              </button>
            </Link>
            <button onClick={() => { authService.logout(); window.location.href = "/superadmin/login"; }} className="w-full flex items-center justify-center gap-2 py-[8px] rounded-[6px] border border-[#e3351d] hover:bg-[#e3351d]/10 transition-colors">
              <LogOut className="h-4 w-4 text-[#e3351d]" />
              <span className="text-[13px] font-[500] text-[#e3351d]">Log Out</span>
            </button>
          </div>
          <div className="px-[24px] mt-4">
            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-[12px]">
                <div className="w-[32px] h-[32px] rounded bg-[#e5e7eb] flex items-center justify-center">
                  <span className="text-[13px] font-[600] text-[#141a1f]">SA</span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[13px] font-[600] text-[#ffffff]">Super Admin</span>
                  <span className="text-[11px] font-[400] text-[#8e95a1]">admin@fleetopsx.com</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        {/* Header */}
        <header className="h-[72px] bg-white border-b border-[#e2e5e9] flex items-center justify-between px-[32px] shrink-0">
          <div className="flex flex-col">
            <h1 className="text-[20px] font-[600] leading-[28px] text-[#141a1f]">Tenant Management</h1>
            <p className="text-[13px] font-[400] text-[#5c6470]">Manage organizations, multi-tenant billing, and platform-wide settings.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-[#e3351d] hover:bg-[#d62e19] text-white">
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
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="logo" className="text-right">Logo URL</Label>
                  <Input
                    id="logo"
                    value={newTenant.logo}
                    onChange={(e) => setNewTenant({ ...newTenant, logo: e.target.value })}
                    placeholder="e.g. /petrolline.png"
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateTenant}>Create Workspace</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-auto bg-[#F9FAFB] p-[32px]">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-[32px]">
            
            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-[24px]">
              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] p-[24px]" style={{ boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[13px] font-[600] text-[#5c6470] uppercase tracking-[0.05em]">Total Tenants</span>
                  <Building className="h-4 w-4 text-[#8e95a1]" />
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="text-[32px] font-[600] leading-[38px] text-[#141a1f]">{tenants.length}</span>
                  <span className="text-[13px] font-[500] text-[#00b050] bg-[#00b050]/10 px-2 py-0.5 rounded-full mb-1">+1 this month</span>
                </div>
              </div>
              
              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] p-[24px]" style={{ boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[13px] font-[600] text-[#5c6470] uppercase tracking-[0.05em]">Active Vehicles</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="text-[32px] font-[600] leading-[38px] text-[#141a1f]">{tenants.reduce((sum, t) => sum + t.activeTrucks, 0).toLocaleString()}</span>
                  <span className="text-[13px] font-[500] text-[#00b050] bg-[#00b050]/10 px-2 py-0.5 rounded-full mb-1">+12</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] p-[24px]" style={{ boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[13px] font-[600] text-[#5c6470] uppercase tracking-[0.05em]">Platform Orders</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="text-[32px] font-[600] leading-[38px] text-[#141a1f]">{tenants.reduce((sum, t) => sum + t.totalOrders, 0).toLocaleString()}</span>
                  <span className="text-[13px] font-[500] text-[#00b050] bg-[#00b050]/10 px-2 py-0.5 rounded-full mb-1">+8</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] p-[24px]" style={{ boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[13px] font-[600] text-[#5c6470] uppercase tracking-[0.05em]">Active Tenants</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="text-[32px] font-[600] leading-[38px] text-[#141a1f]">{tenants.filter(t => t.status === "Active").length}</span>
                  <span className="text-[13px] font-[500] text-[#8e95a1] bg-[#f3f4f6] px-2 py-0.5 rounded-full mb-1">0</span>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] flex flex-col" style={{ boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)" }}>
              <div className="px-[24px] py-[20px] border-b-[1px] border-[#e2e5e9]">
                <h2 className="text-[16px] font-[600] text-[#141a1f]">All Tenants</h2>
              </div>
              <div className="p-4">
                <DataTable columns={columns} rows={tenants} searchKeys={(r) => r.name} />
              </div>
            </div>
            
          </div>
        </main>
      </div>

      {/* MANAGE TENANT MODAL */}
      <Dialog open={!!managingTenant} onOpenChange={(open) => !open && setManagingTenant(null)}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-[#f8f9fa]">
          {managingTenant && (
            <div className="flex flex-col h-[600px]">
              <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{managingTenant.name}</h2>
                  <p className="text-sm font-mono text-gray-500 mt-1">{managingTenant.domain}.fleetopsx.com</p>
                </div>
                <StatusBadge status={managingTenant.status} />
              </div>
              <div className="flex flex-1 overflow-hidden">
                {/* Modal Sidebar */}
                <div className="w-[200px] bg-white border-r border-gray-200 p-4 space-y-1">
                  <button 
                    onClick={() => setActiveTab("Overview")}
                    className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${activeTab === "Overview" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}>
                    Overview
                  </button>
                  <button 
                    onClick={() => setActiveTab("Billing Plan")}
                    className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${activeTab === "Billing Plan" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}>
                    Billing Plan
                  </button>
                  <button 
                    onClick={() => setActiveTab("Feature Flags")}
                    className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${activeTab === "Feature Flags" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}>
                    Feature Flags
                  </button>
                  <button 
                    onClick={() => setActiveTab("Danger Zone")}
                    className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md mt-4 ${activeTab === "Danger Zone" ? "bg-red-100 text-red-900" : "text-red-600 hover:bg-red-50"}`}>
                    Danger Zone
                  </button>
                </div>
                {/* Modal Content */}
                <div className="flex-1 p-6 overflow-y-auto">
                  {activeTab === "Overview" && (
                    <>
                      <h3 className="text-lg font-semibold mb-4">Workspace Overview</h3>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Active Fleet</p>
                          <p className="text-2xl font-semibold">{managingTenant.activeTrucks.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Total Orders</p>
                          <p className="text-2xl font-semibold">{managingTenant.totalOrders.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm col-span-2">
                          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Current Plan</p>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-lg font-semibold">Enterprise (Annual)</p>
                            <Button variant="outline" size="sm" onClick={() => setActiveTab("Billing Plan")}>Manage Subscription</Button>
                          </div>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-2">Platform Actions</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center bg-white p-3 rounded-md border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-900">Require MFA for all users</p>
                            <p className="text-xs text-gray-500">Force multi-factor authentication across the entire workspace.</p>
                          </div>
                          <div className="h-5 w-9 bg-green-500 rounded-full relative cursor-pointer" onClick={() => toast.success("MFA requirement toggled")}><div className="absolute right-1 top-0.5 h-4 w-4 bg-white rounded-full" /></div>
                        </div>
                        <div className="flex justify-between items-center bg-white p-3 rounded-md border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-900">SSO / SAML Integration</p>
                            <p className="text-xs text-gray-500">Allow users to log in via Okta or Azure AD.</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => toast.success("SSO configured")}>Configure</Button>
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === "Billing Plan" && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold mb-2">Billing & Subscription</h3>
                      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4 border-b pb-4">
                          <div>
                            <h4 className="font-semibold text-gray-900">Enterprise Plan</h4>
                            <p className="text-sm text-gray-500">Billed annually at $2,400/yr</p>
                          </div>
                          <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-green-200">Active</span>
                        </div>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between"><span className="text-gray-500">Next billing date</span><span className="font-medium text-gray-900">Oct 14, 2027</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Payment method</span><span className="font-medium text-gray-900">Visa ending in 4242</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Licenses</span><span className="font-medium text-gray-900">Unlimited users</span></div>
                        </div>
                        <div className="mt-6 pt-4 border-t flex gap-2">
                          <Button className="w-full" onClick={() => toast.success("Redirecting to Stripe...")}>Manage Billing Portal</Button>
                          <Button variant="outline" className="w-full text-red-600 hover:text-red-700" onClick={() => toast.error("Subscription cancellation initiated")}>Cancel Subscription</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "Feature Flags" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold mb-2">Feature Flags</h3>
                      <p className="text-sm text-gray-500 mb-4">Toggle beta features or premium add-ons for this specific tenant.</p>
                      
                      {['AI Route Optimization', 'Predictive Maintenance Analytics', 'Advanced Customer Portal', 'Third-Party Logistics (3PL) Brokerage'].map((feature, i) => (
                        <div key={i} className="flex justify-between items-center bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                          <span className="text-sm font-medium text-gray-900">{feature}</span>
                          <div 
                            className={`h-5 w-9 rounded-full relative cursor-pointer ${i % 2 === 0 ? 'bg-green-500' : 'bg-gray-300'}`}
                            onClick={() => toast.success(`${feature} flag toggled`)}>
                            <div className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-all ${i % 2 === 0 ? 'right-1' : 'left-1'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "Danger Zone" && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
                      
                      <div className="bg-red-50 p-5 rounded-lg border border-red-200">
                        <h4 className="font-semibold text-red-900 mb-1">Suspend Workspace</h4>
                        <p className="text-sm text-red-700 mb-4">Users will not be able to log in, but data will be preserved. API requests will return 403 Forbidden.</p>
                        <Button 
                          variant="outline" 
                          className="bg-white text-red-600 border-red-300 hover:bg-red-100"
                          onClick={() => {
                            tenantService.updateTenant(managingTenant.id, { status: "Suspended" });
                            toast.success("Workspace suspended");
                            setTimeout(() => window.location.reload(), 1000);
                          }}>
                          Suspend Workspace
                        </Button>
                      </div>

                      <div className="bg-red-50 p-5 rounded-lg border border-red-200">
                        <h4 className="font-semibold text-red-900 mb-1">Delete Workspace Data</h4>
                        <p className="text-sm text-red-700 mb-4">Permanently erase this tenant's database, uploaded files, and all associated configurations. This action cannot be undone.</p>
                        <Button 
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => toast.error("Deletion requested. An email has been sent to confirm.")}>
                          Delete Workspace Data
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
