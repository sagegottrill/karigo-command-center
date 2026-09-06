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

export const COMPANIES: Company[] = [
  { id: "COM-001", name: "Saba Steel", contactPerson: "John Doe", phone: "+234 800 000 0001", email: "logistics@sabasteel.com", status: "Active" },
  { id: "COM-002", name: "NNPC Retail", contactPerson: "Jane Smith", phone: "+234 800 000 0002", email: "dispatch@nnpc.com", status: "Active" },
  { id: "COM-003", name: "Dangote Cement", contactPerson: "Mike Johnson", phone: "+234 800 000 0003", email: "transport@dangote.com", status: "Active" },
];

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

export const DRIVERS: Driver[] = Array.from({ length: 34 }, (_, i) => {
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const status = pick<Driver["status"]>([
    "Available", "Available", "Available", "Available", "On Trip", "Off Duty", "Suspended",
  ]);
  const compliance = pick<Driver["compliance"]>([
    "Valid", "Valid", "Valid", "Valid", "Valid", "Expiring Soon", "Expired",
  ]);
  return {
    id: `DRV-${pad(i + 1)}`,
    name,
    employeeId: `PTL-EMP-${pad(1200 + i, 4)}`,
    salaryNumber: `SAL-${pad(1000 + i, 4)}`,
    phone: `+234 8${int(0, 9)}${int(10, 99)} ${int(100, 999)} ${int(1000, 9999)}`,
    department: "Transport Operations",
    dateJoined: `${int(1, 28)} ${pick(["Jan", "Mar", "Jun", "Aug", "Oct"])} 20${int(18, 24)}`,
    licenseNumber: `NG-${pick(["LAG", "ABJ", "PHC", "KAN"])}-${int(100000, 999999)}`,
    licenseCategory: pick(["Class E", "Class F", "Class G"]),
    licenseExpiry: `${int(1, 28)} ${pick(["Feb", "May", "Sep", "Nov"])} 202${int(6, 8)}`,
    compliance,
    experienceYears: int(2, 21),
    status,
    assignedTruck: null,
    currentTripId: null,
    tripsCompleted: int(24, 480),
    safetyScore: int(72, 99),
    initials: name.split(" ").map((p) => p[0]).join(""),
  };
});

export const TRUCK_HEADS: TruckHead[] = Array.from({ length: 28 }, (_, i) => {
  const city = pick(CITIES);
  const [lat, lng] = COORDS[city]!;
  const status = pick<TruckHead["status"]>([
    "Available", "Available", "Assigned", "In Transit", "In Transit",
    "Maintenance", "Out of Service",
  ]);
  return {
    id: `TRH-${pad(101 + i)}`,
    number: `H${pad(101 + i)}`,
    capNumber: `CAP-${pad(101 + i)}`,
    registration: `${pick(["LAG", "ABJ", "PHC", "KAN"])}-${int(100, 999)}-${pick(["XA", "ZB", "QT", "MK", "RV"])}`,
    make: pick(MAKES),
    year: int(2015, 2024),
    status,
    location: city,
    odometer: int(48000, 480000),
    standardEfficiency: Number((2.6 + r() * 1.2).toFixed(1)),
    lat: lat + (r() - 0.5) * 1.4,
    lng: lng + (r() - 0.5) * 1.4,
  };
});

export const TRUCK_TAILS: TruckTail[] = Array.from({ length: 35 }, (_, i) => {
  const city = pick(CITIES);
  const [lat, lng] = COORDS[city]!;
  const status = pick<TruckTail["status"]>([
    "Available", "Available", "Assigned", "In Transit", "In Transit",
    "Maintenance", "Out of Service",
  ]);
  return {
    id: `TRT-${pad(101 + i)}`,
    number: `T${pad(101 + i)}`,
    registration: `TRL-${int(100, 999)}-${pick(["XA", "ZB", "QT"])}`,
    type: pick(TRUCK_TYPES),
    status,
    location: city,
    lat: lat + (r() - 0.5) * 1.4,
    lng: lng + (r() - 0.5) * 1.4,
  };
});

export const TRUCKS = [
  ...TRUCK_HEADS.map(t => ({ ...t, type: "Head" as const })),
  ...TRUCK_TAILS.map(t => ({ ...t, type: "Tail" as const }))
];

