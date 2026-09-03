/**
 * Mock service layer.
 * Every screen reads through these functions, never from mock-data directly.
 * Replacing the bodies with real API calls is the only change needed once the
 * FleetOpsX backend exists.
 */
import * as db from "./mock-data";
import type {
  Driver,
  Expense,
  ExpenseStatus,
  GateEntry,
  InventoryItem,
  ProcurementRequest,
  Trip,
  TimelineStep,
  TruckHead,
  TruckTail,
  Company,
} from "./types";

const LATENCY = 0;
const settle = <T,>(value: T): Promise<T> =>
  LATENCY ? new Promise((res) => setTimeout(() => res(value), LATENCY)) : Promise.resolve(value);

import { getTenantSlug } from "./hostname";

/** 
 * Simulates strict database tenant isolation. 
 * In production, the backend automatically scopes all queries to the active tenant.
 */
function isolate<T>(items: T[]): T[] {
  if (typeof window === "undefined") return items;
  const slug = getTenantSlug();
  // We simulate that all mock data in db belongs to 'petrolline'. 
  // Any other tenant will see an empty array (true isolation).
  if (slug === "petrolline") return items;
  if (slug === "localhost" || slug === "fleetopsx") return items; // dev fallback
  return [];
}

/* -------------------------------- tenants --------------------------------- */
export const tenantService = {
  list: () => settle([...store.platformTenants]),
  getBySlug: (slug: string) => settle(store.platformTenants.find(t => t.tenantSlug === slug || t.domain === slug) || null),
  create: (name: string, domain: string, logo?: string) => {
    const id = `tnt_${String(100 + store.platformTenants.length).padStart(3, "0")}`;
    const newTenant = {
      id,
      name,
      domain,
      logo,
      status: "Active" as const, // For demo, immediately active
      activeTrucks: 0,
      totalOrders: 0,
      joinedAt: new Date().toISOString().split("T")[0]!,
    };
    store.platformTenants = [...store.platformTenants, newTenant];
    return settle(newTenant);
  },
  updateTenant: (id: string, updates: Partial<PlatformTenant>) => {
    store.platformTenants = store.platformTenants.map((t) => (t.id === id ? { ...t, ...updates } : t));
    return settle(true);
  }
};

export const companyService = {
  list: () => settle([...store.companies]),
  create: (input: Omit<Company, "id" | "status">) => {
    const id = `COM-${String(100 + store.companies.length).padStart(3, "0")}`;
    const newCompany: Company = {
      ...input,
      id,
      status: "Active",
    };
    store.companies = [newCompany, ...store.companies];
    return settle(newCompany);
  },
};

/* ---------------------------------- fleet --------------------------------- */
export const fleetService = {
  listHeads: () => settle(isolate([...store.truckHeads])),
  listTails: () => settle(isolate([...store.truckTails])),
  getHead: (id: string) => settle(store.truckHeads.find((t) => t.id === id) ?? null),
  getTail: (id: string) => settle(store.truckTails.find((t) => t.id === id) ?? null),
  summary: () =>
    settle({
      total: isolate(store.truckHeads).length,
      available: isolate(store.truckHeads).filter((t) => t.status === "Available").length,
      assigned: isolate(store.truckHeads).filter((t) => t.status === "Assigned").length,
      inTransit: isolate(store.truckHeads).filter((t) => t.status === "In Transit").length,
      maintenance: isolate(store.truckHeads).filter((t) => t.status === "Maintenance").length,
      outOfService: isolate(store.truckHeads).filter((t) => t.status === "Out of Service").length,
    }),
};

/* --------------------------------- drivers -------------------------------- */
export const driverService = {
  list: () => settle(isolate([...store.drivers])),
  get: (id: string) => settle(store.drivers.find((d) => d.id === id) ?? null),
};

