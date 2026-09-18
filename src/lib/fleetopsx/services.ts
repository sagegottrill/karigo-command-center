import type {
  Driver, Expense, ExpenseStatus, GateEntry, InventoryItem,
  ProcurementRequest, Trip, TimelineStep, TruckHead, TruckTail, Company, PlatformTenant, User
} from "./types";
import { getTenantSlug } from "./hostname";
import { fetchApi, setToken, setStoredUser, clearSession, getStoredUser } from "./apiClient";
import { mapTrip, mapDriver, mapExpense, mapWorkOrder, mapTruckHead, mapTail, asList, tripToApi } from "./live-api";
import { displayRequestId } from "./request-id";
import { setActiveRole } from "./active-role";
import { clearPendingLoginPassword, getPendingLoginPassword } from "./password-policy";

/**
 * Fuel pricing: the Transport Manager is the single source of truth for the
 * price per litre. Fleet Operations only ever enters a quantity — the cost is
 * computed as qty × TM-set price, never typed by hand.
 */
export type FuelPrice = {
  id: string;
  fuelType: "Diesel" | "Gas";
  pricePerLitre: number;
  updatedBy: string;
  updatedAt: string;
};

export const fuelPriceService = {
  list: (): Promise<FuelPrice[]> =>
    fetchApi<FuelPrice[]>('/fuel-prices').then((res) => asList(res as any) as FuelPrice[]),
  update: (fuelType: "Diesel" | "Gas", pricePerLitre: number) =>
    fetchApi<FuelPrice>('/fuel-prices', { method: 'PUT', body: JSON.stringify({ fuelType, pricePerLitre }) }),
};

export const tenantService = {
  list: () => fetchApi('/tenants'),
  // Backend route is GET /tenants/slug/:slug (a ?slug= query just returns the
  // whole list and we'd pick the wrong tenant).
  getBySlug: async (slug: string) => {
    try {
      return await fetchApi<any>(`/tenants/slug/${slug}`, { softAuth: true });
    } catch {
      try {
        const list = await fetchApi<any[]>('/tenants', { softAuth: true });
        return list.find((t) => t?.tenantSlug === slug || t?.domain === slug) ?? null;
      } catch {
        return null;
      }
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

export const fleetService = {
  listHeads: () => fetchApi('/trucks').then((res: any[]) => res.map(mapTruckHead)),
  listTails: (): Promise<TruckTail[]> => fetchApi('/tails').then((res: any[]) => asList(res).map(mapTail)),
  createHead: (input: any) => fetchApi('/trucks', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    notificationService.create({ title: 'New Asset Added', body: `Truck ${input.registration} has been added to the fleet.`, category: 'Operations' });
    return res;
  }),
  createTail: (input: any) => fetchApi('/tails', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    notificationService.create({ title: 'New Asset Added', body: `Tail ${input.number} has been added to the fleet.`, category: 'Operations' });
    return res;
  }),
  // Fleet-asset bookkeeping is INTERNAL. The notification is deliberately scoped
  // to staff roles: a partner must never be told that a truck is "Out of Yard"
  // (that is not the customer's dispatch state — the dispatch lifecycle is).
  updateHeadStatus: (id: string, status: string) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({
      title: 'Asset Status Changed',
      body: `Truck ${id.substring(0,6)} status changed to ${status}.`,
      category: 'Operations',
      audience: 'Transport Manager,Fleet Operations,Platform Admin',
    });
    return res;
  }),
  updateTailStatus: (id: string, status: string) => fetchApi(`/tails/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({
      title: 'Asset Status Changed',
      body: `Tail status changed to ${status}.`,
      category: 'Operations',
      audience: 'Transport Manager,Fleet Operations,Platform Admin',
    });
    return res;
  }),
  /**
   * Where an asset sits ("Port" / "Customer"). Stored in the asset's
   * `destination` column so the value survives regardless of the roster sheet.
   */
  setHeadDestination: (id: string, destination: string) =>
    fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ destination }) }),
  setTailDestination: (id: string, destination: string) =>
    fetchApi(`/tails/${id}`, { method: 'PATCH', body: JSON.stringify({ destination }) }),
  updateHead: (id: string, updates: Partial<TruckHead>) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteHead: (id: string) => fetchApi(`/trucks/${id}`, { method: 'DELETE' }),
  updateTail: (id: string, updates: Partial<TruckTail>) => fetchApi(`/tails/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTail: (id: string) => fetchApi(`/tails/${id}`, { method: 'DELETE' }),
  // No GET /trucks/:id or /tails/:id on the backend — resolve from the lists.
  getHead: async (id: string) => {
    const heads = await fleetService.listHeads().catch(() => []);
    return heads.find((h) => h.id === id);
  },
  getTail: async (id: string) => {
    const tails = await fleetService.listTails().catch(() => []);
    return tails.find((t) => t.id === id);
  },
  summary: () => fetchApi('/dashboard/overview'),
};

