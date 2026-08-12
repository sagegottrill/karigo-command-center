/**
 * Mock service layer.
 * Every screen reads through these functions, never from mock-data directly.
 * Replacing the bodies with real API calls is the only change needed once the
 * Karigo backend exists.
 */
import * as db from "./mock-data";
import type {
  Driver,
  Expense,
  ExpenseStatus,
  GateEntry,
  InventoryItem,
  Trip,
  TimelineStep,
  Truck,
} from "./types";

const LATENCY = 0;
const settle = <T,>(value: T): Promise<T> =>
  LATENCY ? new Promise((res) => setTimeout(() => res(value), LATENCY)) : Promise.resolve(value);

/* ---------------------------------- fleet --------------------------------- */
export const fleetService = {
  list: () => settle([...store.trucks]),
  get: (id: string) => settle(store.trucks.find((t) => t.id === id) ?? null),
  summary: () =>
    settle({
      total: store.trucks.length,
      available: store.trucks.filter((t) => t.status === "Available").length,
      assigned: store.trucks.filter((t) => t.status === "Assigned").length,
      inTransit: store.trucks.filter((t) => t.status === "In Transit").length,
      maintenance: store.trucks.filter((t) => t.status === "Maintenance").length,
      outOfService: store.trucks.filter((t) => t.status === "Out of Service").length,
    }),
};

/* --------------------------------- drivers -------------------------------- */
export const driverService = {
  list: () => settle([...store.drivers]),
  get: (id: string) => settle(store.drivers.find((d) => d.id === id) ?? null),
};

/* ---------------------------------- trips --------------------------------- */
export const tripService = {
  list: () => settle([...store.trips]),
  get: (id: string) => settle(store.trips.find((t) => t.id === id) ?? null),
  create: (input: Omit<Trip, "id" | "progress" | "eta">) => {
    const id = `TRP-${String(900 + store.trips.length).padStart(5, "0")}`;
    const trip: Trip = { ...input, id, progress: 4, eta: "—" };
    store.trips = [trip, ...store.trips];
    return settle(trip);
  },
  timeline: (trip: Trip): TimelineStep[] => {
    const order = [
      "Dispatch Created",
      "Driver Assigned",
      "Truck Departed",
      "Pickup Completed",
      "En Route",
      "Offloading",
      "Returning",
      "Trip Completed",
    ];
    const idx: Record<string, number> = {
      Scheduled: 1,
      Loaded: 3,
      "En Route": 4,
      Stopped: 4,
      Delayed: 4,
      Offloading: 5,
      Returning: 6,
      Completed: 7,
    };
    const current = idx[trip.status] ?? 4;
    return order.map((label, i) => {
      const step: TimelineStep = {
        label,
        state: i < current ? "done" : i === current ? "current" : "pending",
      };
      if (i <= current) {
        step.at = `${String(6 + i).padStart(2, "0")}:${String((i * 17) % 60).padStart(2, "0")}`;
      }
      return step;
    });
  },
};

/* ----------------------------------- fuel --------------------------------- */
export const fuelService = {
  list: () => settle([...store.fuel]),
  approve: (id: string) => {
    store.fuel = store.fuel.map((f) =>
      f.id === id ? { ...f, status: "Approved" as const, approvedLitres: f.expectedConsumption } : f,
    );
    return settle(true);
  },
  reject: (id: string) => {
    store.fuel = store.fuel.map((f) =>
      f.id === id ? { ...f, status: "Rejected" as const, approvedLitres: 0 } : f,
    );
    return settle(true);
  },
};

/* ------------------------------- engineering ------------------------------ */
export const engineeringService = {
  listWorkOrders: () => settle([...store.workOrders]),
  createDefect: (input: { truckReg: string; defect: string; category: string; priority: string; reportedBy: string }) => {
    const id = `ENG-${String(480 + store.workOrders.length).padStart(5, "0")}`;
    store.workOrders = [
      {
        id,
        truckReg: input.truckReg,
        defect: input.defect,
        category: input.category,
        priority: input.priority as never,
        mechanic: "Unassigned",
        status: "Reported",
        reportedBy: input.reportedBy,
        reportedAt: "12 Aug 2026 10:42",
        cost: 0,
      },
      ...store.workOrders,
    ];
    return settle(id);
  },
  advance: (id: string) => {
    const flow = ["Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed"] as const;
    store.workOrders = store.workOrders.map((w) =>
      w.id === id ? { ...w, status: flow[Math.min(flow.indexOf(w.status) + 1, flow.length - 1)]! } : w,
    );
    return settle(true);
  },
};

/* -------------------------------- inventory ------------------------------- */
export const inventoryService = {
  list: () => settle([...store.inventory]),
  requisitions: () => settle([...store.inventoryRequisitions]),
  release: (itemId: string, qty: number) => {
    store.inventory = store.inventory.map((i) => {
      if (i.id !== itemId) return i;
      const stock = Math.max(0, i.stock - qty);
      return {
        ...i,
        stock,
        status: (stock === 0 ? "Out of Stock" : stock <= i.reorderLevel ? "Low Stock" : "In Stock") as InventoryItem["status"],
      };
    });
    return settle(true);
  },
};