/* --------------------------------- auth ----------------------------------- */
export const authService = {
  login: (username: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("No internet connection");
    }
    // Check tenant status first
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug !== "localhost" && slug !== "fleetopsx") {
      const tenant = store.platformTenants.find(t => t.tenantSlug === slug || t.domain === slug);
      if (tenant && tenant.status === "Suspended") return settle(null);
    }

    const user = store.users.find(u => u.username === username || u.email === username);
    if (!user) return settle(null);
    if (user.status === "Suspended" || user.status === "Deleted") return settle(null);
    
    if (typeof window !== "undefined") {
      sessionStorage.setItem("fleetopsx_user_id", user.id);
      sessionStorage.setItem("fleetopsx_roles", JSON.stringify(user.roles));
    }
    return settle(user);
  },
  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    const id = sessionStorage.getItem("fleetopsx_user_id");
    return store.users.find(u => u.id === id) || null;
  },
  completeFirstTimeLogin: (userId: string) => {
    store.users = store.users.map(u => u.id === userId ? { ...u, passwordResetRequired: false } : u);
    return settle(true);
  },
  getRoles: (): string[] => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem("fleetopsx_roles");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  setRoles: (roles: string[]) => {
    sessionStorage.setItem("fleetopsx_roles", JSON.stringify(roles));
  },
  logout: () => {
    sessionStorage.removeItem("fleetopsx_user_id");
    sessionStorage.removeItem("fleetopsx_role");
  },
  getAllRoles: () => db.ROLES,
  getWorkspaces: () => db.WORKSPACES,
};

