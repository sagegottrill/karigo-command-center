import type {
  Driver, Expense, ExpenseStatus, GateEntry, InventoryItem,
  ProcurementRequest, Trip, TimelineStep, TruckHead, TruckTail, Company, PlatformTenant, User,
  // Named: the DOM has a global `Notification` too, and an unqualified reference
  // silently resolves to the browser's constructor instead of our model.
  Notification as NotificationRecord, NotificationSummary as NotificationSummaryRecord,
} from "./types";
import { getTenantSlug } from "./hostname";
import { fetchApi, setToken, setStoredUser, clearSession, getStoredUser } from "./apiClient";
import { mapTrip, mapDriver, mapExpense, mapWorkOrder, mapTruckHead, mapTail, asList, tripToApi, mapFuel, mapInventoryItem, mapInventoryRequisition, mapInventoryMovement } from "./live-api";
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

/**
 * Lubricant module — inventory, restock and disbursal.
 *
 * The department hands diesel/gas to a dispatch. Every figure that involves
 * money comes back from the server already computed against the Transport
 * Manager's price per litre, so no screen here ever sends a cost.
 */
export const lubricantService = {
  overview: () =>
    fetchApi<import('./lubricant').LubricantOverview>('/lubricant/overview'),
  restocks: () =>
    fetchApi<import('./lubricant').LubricantRestock[]>('/lubricant/restocks').then((res) => asList(res as any) as any),
  /**
   * A delivery into the tank. `unitCost` is what it actually cost per litre —
   * the tank's value is measured from the last delivery that carried one, so a
   * restock without a price leaves the tank valued at the TM's own rate.
   */
  restock: (input: { fuelType: "Diesel" | "Gas"; quantity: number; loggedBy: string; unitCost?: number }) =>
    fetchApi<{ reference: string; stock?: any }>('/lubricant/restocks', { method: 'POST', body: JSON.stringify(input) }),
  /**
   * The Transport Manager releasing litres to a dispatch.
   *
   * This is the authorization the pump enforces: the department cannot dispense
   * more than he released, and a dispatch he has not released shows on his board
   * as awaiting his decision.
   */
  authorize: (tripId: string, litres: number, by: string) =>
    fetchApi<{ ok: boolean }>('/lubricant/approvals', {
      method: 'POST',
      body: JSON.stringify({ tripId, litres, by }),
    }),
  revokeApproval: (tripId: string) =>
    fetchApi<{ ok: boolean }>('/lubricant/approvals', {
      method: 'POST',
      body: JSON.stringify({ tripId, revoke: true }),
    }),
  requests: () =>
    fetchApi<import('./lubricant').LubricantRequestRow[]>('/lubricant/requests').then((res) => asList(res as any) as any),
  disbursals: () =>
    fetchApi<import('./lubricant').LubricantDisbursalRow[]>('/lubricant/disbursals').then((res) => asList(res as any) as any),
  /**
   * The Transport Manager endorsing (or flagging) one logged dispense.
   *
   * The department's entry is a fact the moment it is pumped; this is the
   * owner of the money accepting it — so a wrong figure is corrected by a
   * decision on the record, never by quietly editing history.
   */
  reviewDisbursal: (id: string, status: "Pending" | "Approved" | "Declined", note?: string) =>
    fetchApi<import('./lubricant').LubricantDisbursalRow>(`/lubricant/disbursals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),
  disburse: (input: { tripId: string; fuelType: "Diesel" | "Gas"; quantity: number; dispensedBy: string; signature?: string }) =>
    fetchApi<{ reference: string; amount: number; quantity: number; stock?: any }>('/lubricant/disbursals', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  notifications: () =>
    fetchApi<import('./lubricant').LubricantFeedItem[]>('/lubricant/notifications').then((res) => asList(res as any) as any),
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
    // Scoped to staff: a partner has never been told the yard owns a new truck,
    // and an unaddressed row goes to every user on the platform.
    notificationService.create({
      title: 'New Asset Added',
      body: `Truck ${input.registration} has been added to the fleet.`,
      category: 'Operations',
      module: 'Fleet Operations',
      audience: 'Fleet Operations,Transport Manager,Platform Admin',
      refLabel: input.registration,
    });
    return res;
  }),
  createTail: (input: any) => fetchApi('/tails', { method: 'POST', body: JSON.stringify(input) }).then(res => {
    notificationService.create({
      title: 'New Asset Added',
      body: `Tail ${input.number} has been added to the fleet.`,
      category: 'Operations',
      module: 'Fleet Operations',
      audience: 'Fleet Operations,Transport Manager,Platform Admin',
      refLabel: input.number,
    });
    return res;
  }),
  /**
   * Fleet-asset bookkeeping is INTERNAL, and it is the registry's own record.
   *
   * Two things were wrong with what this used to send: the body named the asset
   * by a fragment of its database id ("Truck 5f28ca status changed") that no
   * human can read, and the Transport Manager was copied on every flip — 455 of
   * his rows were this one event, burying the queues he actually works. The
   * registry board already shows him asset state, so the row now goes to the
   * department that keeps the register, and it names the plate or tail code.
   */
  updateHeadStatus: (id: string, status: string, label?: string) => fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({
      title: 'Asset Status Changed',
      body: `Truck ${label || 'asset'} status changed to ${status}.`,
      category: 'Operations',
      module: 'Fleet Operations',
      audience: 'Fleet Operations,Platform Admin',
      refId: id,
      refLabel: label,
      eventKey: 'fleet.head_status',
    });
    return res;
  }),
  updateTailStatus: (id: string, status: string, label?: string) => fetchApi(`/tails/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(res => {
    notificationService.create({
      title: 'Asset Status Changed',
      body: `Tail ${label || 'asset'} status changed to ${status}.`,
      category: 'Operations',
      module: 'Fleet Operations',
      audience: 'Fleet Operations,Platform Admin',
      refId: id,
      refLabel: label,
      eventKey: 'fleet.tail_status',
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
  /**
   * The BODY a tail carries (Full Sided, Semi Sided, Flatbed Tail…). Recorded on
   * the asset so every assignment, tracking row and printout can show what is
   * actually being hitched up instead of one default word for the whole fleet.
   */
  setTailType: (id: string, type: string) =>
    fetchApi(`/tails/${id}`, { method: 'PATCH', body: JSON.stringify({ type }) }),
  /** A head's operating category (UPCOUNTRY, LOCAL, Pick Up, Short Body…). */
  setHeadCategory: (id: string, category: string) =>
    fetchApi(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify({ category }) }),
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
  /**
   * `closeDispatches` is the Transport Manager's absolute release: it ends any
   * open dispatch that still names the driver at the same moment he is freed, so
   * a cycle nobody closed can never leave a man invisible to the fleet desk.
   */
  update: (id: string, updates: Partial<Driver> & { closeDispatches?: boolean }) =>
    fetchApi(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then(mapDriver),
  delete: (id: string) => fetchApi(`/drivers/${id}`, { method: 'DELETE' }),
  /**
   * The licence document, attached and read on its own request — a staff list
   * must never carry the scans themselves.
   */
  attachLicence: (id: string, fileName: string, dataUrl: string) =>
    fetchApi<{ ok: boolean; licenseDocName?: string | null; licenseDocAt?: string | null }>(
      `/drivers/${id}/licence`,
      { method: 'POST', body: JSON.stringify({ fileName, dataUrl }) },
    ),
  readLicence: (id: string) =>
    fetchApi<{ fileName: string | null; attachedAt: string | null; dataUrl: string | null }>(
      `/drivers/${id}/licence`,
    ),
  removeLicence: (id: string) => fetchApi(`/drivers/${id}/licence`, { method: 'DELETE' }),
};

/**
 * Releasing a dispatch's assignment — ONE implementation for every way a
 * dispatch can die (TM declines the request, TM sends a mis-assigned dispatch
 * back to Fleet Ops).
 *
 * Before this existed, a dead request kept naming its truck, tail and driver
 * forever: the record still read "DGR183XA / B010 · Ahmadu Ali" while the vehicle
 * sat idle in the yard, so nothing told the next dispatcher it was free — and a
 * declined request still looked like a live trip in every view that reads the
 * trip record.
 */
export const assignmentReleaseService = {
  /**
   * Field-clear patch. driverName/truckReg are NOT NULL columns, so they empty
   * to "" — which is what every screen already reads as "unassigned".
   */
  clearedFields: (): Omit<Partial<Trip>, keyof ClearableTripFields> & ClearableTripFields => ({
    driverName: "",
    truckReg: "",
    tailType: null,
    tailNumber: null,
    directCosts: null,
  }),

  /**
   * Mark what a dispatch is HOLDING as Assigned — the other half of releasing.
   *
   * The register's "Assigned" was a status somebody typed by hand: assigning a
   * truck to a dispatch never moved it there, so a truck could sit on three live
   * dispatches and still read "Available", or read "Assigned" long after its
   * dispatch died. "Assigned" now means exactly what it says — a truck has been
   * assigned.
   *
   * Only an Available asset is claimed: a truck in the workshop, one just back
   * for check-up, or a blocked number is never silently dragged onto the road.
   * Returns a human list of what was taken, for the toast.
   */
  claimAssets: async (trip: Trip): Promise<string[]> => {
    const norm = (s: string) => s.replace(/\s/g, "").toUpperCase();
    const [plateRaw, tailCodeRaw] = String(trip.truckReg || "")
      .split("/")
      .map((part) => part.trim());
    const plate = (plateRaw ?? "").replace(/^unassigned$/i, "");
    const tailCode = (tailCodeRaw ?? "").replace(/^unassigned$/i, "");
    const claimed: string[] = [];
    const jobs: Promise<unknown>[] = [];

    const heads = await fleetService.listHeads().catch(() => [] as TruckHead[]);
    const head = plate
      ? heads.find((h) => norm(h.registration) === norm(plate) || norm(h.capNumber ?? "") === norm(plate))
      : undefined;
    if (head && head.status === "Available") {
      jobs.push(fleetService.updateHeadStatus(head.id, "Assigned"));
      claimed.push(`truck ${head.capNumber || head.registration}`);
    }

    const tails = await fleetService.listTails().catch(() => [] as TruckTail[]);
    const tail = tailCode ? tails.find((t) => norm(t.number) === norm(tailCode)) : undefined;
    if (tail && tail.status === "Available") {
      jobs.push(fleetService.updateTailStatus(tail.id, "Assigned"));
      claimed.push(`tail ${tail.number}`);
    }

    const heldByName = trip.driverName;
    if (heldByName && !/^unassigned$/i.test(heldByName)) {
      const drivers = await driverService.list().catch(() => [] as Driver[]);
      const driver = drivers.find((d) => norm(d.name) === norm(heldByName));
      if (driver && driver.status === "Available") {
        jobs.push(driverService.update(driver.id, { status: "On Trip" }));
        claimed.push(`driver ${driver.name}`);
      }
    }

    await Promise.allSettled(jobs);
    return claimed;
  },

  /**
   * Put whatever the dispatch was holding back on the board.
   * Only assets actually marked as held (Assigned / On Trip) are touched, so a
   * truck parked for maintenance or a driver who is Off Duty is never disturbed.
   * Returns a human list of what was freed, for the toast.
   */
  releaseAssets: async (trip: Trip): Promise<string[]> => {
    const norm = (s: string) => s.replace(/\s/g, "").toUpperCase();
    const [plateRaw, tailCodeRaw] = String(trip.truckReg || "")
      .split("/")
      .map((part) => part.trim());
    const plate = plateRaw ?? "";
    const tailCode = tailCodeRaw ?? "";
    const freed: string[] = [];
    const jobs: Promise<unknown>[] = [];

    // Never free a vehicle another LIVE dispatch is still running on. The same
    // truck legitimately appears on two records (a request that was declined and
    // a later one that was dispatched with it), and releasing the dead twin must
    // not take the truck off the road.
    const dead: string[] = ["Stopped", "Completed"];
    const live = await tripService.list().catch(() => [] as Trip[]);
    const stillHeldByAnotherTrip = (reg: string, driverName: string) =>
      live.some((t) => {
        if (t.id === trip.id || dead.includes(String(t.status))) return false;
        if (reg && norm(t.truckReg || "").includes(norm(reg))) return true;
        return Boolean(driverName) && norm(t.driverName || "") === norm(driverName);
      });

    const heads = await fleetService.listHeads().catch(() => [] as TruckHead[]);
    const head = plate
      ? heads.find((h) => norm(h.registration) === norm(plate) || norm(h.capNumber ?? "") === norm(plate))
      : undefined;
    if (head && head.status === "Assigned" && !stillHeldByAnotherTrip(plate, "")) {
      jobs.push(fleetService.updateHeadStatus(head.id, "Available"));
      freed.push(`truck ${plate}`);
    }

    const tails = await fleetService.listTails().catch(() => [] as TruckTail[]);
    const tail = tailCode ? tails.find((t) => norm(t.number) === norm(tailCode)) : undefined;
    if (tail && tail.status === "Assigned" && !stillHeldByAnotherTrip(tailCode, "")) {
      jobs.push(fleetService.updateTailStatus(tail.id, "Available"));
      freed.push(`tail ${tailCode}`);
    }

    const heldByName = trip.driverName;
    if (heldByName) {
      const drivers = await driverService.list().catch(() => [] as Driver[]);
      const driver = drivers.find((d) => norm(d.name) === norm(heldByName));
      if (driver && driver.status === "On Trip" && !stillHeldByAnotherTrip("", heldByName)) {
        jobs.push(driverService.update(driver.id, { status: "Available" }));
        freed.push(`driver ${driver.name}`);
      }
    }

    await Promise.allSettled(jobs);
    return freed;
  },
};

export const authService = {
  login: async (username: string, password?: string, department?: string) => {
    // The department picked on the sign-in form travels to the server: with a
    // shared username it decides WHICH account the credentials open, and the
    // server refuses an account that does not hold the picked department.
    const res = await fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, department }) });
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
    { key: "Loading", name: "Loading Operations", modules: [] },
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
  /** The return stamp — cleared when a closed trip has to be reopened. */
  eta?: string | null;
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
  /**
   * Security filing a truck that left BEFORE the app went live.
   *
   * The gate board only lists dispatches that exist, so a truck already on the
   * road could never be stamped out — and a return with nothing to attach to
   * left it "out of yard" for good. This files the departure it never got, so
   * the normal Log Return closes the circle (Completed, tail to Check Up,
   * driver freed).
   */
  backfillGateDeparture: (input: {
    plate: string;
    head?: string;
    tailNumber?: string;
    driverName?: string;
    customer?: string;
    dropoff?: string;
    leftAt?: string;
    note?: string;
  }) => fetchApi<{ ok: boolean; tripId: string; reference: string }>('/gate/backfill', { method: 'POST', body: JSON.stringify(input) }),
  /**
   * THE GATE'S RETURN, BY TRUCK.
   *
   * Security sees a truck, not a dispatch id — and for the fleet that left before
   * the app went live there may be no dispatch at all. Naming the truck is
   * enough: the server closes any open dispatch that names it (freeing the
   * driver), sets the truck to Check Up, and stamps the movement. Returns that
   * the gate used to have to work out by hand now happen in one action.
   */
  returnTruckToYard: (truck: string) =>
    fetchApi<{
      ok: boolean;
      truck: { id: string; capId: string; registration: string; status: string } | null;
      dispatchClosed: number;
      driversFreed: string[];
      stamp: string;
    }>('/gate/return', { method: 'POST', body: JSON.stringify({ truck }) }),
  update: (id: string, updates: Omit<Partial<Trip>, keyof ClearableTripFields> & ClearableTripFields) => {
    // Sanitize payload for Prisma API which throws 500 on unknown fields
    const payload = { ...updates } as any;
    delete payload.headId;
    delete payload.tailId;
    delete payload.driverId;
    delete payload.totalCosts;
    // `eta` is deliberately NOT stripped any more: it is the RETURN stamp the
    // trip stores when the truck comes back, and deleting it here meant Security's
    // Log Return — and the Tracking department's own end-of-trip action — could
    // never record when the circle closed. `progress` is still a UI-only value.
    delete payload.progress;
    // The app models loading sites as a list, but Trip.loadingSite is a STRING
    // column. Sending the raw array made the API reject the whole write, so a
    // partner correcting a multi-site request failed with no way to succeed.
    // Normalise here so every caller (partner correction, TM edit) is safe.
    if (Array.isArray(payload.loadingSite)) payload.loadingSite = payload.loadingSite.join(", ");
    // The destination ADDRESS is optional: sent empty it means "cleared", so store
    // null rather than an empty string every screen then has to special-case.
    if (payload.dropoffAddress !== undefined) {
      payload.dropoffAddress = String(payload.dropoffAddress ?? "").trim() || null;
    }
    
    // NOTE: lifecycle notifications (request/assign/depart/return) are generated
    // server-side with role targeting — do not duplicate them client-side.
    return fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then(mapTrip);
  },
  updateTrip: (id: string, payload: Partial<Trip>) => tripService.update(id, payload),
  assignResource: (id: string, updates: Partial<Trip>) => tripService.update(id, updates),
  setStatus: (id: string, status: string) => fetchApi(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(mapTrip),
  delete: (id: string) => fetchApi(`/trips/${id}`, { method: 'DELETE' }),
  /**
   * The Transport Manager's decision on a dispatch's direct-cost voucher.
   *
   * The voucher is the dispatch's own cost sheet — trip allowance, waybill,
   * motor boy, tickets, contingency, bonus — so the decision is recorded beside
   * those figures rather than in a ledger of its own that could drift from them.
   */
  reviewVoucher: (id: string, status: 'Pending' | 'Approved' | 'Declined', note?: string) =>
    fetchApi<{ ok: boolean; voucher: { status: string; by: string; at: string } | null }>(
      `/trips/${id}/voucher`,
      { method: 'POST', body: JSON.stringify({ status, note }) },
    ),
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

/**
 * A partner company's OWN loading sites (the list the request form offers).
 *
 * The backend owns the list: it is stored on the company's account, so every
 * account of one company sees the same sites and a site typed on one login is
 * offered on the next. A partner with no sites simply gets an empty list and
 * adds the first one through the form.
 */
export const partnerSiteService = {
  list: (company?: string) =>
    fetchApi<{ company: string | null; sites: string[] }>(
      company ? `/partner-sites?company=${encodeURIComponent(company)}` : "/partner-sites",
    ).then((res) => (Array.isArray(res?.sites) ? res.sites : [])),

  add: (name: string, company?: string) =>
    fetchApi<{ company: string | null; sites: string[]; added: boolean }>("/partner-sites", {
      method: "POST",
      body: JSON.stringify({ name, company }),
    }),

  // Returns the list that remains, like `list()` — callers set state straight
  // from it instead of re-fetching and hoping the two agree.
  remove: (name: string, company?: string) =>
    fetchApi<{ company: string | null; sites: string[] }>(
      `/partner-sites?name=${encodeURIComponent(name)}${company ? `&company=${encodeURIComponent(company)}` : ""}`,
      { method: "DELETE" },
    ).then((res) => (Array.isArray(res?.sites) ? res.sites : [])),
};

export const fuelService = {
  /**
   * Mapped, not raw: the odometer reading on a fuel record is what turns
   * maintenance spend into a cost per kilometre, and the raw row is untyped
   * (every column a string). Reading it untyped is how a distance becomes NaN.
   */
  list: () => fetchApi<unknown[]>('/fuel').then((res) => asList(res as any).map(mapFuel)),
  // Backend exposes PATCH /fuel/:id only — status transitions go through it
  // (server auto-creates the expense row on Approved).
  approve: (id: string) => fetchApi(`/fuel/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Approved' }) }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Approved', body: `Requisition ${id.substring(0,6)} has been approved.`, category: 'Approvals', module: 'Fuel & Lubricant', audience: 'Fleet Operations,Transport Manager,Platform Admin' });
    return res;
  }),
  reject: (id: string) => fetchApi(`/fuel/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Rejected' }) }).then(res => {
    notificationService.create({ title: 'Fuel Requisition Rejected', body: `Requisition ${id.substring(0,6)} was rejected.`, category: 'Operations', module: 'Fuel & Lubricant', audience: 'Fleet Operations,Transport Manager,Platform Admin' });
    return res;
  }),
};

/**
 * The workshop pipeline, in the order a job actually moves through it.
 *
 * This used to be `Reported → In Progress → Repaired` — two states the workshop
 * does not have, which is why every advance landed the row on a status the type
 * never declared and the board could not read.
 */
export const WORK_ORDER_FLOW = ['Reported', 'Diagnosing', 'Awaiting Parts', 'Repairing', 'Testing', 'Completed'] as const;

/** The next step in the pipeline, or null once the job is closed. */
export function nextWorkOrderStatus(status: string): string | null {
  const at = (WORK_ORDER_FLOW as readonly string[]).indexOf(status);
  if (at < 0) return 'Diagnosing';
  return at >= WORK_ORDER_FLOW.length - 1 ? null : (WORK_ORDER_FLOW[at + 1] ?? null);
}

export const engineeringService = {
  // Backend routes are plain /work-orders (no /engineering prefix, no /advance).
  listWorkOrders: () =>
    fetchApi('/work-orders').then((res: any[]) => asList(res).map(mapWorkOrder)),

  // Every column the workshop record actually holds. `truckReg` is the truck's
  // PLATE, so the Transport Manager's fleet audit can match a check-up to the
  // registry row it belongs to.
  createWorkOrder: (input: any) =>
    fetchApi('/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        truckReg: input.truckReg,
        defect: input.defect,
        category: input.category || 'General',
        priority: input.priority || 'Medium',
        mechanic: input.mechanic || '',
        reportedBy: input.reportedBy || '',
        cost: Number(input.cost) || 0,
        notes: input.notes || '',
        status: 'Reported',
      }),
    }).then((res: any) => {
      const wo = mapWorkOrder(res);
      void notificationService
        .create({
          title: 'New Work Order',
          body: `${wo.truckReg} reported to Engineering — ${wo.defect}.`,
          category: 'Engineering',
          // Without an audience the row went to every user on the platform —
          // partners were told which truck was in the workshop and why.
          module: 'Engineering',
          audience: 'Engineering,Parts & Store,Transport Manager,Platform Admin',
          eventKey: 'engineering.work_order_raised',
          refId: wo.id,
          refLabel: wo.truckReg,
        })
        .catch(() => {});
      return wo;
    }),

  updateWorkOrder: (id: string, updates: Record<string, unknown>) =>
    fetchApi(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then((res: any) =>
      mapWorkOrder(res),
    ),

  /** Move one step down the pipeline, stamping the stage's own timestamp. */
  advance: async (order: { id: string; status: string }) => {
    const next = nextWorkOrderStatus(order.status);
    if (!next) return null;
    const stamp: Record<string, unknown> = { status: next };
    if (next === 'Diagnosing') stamp.startedAt = new Date().toISOString();
    if (next === 'Completed') stamp.completedAt = new Date().toISOString();
    return engineeringService.updateWorkOrder(order.id, stamp);
  },

  /** Close the job out — the truck's check-up date is this moment. */
  complete: (id: string, cost?: number, mechanic?: string) =>
    engineeringService.updateWorkOrder(id, {
      status: 'Completed',
      completedAt: new Date().toISOString(),
      ...(cost === undefined ? {} : { cost: Number(cost) || 0 }),
      ...(mechanic ? { mechanic } : {}),
    }),

  cancel: (id: string, reason?: string) =>
    engineeringService.updateWorkOrder(id, {
      status: 'Cancelled',
      completedAt: new Date().toISOString(),
      ...(reason ? { notes: reason } : {}),
    }),

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
      notificationService.create({ title: 'Repair Logged', body: `Repair logged for ${truckReg} (${defect}).`, category: 'Engineering', module: 'Engineering', audience: 'Engineering,Transport Manager,Platform Admin', refLabel: truckReg, eventKey: 'engineering.repair_logged' });
      return res;
    })
};

