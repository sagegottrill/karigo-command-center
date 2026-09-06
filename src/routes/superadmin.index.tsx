import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, Server, Users, CreditCard, Settings, Activity, Building, LogOut, ArrowLeft, MoreHorizontal, AlertCircle } from "lucide-react";
import { DataTable } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import type { Column } from "@/components/fleetopsx/data-table";
import { useState, useEffect } from "react";
import { tenantService, authService, adminService } from "@/lib/fleetopsx/services";
import type { PlatformTenant } from "@/lib/fleetopsx/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
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
  const [newTenant, setNewTenant] = useState({ name: "", domain: "", logo: "", adminFirstName: "", adminLastName: "", adminEmail: "" });
  const [showShareModal, setShowShareModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState({ username: "", password: "", url: "" });
  const [managingTenant, setManagingTenant] = useState<PlatformTenant | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [tenantAdmins, setTenantAdmins] = useState<any[]>([]);

  useEffect(() => {
    if (managingTenant) {
      adminService.users().then(users => {
        setTenantAdmins(users.filter(u => u.companyId === managingTenant.id && u.roles.includes("Transport Manager")));
      });
    }
  }, [managingTenant]);

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
    if (!newTenant.name || !newTenant.domain || !newTenant.adminFirstName || !newTenant.adminLastName || !newTenant.adminEmail) {
      toast.error("Please fill in all required fields");
      return;
    }
    const tenant = await tenantService.create(newTenant.name, newTenant.domain, newTenant.logo);
    
    const defaultPassword = `temp-${Math.random().toString(36).slice(-6)}`;
    
    await adminService.createUser({
      firstName: newTenant.adminFirstName,
      surname: newTenant.adminLastName,
      roles: ["Transport Manager"],
      username: newTenant.adminEmail.split("@")[0],
      department: "Management",
      companyId: tenant.id
    });
    
    setCreatedCredentials({
      username: newTenant.adminEmail,
      password: defaultPassword,
      url: `https://${newTenant.domain}.fleetopsx.com/workspace/login`
    });

    toast.success("Tenant and Transport Manager created successfully");
    setIsDialogOpen(false);
    setNewTenant({ name: "", domain: "", logo: "", adminFirstName: "", adminLastName: "", adminEmail: "" });
    loadTenants();
    setShowShareModal(true);
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
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto bg-[#f8f9fa]">
              <DialogHeader className="bg-white px-6 py-4 border-b border-gray-200">
                <DialogTitle className="text-xl font-bold text-gray-900">Onboard New Tenant</DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-1">
                  Provision a new enterprise workspace, configure subscription, and create the initial Transport Manager.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 p-6">
                
                {/* Workspace Details Section */}
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 border-b pb-3 mb-4 flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    1. Workspace Profile
                  </h3>
                  <div className="grid gap-5">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right text-sm font-medium text-gray-700">Company Name <span className="text-red-500">*</span></Label>
                      <Input
                        id="name"
                        value={newTenant.name}
                        onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                        placeholder="e.g. Kiuth Logistics"
                        className="col-span-3 h-10"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                      <Label htmlFor="domain" className="text-right text-sm font-medium text-gray-700 mt-2">Workspace Domain <span className="text-red-500">*</span></Label>
                      <div className="col-span-3 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Input
                            id="domain"
                            value={newTenant.domain}
                            onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                            placeholder="kiuth"
                            className="h-10 flex-1"
                          />
                          <span className="text-sm font-mono text-gray-500 bg-gray-100 px-3 py-2 rounded-md border border-gray-200">.fleetopsx.com</span>
                        </div>
                        <p className="text-[12px] text-gray-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Users will log in at: <strong className="font-mono text-blue-600">https://{newTenant.domain || "domain"}.fleetopsx.com/workspace/login</strong>
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="logo" className="text-right text-sm font-medium text-gray-700">Logo URL</Label>
                      <Input
                        id="logo"
                        value={newTenant.logo}
                        onChange={(e) => setNewTenant({ ...newTenant, logo: e.target.value })}
                        placeholder="e.g. https://example.com/logo.png"
                        className="col-span-3 h-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Administrator Details Section */}
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 border-b pb-3 mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    2. Primary Administrator (Transport Manager)
                  </h3>
                  <div className="grid gap-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="adminFirstName" className="text-sm font-medium text-gray-700">First Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="adminFirstName"
                          value={newTenant.adminFirstName}
                          onChange={(e) => setNewTenant({ ...newTenant, adminFirstName: e.target.value })}
                          placeholder="Jane"
                          className="h-10"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="adminLastName" className="text-sm font-medium text-gray-700">Last Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="adminLastName"
                          value={newTenant.adminLastName}
                          onChange={(e) => setNewTenant({ ...newTenant, adminLastName: e.target.value })}
                          placeholder="Doe"
                          className="h-10"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="adminEmail" className="text-sm font-medium text-gray-700">Email Address (Used for Login) <span className="text-red-500">*</span></Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={newTenant.adminEmail}
                        onChange={(e) => setNewTenant({ ...newTenant, adminEmail: e.target.value })}
                        placeholder="jane.doe@company.com"
                        className="h-10"
                      />
                    </div>
                  </div>
                </div>

              </div>
              <DialogFooter className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Provisioning a tenant will automatically generate a <br/>Transport Manager account and send welcome emails.
                </p>
                <Button onClick={handleCreateTenant} className="bg-[#e3351d] hover:bg-[#d62e19] text-white h-10 px-6">
                  Provision Workspace & Admin
                </Button>
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
                    onClick={() => setActiveTab("Settings")}
                    className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${activeTab === "Settings" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}>
                    Settings
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
                      </div>

                      <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-2">Workspace Access</h3>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-900">Impersonate Workspace</p>
                          <p className="text-xs text-blue-700 mt-1">Log in directly to this tenant's dashboard as a Platform Administrator to manage settings, users, and operations on their behalf.</p>
                        </div>
                        <Button 
                          className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 ml-4"
                          onClick={() => {
                            window.location.href = `https://${managingTenant.domain}.fleetopsx.com/workspace/login`;
                          }}
                        >
                          <LogOut className="h-4 w-4 mr-2 rotate-180" />
                          Login to Workspace
                        </Button>
                      </div>

                      <h3 className="text-sm font-semibold text-gray-900 mb-3 border-b pb-2">Tenant Administrators</h3>
                      <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6 overflow-hidden">
                        {tenantAdmins.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500 text-center">No administrators found.</div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {tenantAdmins.map(admin => (
                              <div key={admin.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{admin.name}</p>
                                  <p className="text-xs text-gray-500 mt-0.5">{admin.email} (Username: {admin.username})</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => {
                                  adminService.resetPassword(admin.id);
                                  toast.success(`Password reset link sent to ${admin.email}`);
                                }}>
                                  Reset Password
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === "Settings" && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold mb-2">Workspace Settings</h3>
                      
                      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
                        <div className="grid gap-2">
                          <Label className="text-sm font-medium text-gray-700">Company Name</Label>
                          <Input 
                            value={managingTenant.name}
                            onChange={(e) => setManagingTenant({ ...managingTenant, name: e.target.value })}
                            className="h-10 text-sm"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-sm font-medium text-gray-700">Tenant Domain</Label>
                          <div className="flex">
                            <Input 
                              value={managingTenant.domain}
                              onChange={(e) => setManagingTenant({ ...managingTenant, domain: e.target.value })}
                              className="h-10 text-sm rounded-r-none"
                            />
                            <div className="flex items-center px-3 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-sm text-gray-500 font-mono">
                              .fleetopsx.com
                            </div>
                          </div>
                        </div>
                        <Button 
                          onClick={() => {
                            tenantService.updateTenant(managingTenant.id, { name: managingTenant.name, domain: managingTenant.domain });
                            toast.success("Tenant settings updated successfully");
                            loadTenants();
                          }}
                          className="bg-black hover:bg-gray-800 text-white mt-2"
                        >
                          Save Changes
                        </Button>
                      </div>
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
                          onClick={() => {
                            tenantService.deleteTenant(managingTenant.id);
                            setManagingTenant(null);
                            loadTenants();
                            toast.success("Workspace data permanently deleted.");
                          }}>
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

      {/* SHARE SIGN IN DETAILS MODAL */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Share Sign In Details</DialogTitle>
            <DialogDescription>
              A Transport Manager account has been created for the new tenant. Share these initial credentials securely.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-[#f9fafb] border border-[#e2e5e9] rounded-lg p-4 space-y-4 my-4">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Workspace URL</Label>
              <div className="font-mono text-sm mt-1">{createdCredentials.url}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Username / Email</Label>
              <div className="font-mono text-sm mt-1">{createdCredentials.username}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Temporary Password</Label>
              <div className="font-mono text-sm mt-1 font-bold">{createdCredentials.password}</div>
            </div>
          </div>
          
          <DialogFooter className="sm:justify-end gap-2">
            <Button variant="outline" onClick={() => {
              navigator.clipboard.writeText(`Welcome to FleetOpsX!
Login URL: ${createdCredentials.url}
Username: ${createdCredentials.username}
Password: ${createdCredentials.password}`);
              toast.success("Credentials copied to clipboard");
            }}>
              Copy Details
            </Button>
            <Button onClick={() => setShowShareModal(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
