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
import { FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, dashboardService } from "@/lib/fleetopsx/services";
import type {
  AlertItem,
  Driver,
  Expense,
  GateEntry,
  InventoryItem,
  ProcurementRequest,
  Trip,
  TruckHead,
  WorkOrder,
} from "@/lib/fleetopsx/types";

type OverviewPayload = {
  trips: Trip[];
  trucks: TruckHead[];
  drivers: Driver[];
  expenses: Expense[];
  gateEntries: GateEntry[];
  alerts: AlertItem[];
  workOrders: WorkOrder[];
  inventory: InventoryItem[];
  procurement: ProcurementRequest[];
};

const EMPTY_OVERVIEW: OverviewPayload = {
  trips: [],
  trucks: [],
  drivers: [],
  expenses: [],
  gateEntries: [],
  alerts: [],
  workOrders: [],
  inventory: [],
  procurement: [],
};

export const Route = createFileRoute("/workspace/app/")({
  // Live JWT is browser-only — never SSR-fetch (avoids document 500 Unauthorized)
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
  const [data, setData] = useState<OverviewPayload>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    void dashboardService
      .getOverview()
      .then((overview) => {
        setData({
          trips: overview.trips,
          trucks: overview.trucks,
          drivers: overview.drivers,
          expenses: overview.expenses,
          gateEntries: overview.gateEntries,
          alerts: overview.alerts as AlertItem[],
          workOrders: overview.workOrders,
          inventory: overview.inventory,
          procurement: overview.procurement,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (!mounted || loading) {
    return (
      <div className="flex w-full flex-col bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <FigmaLoadingState label="Loading overview…" />
      </div>
    );
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