export const inventoryService = {
  list: () => fetchApi<unknown[]>('/inventory').then((res) => asList(res as any).map(mapInventoryItem)),
  createItem: (input: any) =>
    fetchApi<unknown>('/inventory', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        sku: input.sku,
        category: input.category || 'General',
        stock: Number(input.stock) || 0,
        reorderLevel: Number(input.reorderLevel) || 0,
        unitCost: Number(input.unitCost) || 0,
        location: input.location || 'Main Store',
      }),
    }).then((res) => mapInventoryItem(res as any)),
  updateItem: (id: string, updates: Record<string, unknown>) =>
    fetchApi<unknown>(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }).then((res) =>
      mapInventoryItem(res as any),
    ),
  /**
   * Stock in from a vendor, at a price.
   *
   * The purchase replaces the line's book price — the shelf is valued at the
   * most recent thing actually paid for it, the same rule the diesel tank uses —
   * and the vendor is remembered for the next reorder.
   */
  purchase: (id: string, input: { qty: number; unitPrice: number; vendor?: string; reference?: string; note?: string }) =>
    fetchApi<unknown>(`/inventory/${id}/purchase`, { method: 'POST', body: JSON.stringify(input) }).then((res) =>
      mapInventoryItem(res as any),
    ),
  /** A signed correction that is neither a purchase nor an issue. */
  adjust: (id: string, input: { delta: number; note?: string; reference?: string }) =>
    fetchApi<unknown>(`/inventory/${id}/adjust`, { method: 'POST', body: JSON.stringify(input) }).then((res) =>
      mapInventoryItem(res as any),
    ),
  /** The movement ledger — a line's history, or the whole store's. */
  movements: (itemId?: string) =>
    fetchApi<unknown[]>(`/inventory-movements${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`)
      .then((res) => asList(res as any).map(mapInventoryMovement)),
  /** The shelf, in bulk, upserted by SKU. */
  importItems: (items: Array<Record<string, unknown>>) =>
    fetchApi<{ created: number; updated: number; skipped: string[] }>('/inventory/import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  // Backend route is /inventory-requisitions (hyphenated).
  requisitions: () =>
    fetchApi<unknown[]>('/inventory-requisitions').then((res) =>
      asList(res as any).map(mapInventoryRequisition),
    ),
  /**
   * The workshop asking the store for a part against a job.
   *
   * `unitCost` is snapshotted onto the request, so the approval queue keeps the
   * price the request was raised at even if the store item is re-priced later.
   */
  createRequisition: (input: any) =>
    fetchApi<unknown>('/inventory-requisitions', {
      method: 'POST',
      body: JSON.stringify({
        workOrder: input.workOrder || '',
        truckReg: input.truckReg || '',
        mechanic: input.mechanic || '',
        part: input.part,
        itemId: input.itemId || null,
        quantity: Number(input.quantity) || 0,
        unitCost: Number(input.unitCost) || 0,
        reason: input.reason || '',
        status: 'Pending',
      }),
    }).then((res) => mapInventoryRequisition(res as any)),
  /**
   * The Transport Manager's decision on a pending request.
   *
   * Approval hands the ticket to the store floor (Awaiting Pickup, or Awaiting
   * Procurement when the shelf cannot cover it) — no stock moves here. The
   * physical handover, the mechanic's signature and the deduction happen at
   * Complete Handoff, on the inventory department's board.
   */
  approveRequisition: async (requisition: { id: string; itemId?: string; quantity: number }) => {
    if (requisition.itemId) {
      await fetchApi(`/inventory/${requisition.itemId}/release`, {
        method: 'POST',
        body: JSON.stringify({ qty: requisition.quantity, reqId: requisition.id }),
      });
      return;
    }
    await fetchApi(`/inventory-requisitions/${requisition.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Released' }),
    });
  },
  /** The store floor's queue: approved tickets waiting for a physical handover. */
  handoffs: () =>
    fetchApi<unknown[]>('/inventory-handoffs').then((res) =>
      asList(res as any).map(mapInventoryRequisition),
    ),
  /** The attendant confirming the physical pick — or flagging the bin empty. */
  pickHandoff: (id: string, picked: boolean) =>
    fetchApi<unknown>(`/inventory-handoffs/${id}/pick`, {
      method: 'POST',
      body: JSON.stringify({ picked }),
    }).then((res) => mapInventoryRequisition(res as any)),
  /**
   * The mechanic signs; the store releases. The signature is a data URL drawn
   * on the sign-off pad; the deduction and the truck's cost are server-side.
   */
  completeHandoff: (id: string, signature: string, qty?: number) =>
    fetchApi<{ releasedValue: number }>(`/inventory-handoffs/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signature, qty }),
    }),
  /** A physical count that disagrees with the book, filed as a variance. */
  reconcile: (id: string, observed: number, reason?: string) =>
    fetchApi<unknown>(`/inventory/${id}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ observed, reason }),
    }).then((res) => mapInventoryItem(res as any)),
  rejectRequisition: (id: string, decisionNote: string) =>
    fetchApi(`/inventory-requisitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Rejected', decisionNote }),
    }),
  release: (itemId: string, qty: number, reqId?: string) => fetchApi(`/inventory/${itemId}/release`, { method: 'POST', body: JSON.stringify({ qty, reqId }) }).then(res => {
    notificationService.create({ title: 'Parts Released', body: `${qty} units released from inventory.`, category: 'Engineering', module: 'Engineering', audience: 'Engineering,Parts & Store,Transport Manager,Platform Admin' });
    return res;
  }),
  // No /reorder sub-route — reorderLevel is a plain field on PATCH /inventory/:id.
  updateReorderLevel: (itemId: string, level: number) => fetchApi(`/inventory/${itemId}`, { method: 'PATCH', body: JSON.stringify({ reorderLevel: level }) })
};

