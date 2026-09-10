/**
 * Live API mappers + calls for Hetzner FleetOpsX backend.
 */
import { api, allowMockFallback, setToken, clearSession, setStoredUser } from "./apiClient";
import type {
  Driver,
  Expense,
  ExpenseStatus,
  GateEntry,
  Trip,
  TripStatus,
  TruckHead,
  User,
  WorkOrder,
  WorkOrderStatus,
} from "./types";

export type LoginResponse = {
  token: string;
  user: User & { roles?: string[]; role?: string };
};

function asList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

export function mapTruckHead(t: Record<string, unknown>): TruckHead {
  const statusRaw = String(t.status ?? "Available");
  const status: TruckHead["status"] =
    statusRaw === "Active" || statusRaw === "Available"
      ? "Available"
      : statusRaw === "Assigned" ||
          statusRaw === "In Transit" ||
          statusRaw === "Maintenance" ||
          statusRaw === "Out of Service"
        ? statusRaw
        : "Out of Service";

  return {
    id: String(t.id ?? t.cabId ?? ""),
    number: String(t.cabId ?? t.number ?? t.id ?? ""),
    capNumber: t.capNumber ? String(t.capNumber) : undefined,
    registration: String(t.registration ?? ""),
    make: String(t.category ?? t.make ?? "Unknown"),
    year: Number(t.year ?? 2024),
    status,
    location: String(t.destination ?? t.location ?? "Depot"),
    odometer: Number(t.odometer ?? 0),
    standardEfficiency: Number(t.standardEfficiency ?? 0),
    lat: Number(t.lat ?? 6.5244),
    lng: Number(t.lng ?? 3.3792),
  };
}

export function mapDriver(d: Record<string, unknown>): Driver {
  const name = String(d.name ?? "");
  const statusRaw = String(d.status ?? "Available");
  const status: Driver["status"] =
    statusRaw === "Active" || statusRaw === "Available"
      ? "Available"
      : statusRaw === "On Trip" || statusRaw === "Off Duty" || statusRaw === "Suspended"
        ? statusRaw
        : "Available";

  return {
    id: String(d.id ?? d.employeeId ?? d.staffId ?? ""),
    name,
    employeeId: String(d.employeeId ?? d.staffId ?? d.id ?? ""),
    salaryNumber: d.salaryNumber ? String(d.salaryNumber) : undefined,
    phone: String(d.phone ?? ""),
    department: String(d.department ?? "Transport Operations"),
    dateJoined: String(d.dateJoined ?? d.createdAt ?? ""),
    licenseNumber: String(d.licenseNumber ?? d.license ?? ""),
    licenseCategory: String(d.licenseCategory ?? d.category ?? "Professional"),
    licenseExpiry: String(d.licenseExpiry ?? ""),
    compliance: (d.compliance as Driver["compliance"]) || "Valid",
    experienceYears: Number(d.experienceYears ?? 0),
    status,
    assignedTruck: d.truckReg || d.assignedTruck ? String(d.truckReg ?? d.assignedTruck) : null,
    currentTripId: d.currentTripId ? String(d.currentTripId) : null,
    tripsCompleted: Number(d.tripsCompleted ?? 0),
    safetyScore: Number(d.safetyScore ?? 100),
    initials:
      name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "—",
  };
}

