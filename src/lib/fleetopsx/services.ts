import type {
  Driver, Expense, ExpenseStatus, GateEntry, InventoryItem,
  ProcurementRequest, Trip, TimelineStep, TruckHead, TruckTail, Company, PlatformTenant, User
} from "./types";
import { getTenantSlug } from "./hostname";
import { fetchApi } from "./apiClient";

export const tenantService = {
  list: () => fetchApi('/tenants'),
  getBySlug: (slug: string) => fetchApi(`/tenants?slug=${slug}`),
  create: (name: string, domain: string, logo?: string) => fetchApi('/tenants', { method: 'POST', body: JSON.stringify({ name, domain, logo }) }),
  updateTenant: (id: string, updates: Partial<PlatformTenant>) => fetchApi(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTenant: (id: string) => fetchApi(`/tenants/${id}`, { method: 'DELETE' }),
};

export const companyService = {
  list: () => fetchApi('/companies'),
  create: (input: Omit<Company, "id" | "status">) => fetchApi('/companies', { method: 'POST', body: JSON.stringify(input) }),
};

export const fleetService = {
  listHeads: () => fetchApi('/fleet/heads'),
  listTails: () => fetchApi('/fleet/tails'),
  createHead: (input: any) => fetchApi('/fleet/heads', { method: 'POST', body: JSON.stringify(input) }),
  createTail: (input: any) => fetchApi('/fleet/tails', { method: 'POST', body: JSON.stringify(input) }),
  updateHeadStatus: (id: string, status: string) => fetchApi(`/fleet/heads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateTailStatus: (id: string, status: string) => fetchApi(`/fleet/tails/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateHead: (id: string, updates: Partial<TruckHead>) => fetchApi(`/fleet/heads/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteHead: (id: string) => fetchApi(`/fleet/heads/${id}`, { method: 'DELETE' }),
  updateTail: (id: string, updates: Partial<TruckTail>) => fetchApi(`/fleet/tails/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTail: (id: string) => fetchApi(`/fleet/tails/${id}`, { method: 'DELETE' }),
  getHead: (id: string) => fetchApi(`/fleet/heads/${id}`),
  getTail: (id: string) => fetchApi(`/fleet/tails/${id}`),
  summary: () => fetchApi('/fleet/summary'),
};

export const driverService = {
  list: () => fetchApi('/drivers'),
  get: (id: string) => fetchApi(`/drivers/${id}`),
  create: (input: any) => fetchApi('/drivers', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, updates: Partial<Driver>) => fetchApi(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  delete: (id: string) => fetchApi(`/drivers/${id}`, { method: 'DELETE' }),
};

export const authService = {
  login: async (username: string) => {
    const res = await fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ username }) });
    if (res.token) {
      localStorage.setItem("fleetopsx_token", res.token);
      localStorage.setItem("fleetopsx_user_id", res.user.id);
      localStorage.setItem("fleetopsx_roles", JSON.stringify(res.user.roles));
    }
    return res.user;
  },
  logout: () => {
    localStorage.removeItem("fleetopsx_token");
    localStorage.removeItem("fleetopsx_user_id");
    localStorage.removeItem("fleetopsx_roles");
  },
  isAuthenticated: () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("fleetopsx_user_id");
  },
  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    const userId = localStorage.getItem("fleetopsx_user_id");
    if (!userId) return null;
    // In a real app we'd decode JWT or fetch /me. Assuming we just need to return an object for now:
    return {
      id: userId,
      roles: JSON.parse(localStorage.getItem("fleetopsx_roles") || "[]"),
      name: "Logged In User"
    } as any;
  },
  getRoles: () => {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem("fleetopsx_roles") || "[]");
  }
};

export const tripService = {
  list: () => fetchApi('/trips'),
  get: (id: string) => fetchApi(`/trips/${id}`),
  create: (input: any) => fetchApi('/trips', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, payload: Partial<Trip>) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) => fetchApi(`/trips/${id}`, { method: 'DELETE' }),
  initialApprove: (id: string) => fetchApi(`/trips/${id}/approve`, { method: 'POST' }),
  approveDispatch: (id: string) => fetchApi(`/trips/${id}/dispatch`, { method: 'POST' }),
  updateStatus: (id: string) => fetchApi(`/trips/${id}/status/next`, { method: 'POST' }),
  setStatus: (id: string, newStatus: string) => fetchApi(`/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) }),
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
  approve: (id: string) => fetchApi(`/fuel/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => fetchApi(`/fuel/${id}/reject`, { method: 'POST' }),
};

