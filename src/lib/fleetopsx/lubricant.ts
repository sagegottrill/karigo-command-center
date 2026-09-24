/**
 * The Lubricant module's shared vocabulary.
 *
 * One department dispenses diesel and gas against a dispatch, so everything the
 * three lubricant screens show is described here once: what a tank looks like,
 * what a restock row is, what a disbursal carries, and how a trip's vehicle is
 * rendered. The COST is never carried in from a screen — it is computed on the
 * server from the Transport Manager's price per litre and snapshotted onto the
 * disbursal, so a price change never re-prices history.
 */
import { displayDriverAssigned, displayHeadCap, displayTailOption } from "./display-ids";
import { mapDriver, mapTail, mapTruckHead } from "./live-api";

export type LubricantFuel = "Diesel" | "Gas";

/** Litres for diesel, KG for gas — the caption every quantity is shown with. */
export function lubricantUnit(fuelType: string): string {
  return fuelType === "Gas" ? "KG" : "LITRES";
}

export function formatQuantity(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-NG");
}

/** `Diesel (60)` — the Lubricant column on the history table. */
export function lubricantWithQuantity(fuelType: string, quantity: number | null | undefined): string {
  return `${fuelType} (${formatQuantity(quantity)})`;
}

export function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
}

export interface LubricantStock {
  id: string;
  fuelType: LubricantFuel;
  quantity: number;
  minLevel: number;
  unit: string;
  low: boolean;
  updatedAt: string;
}

export interface LubricantRestock {
  id: string;
  reference: string;
  fuelType: LubricantFuel;
  quantity: number;
  loggedBy: string;
  /** What the delivery cost per litre, when the buyer recorded it. */
  unitCost?: number | null;
  createdAt: string;
}

/**
 * The Transport Manager's release of litres to one dispatch.
 *
 * Stored on the trip's own directCosts beside the request it answers, so an
 * authorization can never drift from the litre figure it caps.
 */
export interface LubricantApproval {
  litres: number;
  by: string;
  at: string;
}

export interface LubricantOverview {
  stocks: LubricantStock[];
  prices: Record<string, number>;
  counts: { restock: number; disbursal: number; requests: number };
  daily: { litres: Record<string, number>; amount: number; trucks: number };
  totals: { litres: Record<string, number>; amount: number };
}

/** Raw trip row the API returns alongside the resolved vehicle records. */
export interface LubricantTripRow {
  id: string;
  reference?: string;
  status?: string;
  driverName?: string;
  truckReg?: string;
  tailType?: string;
  tailNumber?: string;
  dropoff?: string;
  pickup?: string;
  customer?: string | null;
  cargo?: string;
  loadingSite?: string | null;
  createdAt?: string;
  approvedAt?: string | null;
  assignedAt?: string | null;
  dispatchedAt?: string | null;
  driver?: any;
  head?: any;
  tail?: any;
}

export interface LubricantRequestRow extends LubricantTripRow {
  request: { fuelType: LubricantFuel; quantity: number };
  unitPrice: number;
  estimatedAmount: number;
  /** Present once the Transport Manager has released litres for it. */
  approval?: LubricantApproval | null;
}

export interface LubricantDisbursalRow extends LubricantTripRow {
  tripId: string;
  reference: string;
  fuelType: LubricantFuel;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  dispensedBy: string;
  destination?: string | null;
  /** The receiving driver's signature captured at dispense (data URL), when taken. */
  signature?: string | null;
  createdAt: string;
  trip?: LubricantTripRow | null;
  /** The authority in force when it was pumped, if there was one. */
  approval?: LubricantApproval | null;
}

export interface LubricantFeedItem {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  at: string;
  tripId?: string;
  persisted?: boolean;
}

/**
 * One trip's vehicle, ready to render.
 *
 * Trips rarely store the driver/truck ids — the dispatch board carries the plate,
 * the tail number and the driver's name — so the API resolves either form and
 * this turns whatever came back into the five lines the detail block shows.
 */