export function mapTrip(t: Record<string, unknown>): Trip {
  const statusRaw = String(t.status ?? "Scheduled");
  const known: TripStatus[] = [
    "Requested",
    "Awaiting Approval",
    "Scheduled",
    "En Route",
    "Loaded",
    "Offloading",
    "Returning",
    "Delayed",
    "Completed",
    "Stopped",
  ];
  const status = (known.includes(statusRaw as TripStatus) ? statusRaw : "Scheduled") as TripStatus;
  const loadingSite = t.loadingSite;
  return {
    id: String(t.id ?? ""),
    customer: String(t.customer ?? t.customerConsignee ?? "Petroline Partner"),
    customerConsignee: t.customerConsignee ? String(t.customerConsignee) : undefined,
    cargo: String(t.cargo ?? ""),
    pickup: String(t.pickup ?? ""),
    loadingSite: Array.isArray(loadingSite)
      ? loadingSite.map(String)
      : loadingSite
        ? [String(loadingSite)]
        : undefined,
    loadingRoutingType: (t.loadingRoutingType as Trip["loadingRoutingType"]) || "Single",
    dropoff: String(t.dropoff ?? ""),
    headId: t.headId ? String(t.headId) : undefined,
    tailId: t.tailId ? String(t.tailId) : undefined,
    tailType: t.tailType ? String(t.tailType) : undefined,
    tailNumber: t.tailNumber ? String(t.tailNumber) : undefined,
    truckReg: t.truckReg ? String(t.truckReg) : undefined,
    driverId: t.driverId ? String(t.driverId) : undefined,
    driverName: t.driverName ? String(t.driverName) : undefined,
    directCosts: (t.directCosts as Trip["directCosts"]) || undefined,
    status,
    priority: (t.priority as Trip["priority"]) || "Normal",
    distanceKm: Number(t.distanceKm ?? 0),
    durationLabel: String(t.durationLabel ?? "—"),
    scheduledDate: String(t.scheduledDate ?? t.createdAt ?? new Date().toISOString()),
    startTime: String(t.startTime ?? "—"),
    eta: String(t.eta ?? "—"),
    progress: Number(t.progress ?? 4),
    lat: Number(t.lat ?? 6.5244),
    lng: Number(t.lng ?? 3.3792),
    revenue: Number(t.revenue ?? 0),
    totalCosts: t.totalCosts != null ? Number(t.totalCosts) : undefined,
    grossMargin: t.grossMargin != null ? Number(t.grossMargin) : undefined,
  };
}

export function tripToApi(input: Partial<Trip>): Record<string, unknown> {
  return {
    driverName: input.driverName || "Unassigned",
    truckReg: input.truckReg || input.headId || "TBD",
    tailType: input.tailType || null,
    pickup: input.pickup || "",
    dropoff: input.dropoff || "",
    customerConsignee: input.customerConsignee || input.customer || "Petroline Partner",
    cargo: input.cargo || "",
    loadingSite: Array.isArray(input.loadingSite) ? input.loadingSite.join(", ") : input.loadingSite || null,
    revenue: input.revenue ?? 0,
    status: input.status || "Requested",
    directCosts: input.directCosts || null,
  };
}

export function mapExpense(e: Record<string, unknown>): Expense {
  const typeRaw = String(e.type ?? e.category ?? "Other");
  const typeMap: Record<string, Expense["type"]> = {
    Toll: "Toll",
    Allowance: "Allowance",
    Fuel: "Fuel",
    Repairs: "Repairs",
    Logistics: "Logistics",
    Other: "Other",
    "Direct Cost": "Logistics",
    "Indirect Cost": "Other",
  };
  return {
    id: String(e.id ?? ""),
    type: typeMap[typeRaw] || "Other",
    requester: String(e.requester ?? ""),
    amount: Number(e.amount ?? 0),
    standardRate: Number(e.standardRate ?? e.amount ?? 0),
    tripId: String(e.tripId ?? ""),
    status: (e.status as ExpenseStatus) || "Pending",
    approvalLevel: String(e.approvalLevel ?? e.department ?? "Accounts"),
    date: String(e.date ?? e.createdAt ?? ""),
    documents: Array.isArray(e.documents) ? e.documents.map(String) : [],
  };
}

export function mapWorkOrder(w: Record<string, unknown>): WorkOrder {
  return {
    id: String(w.id ?? ""),
    truckReg: String(w.truckReg ?? ""),
    defect: String(w.defect ?? ""),
    category: String(w.category ?? "General"),
    priority: (w.priority as WorkOrder["priority"]) || "Medium",
    mechanic: String(w.mechanic ?? "Unassigned"),
    status: (w.status as WorkOrderStatus) || "Reported",
    reportedBy: String(w.reportedBy ?? "System"),
    reportedAt: String(w.reportedAt ?? w.createdAt ?? ""),
    cost: Number(w.cost ?? 0),
  };
}

