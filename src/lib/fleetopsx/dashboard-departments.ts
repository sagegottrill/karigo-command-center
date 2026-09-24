import { inPeriod, type PeriodRange } from "./period";
import { displayRequestId } from "./request-id";
import { partnerOf } from "./tracking-ops";
import {
  daysBetween,
  expectedReturnAt,
  gateDepartureStamp,
  gateReturnStamp,
  gateTurnaroundHours,
  isOutOfYard,
  parseGateStamp,
} from "./gate-helpers";
import { displayCapPlateFromTrip } from "./display-ids";
import { headKeys, resolveTruck, truckLabel, workOrderKeys } from "./engineering-helpers";
import type {
  FuelRequisition,
  InventoryItem,
  InventoryRequisition,
  TruckHead,
  Trip,
  WorkOrder,
  WorkOrderStatus,
} from "./types";

/**
 * The Transport Manager's oversight figures for Engineering & Maintenance and
 * for the Gate House.
 *
 * These are the numbers a supervisor audits a department with, and every one of
 * them is derived from records the department already keeps — work orders, the
 * fleet registry and the gate's own stamps. Nothing here is a stored "score":
 * a truck is in the shop because its registry status says so, a repair cost is
 * the cost on the job, a trip is on the road because the gate logged it out and
 * has not logged it back in.
 *
 * A figure the platform cannot honestly compute is reported as unknown (`null`)
 * rather than defaulted to zero — "we have never completed a job" and "repairs
 * take no time" are different statements and only one of them is true.
 *
 * Kept out of the dashboard component so the same derivations can be unit-tested
 * and reused by any future Engineering/Security oversight surface.
 */

/** The portal's six-tone scale, mirrored from dashboard-drill's TileTone. */
export type DeptTone = "grey" | "amber" | "purple" | "green" | "blue" | "red" | "teal";

/** A work order as the Engineering oversight board reads it. */
export type EngJob = {
  id: string;
  truck: string;
  truckReg: string;
  defect: string;
  category: string;
  status: WorkOrderStatus;
  mechanic: string;
  cost: number;
  reportedAt: string;
  startedAt: string;
  completedAt: string;
  /** Days in the shop and counting (open jobs), or days it took (closed jobs). */
  days: number | null;
  /** The workshop's promised return-to-service date ("" when none was given). */
  estimatedReadyAt: string;
  /** Days until that promise (negative = already late), null when there is none. */
  rtsDays: number | null;
  tone: DeptTone;
};

/** A parts request as the Transport Manager's approval queue reads it. */
export type EngPartRequest = {
  id: string;
  /** The truck as every other board names it — cap number first. */
  truck: string;
  truckReg: string;
  /** The defect on the job the part was asked for ("" if the job is gone). */
  defect: string;
  part: string;
  quantity: number;
  unitCost: number;
  /** quantity × unit cost. 0 means the request carried no price at all. */
  cost: number;
  mechanic: string;
  reason: string;
  requestedAt: string;
  itemId: string;
  /** Stock behind the line in the store, or null when no item was named. */
  stock: number | null;
  /** The store cannot cover the request — approving it cannot be fulfilled. */
  short: boolean;
};

/** One truck's maintenance spend against the distance it was actually driven. */
export type EngCpkRow = {
  label: string;
  km: number;
  spend: number;
  cpk: number | null;
  /** Odometer readings the distance was measured from. */
  readings: number;
};

/** A part the store is short of, and how much of it is already promised out. */
export type EngStockAlert = {
  name: string;
  sku: string;
  stock: number;
  reorderLevel: number;
  status: string;
  unitCost: number;
  /** Units already requested by the workshop and not yet decided. */
  waiting: number;
  /** Units the store is short of to cover what is already waiting. */
  shortBy: number;
};