const TRIP_STATUSES: Trip["status"][] = [
  "En Route", "En Route", "Loaded", "Offloading", "Returning", "Delayed",
  "Completed", "Completed", "Scheduled", "Stopped",
];

export const TRIPS: Trip[] = Array.from({ length: 56 }, (_, i) => {
  const head = TRUCK_HEADS[i % TRUCK_HEADS.length]!;
  const tail = TRUCK_TAILS[i % TRUCK_TAILS.length]!;
  const driver = DRIVERS[i % DRIVERS.length]!;
  let pickupCity = pick(CITIES);
  let dropCity = pick(CITIES);
  if (dropCity === pickupCity) dropCity = CITIES[(CITIES.indexOf(pickupCity) + 3) % CITIES.length]!;
  const status = i === 0 ? "En Route" : TRIP_STATUSES[i % TRIP_STATUSES.length]!;
  const distance = int(120, 890);
  const [lat, lng] = COORDS[pickupCity]!;
  const id = `TRP-${pad(820 + i, 5)}`;
  if (status !== "Completed" && status !== "Scheduled") {
    driver.currentTripId = id;
    driver.assignedTruck = `${head.id} + ${tail.id}`;
  }
  return {
    id,
    customer: pick(CUSTOMERS),
    cargo: pick(CARGO),
    pickup: pickupCity,
    dropoff: dropCity,
    headId: head.id,
    tailId: tail.id,
    tailType: tail.type,
    tailNumber: tail.number,
    truckReg: `${head.registration} / ${tail.registration}`,
    driverId: driver.id,
    driverName: driver.name,
    directCosts: {
      tripAllowance: int(5, 15) * 1000,
      returnWaybill: int(1, 5) * 1000,
      motorBoy: int(2, 6) * 1000,
      ticket: int(1, 3) * 1000,
      extraAllowance: int(0, 10) * 1000,
      lubricantType: pick(["Diesel", "Gas"]),
    },
    status,
    priority: pick(["Normal", "Normal", "High", "Critical", "Low"]),
    distanceKm: distance,
    durationLabel: `${Math.floor(distance / 62)}h ${int(5, 55)}m`,
    scheduledDate: `${int(1, 12)} Aug 2026`,
    startTime: `${pad(int(4, 20), 2)}:${pad(int(0, 59), 2)}`,
    eta: `${pad(int(4, 23), 2)}:${pad(int(0, 59), 2)}`,
    progress: status === "Completed" ? 100 : int(8, 92),
    lat: lat + (r() - 0.5) * 2,
    lng: lng + (r() - 0.5) * 2,
    revenue: int(850, 6400) * 1000,
  };
});

// Seed one manual Requested order from a PWA customer for demo purposes
TRIPS.unshift({
  id: "TRP-00810",
  customer: "Dangote (PWA)",
  cargo: "600 Bags Cement",
  pickup: "Obajana Plant, Kogi",
  dropoff: "Lekki, Lagos",
  status: "Requested",
  priority: "Normal",
  distanceKm: 550,
  durationLabel: "-",
  scheduledDate: "13 Aug 2026",
  startTime: "-",
  eta: "-",
  progress: 0,
  lat: 7.915,
  lng: 6.079,
  revenue: 0,
});

export const FEATURED_TRIP_ID = "TRP-00842";
TRIPS[22]!.id = FEATURED_TRIP_ID;
TRIPS[22]!.pickup = "Lagos";
TRIPS[22]!.dropoff = "Abuja";
TRIPS[22]!.status = "En Route";
TRIPS[22]!.distanceKm = 387;
TRIPS[22]!.durationLabel = "6h 20m";
TRIPS[22]!.progress = 62;
TRIPS[22]!.customer = "NNPC Retail";
TRIPS[22]!.cargo = "PMS 45,000L";

export const FUEL_REQUISITIONS: FuelRequisition[] = Array.from({ length: 24 }, (_, i) => {
  const trip = TRIPS[i]!;
  const eff = Number((2.6 + r() * 1.1).toFixed(1));
  const litres = Math.round(trip.distanceKm / eff);
  const status = pick<FuelRequisition["status"]>(["Pending", "Approved", "Approved", "Rejected"]);
  return {
    id: `REQ-${pad(270 + i, 5)}`,
    tripId: trip.id,
    truckReg: trip.truckReg,
    driverName: trip.driverName,
    requiredLitres: litres + int(0, 40),
    approvedLitres: status === "Approved" ? litres : null,
    expectedConsumption: litres,
    standardEfficiency: eff,
    odometer: int(52000, 470000),
    status,
    date: `${int(1, 12)} Aug 2026`,
    cost: litres * 1195,
  };
});

