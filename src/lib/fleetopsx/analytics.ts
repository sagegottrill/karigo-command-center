import { inPeriod, type PeriodRange } from "./period";
import { partnerOf } from "./tracking-ops";
import { tripBucket, type TripBucket } from "./status-buckets";
import { displayCapPlateFromTrip } from "./display-ids";
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
 *    same window over the same range — presets or a custom 1–15 Sept pair —
 *    so "diesel to Saba Steel in two weeks" means the same two weeks
 *    everywhere on the page.
 *  - **Money is what the platform actually recorded.** Direct cost is the
 *    allowances Fleet Ops committed per dispatch; fuel cost is what the
 *    department's own dispense rows cost at the TM's rate; the tank is worth
 *    its balance at the last recorded delivery price. Nothing is estimated.
 *  - **A figure the platform cannot compute is labelled, not invented.** An
 *    all-zero table prints its empty line; utilisation with no fleet is drawn
 *    as "—" by the screen, never guessed at a percentage here.
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

export type RouteReport = {
  route: string;
  trips: number;
  completed: number;
  directCost: number;
  litres: number;
};

export type TruckReport = {
  truck: string;
  trips: number;
  completed: number;
  litres: number;
  fuelCost: number;
};

/** One slice of the lifecycle, with the money and litres sitting in it. */
export type StatusSlice = {
  label: string;
  count: number;
  directCost: number;
  litres: number;
};

export type MonthSlice = {
  month: string;
  requests: number;
  litres: number;
  cost: number;
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
  /** Tank balance valued at the last recorded delivery price — null when no priced delivery exists. */
  tankValue: number | null;
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
  /** Committed cost per request in the window — the ask has a going rate. */
  avgDirectPerRequest: number | null;
  /** Litres (and kg) the window's pours handed out, all fuels together. */
  litresDispensed: number;
  pours: number;
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
  routes: RouteReport[];
  trucks: TruckReport[];
  statusMix: StatusSlice[];
  months: MonthSlice[];
  fuels: FuelReport[];
  trend: TrendPoint[];
};

const round = (n: number) => Math.round(n * 100) / 100;

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in the operator's OWN calendar — a UTC slice would file a
 *  1 pm Lagos pour into the previous day and shift every trend bar. */
