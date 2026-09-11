import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, Building, LogOut, AlertCircle, MoreHorizontal, Users } from "lucide-react";
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
  const navigate = useNavigate({ from: "/superadmin/" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authService.isAuthenticated() || !authService.getRoles().includes("Platform Admin")) {
      navigate({ to: "/superadmin/login" });
    }
  }, [navigate]);

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
      companyId: tenant.id,
      email: newTenant.adminEmail
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
      <div className="hidden lg:flex flex-col w-[240px] bg-[#1B2432] h-full shrink-0">
        <div className="h-20 px-5 flex items-center justify-end">
          <span className="font-['Space_Grotesk',sans-serif] text-[24px] font-bold tracking-[0.4px] text-white">FleetOpsX</span>
        </div>
        
        <div className="flex flex-col flex-1 py-5 items-center">
          <div className="flex flex-col gap-1 w-[224px]">
            <Link to="/superadmin" className="flex flex-row items-center gap-2 h-8 px-2 bg-[#ED351D] rounded">
              <Building className="h-4 w-4 text-white" />
              <span className="text-[14px] tracking-[0.4px] text-white">Tenants Directory</span>
            </Link>
          </div>
        </div>

        <div className="p-2">
          <div className="flex items-center gap-2 h-12 p-2 rounded">
            <div className="size-8 rounded-[6px] bg-[#F1F2F4] grid place-items-center">
              <span className="text-[14px] text-[#5C6470]">SA</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-white leading-[17.5px]">Super Admin</div>
              <div className="text-[12px] text-[#5C6470] truncate">admin@fleetopsx.com</div>
            </div>
            <button
              type="button"
              onClick={() => {
                authService.logout();
                window.location.href = "/superadmin/login";
              }}
              className="text-[#5C6470]"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)] flex items-end justify-between px-5 pt-5 pb-2.5 shrink-0">
          <div className="flex flex-col gap-[5px]">
            <h1 className="text-[24px] font-medium leading-8 text-[#1B2432]">Super Admin Portal</h1>
            <p className="text-[11.4px] font-normal uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              onboard and Manage Tenant company account
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 h-9 rounded bg-[#ED351D] hover:bg-[#d62e19] text-white text-[14px] font-medium tracking-[0.4px]">
                <Plus className="h-4 w-4" /> Add New Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto bg-[#f8f9fa]">
              <DialogHeader className="bg-white px-6 py-4 border-b border-gray-200">
                <DialogTitle className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Onboard New Tenants</DialogTitle>
                <DialogDescription className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)] mt-1">
                  Provide enterprise workspace for new tenants and assign primary administrator
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 p-6">
                
                {/* Workspace Details Section */}
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 border-b pb-3 mb-4 flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    Workspace Profile
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
                      <Label htmlFor="domain" className="text-right text-sm font-medium text-gray-700 mt-2">Workplace Domain <span className="text-red-500">*</span></Label>
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
                    Primary Administrator
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
                  Creating a tenant will automatically generate a Transport Manager Account.
                </p>
                <Button onClick={handleCreateTenant} className="bg-[#ED351D] hover:bg-[#d62e19] text-white h-10 px-6">
                  Create Workplace
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
              <div className="bg-[#ffffff] rounded-[8px] p-[15px]" style={{ boxShadow: "0px 4px 16px -8px rgba(12,12,13,0.1), 0px 4px 4px -4px rgba(12,12,13,0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">Total Tenants</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="font-['Space_Grotesk',sans-serif] text-[36px] font-bold leading-9 text-[#1B2432]">{tenants.length}</span>
                </div>
              </div>
              
              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[8px] p-[15px]" style={{ boxShadow: "0px 4px 16px -8px rgba(12,12,13,0.1), 0px 4px 4px -4px rgba(12,12,13,0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">Total Requests</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="font-['Space_Grotesk',sans-serif] text-[36px] font-bold leading-9 text-[#1B2432]">{tenants.reduce((sum, t) => sum + t.totalOrders, 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[8px] p-[15px]" style={{ boxShadow: "0px 4px 16px -8px rgba(12,12,13,0.1), 0px 4px 4px -4px rgba(12,12,13,0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">Active Fleets</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="font-['Space_Grotesk',sans-serif] text-[36px] font-bold leading-9 text-[#1B2432]">{tenants.reduce((sum, t) => sum + t.activeTrucks, 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[8px] p-[15px]" style={{ boxShadow: "0px 4px 16px -8px rgba(12,12,13,0.1), 0px 4px 4px -4px rgba(12,12,13,0.05)" }}>
                <div className="flex items-center justify-between mb-[12px]">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">Active Tenants</span>
                </div>
                <div className="flex items-end gap-[12px]">
                  <span className="font-['Space_Grotesk',sans-serif] text-[36px] font-bold leading-9 text-[#1B2432]">{tenants.filter(t => t.status === "Active").length}</span>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#ffffff] border-[1px] border-[#e2e5e9] rounded-[10px] flex flex-col" style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.05)" }}>
              <div className="px-[24px] py-[20px] border-b-[1px] border-[#e2e5e9] flex items-center gap-2.5">
                <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Tenant Registry</h2>
                <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[14px] font-medium text-white">
                  {tenants.length}
                </span>
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