const DEFECTS = [
  "Brake air leak", "Engine overheating", "Gearbox slipping", "Front tyre wear",
  "Faulty alternator", "Suspension noise", "Clutch failure", "Headlamp fault",
  "Coolant leak", "Turbo underboost", "Steering play", "Trailer light fault",
];
const MECHANICS = ["Idris Bako", "Chuka Nwosu", "Sola Adebayo", "Aminu Tijjani", "Victor Etim"];

export const WORK_ORDERS: WorkOrder[] = Array.from({ length: 27 }, (_, i) => ({
  id: `WO-${pad(920 + i, 5)}`,
  truckReg: TRUCK_HEADS[i % TRUCK_HEADS.length]!.registration,
  defect: pick(DEFECTS),
  category: pick(["Brakes", "Engine", "Transmission", "Electrical", "Tyres", "Body"]),
  priority: pick(["Low", "Medium", "High", "Critical"]),
  mechanic: pick(MECHANICS),
  status: pick(["Reported", "Diagnosing", "Awaiting Parts", "Repairing", "Testing", "Completed"]),
  reportedBy: DRIVERS[i % DRIVERS.length]!.name,
  reportedAt: `${int(1, 12)} Aug 2026 ${pad(int(6, 19), 2)}:${pad(int(0, 59), 2)}`,
  cost: int(35, 940) * 1000,
}));

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

export const INVENTORY: InventoryItem[] = Array.from({ length: 42 }, (_, i) => {
  const base = PARTS[i % PARTS.length]!;
  const stock = int(0, 90);
  const reorder = int(12, 40);
  return {
    id: `INV-${pad(i + 1, 4)}`,
    name: i < PARTS.length ? base[0]! : `${base[0]!} ${pick(["MK II", "HD", "OEM", "Heavy"])}`,
    sku: `${base[1]}-${pad(int(10, 999))}`,
    category: base[2]!,
    stock,
    reorderLevel: reorder,
    unitCost: int(6, 480) * 1000,
    location: pick(["Lagos Store A", "Lagos Store B", "Abuja Store", "PHC Store"]),
    status: stock === 0 ? "Out of Stock" : stock <= reorder ? "Low Stock" : "In Stock",
  };
});
INVENTORY[0] = { ...INVENTORY[0]!, name: "Brake Pad", sku: "BRK-042", stock: 18, reorderLevel: 20, status: "Low Stock" };

export const INVENTORY_REQUISITIONS: InventoryRequisition[] = Array.from({ length: 18 }, (_, i) => ({
  id: `IRQ-${pad(400 + i, 5)}`,
  workOrder: WORK_ORDERS[i % WORK_ORDERS.length]!.id,
  truckReg: WORK_ORDERS[i % WORK_ORDERS.length]!.truckReg,
  mechanic: pick(MECHANICS),
  part: INVENTORY[i % INVENTORY.length]!.name,
  quantity: int(1, 8),
  reason: pick(["Scheduled replacement", "Failed component", "Preventive maintenance", "Accident damage"]),
  status: pick(["Pending", "Released", "Released", "Rejected"]),
  date: `${int(1, 12)} Aug 2026`,
}));

export const PROCUREMENT_REQUESTS: ProcurementRequest[] = Array.from({ length: 12 }, (_, i) => ({
  id: `PRQ-${pad(100 + i, 5)}`,
  partName: pick(PARTS)[0]!,
  quantity: int(2, 20),
  linkedId: WORK_ORDERS[i % WORK_ORDERS.length]!.id,
  status: pick(["Requested", "Sourcing", "Procured", "Requested"]),
  date: `${int(1, 12)} Aug 2026`,
}));