export interface LubricantVehicle {
  capNumber: string;
  plate: string;
  bodyType: string;
  tailNumber: string;
  driverName: string;
  driverCode: string;
  driverPhone: string;
}

const dash = "—";

export function resolveVehicle(row: LubricantTripRow | null | undefined): LubricantVehicle {
  if (!row) {
    return { capNumber: dash, plate: dash, bodyType: dash, tailNumber: dash, driverName: dash, driverCode: "", driverPhone: dash };
  }
  const head = row.head ? mapTruckHead(row.head) : null;
  const tail = row.tail ? mapTail(row.tail) : null;
  const driver = row.driver
    ? mapDriver(row.driver)
    : row.driverName
      ? ({ name: row.driverName, phone: "" } as any)
      : null;

  // "GGE98YK / B035" — how the board stores the assigned vehicle.
  const [headPart, tailPart] = String(row.truckReg ?? "")
    .split("/")
    .map((p) => p.trim());

  const capNumber = displayHeadCap(head) || headPart || dash;
  const plate = head?.registration?.trim() || headPart || dash;
  const tailLabel = tail ? displayTailOption(tail) : tailPart || "";
  const bodyType = tail?.type?.trim() || row.tailType?.trim() || tailLabel || dash;
  const tailNumber = tail?.number?.trim() || row.tailNumber?.trim() || tailPart || dash;

  return {
    capNumber,
    plate,
    bodyType,
    tailNumber,
    driverName: driver?.name?.trim() || row.driverName?.trim() || dash,
    driverCode: driver ? displayDriverAssigned(driver, row.driverName ?? null).replace(driver.name, "").replace(/[()]/g, "").trim() : "",
    driverPhone: driver?.phone?.trim() || dash,
  };
}

/** "Marcus Sterling (SL-00829)" — the Driver Assigned line. */
export function driverLabel(vehicle: LubricantVehicle): string {
  return vehicle.driverName === dash ? dash : `${vehicle.driverName}${vehicle.driverCode ? ` (${vehicle.driverCode})` : ""}`;
}

/** What the department is being asked to hand over, e.g. "Diesel · 60 LITRES". */
export function requestLabel(request: { fuelType: string; quantity: number } | null | undefined): string {
  if (!request) return dash;
  return `${request.fuelType} · ${formatQuantity(request.quantity)} ${lubricantUnit(request.fuelType)}`;
}

/**
 * Job location — where the load is being collected. Falls back to the loading
 * site the partner named, then to the pickup point.
 */
export function jobLocation(row: LubricantTripRow | null | undefined): string {
  return row?.pickup?.trim() || row?.loadingSite?.trim() || dash;
}

/** Date range presets the reporting screens offer. */
export type LubricantRange = "All time" | "Today" | "This week" | "2 weeks" | "This month" | "2 months";

export const LUBRICANT_RANGES: LubricantRange[] = ["All time", "Today", "This week", "2 weeks", "This month", "2 months"];

/** Start of the window for a preset, or null for all time. */
export function rangeStart(range: LubricantRange, now = new Date()): Date | null {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (range) {
    case "Today":
      return start;
    case "This week": {
      const d = new Date(start);
      // Week starts on Monday, which is how the yard reads a roster week.
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return d;
    }
    case "2 weeks":
      return new Date(start.getTime() - 13 * 86400000);
    case "This month":
      return new Date(start.getFullYear(), start.getMonth(), 1);
    case "2 months":
      return new Date(start.getFullYear(), start.getMonth() - 1, 1);
    default:
      return null;
  }
}

export function withinRange(iso: string | null | undefined, range: LubricantRange): boolean {
  const start = rangeStart(range);
  if (!start) return true;
  if (!iso) return false;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return at >= start;
}

/**
 * `2026-09-15 08:45` for exported files — the spreadsheet column the office
 * actually reconciles against, rather than a locale string Excel must re-parse.
 */
export function csvStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The date the reporting table keys on: when the TM approved the dispatch. */
export function approvedDate(row: LubricantTripRow | null | undefined, fallback?: string | null): string | null {
  return row?.approvedAt ?? fallback ?? null;
}