export const procurementService = {
  list: () => fetchApi('/procurement'),
  /**
   * The Transport Manager's buy, raised from the low-tank drill: litres, the
   * vendor, the agreed price and his authorisation. Posts a PO into the
   * procurement ledger — the tank is only written when the delivery is
   * received, so the vendor record stays on the procurement side and the tank
   * keeps one figure.
   */
  raiseFuelRestockOrder: (input: { fuelType: 'Diesel' | 'Gas'; quantity: number; unitPrice: number; vendor?: string; note?: string }) =>
    fetchApi<unknown>('/fuel-restock-orders', { method: 'POST', body: JSON.stringify(input) }),
  /** The store's inbound deliveries: fuel POs the TM raised, newest first. */
  fuelRestockOrders: () =>
    fetchApi<unknown[]>('/procurement')
      .then((res) => (Array.isArray(res) ? res : ((res as any)?.data ?? [])))
      .then((rows) => rows.filter((r: any) => r?.kind === 'Fuel')),
  // Backend expects PATCH /procurement/:id { status: 'Procured' } (no /procure sub-route).
  // Receiving a fuel PO is server-side: it writes the tank row at the PO's price.
  markProcured: (id: string) => fetchApi(`/procurement/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Procured' }) }).then(res => {
    notificationService.create({ title: 'Items Procured', body: `Procurement request ${id.substring(0,6)} fulfilled.`, category: 'Compliance', module: 'Engineering', audience: 'Engineering,Parts & Store,Transport Manager,Platform Admin' });
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
  /**
   * The feed. `module` narrows it to one department's alerts, `action` to the
   * reader's own queue, `unread` to what they have not read. Read state comes
   * back per user, so two people looking at one row are told their own truth.
   */
  list: (options: { module?: string; action?: boolean; unread?: boolean; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (options.module) query.set('module', options.module);
    if (options.action) query.set('action', '1');
    if (options.unread) query.set('unread', '1');
    if (options.limit) query.set('limit', String(options.limit));
    const suffix = query.toString();
    return fetchApi<NotificationRecord[]>(`/notifications${suffix ? `?${suffix}` : ''}`);
  },
  /** Counts by department: what the badge and the control panel both read. */
  summary: () => fetchApi<NotificationSummaryRecord>('/notifications/summary'),
  getUnreadCount: async () => { const res = await fetchApi('/notifications/unread').catch(() => ({ count: 0 })); return res.count || 0; },
  /** Marks everything read FOR THE CALLER, optionally one department at a time. */
  markAllRead: (module?: string) =>
    fetchApi('/notifications/mark-all-read', { method: 'POST', body: JSON.stringify(module ? { module } : {}) }),
  /**
   * Removes a notification from THIS user's center only. Notifications are shared
   * (a broadcast, or every holder of a role), so the server records a per-user
   * dismissal instead of deleting the row.
   */
  remove: (id: string) => fetchApi(`/notifications/${id}`, { method: 'DELETE' }),
  /** Clears this user's center: specific `ids`, or their READ ones with `readOnly`. */
  clear: (options: { ids?: string[]; readOnly?: boolean } = {}) =>
    fetchApi<{ ok: boolean; removed: number }>('/notifications/clear', {
      method: 'POST',
      body: JSON.stringify({ ids: options.ids, read: options.readOnly === true }),
    }),
  /**
   * Reading is recorded against THIS user on the server; marking unread again is
   * the same call with `read: false`, so one person's reading never clears a
   * colleague's badge.
   */
  markRead: (id: string, read = true) =>
    fetchApi(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read }) }),
  toggleRead: (id: string) => fetchApi(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) }),
  // `audience` (comma-separated roles / 'Partner:<Company>') scopes who receives
  // it. Omitted = broadcast to EVERY user, partners included — only use that for
  // genuinely company-wide news.
  create: (payload: {
    title: string;
    body: string;
    category: string;
    severity?: string;
    audience?: string;
    /** The department this alert came from — the axis the TM reads by. */
    module?: string;
    eventKey?: string;
    refId?: string;
    refLabel?: string;
    /** The roles that must act. Empty/omitted = news, nobody has to do anything. */
    actionRoles?: string[];
  }) =>
    fetchApi('/notifications', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        severity: payload.severity || 'info',
        actionRequired: (payload.actionRoles?.length ?? 0) > 0,
      }),
    }).catch(() => {})
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