export function mapGateEntry(g: Record<string, unknown>): GateEntry {
  const type = String(g.type ?? g.direction ?? "Entry");
  const direction: GateEntry["direction"] =
    type === "Exit" || type === "Outgoing" ? "Outgoing" : "Incoming";
  return {
    id: String(g.id ?? ""),
    time: String(g.time ?? g.timestamp ?? ""),
    asset: String(g.asset ?? g.truckReg ?? ""),
    driver: String(g.driver ?? ""),
    direction,
    purpose: String(g.purpose ?? ""),
    yard: String(g.yard ?? "Main Yard"),
    cargo: String(g.cargo ?? "—"),
    officer: String(g.officer ?? "Gate"),
    reference: String(g.reference ?? g.id ?? ""),
  };
}

export function normalizeUser(user: User & { roles?: string[]; role?: string }): User {
  const roles = (user.roles?.length ? user.roles : user.role ? [user.role] : []) as User["roles"];
  // Platform Admin should also open the Petroline ops dashboard
  const withOps =
    roles.includes("Platform Admin") && !roles.includes("Transport Manager")
      ? ([...roles, "Transport Manager"] as User["roles"])
      : roles;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username || user.email,
    roles: withOps,
    roleNames: user.roleNames?.length ? user.roleNames : withOps,
    department: user.department || withOps[0] || "Operations",
    status: user.status || "Active",
    passwordResetRequired: user.passwordResetRequired,
    lastActive: user.lastActive || "Just now",
    initials:
      user.initials ||
      user.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    companyId: user.companyId || "tnt_001",
    partnerCompanyName: user.partnerCompanyName,
  };
}

export async function liveLogin(username: string, password: string): Promise<LoginResponse> {
  const body = { email: username, username, password };
  try {
    const result = await api.post<LoginResponse>("/auth/login", body);
    return { ...result, user: normalizeUser(result.user) };
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404) {
      const result = await api.post<LoginResponse>("/login", body);
      return { ...result, user: normalizeUser(result.user) };
    }
    throw err;
  }
}

export async function liveListTrucks(): Promise<TruckHead[]> {
  return asList(await api.get("/trucks")).map(mapTruckHead);
}

export async function liveCreateTruck(body: Record<string, unknown>): Promise<TruckHead> {
  const payload = {
    cabId: body.cabId || body.number || `CAB-${Date.now().toString().slice(-6)}`,
    registration: body.registration,
    category: body.category || body.make || null,
    destination: body.destination || body.location || null,
    status: body.status || "Active",
  };
  return mapTruckHead(await api.post("/trucks", payload));
}

export async function liveUpdateTruck(id: string, body: Record<string, unknown>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.registration != null) payload.registration = body.registration;
  if (body.make != null || body.category != null) payload.category = body.category || body.make;
  if (body.location != null || body.destination != null) payload.destination = body.destination || body.location;
  if (body.status != null) {
    payload.status = body.status === "Available" ? "Active" : body.status;
  }
  if (body.number != null || body.cabId != null) payload.cabId = body.cabId || body.number;
  await api.patch(`/trucks/${id}`, payload);
}

export async function liveDeleteTruck(id: string): Promise<void> {
  await api.delete(`/trucks/${id}`);
}

export async function liveListDrivers(): Promise<Driver[]> {
  return asList(await api.get("/drivers")).map(mapDriver);
}

export async function liveCreateDriver(body: Record<string, unknown>): Promise<Driver> {
  const payload = {
    staffId: body.staffId || body.employeeId || `PTL-${Date.now().toString().slice(-6)}`,
    name: body.name,
    phone: body.phone || null,
    truckReg: body.truckReg || body.assignedTruck || null,
    category: body.category || body.licenseCategory || null,
    status: body.status || "Active",
  };
  return mapDriver(await api.post("/drivers", payload));
}

