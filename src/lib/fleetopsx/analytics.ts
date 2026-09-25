import { inPeriod, type PeriodRange } from "./period";
import { partnerOf } from "./tracking-ops";
import { tripBucket, type TripBucket } from "./status-buckets";
import type { Trip } from "./types";
import type { LubricantDisbursalRow, LubricantRestock, LubricantStock } from "./lubricant";

/**
 * The Analytics & Reports engine — ONE honest report out of the live truth.
 *
 * Every figure is computed here, in the browser, from the same lists the
 * department screens read — never from a stat card, a memo, or a number
 * somebody typed. Three rules carry the whole module:
 *
 *  - **A window or it is not a report.** Every section filters through the
 *    same `inPeriod` over the same range, so "diesel to Saba Steel in two
 *    weeks" means the same two weeks everywhere on the page.
 *  - **Money is what the platform actually recorded.** Direct cost is the
 *    allowances Fleet Ops committed per dispatch; fuel cost is what the
 *    department's own dispense rows cost at the TM's rate; the tank is worth
 *    its balance at the last recorded delivery price. Nothing is estimated.
 *  - **A figure the platform cannot compute is labelled, not invented.** An
 *    all-zero table prints its empty line; a utilisation with no heads is
 *    drawn as "—" by the screen, never guessed at a percentage here.
 */

/** The allowance keys the platform commits per dispatch (directCosts). */
function directCostOf(trip: Trip): number {
  const c = trip.directCosts;
  if (!c) return 0;
  return (
    Number(c.tripAllowance ?? 0) +
    Number(c.returnWaybill ?? 0) +
    Number(c.motorBoy ?? 0) +
    Number(c.ticket ?? 0) +
    Number(c.extraAllowance ?? 0) +
    Number(c.bonus ?? 0)
  );
}

export type CompanyReport = {
  partner: string;
  requests: number;
  completed: number;
  inTransit: number;
  directCost: number;
  dieselQty: number;
  gasQty: number;
  fuelCost: number;
  destinations: number;
};

export type DriverReport = {
  driver: string;
  trips: number;
  completed: number;
  litres: number;
  fuelCost: number;
};

export type DestinationReport = {
  destination: string;
  trips: number;
  completed: number;
  directCost: number;
  litres: number;
};

export type FuelReport = {
  fuelType: string;
  unit: string;
  dispensedQty: number;
  dispensedCost: number;
  pours: number;
  restockedQty: number;
  restockedCost: number;
  tankQty: number;
  tankMin: number;
  tankLow: boolean;
};

export type TrendPoint = {
  day: string;
  requests: number;
  completed: number;
  litres: number;
  cost: number;
};

export type FleetReport = {
  requests: number;
  approved: number;
  inTransit: number;
  completed: number;
  declined: number;
  directCost: number;
  fuelCost: number;
  trucks: number;
  drivers: number;
  /** Trucks of the fleet currently on the road — live snapshot, no window. */
  trucksOnRoad: number;
};

export type AnalyticsReport = {
  /** The window every section reports in, or null for all time. */
  window: PeriodRange | null;
  /** The company filter, or null for everyone. */
  company: string | null;
  fleet: FleetReport;
  companies: CompanyReport[];
  drivers: DriverReport[];
  destinations: DestinationReport[];
  fuels: FuelReport[];
  trend: TrendPoint[];
};

const round = (n: number) => Math.round(n * 100) / 100;

const DAY_MS = 86_400_000;

