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

export const DRIVERS: Driver[] = [
  {
    "id": "DRV-1",
    "staffId": "P00851",
    "name": "Musa Garuba",
    "phone": "09075501315",
    "assignedTruckId": "P004",
    "truckReg": "P004 - FKJ753XR",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-2",
    "staffId": "P00971",
    "name": "Muhammed Musa Aliu",
    "phone": "07030511347",
    "assignedTruckId": "P005",
    "truckReg": "P005 - SBG566XR",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-3",
    "staffId": "P01019",
    "name": "Hassan Abdullahi",
    "phone": "08145511587",
    "assignedTruckId": "P007",
    "truckReg": "P007 - AAA494XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-4",
    "staffId": "P01018",
    "name": "Muhammad Musa",
    "phone": "09038840110",
    "assignedTruckId": "P009",
    "truckReg": "P009 - MUS10XB",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-5",
    "staffId": "P00935",
    "name": "Umar Abubakar",
    "phone": "07083922957",
    "assignedTruckId": "P011",
    "truckReg": "P011 - KSF928XQ",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-6",
    "staffId": "P01009",
    "name": "Mohammed Dauda",
    "phone": "08153465033",
    "assignedTruckId": "P012",
    "truckReg": "P012 - KSF929XQ",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-7",
    "staffId": "P00848",
    "name": "Adeyemi Sulaiman",
    "phone": "09050715348",
    "assignedTruckId": "P018",
    "truckReg": "P018 - JHN402XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-8",
    "staffId": "P01010",
    "name": "Abubakar Abdullai",
    "phone": "07049990982",
    "assignedTruckId": "P015",
    "truckReg": "P015 - SBG757ZY",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-9",
    "staffId": "P00989",
    "name": "Yusuf Muhammed",
    "phone": "08120760563",
    "assignedTruckId": "P034",
    "truckReg": "P034 - MKA982XW",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-10",
    "staffId": "P00934",
    "name": "Zakari Sanusi",
    "phone": "07040378057",
    "assignedTruckId": "P017",
    "truckReg": "P017 - GRR171XA ",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-11",
    "staffId": "P00997",
    "name": "Muktar Aliyu",
    "phone": "07069332210",
    "assignedTruckId": "P018",
    "truckReg": "P018 - JHN402XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-12",
    "staffId": "P00909",
    "name": "Oseni Ahmed",
    "phone": "08052479219",
    "assignedTruckId": "P018",
    "truckReg": "P018 - JHN402XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-14",
    "staffId": "P00879",
    "name": "Umoru Abdulmumuni",
    "phone": "08109223925",
    "assignedTruckId": "P021",
    "truckReg": "P021 - JHN506XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-15",
    "staffId": "P01006",
    "name": "Yahaya Alhassan",
    "phone": "09126144854",
    "assignedTruckId": "P022",
    "truckReg": "P022 - ZAR513XM",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-16",
    "staffId": "P00944",
    "name": "Junbrin Tela Musa",
    "phone": "07062551299",
    "assignedTruckId": "P023",
    "truckReg": "P023 - MKR508ZP",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-17",
    "staffId": "P00991",
    "name": "Jarfar Shuaibu",
    "phone": "08051319087",
    "assignedTruckId": "P024",
    "truckReg": "P024 - MKA434XV",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-19",
    "staffId": "P00891",
    "name": "Mohammed Ibrahim",
    "phone": "0912430289",
    "assignedTruckId": "P026",
    "truckReg": "P026 - BNG751ZF",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-20",
    "staffId": "P00963",
    "name": "Maniru Auwalu",
    "phone": "09034718790",
    "assignedTruckId": "P027",
    "truckReg": "P027 - GML365XX",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-21",
    "staffId": "P00910",
    "name": "Sani Mohammed",
    "phone": "09054677988",
    "assignedTruckId": "P028",
    "truckReg": "P028 - GML368XX",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-22",
    "staffId": "P00990",
    "name": "Musa Ibrahim",
    "phone": "09025182000",
    "assignedTruckId": "P029",
    "truckReg": "P029 - GRK177XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-23",
    "staffId": "P00966",
    "name": "Hassan Mohammed",
    "phone": "08089364110",
    "assignedTruckId": "P018",
    "truckReg": "P018 - JHN402XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-24",
    "staffId": "P00867",
    "name": "Ahmadu Ali",
    "phone": "07047558884",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-26",
    "staffId": "P00293",
    "name": "Mohammed",
    "phone": "08053160259",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-27",
    "staffId": "P01001",
    "name": "Adamu Muhammed",
    "phone": "07016779738",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-28",
    "staffId": "P01005",
    "name": "Abdullahi Adamu",
    "phone": "09055912576",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-29",
    "staffId": "P00983",
    "name": "Umar Adamu",
    "phone": "07016779738",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-31",
    "staffId": "P01001",
    "name": "Adamu Isah",
    "phone": "07060804674",
    "assignedTruckId": "P038",
    "truckReg": "P038 - RJA344XA",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-32",
    "staffId": "P00979",
    "name": "Usman Adamu",
    "phone": "09024703369",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-33",
    "staffId": "P00967",
    "name": "Ali Mohammed",
    "phone": "08030573776",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-34",
    "staffId": "P00501",
    "name": "Mohammed Musa",
    "phone": "08143180442",
    "assignedTruckId": "P041",
    "truckReg": "P041 - KNT783XP",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-35",
    "staffId": "P00981",
    "name": "Aderinde Muritala",
    "phone": "08127653596",
    "assignedTruckId": "P005",
    "truckReg": "P005 - SBG566XR",
    "category": "Local",
    "status": "Active"
  },
  {
    "id": "DRV-36",
    "staffId": "P00974",
    "name": "Mudasiru Lawal",
    "phone": "08064538189",
    "assignedTruckId": "P104",
    "truckReg": "P104 - KRD532YM",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-37",
    "staffId": "P00508",
    "name": "Umar Badamas",
    "phone": "08081732225",
    "assignedTruckId": "P040",
    "truckReg": "P040 - KNT781XP",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-38",
    "staffId": "P00950",
    "name": "Hassan Isa",
    "phone": "09073416980",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-39",
    "staffId": "P00806",
    "name": "Mohammed Shaibu",
    "phone": "08167314570",
    "assignedTruckId": "P068",
    "truckReg": "P068 - GGE90YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-40",
    "staffId": "P00985",
    "name": "Umbali Halilu",
    "phone": "09065243858",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-41",
    "staffId": "P00853",
    "name": "Lukman Ajasa",
    "phone": "08139495496",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-42",
    "staffId": "P01020",
    "name": "Zakari Mohammed",
    "phone": "08060347314",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-43",
    "staffId": "P00959",
    "name": "Hassan Abdullahi",
    "phone": "07042236908",
    "assignedTruckId": "P025",
    "truckReg": "P025 - MGN899ZJ",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-44",
    "staffId": "P01016",
    "name": "Maude Umar",
    "phone": "07042236908",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-46",
    "staffId": "P00221",
    "name": "Ibrahim Garuba",
    "phone": "081666697246",
    "assignedTruckId": "P055",
    "truckReg": "P055 - GGE85YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-47",
    "staffId": "P00883",
    "name": "Isiaka Haruna",
    "phone": "07017887954",
    "assignedTruckId": "P056",
    "truckReg": "P056 - GGE96YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-48",
    "staffId": "P00747",
    "name": "Mohammed Rabiu G",
    "phone": "07036442300",
    "assignedTruckId": "P214",
    "truckReg": "P214",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-50",
    "staffId": "DRV-49",
    "name": "Abdullazeez Mohammed",
    "phone": "08168010858",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-51",
    "staffId": "P00859",
    "name": "Yahya Aliyu",
    "phone": "08052965606",
    "assignedTruckId": "P059",
    "truckReg": "P059 - GGE91YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-52",
    "staffId": "P00952",
    "name": "Hamisu Isiya",
    "phone": "08035944433",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-53",
    "staffId": "P00733",
    "name": "Shamailu Dauda",
    "phone": "08078823106",
    "assignedTruckId": "P061",
    "truckReg": "P061 - GGE101YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-54",
    "staffId": "P00868",
    "name": "Idowu Adekola",
    "phone": "08123151938",
    "assignedTruckId": "P036",
    "truckReg": "P036 - BDA887XA",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-55",
    "staffId": "P00930",
    "name": "Monsuru Lamidi",
    "phone": "07048292784",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-56",
    "staffId": "P00970",
    "name": "Mohammed Auwalu",
    "phone": "0912951883",
    "assignedTruckId": "P064",
    "truckReg": "P064 - GGE105YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-57",
    "staffId": "P00856",
    "name": "Abdullahi Abubakar P",
    "phone": "08158607133",
    "assignedTruckId": "P065",
    "truckReg": "P065 - GGE95YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-58",
    "staffId": "P00992",
    "name": "Shafiu Haruna",
    "phone": "09055288341",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-59",
    "staffId": "P00911",
    "name": "Salisu Adamu",
    "phone": "08065879393",
    "assignedTruckId": "P067",
    "truckReg": "P067 - GGE99YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-61",
    "staffId": "P00831",
    "name": "Bashiru Yahaya",
    "phone": "08120347796",
    "assignedTruckId": "P030",
    "truckReg": "P030 - DKA317XQ",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-63",
    "staffId": "DRV-62",
    "name": "Idris Nuhu",
    "phone": "08057214692",
    "assignedTruckId": "P042",
    "truckReg": "P042 - KNT785XP",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-64",
    "staffId": "P00958",
    "name": "Usman Haruna",
    "phone": "07010327422",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-66",
    "staffId": "P00984",
    "name": "Saidu Usaini",
    "phone": "07068268909",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-67",
    "staffId": "P00502",
    "name": "Dogo Danladi",
    "phone": "08135883555",
    "assignedTruckId": "P074",
    "truckReg": "P074 - APP861YL",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-68",
    "staffId": "P00906",
    "name": "Samsudeen Yarema",
    "phone": "07078667189 / 08150457838",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-69",
    "staffId": "P00560",
    "name": "Abdullahi Haruna",
    "phone": "08035334386",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-70",
    "staffId": "P00885",
    "name": "Buba Hammah",
    "phone": "08067685525",
    "assignedTruckId": "P015",
    "truckReg": "P015 - SBG757ZY",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-71",
    "staffId": "P00516",
    "name": "Sanusi Mohammed",
    "phone": "08152808911",
    "assignedTruckId": "P078",
    "truckReg": "P078 - KRD280YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-72",
    "staffId": "P00956",
    "name": "Abdullahi Jidda",
    "phone": "07041243554",
    "assignedTruckId": "P079",
    "truckReg": "P079 - APP860YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-74",
    "staffId": "DRV-73",
    "name": "Usman B Garba",
    "phone": "08034337052",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-75",
    "staffId": "P00855",
    "name": "Mogaji Issa",
    "phone": "08035446246",
    "assignedTruckId": "P081",
    "truckReg": "P081 - FST570YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-76",
    "staffId": "P00704",
    "name": "Ganiyu Semiu",
    "phone": "08163467547",
    "assignedTruckId": "P082",
    "truckReg": "P082 - FST569YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-77",
    "staffId": "P00841",
    "name": "Salihu Mohammed",
    "phone": "08088574033",
    "assignedTruckId": "P083",
    "truckReg": "P083 - FST567YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-78",
    "staffId": "P00044",
    "name": "Ahmadu Illiyasu",
    "phone": "08136819489",
    "assignedTruckId": "P060",
    "truckReg": "P060 - GGE103YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-79",
    "staffId": "P00226",
    "name": "Abdullahi Ibrahim",
    "phone": "07039997235",
    "assignedTruckId": "P017",
    "truckReg": "P017 - GRR171XA ",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-80",
    "staffId": "P00975",
    "name": "Samaila Musa",
    "phone": "07033333176",
    "assignedTruckId": "P109",
    "truckReg": "P109 - AKD320YM",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-81",
    "staffId": "P00278",
    "name": "Muktar Ashimuyi",
    "phone": "08134557651",
    "assignedTruckId": "P045",
    "truckReg": "P045 - GGE100YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-82",
    "staffId": "P00318",
    "name": "Sanni Garuba",
    "phone": "08039689245",
    "assignedTruckId": "P071",
    "truckReg": "P071 - APP858YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-83",
    "staffId": "P00251",
    "name": "Abdullahi Abubakar",
    "phone": "08035394966",
    "assignedTruckId": "P073",
    "truckReg": "P073 - APP857YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-84",
    "staffId": "P00259",
    "name": "Bashiru Abdullahi",
    "phone": "07065639344",
    "assignedTruckId": "P080",
    "truckReg": "P080 - FST568YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-85",
    "staffId": "P00102",
    "name": "Danladi Adamu",
    "phone": "08100310555",
    "assignedTruckId": "P076",
    "truckReg": "P076 - APP863YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-86",
    "staffId": "P00063",
    "name": "Yakubu Abubakar Biu",
    "phone": "08068030799",
    "assignedTruckId": "P084",
    "truckReg": "P084 - KRD279YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-87",
    "staffId": "P00311",
    "name": "Muhammed Khalid",
    "phone": "09032514626",
    "assignedTruckId": "P048",
    "truckReg": "P048 - GGE86YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-89",
    "staffId": "DRV-88",
    "name": "Adewu (name unclear in scan)",
    "phone": "0703...(unreadable)",
    "assignedTruckId": "P053",
    "truckReg": "P053 - GGE97YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-90",
    "staffId": "P00672",
    "name": "Lawan Tijani",
    "phone": "07071941219",
    "assignedTruckId": "P049",
    "truckReg": "P049 - GGE104YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-91",
    "staffId": "P01015",
    "name": "Baballa Salisu",
    "phone": "08106764460",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-92",
    "staffId": "P00128",
    "name": "Bala Garuba",
    "phone": "07032047157",
    "assignedTruckId": "P070",
    "truckReg": "P070 - GGE93YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-93",
    "staffId": "P00716",
    "name": "Ibrahim Abubakar",
    "phone": "07010709327",
    "assignedTruckId": "P057",
    "truckReg": "P057 - GGE87YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-94",
    "staffId": "P00886",
    "name": "Illiasu Mohammed",
    "phone": "08034593978",
    "assignedTruckId": "P072",
    "truckReg": "P072",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-95",
    "staffId": "P00069",
    "name": "Ado Sanni",
    "phone": "08132172750",
    "assignedTruckId": "P085",
    "truckReg": "P085 - APP589YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-96",
    "staffId": "P00017",
    "name": "Saidu Sule",
    "phone": "08119310521",
    "assignedTruckId": "P083",
    "truckReg": "P083 - FST567YL",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-97",
    "staffId": "P00866",
    "name": "Yusuf Mohammed",
    "phone": "07050862772",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-98",
    "staffId": "P00903",
    "name": "Abdullahi Adamu",
    "phone": "09064472332",
    "assignedTruckId": "P044",
    "truckReg": "P044 - GGE109YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-99",
    "staffId": "P00933",
    "name": "Ibrahim Adamu",
    "phone": "08160057747",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-100",
    "staffId": "P00976",
    "name": "Hassan Umar Mamud",
    "phone": "08037055665",
    "assignedTruckId": "P064",
    "truckReg": "P064 - GGE105YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-101",
    "staffId": "P00834",
    "name": "Ibrahim Hassan",
    "phone": "08155643758",
    "assignedTruckId": "P020",
    "truckReg": "P020 - JHN504XA",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-102",
    "staffId": "P00913",
    "name": "Sanusi Abdullahi",
    "phone": "08034778605",
    "assignedTruckId": "P062",
    "truckReg": "P062 - GGE98YK",
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-103",
    "staffId": "P00771",
    "name": "Yahaya Alabi Moruf",
    "phone": "08155643758",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-105",
    "staffId": "DRV-104",
    "name": "Abdullahi Ahmad",
    "phone": "08054110004",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-106",
    "staffId": "P00923",
    "name": "Tijani Lawal Abba",
    "phone": "08080... (truncated in scan)",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Company",
    "status": "Active"
  },
  {
    "id": "DRV-107",
    "staffId": "P00905",
    "name": "Hussein Yinusa",
    "phone": "09048999210",
    "assignedTruckId": "P037",
    "truckReg": "P037 - RJA343XA",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-108",
    "staffId": "P00973",
    "name": "Samaila Ibrahim",
    "phone": "07066163662",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-109",
    "staffId": "P01017",
    "name": "Ali Umar",
    "phone": "08137429141",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-110",
    "staffId": "P00860",
    "name": "Ibrahim Aliyu",
    "phone": "07067252236",
    "assignedTruckId": "P048",
    "truckReg": "P048 - GGE86YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-111",
    "staffId": "P01011",
    "name": "Abba Mohammed",
    "phone": "09069690379",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-112",
    "staffId": "P00904",
    "name": "Nasiru Aminu",
    "phone": "09030042258",
    "assignedTruckId": "P059",
    "truckReg": "P059 - GGE91YK",
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-113",
    "staffId": "P00982",
    "name": "Hassan Mohammed",
    "phone": "08167736574",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-114",
    "staffId": "P00546",
    "name": "Rabiu Mohammed",
    "phone": "091119972893",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-115",
    "staffId": "P00839",
    "name": "Yahaya",
    "phone": "07058644392",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  },
  {
    "id": "DRV-116",
    "staffId": "P00850",
    "name": "Auwalu Musa",
    "phone": "08035958315",
    "assignedTruckId": null,
    "truckReg": null,
    "category": "Up Country",
    "status": "Active"
  }
];