export const engineeringService = {
  listWorkOrders: () => fetchApi('/engineering/work-orders'),
  createDefect: (input: any) => fetchApi('/engineering/work-orders', { method: 'POST', body: JSON.stringify(input) }),
  advance: (id: string) => fetchApi(`/engineering/work-orders/${id}/advance`, { method: 'POST' }),
  logRepair: (truckReg: string, defect: string, category: string, amount: number) => 
    fetchApi('/engineering/repair', { method: 'POST', body: JSON.stringify({ truckReg, defect, category, amount }) })
};

export const inventoryService = {
  list: () => fetchApi('/inventory'),
  requisitions: () => fetchApi('/inventory/requisitions'),
  release: (itemId: string, qty: number, reqId?: string) => fetchApi(`/inventory/${itemId}/release`, { method: 'POST', body: JSON.stringify({ qty, reqId }) }),
  updateReorderLevel: (itemId: string, level: number) => fetchApi(`/inventory/${itemId}/reorder`, { method: 'PATCH', body: JSON.stringify({ level }) })
};

export const procurementService = {
  list: () => fetchApi('/procurement'),
  markProcured: (id: string) => fetchApi(`/procurement/${id}/procure`, { method: 'POST' })
};

export const complianceService = {
  getVehicleDocs: () => fetchApi('/compliance/vehicles'),
  getDriverDocs: () => fetchApi('/compliance/drivers')
};

export const depreciationService = {
  getAssetDepreciation: () => fetchApi('/depreciation/assets')
};

export const accountService = {
  list: () => fetchApi('/accounts/expenses'),
  get: (id: string) => fetchApi(`/accounts/expenses/${id}`),
  setStatus: (id: string, status: ExpenseStatus) => fetchApi(`/accounts/expenses/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
};

export const gateService = {
  list: () => fetchApi('/gate'),
  create: (entry: Omit<GateEntry, "id">) => fetchApi('/gate', { method: 'POST', body: JSON.stringify(entry) })
};

export const messageService = {
  list: () => fetchApi('/messages/conversations'),
  send: (conversationId: string, body: string) => fetchApi(`/messages/conversations/${conversationId}`, { method: 'POST', body: JSON.stringify({ body }) }),
  markRead: (conversationId: string) => fetchApi(`/messages/conversations/${conversationId}/read`, { method: 'POST' })
};

export const notificationService = {
  list: () => fetchApi('/notifications'),
  getUnreadCount: async () => { const res = await fetchApi('/notifications/unread'); return res.count || 0; },
  markAllRead: () => fetchApi('/notifications/read-all', { method: 'POST' }),
  toggleRead: (id: string) => fetchApi(`/notifications/${id}/toggle`, { method: 'POST' })
};

export const auditService = { list: () => fetchApi('/audit') };

export const adminService = {
  tenant: () => fetchApi('/admin/tenant'),
  users: () => fetchApi('/admin/users'),
  roles: () => fetchApi('/admin/roles'),
  loginReports: () => fetchApi('/admin/login-reports'),
  createUser: (payload: any) => fetchApi('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (userId: string) => fetchApi(`/admin/users/${userId}/reset-password`, { method: 'POST' }),
  editUser: (id: string, payload: any) => fetchApi(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  activateUser: (id: string) => fetchApi(`/admin/users/${id}/activate`, { method: 'POST' }),
  suspendUser: (id: string) => fetchApi(`/admin/users/${id}/suspend`, { method: 'POST' }),
  deleteUser: (id: string) => fetchApi(`/admin/users/${id}`, { method: 'DELETE' })
};

export const dashboardService = {
  activity: () => fetchApi('/dashboard/activity'),
  alerts: () => fetchApi('/dashboard/alerts'),
  charts: () => fetchApi('/dashboard/charts'),
  getOverview: () => fetchApi('/dashboard/overview')
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