export const EXPENSES: Expense[] = Array.from({ length: 34 }, (_, i) => {
  const amount = int(45, 1800) * 1000;
  return {
    id: `EXP-${pad(460 + i, 5)}`,
    type: pick(["Toll", "Allowance", "Fuel", "Repairs", "Logistics", "Other"]),
    requester: DRIVERS[i % DRIVERS.length]!.name,
    amount,
    standardRate: Math.round(amount * (0.8 + r() * 0.35)),
    tripId: TRIPS[i % TRIPS.length]!.id,
    status: pick(["Pending", "Pending", "Approved", "Approved", "Rejected", "Clarification"]),
    approvalLevel: pick(["Level 1 — Supervisor", "Level 2 — Accounts", "Level 3 — Management"]),
    date: `${int(1, 12)} Aug 2026`,
    documents: ["receipt-scan.pdf", "waybill.jpg"],
  };
});
EXPENSES[21] = {
  ...EXPENSES[21]!,
  id: "EXP-00481",
  amount: 840000,
  standardRate: 620000,
  status: "Pending",
  type: "Repairs",
  approvalLevel: "Level 3 — Management",
};

export const GATE_ENTRIES: GateEntry[] = Array.from({ length: 26 }, (_, i) => ({
  id: `GTE-${pad(300 + i, 5)}`,
  time: `12 Aug 2026 — ${pad(int(5, 20), 2)}:${pad(int(0, 59), 2)}:${pad(int(0, 59), 2)}`,
  asset: TRUCK_HEADS[i % TRUCK_HEADS.length]!.registration,
  driver: DRIVERS[i % DRIVERS.length]!.name,
  direction: i % 2 === 0 ? "Incoming" : "Outgoing",
  purpose: pick(["Loading", "Offloading", "Maintenance", "Parking", "Inspection", "Visitor"]),
  yard: pick(TENANT.locations),
  cargo: pick(["Empty", ...CARGO]),
  officer: pick(["Sgt. Musa Danjuma", "Officer Grace Ile", "Officer Bola Ade", "Sgt. Peter Obi"]),
  reference: `TRP-${pad(820 + i, 5)}`,
}));

