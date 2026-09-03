import { Link } from "@tanstack/react-router";
import { formatNaira } from "@/lib/fleetopsx/services";
import { StatusBadge } from "./status-badge";
import { MetricCard } from "./metric-card";
import { Button } from "@/components/ui/button";
import type { Trip, TruckHead, TruckTail, Expense, GateEntry, Driver, Alert, WorkOrder, InventoryItem, ProcurementRequest } from "@/lib/fleetopsx/types";

const card = "rounded-[24px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] p-6";

export interface DashboardProps {
  trips: Trip[];
  trucks: (TruckHead | TruckTail)[];
  expenses: Expense[];
  gateEntries: GateEntry[];
  drivers: Driver[];
  alerts: Alert[];
  workOrders: WorkOrder[];
  inventory: InventoryItem[];
  procurement: ProcurementRequest[];
}

export function TransportManagerDashboard({ trips }: DashboardProps) {
  const awaitingOrders = trips.filter(t => t.status === "Scheduled");
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Transport Manager Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard label="Orders Awaiting Accept/Cancel" value={awaitingOrders.length} variant="warning" />
      </div>
      <div className={card}>
        <h3 className="font-semibold mb-4">Pending Orders</h3>
        {awaitingOrders.map(t => (
          <div key={t.id} className="flex justify-between py-2 border-b last:border-0">
            <span>{t.id} - {t.origin} to {t.destination}</span>
            <Link to="/app/trips/$tripId" params={{ tripId: t.id }}><Button size="sm">Review</Button></Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FleetManagerDashboard({ trips, trucks }: DashboardProps) {
  const activeDispatch = trips.filter(t => t.status === "Scheduled");
  const pendingOrders = trips.filter(t => t.status === "Requested");
  const availableHeads = trucks.filter(t => t.type === "Head" && t.status === "Available").length;
  const availableTails = trucks.filter(t => t.type === "Tail" && t.status === "Available").length;
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Fleet Operations Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Incoming Orders" value={pendingOrders.length} variant="warning" />
        <MetricCard label="Active Dispatch Queue" value={activeDispatch.length} variant="info" />
        <MetricCard label="Available Heads" value={availableHeads} variant="success" />
        <MetricCard label="Available Tails" value={availableTails} variant="success" />
      </div>
      {pendingOrders.length > 0 && (
        <div className={card}>
          <h3 className="font-semibold mb-4">Incoming Order Requests (From TM)</h3>
          {pendingOrders.map(t => (
            <div key={t.id} className="flex justify-between py-2 border-b last:border-0 items-center">
              <div>
                <span className="block font-medium">{t.customer}</span>
                <span className="text-xs text-muted-foreground">{t.cargo} - {t.pickup || t.origin} to {t.dropoff || t.destination}</span>
              </div>
              <Link to="/app/dispatch"><Button size="sm">Create Dispatch</Button></Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FuelManagerDashboard({ expenses }: DashboardProps) {
  const pendingFuel = expenses.filter(e => e.type === "Direct Cost" && e.status === "Pending" && e.category === "Fuel");
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Fuel Management Dashboard</h2>
      <MetricCard label="Pending Diesel to Confirm" value={pendingFuel.length} variant="warning" />
      <div className={card}>
        <h3 className="font-semibold mb-4">Pending Requisitions</h3>
        {pendingFuel.map(f => (
          <div key={f.id} className="flex justify-between py-2 border-b last:border-0">
            <span>{f.id} - {f.description}</span>
            <span>{formatNaira(f.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountantDashboard({ expenses }: DashboardProps) {
  const pendingFunds = expenses.filter(e => e.status === "Pending");
  const directCosts = expenses.filter(e => e.type === "Direct Cost").reduce((a, b) => a + b.amount, 0);
  const indirectCosts = expenses.filter(e => e.type === "Indirect Cost").reduce((a, b) => a + b.amount, 0);
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Accounts Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Funds Pending Release" value={pendingFunds.length} variant="warning" />
        <MetricCard label="Today's Direct Costs" value={formatNaira(directCosts)} variant="info" />
        <MetricCard label="Today's Indirect Costs" value={formatNaira(indirectCosts)} variant="critical" />
      </div>
    </div>
  );
}

export function GateDashboard({ gateEntries }: DashboardProps) {
  const todayLog = gateEntries.slice(0, 5);
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Security & Gate Dashboard</h2>
      <div className={card}>
        <h3 className="font-semibold mb-4">Today's Log</h3>
        {todayLog.map(g => (
          <div key={g.id} className="flex justify-between py-2 border-b last:border-0">
            <span>{g.truckId} - {g.type}</span>
            <span>{g.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HRDashboard({ alerts }: DashboardProps) {
  const complianceAlerts = alerts.filter(a => a.message.includes("expire"));
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">HR & Compliance Dashboard</h2>
      <MetricCard label="Alerts Nearing Expiry" value={complianceAlerts.length} variant="critical" />
      <div className={card}>
        <h3 className="font-semibold mb-4">Driver Stats Review</h3>
        <p className="text-muted-foreground">No drivers require review at this time.</p>
      </div>
    </div>
  );
}

export function EngineerDashboard({ workOrders, inventory }: DashboardProps) {
  const activeRepairs = workOrders.filter(w => w.status === "Repairing");
  const lowStock = inventory.filter(i => i.stock < i.min);
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Engineering Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard label="Active Repairs" value={activeRepairs.length} variant="warning" />
        <MetricCard label="Low Stock Alerts" value={lowStock.length} variant="critical" />
      </div>
    </div>
  );
}

export function ProcurementDashboard({ procurement }: DashboardProps) {
  const pendingRequests = procurement.filter(p => p.status === "Requested");
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Procurement Dashboard</h2>
      <MetricCard label="Incoming Parts Requests" value={pendingRequests.length} variant="info" />
      <div className={card}>
        <h3 className="font-semibold mb-4">Requests Queue</h3>
        {pendingRequests.map(p => (
          <div key={p.id} className="flex justify-between py-2 border-b last:border-0">
            <span>{p.item} ({p.quantity})</span>
            <StatusBadge status={p.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
