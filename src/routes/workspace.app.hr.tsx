import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/fleetopsx/page-header";
import { DataTable } from "@/components/fleetopsx/data-table";
import { fetchApi } from "@/lib/fleetopsx/apiClient";
import { driverService } from "@/lib/fleetopsx/services";
import { Upload, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/app/hr")({
  component: HrStaffDirectory,
});

function HrStaffDirectory() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const router = useRouter();
  
  const [newStaff, setNewStaff] = useState({
    name: "",
    phone: "",
    licenseNumber: "",
    licenseCategory: "Professional",
    licenseExpiry: "2026-12-31"
  });

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.phone) {
      toast.error("Name and Phone are required.");
      return;
    }
    await driverService.create(newStaff);
    toast.success("Staff added successfully!");
    setIsAddOpen(false);
    setNewStaff({ name: "", phone: "", licenseNumber: "", licenseCategory: "Professional", licenseExpiry: "2026-12-31" });
    router.invalidate();
    
    // Refresh local list since loader might not refetch instantly
    const mockDrivers = await driverService.list();
    setDrivers(mockDrivers);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchApi('/drivers');
        setDrivers(data);
      } catch (err) {
        console.warn("Live API failed, using mock", err);
        const mockDrivers = await driverService.list();
        setDrivers(mockDrivers);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleUpload = () => {
    alert("Upload functionality to be integrated. The current list was seeded from your Excel file!");
  };

  const columns = [
    {
      key: "employeeId",
      header: "Staff ID",
      cell: (row: any) => <span className="font-semibold">{row.employeeId || row.staffId}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (row: any) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-xs border border-slate-200">
            {row.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{row.name}</div>
            {row.phone && <div className="text-xs text-muted-foreground">{row.phone}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (row: any) => (
        <span className="text-sm font-medium">
          {row.category || "—"}
        </span>
      ),
    },
    {
      key: "truckReg",
      header: "Assigned Asset",
      cell: (row: any) => (
        <span className="text-sm">
          {row.truckReg || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row: any) => (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${row.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
          {row.status}
        </span>
      ),
    }
  ];

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <PageHeader
          title="Staff Directory"
          description="Manage HR records, driver allocations, and employee data."
          action={
            <div className="flex gap-3">
              <Button onClick={handleUpload} variant="outline" className="gap-2">
                <Upload className="w-4 h-4" /> Upload List
              </Button>
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-primary text-primary-foreground">
                    <UserPlus className="w-4 h-4" /> Add Staff
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add New Staff</DialogTitle>
                    <DialogDescription>Register a new driver or staff member.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">Name</Label>
                      <Input id="name" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phone" className="text-right">Phone</Label>
                      <Input id="phone" value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="license" className="text-right">License</Label>
                      <Input id="license" value={newStaff.licenseNumber} onChange={e => setNewStaff({...newStaff, licenseNumber: e.target.value})} className="col-span-3" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddStaff}>Add Staff</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground font-medium">Total Staff</div>
            <div className="text-2xl font-bold">{drivers.length}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <div className="font-bold text-lg">L</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground font-medium">Local Drivers</div>
            <div className="text-2xl font-bold">{drivers.filter(d => d.category === 'Local').length}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
            <div className="font-bold text-lg">U</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground font-medium">Up Country</div>
            <div className="text-2xl font-bold">{drivers.filter(d => d.category === 'Up Country' || d.category === 'Up Company').length}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <DataTable
          columns={columns as any}
          rows={drivers}
          isLoading={isLoading}
          emptyMessage="No staff members found."
          emptyIcon={<Users className="w-10 h-10 text-muted-foreground/30" />}
        />
      </div>
    </div>
  );
}