/* --------------------------------- accounts ------------------------------- */
export const accountService = {
  list: () => settle([...store.expenses]),
  get: (id: string) => settle(store.expenses.find((e) => e.id === id) ?? null),
  setStatus: (id: string, status: ExpenseStatus) => {
    store.expenses = store.expenses.map((e) => (e.id === id ? { ...e, status } : e));
    return settle(true);
  },
};

/* ----------------------------------- gate --------------------------------- */
export const gateService = {
  list: () => settle([...store.gate]),
  create: (entry: Omit<GateEntry, "id">) => {
    const id = `GTE-${String(330 + store.gate.length).padStart(5, "0")}`;
    store.gate = [{ ...entry, id }, ...store.gate];
    return settle(id);
  },
};

/* ------------------------------- collaboration ---------------------------- */
export const messageService = {
  list: () => settle([...store.conversations]),
  send: (conversationId: string, body: string) => {
    store.conversations = store.conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            unread: 0,
            lastAt: "now",
            messages: [
              ...c.messages,
              { id: `m${c.messages.length + 1}`, author: "You", role: "Operations Admin", body, time: "now", self: true },
            ],
          }
        : c,
    );
    return settle(true);
  },
  markRead: (conversationId: string) => {
    store.conversations = store.conversations.map((c) =>
      c.id === conversationId ? { ...c, unread: 0 } : c,
    );
    return settle(true);
  },
};

export const notificationService = {
  list: () => settle([...store.notifications]),
  markAllRead: () => {
    store.notifications = store.notifications.map((n) => ({ ...n, read: true }));
    return settle(true);
  },
  toggleRead: (id: string) => {
    store.notifications = store.notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    return settle(true);
  },
};

export const auditService = { list: () => settle([...store.audit]) };
export const adminService = {
  tenant: () => settle(db.TENANT),
  users: () => settle([...store.users]),
  roles: () => settle(db.ROLES),
};
export const dashboardService = {
  activity: () => settle(db.ACTIVITY),
  alerts: () => settle(db.ALERTS),
};

/* -------------------------- in-memory mutable store ----------------------- */
const store = {
  trucks: [...db.TRUCKS] as Truck[],
  drivers: [...db.DRIVERS] as Driver[],
  trips: [...db.TRIPS] as Trip[],
  fuel: [...db.FUEL_REQUISITIONS],
  workOrders: [...db.WORK_ORDERS],
  inventory: [...db.INVENTORY],
  inventoryRequisitions: [...db.INVENTORY_REQUISITIONS],
  expenses: [...db.EXPENSES] as Expense[],
  gate: [...db.GATE_ENTRIES],
  conversations: db.CONVERSATIONS.map((c) => ({ ...c, messages: [...c.messages] })),
  notifications: [...db.NOTIFICATIONS],
  audit: [...db.AUDIT_LOGS],
  users: [...db.USERS],
};

/* --------------------------------- search --------------------------------- */
export interface SearchHit {
  group: string;
  label: string;
  meta: string;
  to: string;
  params?: Record<string, string>;
}

export function globalSearch(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  store.trips.filter((t) => `${t.id} ${t.customer} ${t.pickup} ${t.dropoff}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Trips", label: t.id, meta: `${t.pickup} → ${t.dropoff} · ${t.status}`, to: "/app/trips/$tripId", params: { tripId: t.id } }));
  store.trucks.filter((t) => `${t.id} ${t.registration} ${t.type}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Trucks", label: `${t.id} · ${t.registration}`, meta: `${t.type} · ${t.status}`, to: "/app/fleet" }));
  store.drivers.filter((d) => `${d.id} ${d.name} ${d.employeeId}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((d) => hits.push({ group: "Drivers", label: `${d.id} · ${d.name}`, meta: `${d.status} · ${d.compliance}`, to: "/app/drivers/$driverId", params: { driverId: d.id } }));
  store.expenses.filter((e) => `${e.id} ${e.requester} ${e.type}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((e) => hits.push({ group: "Expenses", label: e.id, meta: `${e.type} · ₦${e.amount.toLocaleString()}`, to: "/app/accounts" }));
  store.workOrders.filter((w) => `${w.id} ${w.truckReg} ${w.defect}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((w) => hits.push({ group: "Work Orders", label: w.id, meta: `${w.truckReg} · ${w.status}`, to: "/app/engineering" }));
  store.inventory.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((i) => hits.push({ group: "Inventory", label: `${i.name}`, meta: `${i.sku} · ${i.stock} in stock`, to: "/app/inventory" }));
  store.audit.filter((a) => `${a.record} ${a.action} ${a.user}`.toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((a) => hits.push({ group: "Audit Logs", label: a.record, meta: `${a.action} · ${a.user}`, to: "/app/audit" }));
  return hits;
}

export const formatNaira = (n: number) =>
  `₦${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-NG")}`;
export const formatNairaFull = (n: number) => `₦${n.toLocaleString("en-NG")}`;