export const driverService = {
  list: () => fetchApi('/drivers').then((res: any[]) => res.map(mapDriver)),
  // No GET /drivers/:id on the backend — resolve from the list.
  get: async (id: string) => {
    const drivers = await driverService.list().catch(() => []);
    const found = drivers.find((d) => d.id === id);
    if (found) return found;
    return fetchApi(`/drivers/${id}`).then(mapDriver);
  },
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
  // Self-service password change — backend route PATCH /users/me/password.
  // MUST throw on failure: swallowing errors here caused the first-login reset
  // loop (403 swallowed → flag never cleared → reset form again forever).
  completeFirstTimeLogin: async (userId: string, newPassword?: string) => {
    const currentPassword = getPendingLoginPassword() || undefined;
    if (!newPassword) throw new Error("Please enter a new password.");
    try {
      await fetchApi(`/users/me/password`, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update password.";
      throw new Error(message);
    } finally {
      clearPendingLoginPassword();
    }
    // Sync the stored profile so the reset flag doesn't linger client-side.
    const stored = getStoredUser<any>();
    if (stored) setStoredUser({ ...stored, passwordResetRequired: false });
  },
  logout: () => {
    fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession();
    localStorage.removeItem("fleetopsx_user_id");
    localStorage.removeItem("fleetopsx_roles");
    localStorage.removeItem("fleetopsx_user_name");
    setActiveRole(null);
  },
  isAuthenticated: () => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("fleetopsx_user_id");
  },
  getCurrentUser: () => {
    if (typeof window === "undefined") return null;
    const userId = localStorage.getItem("fleetopsx_user_id");
    if (!userId) return null;
    // Prefer the full profile stored at login (partnerCompanyName, email, phone…)
    // — partner pages match trips against partnerCompanyName from here.
    const stored = getStoredUser<any>();
    const roles = stored?.roles ?? JSON.parse(localStorage.getItem("fleetopsx_roles") || "[]");
    return {
      ...stored,
      id: stored?.id || userId,
      roles,
      roleNames: stored?.roleNames ?? roles,
      name: stored?.name || localStorage.getItem("fleetopsx_user_name") || "Logged In User"
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

/**
 * Trip fields a caller may explicitly CLEAR with `null` (as opposed to leaving
 * alone with `undefined`). Needed whenever one role takes back a configuration
 * another role wrote — e.g. the TM clearing Fleet Ops' truck/driver/costs when
 * sending a mistaken dispatch back for re-assignment. `driverName` and
 * `truckReg` are NOT NULL columns, so those clear to "" instead.
 */
export type ClearableTripFields = {
  tailType?: string | null;
  tailNumber?: string | null;
  directCosts?: Trip["directCosts"] | null;
  dispatchedAt?: string | null;
  approvedAt?: string | null;
  partnerNote?: string | null;
  sendBackReason?: string | null;
};

export const tripService = {
  list: () => fetchApi('/trips').then((res: any[]) => res.map(mapTrip)).catch((err) => {
    // Surface in console so "empty list" bugs are diagnosable — callers still fail soft.
    console.warn("[tripService.list] failed:", err instanceof Error ? err.message : err);
    return [] as any[];
  }),
  // List-first: GET /trips/:id 404s/hangs behind some proxies (see live-api.ts) —
  // fall back to scanning the scoped /trips list before giving up.
  get: async (id: string) => {
    try {
      const all = await fetchApi('/trips').then((res: any[]) => res.map(mapTrip));
      const found = all.find((t) => t.id === id);
      if (found) return found;
    } catch {
      // fall through to direct get
    }
    return fetchApi(`/trips/${id}`).then(mapTrip);
  },
  // Normalize through tripToApi: defaults status to "Requested" (backend default
  // "Draft" is invisible in every queue) and maps loadingSite/consignee shapes.
  create: (data: Partial<Trip>) => fetchApi('/trips', { method: 'POST', body: JSON.stringify(tripToApi(data)) }).then(mapTrip),
  update: (id: string, updates: Omit<Partial<Trip>, keyof ClearableTripFields> & ClearableTripFields) => {
    // Sanitize payload for Prisma API which throws 500 on unknown fields
    const payload = { ...updates } as any;
    delete payload.headId;
    delete payload.tailId;
    delete payload.driverId;
    delete payload.totalCosts;
    delete payload.eta;
    delete payload.progress;
    
    // NOTE: lifecycle notifications (request/assign/depart/return) are generated
    // server-side with role targeting — do not duplicate them client-side.
    return fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(mapTrip);
  },
  updateTrip: (id: string, payload: Partial<Trip>) => tripService.update(id, payload),
  assignResource: (id: string, updates: Partial<Trip>) => tripService.update(id, updates),
  setStatus: (id: string, status: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(mapTrip),
  delete: (id: string) => fetchApi(`/trips/${id}`, { method: 'DELETE' }),
  summary: () => fetchApi('/dashboard/overview'),
  initialApprove: (id: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Approved' }) }),
  approveDispatch: (id: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Scheduled' }) }),
  updateStatus: (id: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'En Route' }) }),
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
  submitCustomerOrder: (payload: any) => {
    const apiPayload = {
      ...payload,
      loadingSite: Array.isArray(payload.loadingSite) ? payload.loadingSite.join(', ') : payload.loadingSite,
      driverName: "Unassigned",
      truckReg: "Unassigned",
      status: "Requested"
    };
    delete apiPayload.loadingRoutingType;
    return fetchApi('/trips', { method: 'POST', body: JSON.stringify(apiPayload) });
  }
};

export const fuelService = {
  list: () => fetchApi('/fuel'),
  // Backend exposes PATCH /fuel/:id only — status transitions go through it
  // (server auto-creates the expense row on Approved).
  approve: (id: string) => fetchApi(`/fuel/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Approved' }) }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Approved', body: `Requisition ${id.substring(0,6)} has been approved.`, category: 'Approvals' });
    return res;
  }),
  reject: (id: string) => fetchApi(`/fuel/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Rejected' }) }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Rejected', body: `Requisition ${id.substring(0,6)} was rejected.`, category: 'Operations' });
    return res;
  }),
};

