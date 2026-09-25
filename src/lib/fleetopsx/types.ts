/**
 * FleetOpsX domain model.
 * These interfaces mirror the eventual backend schema so that the mock
 * service layer can be swapped for real API calls without UI changes.
 */

export type ID = string;

export interface Tenant {
  id: ID;
  name: string;
  workspaceId: string;
  tenantSlug?: string;
  industry: string;
  country: string;
  locations: string[];
  contactEmail: string;
  contactPhone: string;
}

export interface PlatformTenant {
  id: string;
  name: string;
  domain: string;
  tenantSlug?: string;
  logo?: string;
  status: "Active" | "Suspended" | "Onboarding";
  activeTrucks: number;
  totalOrders: number;
  joinedAt: string;
}

export interface Company {
  id: ID;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  status: "Active" | "Inactive";
}

export type RoleKey =
  | "Platform Admin"
  | "Transport Manager"
  | "Fleet Operations"
  | "Engineering"
  | "Parts & Store"
  | "Accounts"
  | "HR"
  | "Security"
  | "Driver"
  | "Customer Portals (External)"
  | "Diesel";

export interface Role {
  key: RoleKey;
  name: string;
  description: string;
  modules: string[];
  users: number;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  roles: RoleKey[];
  roleNames: string[];
  department: string;
  status: "Active" | "Suspended" | "Invited" | "Deleted";
  passwordResetRequired?: boolean;
  lastActive: string;
  initials: string;
  companyId?: string; // The Platform Tenant ID this user belongs to
  partnerCompanyName?: string; // If this user is an External Partner, their external company name
}

export type TruckStatus =
  | "Available"
  | "Assigned"
  /** Out of the yard — the FO team's own bookkeeping that a truck has left the
   * yard. Deliberately NOT a customer-facing state: "In Transit" belongs to the
   * dispatch lifecycle (driver departs / gate logs departure), never to the
   * fleet asset's own status. Legacy rows may still read "In Transit". */
  | "Out of Yard"
  /** Just back in the yard — waiting on the check-up that decides whether the
   * truck goes back to Available or into Maintenance. */
  | "Check Up"
  | "Maintenance"
  | "Accident"
  /**
   * Taken out of service deliberately — a sold, retired or parked-up truck whose
   * number must stay on the books (the client will not renumber). A blocked asset
   * is never offered in an assignment picker, whatever else is true about it.
   */
  | "Blocked";

export interface TruckHead {
  id: ID;
  number: string;
  capNumber?: string;
  registration: string;
  make: string;
  type?: string;
  year: number;
  status: TruckStatus;
  location: string;
  odometer: number;
  standardEfficiency: number;
  lat: number;
  lng: number;
}

export interface TruckTail {
  id: ID;
  number: string;
  registration: string;
  type: string;
  status: TruckStatus;
  location: string;
  lat: number;
  lng: number;
}

/** The DB carries both "Active" (the register's seed word) and "Available"
 *  (the claim helpers' word) for a free driver — mapDriver folds them into
 *  "Available" on read, and writes may use either. */
export type DriverStatus = "Available" | "Active" | "On Trip" | "Off Duty" | "Suspended";

export type ComplianceStatus = "Valid" | "Expiring Soon" | "Expired";

export interface Driver {
  id: ID;
  name: string;
  employeeId: string;
  salaryNumber?: string;
  phone: string;
  department: string;
  dateJoined: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiry: string;
  compliance: ComplianceStatus;
  experienceYears: number;
  status: DriverStatus;
  assignedTruck: string | null;
  /**
   * The truck TAIL normally paired with this driver, when HR has recorded one.
   * Stored in the live Driver row's `truckReg2` column; absent on most records,
   * and only ever shown next to the head it belongs to.
   */
  assignedTail?: string | null;
  /** Who stands for the staff member, and how to reach them. */
  guarantorName?: string;
  guarantorPhone?: string;
  /**
   * The licence document on file — its name and whether the bytes are
   * attached. The document itself never travels with the list: a roster of 120
   * people must not ship 120 scans, so the row carries the flag and the
   * document is fetched only when somebody opens it.
   */
  licenseDocName?: string;
  hasLicenseDoc?: boolean;
  currentTripId: ID | null;
  tripsCompleted: number;
  safetyScore: number;
  initials: string;
}

