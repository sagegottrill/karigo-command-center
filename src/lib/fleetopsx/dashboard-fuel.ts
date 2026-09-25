import { inPeriod, type PeriodRange } from "./period";
import { displayRequestId } from "./request-id";
import { partnerOf } from "./tracking-ops";
import { displayCapPlateFromTrip } from "./display-ids";
import { approvalGate, statusIsReleased } from "./lubricant";
import type { DeptTone } from "./dashboard-departments";
import type { FuelRequisition, Trip } from "./types";
import type {
  LubricantApproval,
  LubricantDisbursalRow,
  LubricantFuel,
  LubricantRequestRow,
  LubricantRestock,
  LubricantStock,
} from "./lubricant";

/**
 * The Transport Manager's diesel view: what is in the tank, what he has released,
 * what was actually pumped, and where the two disagree.
 *
 * This is the one department where the platform moves a physical asset that can
 * be stolen in litres, so every figure here is a reconciliation rather than a
 * summary. Three rules carry it:
 *
 *  - **The tank is the physical truth.** Its balance is the stock row the
 *    department's own dispensing moves; the value is that balance at the last
 *    inbound purchase price when a delivery recorded one, otherwise at the
 *    Transport Manager's own price per litre — and the board says which basis it
 *    used, because "what we paid" and "what we charge" are different numbers.
 *  - **A release is not a pickup.** Litres the TM has authorized but the yard has
 *    not pumped are a dispatch sitting in the gate, not fuel consumed, and the
 *    two lists never merge.
 *  - **Variance is measured against authority.** Whatever was authorized if the
 *    TM gave a figure, otherwise what Fleet Ops asked for; a disbursal with
 *    neither is not "on budget", it is unauthorized, and it is named as such.
 *
 * A figure the platform cannot honestly compute is `null` and drawn as "—".
 * There is no distance source for kilometres per litre today (no odometer
 * reading on any fuel record), so efficiency is reported as unmeasurable rather
 * than estimated from a route length nobody recorded.
 */

export type FuelTankLine = {
  fuelType: LubricantFuel | string;
  unit: string;
  quantity: number;
  minLevel: number;
  low: boolean;
  /** Litres below the safety level — what a reorder has to cover. */
  shortfall: number;
};

export type FuelAsk = {
  tripId: string;
  reference: string;
  truck: string;
  driver: string;
  partner: string;
  route: string;
  fuelType: string;
  unit: string;
  litres: number;
  unitPrice: number;
  cost: number;
  /** The TM's own figure, when he has given one. */
  authorizedLitres: number | null;
  authorizedBy: string;
  authorizedAt: string;
  status: string;
  /** The department has already poured for this dispatch. */
  poured?: boolean;
  /** Hours waiting: since the release he authorized, or since dispatch if not. */
  waitingHours: number | null;
  tone: DeptTone;
};

export type FuelLedgerRow = {
  tripId: string;
  reference: string;
  truck: string;
  driver: string;
  route: string;
  fuelType: string;
  unit: string;
  litres: number;
  unitPrice: number;
  value: number;
  /** Who pumped it — the accountability line. */
  attendant: string;
  at: string;
  requestedLitres: number | null;
  authorizedLitres: number | null;
  /** Litres over the authority in force, and what they were worth. */
  overLitres: number;
  overValue: number;
  /** Pumped with no authorization on the dispatch at all. */
  unauthorized: boolean;
  tone: DeptTone;
};

export type FuelOversight = {
  tanks: {
    lines: FuelTankLine[];
    value: number;
    /** Where the value came from — never guessed silently. */
    basis: "inbound" | "price" | "unpriced";
    lastInboundAt: string | null;
    /** Types at or below their safety level. */
    low: number;
  };
  spend: {
    todayLitres: number;
    todayValue: number;
    todayTrucks: number;
    totalLitres: number;
    totalValue: number;
  };
  /** Fleet Ops has asked; the Transport Manager has not released it. */
  approvals: { count: number; litres: number; value: number; list: FuelAsk[] };
  /** Released by the TM; the yard has not pumped it. */
  pickups: {
    count: number;
    litres: number;
    value: number;
    longestHours: number | null;
    list: FuelAsk[];
  };
  variance: {
    count: number;
    overLitres: number;
    overValue: number;
    unauthorized: number;
    list: FuelLedgerRow[];
  };
  efficiency: {
    /** Trucks with both a distance and a litre figure. */
    measured: number;
    worst: { truck: string; kmPerLitre: number; km: number; litres: number } | null;
    list: { truck: string; kmPerLitre: number; km: number; litres: number }[];
  };
  routes: {
    measured: number;
    list: {
      route: string;
      trips: number;
      avgAsked: number;
      maxAsked: number;
      avgPumped: number | null;
    }[];
  };
  ledger: { count: number; list: FuelLedgerRow[] };
};

