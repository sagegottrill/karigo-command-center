/**
 * FleetOpsX service layer — live API first.
 * Local mock/localStorage is only used when VITE_USE_MOCK=true (local/dev).
 */
import * as db from "./mock-data";
import type {
  Driver,
  Expense,
  ExpenseStatus,
  GateEntry,
  InventoryItem,
  Notification,
  ProcurementRequest,
  Trip,
  TimelineStep,
  TruckHead,
  TruckTail,
  Company,
  PlatformTenant,
  User,
  WorkOrder,
} from "./types";
import { allowMockFallback, getStoredUser, getToken } from "./apiClient";
import { rosterBodiesAsTails } from "./display-ids";
import { mergeRoleNotifications, synthesizeRoleNotifications } from "./notification-scope";
import { hardLogout } from "./session";
import {
  applyLoginSession,
  liveCreateDriver,
  liveCreateExpense,
  liveCreateFuel,
  liveCreateGate,
  liveCreateInventory,
  liveCreateInventoryRequisition,
  liveCreateProcurement,
  liveCreateTenant,
  liveCreateTrip,
  liveCreateTruck,
  liveCreateUser,
  liveCreateWorkOrder,
  liveDeleteDriver,
  liveDeleteTenant,
  liveDeleteTrip,
  liveDeleteTruck,
  liveDeleteUser,
  liveGetTenantBySlug,
  liveGetTrip,
  liveListAudit,
  liveListConversations,
  liveListDrivers,
  liveListExpenses,
  liveListFuel,
  liveListGate,
  liveListInventory,
  liveListInventoryRequisitions,
  liveListLoginReports,
  liveListNotifications,
  liveListProcurement,
  liveListTenants,
  liveListTrips,
  liveListTrucks,
  liveListUsers,
  liveListWorkOrders,
  liveLogin,
  liveMarkAllNotificationsRead,
  liveMarkConversationRead,
  liveReleaseInventory,
  liveSendMessage,
  liveToggleNotification,
  liveUpdateDriver,
  liveUpdateExpense,
  liveUpdateFuel,
  liveUpdateInventory,
  liveUpdateProcurement,
  liveUpdateTenant,
  liveUpdateTrip,
  liveUpdateTruck,
  liveUpdateUser,
  liveUpdateWorkOrder,
} from "./live-api";

const LATENCY = 0;
const settle = <T,>(value: T): Promise<T> =>
  LATENCY ? new Promise((res) => setTimeout(() => res(value), LATENCY)) : Promise.resolve(value);

import { getTenantSlug } from "./hostname";

const useMock = () => allowMockFallback();

/** 
 * Simulates strict database tenant isolation. 
 * In production, the backend automatically scopes all queries to the active tenant.
 */
function isolate<T>(items: T[]): T[] {
  if (typeof window === "undefined") return items;
  
  // 1. If user is logged in, their profile is the ultimate source of truth
  const userId = localStorage.getItem("fleetopsx_user_id");
  if (userId) {
    const user = store.users.find(u => u.id === userId);
    if (user && user.companyId) {
      // Return mock data only if they belong to Petroline (tnt_001)
      // New tenants have empty databases initially.
      return user.companyId === "tnt_001" ? items : [];
    }
    // If no companyId, they are a Platform Admin (Super Admin).
    // Platform Admins shouldn't see tenant data unless explicitly scoped.
    return [];
  }

  // 2. Fallback to Hostname Routing (e.g., on Login pages)
  const slug = getTenantSlug();
  if (slug === "petrolline") return items;
  if (slug === "localhost" || slug === "fleetopsx") return items; // local dev without tenant context
  return [];
}

function isolateUser<T extends { companyId?: string }>(users: T[]): T[] {
  if (typeof window === "undefined") return users;
  
  // 1. If user is logged in, only show users from THEIR tenant
  const userId = localStorage.getItem("fleetopsx_user_id");
  if (userId) {
    const currentUser = store.users.find(u => u.id === userId);
    if (currentUser) {
      if (!currentUser.companyId) return users; // Super Admin sees all users
      return users.filter(u => u.companyId === currentUser.companyId);
    }
  }

  // 2. Fallback to Hostname Routing
  const slug = getTenantSlug();
  if (slug === "petrolline") return users;
  if (slug === "localhost" || slug === "fleetopsx") return users; 
  
  const tenant = store.platformTenants.find(t => t.tenantSlug === slug || t.domain === slug);
  if (!tenant) return [];
  
  return users.filter(u => u.companyId === tenant.id || u.companyId === tenant.name);
}