/* ---------------------------------- trips --------------------------------- */
export const tripService = {
  list: () => settle(isolate([...store.trips])),
  get: (id: string) => settle(store.trips.find((t) => t.id === id) ?? null),
  create: (input: Omit<Trip, "id" | "progress" | "eta">) => {
    const id = `TRP-${String(900 + store.trips.length).padStart(5, "0")}`;
    const trip: Trip = { ...input, id, progress: 4, eta: "—", status: "Scheduled" };
    store.trips = [trip, ...store.trips];
    
    // Assign assets
    if (input.headId) {
      store.truckHeads = store.truckHeads.map(t => t.id === input.headId ? { ...t, status: "Assigned" } : t);
    }
    if (input.tailId) {
      store.truckTails = store.truckTails.map(t => t.id === input.tailId ? { ...t, status: "Assigned" } : t);
    }
    if (input.driverId) {
      store.drivers = store.drivers.map(d => d.id === input.driverId ? { ...d, status: "On Trip" } : d);
    }
    
    return settle(trip);
  },
  updateStatus: (id: string) => {
    const flow = ["Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Completed"] as const;
    let nextStatus = "Completed";
    store.trips = store.trips.map(t => {
      if (t.id === id) {
        nextStatus = flow[Math.min(flow.indexOf(t.status as any) + 1, flow.length - 1)];
        return { ...t, status: nextStatus as any };
      }
      return t;
    });
    
    if (nextStatus === "Returning") {
      store.notifications = [
        {
          id: `NTF-${Date.now()}`,
          category: "Operations",
          title: "Trip Returning",
          body: `Trip ${id} has been marked as returning.`,
          time: "Just now",
          read: false,
          severity: "info",
        },
        ...store.notifications,
      ];
    }
    return settle(nextStatus);
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

/* --------------------------------- orders --------------------------------- */
export const orderService = {
  submitCustomerOrder: (payload: { customerConsignee: string; pickup: string; dropoff: string; cargo: string; tailType: string; loadingRoutingType: "Single"|"Multiple"; loadingSite: string[] }) => {
    const id = `TRP-${String(850 + store.trips.length).padStart(5, "0")}`;
    const newOrder: Trip = {
      id,
      customer: "Customer Portal",
      customerConsignee: payload.customerConsignee,
      cargo: payload.cargo,
      pickup: payload.pickup,
      loadingSite: payload.loadingSite,
      loadingRoutingType: payload.loadingRoutingType,
      tailType: payload.tailType,
      dropoff: payload.dropoff,
      status: "Requested",
      priority: "Normal",
      distanceKm: 0,
      durationLabel: "-",
      scheduledDate: new Date().toLocaleDateString(),
      startTime: "-",
      eta: "-",
      progress: 0,
      lat: 6.524,
      lng: 3.379,
      revenue: 0,
    };
    store.trips = [newOrder, ...store.trips];
    return settle(newOrder);
  }
};

/* ----------------------------------- fuel --------------------------------- */
export const fuelService = {
  list: () => settle([...store.fuel]),
  approve: (id: string) => {
    store.fuel = store.fuel.map((f) => {
      if (f.id === id) {
        // Generate an expense in accounts
        store.expenses = [
          {
            id: `EXP-${String(300 + store.expenses.length).padStart(5, "0")}`,
            type: "Direct Cost",
            amount: f.cost,
            standardRate: f.cost * 0.9,
            requester: f.driverName,
            tripId: f.tripId,
            status: "Approved",
            approvalLevel: "Fleet Manager",
            date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
            documents: ["fuel_receipt.pdf"],
          },
          ...store.expenses,
        ];
        return { ...f, status: "Approved" as const, approvedLitres: f.expectedConsumption };
      }
      return f;
    });
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
  logRepair: (truckReg: string, defect: string, category: string, amount: number) => {
    // 1. Create a Work Order
    const id = `ENG-${String(480 + store.workOrders.length).padStart(5, "0")}`;
    store.workOrders = [
      {
        id, truckReg, defect, category, priority: "High", mechanic: "Unassigned", status: "Reported",
        reportedBy: "System", reportedAt: new Date().toLocaleDateString(), cost: amount,
      },
      ...store.workOrders,
    ];
    
    // 2. Mark the truck as Out of Service
    const head = store.truckHeads.find(t => t.registration === truckReg);
    if (head) {
      store.truckHeads = store.truckHeads.map(t => t.id === head.id ? { ...t, status: "Out of Service" } : t);
    }
    const tail = store.truckTails.find(t => t.registration === truckReg);
    if (tail) {
      store.truckTails = store.truckTails.map(t => t.id === tail.id ? { ...t, status: "Out of Service" } : t);
    }

    // 3. Create Expense in Accounts
    store.expenses = [
      {
        id: `EXP-${String(300 + store.expenses.length).padStart(5, "0")}`,
        type: "Indirect Cost", amount, standardRate: amount, requester: "Engineering", tripId: "—",
        status: "Pending", approvalLevel: "Operations Manager", date: new Date().toLocaleDateString(),
        documents: [],
      },
      ...store.expenses,
    ];

    // 4. Check Inventory and generate Procurement Request if out of stock
    const part = store.inventory.find(i => i.name.toLowerCase().includes(category.toLowerCase()));
    if (part && part.stock === 0) {
      store.procurement = [
        {
          id: `PRC-${String(100 + store.procurement.length).padStart(3, "0")}`,
          part: part.name, quantity: 1, truckReg, priority: "High", status: "Requested",
          requestedBy: "Engineering", date: new Date().toLocaleDateString(),
        },
        ...store.procurement,
      ];
    }
    
    return settle(id);
  }
};

/* -------------------------------- inventory ------------------------------- */
export const inventoryService = {
  list: () => settle([...store.inventory]),
  requisitions: () => settle([...store.inventoryRequisitions]),
  release: (itemId: string, qty: number, reqId?: string) => {
    if (!reqId) return Promise.reject(new Error("Release requires a valid requisition ID."));
    const req = store.inventoryRequisitions.find((r) => r.id === reqId);
    if (!req) return Promise.reject(new Error("Requisition not found."));
    if (req.status !== "Pending") return Promise.reject(new Error("Requisition is already processed."));
    
    // Check if WO is active (not completed)
    const wo = store.workOrders.find(w => w.id === req.workOrder);
    if (!wo || wo.status === "Completed") return Promise.reject(new Error("Requisition is not linked to an active repair order."));

    store.inventory = store.inventory.map((i) => {
      if (i.id !== itemId) return i;
      const stock = Math.max(0, i.stock - qty);
      return {
        ...i,
        stock,
        status: (stock === 0 ? "Out of Stock" : stock <= i.reorderLevel ? "Low Stock" : "In Stock") as InventoryItem["status"],
      };
    });

    store.inventoryRequisitions = store.inventoryRequisitions.map((r) => 
      r.id === reqId ? { ...r, status: "Released" } : r
    );

    return settle(true);
  },
  updateReorderLevel: (itemId: string, level: number) => {
    store.inventory = store.inventory.map((i) => {
      if (i.id !== itemId) return i;
      return {
        ...i,
        reorderLevel: level,
        status: (i.stock === 0 ? "Out of Stock" : i.stock <= level ? "Low Stock" : "In Stock") as InventoryItem["status"],
      };
    });
    return settle(true);
  },
};

/* ------------------------------- procurement ------------------------------ */
export const procurementService = {
  list: () => settle([...store.procurement]),
  markProcured: (id: string) => {
    const pr = store.procurement.find(p => p.id === id);
    if (!pr) return settle(false);

    store.procurement = store.procurement.map((p) => (p.id === id ? { ...p, status: "Procured" } : p));
    
    // Automatically advance engineering work order if waiting on parts
    const wo = store.workOrders.find(w => w.truckReg === pr.truckReg && w.status === "Awaiting Parts");
    if (wo) {
      store.workOrders = store.workOrders.map(w => w.id === wo.id ? { ...w, status: "Repairing" } : w);
    }
    
    // Auto-notify engineering and fleet mgr
    store.notifications = [
      {
        id: `NTF-${Date.now()}`,
        category: "Engineering",
        title: "Part Procured",
        body: `Procurement request ${id} (${pr.part}) marked as Procured.`,
        time: "Just now",
        read: false,
        severity: "success",
      },
      ...store.notifications,
    ];
    return settle(true);
  },
};

/* ------------------------------- compliance ------------------------------- */
export const complianceService = {
  getVehicleDocs: () => settle(
    store.truckHeads.map(t => {
      // Dummy logic to generate expirations
      const daysToReg = (t.id.charCodeAt(4) * 3) % 180;
      const daysToIns = (t.id.charCodeAt(5) * 7) % 365;
      const daysToRoad = (t.id.charCodeAt(6) * 5) % 90;
      return {
        id: t.id,
        reg: t.registration,
        documents: {
          registration: daysToReg,
          insurance: daysToIns,
          roadworthiness: daysToRoad,
        }
      };
    })
  ),
  getDriverDocs: () => settle(
    store.drivers.map(d => {
      // Mock logic to compute days to expiry based on string "14 Feb 2026"
      // we'll just parse the year to get a dummy diff or use static random
      const diff = (d.id.charCodeAt(4) * 11) % 180;
      return {
        id: d.id,
        name: d.name,
        licenseCategory: d.licenseCategory,
        daysToExpiry: d.compliance === "Expired" ? -5 : d.compliance === "Expiring Soon" ? 14 : Math.max(30, diff),
      };
    })
  )
};

/* ------------------------------ depreciation ------------------------------ */
export const depreciationService = {
  getAssetDepreciation: () => settle(
    [...store.truckHeads, ...store.truckTails].map((t) => {
      // Mock data logic
      const isHead = t.id.startsWith("TRH-");
      const purchaseYear = isHead ? (t as TruckHead).year : 2018 + (t.id.charCodeAt(5) % 6);
      const purchasePrice = isHead ? 45000000 + (t.id.charCodeAt(5) * 100000) : 12000000 + (t.id.charCodeAt(5) * 50000);
      const lifespan = isHead ? 10 : 15;
      
      const currentYear = new Date().getFullYear();
      const age = currentYear - purchaseYear;
      const depreciatedValue = Math.max(0, purchasePrice - (purchasePrice / lifespan) * age);
      const remainingYears = lifespan - age;

      return {
        id: t.id,
        reg: t.registration,
        type: isHead ? "Head" : "Tail",
        purchaseYear,
        purchasePrice,
        lifespan,
        currentValue: depreciatedValue,
        remainingYears,
      };
    })
  )
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
    
    if (entry.purpose === "Trip return") {
      // Find the truck in trips to get the trip ID and driver
      const truckReg = entry.asset;
      const head = store.truckHeads.find(t => t.registration === truckReg);
      if (head) {
        store.truckHeads = store.truckHeads.map(t => t.id === head.id ? { ...t, status: "Available" } : t);
      }
      
      const tail = store.truckTails.find(t => t.registration === truckReg);
      if (tail) {
        store.truckTails = store.truckTails.map(t => t.id === tail.id ? { ...t, status: "Available" } : t);
      }
      
      // We don't have driver name mapped directly to driver ID in gate entry, but we can try
      const driver = store.drivers.find(d => d.name === entry.driver);
      if (driver) {
        store.drivers = store.drivers.map(d => d.id === driver.id ? { ...d, status: "Available" } : d);
      }
      
      // Update the trip to Completed
      const trip = store.trips.find(t => t.truckReg.includes(truckReg) && t.status !== "Completed");
      if (trip) {
        store.trips = store.trips.map(t => t.id === trip.id ? { ...t, status: "Completed" } : t);
      }
    }
    
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
  list: () => {
    let notifications = [...store.notifications];
    const roles = authService.getRoles();
    if (roles.includes("Fleet Operations") && !roles.includes("Transport Manager") && !roles.includes("Superadmin")) {
      notifications = notifications.filter(n => n.category !== "Compliance" && n.category !== "Engineering" && n.category !== "Approvals");
    }
    return settle(notifications);
  },
  getUnreadCount: () => {
    let notifications = [...store.notifications];
    const roles = authService.getRoles();
    if (roles.includes("Fleet Operations") && !roles.includes("Transport Manager") && !roles.includes("Superadmin")) {
      notifications = notifications.filter(n => n.category !== "Compliance" && n.category !== "Engineering" && n.category !== "Approvals");
    }
    return notifications.filter(n => !n.read).length;
  },
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
  loginReports: () => settle([...store.loginReports]),
  createUser: (payload: { firstName: string; surname: string; roles: string[]; username: string; department: string; companyId?: string }) => {
    const id = `USR-${String(100 + store.users.length).padStart(4, "0")}`;
    const name = `${payload.firstName} ${payload.surname}`;
    const newUser: import("./types").User = {
      id,
      name,
      email: `${payload.username}@petroline.ng`,
      username: payload.username,
      roles: payload.roles as any,
      roleNames: payload.roles,
      department: payload.department,
      status: "Active",
      passwordResetRequired: true,
      lastActive: "Just now",
      initials: `${payload.firstName[0] || ""}${payload.surname[0] || ""}`,
      companyId: payload.companyId,
    };
    store.users = [newUser, ...store.users];
    return settle(newUser);
  },
  editUser: (id: string, payload: Partial<import("./types").User>) => {
    store.users = store.users.map(u => u.id === id ? { ...u, ...payload, roleNames: payload.roles || u.roleNames } : u);
    return settle(true);
  },
  resetPassword: (id: string) => {
    store.users = store.users.map(u => u.id === id ? { ...u, passwordResetRequired: true } : u);
    return settle(true);
  },
  suspendUser: (id: string) => {
    store.users = store.users.map(u => u.id === id ? { ...u, status: "Suspended" } : u);
    return settle(true);
  },
  deleteUser: (id: string) => {
    store.users = store.users.map(u => u.id === id ? { ...u, status: "Deleted" } : u);
    return settle(true);
  },
};
export const dashboardService = {
  activity: () => settle(db.ACTIVITY),
  alerts: () => settle(db.ALERTS),
  charts: () => settle({
    costRevenue: db.CHART_COST_REVENUE,
    utilisation: db.CHART_UTILISATION,
    tripPerformance: db.CHART_TRIP_PERFORMANCE,
    fuel: db.CHART_FUEL,
    expenseSplit: db.CHART_EXPENSE_SPLIT,
  }),
  getOverview: async () => {
    return {
      trips: isolate([...store.trips]),
      trucks: isolate([...store.truckHeads]),
      drivers: isolate([...store.drivers]),
      expenses: isolate([...store.expenses]),
      gateEntries: isolate([...store.gate]),
      alerts: isolate([...store.notifications]),
      workOrders: isolate([...store.workOrders]),
      inventory: isolate([...store.inventory]),
      procurement: isolate([...store.procurement]),
      charts: {
        costRevenue: db.CHART_COST_REVENUE,
        utilisation: db.CHART_UTILISATION,
        tripPerformance: db.CHART_TRIP_PERFORMANCE,
        fuel: db.CHART_FUEL,
        expenseSplit: db.CHART_EXPENSE_SPLIT,
      },
    };
  },
};

/* -------------------------- in-memory mutable store ----------------------- */
const store = {
  platformTenants: [...db.PLATFORM_TENANTS],
  companies: [...db.COMPANIES],
  truckHeads: [...db.TRUCK_HEADS] as TruckHead[],
  truckTails: [...db.TRUCK_TAILS] as TruckTail[],
  drivers: [...db.DRIVERS] as Driver[],
  trips: [...db.TRIPS] as Trip[],
  fuel: [...db.FUEL_REQUISITIONS],
  workOrders: [...db.WORK_ORDERS],
  inventory: [...db.INVENTORY],
  inventoryRequisitions: [...db.INVENTORY_REQUISITIONS],
  procurement: [...db.PROCUREMENT_REQUESTS],
  expenses: [...db.EXPENSES] as Expense[],
  gate: [...db.GATE_ENTRIES],
  conversations: db.CONVERSATIONS.map((c) => ({ ...c, messages: [...c.messages] })),
  notifications: [...db.NOTIFICATIONS],
  audit: [...db.AUDIT_LOGS],
  users: [...db.USERS],
  companies: [...db.COMPANIES],
  loginReports: [...db.LOGIN_REPORTS],
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
  
  store.truckHeads.filter((t) => `${t.id} ${t.number} ${t.registration}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Truck Heads", label: `${t.id} · ${t.registration}`, meta: `${t.make} · ${t.status}`, to: "/app/fleet" }));
  
  store.truckTails.filter((t) => `${t.id} ${t.number} ${t.registration}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Truck Tails", label: `${t.id} · ${t.registration}`, meta: `${t.type} · ${t.status}`, to: "/app/fleet" }));

  store.drivers.filter((d) => `${d.id} ${d.name} ${d.employeeId} ${d.licenseNumber} ${d.assignedTruck || ""}`.toLowerCase().includes(q))
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