export type EngineeringOversight = {
  /** Maintenance spend committed inside the selected window. */
  spend: { total: number; jobs: number; list: EngJob[] };
  /** Cost sitting in the "Awaiting Parts" queue — money not yet spent. */
  partsQueue: { value: number; count: number; list: EngJob[] };
  /** Every job not yet closed, and what it is worth so far. */
  open: { count: number; value: number; list: EngJob[] };
  /** Live fleet states Engineering owns. */
  shop: {
    maintenance: number;
    checkUp: number;
    accident: number;
    maintenanceList: TruckHead[];
    checkUpList: TruckHead[];
    accidentList: TruckHead[];
  };
  /** Trucks sitting in the shop, worst first. Flagged past the 5-day line. */
  downtime: { longestDays: number; flagged: number; list: EngJob[] };
  /** How long the workshop takes, measured, not estimated. */
  turnaround: {
    avgDays: number | null;
    completed: number;
    byMechanic: { mechanic: string; jobs: number; avgDays: number | null }[];
  };
  /** Repair spend per truck, worst first. */
  costPerAsset: { label: string; spend: number; jobs: number }[];
  /** Which faults keep coming back. */
  defects: { label: string; count: number }[];
  totalJobs: number;
  /** Jobs in the parts queue with no cost recorded — the value is incomplete. */
  unpricedInQueue: number;
  /**
   * Maintenance cost per kilometre: the window's repair spend against the
   * distance the trucks were actually driven in it.
   *
   * Distance is measured from the odometer readings on the fuel records — the
   * only mileage the platform captures. A truck whose spend is known but whose
   * mileage is not is left out of the ratio and counted in `unmeasuredSpend`,
   * so the figure shown is never a blend of measured and invented distance.
   */
  cpk: {
    value: number | null;
    km: number;
    spend: number;
    readings: number;
    trucks: number;
    unmeasuredSpend: number;
    list: EngCpkRow[];
  };
  /** When the workshop says each open truck is coming back, and who is late. */
  rts: {
    /** Open jobs carrying a promised return-to-service date. */
    promised: number;
    /** Open jobs with no date at all — the gap no estimate can be read from. */
    missing: number;
    next: { truck: string; label: string; date: string; days: number | null; tone: DeptTone } | null;
    overdue: { count: number; worstDays: number; list: EngJob[] };
    list: EngJob[];
  };
  /** The approval desk: parts the workshop has asked the store for. */
  requisitions: {
    pending: {
      count: number;
      value: number;
      /** Requests carrying no price — the value is a floor, not a total. */
      unpriced: number;
      /** Pending requests the store cannot cover. */
      blocked: number;
      list: EngPartRequest[];
    };
    /** Movements the TM has already decided inside the window. */
    decided: number;
  };
  /** The store those requests are drawn from. */
  inventory: {
    items: number;
    outOfStock: number;
    low: number;
    /** Stock on hand valued at its own unit cost. */
    value: number;
    list: EngStockAlert[];
  };
};

/** A gate movement as the Security oversight board reads it. */
export type SecTrip = {
  id: string;
  label: string;
  partner: string;
  route: string;
  /** `P053 (GGE97YK) / B039` — cap number first, never the plate on its own. */
  truck: string;
  driver: string;
  departedAt: string | null;
  returnedAt: string | null;
  /** Which security account stamped the departure / return, when signed. */
  gateOutBy?: string | null;
  gateInBy?: string | null;
  hoursOut: number | null;
  /** Hours between the TM's release and the gate actually logging it out. */
  waitHours: number | null;
  /** Hours past the expected return, for a truck still out. */
  overdueHours: number | null;
  expectedReturn: Date | null;
  tone: DeptTone;
};

export type SecurityOversight = {
  /** Physical yard inventory, told by the gate rather than by a status field. */
  yard: { inYard: number; out: number; totalHeads: number; list: SecTrip[] };
  /** Released by the TM, not yet logged out by Security. */
  pendingExits: { count: number; longestHours: number | null; list: SecTrip[] };
  /** Out now, and when each is expected back. */
  awaitingReturn: { count: number; expectedKnown: number; list: SecTrip[] };
  /** Past the expected return and still logged out. */
  overdue: { count: number; list: SecTrip[] };
  /** Gate-to-gate turnaround — the gate's own measure of a trip's duration. */
  tat: {
    avgHours: number | null;
    medianHours: number | null;
    longestHours: number | null;
    measured: number;
    list: SecTrip[];
  };
  /** Movements the gate logged inside the selected window. */
  movements: { departures: number; returns: number; list: SecTrip[] };
  /**
   * The Guard Activity Ledger — WHO at the gate scanned each movement, with the
   * exact timestamp. One row per stamp, newest first; rows without an actor are
   * stamps taken before the gate started signing its work, and say so.
   */
  guardLedger: {
    departures: number;
    returns: number;
    /** Stamps with no actor on them — the pre-ledger backlog. */
    unsigned: number;
    list: { id: string; label: string; truck: string; driver: string; guard: string; action: "Logged Out" | "Logged In"; at: string | null }[];
  };
};

