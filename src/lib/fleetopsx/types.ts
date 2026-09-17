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
  | "Maintenance"
  | "Accident";

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


export type DriverStatus =
  | "Available"
  | "On Trip"
  | "Off Duty"
  | "Suspended";

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
    lubricantType: "Diesel" | "Gas";
    lubricantQuantity?: number;
    lubricantCost?: number;
  };
  status: TripStatus;
  /** When the request was submitted (backend createdAt). */
  createdAt?: string;
  /** When the TM gave final approval and the truck was dispatched. */
  dispatchedAt?: string | null;
  /** TM first approval (partner sees "Seen"). */
  approvedAt?: string | null;
  /** Fleet Ops assigning driver/truck. */
  assignedAt?: string | null;
  /**
   * Why the dispatch was sent back to Fleet Ops (wrong truck, wrong driver,
   * missing location…). Fleet Ops reads this before re-assigning.
   */
  sendBackReason?: string | null;
  priority: "Low" | "Normal" | "High" | "Critical";
  distanceKm: number;
  durationLabel: string;
  scheduledDate: string;
  startTime: string;
  eta: string;
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

export type WorkOrderStatus =
  | "Reported"
  | "Diagnosing"
  | "Awaiting Parts"
  | "Repairing"
  | "Testing"
  | "Completed";

export interface WorkOrder {
  id: ID;
  truckReg: string;
  defect: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  mechanic: string;
  status: WorkOrderStatus;
  reportedBy: string;
  reportedAt: string;
  cost: number;
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
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface InventoryRequisition {
  id: ID;
  workOrder: ID;
  truckReg: string;
  mechanic: string;
  part: string;
  quantity: number;
  reason: string;
  status: "Pending" | "Released" | "Rejected";
  date: string;
}

export interface ProcurementRequest {
  id: ID;
  partName: string;
  quantity: number;
  linkedId: ID; // WO or TruckReg
  status: "Requested" | "Sourcing" | "Procured";
  date: string;
}

export type ExpenseStatus =
  | "Pending"
  | "Approved"
  | "Disbursed"
  | "Rejected"
  | "Clarification";

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
  read: boolean;
  severity: "info" | "warning" | "critical" | "success";
  /** Backend audience targeting: null/absent = broadcast, otherwise comma-separated roles. */
  audience?: string | null;
}

export interface Message {
  id: ID;
  author: string;
  role: string;
  body: string;
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