const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const STATUS_LABELS: Array<{ bucket: TripBucket; label: string }> = [
  { bucket: "pending", label: "Requested" },
  { bucket: "approved", label: "With Fleet Ops" },
  { bucket: "awaiting", label: "Awaiting FO confirmation" },
  { bucket: "scheduled", label: "Scheduled" },
  { bucket: "inTransit", label: "In transit" },
  { bucket: "completed", label: "Completed" },
  { bucket: "declined", label: "Declined" },
];

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

  /** Inside the report window — an "All time" report has no window to fail. */
  const inWindow = (value: string | Date | null | undefined): boolean =>
    range ? inPeriod(value, range) : true;

  /** The company a trip belongs to — the partner portal's own answer. */
  const companyOf = (trip: Trip): string => partnerOf(trip).trim() || "Unattributed";

  /** Trips in the window, and (when a company filter is on) that company's. */
  const tripsIn = trips.filter((t) => inWindow(t.createdAt));
  const scoped = company ? tripsIn.filter((t) => companyOf(t) === company) : tripsIn;

  /** Pours in the window — attributed by the trip's company when filtered. */
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const tripOf = (row: LubricantDisbursalRow): Trip | null =>
    row.trip ? (row.trip as unknown as Trip) : (tripById.get(row.tripId) ?? null);
  const poursIn = disbursals.filter((d) => {
    if (!inWindow(d.createdAt)) return false;
    if (!company) return true;
    const trip = tripOf(d);
    return (trip ? companyOf(trip) : "Unattributed") === company;
  });

  const litresOf = (row: LubricantDisbursalRow): number =>
    row.fuelType === "Gas" ? 0 : Number(row.quantity ?? 0);
  const gasOf = (row: LubricantDisbursalRow): number =>
    row.fuelType === "Gas" ? Number(row.quantity ?? 0) : 0;
  const allUnits = (row: LubricantDisbursalRow): number => litresOf(row) + gasOf(row);

  /** Window pours by trip — the litres a dispatch actually drew. */
  const pourLitresByTrip = new Map<string, number>();
  for (const pour of poursIn) {
    pourLitresByTrip.set(pour.tripId, (pourLitresByTrip.get(pour.tripId) ?? 0) + allUnits(pour));
  }

  /* ------------------------------------------------------------ the fleet -- */

  const buckets = new Map<TripBucket, number>();
  for (const trip of scoped)
    buckets.set(tripBucket(trip), (buckets.get(tripBucket(trip)) ?? 0) + 1);
  const completed = scoped.filter((t) => tripBucket(t) === "completed");
  const onRoad = trips.filter((t) => ["scheduled", "inTransit"].includes(tripBucket(t))).length;
  const directTotal = scoped.reduce((sum, t) => sum + directCostOf(t), 0);
  const pourLitres = poursIn.reduce((sum, d) => sum + allUnits(d), 0);

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
    directCost: round(directTotal),
    fuelCost: round(poursIn.reduce((sum, d) => sum + Number(d.amount ?? 0), 0)),
    trucks: heads.length,
    drivers: drivers.length,
    trucksOnRoad: onRoad,
    avgDirectPerRequest: scoped.length ? round(directTotal / scoped.length) : null,
    litresDispensed: round(pourLitres),
    pours: poursIn.length,
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
    const trip = tripOf(pour);
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
    const name = tripOf(pour)?.driverName?.trim();
    if (!name) continue;
    const row = driverRow(name);
    row.litres += allUnits(pour);
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

  /* ---------------------------------------------------------- by route ----- */

  /**
   * Lane performance: pickup → dropoff pairs, the haulage company's real
   * product. The pickup falls back through the named site list the same way
   * the loading-sites module reads it.
   */
  const routeMap = new Map<string, RouteReport>();
  for (const trip of scoped) {
    const dropoff = (trip.dropoff ?? "").trim();
    if (!dropoff) continue;
    const pickup = (trip.pickup ?? "").trim() || trip.loadingSite?.[0]?.trim() || "—";
    const key = `${pickup} → ${dropoff}`;
    let row = routeMap.get(key);
    if (!row) {
      row = { route: key, trips: 0, completed: 0, directCost: 0, litres: 0 };
      routeMap.set(key, row);
    }
    row.trips += 1;
    if (tripBucket(trip) === "completed") row.completed += 1;
    row.directCost += directCostOf(trip);
    row.litres += pourLitresByTrip.get(trip.id) ?? 0;
  }
  const routes = Array.from(routeMap.values())
    .map((row) => ({ ...row, directCost: round(row.directCost), litres: round(row.litres) }))
    .sort((a, b) => b.trips - a.trips || b.directCost - a.directCost)
    .slice(0, 12);

  /* ---------------------------------------------------------- by truck ----- */

  const truckMap = new Map<string, TruckReport>();
  for (const trip of scoped) {
    if (!trip.truckReg?.trim()) continue;
    const name = displayCapPlateFromTrip(trip) || trip.truckReg.trim();
    let row = truckMap.get(name);
    if (!row) {
      row = { truck: name, trips: 0, completed: 0, litres: 0, fuelCost: 0 };
      truckMap.set(name, row);
    }
    row.trips += 1;
    if (tripBucket(trip) === "completed") row.completed += 1;
    row.litres += pourLitresByTrip.get(trip.id) ?? 0;
  }
  for (const pour of poursIn) {
    const trip = tripOf(pour);
    if (!trip?.truckReg?.trim()) continue;
    const name = displayCapPlateFromTrip(trip) || trip.truckReg.trim();
    const row = truckMap.get(name);
    if (!row) continue;
    row.fuelCost += Number(pour.amount ?? 0);
  }
  const trucks = Array.from(truckMap.values())
    .map((row) => ({ ...row, litres: round(row.litres), fuelCost: round(row.fuelCost) }))
    .sort((a, b) => b.trips - a.trips || b.fuelCost - a.fuelCost)
    .slice(0, 12);

  /* ------------------------------------------------------- status mix ------ */

  const statusMix: StatusSlice[] = STATUS_LABELS.map(({ bucket, label }) => {
    const inBucket = scoped.filter((t) => tripBucket(t) === bucket);
    return {
      label,
      count: inBucket.length,
      directCost: round(inBucket.reduce((sum, t) => sum + directCostOf(t), 0)),
      litres: round(inBucket.reduce((sum, t) => sum + (pourLitresByTrip.get(t.id) ?? 0), 0)),
    };
  });

  /* ---------------------------------------------------- monthly compare ---- */

  const now = new Date();
  const months: MonthSlice[] = [];
  const monthKeys = new Map<string, MonthSlice>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slice: MonthSlice = {
      month: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      requests: 0,
      litres: 0,
      cost: 0,
    };
    months.push(slice);
    monthKeys.set(key, slice);
  }
  const monthKeyOf = (value: string | Date | null | undefined): string | null => {
    const d = new Date(String(value ?? ""));
    return Number.isNaN(d.getTime()) ? null : localDayKey(d).slice(0, 7);
  };
  for (const trip of scoped) {
    const key = monthKeyOf(trip.createdAt);
    const slice = key ? monthKeys.get(key) : undefined;
    if (slice) slice.requests += 1;
  }
  for (const pour of poursIn) {
    const key = monthKeyOf(pour.createdAt);
    const slice = key ? monthKeys.get(key) : undefined;
    if (!slice) continue;
    slice.litres += allUnits(pour);
    slice.cost += Number(pour.amount ?? 0);
  }
  for (const slice of months) {
    slice.litres = round(slice.litres);
    slice.cost = round(slice.cost);
  }

  /* -------------------------------------------------------------- fuel ----- */

  /** Last recorded delivery price per fuel — the tank is valued at what it last cost. */
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
    const tankQty = Number(tank?.quantity ?? 0);
    const inbound = lastInbound.get(fuelType);
    return {
      fuelType,
      unit,
      dispensedQty: round(pours.reduce((sum, d) => sum + Number(d.quantity ?? 0), 0)),
      dispensedCost: round(pours.reduce((sum, d) => sum + Number(d.amount ?? 0), 0)),
      pours: pours.length,
      restockedQty: round(restockRows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0)),
      restockedCost: round(restockedCost),
      tankQty,
      tankMin: Number(tank?.minLevel ?? 0),
      tankLow: tank ? Boolean(tank.low) : false,
      tankValue: inbound ? round(tankQty * inbound.unitCost) : null,
    };
  });

  /* ------------------------------------------------------------- trend ----- */

  /** The last 14 days, oldest first — every day present, zero or not. */
  const trend: TrendPoint[] = [];
  const byDay = new Map<string, TrendPoint>();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDayKey(day);
    const point: TrendPoint = { day: key, requests: 0, completed: 0, litres: 0, cost: 0 };
    trend.push(point);
    byDay.set(key, point);
  }
  const stamp = (value: string | null | undefined): string | null => {
    const d = new Date(String(value ?? ""));
    return Number.isNaN(d.getTime()) ? null : localDayKey(d);
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
    point.litres += allUnits(pour);
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
    routes,
    trucks,
    statusMix,
    months,
    fuels,
    trend,
  };
}
