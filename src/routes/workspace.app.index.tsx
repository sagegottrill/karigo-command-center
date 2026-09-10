import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CentralDashboard } from "@/components/fleetopsx/central-dashboard";
import {
  AccountantDashboard,
  EngineerDashboard,
  FleetManagerDashboard,
  FuelManagerDashboard,
  GateDashboard,
  HRDashboard,
  ProcurementDashboard,
} from "@/components/fleetopsx/role-dashboards";
import { authService, dashboardService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/")({
  loader: () => dashboardService.getOverview(),
  head: () => ({
    meta: [
      { title: "Overview | FleetOpsX" },
      { name: "description", content: "Fleet overview for Tenant Transport." },
      { property: "og:title", content: "Overview | FleetOpsX" },
      { property: "og:description", content: "Fleet overview for Tenant Transport." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = Route.useLoaderData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <CentralDashboard data={data} />;
  }

  const roles = authService.getRoles();
  if (roles.includes("Transport Manager")) return <CentralDashboard data={data} />;
  if (roles.includes("Fleet Operations")) return <FleetManagerDashboard {...data} />;
  if (roles.includes("Diesel")) return <FuelManagerDashboard {...data} />;
  if (roles.includes("Accounts")) return <AccountantDashboard {...data} />;
  if (roles.includes("Security")) return <GateDashboard {...data} />;
  if (roles.includes("HR")) return <HRDashboard {...data} />;
  if (roles.includes("Engineering")) return <EngineerDashboard {...data} />;
  if (roles.includes("Parts & Store")) return <ProcurementDashboard {...data} />;

  return <CentralDashboard data={data} />;
}