export const TRUCK_HEADS: TruckHead[] = [
  {
    "id": "P001",
    "registration": "EPE 903 FS",
    "type": "Pickup",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P002",
    "registration": "KSF 72 YF",
    "type": "Pickup",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P004",
    "registration": "FKJ753XR",
    "type": "Short Body",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P005",
    "registration": "SBG566XR",
    "type": "Short Body",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P007",
    "registration": "AAA494XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P009",
    "registration": "MUS10XB",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P011",
    "registration": "KSF928XQ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P012",
    "registration": "KSF929XQ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P014",
    "registration": "GML376XX",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P015",
    "registration": "SBG757ZY",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P016",
    "registration": "GGW145XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P017",
    "registration": "GRR171XA ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P018",
    "registration": "JHN402XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P019",
    "registration": "JHN503XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P020",
    "registration": "JHN504XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P021",
    "registration": "JHN506XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P022",
    "registration": "ZAR513XM",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P023",
    "registration": "MKR508ZP",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P024",
    "registration": "MKA434XV",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P025",
    "registration": "MGN899ZJ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P026",
    "registration": "BNG751ZF",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P027",
    "registration": "GML365XX",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P028",
    "registration": "GML368XX",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P029",
    "registration": "GRK177XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P030",
    "registration": "DKA317XQ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P031",
    "registration": "DKA321XQ",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P032",
    "registration": "ZAR883XX",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P033",
    "registration": "SBG674XT",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P034",
    "registration": "MKA982XW",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P035",
    "registration": "BDA884XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P036",
    "registration": "BDA887XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P037",
    "registration": "RJA343XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P038",
    "registration": "RJA344XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P039",
    "registration": "RJA345XA",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P040",
    "registration": "KNT781XP",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P041",
    "registration": "KNT783XP",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P042",
    "registration": "KNT785XP",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P043",
    "registration": "KRD989YE",
    "type": "LOCAL",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P044",
    "registration": "GGE109YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P045",
    "registration": "GGE100YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P046",
    "registration": "GGE107YE",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P047",
    "registration": "GGE83YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P048",
    "registration": "GGE86YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P049",
    "registration": "GGE104YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P051",
    "registration": "GGE102YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P052",
    "registration": "GGE106YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P053",
    "registration": "GGE97YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P054",
    "registration": "GGE84YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P055",
    "registration": "GGE85YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P056",
    "registration": "GGE96YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P057",
    "registration": "GGE87YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P058",
    "registration": "GGE94YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P059",
    "registration": "GGE91YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P060",
    "registration": "GGE103YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P061",
    "registration": "GGE101YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P062",
    "registration": "GGE98YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P063",
    "registration": "GGE89YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P064",
    "registration": "GGE105YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P065",
    "registration": "GGE95YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P066",
    "registration": "GGE92YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P067",
    "registration": "GGE99YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P068",
    "registration": "GGE90YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P069",
    "registration": "GGE88YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P070",
    "registration": "GGE93YK",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P071",
    "registration": "APP858YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P073",
    "registration": "APP857YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P074",
    "registration": "APP861YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P075",
    "registration": "APP864YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P076",
    "registration": "APP863YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P077",
    "registration": "APP862YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P078",
    "registration": "KRD280YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P079",
    "registration": "APP860YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P080",
    "registration": "FST568YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P081",
    "registration": "FST570YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P082",
    "registration": "FST569YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P083",
    "registration": "FST567YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P084",
    "registration": "KRD279YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P085",
    "registration": "APP589YL",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P086",
    "registration": "MNY180XB",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P087",
    "registration": "KRD994YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P088",
    "registration": "KRD986YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P089",
    "registration": "KRD992YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P090",
    "registration": "KRD993YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P091",
    "registration": "KRD995YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P092",
    "registration": "KRD987YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P093",
    "registration": "KRD996YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P094",
    "registration": "KRD988YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P095",
    "registration": "KRD997YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P096",
    "registration": "KRD985YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P097",
    "registration": "KRD989YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P098",
    "registration": "KRD991YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P099",
    "registration": "KRD998YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P100",
    "registration": "KRD990YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P101",
    "registration": "KRD999YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P102",
    "registration": "AKD323YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P103",
    "registration": "AKD322YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P104",
    "registration": "KRD532YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P105",
    "registration": "AKD321YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P106",
    "registration": "KRD534YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P107",
    "registration": "AKD326YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P108",
    "registration": "AKD324YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P109",
    "registration": "AKD320YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P110",
    "registration": "AKD328YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P111",
    "registration": "AKD327YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P112",
    "registration": "AKD325YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P113",
    "registration": "KRD531YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P114",
    "registration": "KRD530YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P115",
    "registration": "AKD329YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P116",
    "registration": "KRD533YM",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P117",
    "registration": "KTU958YN",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P118",
    "registration": "KTU956YN",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P119",
    "registration": "KTU959YN",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P120",
    "registration": "KTU957YN",
    "type": "UPCOUNTRY",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "P999",
    "registration": "AGL496YN",
    "type": "Pickup",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  },
  {
    "id": "Petroline",
    "registration": "Saba",
    "type": "Factory",
    "make": "Unknown",
    "year": 2020,
    "status": "Available"
  }
];

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