export const NOTIFICATIONS: Notification[] = [
  { id: "NTF-001", category: "Engineering", title: "Critical defect reported", body: "TRK-071 brake air leak flagged by driver during pre-trip inspection.", time: "2 min ago", read: false, severity: "critical" },
  { id: "NTF-002", category: "Approvals", title: "Expense requires approval", body: "EXP-00481 — ₦840,000 repairs expense awaiting management approval.", time: "9 min ago", read: false, severity: "warning" },
  { id: "NTF-003", category: "Operations", title: "Trip status changed", body: "TRP-00842 moved to Loaded at Lagos depot.", time: "14 min ago", read: false, severity: "info" },
  { id: "NTF-004", category: "Compliance", title: "Driver licence expiring", body: "Ibrahim Bello — licence expires in 14 days.", time: "38 min ago", read: false, severity: "warning" },
  { id: "NTF-005", category: "Security", title: "Gate event recorded", body: "LAG-482-XA exited Lagos HQ yard — purpose: Loading.", time: "51 min ago", read: true, severity: "info" },
  { id: "NTF-006", category: "Operations", title: "Dispatch created", body: "TRP-00871 created for Dangote Cement — Ibadan → Kano.", time: "1 hr ago", read: true, severity: "success" },
  { id: "NTF-007", category: "Engineering", title: "Work order updated", body: "WO-00931 moved to Awaiting Parts.", time: "1 hr ago", read: true, severity: "info" },
  { id: "NTF-008", category: "System", title: "Sync pending", body: "12 field records queued for synchronization.", time: "2 hrs ago", read: true, severity: "warning" },
  { id: "NTF-009", category: "Approvals", title: "Fuel requisition approved", body: "REQ-00281 approved — 340 L released.", time: "2 hrs ago", read: true, severity: "success" },
  { id: "NTF-010", category: "Operations", title: "Trip delayed", body: "TRP-00836 delayed at Lokoja checkpoint — 1h 40m behind ETA.", time: "3 hrs ago", read: true, severity: "warning" },
  { id: "NTF-011", category: "Compliance", title: "Driver suspended", body: "DRV-019 suspended pending disciplinary review.", time: "3 hrs ago", read: true, severity: "critical" },
  { id: "NTF-012", category: "Engineering", title: "Repair completed", body: "WO-00918 completed — TRK-112 returned to service.", time: "4 hrs ago", read: true, severity: "success" },
  { id: "NTF-013", category: "Security", title: "Asset movement", body: "Generator set moved from Lagos HQ to Abuja Depot.", time: "5 hrs ago", read: true, severity: "info" },
  { id: "NTF-014", category: "Approvals", title: "Spare parts requisition", body: "IRQ-00408 pending store release approval.", time: "5 hrs ago", read: true, severity: "info" },
  { id: "NTF-015", category: "Operations", title: "Trip completed", body: "TRP-00828 completed — Port Harcourt → Enugu.", time: "6 hrs ago", read: true, severity: "success" },
  { id: "NTF-016", category: "System", title: "Report generated", body: "Monthly fuel variance report is ready for download.", time: "7 hrs ago", read: true, severity: "info" },
  { id: "NTF-017", category: "Compliance", title: "Insurance renewal", body: "Fleet insurance for 6 units expires in 30 days.", time: "8 hrs ago", read: true, severity: "warning" },
  { id: "NTF-018", category: "Engineering", title: "Low stock alert", body: "Brake Pad (BRK-042) below reorder level — 18 remaining.", time: "9 hrs ago", read: true, severity: "warning" },
  { id: "NTF-019", category: "Operations", title: "Driver assigned", body: "DRV-028 assigned to trip TRP-00842.", time: "10 hrs ago", read: true, severity: "info" },
  { id: "NTF-020", category: "Security", title: "Visitor logged", body: "Contractor crew signed in at Port Harcourt Yard.", time: "11 hrs ago", read: true, severity: "info" },
  { id: "NTF-021", category: "Approvals", title: "Expense rejected", body: "EXP-00468 rejected — variance above threshold.", time: "12 hrs ago", read: true, severity: "critical" },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "CNV-TRIP-842",
    kind: "trip",
    name: "TRP-00842 Operations Thread",
    subtitle: "Lagos → Abuja · NNPC Retail",
    unread: 3,
    lastAt: "10:42",
    tripId: FEATURED_TRIP_ID,
    participants: ["Dispatcher", "Driver", "Fleet Manager", "Accounts", "Management"],
    messages: [
      { id: "m1", author: "Adaeze Nwoke", role: "Dispatcher", body: "TRK-104 loaded at Apapa. Waybill uploaded to the trip file.", time: "09:12" },
      { id: "m2", author: "Emeka Okafor", role: "Driver", body: "Confirmed. Departing gate now, tank full at 420 L.", time: "09:20" },
      { id: "m3", author: "Musa Danjuma", role: "Fleet Manager", body: "Keep to the Lokoja route. Avoid Okene diversion, road works reported.", time: "09:41" },
      { id: "m4", author: "Grace Ile", role: "Accounts", body: "Toll allowance of ₦46,000 approved and disbursed.", time: "10:05" },
      { id: "m5", author: "Emeka Okafor", role: "Driver", body: "Passed Ibadan tollgate. ETA still 16:20.", time: "10:42" },
    ],
  },
  {
    id: "CNV-CH-OPS",
    kind: "channel",
    name: "Operations",
    subtitle: "24 members",
    unread: 5,
    lastAt: "10:31",
    participants: ["Operations"],
    messages: [
      { id: "m1", author: "Adaeze Nwoke", role: "Dispatcher", body: "Morning dispatch board is locked. 42 active trips today.", time: "07:02" },
      { id: "m2", author: "Tunde Balogun", role: "Ops Manager", body: "Two units short in Kano. Pulling TRK-118 from standby.", time: "08:44" },
      { id: "m3", author: "Adaeze Nwoke", role: "Dispatcher", body: "Noted. Reassigning DRV-021 to that unit.", time: "10:31" },
    ],
  },
  {
    id: "CNV-CH-ENG",
    kind: "channel",
    name: "Engineering",
    subtitle: "11 members",
    unread: 0,
    lastAt: "09:58",
    participants: ["Engineering"],
    messages: [
      { id: "m1", author: "Idris Bako", role: "Mechanic", body: "WO-00931 waiting on brake pads. Store shows 18 units.", time: "09:12" },
      { id: "m2", author: "Chuka Nwosu", role: "Engineer", body: "Raise the requisition, I'll approve the release.", time: "09:58" },
    ],
  },
  {
    id: "CNV-CH-ACC",
    kind: "channel",
    name: "Accounts",
    subtitle: "8 members",
    unread: 2,
    lastAt: "10:11",
    participants: ["Accounts"],
    messages: [
      { id: "m1", author: "Grace Ile", role: "Accountant", body: "18 expenses pending, ₦4.82M exposure this week.", time: "10:11" },
    ],
  },
  {
    id: "CNV-CH-SEC",
    kind: "channel",
    name: "Security",
    subtitle: "9 members",
    unread: 0,
    lastAt: "08:20",
    participants: ["Security"],
    messages: [
      { id: "m1", author: "Sgt. Musa Danjuma", role: "Security Officer", body: "Night shift log closed. 14 units inside Lagos yard.", time: "08:20" },
    ],
  },
  {
    id: "CNV-DM-1",
    kind: "direct",
    name: "Tunde Balogun",
    subtitle: "Operations Manager",
    unread: 1,
    lastAt: "10:15",
    participants: ["Tunde Balogun"],
    messages: [
      { id: "m1", author: "Tunde Balogun", role: "Operations Manager", body: "Can you pull the fuel variance for the Kano corridor?", time: "10:15" },
    ],
  },
  {
    id: "CNV-DM-2",
    kind: "direct",
    name: "Grace Ile",
    subtitle: "Accountant",
    unread: 0,
    lastAt: "Yesterday",
    participants: ["Grace Ile"],
    messages: [
      { id: "m1", author: "Grace Ile", role: "Accountant", body: "EXP-00481 escalated to management level.", time: "17:40" },
    ],
  },
  {
    id: "CNV-TRIP-836",
    kind: "trip",
    name: "TRP-00836 Operations Thread",
    subtitle: "Port Harcourt → Enugu · Seplat",
    unread: 0,
    lastAt: "Yesterday",
    participants: ["Dispatcher", "Driver", "Fleet Manager"],
    messages: [
      { id: "m1", author: "Chinedu Eze", role: "Driver", body: "Held at Lokoja checkpoint, documents being verified.", time: "15:22" },
    ],
  },
];