export type TripStatus =
  | "Requested"
  | "Draft" // legacy backend default — treated as a fresh request everywhere
  | "Awaiting Approval"
  | "Approved" // backend intermediate state after TM initial approval
  | "Approved for Dispatch"
  | "Scheduled"
  | "En Route"
  | "Loaded"
  | "Offloading"
  | "Returning"
  | "Delayed"
  | "Completed"
  | "Stopped";

export interface Trip {
  id: ID;
  customer: string;
  customerConsignee?: string;
  cargo: string;
  pickup: string;
  loadingSite?: string[];
  loadingRoutingType?: "Single" | "Multiple";
  dropoff: string;
  /**
   * Street address at the drop-off destination — optional, because a partner
   * often raises the load before they know the exact yard or gate.
   */
  dropoffAddress?: string | null;
  headId?: ID;
  tailId?: ID;
  /**
   * The truck type the PARTNER asked for at request time (Full Sided, Flat, …).
   * Never overwritten by the Fleet Ops assignment — see `tailType` for the tail
   * that was actually fitted.
   */
  requestedTruckType?: string | null;
  tailType?: string;
  tailNumber?: string;
  truckReg?: string; // composed string e.g., HeadReg + TailReg or just display
  driverId?: ID;
  driverName?: string;
  directCosts?: {
    tripAllowance: number;
    returnWaybill: number;
    motorBoy: number;
    ticket: number;
    extraAllowance: number;
    /**
     * Discretionary bonus paid on top of the allowances. Optional in the type
     * because dispatches configured before the field existed carry no value —
     * always read it as `bonus ?? 0`.
     */
    bonus?: number;
    lubricantType: "Diesel" | "Gas";
    lubricantQuantity?: number;
    lubricantCost?: number;
    /**
     * The litres the Transport Manager released for this dispatch, written
     * beside the figure Fleet Ops asked for. Absent means he has not authorized
     * it yet — which is a different thing from authorizing zero litres, and the
     * pump treats a missing authorization as a cap of nothing to enforce.
     */
    lubricantApprovedLitres?: number;
    lubricantApprovedBy?: string;
    lubricantApprovedAt?: string;
  };
  status: TripStatus;
  /** When the request was submitted (backend createdAt). */
  createdAt?: string;
  /** When the TM gave final approval and the truck was dispatched. */
  dispatchedAt?: string | null;
  /**
   * The Transport Manager's estimated dispatch date (YYYY-MM-DD) — what the
   * board shows until Security logs the real gate departure.
   */
  estimatedDate?: string | null;
  /**
   * How many days the Transport Manager expects the vehicle to spend ON THE
   * ROAD, set at his final approval. This is the number the delay status is
   * measured against (see `trip-duration.ts`) and what the partner is told as
   * the expected return.
   */
  estimatedDays?: number | null;
  /** TM first approval (partner sees "Seen"). */
  approvedAt?: string | null;
  /** Fleet Ops assigning driver/truck. */
  assignedAt?: string | null;
  /**
   * Last write to the record. For a declined request this is the decline
   * moment, which is the only truthful stamp for "Request Declined" on the
   * partner's timeline.
   */
  updatedAt?: string | null;
  /**
   * Why the dispatch was sent back to Fleet Ops (wrong truck, wrong driver,
   * missing location…). Fleet Ops reads this before re-assigning.
   */
  sendBackReason?: string | null;
  /**
   * Transport Manager's note to the PARTNER (send back for correction, or why a
   * request was declined). The partner reads it instead of re-raising the request.
   */
  partnerNote?: string | null;
  priority: "Low" | "Normal" | "High" | "Critical";
  distanceKm: number;
  durationLabel: string;
  scheduledDate: string;
  startTime: string;
  eta: string;
  /**
   * Which security account stamped Log Out / Log In at the gate — the Guard
   * Activity Ledger's accountability pair. Null on dispatches the gate has
   * never touched.
   */
  gateOutBy?: string | null;
  gateInBy?: string | null;
  progress: number;
  lat: number;
  lng: number;
  revenue: number;
  totalCosts?: number;
  grossMargin?: number;
}

