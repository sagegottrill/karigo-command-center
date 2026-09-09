import type {
  ActivityEvent,
  AlertItem,
  AuditLog,
  Conversation,
  Driver,
  Expense,
  FuelRequisition,
  GateEntry,
  InventoryItem,
  InventoryRequisition,
  Notification,
  ProcurementRequest,
  Role,
  Tenant,
  PlatformTenant,
  Company,
  Trip,
  TruckHead,
  TruckTail,
  User,
  WorkOrder,
} from "./types";

/** Deterministic pseudo-random so SSR and client render identically. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const r = rng(20260812);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(min + r() * (max - min + 1));

// Mock Current User Role for RBAC Testing
export const CURRENT_ROLE = "Operations Admin";

const pad = (n: number, w = 3) => String(n).padStart(w, "0");

export const TENANT: Tenant = {
  id: "TEN-001",
  name: "Petroline Transport",
  workspaceId: "PTL-001",
  tenantSlug: "petrolline",
  industry: "Heavy Haulage / Oil & Gas Logistics",
  country: "Nigeria",
  locations: ["Lagos HQ", "Abuja Depot", "Port Harcourt Yard", "Kano Terminal"],
  contactEmail: "operations@petroline.ng",
  contactPhone: "+234 802 118 4420",
};

export const PLATFORM_TENANTS: PlatformTenant[] = [
  {
    id: "tnt_001",
    name: "Petroline Logistics",
    domain: "petroline",
    tenantSlug: "petrolline",
    logo: "/petroline-transparent.png",
    status: "Active",
    activeTrucks: 142,
    totalOrders: 12450,
    joinedAt: "2024-01-15",
  }
];

export const COMPANIES: Company[] = [];

export const WORKSPACES = [
  { id: "PTL-001", name: "Petroline Transport", role: "Operations Admin" },
  { id: "NRT-014", name: "Northrail Haulage", role: "Viewer" },
  { id: "DLT-092", name: "Delta Bulk Logistics", role: "Viewer" },
];

const FIRST = [
  "Emeka", "Ibrahim", "Chinedu", "Musa", "Tunde", "Segun", "Abdul", "Kelechi",
  "Yusuf", "Obinna", "Sadiq", "Femi", "Uche", "Bala", "Nnamdi", "Kabiru",
  "Olamide", "Danjuma", "Ifeanyi", "Suleiman", "Gbenga", "Hassan", "Chika",
  "Aliyu", "Tobi", "Peter", "Michael", "Samuel", "Joseph", "Daniel",
];
const LAST = [
  "Okafor", "Bello", "Adeyemi", "Lawal", "Eze", "Mohammed", "Nwachukwu",
  "Ogunleye", "Danladi", "Umeh", "Balogun", "Sani", "Ikenna", "Yakubu",
  "Ojo", "Garba", "Anyanwu", "Usman", "Adekunle", "Okonkwo",
];

const CITIES = [
  "Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Warri", "Onitsha",
  "Kaduna", "Benin City", "Enugu", "Calabar", "Jos", "Aba", "Maiduguri",
];
const COORDS: Record<string, [number, number]> = {
  Lagos: [6.5244, 3.3792],
  Abuja: [9.0765, 7.3986],
  "Port Harcourt": [4.8156, 7.0498],
  Kano: [12.0022, 8.592],
  Ibadan: [7.3775, 3.947],
  Warri: [5.5167, 5.75],
  Onitsha: [6.1667, 6.7833],
  Kaduna: [10.5222, 7.4384],
  "Benin City": [6.335, 5.6037],
  Enugu: [6.4584, 7.5464],
  Calabar: [4.9757, 8.3417],
  Jos: [9.8965, 8.8583],
  Aba: [5.1066, 7.3667],
  Maiduguri: [11.8311, 13.151],
};

const CUSTOMERS = [
  "NNPC Retail", "Dangote Cement", "TotalEnergies NG", "Lafarge Africa",
  "Seplat Energy", "Julius Berger", "Chevron Nigeria", "BUA Group",
  "Ardova Plc", "Oando Energy",
];
const CARGO = [
  "PMS 45,000L", "AGO 33,000L", "Bulk Cement 30T", "Drilling Pipes 24T",
  "LPG 20T", "Bitumen 28T", "Base Oil 32,000L", "Construction Aggregate 35T",
];
const TRUCK_TYPES = ["Tanker 45KL", "Tanker 33KL", "Flatbed 40FT", "Tipper 30T", "Low Loader", "Box Trailer"];
const MAKES = ["MAN TGS", "Scania R500", "Mercedes Actros", "Howo A7", "Volvo FH16", "IVECO Stralis"];

export const DRIVERS: Driver[] = [];

export const TRUCK_HEADS: TruckHead[] = [];

export const TRUCK_TAILS: TruckTail[] = [];

export const TRUCKS = [
  ...TRUCK_HEADS.map(t => ({ ...t, type: "Head" as const })),
  ...TRUCK_TAILS.map(t => ({ ...t, type: "Tail" as const }))
];

const TRIP_STATUSES: Trip["status"][] = [
  "En Route", "En Route", "Loaded", "Offloading", "Returning", "Delayed",
  "Completed", "Completed", "Scheduled", "Stopped", "Awaiting Approval", "Awaiting Approval", "Approved for Dispatch"
];

export const TRIPS: Trip[] = [];

// Seed one manual Requested order from a PWA customer for demo purposes


export const FEATURED_TRIP_ID = "TRP-00842";










export const FUEL_REQUISITIONS: FuelRequisition[] = [];

const DEFECTS = [
  "Brake air leak", "Engine overheating", "Gearbox slipping", "Front tyre wear",
  "Faulty alternator", "Suspension noise", "Clutch failure", "Headlamp fault",
  "Coolant leak", "Turbo underboost", "Steering play", "Trailer light fault",
];
const MECHANICS = ["Idris Bako", "Chuka Nwosu", "Sola Adebayo", "Aminu Tijjani", "Victor Etim"];

export const WORK_ORDERS: WorkOrder[] = [];

const PARTS = [
  ["Brake Pad", "BRK", "Brakes"], ["Air Filter", "FLT", "Filters"],
  ["Oil Filter", "FLT", "Filters"], ["Clutch Plate", "CLT", "Transmission"],
  ["Shock Absorber", "SUS", "Suspension"], ["Alternator", "ELC", "Electrical"],
  ["Battery 200Ah", "ELC", "Electrical"], ["Tyre 315/80R22.5", "TYR", "Tyres"],
  ["Wheel Bearing", "BRG", "Drivetrain"], ["Fuel Injector", "ENG", "Engine"],
  ["Radiator Hose", "ENG", "Engine"], ["Gasket Set", "ENG", "Engine"],
  ["Headlamp Unit", "ELC", "Electrical"], ["Leaf Spring", "SUS", "Suspension"],
  ["Air Dryer Cartridge", "BRK", "Brakes"], ["Turbo Charger", "ENG", "Engine"],
  ["Prop Shaft", "DRV", "Drivetrain"], ["Diff Oil 20L", "LUB", "Lubricants"],
  ["Engine Oil 20L", "LUB", "Lubricants"], ["Coolant 20L", "LUB", "Lubricants"],
];

export const INVENTORY: InventoryItem[] = [];


export const INVENTORY_REQUISITIONS: InventoryRequisition[] = [];

export const PROCUREMENT_REQUESTS: ProcurementRequest[] = [];

export const EXPENSES: Expense[] = [];


export const GATE_ENTRIES: GateEntry[] = [];

export const NOTIFICATIONS: Notification[] = [];

export const CONVERSATIONS: Conversation[] = [];

export const AUDIT_LOGS: AuditLog[] = [];

export const ACTIVITY: ActivityEvent[] = [];

export const ALERTS: AlertItem[] = [];

export const USERS: User[] = [
  ["Super Admin", "Platform Admin", "Platform Administrator", "System"],
  ["Okwudili Fortune", "Transport Manager", "Transport Manager", "Executive"],
  ["Tunde Balogun", "Fleet Operations", "Fleet Operations", "Operations"],
  ["Adaeze Nwoke", "Fleet Operations", "Dispatcher", "Operations"],
  ["Musa Danjuma", "Customer Portals (External)", "Customer Portal Rep", "External Partner"],
  ["Chuka Nwosu", "Engineering", "Engineer", "Engineering"],
  ["Idris Bako", "Parts & Store", "Store Manager", "Engineering"],
  ["Grace Ile", "Accounts", "Accountant", "Accounts"],
  ["Bisi Adeleke", "HR", "HR Manager", "Human Resources"],
  ["Sgt. Peter Obi", "Security", "Security Officer", "Security"],
  ["Ngozi Umeh", "Fleet Operations", "Fleet Operations", "Operations"],
].map(([name, role, roleName, department], i) => ({
  id: `USR-${pad(i + 1, 4)}`,
  name: name as string,
  email: role === "Platform Admin" ? "admin@fleetopsx.com" : role === "Customer Portals (External)" ? `${(name as string).toLowerCase().replace(/[^a-z]+/g, ".")}@sabasteel.com` : `${(name as string).toLowerCase().replace(/[^a-z]+/g, ".")}@petroline.ng`,
  username: role === "Platform Admin" ? "admin" : `${(name as string).split(" ")[0]!.charAt(0).toLowerCase()}${(name as string).split(" ")[1]!.toLowerCase()}`,
  roles: [role as User["roles"][0]],
  roleNames: [roleName as string],
  department: department as string,
  status: i === 8 ? "Invited" : "Active",
  passwordResetRequired: i === 1,
  lastActive: `${int(1, 59)} min ago`,
  initials: (name as string).split(" ").map((p) => p[0]).join("").slice(0, 2),
  companyId: i === 0 ? undefined : "tnt_001",
  partnerCompanyName: role === "Customer Portals (External)" ? "Saba Steel" : undefined,
}));

// Give Okwudili Fortune multiple roles for testing
USERS[1]!.roles = ["Transport Manager", "HR"];
USERS[1]!.roleNames = ["Transport Manager", "HR Manager"];

export const ROLES: Role[] = [
  { key: "Transport Manager", name: "Transport Admin", description: "Super Admin. Oversees all operations across every department.", modules: ["All modules"], users: 1 },
  { key: "Fleet Operations", name: "Fleet Operations", description: "Responsible for dispatching vehicles and assigning trips.", modules: ["Fleet & Dispatch"], users: 7 },
  { key: "Diesel", name: "Fuel Management", description: "Manages all fuel-related workflows and consumption.", modules: ["Fuel"], users: 4 },
  { key: "Engineering", name: "Engineering and Maintenance", description: "Manages the workshop and vehicle defect reports.", modules: ["Engineering"], users: 5 },
  { key: "Parts & Store", name: "Parts and Store", description: "Handles all workshop inventory and spare parts.", modules: ["Inventory"], users: 3 },
  { key: "Accounts", name: "Accounts", description: "Handles operational financials and trip invoicing.", modules: ["Accounts", "Reports"], users: 4 },
  { key: "HR", name: "HR and Personnel", description: "Manages staff files and verifies driver licenses.", modules: ["Drivers & HR"], users: 2 },
  { key: "Security", name: "Security", description: "Uses the system strictly to scan and verify digital gate passes.", modules: ["Gate & Security"], users: 9 },
  { key: "Driver", name: "Drivers", description: "Mobile app for trip assignments, fuel receipts, and PODs.", modules: ["Trips"], users: 34 },
  { key: "Customer Portals (External)", name: "Customer Portal", description: "External portal to submit logistics requests.", modules: ["Sister Portal"], users: 12 },
];

export const CHART_UTILISATION = [
  { label: "Mon", utilisation: 0, target: 80 },
  { label: "Tue", utilisation: 0, target: 80 },
  { label: "Wed", utilisation: 0, target: 80 },
  { label: "Thu", utilisation: 0, target: 80 },
  { label: "Fri", utilisation: 0, target: 80 },
  { label: "Sat", utilisation: 0, target: 80 },
  { label: "Sun", utilisation: 0, target: 80 },
];

export const CHART_TRIP_PERFORMANCE = [
  { label: "Wk 28", completed: 0, delayed: 0 },
  { label: "Wk 29", completed: 0, delayed: 0 },
  { label: "Wk 30", completed: 0, delayed: 0 },
  { label: "Wk 31", completed: 0, delayed: 0 },
  { label: "Wk 32", completed: 0, delayed: 0 },
  { label: "Wk 33", completed: 0, delayed: 0 },
];

export const CHART_FUEL = [
  { label: "Wk 28", actual: 0, standard: 0 },
  { label: "Wk 29", actual: 0, standard: 0 },
  { label: "Wk 30", actual: 0, standard: 0 },
  { label: "Wk 31", actual: 0, standard: 0 },
  { label: "Wk 32", actual: 0, standard: 0 },
  { label: "Wk 33", actual: 0, standard: 0 },
];

export const CHART_EXPENSE_SPLIT = [];

export const CHART_COST_REVENUE = [
  { label: "Mar", revenue: 0, cost: 0 },
  { label: "Apr", revenue: 0, cost: 0 },
  { label: "May", revenue: 0, cost: 0 },
  { label: "Jun", revenue: 0, cost: 0 },
  { label: "Jul", revenue: 0, cost: 0 },
  { label: "Aug", revenue: 0, cost: 0 },
];

import type { LoginReport } from "./types";
export const LOGIN_REPORTS: LoginReport[] = [];

