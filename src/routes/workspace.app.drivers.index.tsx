import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useEffect, useMemo, useState } from "react";
import { Users, MoreHorizontal, Plus, Trash2, Edit } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { driverService } from "@/lib/fleetopsx/services";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import type { Driver } from "@/lib/fleetopsx/types";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace/app/drivers/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "HR", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Drivers & HR | FleetOpsX" },
      { name: "description", content: "Driver availability, licence compliance and HR records for the transport workforce." },
      { property: "og:title", content: "Drivers & HR | FleetOpsX" },
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

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: "", phone: "", licenseNumber: "", licenseCategory: "", licenseExpiry: "" });
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const handleAddSubmit = async () => {
    if (!newDriver.name || !newDriver.phone || !newDriver.licenseNumber) {
      toast.error("Please fill required fields.");
      return;
    }
    await driverService.create(newDriver);
    toast.success("Driver added successfully!");
    setIsAddOpen(false);
    setNewDriver({ name: "", phone: "", licenseNumber: "", licenseCategory: "", licenseExpiry: "" });
    void driverService.list().then(setRows);
  };

  const handleEditSubmit = async () => {
    if (!editingDriver) return;
    await driverService.update(editingDriver.id, {
      name: editingDriver.name,
      phone: editingDriver.phone,
      licenseNumber: editingDriver.licenseNumber,
      licenseCategory: editingDriver.licenseCategory,
      licenseExpiry: editingDriver.licenseExpiry,
    });
    toast.success("Driver updated successfully!");
    setEditingDriver(null);
    void driverService.list().then(setRows);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this driver?")) {
      await driverService.delete(id);
      toast.success("Driver deleted.");
      void driverService.list().then(setRows);
    }
  };

  const columns: Column<Driver>[] = useMemo(() => [
    {
      key: "driver", header: "Driver", sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1d1d1f] text-[10px] font-bold text-white">{r.initials}</span>
          <span className="font-medium">{r.name}</span>
        </span>
      ),
    },
    { key: "id", header: "ID", sortValue: (r) => displayDriverSalary(r) || r.employeeId, cell: (r) => <span className="num font-semibold">{displayDriverSalary(r) || r.employeeId}</span> },
    { key: "license", header: "License", cell: (r) => <span className="num text-muted-foreground">{r.licenseNumber}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "trip", header: "Current Trip",
      cell: (r) => r.currentTripId
        ? <Link to="/workspace/app/trips/$tripId" params={{ tripId: r.currentTripId }} className="num font-semibold text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>{r.currentTripId}</Link>
        : <span className="text-muted-foreground">—</span>,
    },
    { key: "compliance", header: "Compliance", sortValue: (r) => r.compliance, cell: (r) => <StatusBadge status={r.compliance} /> },
    {
      key: "actions", header: "",
      cell: (r) => (
        <div className="flex justify-end pr-2" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingDriver(r)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-600" onClick={() => handleDelete(r.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], []);

  return (
    <>
      <PageHeader
        title="Drivers & HR"
        description="Drivers on duty, licences and who is assigned where."
        actions={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-[40px] rounded-[4px] bg-[#1d1d1f] hover:bg-[#2c3a50] px-[16px] text-[14px] font-[500] text-white shadow-none transition-colors">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Driver</DialogTitle>
                <DialogDescription>
                  Register a new driver into the HR system.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" value={newDriver.name} onChange={(e) => setNewDriver({...newDriver, name: e.target.value})} placeholder="e.g. John Doe" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" value={newDriver.phone} onChange={(e) => setNewDriver({...newDriver, phone: e.target.value})} placeholder="e.g. 08012345678" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="license" className="text-right">License No.</Label>
                  <Input id="license" value={newDriver.licenseNumber} onChange={(e) => setNewDriver({...newDriver, licenseNumber: e.target.value})} placeholder="e.g. LAG-123456" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="category" className="text-right">Category</Label>
                  <Input id="category" value={newDriver.licenseCategory} onChange={(e) => setNewDriver({...newDriver, licenseCategory: e.target.value})} placeholder="e.g. Class G" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="expiry" className="text-right">Expiry Date</Label>
                  <Input id="expiry" value={newDriver.licenseExpiry} onChange={(e) => setNewDriver({...newDriver, licenseExpiry: e.target.value})} placeholder="e.g. 14 Feb 2026" className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAddSubmit} className="bg-[#1d1d1f] text-white">Save Driver</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              onRowClick={(r) => navigate({ to: "/workspace/app/drivers/$driverId", params: { driverId: r.id } })}
              toolbar={<FilterPills options={FILTERS} value={filter} onChange={setFilter} />}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="compliance" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.filter((d) => d.compliance !== "Valid").map((d) => (
            <Link
              key={d.id}
              to="/workspace/app/drivers/$driverId"
              params={{ driverId: d.id }}
              className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)] transition-colors hover:border-black/[0.1]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{d.name}</span>
                <StatusBadge status={d.compliance} />
              </div>
              <p className="num mt-2 text-[11px] text-muted-foreground">{displayDriverSalary(d) || d.employeeId} · {d.licenseNumber} · {d.licenseCategory}</p>
              <p className="num mt-1 text-xs text-foreground">Expires {d.licenseExpiry}</p>
            </Link>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
            <DialogDescription>
              Update HR records for this driver.
            </DialogDescription>
          </DialogHeader>
          {editingDriver && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">Name</Label>
                <Input id="edit-name" value={editingDriver.name} onChange={(e) => setEditingDriver({...editingDriver, name: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-phone" className="text-right">Phone</Label>
                <Input id="edit-phone" value={editingDriver.phone} onChange={(e) => setEditingDriver({...editingDriver, phone: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-license" className="text-right">License No.</Label>
                <Input id="edit-license" value={editingDriver.licenseNumber} onChange={(e) => setEditingDriver({...editingDriver, licenseNumber: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-category" className="text-right">Category</Label>
                <Input id="edit-category" value={editingDriver.licenseCategory} onChange={(e) => setEditingDriver({...editingDriver, licenseCategory: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-expiry" className="text-right">Expiry Date</Label>
                <Input id="edit-expiry" value={editingDriver.licenseExpiry} onChange={(e) => setEditingDriver({...editingDriver, licenseExpiry: e.target.value})} className="col-span-3" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDriver(null)}>Cancel</Button>
            <Button onClick={handleEditSubmit} className="bg-[#1d1d1f] text-white">Update Driver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