export interface TimelineStep {
  label: string;
  state: "done" | "current" | "pending";
  at?: string;
}

export interface FuelRequisition {
  id: ID;
  tripId: ID;
  truckReg: string;
  driverName: string;
  requiredLitres: number;
  approvedLitres: number | null;
  expectedConsumption: number;
  standardEfficiency: number;
  odometer: number;
  status: "Pending" | "Approved" | "Rejected";
  date: string;
  cost: number;
}

/**
 * The workshop pipeline, in the order a job actually moves through it.
 *
 * `Cancelled` is a job raised in error or withdrawn before any work started —
 * it is not a repair that happened, so it never counts as a completed check-up.
 */
export type WorkOrderStatus =
  | "Reported"
  | "Diagnosing"
  | "Awaiting Parts"
  | "Repairing"
  | "Testing"
  | "Completed"
  | "Cancelled";

export interface WorkOrder {
  id: ID;
  /** The truck the job is for. Written as the PLATE (registration) so the
   *  Transport Manager's fleet audit can match it to a registry row; legacy
   *  rows may still carry a cap label like "P073 (APP857YL)". */
  truckReg: string;
  defect: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  mechanic: string;
  status: WorkOrderStatus;
  reportedBy: string;
  reportedAt: string;
  cost: number;
  notes: string;
  /** When the job left the desk and actual work began. */
  startedAt: string;
  /** When the job was closed out — the truck's check-up date. */
  completedAt: string;
  /**
   * The workshop's projected RETURN TO SERVICE date (YYYY-MM-DD).
   *
   * This is the promise the Transport Manager audits against: a truck still open
   * past its own estimate is the answer to "when is this coming back?", which no
   * other field on the job can give.
   */
  estimatedReadyAt: string;
}

