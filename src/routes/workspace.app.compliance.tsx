import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileCheck } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { complianceService } from "@/lib/fleetopsx/services";

import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/compliance")({
  beforeLoad: () => {
    const allowed = ["Transport Manager", "HR"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Compliance | FleetOpsX" },
      { name: "description", content: "Vehicle and driver documents compliance dashboard." },
    ],
  }),
  component: CompliancePage,
});

type VehicleDoc = {
  id: string;
  reg: string;
  documents: {
    registration: number;
    insurance: number;
    roadworthiness: number;
  };
};

type DriverDoc = {
  id: string;
  name: string;
  licenseCategory: string;
  daysToExpiry: number;
};

function CompliancePage() {
  const [vehicles, setVehicles] = useState<VehicleDoc[]>([]);
  const [drivers, setDrivers] = useState<DriverDoc[]>([]);
  const [threshold, setThreshold] = useState(30);

  const refresh = async () => {
    const [v, d] = await Promise.all([
      complianceService.getVehicleDocs(),
      complianceService.getDriverDocs(),
    ]);
    setVehicles(v);
    setDrivers(d);
  };

  useEffect(() => { void refresh(); }, []);

  const getStatus = (days: number) => {
    if (days <= 0) return "Expired";
    if (days <= threshold) return "Expiring Soon";
    return "Valid";
  };

  const getStatusBadge = (days: number) => {
    return <StatusBadge status={getStatus(days)} />;
  };

  const vehicleColumns: Column<VehicleDoc>[] = useMemo(() => [
    { key: "id", header: "Vehicle", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "reg", header: "Registration", cell: (r) => <span className="num">{r.reg}</span> },
    { key: "reg_doc", header: "Reg. Expiry", sortValue: (r) => r.documents.registration, cell: (r) => <div className="flex items-center gap-2"><span className="num w-12">{r.documents.registration}d</span> {getStatusBadge(r.documents.registration)}</div> },
    { key: "ins_doc", header: "Insurance Expiry", sortValue: (r) => r.documents.insurance, cell: (r) => <div className="flex items-center gap-2"><span className="num w-12">{r.documents.insurance}d</span> {getStatusBadge(r.documents.insurance)}</div> },
    { key: "road_doc", header: "Roadworthiness", sortValue: (r) => r.documents.roadworthiness, cell: (r) => <div className="flex items-center gap-2"><span className="num w-12">{r.documents.roadworthiness}d</span> {getStatusBadge(r.documents.roadworthiness)}</div> },
  ], [threshold]);

  const driverColumns: Column<DriverDoc>[] = useMemo(() => [
    { key: "id", header: "Driver ID", sortValue: (r) => r.id, cell: (r) => <span className="num font-semibold">{r.id}</span> },
    { key: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "cat", header: "License Category", cell: (r) => r.licenseCategory },
    { key: "exp", header: "License Expiry", sortValue: (r) => r.daysToExpiry, cell: (r) => <div className="flex items-center gap-2"><span className="num w-12">{r.daysToExpiry}d</span> {getStatusBadge(r.daysToExpiry)}</div> },
  ], [threshold]);

  const expiringVehicles = vehicles.filter(v => 
    v.documents.registration <= threshold || 
    v.documents.insurance <= threshold || 
    v.documents.roadworthiness <= threshold
  ).length;

  const expiringDrivers = drivers.filter(d => d.daysToExpiry <= threshold).length;

  return (
    <>
      <PageHeader
        title="Compliance Dashboard"
        description="Monitor vehicle and driver documents expirations."
        actions={
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">Warning Threshold (Days)</Label>
            <Input 
              type="number" 
              className="h-8 w-20 num text-xs" 
              value={threshold} 
              onChange={(e) => setThreshold(Number(e.target.value) || 0)} 
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tracked Vehicles" value={vehicles.length} accent />
        <MetricCard label="Vehicles at Risk" value={expiringVehicles} deltaTone="down" hint={`≤ ${threshold} days`} />
        <MetricCard label="Tracked Drivers" value={drivers.length} accent icon={FileCheck} />
        <MetricCard label="Drivers at Risk" value={expiringDrivers} deltaTone="down" hint={`≤ ${threshold} days`} />
      </div>

      <Tabs defaultValue="vehicles" className="mt-4">
        <TabsList className="h-9">
          <TabsTrigger value="vehicles" className="text-xs">Vehicle Documents</TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs">Driver Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-4">
          <SectionPanel title="Vehicle Document Register" description={`${vehicles.length} assets`} bodyClassName="p-0">
            <DataTable
              rows={vehicles}
              columns={vehicleColumns}
              searchKeys={(r) => `${r.id} ${r.reg}`}
              pageSize={12}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <SectionPanel title="Driver License Register" description={`${drivers.length} drivers`} bodyClassName="p-0">
            <DataTable
              rows={drivers}
              columns={driverColumns}
              searchKeys={(r) => `${r.id} ${r.name}`}
              pageSize={12}
            />
          </SectionPanel>
        </TabsContent>
      </Tabs>
    </>
  );
}

