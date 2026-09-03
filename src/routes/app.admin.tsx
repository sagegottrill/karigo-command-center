import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useState, useEffect } from "react";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User, RoleKey, Trip, Company, LoginReport } from "@/lib/fleetopsx/types";
import { adminService, tripService, companyService } from "@/lib/fleetopsx/services";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Ban, KeyRound, Trash2, CheckCircle2, Edit2 } from "lucide-react";

export const Route = createFileRoute("/app/admin")({
  loader: async () => {
    const [tenant, roles, loginReports] = await Promise.all([
      adminService.tenant(),
      adminService.roles(),
      adminService.loginReports(),
    ]);
    return { tenant, roles, loginReports };
  },
  beforeLoad: () => {
    if (typeof window === 'undefined') return;
    const allowed = ["Transport Manager"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Administration | FleetOpsX" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { tenant: TENANT, roles: ROLES, loginReports: LOGIN_REPORTS } = Route.useLoaderData();
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [newUser, setNewUser] = useState<{ firstName: string; surname: string; username: string; roles: string[]; defaultPassword: string; companyId: string; department: string }>({ firstName: "", surname: "", username: "", roles: [], defaultPassword: "", companyId: "", department: "" });
  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [newCompany, setNewCompany] = useState({ name: "", contactPerson: "", phone: "", email: "" });

  useEffect(() => {
    adminService.users().then(setUsers);
    tripService.list().then(setTrips);
    companyService.list().then(setCompanies);
  }, []);

  const handleCreateUser = async () => {
    if (!newUser.firstName || !newUser.surname || !newUser.username || newUser.roles.length === 0 || !newUser.defaultPassword) {
      toast.error("Please fill all required fields and select at least one role");
      return;
    }
    await adminService.createUser({
      ...newUser,
      companyId: newUser.roles.includes("Customer Portals (External)") && newUser.companyId ? newUser.companyId : undefined,
    });
    toast.success("User created. Default password requires reset on login.");
    setIsAddUserOpen(false);
    adminService.users().then(setUsers);
  };

  const handleCreateCompany = async () => {
    if (!newCompany.name || !newCompany.contactPerson || !newCompany.email) {
      toast.error("Please fill all required fields");
      return;
    }
    await companyService.create(newCompany);
    toast.success("Customer Portal profile created.");
    setIsAddCompanyOpen(false);
    companyService.list().then(setCompanies);
  };

  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "reset" | "suspend" | "delete" } | null>(null);

  const executeAction = async () => {
    if (!confirmAction) return;
    const { id, action } = confirmAction;
    
    if (action === "reset") {
      await adminService.resetPassword(id);
      toast.success("Password reset initiated. User must change password on next login.");
    } else if (action === "suspend") {
      await adminService.suspendUser(id);
      toast.warning("Account suspended.");
    } else if (action === "delete") {
      await adminService.deleteUser(id);
      toast.error("Account deleted (soft).");
    }
    
    setConfirmAction(null);
    adminService.users().then(setUsers);
  };

  const handleEditUserSubmit = async () => {
    if (!editUser.id) return;
    await adminService.editUser(editUser.id, editUser);
    toast.success("User updated successfully");
    setIsEditUserOpen(false);
    adminService.users().then(setUsers);
  };

  const userColumns: Column<User>[] = [
    { key: "name", header: "User", sortValue: (r) => r.name, cell: (r) => (
      <div className="flex flex-col">
        <span className="font-medium">{r.name}</span>
        <span className="text-xs text-muted-foreground">@{r.username} {r.companyId ? `· ${companies.find(c => c.id === r.companyId)?.name || r.companyId}` : ""}</span>
      </div>
    ) },
    { key: "role", header: "Roles", sortValue: (r) => r.roleNames.join(", "), cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.roleNames.map((n) => (
          <span key={n} className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-800">
            {n}
          </span>
        ))}
      </div>
    )},
    { key: "dept", header: "Department", cell: (r) => r.department },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "actions", header: "", cell: (r) => (
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setEditUser(r); setIsEditUserOpen(true); }} title="Edit User">
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setConfirmAction({ id: r.id, action: "reset" })} title="Reset Password">
          <KeyRound className="h-3.5 w-3.5 text-blue-500" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setConfirmAction({ id: r.id, action: "suspend" })} title="Suspend Account" disabled={r.status === "Suspended" || r.status === "Deleted"}>
          <Ban className="h-3.5 w-3.5 text-amber-500" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7 border-critical text-critical hover:bg-critical/10 hover:text-critical" onClick={() => setConfirmAction({ id: r.id, action: "delete" })} title="Soft Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )},
  ];

  const approvalColumns: Column<Trip>[] = [
    { key: "id", header: "Trip ID", cell: (r) => <span className="font-medium text-xs">{r.id}</span> },
    { key: "customer", header: "Customer", cell: (r) => <span className="text-xs">{r.customerConsignee || r.customer}</span> },
    { key: "truck", header: "Assigned Asset", cell: (r) => <span className="text-xs">{r.truckReg}</span> },
    { key: "driver", header: "Driver", cell: (r) => <span className="text-xs">{r.driverName}</span> },
    { key: "costs", header: "Direct Costs", cell: (r) => (
      <span className="text-xs font-mono">
        {r.directCosts ? `₦${(r.directCosts.tripAllowance + r.directCosts.returnWaybill + r.directCosts.motorBoy + r.directCosts.ticket + r.directCosts.extraAllowance).toLocaleString()}` : '—'}
      </span>
    )},
    { key: "actions", header: "", align: "right", cell: (r) => (
      <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => handleApproveDispatch(r.id)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
      </Button>
    )},
  ];

  const handleApproveDispatch = (id: string) => {
    // In a real app, we'd update the trip status via service
    toast.success(`Dispatch ${id} approved and routed to Customer Portal.`);
    setTrips(trips.map(t => t.id === id ? { ...t, status: "Scheduled" } : t));
  };

  const pendingApprovals = trips.filter(t => t.status === "Awaiting Approval");

  const companyColumns: Column<Company>[] = [
    { key: "name", header: "Company Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "contact", header: "Contact Person", cell: (r) => r.contactPerson },
    { key: "contactInfo", header: "Contact Info", cell: (r) => (
      <div className="flex flex-col text-xs text-muted-foreground">
        <span>{r.email}</span>
        <span>{r.phone}</span>
      </div>
    )},
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  const loginColumns: Column<LoginReport>[] = [
    { key: "name", header: "User", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "role", header: "Role", cell: (r) => <span className="text-xs">{r.role}</span> },
    { key: "time", header: "Timestamp", cell: (r) => <span className="text-xs text-muted-foreground">{r.timestamp}</span> },
    { key: "device", header: "Device", cell: (r) => <span className="text-xs">{r.device}</span> },
    { key: "ip", header: "IP Address", cell: (r) => <span className="font-mono text-xs">{r.ip}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} tone={r.status === "Success" ? "success" : "critical"} /> },
  ];

  return (
    <>
      <PageHeader
        title="Administration"
        description="Tenant configuration, access control and operational thresholds."
        meta={<span className="num text-[11px] text-muted-foreground">Workspace {TENANT.workspaceId}</span>}
      />

      <Tabs defaultValue="approvals">
        <TabsList className="h-9">
          {([["approvals", "Dispatch Approvals"], ["org", "Organization"], ["users", "Users"], ["requests", "Password Requests"], ["roles", "Roles & Permissions"], ["logins", "Login Reports"], ["companies", "Customer Portals"], ["config", "System Configuration"]] as const).map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="text-xs">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="approvals" className="mt-4">
          <SectionPanel title="Dispatch Approvals Queue" description={`${pendingApprovals.length} requests awaiting your approval.`} bodyClassName="p-0">
            {pendingApprovals.length > 0 ? (
              <DataTable rows={pendingApprovals} columns={approvalColumns} pageSize={10} searchKeys={(r) => r.id} />
            ) : (
              <div className="p-12 text-center text-sm text-muted-foreground">No dispatches awaiting approval.</div>
            )}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <SectionPanel 
            title="Manage Password Requests" 
            description="Users who have requested a password reset or are locked out." 
            bodyClassName="p-0"
          >
            <DataTable 
              rows={users.filter(u => u.passwordResetRequired)} 
              columns={[
                { key: "name", header: "User", cell: (r) => <span className="font-medium">{r.name}</span> },
                { key: "email", header: "Email Address", cell: (r) => <span className="text-xs text-muted-foreground">{r.email}</span> },
                { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                { key: "actions", header: "", align: "right", cell: (r) => (
                  <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => setConfirmAction({ id: r.id, action: "reset" })}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve Reset
                  </Button>
                )},
              ]} 
              pageSize={10} 
              searchKeys={(r) => `${r.name} ${r.email}`} 
              emptyTitle="No pending requests"
              emptyDescription="No users are currently awaiting password resets."
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="org" className="mt-4 grid gap-5 lg:grid-cols-2">
           {/* ... org content kept simple ... */}
           <SectionPanel title="Company Profile" bodyClassName="pt-1">
            <FieldRow label="Legal name" value={TENANT.name} />
            <FieldRow label="Workspace ID" value={TENANT.workspaceId} />
            <FieldRow label="Industry" value={TENANT.industry} />
            <FieldRow label="Country" value={TENANT.country} />
            <FieldRow label="Contact email" value={TENANT.contactEmail} />
            <FieldRow label="Contact phone" value={TENANT.contactPhone} />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <SectionPanel 
            title="User Management" 
            description={`${users.length} users`} 
            bodyClassName="p-0"
            meta={
              <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" />Add User</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Provision New User</DialogTitle>
                    <DialogDescription>Create an account. First login requires password reset.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5"><Label className="text-xs">First Name</Label><Input className="h-9 text-xs" value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Surname</Label><Input className="h-9 text-xs" value={newUser.surname} onChange={e => setNewUser({...newUser, surname: e.target.value})} /></div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">Username</Label><Input className="h-9 text-xs" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Department</Label><Input className="h-9 text-xs" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Default Password (Temporary)</Label><Input type="password" placeholder="e.g. Temp123!" className="h-9 text-xs" value={newUser.defaultPassword} onChange={e => setNewUser({...newUser, defaultPassword: e.target.value})} /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Assigned Roles</Label>
                      <div className="flex flex-wrap gap-2">
                        {ROLES.map(r => (
                          <button
                            key={r.key}
                            type="button"
                            onClick={() => {
                              const selected = newUser.roles.includes(r.key);
                              setNewUser({
                                ...newUser,
                                roles: selected ? newUser.roles.filter(role => role !== r.key) : [...newUser.roles, r.key]
                              });
                            }}
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${
                              newUser.roles.includes(r.key) 
                                ? "bg-black text-white border-black" 
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    {newUser.roles.includes("Customer Portals (External)") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Customer Portal Profile</Label>
                        <Select value={newUser.companyId} onValueChange={(v) => setNewUser({...newUser, companyId: v})}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select company" /></SelectTrigger>
                          <SelectContent>
                            {companies.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter><Button onClick={handleCreateUser}>Create Account</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            }
          >
            <DataTable rows={users} columns={userColumns} pageSize={10} searchKeys={(r) => `${r.name} ${r.email} ${r.roleNames.join(" ")}`} />
            
            {/* Confirmation Dialogs */}
            <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Action</DialogTitle>
                  <DialogDescription>
                    {confirmAction?.action === "reset" && "Are you sure you want to send a new password?"}
                    {confirmAction?.action === "suspend" && "Are you sure you want to suspend this account?"}
                    {confirmAction?.action === "delete" && "Are you sure you want to delete this account?"}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
                  <Button 
                    variant={confirmAction?.action === "delete" ? "destructive" : "default"} 
                    onClick={executeAction}
                  >
                    Confirm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            {/* Edit User Dialog */}
            <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit User</DialogTitle>
                  <DialogDescription>Modify role, department, or company assignment.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input className="h-9 text-xs" value={editUser.name || ""} onChange={e => setEditUser({...editUser, name: e.target.value})} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Department</Label><Input className="h-9 text-xs" value={editUser.department || ""} onChange={e => setEditUser({...editUser, department: e.target.value})} /></div>
                  <div className="space-y-1.5">
                      <Label className="text-xs">Assigned Roles</Label>
                      <div className="flex flex-wrap gap-2">
                        {ROLES.map(r => {
                          const roles = editUser.roles || [];
                          return (
                            <button
                              key={r.key}
                              type="button"
                              onClick={() => {
                                const selected = roles.includes(r.key as any);
                                setEditUser({
                                  ...editUser,
                                  roles: selected ? roles.filter(role => role !== r.key) : [...roles, r.key as any]
                                });
                              }}
                              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${
                                roles.includes(r.key as any) 
                                  ? "bg-black text-white border-black" 
                                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {editUser.roles?.includes("Customer Portals (External)") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Customer Portal Profile</Label>
                      <Select value={editUser.companyId || "none"} onValueChange={(v) => setEditUser({...editUser, companyId: v === "none" ? undefined : v})}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select company" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">None</SelectItem>
                          {companies.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter><Button onClick={handleEditUserSubmit}>Save Changes</Button></DialogFooter>
              </DialogContent>
            </Dialog>

          </SectionPanel>
        </TabsContent>

        <TabsContent value="roles" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <span className="num text-[11px] text-muted-foreground">{r.users} users</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.modules.map((m) => <StatusBadge key={m} status={m} dot={false} tone="neutral" />)}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="logins" className="mt-4">
          <SectionPanel 
            title="Login Activity Report" 
            description="Audit log of all user authentication events in your tenant." 
            bodyClassName="p-0"
          >
            <DataTable rows={LOGIN_REPORTS} columns={loginColumns} pageSize={10} searchKeys={(r) => `${r.name} ${r.role} ${r.device}`} />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="companies" className="mt-4">
          <SectionPanel 
            title="Customer Portals" 
            description={`${companies.length} profiles`} 
            bodyClassName="p-0"
            meta={
              <Dialog open={isAddCompanyOpen} onOpenChange={setIsAddCompanyOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" />Add Company</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Customer Portal</DialogTitle>
                    <DialogDescription>Create a new external company profile.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-1.5"><Label className="text-xs">Company Name</Label><Input className="h-9 text-xs" value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Contact Person</Label><Input className="h-9 text-xs" value={newCompany.contactPerson} onChange={e => setNewCompany({...newCompany, contactPerson: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" className="h-9 text-xs" value={newCompany.email} onChange={e => setNewCompany({...newCompany, email: e.target.value})} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input className="h-9 text-xs" value={newCompany.phone} onChange={e => setNewCompany({...newCompany, phone: e.target.value})} /></div>
                  </div>
                  <DialogFooter><Button onClick={handleCreateCompany}>Create Company</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            }
          >
            <DataTable rows={companies} columns={companyColumns} pageSize={10} searchKeys={(r) => `${r.name} ${r.contactPerson} ${r.email}`} />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="config" className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* Config stub */}
        </TabsContent>
      </Tabs>
    </>
  );
}