/* -------------------------------- tenants --------------------------------- */
export const tenantService = {
  list: async () => {
    if (!useMock()) return liveListTenants();
    return settle([...store.platformTenants]);
  },
  getBySlug: async (slug: string) => {
    if (!useMock()) return liveGetTenantBySlug(slug);
    return settle(store.platformTenants.find(t => t.tenantSlug === slug || t.domain === slug) || null);
  },
  create: async (name: string, domain: string, logo?: string) => {
    if (!useMock()) return liveCreateTenant(name, domain, logo);
    const id = `tnt_${String(100 + store.platformTenants.length).padStart(3, "0")}`;
    const newTenant = {
      id,
      name,
      domain,
      logo,
      status: "Active" as const,
      activeTrucks: 0,
      totalOrders: 0,
      joinedAt: new Date().toISOString().split("T")[0]!,
    };
    store.platformTenants = [...store.platformTenants, newTenant];
    return settle(newTenant);
  },
  updateTenant: async (id: string, updates: Partial<PlatformTenant>) => {
    if (!useMock()) {
      await liveUpdateTenant(id, updates);
      return true;
    }
    store.platformTenants = store.platformTenants.map((t) => (t.id === id ? { ...t, ...updates } : t));
    return settle(true);
  },
  deleteTenant: async (id: string) => {
    if (!useMock()) {
      await liveDeleteTenant(id);
      return true;
    }
    store.platformTenants = store.platformTenants.filter(t => t.id !== id);
    store.users = store.users.filter(u => u.companyId !== id);
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
  listHeads: async () => {
    if (!useMock()) return liveListTrucks();
    return settle(isolate([...store.truckHeads]));
  },
  listTails: async () => {
    if (!useMock()) return rosterBodiesAsTails();
    return settle(isolate([...store.truckTails]));
  },
  createHead: async (input: { registration: string; make: string; year: number; location: string }) => {
    if (!useMock()) {
      return liveCreateTruck({
        registration: input.registration,
        category: input.make,
        make: input.make,
        year: input.year,
        destination: input.location,
        location: input.location,
        status: "Active",
      });
    }
    const id = `TRH-${String(101 + store.truckHeads.length).padStart(3, "0")}`;
    const number = `H${String(101 + store.truckHeads.length).padStart(3, "0")}`;
    const city = input.location || "Lagos";
    const coords: Record<string, [number, number]> = {
      Lagos: [6.5244, 3.3792], Abuja: [9.0765, 7.3986], "Port Harcourt": [4.8156, 7.0498],
      Kano: [12.0022, 8.592], Ibadan: [7.3775, 3.947],
    };
    const [lat, lng] = coords[city] || [6.5244, 3.3792];
    const head: TruckHead = {
      id, number, capNumber: `CAP-${String(101 + store.truckHeads.length).padStart(3, "0")}`,
      registration: input.registration, make: input.make, year: input.year,
      status: "Available", location: city, odometer: 0,
      standardEfficiency: 3.2, lat, lng,
    };
    store.truckHeads = [head, ...store.truckHeads];
    return settle(head);
  },
  createTail: (input: { registration: string; type: string; location: string }) => {
    const id = `TRT-${String(101 + store.truckTails.length).padStart(3, "0")}`;
    const number = `T${String(101 + store.truckTails.length).padStart(3, "0")}`;
    const city = input.location || "Lagos";
    const coords: Record<string, [number, number]> = {
      Lagos: [6.5244, 3.3792], Abuja: [9.0765, 7.3986], "Port Harcourt": [4.8156, 7.0498],
      Kano: [12.0022, 8.592], Ibadan: [7.3775, 3.947],
    };
    const [lat, lng] = coords[city] || [6.5244, 3.3792];
    const tail: TruckTail = {
      id, number, registration: input.registration, type: input.type,
      status: "Available", location: city, lat, lng,
    };
    store.truckTails = [tail, ...store.truckTails];
    return settle(tail);
  },
  updateHeadStatus: async (id: string, status: import("./types").TruckStatus) => {
    if (!useMock()) {
      await liveUpdateTruck(id, { status });
      return true;
    }
    store.truckHeads = store.truckHeads.map(t => t.id === id ? { ...t, status } : t);
    return settle(true);
  },
  updateTailStatus: (id: string, status: import("./types").TruckStatus) => {
    store.truckTails = store.truckTails.map(t => t.id === id ? { ...t, status } : t);
    return settle(true);
  },
  updateHead: async (id: string, updates: Partial<TruckHead>) => {
    if (!useMock()) {
      await liveUpdateTruck(id, updates as Record<string, unknown>);
      return true;
    }
    store.truckHeads = store.truckHeads.map(t => t.id === id ? { ...t, ...updates } : t);
    return settle(true);
  },
  deleteHead: async (id: string) => {
    if (!useMock()) {
      await liveDeleteTruck(id);
      return true;
    }
    store.truckHeads = store.truckHeads.filter(t => t.id !== id);
    return settle(true);
  },
  updateTail: (id: string, updates: Partial<TruckTail>) => {
    store.truckTails = store.truckTails.map(t => t.id === id ? { ...t, ...updates } : t);
    return settle(true);
  },
  deleteTail: (id: string) => {
    store.truckTails = store.truckTails.filter(t => t.id !== id);
    return settle(true);
  },
  getHead: async (id: string) => {
    if (!useMock()) {
      const heads = await liveListTrucks();
      return heads.find((t) => t.id === id) ?? null;
    }
    return settle(store.truckHeads.find((t) => t.id === id) ?? null);
  },
  getTail: (id: string) => settle(store.truckTails.find((t) => t.id === id) ?? null),
  summary: async () => {
    const heads = !useMock() ? await liveListTrucks() : isolate(store.truckHeads);
    return {
      total: heads.length,
      available: heads.filter((t) => t.status === "Available").length,
      assigned: heads.filter((t) => t.status === "Assigned").length,
      inTransit: heads.filter((t) => t.status === "In Transit").length,
      maintenance: heads.filter((t) => t.status === "Maintenance").length,
      outOfService: heads.filter((t) => t.status === "Out of Service").length,
    };
  },
};

/* --------------------------------- drivers -------------------------------- */
export const driverService = {
  list: async () => {
    if (!useMock()) return liveListDrivers();
    return settle(isolate([...store.drivers]));
  },
  get: async (id: string) => {
    if (!useMock()) {
      const drivers = await liveListDrivers();
      return drivers.find((d) => d.id === id) ?? null;
    }
    return settle(store.drivers.find((d) => d.id === id) ?? null);
  },
  create: async (input: { name: string; phone: string; licenseNumber: string; licenseCategory: string; licenseExpiry: string }) => {
    if (!useMock()) {
      return liveCreateDriver(input);
    }
    const id = `DRV-${String(1 + store.drivers.length).padStart(3, "0")}`;
    const driver: Driver = {
      id,
      name: input.name,
      employeeId: `PTL-EMP-${String(1200 + store.drivers.length).padStart(4, "0")}`,
      salaryNumber: `SAL-${String(1000 + store.drivers.length).padStart(4, "0")}`,
      phone: input.phone,
      department: "Transport Operations",
      dateJoined: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      licenseNumber: input.licenseNumber,
      licenseCategory: input.licenseCategory,
      licenseExpiry: input.licenseExpiry,
      compliance: "Valid",
      experienceYears: 0,
      status: "Available",
      assignedTruck: null,
      currentTripId: null,
      tripsCompleted: 0,
      safetyScore: 100,
      initials: input.name.split(" ").map((p) => p[0]).join("").slice(0, 2),
    };
    store.drivers = [driver, ...store.drivers];
    return settle(driver);
  },
  update: async (id: string, updates: Partial<Driver>) => {
    if (!useMock()) {
      await liveUpdateDriver(id, updates as Record<string, unknown>);
      return true;
    }
    store.drivers = store.drivers.map(d => d.id === id ? { ...d, ...updates } : d);
    return settle(true);
  },
  delete: async (id: string) => {
    if (!useMock()) {
      await liveDeleteDriver(id);
      return true;
    }
    store.drivers = store.drivers.filter(d => d.id !== id);
    return settle(true);
  },
};

/* --------------------------------- auth ----------------------------------- */
export const authService = {
  login: async (username: string, password?: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("No internet connection");
    }

    if (!useMock()) {
      try {
        const result = await liveLogin(username, password ?? "");
        applyLoginSession(result.token, result.user);
        return result.user;
      } catch (err) {
        console.error("Live auth failed", err);
        throw err;
      }
    }

    // Local/dev mock directory only when VITE_USE_MOCK=true
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug !== "localhost" && slug !== "fleetopsx") {
      const tenant = store.platformTenants.find(t => t.tenantSlug === slug || t.domain === slug);
      if (tenant && tenant.status === "Suspended") return settle(null);
    }

    const user = store.users.find(u => u.username === username || u.email === username);
    if (!user) return settle(null);
    if (user.status === "Suspended" || user.status === "Deleted") return settle(null);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("fleetopsx_user_id", user.id);
      localStorage.setItem("fleetopsx_roles", JSON.stringify(user.roles));
      localStorage.setItem("fleetopsx_user", JSON.stringify(user));
    }
    return settle(user);
  },
  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    if (!useMock() && !localStorage.getItem("fleetopsx_token")) return null;
    const cached = getStoredUser<User>();
    if (cached?.id) return cached;
    const id = localStorage.getItem("fleetopsx_user_id");
    return store.users.find(u => u.id === id) || null;
  },
  isAuthenticated: () => {
    if (typeof window === "undefined") return false;
    if (!useMock()) return !!localStorage.getItem("fleetopsx_token");
    return !!(localStorage.getItem("fleetopsx_token") || localStorage.getItem("fleetopsx_user_id"));
  },
  completeFirstTimeLogin: (userId: string) => {
    store.users = store.users.map(u => u.id === userId ? { ...u, passwordResetRequired: false } : u);
    return settle(true);
  },
  getRoles: (): string[] => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("fleetopsx_roles");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  setRoles: (roles: string[]) => {
    localStorage.setItem("fleetopsx_roles", JSON.stringify(roles));
  },
  logout: () => {
    hardLogout();
  },
  getAllRoles: () => db.ROLES,
  getWorkspaces: () => db.WORKSPACES,
};