/** `SBG674XT / B028` and `SBG674XT` are the same truck. */
function truckKey(value: unknown): string {
  return (
    String(value ?? "")
      .split("/")[0]
      ?.replace(/[^0-9a-z]/gi, "")
      .toUpperCase() ?? ""
  );
}

const hoursSince = (stamp: string | null | undefined, now: Date): number | null => {
  const text = String(stamp ?? "").trim();
  if (!text) return null;
  const at = new Date(text);
  if (Number.isNaN(at.getTime())) return null;
  return Math.max(0, (now.getTime() - at.getTime()) / 3_600_000);
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildFuelOversight(input: {
  trips: Trip[];
  stocks: LubricantStock[];
  restocks: LubricantRestock[];
  disbursals: LubricantDisbursalRow[];
  requests: LubricantRequestRow[];
  prices: Record<string, number>;
  fuelRecords?: FuelRequisition[];
  range: PeriodRange;
  now: Date;
}): FuelOversight {
  const { stocks, restocks, disbursals, requests, prices, range, now } = input;
  const fuelRecords = input.fuelRecords ?? [];

  /* ------------------------------------------------------------- the tank -- */

  /**
   * The most recent delivery price per fuel type. The tank is worth what the
   * last purchase cost while that is known — a ton of diesel bought at last
   * month's price is not worth today's selling price by accident.
   */
  const lastInbound = new Map<string, { unitCost: number; at: string }>();
  for (const row of restocks) {
    const cost = Number(row.unitCost ?? 0);
    if (!(cost > 0)) continue;
    const current = lastInbound.get(row.fuelType);
    if (!current || String(row.createdAt) > current.at) {
      lastInbound.set(row.fuelType, { unitCost: cost, at: String(row.createdAt) });
    }
  }

  const lines: FuelTankLine[] = stocks.map((stock) => ({
    fuelType: stock.fuelType,
    unit: stock.unit || "LITRES",
    quantity: Number(stock.quantity ?? 0),
    minLevel: Number(stock.minLevel ?? 0),
    low: Number(stock.quantity ?? 0) < Number(stock.minLevel ?? 0),
    shortfall: Math.max(0, Number(stock.minLevel ?? 0) - Number(stock.quantity ?? 0)),
  }));

  const pricedLines = lines.filter(
    (line) =>
      Number(lastInbound.get(line.fuelType)?.unitCost ?? 0) > 0 ||
      Number(prices[line.fuelType] ?? 0) > 0,
  );
  const tankValue = lines.reduce((total, line) => {
    const inbound = Number(lastInbound.get(line.fuelType)?.unitCost ?? 0);
    const price = Number(prices[line.fuelType] ?? 0);
    return total + line.quantity * (inbound > 0 ? inbound : price);
  }, 0);
  const basis: FuelOversight["tanks"]["basis"] =
    pricedLines.length === 0 ? "unpriced" : lastInbound.size > 0 ? "inbound" : "price";
  const lastInboundAt =
    [...lastInbound.values()].sort((a, b) => (a.at < b.at ? 1 : -1))[0]?.at ?? null;

  /* ------------------------------------------------ today's disbursements -- */

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayRows = disbursals.filter((row) => {
    const at = new Date(String(row.createdAt));
    return !Number.isNaN(at.getTime()) && at >= startOfDay;
  });
  const todayLitres = todayRows.reduce((total, row) => total + Number(row.quantity ?? 0), 0);
  const todayValue = todayRows.reduce((total, row) => total + Number(row.amount ?? 0), 0);

  /* ------------------------------------------------- the approval queues --- */

  const priceOf = (fuelType: string) => Number(prices[fuelType] ?? 0);

  /** Trips the department has already poured for — one disbursal per dispatch. */
  const pouredTripIds = new Set(disbursals.map((row) => String(row.tripId ?? "")));

  const readAsk = (row: LubricantRequestRow, authorized: boolean): FuelAsk => {
    const trip = row as unknown as Trip;
    const requested = Number(row.request?.quantity ?? 0);
    const fuelType = String(row.request?.fuelType ?? "Diesel");
    const unitPrice = Number(row.unitPrice ?? priceOf(fuelType));
    const approval: LubricantApproval | null = row.approval ?? null;
    const from = authorized
      ? approval?.at
      : (trip.dispatchedAt ?? trip.assignedAt ?? trip.approvedAt ?? trip.createdAt);
    return {
      tripId: String(row.id),
      reference: displayRequestId(trip),
      truck: displayCapPlateFromTrip(trip),
      driver: String(row.driverName ?? trip.driverName ?? "Unassigned"),
      partner: partnerOf(trip),
      route: String(trip.dropoff ?? "—"),
      fuelType,
      unit: fuelType === "Gas" ? "KG" : "LITRES",
      litres: authorized && approval ? approval.litres : requested,
      unitPrice,
      cost: (authorized && approval ? approval.litres : requested) * unitPrice,
      authorizedLitres: approval?.litres ?? null,
      authorizedBy: approval?.by ?? "",
      authorizedAt: approval?.at ?? "",
      status: String(trip.status ?? ""),
      poured: pouredTripIds.has(String(row.id)),
      waitingHours: hoursSince(from, now),
      tone: authorized ? "amber" : "grey",
    };
  };

  /*
   * The approval gate is the STATUS, not the legacy litres blob: a dispatch
   * already Scheduled (the final approval) or on the road was released the
   * moment the Transport Manager approved it — even when no separate litre
   * figure was ever recorded on it. Classifying it by the blob instead kept
   * in-transit trucks stacked in "awaiting your release" forever, the same
   * lie the fuel board was showing. "Waiting" now means only a dispatch he
   * has not cleared at all (Requested / Approved / Awaiting Approval);
   * "released, not pumped" is a Scheduled dispatch the yard has not poured
   * for yet; anything already moving or finished has left both queues.
   */
  const asks = requests.map((row) => readAsk(row, approvalGate(row) === "released"));
  const awaitingApproval = asks.filter((ask) => !statusIsReleased(ask.status));
  const awaitingPickup = asks.filter((ask) => statusIsReleased(ask.status) && ask.poured !== true);

  /** Longest wait first — the truck that has been sitting is the one to chase. */
  awaitingApproval.sort((a, b) => (b.waitingHours ?? 0) - (a.waitingHours ?? 0));
  awaitingPickup.sort((a, b) => (b.waitingHours ?? 0) - (a.waitingHours ?? 0));

  /* ------------------------------------------- the dispensing ledger ------- */

  const readLedger = (row: LubricantDisbursalRow): FuelLedgerRow => {
    const trip = (row.trip ?? null) as Trip | null;
    const litres = Number(row.quantity ?? 0);
    const fuelType = String(row.fuelType ?? "Diesel");
    const approval: LubricantApproval | null = row.approval ?? null;
    const asked = Number(trip?.directCosts?.lubricantQuantity ?? 0);
    const requested = asked > 0 ? asked : null;
    const authority = approval?.litres ?? requested;
    const over = authority === null ? 0 : Math.max(0, litres - authority);
    const value = Number(row.amount ?? 0);
    return {
      tripId: String(row.tripId),
      reference: String(row.reference ?? ""),
      truck: trip ? displayCapPlateFromTrip(trip) : String(row.truckReg ?? "—"),
      driver: String(row.driverName ?? "—"),
      route: String(row.destination ?? trip?.dropoff ?? "—"),
      fuelType,
      unit: String(row.unit ?? "LITRES"),
      litres,
      unitPrice: Number(row.unitPrice ?? 0),
      value,
      attendant: String(row.dispensedBy ?? "—"),
      at: String(row.createdAt),
      requestedLitres: requested,
      authorizedLitres: approval?.litres ?? null,
      overLitres: round1(over),
      overValue: authority === null ? 0 : round1(over * Number(row.unitPrice ?? 0)),
      unauthorized: authority === null,
      tone: approval === null && requested === null ? "grey" : over > 0 ? "red" : "green",
    };
  };

  const ledger = disbursals.map(readLedger);
  const ledgerInRange = ledger.filter((row) => inPeriod(row.at, range));
  const flagged = ledger.filter((row) => row.overLitres > 0);
  const unauthorized = ledger.filter((row) => row.unauthorized);

  /* ---------------------------------------------------- km per litre ------- */

  /**
   * Distance per truck from the odometer trail: last reading minus first. No
   * reading on a fuel record means no distance, and a truck with no distance is
   * left out of the ratio rather than given one.
   */
  const trail = new Map<string, { at: number; value: number }[]>();
  for (const record of fuelRecords) {
    const value = Number(record.odometer ?? 0);
    const at = new Date(String(record.date));
    if (!(value > 0) || Number.isNaN(at.getTime()) || !inPeriod(record.date, range)) continue;
    const key = truckKey(record.truckReg);
    if (!key) continue;
    trail.set(key, [...(trail.get(key) ?? []), { at: at.getTime(), value }]);
  }

  const litresByTruck = new Map<string, number>();
  for (const row of ledger) {
    if (!inPeriod(row.at, range)) continue;
    const key = truckKey(row.truck.replace(/\(.*?\)/, ""));
    if (!key) continue;
    litresByTruck.set(key, (litresByTruck.get(key) ?? 0) + row.litres);
  }

  const efficiency: FuelOversight["efficiency"]["list"] = [];
  for (const [key, readings] of trail) {
    const sorted = [...readings].sort((a, b) => a.at - b.at);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last || sorted.length < 2 || last.value <= first.value) continue;
    const litres = litresByTruck.get(key) ?? 0;
    if (!(litres > 0)) continue;
    const km = last.value - first.value;
    efficiency.push({ truck: key, km, litres: round1(litres), kmPerLitre: round1(km / litres) });
  }
  efficiency.sort((a, b) => a.kmPerLitre - b.kmPerLitre);

  /* ------------------------------------------------------ route averages --- */

  const byRoute = new Map<string, { asked: number[]; pumped: number[] }>();
  for (const ask of asks) {
    const key = ask.route || "—";
    const entry = byRoute.get(key) ?? { asked: [], pumped: [] };
    entry.asked.push(ask.litres);
    byRoute.set(key, entry);
  }
  for (const row of ledger) {
    const key = row.route || "—";
    const entry = byRoute.get(key) ?? { asked: [], pumped: [] };
    entry.pumped.push(row.litres);
    byRoute.set(key, entry);
  }
  const routes = [...byRoute.entries()]
    .map(([route, entry]) => ({
      route,
      trips: entry.asked.length,
      avgAsked: entry.asked.length
        ? round1(entry.asked.reduce((a, b) => a + b, 0) / entry.asked.length)
        : 0,
      maxAsked: entry.asked.length ? Math.max(...entry.asked) : 0,
      avgPumped: entry.pumped.length
        ? round1(entry.pumped.reduce((a, b) => a + b, 0) / entry.pumped.length)
        : null,
    }))
    .sort((a, b) => b.trips - a.trips || b.avgAsked - a.avgAsked);

  const sum = (list: FuelAsk[]) => list.reduce((total, ask) => total + ask.litres, 0);
  const worth = (list: FuelAsk[]) => list.reduce((total, ask) => total + ask.cost, 0);

  return {
    tanks: {
      lines,
      value: tankValue,
      basis,
      lastInboundAt,
      low: lines.filter((line) => line.low).length,
    },
    spend: {
      todayLitres: round1(todayLitres),
      todayValue,
      todayTrucks: new Set(todayRows.map((row) => row.tripId)).size,
      totalLitres: round1(ledger.reduce((total, row) => total + row.litres, 0)),
      totalValue: ledger.reduce((total, row) => total + row.value, 0),
    },
    approvals: {
      count: awaitingApproval.length,
      litres: round1(sum(awaitingApproval)),
      value: worth(awaitingApproval),
      list: awaitingApproval,
    },
    pickups: {
      count: awaitingPickup.length,
      litres: round1(sum(awaitingPickup)),
      value: worth(awaitingPickup),
      longestHours: awaitingPickup[0]?.waitingHours ?? null,
      list: awaitingPickup,
    },
    variance: {
      count: flagged.length,
      overLitres: round1(flagged.reduce((total, row) => total + row.overLitres, 0)),
      overValue: round1(flagged.reduce((total, row) => total + row.overValue, 0)),
      unauthorized: unauthorized.length,
      list: [...flagged, ...unauthorized.filter((row) => row.overLitres === 0)],
    },
    efficiency: {
      measured: efficiency.length,
      worst: efficiency[0] ?? null,
      list: efficiency,
    },
    routes: { measured: routes.length, list: routes },
    ledger: { count: ledgerInRange.length, list: ledgerInRange },
  };
}