/** Past this many days in the shop, a truck is flagged on the TM's board. */
export const DOWNTIME_FLAG_DAYS = 5;

/** Past this many hours, a released dispatch is a gate bottleneck, not a queue. */
const EXIT_WAIT_FLAG_HOURS = 4;

/**
 * The truck a movement belongs to — the head (cap + plate) before the tail,
 * lower-cased.
 *
 * Keyed on the HEAD, never on the tail: a truck can carry two open dispatches
 * whose tails differ, and those are still one truck standing in one place.
 */
const truckKey = (trip: SecTrip) =>
  String(trip.truck ?? "")
    .split("/")[0]
    ?.trim()
    .toLowerCase() ?? "";

/**
 * `P053 (GGE97YK) / B039` — the movement's truck, cap number first.
 *
 * The cap is the number the gate house checks off against the cab and the one
 * the Transport Manager audits the movement by, so it can never be dropped
 * from a security row; the tail code follows the head it was paired with.
 */
function movementTruck(trip: Trip): string {
  const head = displayCapPlateFromTrip(trip);
  const tail = String(trip.truckReg ?? "")
    .split("/")
    .slice(1)
    .join("/")
    .trim();
  const realTail = tail && !/^none$/i.test(tail) ? tail : "";
  if (!head) return realTail ? `Truck TBD / ${realTail}` : "Truck TBD";
  return realTail ? `${head} / ${realTail}` : head;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function jobTone(status: WorkOrderStatus, days: number | null): DeptTone {
  if (days !== null && days >= DOWNTIME_FLAG_DAYS) return "red";
  switch (status) {
    case "Reported":
      return "grey";
    case "Diagnosing":
      return "blue";
    case "Awaiting Parts":
      return "amber";
    case "Repairing":
      return "red";
    case "Testing":
      return "purple";
    case "Completed":
      return "green";
    case "Cancelled":
      return "grey";
    default:
      return "grey";
  }
}

/** A job is open while it sits anywhere before Completed — Cancelled is closed. */
export function isOpenJob(order: WorkOrder): boolean {
  return order.status !== "Completed" && order.status !== "Cancelled";
}

/** The moment a job counts against: when it closed, or when it was raised. */
function jobMoment(order: WorkOrder): string {
  return order.status === "Completed" && order.completedAt ? order.completedAt : order.reportedAt;
}

/**
 * Engineering & Maintenance, as the Transport Manager audits it.
 *
 * `range` scopes the money (what was spent in the window the board is set to);
 * the fleet states, the queue and the downtime are live snapshots, because a
 * truck sitting in the shop right now has no window to belong to.
 */
export function buildEngineeringOversight(
  orders: WorkOrder[],
  heads: TruckHead[],
  range: PeriodRange,
  now: Date,
  /**
   * The store side of the workshop: what has been asked for, what the store
   * holds, and the odometer readings that turn spend into a cost per km. All
   * optional so a caller with only work orders still gets a valid board.
   */
  extras: {
    requisitions?: InventoryRequisition[];
    items?: InventoryItem[];
    fuel?: FuelRequisition[];
  } = {},
): EngineeringOversight {
  /** Days to a promised date; negative once the promise has passed. */
  const rtsDays = (stamp: string): number | null => {
    const at = parseGateStamp(stamp);
    if (!at) return null;
    return round1((at.getTime() - now.getTime()) / 86_400_000);
  };

  const readJob = (order: WorkOrder, days: number | null): EngJob => {
    const resolved = resolveTruck(order, heads);
    return {
      id: order.id,
      truck: resolved ? truckLabel(resolved) : String(order.truckReg || "—"),
      truckReg: String(order.truckReg || ""),
      defect: order.defect || "—",
      category: order.category || "Uncategorised",
      status: order.status,
      mechanic: order.mechanic || "Unassigned",
      cost: Number(order.cost ?? 0),
      reportedAt: order.reportedAt,
      startedAt: order.startedAt,
      completedAt: order.completedAt,
      days,
      estimatedReadyAt: String(order.estimatedReadyAt || ""),
      rtsDays: rtsDays(String(order.estimatedReadyAt || "")),
      tone: jobTone(order.status, days),
    };
  };

  /**
   * A truck key from any free-text truck column (a work order's plate, a
   * requisition's plate, a fuel record's plate): the plate if there is one,
   * otherwise the cap number. One key per truck, whichever board wrote it.
   */
  const keyOf = (raw: unknown): string => {
    const keys = workOrderKeys({ truckReg: String(raw ?? "") } as WorkOrder);
    return keys.plate || keys.head;
  };

  const requisitions = extras.requisitions ?? [];
  const items = extras.items ?? [];
  const fuel = extras.fuel ?? [];

  const openOrders = orders.filter(isOpenJob);

  /** Age of an open job: from the moment the workshop actually began, if known. */
  const openJobDays = (order: WorkOrder) =>
    daysBetween(order.startedAt || order.reportedAt, now);

  const openList = openOrders
    .map((o) => readJob(o, openJobDays(o)))
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));

  const spendList = orders
    .filter((o) => o.status !== "Cancelled" && inPeriod(jobMoment(o), range))
    .map((o) => readJob(o, daysBetween(o.startedAt || o.reportedAt, new Date(o.completedAt || now))))
    .sort((a, b) => b.cost - a.cost);

  const partsQueue = openOrders.filter((o) => o.status === "Awaiting Parts");
  const partsList = partsQueue
    .map((o) => readJob(o, openJobDays(o)))
    .sort((a, b) => b.cost - a.cost);

  const maintenanceList = heads.filter((h) => h.status === "Maintenance");
  const checkUpList = heads.filter((h) => h.status === "Check Up");
  const accidentList = heads.filter((h) => h.status === "Accident");

  /** Turnaround is only measurable on a job that both started and finished. */
  const completed = orders.filter(
    (o) => o.status === "Completed" && parseGateStamp(o.startedAt) && parseGateStamp(o.completedAt),
  );
  const completedDays = completed
    .map((o) => daysBetween(o.startedAt, new Date(o.completedAt)))
    .filter((d): d is number => d !== null);

  const byMechanic = new Map<string, number[]>();
  for (const order of completed) {
    const days = daysBetween(order.startedAt, new Date(order.completedAt));
    if (days === null) continue;
    const key = order.mechanic || "Unassigned";
    byMechanic.set(key, [...(byMechanic.get(key) ?? []), days]);
  }

  const assetSpend = new Map<string, { label: string; spend: number; jobs: number }>();
  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const resolved = resolveTruck(order, heads);
    const label = resolved ? truckLabel(resolved) : String(order.truckReg || "—");
    const current = assetSpend.get(label) ?? { label, spend: 0, jobs: 0 };
    current.spend += Number(order.cost ?? 0);
    current.jobs += 1;
    assetSpend.set(label, current);
  }

  /**
   * Parts handed over count against the truck they were drawn for: at sign-off
   * the store posts releasedValue to this truck's file (weighted-average
   * costed), so a truck's maintenance spend includes the parts physically
   * fitted to it, not only the workshop's labour line.
   */
  const partsByKey = new Map<string, { value: number; jobs: number; label: string }>();
  for (const requisition of requisitions) {
    if (requisition.status !== "Released" || !requisition.releasedValue) continue;
    const key = keyOf(requisition.truckReg);
    if (!key) continue;
    const current = partsByKey.get(key) ?? {
      value: 0,
      jobs: 0,
      label: String(requisition.truckReg || key),
    };
    current.value += Number(requisition.releasedValue);
    current.jobs += 1;
    partsByKey.set(key, current);
  }
  for (const [key, entry] of partsByKey) {
    const current = [...assetSpend.values()].find((a) => keyOf(a.label) === key);
    if (current) {
      current.spend += entry.value;
      current.jobs += entry.jobs;
    } else {
      assetSpend.set(`parts-${key}`, {
        label: entry.label,
        spend: entry.value,
        jobs: entry.jobs,
      });
    }
  }

  const defectCounts = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const key = order.category || "Uncategorised";
    defectCounts.set(key, (defectCounts.get(key) ?? 0) + 1);
  }

  const sum = (list: EngJob[]) => list.reduce((total, job) => total + job.cost, 0);
  const longestDays = openList[0]?.days ?? 0;

  /* --------------------------------------- return to service (RTS) ------- */

  /** Open jobs the workshop has promised a date for, soonest promise first. */
  const rtsList = openList
    .filter((job) => job.rtsDays !== null)
    .sort((a, b) => (a.rtsDays ?? 0) - (b.rtsDays ?? 0));
  const lateList = rtsList.filter((job) => (job.rtsDays ?? 0) < 0);
  const nextPromise = rtsList[0];

  /* ------------------------------------------- cost per kilometre --------- */

  /**
   * The odometer trail per truck: readings from the fuel records inside the
   * window, oldest first. Distance is last reading − first reading, which is the
   * only mileage figure the platform actually records.
   */
  const odometerTrail = new Map<string, { at: number; value: number }[]>();
  for (const record of fuel) {
    const value = Number(record.odometer ?? 0);
    const at = parseGateStamp(record.date);
    if (value <= 0 || !at || !inPeriod(record.date, range)) continue;
    const key = keyOf(record.truckReg);
    if (!key) continue;
    odometerTrail.set(key, [...(odometerTrail.get(key) ?? []), { at: at.getTime(), value }]);
  }

  const spendByKey = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "Cancelled" || !inPeriod(jobMoment(order), range)) continue;
    const key = keyOf(order.truckReg);
    if (!key) continue;
    spendByKey.set(key, (spendByKey.get(key) ?? 0) + Number(order.cost ?? 0));
  }

  const cpkRows: EngCpkRow[] = [];
  let measuredKm = 0;
  let measuredSpend = 0;
  let measuredReadings = 0;
  for (const [key, trail] of odometerTrail) {
    const sorted = [...trail].sort((a, b) => a.at - b.at);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last || sorted.length < 2 || last.value <= first.value) continue;
    const km = Math.round(last.value - first.value);
    const spend = spendByKey.get(key) ?? 0;
    const head = heads.find((h) => {
      const hk = headKeys(h);
      return hk.plate === key || hk.head.includes(key);
    });
    measuredKm += km;
    measuredSpend += spend;
    measuredReadings += sorted.length;
    cpkRows.push({
      label: head ? truckLabel(head) : key.toUpperCase(),
      km,
      spend,
      cpk: km > 0 ? spend / km : null,
      readings: sorted.length,
    });
  }
  cpkRows.sort((a, b) => (b.cpk ?? 0) - (a.cpk ?? 0));
  const windowSpend = sum(spendList);

  /* ------------------------------------------- the parts approval desk --- */

  const itemById = new Map(items.map((item) => [String(item.id), item]));
  const jobByKey = new Map<string, WorkOrder>();
  for (const order of orders) {
    const key = keyOf(order.truckReg);
    if (key && !jobByKey.has(key)) jobByKey.set(key, order);
  }

  const readRequest = (request: InventoryRequisition): EngPartRequest => {
    const resolved = resolveTruck({ truckReg: request.truckReg } as WorkOrder, heads);
    const job = jobByKey.get(keyOf(request.truckReg));
    const item = request.itemId ? itemById.get(String(request.itemId)) : undefined;
    // The request's own snapshot wins; the store price only fills a blank.
    const unitCost = Number(request.unitCost ?? 0) || Number(item?.unitCost ?? 0);
    const quantity = Number(request.quantity ?? 0);
    return {
      id: String(request.id),
      truck: resolved ? truckLabel(resolved) : String(request.truckReg || "—"),
      truckReg: String(request.truckReg || ""),
      defect: job?.defect ?? "",
      part: request.part || "Part not named",
      quantity,
      unitCost,
      cost: unitCost * quantity,
      mechanic: request.mechanic || "Unassigned",
      reason: request.reason || "",
      requestedAt: String(request.date || ""),
      itemId: String(request.itemId || ""),
      stock: item ? Number(item.stock) : null,
      short: item ? Number(item.stock) < quantity : false,
    };
  };

  /** Oldest first: a request queue is worked in the order it was raised. */
  const pendingReqs = requisitions
    .filter((request) => request.status === "Pending")
    .map(readRequest)
    .sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : a.requestedAt > b.requestedAt ? 1 : 0));

  /**
   * Approved and on the store floor: the ticket is his decision made, awaiting
   * a physical handover the store performs (or paused because the shelf could
   * not cover it). Counted as decided-in-window for the spend figure.
   */
  const approvedInWindow = requisitions.filter(
    (request) =>
      request.status !== "Pending" &&
      request.status !== "Rejected" &&
      inPeriod(request.date, range),
  ).length;

  /* ------------------------------------------------------------ the store */

  const alerts: EngStockAlert[] = items
    .filter((item) => item.status !== "In Stock" || item.stock <= item.reorderLevel)
    .map((item) => {
      const waiting = pendingReqs
        .filter((request) => request.itemId === String(item.id))
        .reduce((total, request) => total + request.quantity, 0);
      return {
        name: item.name || item.sku || "Unnamed part",
        sku: item.sku || "—",
        stock: Number(item.stock),
        reorderLevel: Number(item.reorderLevel),
        status: item.status,
        unitCost: Number(item.unitCost),
        waiting,
        shortBy: Math.max(0, waiting - Number(item.stock)),
      };
    })
    .sort((a, b) => b.shortBy - a.shortBy || a.stock - b.stock);

  return {
    spend: { total: sum(spendList), jobs: spendList.length, list: spendList },
    partsQueue: {
      value: sum(partsList),
      count: partsList.length,
      list: partsList,
    },
    open: { count: openList.length, value: sum(openList), list: openList },
    shop: {
      maintenance: maintenanceList.length,
      checkUp: checkUpList.length,
      accident: accidentList.length,
      maintenanceList,
      checkUpList,
      accidentList,
    },
    downtime: {
      longestDays: round1(longestDays),
      flagged: openList.filter((job) => (job.days ?? 0) >= DOWNTIME_FLAG_DAYS).length,
      list: openList,
    },
    turnaround: {
      avgDays: completedDays.length
        ? round1(completedDays.reduce((a, b) => a + b, 0) / completedDays.length)
        : null,
      completed: completed.length,
      byMechanic: [...byMechanic.entries()]
        .map(([mechanic, list]) => ({
          mechanic,
          jobs: list.length,
          avgDays: round1(list.reduce((a, b) => a + b, 0) / list.length),
        }))
        .sort((a, b) => (a.avgDays ?? 0) - (b.avgDays ?? 0)),
    },
    costPerAsset: [...assetSpend.values()].sort((a, b) => b.spend - a.spend),
    defects: [...defectCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    totalJobs: orders.filter((o) => o.status !== "Cancelled").length,
    unpricedInQueue: partsList.filter((job) => job.cost <= 0).length,
    cpk: {
      value: measuredKm > 0 ? measuredSpend / measuredKm : null,
      km: measuredKm,
      spend: measuredSpend,
      readings: measuredReadings,
      trucks: cpkRows.length,
      unmeasuredSpend: Math.max(0, windowSpend - measuredSpend),
      list: cpkRows,
    },
    rts: {
      promised: rtsList.length,
      missing: openList.length - rtsList.length,
      next: nextPromise
        ? {
            truck: nextPromise.truckReg,
            label: nextPromise.truck,
            date: nextPromise.estimatedReadyAt,
            days: nextPromise.rtsDays,
            tone: (nextPromise.rtsDays ?? 0) < 0 ? "red" : (nextPromise.rtsDays ?? 0) <= 1 ? "amber" : "green",
          }
        : null,
      overdue: {
        count: lateList.length,
        worstDays: lateList.length ? Math.abs(Math.min(...lateList.map((job) => job.rtsDays ?? 0))) : 0,
        list: lateList,
      },
      list: rtsList,
    },
    requisitions: {
      pending: {
        count: pendingReqs.length,
        value: pendingReqs.reduce((total, request) => total + request.cost, 0),
        unpriced: pendingReqs.filter((request) => request.cost <= 0).length,
        blocked: pendingReqs.filter((request) => request.short).length,
        list: pendingReqs,
      },
      decided: approvedInWindow,
    },
    inventory: {
      items: items.length,
      outOfStock: items.filter((item) => item.status === "Out of Stock" || Number(item.stock) <= 0)
        .length,
      low: items.filter(
        (item) => Number(item.stock) > 0 && Number(item.stock) <= Number(item.reorderLevel),
      ).length,
      value: items.reduce((total, item) => total + Number(item.stock) * Number(item.unitCost), 0),
      list: alerts,
    },
  };
}

