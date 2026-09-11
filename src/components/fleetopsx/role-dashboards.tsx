import { Link } from "@tanstack/react-router";
import { formatNaira } from "@/lib/fleetopsx/services";
import { StatusBadge } from "./status-badge";
import { MetricCard } from "./metric-card";
import { Button } from "@/components/ui/button";
import type {
  Trip,
  TruckHead,
  TruckTail,
  Expense,
  GateEntry,
  Driver,
  AlertItem,
  WorkOrder,
  InventoryItem,
  ProcurementRequest,
} from "@/lib/fleetopsx/types";

const card =
  "rounded border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]";

export interface DashboardProps {
  trips: Trip[];
  trucks: (TruckHead | TruckTail)[];
  expenses: Expense[];
  gateEntries: GateEntry[];
  drivers: Driver[];
  alerts: AlertItem[];
  workOrders: WorkOrder[];
  inventory: InventoryItem[];
  procurement: ProcurementRequest[];
}

export function TransportManagerDashboard({ trips }: DashboardProps) {
  const awaitingOrders = trips.filter((t) => t.status === "Scheduled" || t.status === "Awaiting Approval");
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Transport Manager</h2>
      <MetricCard label="Orders awaiting action" value={awaitingOrders.length} />
      <div className={card}>
        <h3 className="mb-4 text-[16px] font-medium text-[#1B2432]">Pending orders</h3>
        {awaitingOrders.length === 0 ? (
          <p className="text-[14px] text-[#5C6470]">No scheduled trips waiting.</p>
        ) : (
          awaitingOrders.map((t) => (
            <div key={t.id} className="flex justify-between gap-3 border-b border-[#E2E5E9] py-2 last:border-0">
              <span className="text-[14px] text-[#1B2432]">
                {t.id} — {t.pickup} to {t.dropoff}
              </span>
              <Link to="/workspace/app/fleet">
                <Button size="sm">Review</Button>
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function FleetManagerDashboard({ trips, trucks }: DashboardProps) {
  const incoming = trips.filter((t) => t.status === "Requested" || t.status === "Awaiting Approval");
  const activeDispatch = trips.filter(
    (t) =>
      t.status === "Scheduled" ||
      t.status === "En Route" ||
      t.status === "Loaded" ||
      t.status === "Offloading" ||
      t.status === "Returning" ||
      t.status === "Delayed",
  );
  const availableHeads = trucks.filter((t) => t.status === "Available").length;
  const inUseHeads = trucks.filter((t) => t.status === "Assigned" || t.status === "In Transit").length;
  const completed = trips.filter((t) => t.status === "Completed").length;

  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Fleet Operations</h2>
        <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
          Live dispatch queue and fleet readiness
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/workspace/app/dispatch"
          className="rounded border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)] transition-colors hover:border-[#ED351D]/40"
        >
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">Incoming dispatch</p>
          <p className="mt-2 font-space-grotesk text-[32px] font-medium leading-10 text-[#1B2432]">{incoming.length}</p>
        </Link>
        <Link
          to="/workspace/app/dispatch"
          className="rounded border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)] transition-colors hover:border-[#ED351D]/40"
        >
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">Active on road</p>
          <p className="mt-2 font-space-grotesk text-[32px] font-medium leading-10 text-[#1B2432]">
            {activeDispatch.length}
          </p>
        </Link>
        <Link
          to="/workspace/app/fleet-registry"
          className="rounded border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)] transition-colors hover:border-[#ED351D]/40"
        >
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">Available heads</p>
          <p className="mt-2 font-space-grotesk text-[32px] font-medium leading-10 text-[#1B2432]">{availableHeads}</p>
          <p className="mt-1 text-[12px] text-[#5C6470]">{inUseHeads} assigned / in transit</p>
        </Link>
        <Link
          to="/workspace/app/dispatch-history"
          className="rounded border border-[#E2E5E9] bg-white p-5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)] transition-colors hover:border-[#ED351D]/40"
        >
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">Completed trips</p>
          <p className="mt-2 font-space-grotesk text-[32px] font-medium leading-10 text-[#1B2432]">{completed}</p>
        </Link>
      </div>

      <div className={card}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-[16px] font-medium text-[#1B2432]">Queue needing assignment</h3>
          <Link to="/workspace/app/dispatch" className="text-[14px] font-medium text-[#ED351D]">
            Open dispatch
          </Link>
        </div>
        {incoming.length === 0 ? (
          <p className="text-[14px] text-[#5C6470]">No trips waiting in the live queue.</p>
        ) : (
          <ul className="divide-y divide-[#E2E5E9]">
            {incoming.slice(0, 8).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[#1B2432]">{t.customer || t.id}</p>
                  <p className="truncate text-[12px] text-[#5C6470]">
                    {t.cargo} — {t.pickup || "—"} → {t.dropoff || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  <Link to="/workspace/app/dispatch">
                    <Button size="sm" className="bg-[#ED351D] text-white hover:bg-[#ED351D]/90">
                      Assign
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FuelManagerDashboard({ expenses }: DashboardProps) {
  const pendingFuel = expenses.filter((e) => e.type === "Fuel" && e.status === "Pending");
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Fuel Management</h2>
      <MetricCard label="Pending diesel to confirm" value={pendingFuel.length} />
      <div className={card}>
        <h3 className="mb-4 text-[16px] font-medium text-[#1B2432]">Pending requisitions</h3>
        {pendingFuel.length === 0 ? (
          <p className="text-[14px] text-[#5C6470]">No pending fuel expenses from the live API.</p>
        ) : (
          pendingFuel.map((f) => (
            <div key={f.id} className="flex justify-between border-b border-[#E2E5E9] py-2 last:border-0">
              <span className="text-[14px]">
                {f.id} — {f.requester}
              </span>
              <span>{formatNaira(f.amount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AccountantDashboard({ expenses }: DashboardProps) {
  const pendingFunds = expenses.filter((e) => e.status === "Pending");
  const fuelCosts = expenses.filter((e) => e.type === "Fuel").reduce((a, b) => a + b.amount, 0);
  const otherCosts = expenses
    .filter((e) => e.type !== "Fuel")
    .reduce((a, b) => a + b.amount, 0);

  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Accounts</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Funds pending release" value={pendingFunds.length} />
        <MetricCard label="Fuel costs (loaded)" value={formatNaira(fuelCosts)} />
        <MetricCard label="Other costs (loaded)" value={formatNaira(otherCosts)} />
      </div>
    </div>
  );
}

export function GateDashboard({ gateEntries }: DashboardProps) {
  const todayLog = gateEntries.slice(0, 5);
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Security & Gate</h2>
      <div className={card}>
        <h3 className="mb-4 text-[16px] font-medium text-[#1B2432]">Recent log</h3>
        {todayLog.length === 0 ? (
          <p className="text-[14px] text-[#5C6470]">No gate entries from the live API.</p>
        ) : (
          todayLog.map((g) => (
            <div key={g.id} className="flex justify-between border-b border-[#E2E5E9] py-2 last:border-0">
              <span className="text-[14px]">
                {g.asset} — {g.direction}
              </span>
              <span className="text-[12px] text-[#5C6470]">{g.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function HRDashboard({ alerts, drivers }: DashboardProps) {
  const complianceAlerts = alerts.filter((a) => /expire/i.test(a.message));
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">HR & Compliance</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard label="Alerts nearing expiry" value={complianceAlerts.length} />
        <MetricCard label="Staff on directory" value={drivers.length} />
      </div>
      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-medium text-[#1B2432]">Staff directory</h3>
          <Link to="/workspace/app/hr" className="text-[14px] font-medium text-[#ED351D]">
            Open HR
          </Link>
        </div>
        <p className="text-[14px] text-[#5C6470]">
          {drivers.length === 0
            ? "No drivers returned from the live API yet."
            : `${drivers.length} drivers loaded — manage them on HR & Personnel.`}
        </p>
      </div>
    </div>
  );
}

export function EngineerDashboard({ workOrders, inventory }: DashboardProps) {
  const activeRepairs = workOrders.filter((w) => w.status === "Repairing" || w.status === "Diagnosing");
  const lowStock = inventory.filter((i) => i.stock <= i.reorderLevel);
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Engineering</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard label="Active repairs" value={activeRepairs.length} />
        <MetricCard label="Low stock alerts" value={lowStock.length} />
      </div>
    </div>
  );
}

export function ProcurementDashboard({ procurement }: DashboardProps) {
  const pendingRequests = procurement.filter((p) => p.status === "Requested");
  return (
    <div className="flex w-full flex-col gap-[30px] bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <h2 className="text-[24px] font-medium text-[#1B2432]">Procurement</h2>
      <MetricCard label="Incoming parts requests" value={pendingRequests.length} />
      <div className={card}>
        <h3 className="mb-4 text-[16px] font-medium text-[#1B2432]">Requests queue</h3>
        {pendingRequests.length === 0 ? (
          <p className="text-[14px] text-[#5C6470]">No procurement requests from the live API.</p>
        ) : (
          pendingRequests.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-[#E2E5E9] py-2 last:border-0">
              <span className="text-[14px]">
                {p.partName} ({p.quantity})
              </span>
              <StatusBadge status={p.status} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
