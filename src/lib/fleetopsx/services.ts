import type {
  Driver, Expense, ExpenseStatus, GateEntry, InventoryItem,
  ProcurementRequest, Trip, TimelineStep, TruckHead, TruckTail, Company, PlatformTenant, User
} from "./types";
import { getTenantSlug } from "./hostname";
import { fetchApi, setToken, setStoredUser, clearSession, getStoredUser } from "./apiClient";
import { mapTrip, mapDriver, mapExpense, mapWorkOrder, mapTruckHead } from "./live-api";

export const tenantService = {
  list: () => fetchApi('/tenants'),
  getBySlug: async (slug: string) => {
    try {
      const res = await fetchApi<any>(`/tenants?slug=${slug}`, { softAuth: true });
      return Array.isArray(res) ? res[0] : res;
    } catch {
      return null;
    }
  },
  create: (name: string, domain: string, logo?: string) => fetchApi('/tenants', { method: 'POST', body: JSON.stringify({ name, domain, logo }) }),
  updateTenant: (id: string, updates: Partial<PlatformTenant>) => fetchApi(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTenant: (id: string) => fetchApi(`/tenants/${id}`, { method: 'DELETE' }),
};

export const companyService = {
  list: () => fetchApi('/companies'),
  create: (input: Omit<Company, "id" | "status">) => fetchApi('/companies', { method: 'POST', body: JSON.stringify(input) }),
};

import { TRUCK_TAILS } from "./mock-data";

export const fleetService = {
  listHeads: () => fetchApi('/trucks').then((res: any[]) => res.map(mapTruckHead)),
  listTails: (): Promise<TruckTail[]> => fetchApi('/trucks').then((res: any[]) => {
    const apiTails = res.filter((t) => String(t.category).toLowerCase().includes('tail')).map(mapTruckHead as any) as TruckTail[];
    return apiTails.length > 0 ? apiTails : TRUCK_TAILS;
  }).catch(() => TRUCK_TAILS),
  createHead: (input: any) => fetchApi('/trucks', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    notificationService.create({ title: 'New Asset Added', body: `Truck ${input.registration} has been added to the fleet.`, category: 'Operations' });
    return res;
  }),
  createTail: (input: any) => fetchApi('/trucks', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    notificationService.create({ title: 'New Asset Added', body: `Tail ${input.registration} has been added to the fleet.`, category: 'Operations' });
    return res;
  }),
  updateHeadStatus: (id: string, status: string) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({ title: 'Asset Status Changed', body: `Truck ${id.substring(0,6)} status changed to ${status}.`, category: 'Operations' });
    return res;
  }),
  updateTailStatus: (id: string, status: string) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({ title: 'Asset Status Changed', body: `Tail ${id.substring(0,6)} status changed to ${status}.`, category: 'Operations' });
    return res;
  }),
  updateHead: (id: string, updates: Partial<TruckHead>) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteHead: (id: string) => fetchApi(`/trucks/${id}`, { method: 'DELETE' }),
  updateTail: (id: string, updates: Partial<TruckTail>) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTail: (id: string) => fetchApi(`/trucks/${id}`, { method: 'DELETE' }),
  getHead: (id: string) => fetchApi(`/trucks/${id}`),
  getTail: (id: string) => fetchApi(`/trucks/${id}`),
  summary: () => fetchApi('/dashboard/overview'),
};

export const driverService = {
  list: () => fetchApi('/drivers').then((res: any[]) => res.map(mapDriver)),
  get: (id: string) => fetchApi(`/drivers/${id}`).then(mapDriver),
  create: (input: any) => fetchApi('/drivers', { method: 'POST', body: JSON.stringify(input) }).then(mapDriver),
  update: (id: string, updates: Partial<Driver>) => fetchApi(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(mapDriver),
  delete: (id: string) => fetchApi(`/drivers/${id}`, { method: 'DELETE' }),
};

export const authService = {
  login: async (username: string, password?: string) => {
    const res = await fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res.token) {
      setToken(res.token);
      setStoredUser(res.user);
      localStorage.setItem("fleetopsx_user_id", res.user.id);
      localStorage.setItem("fleetopsx_roles", JSON.stringify(res.user.roles));
      if (res.user.name) {
        localStorage.setItem("fleetopsx_user_name", res.user.name);
      }
    }
    return res.user;
  },
  setRoles: (roles: string[]) => {
    localStorage.setItem("fleetopsx_roles", JSON.stringify(roles));
    const u = getStoredUser<any>();
    if (u) setStoredUser({ ...u, roles });
  },
  completeFirstTimeLogin: (userId: string, newPassword?: string) => fetchApi(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ password: newPassword || 'ChangeMe@2026', passwordResetRequired: false }) }).catch(() => {}),
  logout: () => {
    clearSession();
    localStorage.removeItem("fleetopsx_user_id");
    localStorage.removeItem("fleetopsx_roles");
    localStorage.removeItem("fleetopsx_user_name");
  },
  isAuthenticated: () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("fleetopsx_user_id");
  },
  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    const userId = localStorage.getItem("fleetopsx_user_id");
    if (!userId) return null;
    return {
      id: userId,
      roles: JSON.parse(localStorage.getItem("fleetopsx_roles") || "[]"),
      name: localStorage.getItem("fleetopsx_user_name") || "Logged In User"
    } as any;
  },
  getRoles: () => {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem("fleetopsx_roles") || "[]");
  },
  getAllRoles: () => [
    { key: "Platform Admin", name: "Platform Admin", modules: [] },
    { key: "Transport Manager", name: "Transport Manager", modules: [] },
    { key: "Fleet Operations", name: "Fleet Operations", modules: [] },
    { key: "Diesel", name: "Fuel Manager", modules: [] },
    { key: "Gate", name: "Gate Security", modules: [] },
    { key: "Tracking", name: "Tracking Operations", modules: [] },
    { key: "Engineering", name: "Engineering / Workshop", modules: [] },
    { key: "Procurement", name: "Procurement", modules: [] },
    { key: "Inventory", name: "Inventory", modules: [] },
    { key: "Customer Portals (External)", name: "Customer Portal", modules: [] },
  ],
  getWorkspaces: () => [
    { id: "W01", name: "Lagos Hub", role: "HQ" },
    { id: "W02", name: "Abuja Depot", role: "Branch" }
  ]
};