export interface InventoryItem {
  id: ID;
  name: string;
  sku: string;
  category: string;
  stock: number;
  reorderLevel: number;
  unitCost: number;
  location: string;
  /** The vendor this line is normally bought from. */
  supplier: string;
  /** Which vehicles this part fits — the catalog's compatibility column. */
  vehicleCompatibility: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

/**
 * One physical movement of a store line, as the ledger records it.
 *
 * The ledger is what turns a stock number into an auditable story: where the
 * unit came from, what was paid for it, which truck drew it out, and who
 * recorded the change.
 */
export type InventoryMovementKind = "Purchase" | "Issue" | "Adjustment" | "Write-off";

export interface InventoryMovement {
  id: ID;
  itemId: ID;
  /** Copied onto the row, so history survives a rename or deletion. */
  itemName: string;
  sku: string;
  kind: InventoryMovementKind;
  /** Signed: positive in from a vendor, negative drawn against a truck. */
  quantity: number;
  /** Price per unit at the moment of the movement. */
  unitCost: number | null;
  /** The movement's total: quantity × unit cost. */
  value: number | null;
  vendor: string;
  reference: string;
  truckReg: string;
  note: string;
  actedBy: string;
  actedAt: string;
}

export interface InventoryRequisition {
  id: ID;
  workOrder: ID;
  truckReg: string;
  mechanic: string;
  part: string;
  /** The store item this part is drawn from, when the request named one. */
  itemId: string;
  quantity: number;
  /**
   * The part's price at REQUEST time. Snapshotted rather than looked up, so a
   * re-priced or deleted store item cannot rewrite what a past request cost.
   */
  unitCost: number;
  reason: string;
  /** Why the Transport Manager rejected it — empty while it is pending. */
  decisionNote: string;
  /**
   * The ticket's life: Pending (the TM's queue) → Awaiting Pickup (approved,
   * store floor to hand over) or Awaiting Procurement (approved, shelf empty) →
   * Released (the mechanic signed and the stock moved). Rejected is the fourth
   * exit.
   */
  status: "Pending" | "Awaiting Pickup" | "Awaiting Procurement" | "Released" | "Rejected";
  date: string;
  /** When the ticket was handed to the store floor / paused for procurement. */
  handoffAt: string | null;
  /** The attendant who confirmed the physical pick. */
  pickedBy: string | null;
  /** The mechanic's signature captured at handoff (data URL). */
  signature: string | null;
  /** Units actually released at sign-off (may differ from `quantity`). */
  releasedQty: number | null;
  /** releasedQty × weighted-average unit cost — posted to the truck's file. */
  releasedValue: number | null;
}

export interface ProcurementRequest {
  id: ID;
  partName: string;
  quantity: number;
  linkedId: ID; // WO or TruckReg
  status: "Requested" | "Sourcing" | "Procured";
  date: string;
  /** "Part" (workshop store) or "Fuel" (a tank restock PO the TM raised). */
  kind?: "Part" | "Fuel";
  /** Agreed price per unit — the price receiving posts to the tank. */
  unitPrice?: number | null;
  /** Who the buy is from — procurement owns the vendor record. */
  vendor?: string | null;
}

export type ExpenseStatus = "Pending" | "Approved" | "Disbursed" | "Rejected" | "Clarification";

export interface Expense {
  id: ID;
  type: "Toll" | "Allowance" | "Fuel" | "Repairs" | "Logistics" | "Other";
  requester: string;
  amount: number;
  standardRate: number;
  tripId: ID;
  status: ExpenseStatus;
  approvalLevel: string;
  date: string;
  documents: string[];
}

export interface GateEntry {
  id: ID;
  time: string;
  asset: string;
  driver: string;
  direction: "Incoming" | "Outgoing";
  purpose: string;
  yard: string;
  cargo: string;
  officer: string;
  reference: string;
}

export interface Notification {
  id: ID;
  category: "Operations" | "Approvals" | "Compliance" | "Engineering" | "Security" | "System";
  title: string;
  body: string;
  time: string;
  /** Read state is THIS reader's, resolved per user by the API. */
  read: boolean;
  severity: "info" | "warning" | "critical" | "success";
  /** Backend audience targeting: null/absent = broadcast, otherwise comma-separated roles. */
  audience?: string | null;
  /**
   * The department that produced the alert — the axis the Transport Manager's
   * control panel is read by, instead of one pile of 900 rows.
   */
  module?: string | null;
  /** The catalogue key behind it (dispatch.departed, fuel.released…). */
  eventKey?: string | null;
  /** The record it is about, so a row can open that record rather than a list. */
  refId?: string | null;
  refLabel?: string | null;
  /** True only when ONE OF THE READER'S OWN ROLES must act on this row. */
  actionRequired?: boolean;
  /** The roles that must act — the server's own record of who owns the row. */
  actionRoles?: string[];
  /** When it landed. `time` is the human word the API writes, this is the fact. */
  createdAt?: string;
}

/**
 * What the notification API answers when asked for the "what needs me" summary:
 * totals plus one row per department that has sent something.
 */
export interface NotificationSummary {
  total: number;
  unread: number;
  /** Unread rows whose action roles include one of the reader's own. */
  action: number;
  /** Every row whose action roles include one of the reader's own, read or not. */
  actionAll?: number;
  modules: Array<{
    module: string;
    total: number;
    unread: number;
    action: number;
    actionAll?: number;
  }>;
}

export interface Message {
  id: ID;
  author: string;
  /** Who wrote it — `self` is decided per reader against this, never stored. */
  authorId?: ID | null;
  role: string;
  body: string;
  /** ISO stamp the message was written at (older rows only carry `time`). */
  at?: string;
  time: string;
  self?: boolean;
}

export interface Conversation {
  id: ID;
  kind: "direct" | "channel" | "trip";
  name: string;
  subtitle: string;
  unread: number;
  lastAt: string;
  tripId?: ID;
  participants: string[];
  messages: Message[];
}

export interface AuditLog {
  id: ID;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  record: string;
  device: string;
  ip: string;
}

export interface ActivityEvent {
  id: ID;
  reference: string;
  module: string;
  action: string;
  user: string;
  time: string;
  tone: "info" | "success" | "warning" | "critical";
}

export interface AlertItem {
  id: ID;
  level: "Critical" | "Warning" | "Approval" | "System";
  message: string;
  reference: string;
}

export interface LoginReport {
  id: ID;
  userId: ID;
  name: string;
  role: string;
  timestamp: string;
  device: string;
  ip: string;
  status: "Success" | "Failed";
}
