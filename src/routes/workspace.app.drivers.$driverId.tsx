import { createFileRoute, Link } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader, SectionPanel, FieldRow, EmptyState } from "@/components/fleetopsx/page-header";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { driverService } from "@/lib/fleetopsx/services";
import type { Driver } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/drivers/$driverId")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "HR", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Driver Profile | FleetOpsX" },
      { name: "description", content: "Driver personal information, licence details and compliance status." },
      { property: "og:title", content: "Driver Profile | FleetOpsX" },
      { property: "og:description", content: "Driver personal information and compliance." },
    ],
  }),
  component: DriverProfilePage,
});

function DriverProfilePage() {
  const { driverId } = Route.useParams();
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);

  useEffect(() => {
    void driverService.get(driverId).then(setDriver);
  }, [driverId]);

  if (driver === undefined) {
    return <p className="text-xs text-muted-foreground">Loading driver profile…</p>;
  }

  if (!driver) {
    return (
      <EmptyState
        title="Driver not found"
        description={`No driver record matches ${driverId}.`}
        action={<Button asChild size="sm" variant="outline" className="h-8 text-xs"><Link to="/workspace/app/drivers">Back to drivers</Link></Button>}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={driver.name}
        description={`${driver.department} · Employee ${driver.employeeId}`}
        meta={
          <>
            <StatusBadge status={driver.status} />
            <StatusBadge status={driver.compliance} />
          </>
        }
        actions={
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Link to="/workspace/app/drivers"><ArrowLeft className="h-3.5 w-3.5" />All drivers</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionPanel title="Personal Information" bodyClassName="pt-1">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#1d1d1f] text-lg font-bold text-white">{driver.initials}</span>
            <div>
              <p className="text-sm font-semibold">{driver.name}</p>
              <p className="num text-[11px] text-muted-foreground">{driver.employeeId}</p>
            </div>
          </div>
          <FieldRow label="Full name" value={driver.name} />
          <FieldRow label="Employee ID" value={driver.employeeId} />
          <FieldRow label="Phone" value={driver.phone} />
          <FieldRow label="Department" value={driver.department} />
          <FieldRow label="Date joined" value={driver.dateJoined} />
        </SectionPanel>

        <SectionPanel title="Driving Information" bodyClassName="pt-1">
          <FieldRow label="License number" value={driver.licenseNumber} />
          <FieldRow label="License category" value={driver.licenseCategory} />
          <FieldRow label="Expiry date" value={driver.licenseExpiry} />
          <FieldRow label="Experience" value={`${driver.experienceYears} years`} />
          <FieldRow label="Assigned truck" value={driver.assignedTruck ?? "Unassigned"} />
          <FieldRow
            label="Current trip"
            value={
              driver.currentTripId
                ? <Link to="/workspace/app/trips/$tripId" params={{ tripId: driver.currentTripId }} className="font-semibold text-foreground hover:underline">{driver.currentTripId}</Link>
                : "—"
            }
          />
        </SectionPanel>

        <SectionPanel title="Compliance & Performance" bodyClassName="space-y-4">
          <div className="rounded-[18px] border border-black/[0.05] bg-black/[0.02] p-4">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Licence Status</p>
            <div className="mt-2"><StatusBadge status={driver.compliance} /></div>
            <p className="num mt-2 text-xs text-muted-foreground">Expires {driver.licenseExpiry}</p>
          </div>
          <FieldRow label="Trips completed" value={driver.tripsCompleted} />
          <FieldRow label="Safety score" value={`${driver.safetyScore}/100`} />
          <FieldRow label="Operational status" value={<StatusBadge status={driver.status} />} />
        </SectionPanel>
      </div>
    </>
  );
}