export const AUDIT_LOGS: AuditLog[] = Array.from({ length: 40 }, (_, i) => ({
  id: `AUD-${pad(i + 1, 5)}`,
  timestamp: `12 Aug 2026 ${pad(int(6, 20), 2)}:${pad(int(0, 59), 2)}`,
  user: pick(["Admin User", "Adaeze Nwoke", "Tunde Balogun", "Grace Ile", "Idris Bako", "Sgt. Musa Danjuma"]),
  module: pick(["Dispatch", "Accounts", "Engineering", "Inventory", "Gate", "Administration", "Fuel"]),
  action: pick(["Updated Trip", "Approved Expense", "Created Work Order", "Released Parts", "Recorded Gate Entry", "Changed Role", "Approved Requisition"]),
  record: pick([FEATURED_TRIP_ID, "EXP-00481", "WO-00931", "IRQ-00408", "GTE-00312", "USR-0014", "REQ-00281"]),
  device: pick(["Web", "Web", "Android", "Web"]),
  ip: `102.${int(10, 250)}.${int(1, 250)}.${int(2, 250)}`,
}));

export const ACTIVITY: ActivityEvent[] = [
  { id: "A1", reference: "TRK-104", module: "Fleet", action: "Trip status changed to Loaded", user: "Adaeze Nwoke", time: "10:42", tone: "info" },
  { id: "A2", reference: "DRV-028", module: "Dispatch", action: "Driver assigned to Trip TRP-00842", user: "Adaeze Nwoke", time: "10:37", tone: "success" },
  { id: "A3", reference: "REQ-00281", module: "Fuel", action: "Fuel requisition approved — 340 L", user: "Grace Ile", time: "10:22", tone: "success" },
  { id: "A4", reference: "WO-00931", module: "Engineering", action: "Workshop repair order created", user: "Chuka Nwosu", time: "10:04", tone: "warning" },
  { id: "A5", reference: "EXP-00481", module: "Accounts", action: "Toll expense submitted — ₦840,000", user: "Emeka Okafor", time: "09:51", tone: "warning" },
  { id: "A6", reference: "GTE-00312", module: "Gate", action: "Vehicle exited Lagos HQ yard", user: "Sgt. Musa Danjuma", time: "09:38", tone: "info" },
  { id: "A7", reference: "TRK-071", module: "Engineering", action: "Critical defect reported — brake air leak", user: "Ibrahim Bello", time: "09:14", tone: "critical" },
  { id: "A8", reference: "IRQ-00408", module: "Inventory", action: "Spare parts requisition raised", user: "Idris Bako", time: "08:59", tone: "info" },
  { id: "A9", reference: "TRP-00828", module: "Trips", action: "Trip completed — Port Harcourt → Enugu", user: "System", time: "08:20", tone: "success" },
  { id: "A10", reference: "USR-0014", module: "Administration", action: "Role changed to Fleet Manager", user: "Admin User", time: "07:58", tone: "info" },
];