export function buildAnalyticsReport(input: {
  trips: Trip[];
  heads: unknown[];
  drivers: unknown[];
  stocks: LubricantStock[];
  restocks: LubricantRestock[];
  disbursals: LubricantDisbursalRow[];
  window: PeriodRange | null;
  company: string | null;
}): AnalyticsReport {
  const { trips, heads, drivers, stocks, restocks, disbursals, window: range, company } = input;

  /** The company a trip belongs to — the partner portal's own answer. */
  const companyOf = (trip: Trip): string => partnerOf(trip).trim() || "Unattributed";

  /** Inside the report window — an "All time" report has no window to fail. */
  const inWindow = (value: string | Date | null | undefined): boolean =>
    range ? inPeriod(value, range) : true;

  /** Trips in the window, and (when a company filter is on) that company's. */
  const tripsIn = trips.filter((t) => inWindow(t.createdAt));
  const scoped = company ? tripsIn.filter((t) => companyOf(t) === company) : tripsIn;

  /** Pours in the window — attributed by the trip's company when filtered. */
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const poursIn = disbursals.filter((d) => {
    if (!inWindow(d.createdAt)) return false;
    if (!company) return true;
    const trip = d.trip ? (d.trip as Trip) : tripById.get(d.tripId);
    return (trip ? companyOf(trip) : "Unattributed") === company;
  });

  const litresOf = (row: LubricantDisbursalRow): number =>
    row.fuelType === "Gas" ? 0 : Number(row.quantity ?? 0);
  const gasOf = (row: LubricantDisbursalRow): number =>
    row.fuelType === "Gas" ? Number(row.quantity ?? 0) : 0;

  /* ------------------------------------------------------------ the fleet -- */

  const buckets = new Map<TripBucket, number>();
  for (const trip of scoped)
    buckets.set(tripBucket(trip), (buckets.get(tripBucket(trip)) ?? 0) + 1);
  const completed = scoped.filter((t) => tripBucket(t) === "completed");
  const onRoad = trips.filter((t) => ["scheduled", "inTransit"].includes(tripBucket(t))).length;

  const fleet: FleetReport = {
    requests: scoped.length,
    approved:
      (buckets.get("approved") ?? 0) +
      (buckets.get("awaiting") ?? 0) +
      (buckets.get("scheduled") ?? 0) +
      (buckets.get("inTransit") ?? 0) +
      (buckets.get("completed") ?? 0),
    inTransit: (buckets.get("inTransit") ?? 0) + (buckets.get("scheduled") ?? 0),
    completed: completed.length,
    declined: buckets.get("declined") ?? 0,
    directCost: round(scoped.reduce((sum, t) => sum + directCostOf(t), 0)),
    fuelCost: round(poursIn.reduce((sum, d) => sum + Number(d.amount ?? 0), 0)),
    trucks: heads.length,
    drivers: drivers.length,
    trucksOnRoad: onRoad,
  };

  /* --------------------------------------------------------- by company ---- */

  const companyMap = new Map<string, CompanyReport>();
  const companyRow = (name: string): CompanyReport => {
    let row = companyMap.get(name);
    if (!row) {
      row = {
        partner: name,
        requests: 0,
        completed: 0,
        inTransit: 0,
        directCost: 0,
        dieselQty: 0,
        gasQty: 0,
        fuelCost: 0,
        destinations: 0,
      };
      companyMap.set(name, row);
    }
    return row;
  };
  for (const trip of scoped) {
    const row = companyRow(companyOf(trip));
    row.requests += 1;
    const bucket = tripBucket(trip);
    if (bucket === "completed") row.completed += 1;
    if (bucket === "scheduled" || bucket === "inTransit") row.inTransit += 1;
    row.directCost += directCostOf(trip);
  }
  for (const pour of poursIn) {
    const trip = pour.trip ? (pour.trip as Trip) : tripById.get(pour.tripId);
    const row = companyRow(trip ? companyOf(trip) : "Unattributed");
    row.dieselQty += litresOf(pour);
    row.gasQty += gasOf(pour);
    row.fuelCost += Number(pour.amount ?? 0);
  }
  const companies = Array.from(companyMap.values())
    .map((row) => ({
      ...row,
      directCost: round(row.directCost),
      fuelCost: round(row.fuelCost),
      destinations: new Set(
        scoped
          .filter((t) => companyOf(t) === row.partner && t.dropoff?.trim())
          .map((t) => t.dropoff!.trim()),
      ).size,
    }))
    .sort((a, b) => b.requests - a.requests || b.fuelCost - a.fuelCost);

  /* ---------------------------------------------------------- by driver ---- */

  const driverMap = new Map<string, DriverReport>();
  const driverRow = (name: string): DriverReport => {
    let row = driverMap.get(name);
    if (!row) {
      row = { driver: name, trips: 0, completed: 0, litres: 0, fuelCost: 0 };
      driverMap.set(name, row);
    }
    return row;
  };
  for (const trip of scoped) {
    const name = trip.driverName?.trim();
    if (!name) continue;
    const row = driverRow(name);
    row.trips += 1;
    if (tripBucket(trip) === "completed") row.completed += 1;
  }
  for (const pour of poursIn) {
    const trip = pour.trip ? (pour.trip as Trip) : tripById.get(pour.tripId);
    const name = trip?.driverName?.trim();
    if (!name) continue;
    const row = driverRow(name);
    row.litres += litresOf(pour) + gasOf(pour);
    row.fuelCost += Number(pour.amount ?? 0);
  }
  const driversReport = Array.from(driverMap.values())
    .map((row) => ({ ...row, litres: round(row.litres), fuelCost: round(row.fuelCost) }))
    .sort((a, b) => b.trips - a.trips || b.fuelCost - a.fuelCost)
    .slice(0, 20);

  /* ----------------------------------------------------- by destination ---- */

  const destMap = new Map<string, DestinationReport>();
  const destRow = (name: string): DestinationReport => {
    let row = destMap.get(name);
    if (!row) {
      row = { destination: name, trips: 0, completed: 0, directCost: 0, litres: 0 };
      destMap.set(name, row);
    }
    return row;
  };
  const pourLitresByTrip = new Map<string, number>();
  for (const pour of poursIn) {
    pourLitresByTrip.set(
      pour.tripId,
      (pourLitresByTrip.get(pour.tripId) ?? 0) + litresOf(pour) + gasOf(pour),
    );
  }
  for (const trip of scoped) {
    const name = (trip.dropoff ?? "").trim() || trip.loadingSite?.[0]?.trim();
    if (!name) continue;
    const row = destRow(name);
    row.trips += 1;
    if (tripBucket(trip) === "completed") row.completed += 1;
    row.directCost += directCostOf(trip);
    row.litres += pourLitresByTrip.get(trip.id) ?? 0;
  }
  const destinations = Array.from(destMap.values())
    .map((row) => ({ ...row, directCost: round(row.directCost), litres: round(row.litres) }))
    .sort((a, b) => b.trips - a.trips || b.directCost - a.directCost)
    .slice(0, 20);

  /* -------------------------------------------------------------- fuel ----- */

  const lastInbound = new Map<string, { unitCost: number; at: string }>();
  for (const row of restocks) {
    const cost = Number(row.unitCost ?? 0);
    if (!(cost > 0)) continue;
    const current = lastInbound.get(row.fuelType);
    if (!current || String(row.createdAt) > current.at) {
      lastInbound.set(row.fuelType, { unitCost: cost, at: String(row.createdAt) });
    }
  }

  const fuels: FuelReport[] = ["Diesel", "Gas"].map((fuelType) => {
    const unit = fuelType === "Gas" ? "KG" : "LITRES";
    const pours = poursIn.filter((d) => d.fuelType === fuelType);
    const restockRows = restocks.filter((r) => r.fuelType === fuelType && inWindow(r.createdAt));
    const tank = stocks.find((s) => s.fuelType === fuelType);
    const restockedCost = restockRows.reduce(
      (sum, r) => sum + Number(r.quantity ?? 0) * Number(r.unitCost ?? 0),
      0,
    );
    return {
      fuelType,
      unit,
      dispensedQty: round(pours.reduce((sum, d) => sum + Number(d.quantity ?? 0), 0)),
      dispensedCost: round(pours.reduce((sum, d) => sum + Number(d.amount ?? 0), 0)),
      pours: pours.length,
      restockedQty: round(restockRows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0)),
      restockedCost: round(restockedCost),
      tankQty: Number(tank?.quantity ?? 0),
      tankMin: Number(tank?.minLevel ?? 0),
      tankLow: tank ? Boolean(tank.low) : false,
    };
  });

  /* ------------------------------------------------------------- trend ----- */

  /** The last 14 days, oldest first — every day present, zero or not. */
  const now = new Date();
  const trend: TrendPoint[] = [];
  const byDay = new Map<string, TrendPoint>();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS);
    const key = day.toISOString().slice(0, 10);
    const point: TrendPoint = { day: key, requests: 0, completed: 0, litres: 0, cost: 0 };
    trend.push(point);
    byDay.set(key, point);
  }
  const stamp = (value: string | null | undefined): string | null => {
    const d = new Date(String(value ?? ""));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  for (const trip of scoped) {
    const key = stamp(trip.createdAt);
    const point = key ? byDay.get(key) : undefined;
    if (!point) continue;
    point.requests += 1;
    if (tripBucket(trip) === "completed") point.completed += 1;
  }
  for (const pour of poursIn) {
    const key = stamp(pour.createdAt);
    const point = key ? byDay.get(key) : undefined;
    if (!point) continue;
    point.litres += litresOf(pour) + gasOf(pour);
    point.cost += Number(pour.amount ?? 0);
  }
  for (const point of trend) {
    point.litres = round(point.litres);
    point.cost = round(point.cost);
  }

  return {
    window: range,
    company,
    fleet,
    companies,
    drivers: driversReport,
    destinations,
    fuels,
    trend,
  };
}