const WO_NEXT_STATUS: Record<string, string> = {
  Reported: 'In Progress',
  'In Progress': 'Repaired',
  Repaired: 'Repaired',
};

export const engineeringService = {
  // Backend routes are plain /work-orders (no /engineering prefix, no /advance or /repair).
  listWorkOrders: () => fetchApi('/work-orders').then((res: any[]) => res.map(mapWorkOrder)),
  createDefect: (input: any) => fetchApi('/work-orders', { method: 'POST', body: JSON.stringify({
    truckReg: input.truckReg,
    defect: input.defect,
    priority: input.priority || 'Medium',
    status: 'Reported',
  }) }).then(res => {
    const wo = mapWorkOrder(res);
    notificationService.create({ title: 'New Work Order', body: `Defect reported for truck ${input.truckReg}.`, category: 'Engineering' });
    return wo;
  }),
  advance: async (id: string) => {
    const orders = await fetchApi('/work-orders').then((res: any[]) => res.map(mapWorkOrder)).catch(() => []);
    const current = orders.find((w) => w.id === id);
    const next = WO_NEXT_STATUS[current?.status ?? 'Reported'] ?? 'In Progress';
    return fetchApi(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }).then(mapWorkOrder);
  },
  logRepair: (truckReg: string, defect: string, category: string, amount: number) =>
    // Repairs are recorded as an expense row (server model has no repair ledger).
    fetchApi('/expenses', { method: 'POST', body: JSON.stringify({
      requester: 'Engineering',
      department: 'Engineering / Workshop',
      type: 'Repairs',
      category: category || 'Repairs',
      amount: Number(amount) || 0,
      description: `Repair — ${truckReg}: ${defect}`,
      status: 'Approved',
    }) }).then(res => {
      notificationService.create({ title: 'Repair Logged', body: `Repair logged for ${truckReg} (${defect}).`, category: 'Engineering' });
      return res;
    })
};

export const inventoryService = {
  list: () => fetchApi('/inventory'),
  // Backend route is /inventory-requisitions (hyphenated).
  requisitions: () => fetchApi('/inventory-requisitions'),
  release: (itemId: string, qty: number, reqId?: string) => fetchApi(`/inventory/${itemId}/release`, { method: 'POST', body: JSON.stringify({ qty, reqId }) }).then(res => {
    notificationService.create({ title: 'Parts Released', body: `${qty} units released from inventory.`, category: 'Engineering' });
    return res;
  }),
  // No /reorder sub-route — reorderLevel is a plain field on PATCH /inventory/:id.
  updateReorderLevel: (itemId: string, level: number) => fetchApi(`/inventory/${itemId}`, { method: 'PATCH', body: JSON.stringify({ reorderLevel: level }) })
};