export const ALERTS: AlertItem[] = [
  { id: "AL1", level: "Critical", message: "Truck TRK-071 requires immediate maintenance.", reference: "WO-00931" },
  { id: "AL2", level: "Warning", message: "Driver licence expires in 14 days — Ibrahim Bello.", reference: "DRV-014" },
  { id: "AL3", level: "Approval", message: "₦840,000 operational expense requires management approval.", reference: "EXP-00481" },
  { id: "AL4", level: "System", message: "12 records waiting for synchronization.", reference: "SYNC-QUEUE" },
  { id: "AL5", level: "Warning", message: "Brake Pad (BRK-042) below reorder level.", reference: "INV-0001" },
];

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
  email: role === "Platform Admin" ? "admin@fleetopsx.com" : `${(name as string).toLowerCase().replace(/[^a-z]+/g, ".")}@petroline.ng`,
  username: role === "Platform Admin" ? "admin" : `${(name as string).split(" ")[0]!.charAt(0).toLowerCase()}${(name as string).split(" ")[1]!.toLowerCase()}`,
  roles: [role as User["roles"][0]],
  roleNames: [roleName as string],
  department: department as string,
  status: i === 8 ? "Invited" : "Active",
  passwordResetRequired: i === 1,
  lastActive: `${int(1, 59)} min ago`,
  initials: (name as string).split(" ").map((p) => p[0]).join("").slice(0, 2),
  // Platform Admin (i=0) has no companyId — they're platform-level.
  // All other Petroline users belong to tenant tnt_001.
  companyId: i === 0 ? undefined : "tnt_001",
  // External partner gets their partner company name
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
  { label: "Mon", utilisation: 74, target: 80 },
  { label: "Tue", utilisation: 78, target: 80 },
  { label: "Wed", utilisation: 82, target: 80 },
  { label: "Thu", utilisation: 71, target: 80 },
  { label: "Fri", utilisation: 88, target: 80 },
  { label: "Sat", utilisation: 64, target: 80 },
  { label: "Sun", utilisation: 52, target: 80 },
];

export const CHART_TRIP_PERFORMANCE = [
  { label: "Wk 28", completed: 168, delayed: 22 },
  { label: "Wk 29", completed: 181, delayed: 19 },
  { label: "Wk 30", completed: 175, delayed: 31 },
  { label: "Wk 31", completed: 194, delayed: 14 },
  { label: "Wk 32", completed: 202, delayed: 17 },
  { label: "Wk 33", completed: 188, delayed: 26 },
];

export const CHART_FUEL = [
  { label: "Wk 28", actual: 3.0, standard: 3.2 },
  { label: "Wk 29", actual: 3.1, standard: 3.2 },
  { label: "Wk 30", actual: 2.8, standard: 3.2 },
  { label: "Wk 31", actual: 3.3, standard: 3.2 },
  { label: "Wk 32", actual: 3.2, standard: 3.2 },
  { label: "Wk 33", actual: 3.4, standard: 3.2 },
];

export const CHART_EXPENSE_SPLIT = [
  { name: "Fuel", value: 42 },
  { name: "Repairs", value: 24 },
  { name: "Tolls", value: 14 },
  { name: "Allowances", value: 12 },
  { name: "Other", value: 8 },
];

export const CHART_COST_REVENUE = [
  { label: "Mar", revenue: 218, cost: 154 },
  { label: "Apr", revenue: 241, cost: 168 },
  { label: "May", revenue: 262, cost: 171 },
  { label: "Jun", revenue: 249, cost: 180 },
  { label: "Jul", revenue: 288, cost: 186 },
  { label: "Aug", revenue: 312, cost: 194 },
];

import type { LoginReport } from "./types";
export const LOGIN_REPORTS: LoginReport[] = USERS.map((u, i) => ({
  id: `LOG-${pad(i + 1, 5)}`,
  userId: u.id,
  name: u.name,
  role: u.role,
  timestamp: `12 Aug 2026 ${pad(int(6, 11), 2)}:${pad(int(0, 59), 2)}`,
  device: pick(["Web", "Web", "Mobile (Android)", "Mobile (iOS)"]),
  ip: `102.${int(10, 250)}.${int(1, 250)}.${int(2, 250)}`,
  status: "Success",
}));