export async function liveUpdateDriver(id: string, body: Record<string, unknown>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.name != null) payload.name = body.name;
  if (body.phone != null) payload.phone = body.phone;
  if (body.assignedTruck != null || body.truckReg != null) payload.truckReg = body.truckReg || body.assignedTruck;
  if (body.licenseCategory != null || body.category != null) payload.category = body.category || body.licenseCategory;
  if (body.status != null) {
    payload.status = body.status === "Available" ? "Active" : body.status;
  }
  if (body.employeeId != null || body.staffId != null) payload.staffId = body.staffId || body.employeeId;
  await api.patch(`/drivers/${id}`, payload);
}

export async function liveDeleteDriver(id: string): Promise<void> {
  await api.delete(`/drivers/${id}`);
}

export async function liveListTrips(): Promise<Trip[]> {
  return asList(await api.get("/trips")).map(mapTrip);
}

export async function liveGetTrip(id: string): Promise<Trip | null> {
  try {
    return mapTrip((await api.get(`/trips/${id}`)) as Record<string, unknown>);
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404) return null;
    throw err;
  }
}

export async function liveCreateTrip(body: Partial<Trip>): Promise<Trip> {
  return mapTrip(await api.post("/trips", tripToApi(body)));
}

export async function liveUpdateTrip(id: string, body: Partial<Trip>): Promise<Trip> {
  return mapTrip(await api.patch(`/trips/${id}`, tripToApi(body)));
}

export async function liveDeleteTrip(id: string): Promise<void> {
  await api.delete(`/trips/${id}`);
}

export async function liveListExpenses(): Promise<Expense[]> {
  return asList(await api.get("/expenses")).map(mapExpense);
}

export async function liveCreateExpense(body: Record<string, unknown>): Promise<Expense> {
  return mapExpense(
    await api.post("/expenses", {
      requester: body.requester || "Ops",
      department: body.department || body.approvalLevel || "Accounts",
      type: body.type || "Other",
      category: body.category || body.type || "Other",
      amount: Number(body.amount ?? 0),
      description: body.description || `Expense for ${body.tripId || "ops"}`,
      status: body.status || "Pending",
    }),
  );
}

export async function liveUpdateExpense(id: string, body: Record<string, unknown>): Promise<Expense> {
  return mapExpense(await api.patch(`/expenses/${id}`, body));
}

export async function liveListWorkOrders(): Promise<WorkOrder[]> {
  return asList(await api.get("/work-orders")).map(mapWorkOrder);
}

export async function liveCreateWorkOrder(body: Record<string, unknown>): Promise<WorkOrder> {
  return mapWorkOrder(
    await api.post("/work-orders", {
      truckReg: body.truckReg,
      defect: body.defect,
      priority: body.priority || "Medium",
      status: body.status || "Reported",
    }),
  );
}

export async function liveUpdateWorkOrder(id: string, body: Record<string, unknown>): Promise<WorkOrder> {
  return mapWorkOrder(await api.patch(`/work-orders/${id}`, body));
}

export async function liveListGate(): Promise<GateEntry[]> {
  return asList(await api.get("/gate")).map(mapGateEntry);
}

export async function liveCreateGate(entry: Partial<GateEntry>): Promise<GateEntry> {
  return mapGateEntry(
    await api.post("/gate", {
      type: entry.direction === "Outgoing" ? "Exit" : "Entry",
      truckReg: entry.asset || "",
      driver: entry.driver || "",
      purpose: entry.purpose || "",
      status: "Logged",
    }),
  );
}

export function applyLoginSession(token: string, user: User & { roles?: string[]; role?: string }) {
  const normalized = normalizeUser(user);
  setToken(token);
  setStoredUser(normalized);
  if (typeof window === "undefined") return;
  localStorage.setItem("fleetopsx_user_id", normalized.id);
  localStorage.setItem("fleetopsx_roles", JSON.stringify(normalized.roles));
}

export function logoutLive() {
  clearSession();
}

export { allowMockFallback };