export const procurementService = {
  list: () => fetchApi('/procurement'),
  // Backend expects PATCH /procurement/:id { status: 'Procured' } (no /procure sub-route).
  markProcured: (id: string) => fetchApi(`/procurement/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Procured' }) }).then(res => {
    notificationService.create({ title: 'Items Procured', body: `Procurement request ${id.substring(0,6)} fulfilled.`, category: 'Compliance' });
    return res;
  })
};

// No /compliance endpoints exist server-side yet — fail soft so pages render empty
// instead of crashing on 404.
export const complianceService = {
  getVehicleDocs: () => fetchApi('/compliance/vehicles').catch(() => []),
  getDriverDocs: () => fetchApi('/compliance/drivers').catch(() => [])
};

export const depreciationService = {
  getAssetDepreciation: () => fetchApi('/depreciation/assets').catch(() => [])
};

export const accountService = {
  list: () => fetchApi('/expenses').then((res: any[]) => res.map(mapExpense)),
  // No GET /expenses/:id on the backend — resolve from the list.
  get: async (id: string) => {
    const expenses = await accountService.list().catch(() => []);
    const found = expenses.find((e) => e.id === id);
    if (found) return found;
    return fetchApi(`/expenses/${id}`).then(mapExpense);
  },
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
  // `audience` (comma-separated roles / 'Partner:<Company>') scopes who receives
  // it. Omitted = broadcast to EVERY user, partners included — only use that for
  // genuinely company-wide news.
  create: (payload: { title: string; body: string; category: string; severity?: string; audience?: string }) => 
    fetchApi('/notifications', { method: 'POST', body: JSON.stringify({ ...payload, severity: payload.severity || 'info' }) }).catch(() => {})
};

export const auditService = { list: () => fetchApi('/audit') };

export const adminService = {
  tenant: () => fetchApi('/tenants').then(res => res[0]),
  users: () => fetchApi('/users').catch(() => []),
  roles: () => fetchApi('/admin/roles').catch(() => []), // Local mock if needed
  loginReports: () => fetchApi('/login-reports'),
  createUser: (payload: any) => fetchApi('/users', { method: 'POST', body: JSON.stringify(payload) }),
  // Server generates + returns a fresh temp password ({ tempPassword }) when resetPassword flag is set
  resetPassword: (userId: string) =>
    fetchApi<{ tempPassword?: string }>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ resetPassword: true }) }),
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

/**
 * Global search, wired client-side from live lists. The backend has no /search
 * endpoint (404 in production), so we fan out to the same-origin APIs the app
 * already uses and map hits into SearchHit groups. Each leg fails soft.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [trips, heads, drivers, expenses] = await Promise.all([
    fetchApi("/trips", { softAuth: true }).then(asList).catch(() => []),
    fetchApi("/trucks", { softAuth: true }).then(asList).catch(() => []),
    fetchApi("/drivers", { softAuth: true }).then(asList).catch(() => []),
    fetchApi("/expenses", { softAuth: true }).then(asList).catch(() => []),
  ]);

  const hits: SearchHit[] = [];
  const push = (group: string, label: string, meta: string, to: string, params?: Record<string, string>) => {
    if (hits.length < 24) hits.push({ group, label, meta, to, params });
  };

  for (const raw of trips as Record<string, unknown>[]) {
    const t = mapTrip(raw);
    const id = displayRequestId(t);
    const hay = `${id} ${t.customer ?? ""} ${t.customerConsignee ?? ""} ${t.cargo ?? ""} ${t.dropoff ?? ""}`.toLowerCase();
    if (hay.includes(q)) push("Trips", id, [t.customer, t.dropoff].filter(Boolean).join(" → "), "/workspace/app/dispatch-history");
  }
  for (const raw of heads as Record<string, unknown>[]) {
    const h = mapTruckHead(raw);
    const hay = `${h.number} ${h.capNumber ?? ""} ${h.registration} ${h.make}`.toLowerCase();
    if (hay.includes(q)) push("Fleet", h.number, h.registration, "/workspace/app/fleet-registry");
  }
  for (const raw of drivers as Record<string, unknown>[]) {
    const d = mapDriver(raw);
    const hay = `${d.name} ${d.employeeId} ${d.phone ?? ""}`.toLowerCase();
    if (hay.includes(q)) push("Drivers", d.name, d.employeeId, "/workspace/app/hr");
  }
  for (const raw of expenses as Record<string, unknown>[]) {
    const e = mapExpense(raw);
    const hay = `${e.id} ${e.requester} ${e.type}`.toLowerCase();
    if (hay.includes(q)) push("Expenses", e.id, e.requester, "/workspace/app/accounts");
  }
  return hits;
}

export const formatNaira = (n: number) =>
  `\u20A6${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString("en-NG")}`;
export const formatNairaFull = (n: number) => `\u20A6${n.toLocaleString("en-NG")}`;