export const tripService = {
  list: () => fetchApi('/trips').then((res: any[]) => res.map(mapTrip)).catch(() => []),
  get: (id: string) => fetchApi(`/trips/${id}`).then(mapTrip),
  create: (data: Partial<Trip>) => fetchApi('/trips', { method: 'POST', body: JSON.stringify(data) }).then(res => {
    const trip = mapTrip(res);
    notificationService.create({ title: 'New Dispatch Request', body: `Customer requested a new dispatch for ${trip.cargo}.`, category: 'Operations' });
    return trip;
  }),
  update: (id: string, payload: Partial<Trip>) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(mapTrip),
  updateTrip: (id: string, payload: Partial<Trip>) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(mapTrip),
  assignResource: (id: string, updates: Partial<Trip>) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(res => {
    const trip = mapTrip(res);
    notificationService.create({ title: 'Resource Assigned', body: `Resources assigned to dispatch ${trip.id.substring(0,6)}.`, category: 'Operations' });
    return trip;
  }),
  setStatus: (id: string, status: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    const trip = mapTrip(res);
    notificationService.create({ title: 'Dispatch Status Updated', body: `Dispatch ${trip.id.substring(0,6)} is now ${status}.`, category: 'Operations' });
    return trip;
  }),
  delete: (id: string) => fetchApi(`/trips/${id}`, { method: 'DELETE' }),
  summary: () => fetchApi('/dashboard/overview'),
  initialApprove: (id: string) => fetchApi(`/trips/${id}/approve`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Dispatch Initially Approved', body: `Dispatch ${id.substring(0,6)} is awaiting final dispatch.`, category: 'Approvals' });
    return res;
  }),
  approveDispatch: (id: string) => fetchApi(`/trips/${id}/dispatch`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Dispatch Approved', body: `Dispatch ${id.substring(0,6)} has been approved.`, category: 'Operations' });
    return res;
  }),
  updateStatus: (id: string) => fetchApi(`/trips/${id}/status/next`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Dispatch Progress', body: `Dispatch ${id.substring(0,6)} progressed to next stage.`, category: 'Operations' });
    return res;
  }),
  timeline: (trip: Trip): TimelineStep[] => {
    const order = ["Dispatch Created", "Driver Assigned", "Truck Departed", "Pickup Completed", "En Route", "Offloading", "Returning", "Trip Completed"];
    const idx: Record<string, number> = { Scheduled: 1, Loaded: 3, "En Route": 4, Stopped: 4, Delayed: 4, Offloading: 5, Returning: 6, Completed: 7 };
    const current = idx[trip.status] ?? 4;
    return order.map((label, i) => {
      const step: TimelineStep = { label, state: i < current ? "done" : i === current ? "current" : "pending" };
      if (i <= current) step.at = `${String(6 + i).padStart(2, "0")}:${String((i * 17) % 60).padStart(2, "0")}`;
      return step;
    });
  },
};

export const orderService = {
  submitCustomerOrder: (payload: any) => fetchApi('/orders', { method: 'POST', body: JSON.stringify(payload) })
};

export const fuelService = {
  list: () => fetchApi('/fuel'),
  approve: (id: string) => fetchApi(`/fuel/${id}/approve`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Approved', body: `Requisition ${id.substring(0,6)} has been approved.`, category: 'Approvals' });
    return res;
  }),
  reject: (id: string) => fetchApi(`/fuel/${id}/reject`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Rejected', body: `Requisition ${id.substring(0,6)} was rejected.`, category: 'Operations' });
    return res;
  }),
};