/* ---------------------------------- trips --------------------------------- */
export const tripService = {
  list: async () => {
    if (!useMock()) return liveListTrips();
    return settle(isolate([...store.trips]));
  },
  get: async (id: string) => {
    if (!useMock()) return liveGetTrip(id);
    return settle(store.trips.find((t) => t.id === id) ?? null);
  },
  create: async (input: Omit<Trip, "id" | "progress" | "eta">) => {
    if (!useMock()) {
      return liveCreateTrip({ ...input, progress: 4, eta: "—" });
    }
    const id = `TRP-${String(900 + store.trips.length).padStart(5, "0")}`;
    const trip: Trip = { ...input, id, progress: 4, eta: "—", status: input.status || "Scheduled" };
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
  update: async (id: string, payload: Partial<Trip>) => {
    if (!useMock()) {
      return liveUpdateTrip(id, payload);
    }
    store.trips = store.trips.map(t => (t.id === id ? { ...t, ...payload } : t));
    
    // Check if assets need to be updated due to status change during update
    if (payload.status === "Awaiting Approval") {
      const t = store.trips.find(x => x.id === id);
      if (t) {
        if (t.headId) store.truckHeads = store.truckHeads.map(h => h.id === t.headId ? { ...h, status: "Assigned" } : h);
        if (t.tailId) store.truckTails = store.truckTails.map(tail => tail.id === t.tailId ? { ...tail, status: "Assigned" } : tail);
        if (t.driverId) store.drivers = store.drivers.map(d => d.id === t.driverId ? { ...d, status: "On Trip" } : d);
      }
    }
    const updated = store.trips.find((t) => t.id === id);
    return settle(updated!);
  },
  /** Alias used by customer portal modify flow */
  updateTrip: async (id: string, payload: Partial<Trip>) => tripService.update(id, payload),
  delete: async (id: string) => {
    if (!useMock()) {
      await liveDeleteTrip(id);
      return true;
    }
    store.trips = store.trips.filter((t) => t.id !== id);
    return settle(true);
  },
  initialApprove: async (id: string) => {
    if (!useMock()) {
      await liveUpdateTrip(id, { status: "Awaiting Approval" });
      return true;
    }
    store.trips = store.trips.map(t => {
      if (t.id === id && t.status === "Requested") {
        return { ...t, status: "Approved for Dispatch" as never };
      }
      return t;
    });
    return settle(true);
  },
  approveDispatch: async (id: string) => {
    if (!useMock()) {
      const trip = await liveGetTrip(id);
      if (!trip) return false;
      await liveUpdateTrip(id, { status: "Scheduled" });
      const costs = trip.directCosts;
      const totalCosts = costs
        ? costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance
        : 0;
      if (totalCosts > 0) {
        await liveCreateExpense({
          requester: trip.driverName || "Dispatch Coordinator",
          department: "Transport Manager",
          type: "Allowance",
          category: "Direct Cost",
          amount: totalCosts,
          description: `Dispatch costs for ${trip.id}`,
          status: "Pending",
          tripId: trip.id,
        });
      }
      return true;
    }
    store.trips = store.trips.map(t => {
      if (t.id === id && t.status === "Awaiting Approval") {
        // Calculate gross margin based on direct costs
        const costs = t.directCosts;
        const totalCosts = costs ? (costs.tripAllowance + costs.returnWaybill + costs.motorBoy + costs.ticket + costs.extraAllowance) : 0;
        const grossMargin = t.revenue - totalCosts;
        
        // Wire up ecosystem: Push the dispatch expense into the Accounts module
        if (totalCosts > 0) {
          store.expenses = [
            {
              id: `EXP-${String(300 + store.expenses.length).padStart(5, "0")}`,
              type: "Direct Cost" as never,
              amount: totalCosts,
              standardRate: totalCosts * 0.9,
              requester: t.driverName || "Dispatch Coordinator",
              tripId: t.id,
              status: "Pending", // Sent to Accounts queue
              approvalLevel: "Transport Manager",
              date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
              documents: [],
            },
            ...store.expenses,
          ];
        }
        
        return { ...t, status: "Scheduled", totalCosts, grossMargin };
      }
      return t;
    });
    return settle(true);
  },
  updateStatus: async (id: string) => {
    if (!useMock()) {
      const trip = await liveGetTrip(id);
      if (!trip) return "Completed";
      const flow = ["Requested", "Awaiting Approval", "Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Completed"] as const;
      const nextStatus = flow[Math.min(Math.max(flow.indexOf(trip.status as typeof flow[number]), 0) + 1, flow.length - 1)]!;
      await liveUpdateTrip(id, { status: nextStatus });
      return nextStatus;
    }
    const flow = ["Requested", "Awaiting Approval", "Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Completed"] as const;
    let nextStatus = "Completed";
    store.trips = store.trips.map(t => {
      if (t.id === id) {
        nextStatus = flow[Math.min(flow.indexOf(t.status as any) + 1, flow.length - 1)];
        
        // Release assets if completed
        if (nextStatus === "Completed") {
          if (t.headId) {
            store.truckHeads = store.truckHeads.map(h => h.id === t.headId ? { ...h, status: "Available" } : h);
          }
          if (t.tailId) {
            store.truckTails = store.truckTails.map(tail => tail.id === t.tailId ? { ...tail, status: "Available" } : tail);
          }
          if (t.driverId) {
            store.drivers = store.drivers.map(d => d.id === t.driverId ? { ...d, status: "Available" } : d);
          }
        }
        
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
  setStatus: async (id: string, newStatus: string) => {
    if (!useMock()) {
      await liveUpdateTrip(id, { status: newStatus as Trip["status"] });
      return newStatus;
    }
    store.trips = store.trips.map(t => {
      if (t.id === id) {
        return { ...t, status: newStatus as any };
      }
      return t;
    });
    return settle(newStatus);
  },
  timeline: (trip: Trip): TimelineStep[] => {
    const order = [
      "Request Approved",
      "Dispatch Created",
      "Driver Assigned",
      "Pickup Completed",
      "In Transit",
      "At Destination",
      "Offloaded",
    ];
    const idx: Record<string, number> = {
      Requested: -1,
      "Awaiting Approval": 0,
      Scheduled: 1,
      Loaded: 3,
      "En Route": 4,
      Delayed: 4,
      Stopped: 4,
      Offloading: 5,
      Returning: 6,
      Completed: 6,
    };
    const current = idx[trip.status] ?? -1;
    const when = trip.scheduledDate ? new Date(trip.scheduledDate) : null;
    const dateLabel =
      when && !Number.isNaN(when.getTime())
        ? when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : undefined;
    const timeLabel = trip.startTime && trip.startTime !== "—" ? trip.startTime : undefined;
    return order.map((label, i) => {
      const step: TimelineStep = {
        label,
        state: current < 0 ? "pending" : i < current ? "done" : i === current ? "current" : "pending",
      };
      if (current >= 0 && i <= current && dateLabel) {
        step.at = timeLabel ? `${dateLabel} • ${timeLabel}` : dateLabel;
      }
      return step;
    });
  },
};

/* --------------------------------- orders --------------------------------- */
export const orderService = {
  submitCustomerOrder: async (payload: { customerConsignee: string; pickup: string; dropoff: string; cargo: string; tailType: string; loadingRoutingType: "Single"|"Multiple"; loadingSite: string[] }) => {
    const partnerName = authService.getCurrentUser()?.partnerCompanyName || "Customer Portal";
    if (!useMock()) {
      return liveCreateTrip({
        customer: partnerName,
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
        scheduledDate: new Date().toISOString(),
        startTime: "-",
        eta: "-",
        progress: 0,
        lat: 6.524,
        lng: 3.379,
        revenue: 0,
      });
    }
    const id = `TRP-${String(850 + store.trips.length).padStart(5, "0")}`;
    const newOrder: Trip = {
      id,
      customer: partnerName,
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
  list: async () => {
    if (!useMock()) return liveListFuel();
    return settle([...store.fuel]);
  },
  approve: async (id: string) => {
    if (!useMock()) {
      const list = await liveListFuel();
      const f = list.find((x) => x.id === id);
      if (!f) return false;
      await liveUpdateFuel(id, { status: "Approved", approvedLitres: f.expectedConsumption });
      return true;
    }
    store.fuel = store.fuel.map((f) => {
      if (f.id === id) {
        store.expenses = [
          {
            id: `EXP-${String(300 + store.expenses.length).padStart(5, "0")}`,
            type: "Fuel",
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
  reject: async (id: string) => {
    if (!useMock()) {
      await liveUpdateFuel(id, { status: "Rejected", approvedLitres: 0 });
      return true;
    }
    store.fuel = store.fuel.map((f) =>
      f.id === id ? { ...f, status: "Rejected" as const, approvedLitres: 0 } : f,
    );
    return settle(true);
  },
};

/* ------------------------------- engineering ------------------------------ */
export const engineeringService = {
  listWorkOrders: async () => {
    if (!useMock()) return liveListWorkOrders();
    return settle([...store.workOrders]);
  },
  createDefect: async (input: { truckReg: string; defect: string; category: string; priority: string; reportedBy: string }) => {
    if (!useMock()) {
      const wo = await liveCreateWorkOrder({
        truckReg: input.truckReg,
        defect: input.defect,
        priority: input.priority,
        status: "Reported",
      });
      return wo.id;
    }
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
        reportedAt: new Date().toLocaleString(),
        cost: 0,
      },
      ...store.workOrders,
    ];
    return settle(id);
  },
  advance: async (id: string) => {
    if (!useMock()) {
      const list = await liveListWorkOrders();
      const current = list.find((w) => w.id === id);
      if (!current) return false;
      const flow = ["Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed"] as const;
      const idx = flow.indexOf(current.status as typeof flow[number]);
      const nextStatus = flow[Math.min(Math.max(idx, 0) + 1, flow.length - 1)]!;
      await liveUpdateWorkOrder(id, { status: nextStatus });
      return true;
    }
    const flow = ["Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed"] as const;
    store.workOrders = store.workOrders.map((w) => {
      if (w.id === id) {
        const nextStatus = flow[Math.min(flow.indexOf(w.status) + 1, flow.length - 1)]!;
        if (nextStatus === "Completed") {
          const head = store.truckHeads.find(t => t.registration === w.truckReg);
          if (head) {
            store.truckHeads = store.truckHeads.map(t => t.id === head.id ? { ...t, status: "Available" } : t);
          }
          const tail = store.truckTails.find(t => t.registration === w.truckReg);
          if (tail) {
            store.truckTails = store.truckTails.map(t => t.id === tail.id ? { ...t, status: "Available" } : t);
          }
        }
        return { ...w, status: nextStatus };
      }
      return w;
    });
    return settle(true);
  },
  logRepair: async (truckReg: string, defect: string, category: string, amount: number) => {
    if (!useMock()) {
      const wo = await liveCreateWorkOrder({
        truckReg,
        defect,
        priority: "High",
        status: "Reported",
      });
      await liveCreateExpense({
        requester: "Engineering",
        department: "Engineering",
        type: "Repairs",
        category,
        amount,
        description: `Repair for ${truckReg}: ${defect}`,
        status: "Pending",
        tripId: wo.id,
      });
      await liveCreateProcurement({
        partName: category || defect,
        quantity: 1,
        linkedId: truckReg,
        status: "Requested",
        date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      });
      return wo.id;
    }
    const id = `ENG-${String(480 + store.workOrders.length).padStart(5, "0")}`;
    store.workOrders = [
      {
        id, truckReg, defect, category, priority: "High", mechanic: "Unassigned", status: "Reported",
        reportedBy: "System", reportedAt: new Date().toLocaleDateString(), cost: amount,
      },
      ...store.workOrders,
    ];
    
    const head = store.truckHeads.find(t => t.registration === truckReg);
    if (head) {
      store.truckHeads = store.truckHeads.map(t => t.id === head.id ? { ...t, status: "Out of Service" } : t);
    }
    const tail = store.truckTails.find(t => t.registration === truckReg);
    if (tail) {
      store.truckTails = store.truckTails.map(t => t.id === tail.id ? { ...t, status: "Out of Service" } : t);
    }

    store.expenses = [
      {
        id: `EXP-${String(300 + store.expenses.length).padStart(5, "0")}`,
        type: "Repairs", amount, standardRate: amount, requester: "Engineering", tripId: "—",
        status: "Pending", approvalLevel: "Operations Manager", date: new Date().toLocaleDateString(),
        documents: [],
      },
      ...store.expenses,
    ];
    
    return settle(id);
  }
};

/* -------------------------------- inventory ------------------------------- */
export const inventoryService = {
  list: async () => {
    if (!useMock()) return liveListInventory();
    return settle([...store.inventory]);
  },
  requisitions: async () => {
    if (!useMock()) return liveListInventoryRequisitions();
    return settle([...store.inventoryRequisitions]);
  },
  release: async (itemId: string, qty: number, reqId?: string) => {
    if (!reqId) return Promise.reject(new Error("Release requires a valid requisition ID."));
    if (!useMock()) {
      await liveReleaseInventory(itemId, qty, reqId);
      return true;
    }
    const req = store.inventoryRequisitions.find((r) => r.id === reqId);
    if (!req) return Promise.reject(new Error("Requisition not found."));
    if (req.status !== "Pending") return Promise.reject(new Error("Requisition is already processed."));
    
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
  updateReorderLevel: async (itemId: string, level: number) => {
    if (!useMock()) {
      await liveUpdateInventory(itemId, { reorderLevel: level });
      return true;
    }
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
  list: async () => {
    if (!useMock()) return liveListProcurement();
    return settle([...store.procurement]);
  },
  markProcured: async (id: string) => {
    if (!useMock()) {
      await liveUpdateProcurement(id, { status: "Procured" });
      return true;
    }
    const pr = store.procurement.find(p => p.id === id);
    if (!pr) return settle(false);

    store.procurement = store.procurement.map((p) => (p.id === id ? { ...p, status: "Procured" } : p));
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
  list: async () => {
    if (!useMock()) return liveListExpenses();
    return settle([...store.expenses]);
  },
  get: async (id: string) => {
    if (!useMock()) {
      const list = await liveListExpenses();
      return list.find((e) => e.id === id) ?? null;
    }
    return settle(store.expenses.find((e) => e.id === id) ?? null);
  },
  setStatus: async (id: string, status: ExpenseStatus) => {
    if (!useMock()) {
      await liveUpdateExpense(id, { status });
      return true;
    }
    store.expenses = store.expenses.map((e) => (e.id === id ? { ...e, status } : e));
    return settle(true);
  },
};

/* ----------------------------------- gate --------------------------------- */
export const gateService = {
  list: async () => {
    if (!useMock()) return liveListGate();
    return settle([...store.gate]);
  },
  create: async (entry: Omit<GateEntry, "id">) => {
    if (!useMock()) {
      const created = await liveCreateGate(entry);
      if (entry.purpose === "Trip return" && entry.asset) {
        const trips = await liveListTrips();
        const trip = trips.find((t) => (t.truckReg || "").includes(entry.asset) && t.status !== "Completed");
        if (trip) await liveUpdateTrip(trip.id, { status: "Completed" });
      }
      return created.id;
    }
    const id = `GTE-${String(330 + store.gate.length).padStart(5, "0")}`;
    store.gate = [{ ...entry, id }, ...store.gate];
    
    if (entry.purpose === "Trip return") {
      const truckReg = entry.asset;
      const head = store.truckHeads.find(t => t.registration === truckReg);
      if (head) {
        store.truckHeads = store.truckHeads.map(t => t.id === head.id ? { ...t, status: "Available" } : t);
      }
      
      const tail = store.truckTails.find(t => t.registration === truckReg);
      if (tail) {
        store.truckTails = store.truckTails.map(t => t.id === tail.id ? { ...t, status: "Available" } : t);
      }
      
      const driver = store.drivers.find(d => d.name === entry.driver);
      if (driver) {
        store.drivers = store.drivers.map(d => d.id === driver.id ? { ...d, status: "Available" } : d);
      }
      
      const trip = store.trips.find(t => t.truckReg?.includes(truckReg) && t.status !== "Completed");
      if (trip) {
        store.trips = store.trips.map(t => t.id === trip.id ? { ...t, status: "Completed" } : t);
      }
    }
    
    return settle(id);
  },
};

/* ------------------------------- collaboration ---------------------------- */
export const messageService = {
  list: async () => {
    if (!useMock()) return liveListConversations();
    return settle([...store.conversations]);
  },
  send: async (conversationId: string, body: string) => {
    if (!useMock()) {
      const user = authService.getCurrentUser();
      await liveSendMessage(conversationId, body, user?.name || "You", user?.roles?.[0] || "Ops");
      return true;
    }
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
  markRead: async (conversationId: string) => {
    if (!useMock()) {
      await liveMarkConversationRead(conversationId);
      return true;
    }
    store.conversations = store.conversations.map((c) =>
      c.id === conversationId ? { ...c, unread: 0 } : c,
    );
    return settle(true);
  },
};

export const notificationService = {
  list: async () => {
    const roles = authService.getRoles();
    if (!useMock()) {
      if (!getToken()) return [];
      let apiItems: Notification[] = [];
      try {
        apiItems = await liveListNotifications({ softAuth: true });
      } catch {
        apiItems = [];
      }
      let trips: Trip[] = [];
      let expenses: Expense[] = [];
      let workOrders: WorkOrder[] = [];
      let drivers: Driver[] = [];
      try {
        const [t, e, w, d] = await Promise.all([
          liveListTrips().catch(() => [] as Trip[]),
          liveListExpenses().catch(() => [] as Expense[]),
          liveListWorkOrders().catch(() => [] as WorkOrder[]),
          liveListDrivers().catch(() => [] as Driver[]),
        ]);
        trips = t;
        expenses = e;
        workOrders = w;
        drivers = d;
      } catch {
        /* soft */
      }
      const synthesized = synthesizeRoleNotifications({ roles, trips, expenses, workOrders, drivers });
      return mergeRoleNotifications(apiItems, roles, synthesized);
    }
    let notifications = [...store.notifications];
    if (roles.includes("Fleet Operations") && !roles.includes("Transport Manager") && !roles.includes("Superadmin")) {
      notifications = notifications.filter((n) => n.category !== "Compliance" && n.category !== "Engineering" && n.category !== "Approvals");
    }
    return settle(notifications);
  },
  getUnreadCount: async () => {
    const list = await notificationService.list();
    return list.filter((n) => !n.read).length;
  },
  markAllRead: async () => {
    if (!useMock()) {
      await liveMarkAllNotificationsRead();
      return true;
    }
    store.notifications = store.notifications.map((n) => ({ ...n, read: true }));
    return settle(true);
  },
  toggleRead: async (id: string) => {
    if (!useMock()) {
      if (id.startsWith("syn-") || id.startsWith("fo-") || id.startsWith("tm-") || id.startsWith("sec-") || id.startsWith("acc-") || id.startsWith("eng-") || id.startsWith("hr-") || id.startsWith("pt-")) {
        return true;
      }
      const list = await liveListNotifications();
      const current = list.find((n) => n.id === id);
      await liveToggleNotification(id, !(current?.read ?? false));
      return true;
    }
    store.notifications = store.notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
    return settle(true);
  },
};

export const auditService = {
  list: async () => {
    if (!useMock()) return liveListAudit();
    return settle([...store.audit]);
  },
};

export const adminService = {
  tenant: () => settle(db.TENANT),
  users: async () => {
    if (!useMock()) return liveListUsers();
    return settle(isolateUser([...store.users]));
  },
  roles: () => settle(db.ROLES),
  loginReports: async () => {
    if (!useMock()) return liveListLoginReports();
    return settle([...store.loginReports]);
  },
  createUser: async (payload: { firstName: string; surname: string; roles: string[]; username: string; department: string; companyId?: string; staffId?: string; partnerCompanyName?: string; email?: string }) => {
    const name = `${payload.firstName} ${payload.surname}`;
    let emailDomain = "petroline.ng";
    if (payload.roles.includes("Customer Portals (External)") && payload.partnerCompanyName) {
      emailDomain = payload.partnerCompanyName.toLowerCase().replace(/[^a-z]+/g, "") + ".com";
    }
    const email = payload.email || `${payload.username}@${emailDomain}`;
    if (!useMock()) {
      return liveCreateUser({
        email,
        name,
        role: payload.roles[0] || "Transport Manager",
        password: "ChangeMe@2026",
        tenantId: payload.companyId,
        status: "Active",
      });
    }
    const id = payload.staffId || `USR-${String(100 + store.users.length).padStart(4, "0")}`;
    const newUser: import("./types").User = {
      id,
      name,
      email,
      username: payload.username,
      roles: payload.roles as any,
      roleNames: payload.roles,
      department: payload.department,
      status: "Active",
      passwordResetRequired: true,
      lastActive: "Just now",
      initials: `${payload.firstName[0] || ""}${payload.surname[0] || ""}`,
      companyId: payload.companyId,
      partnerCompanyName: payload.partnerCompanyName,
    };
    store.users = [newUser, ...store.users];
    return settle(newUser);
  },
  resetPassword: async (userId: string) => {
    if (!useMock()) {
      await liveUpdateUser(userId, { password: "ChangeMe@2026" });
      return true;
    }
    store.users = store.users.map(u => u.id === userId ? { ...u, passwordResetRequired: true } : u);
    return settle(true);
  },
  editUser: async (id: string, payload: Partial<import("./types").User>) => {
    if (!useMock()) {
      await liveUpdateUser(id, {
        name: payload.name,
        role: payload.roles?.[0],
        status: payload.status,
        tenantId: payload.companyId,
      });
      return true;
    }
    store.users = store.users.map(u => u.id === id ? { ...u, ...payload, roleNames: payload.roles || u.roleNames } : u);
    return settle(true);
  },
  activateUser: async (id: string) => {
    if (!useMock()) {
      await liveUpdateUser(id, { status: "Active" });
      return true;
    }
    store.users = store.users.map(u => u.id === id ? { ...u, status: "Active" } : u);
    return settle(true);
  },
  suspendUser: async (id: string) => {
    if (!useMock()) {
      await liveUpdateUser(id, { status: "Suspended" });
      return true;
    }
    store.users = store.users.map(u => u.id === id ? { ...u, status: "Suspended" } : u);
    return settle(true);
  },
  deleteUser: async (id: string) => {
    if (!useMock()) {
      await liveDeleteUser(id);
      return true;
    }
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
    if (!useMock()) {
      const [trips, trucks, drivers, expenses, gateEntries, workOrders, inventory, procurement, alerts] = await Promise.all([
        liveListTrips().catch(() => [] as Trip[]),
        liveListTrucks().catch(() => [] as TruckHead[]),
        liveListDrivers().catch(() => [] as Driver[]),
        liveListExpenses().catch(() => [] as Expense[]),
        liveListGate().catch(() => [] as GateEntry[]),
        liveListWorkOrders().catch(() => [] as WorkOrder[]),
        liveListInventory().catch(() => [] as InventoryItem[]),
        liveListProcurement().catch(() => [] as import("./types").ProcurementRequest[]),
        liveListNotifications().catch(() => [] as import("./types").Notification[]),
      ]);
      return {
        trips,
        trucks,
        drivers,
        expenses,
        gateEntries,
        alerts: alerts.map((n) => ({
          id: n.id,
          level: (n.severity === "critical" ? "Critical" : n.severity === "warning" ? "Warning" : "System") as "Critical" | "Warning" | "Approval" | "System",
          message: `${n.title}: ${n.body}`,
          reference: n.category,
        })),
        workOrders,
        inventory,
        procurement,
        charts: {
          costRevenue: db.CHART_COST_REVENUE,
          utilisation: db.CHART_UTILISATION,
          tripPerformance: db.CHART_TRIP_PERFORMANCE,
          fuel: db.CHART_FUEL,
          expenseSplit: db.CHART_EXPENSE_SPLIT,
        },
      };
    }
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
// Bump this version whenever mock-data schema changes to force a cache refresh
const DATA_SCHEMA_VERSION = "4";

const getInitialState = <T>(key: string, fallback: T): T => {
  if (typeof window !== "undefined") {
    // Check schema version — if it changed, nuke old cached data
    const storedVersion = localStorage.getItem("fleetopsx_schema_version");
    if (storedVersion !== DATA_SCHEMA_VERSION) {
      // Clear all fleetopsx_ keys to force fresh mock data
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("fleetopsx_") && k !== "fleetopsx_user_id" && k !== "fleetopsx_roles") {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem("fleetopsx_schema_version", DATA_SCHEMA_VERSION);
      return fallback;
    }
    const saved = localStorage.getItem(`fleetopsx_${key}`);
    if (saved) return JSON.parse(saved);
  }
  return fallback;
};

const initialStore = {
  platformTenants: getInitialState("platformTenants", [...db.PLATFORM_TENANTS]),
  companies: getInitialState("companies", [...db.COMPANIES]),
  truckHeads: getInitialState("truckHeads", [...db.TRUCK_HEADS] as TruckHead[]),
  truckTails: getInitialState("truckTails", [...db.TRUCK_TAILS] as TruckTail[]),
  drivers: getInitialState("drivers", [...db.DRIVERS] as Driver[]),
  trips: getInitialState("trips", [...db.TRIPS] as Trip[]),
  fuel: getInitialState("fuel", [...db.FUEL_REQUISITIONS]),
  workOrders: getInitialState("workOrders", [...db.WORK_ORDERS]),
  inventory: getInitialState("inventory", [...db.INVENTORY]),
  inventoryRequisitions: getInitialState("inventoryRequisitions", [...db.INVENTORY_REQUISITIONS]),
  procurement: getInitialState("procurement", [...db.PROCUREMENT_REQUESTS]),
  expenses: getInitialState("expenses", [...db.EXPENSES] as Expense[]),
  gate: getInitialState("gate", [...db.GATE_ENTRIES]),
  conversations: getInitialState("conversations", db.CONVERSATIONS.map((c) => ({ ...c, messages: [...c.messages] }))),
  notifications: getInitialState("notifications", [...db.NOTIFICATIONS]),
  audit: getInitialState("audit", [...db.AUDIT_LOGS]),
  users: getInitialState("users", [...db.USERS]),
  loginReports: getInitialState("loginReports", [...db.LOGIN_REPORTS]),
};

const store = new Proxy(initialStore, {
  set(target, prop: keyof typeof initialStore, value) {
    target[prop] = value as any;
    if (typeof window !== "undefined") {
      localStorage.setItem(`fleetopsx_${String(prop)}`, JSON.stringify(value));
    }
    return true;
  }
});

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
    .forEach((t) => hits.push({ group: "Trips", label: t.id, meta: `${t.pickup} → ${t.dropoff} · ${t.status}`, to: "/workspace/app/trips/$tripId", params: { tripId: t.id } }));
  
  store.truckHeads.filter((t) => `${t.id} ${t.number} ${t.registration}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Truck Heads", label: `${t.id} · ${t.registration}`, meta: `${t.make} · ${t.status}`, to: "/workspace/app/fleet" }));
  
  store.truckTails.filter((t) => `${t.id} ${t.number} ${t.registration}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((t) => hits.push({ group: "Truck Tails", label: `${t.id} · ${t.registration}`, meta: `${t.type} · ${t.status}`, to: "/workspace/app/fleet" }));

  store.drivers.filter((d) => `${d.id} ${d.name} ${d.employeeId} ${d.licenseNumber} ${d.assignedTruck || ""}`.toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((d) => hits.push({ group: "Drivers", label: `${d.id} · ${d.name}`, meta: `${d.status} · ${d.compliance}`, to: "/workspace/app/drivers/$driverId", params: { driverId: d.id } }));
  store.expenses.filter((e) => `${e.id} ${e.requester} ${e.type}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((e) => hits.push({ group: "Expenses", label: e.id, meta: `${e.type} \u00b7 \u20A6${e.amount.toLocaleString()}`, to: "/workspace/app/accounts" }));
  store.workOrders.filter((w) => `${w.id} ${w.truckReg} ${w.defect}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((w) => hits.push({ group: "Work Orders", label: w.id, meta: `${w.truckReg} · ${w.status}`, to: "/workspace/app/engineering" }));
  store.inventory.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((i) => hits.push({ group: "Inventory", label: `${i.name}`, meta: `${i.sku} · ${i.stock} in stock`, to: "/workspace/app/inventory" }));
  store.audit.filter((a) => `${a.record} ${a.action} ${a.user}`.toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((a) => hits.push({ group: "Audit Logs", label: a.record, meta: `${a.action} · ${a.user}`, to: "/workspace/app/audit" }));
  return hits;
}

export const formatNaira = (n: number) =>
  `\u20A6${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-NG")}`;
export const formatNairaFull = (n: number) => `\u20A6${n.toLocaleString("en-NG")}`;