/** Median of a numeric list — robust to the one job that sat for a month. */
function median(list: number[]): number | null {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 !== 0) return hi;
  return ((sorted[mid - 1] ?? 0) + hi) / 2;
}

/**
 * The Gate House, as the Transport Manager audits it.
 *
 * Every figure comes from the gate's own stamps on the dispatch — the moment
 * Security logged the truck out, the moment it logged it back in, and the
 * turnaround the TM set at final approval. A truck is "in the yard" because the
 * gate has no open movement for it, which is the only definition that stays
 * true when someone forgets to flip a status field.
 */
export function buildSecurityOversight(
  trips: Trip[],
  heads: TruckHead[],
  range: PeriodRange,
  now: Date,
): SecurityOversight {
  /** Only dispatches the gate has actually accepted are gate business. */
  const gateTrips = trips.filter(
    (t) => gateDepartureStamp(t) !== null || ["Scheduled", "Delayed"].includes(String(t.status)),
  );

  const readTrip = (trip: Trip): SecTrip => {
    const departedAt = gateDepartureStamp(trip);
    const returnedAt = gateReturnStamp(trip);
    const out = parseGateStamp(departedAt);
    const back = parseGateStamp(returnedAt);
    const expected = isOutOfYard(trip) ? expectedReturnAt(trip) : null;
    const released = parseGateStamp(trip.dispatchedAt) ?? parseGateStamp(trip.assignedAt);
    return {
      id: String(trip.id),
      label: displayRequestId(trip),
      partner: partnerOf(trip) || "—",
      route: trip.dropoff || "—",
      truck: movementTruck(trip),
      driver: trip.driverName || "Unassigned",
      departedAt,
      returnedAt,
      gateOutBy: (trip as { gateOutBy?: string | null }).gateOutBy ?? null,
      gateInBy: (trip as { gateInBy?: string | null }).gateInBy ?? null,
      hoursOut: out && !back ? round1((now.getTime() - out.getTime()) / 3_600_000) : null,
      /** Wait is measured from the TM's release — before that the gate owes nothing. */
      waitHours:
        !departedAt && released ? round1((now.getTime() - released.getTime()) / 3_600_000) : null,
      overdueHours:
        expected && expected.getTime() < now.getTime()
          ? round1((now.getTime() - expected.getTime()) / 3_600_000)
          : null,
      expectedReturn: expected,
      tone: "grey",
    };
  };

  /**
   * One row per TRUCK, not per dispatch.
   *
   * A truck can carry more than one open dispatch (a re-assignment that never
   * closed the first), and counting rows would put the yard total above the
   * fleet — a board that says 49 of 115 heads then "72 in the yard" adds up to
   * 121 trucks. The yard is counted in trucks, so the list is too; the longest
   * open movement per truck is the one that describes where that truck is.
   */
  const outList: SecTrip[] = [];
  for (const trip of gateTrips.filter(isOutOfYard).map(readTrip)) {
    const key = truckKey(trip);
    if (!key || key === "truck tbd") continue;
    const at = outList.findIndex((row) => truckKey(row) === key);
    if (at === -1) outList.push(trip);
    else if ((trip.hoursOut ?? 0) > (outList[at]?.hoursOut ?? 0)) outList[at] = trip;
  }
  const outRows = outList
    .map((t) => ({
      ...t,
      tone: (t.overdueHours ? "red" : t.hoursOut && t.hoursOut > 96 ? "amber" : "purple") as DeptTone,
    }))
    .sort((a, b) => (b.hoursOut ?? 0) - (a.hoursOut ?? 0));

  const pendingExitList = gateTrips
    .filter((t) => gateDepartureStamp(t) === null)
    .map(readTrip)
    .sort((a, b) => (b.waitHours ?? 0) - (a.waitHours ?? 0))
    .map((t) => ({
      ...t,
      tone: ((t.waitHours ?? 0) >= EXIT_WAIT_FLAG_HOURS ? "amber" : "grey") as DeptTone,
    }));

  const overdueList = outRows.filter((t) => t.overdueHours !== null);

  const measured = gateTrips
    .map((trip) => ({ trip, hours: gateTurnaroundHours(trip) }))
    .filter((row) => row.hours !== null)
    .filter((row) => inPeriod(gateReturnStamp(row.trip), range))
    .map((row) => {
      const read = readTrip(row.trip);
      return { ...read, hoursOut: round1(row.hours as number), tone: "green" as DeptTone };
    })
    .sort((a, b) => (b.hoursOut ?? 0) - (a.hoursOut ?? 0));

  const hours = measured.map((t) => t.hoursOut ?? 0);

  /** A truck is out if the gate has an open movement for it, whatever its status. */
  const inYard = Math.max(0, heads.length - outRows.length);

  const departureTrips = gateTrips.filter((t) =>
    inPeriod(parseGateStamp(gateDepartureStamp(t)), range),
  );
  const returnTrips = gateTrips.filter((t) => inPeriod(parseGateStamp(gateReturnStamp(t)), range));

  /** One row per movement in the window, newest first — the gate's own ledger. */
  const movementList: SecTrip[] = [
    ...departureTrips.map((t) => ({ ...readTrip(t), tone: "purple" as DeptTone })),
    ...returnTrips.map((t) => ({ ...readTrip(t), tone: "green" as DeptTone })),
  ].sort((a, b) => {
    const at = parseGateStamp(b.returnedAt ?? b.departedAt)?.getTime() ?? 0;
    const bt = parseGateStamp(a.returnedAt ?? a.departedAt)?.getTime() ?? 0;
    return at - bt;
  });

  return {
    yard: { inYard, out: outRows.length, totalHeads: heads.length, list: outRows },
    pendingExits: {
      count: pendingExitList.length,
      longestHours: pendingExitList[0]?.waitHours ?? null,
      list: pendingExitList,
    },
    awaitingReturn: {
      count: outRows.length,
      expectedKnown: outRows.filter((t) => t.expectedReturn !== null).length,
      list: outRows,
    },
    overdue: { count: overdueList.length, list: overdueList },
    tat: {
      avgHours: hours.length ? round1(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
      medianHours: median(hours) === null ? null : round1(median(hours) as number),
      longestHours: hours.length ? Math.max(...hours) : null,
      measured: measured.length,
      list: measured,
    },
    movements: { departures: departureTrips.length, returns: returnTrips.length, list: movementList },
    guardLedger: buildGuardLedger(movementList),
  };
}

/**
 * The Guard Activity Ledger, read straight off the movements: one row per gate
 * stamp — which security account scanned the truck out or in, and exactly when.
 * The newest first; stamps taken before the gate signed its work list the actor
 * as "Unsigned (pre-ledger)" so the ledger never pretends accountability it
 * does not have.
 */
function buildGuardLedger(movements: SecTrip[]): SecurityOversight["guardLedger"] {
  const rows: SecurityOversight["guardLedger"]["list"] = [];
  let departures = 0;
  let returns = 0;
  let unsigned = 0;
  for (const t of movements) {
    if (t.departedAt) {
      departures++;
      const guard = (t.gateOutBy ?? "").trim();
      if (!guard) unsigned++;
      rows.push({
        id: `${t.id}-out`,
        label: t.label,
        truck: t.truck,
        driver: t.driver,
        guard: guard || "Unsigned (pre-ledger)",
        action: "Logged Out",
        at: t.departedAt,
      });
    }
    if (t.returnedAt) {
      returns++;
      const guard = (t.gateInBy ?? "").trim();
      if (!guard) unsigned++;
      rows.push({
        id: `${t.id}-in`,
        label: t.label,
        truck: t.truck,
        driver: t.driver,
        guard: guard || "Unsigned (pre-ledger)",
        action: "Logged In",
        at: t.returnedAt,
      });
    }
  }
  rows.sort((a, b) => {
    const at = parseGateStamp(a.at)?.getTime() ?? 0;
    const bt = parseGateStamp(b.at)?.getTime() ?? 0;
    return bt - at;
  });
  return { departures, returns, unsigned, list: rows.slice(0, 80) };
}

/** `31.4h` / `2.3d` — a duration in the unit that reads best at its size. */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 24) return `${round1(hours)}h`;
  return `${round1(hours / 24)}d`;
}