export const engineeringService = {
  listWorkOrders: () => fetchApi('/engineering/work-orders').then((res: any[]) => res.map(mapWorkOrder)),
  createDefect: (input: any) => fetchApi('/engineering/work-orders', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    const wo = mapWorkOrder(res);
    notificationService.create({ title: 'New Work Order', body: `Defect reported for truck ${input.truckReg}.`, category: 'Engineering' });
    return wo;
  }),
  advance: (id: string) => fetchApi(`/engineering/work-orders/${id}/advance`, { method: 'POST' }).then(mapWorkOrder),
  logRepair: (truckReg: string, defect: string, category: string, amount: number) => 
    fetchApi('/engineering/repair', { method: 'POST', body: JSON.stringify({ truckReg, defect, category, amount }) }).then(res => {
      notificationService.create({ title: 'Repair Logged', body: `Repair logged for ${truckReg} (${defect}).`, category: 'Engineering' });
      return res;
    })
};

export const inventoryService = {
  list: () => fetchApi('/inventory'),
  requisitions: () => fetchApi('/inventory/requisitions'),
  release: (itemId: string, qty: number, reqId?: string) => fetchApi(`/inventory/${itemId}/release`, { method: 'POST', body: JSON.stringify({ qty, reqId }) }).then(res => {
    notificationService.create({ title: 'Parts Released', body: `${qty} units released from inventory.`, category: 'Engineering' });
    return res;
  }),
  updateReorderLevel: (itemId: string, level: number) => fetchApi(`/inventory/${itemId}/reorder`, { method: 'PATCH', body: JSON.stringify({ level }) })
};

export const procurementService = {
  list: () => fetchApi('/procurement'),
  markProcured: (id: string) => fetchApi(`/procurement/${id}/procure`, { method: 'POST' }).then(res => {
    notificationService.create({ title: 'Items Procured', body: `Procurement request ${id.substring(0,6)} fulfilled.`, category: 'Compliance' });
    return res;
  })
};

export const complianceService = {
  getVehicleDocs: () => fetchApi('/compliance/vehicles'),
  getDriverDocs: () => fetchApi('/compliance/drivers')
};

export const depreciationService = {
  getAssetDepreciation: () => fetchApi('/depreciation/assets')
};

export const accountService = {
  list: () => fetchApi('/expenses').then((res: any[]) => res.map(mapExpense)),
  get: (id: string) => fetchApi(`/expenses/${id}`).then(mapExpense),
  setStatus: (id: string, status: ExpenseStatus) => fetchApi(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(mapExpense)
};

export const gateService = {
  list: () => fetchApi('/gate'),
  create: (entry: Omit<GateEntry, "id">) => fetchApi('/gate', { method: 'POST', body: JSON.stringify(entry) })
};

export const messageService = {
  list: () => fetchApi('/conversations'),
  send: (conversationId: string, body: string) => fetchApi(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  markRead: (conversationId: string) => fetchApi(`/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ unread: 0 }) })
};

export const notificationService = {
  list: () => fetchApi('/notifications'),
  getUnreadCount: async () => { const res = await fetchApi('/notifications/unread').catch(() => ({ count: 0 })); return res.count || 0; },
  markAllRead: () => fetchApi('/notifications/mark-all-read', { method: 'POST' }),
  toggleRead: (id: string) => fetchApi(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) }), // Simplify toggle to mark read
  create: (payload: { title: string; body: string; category: string; severity?: string }) => 
    fetchApi('/notifications', { method: 'POST', body: JSON.stringify({ ...payload, severity: payload.severity || 'info' }) }).catch(() => {})
};

export const auditService = { list: () => fetchApi('/audit') };

export const adminService = {
  tenant: () => fetchApi('/tenants').then(res => res[0]),
  users: () => fetchApi('/users').catch(() => []),
  roles: () => fetchApi('/admin/roles').catch(() => []), // Local mock if needed
  loginReports: () => fetchApi('/login-reports'),
  createUser: (payload: any) => fetchApi('/users', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (userId: string) => fetchApi(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ password: 'ChangeMe@2026', passwordResetRequired: true }) }),
  editUser: (id: string, payload: any) => fetchApi(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  activateUser: (id: string) => fetchApi(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Active' }) }),
  suspendUser: (id: string) => fetchApi(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Suspended' }) }),
  deleteUser: (id: string) => fetchApi(`/users/${id}`, { method: 'DELETE' })
};

export const dashboardService = {
  activity: () => fetchApi('/dashboard/activity'),
  alerts: () => fetchApi('/dashboard/alerts'),
  charts: () => fetchApi('/dashboard/charts'),
  getOverview: () => fetchApi('/dashboard/overview').then((res: any) => ({
    ...res,
    trips: res.trips?.map(mapTrip) || [],
    trucks: res.trucks?.map(mapTruckHead) || [],
    drivers: res.drivers?.map(mapDriver) || [],
    expenses: res.expenses?.map(mapExpense) || []
  })).catch(() => ({})),
};

export interface SearchHit {
  group: string;
  label: string;
  meta: string;
  to: string;
  params?: Record<string, string>;
}

export async function globalSearch(query: string): Promise<SearchHit[]> {
  return await fetchApi(`/search?q=${encodeURIComponent(query)}`);
}

export const formatNaira = (n: number) =>
  `\u20A6${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-NG")}`;
export const formatNairaFull = (n: number) => `\u20A6${n.toLocaleString("en-NG")}`;
