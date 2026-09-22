import { authService } from "@/lib/fleetopsx/services";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import type { TruckHead, WorkOrder, WorkOrderStatus } from "@/lib/fleetopsx/types";

/**
 * Shared by every Engineering & Maintenance page (Work Orders, Truck
 * Availability, Repair Spend) so the three cannot disagree about which truck a
 * job belongs to or what a status looks like.
 */

/**
 * Who works the department's boards, and who may only read them.
 *
 * Engineering & Maintenance owns the workshop; the Transport Manager reads the
 * same work orders, costs and truck verdicts as oversight — a glimpse of the
 * department, not its desk.
 */
export const ENGINEERING_OWNER_ROLES = [
  "Engineering",
  "Engineering & Maintenance",
  "Engineering and Maintenance",
  "Platform Admin",
];

/** Who may open the boards at all: the department itself plus its supervisor. */
export const ENGINEERING_ACCESS_ROLES = [...ENGINEERING_OWNER_ROLES, "Transport Manager"];

export function rolesCanWorkOnTrucks() {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => ENGINEERING_OWNER_ROLES.includes(r));
}

/** Status → its pill, in the portal's own tones. */
export function statusPillClass(status: WorkOrderStatus) {
  switch (status) {
    case "Reported":
      return "bg-[#627084] text-white";
    case "Diagnosing":
      return "bg-[#2F6BD8] text-white";
    case "Awaiting Parts":
      return "bg-[#F99E1F] text-white";
    case "Repairing":
      return "bg-[#ED351D] text-white";
    case "Testing":
      return "bg-[#1B2432] text-white";
    case "Completed":
      return "bg-[#34C759] text-white";
    case "Cancelled":
      return "bg-[#E2E5E9] text-[#5C6470]";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function priorityPillClass(priority: WorkOrder["priority"]) {
  switch (priority) {
    case "Low":
      return "bg-[#E2E5E9] text-[#5C6470]";
    case "Medium":
      return "bg-[#2F6BD8]/10 text-[#2F6BD8]";
    case "High":
      return "bg-[#F99E1F]/15 text-[#B26A00]";
    case "Critical":
      return "bg-[#ED351D] text-white";
    default:
      return "bg-[#E2E5E9] text-[#5C6470]";
  }
}

export function truckStatusPillClass(status: TruckHead["status"]) {
  switch (status) {
    case "Available":
      return "bg-[#34C759] text-white";
    case "Assigned":
      return "bg-[#2F6BD8] text-white";
    case "Out of Yard":
      return "bg-[#627084] text-white";
    case "Check Up":
      return "bg-[#2F6BD8] text-white";
    case "Maintenance":
      return "bg-[#F99E1F] text-white";
    case "Accident":
      return "bg-[#ED351D] text-white";
    case "Blocked":
      return "bg-[#1B2432] text-white";
    default:
      return "bg-[#E2E5E9] text-[#5C6470]";
  }
}

/** `P073 (APP857YL)` — the truck as every other board in the portal names it. */
export function truckLabel(head: TruckHead) {
  const cap = displayHeadCap(head) || head.number;
  return head.registration ? `${cap} (${head.registration})` : cap;
}

/**
 * Which truck a work order is for.
 *
 * Jobs raised from these pages store the PLATE (so the Transport Manager's fleet
 * audit can match them), but legacy rows carry a cap label — `P073 (APP857YL)`
 * or just `P073` — so every shape is resolved back to a registry row.
 */
export function workOrderKeys(order: WorkOrder) {
  const raw = String(order.truckReg ?? "").trim();
  const inParens = /\(([^)]+)\)/.exec(raw)?.[1];
  const cap = raw.split(/[\s(]/)[0] ?? "";
  return {
    plate: (inParens ?? raw).trim().toLowerCase(),
    head: cap.trim().toLowerCase(),
  };
}

export function headKeys(head: TruckHead) {
  return {
    plate: String(head.registration ?? "").trim().toLowerCase(),
    head: [head.capNumber, head.number].filter(Boolean).map((v) => String(v).trim().toLowerCase()),
  };
}

export function resolveTruck(order: WorkOrder, heads: TruckHead[]): TruckHead | undefined {
  const keys = workOrderKeys(order);
  return heads.find((h) => {
    const hk = headKeys(h);
    if (keys.plate && hk.plate && keys.plate === hk.plate) return true;
    return keys.head && hk.head.includes(keys.head);
  });
}

/**
 * The trucks that need Engineering come first, in the order the yard asks: a
 * truck that just came back through the gate is waiting on us, a truck out on a
 * job is not.
 */
export const TRUCK_RANK: Record<string, number> = {
  "Check Up": 0,
  Maintenance: 1,
  Accident: 2,
  Available: 3,
  Assigned: 4,
  "Out of Yard": 5,
  Blocked: 6,
};

/** Latest job per truck, and the open one — keyed by plate (or cap for legacy). */
export function indexWorkOrdersByTruck(orders: WorkOrder[]) {
  const latest = new Map<string, WorkOrder>();
  const open = new Map<string, WorkOrder>();
  for (const order of orders) {
    const keys = workOrderKeys(order);
    const key = keys.plate || keys.head;
    if (!key) continue;
    const current = latest.get(key);
    if (!current || new Date(order.reportedAt || 0) > new Date(current.reportedAt || 0)) {
      latest.set(key, order);
    }
    if (order.status !== "Completed" && order.status !== "Cancelled" && !open.has(key)) open.set(key, order);
  }
  return { latest, open };
}

export function lookupForTruck<T>(map: Map<string, T>, head: TruckHead): T | undefined {
  const hk = headKeys(head);
  const byPlate = map.get(hk.plate);
  if (byPlate) return byPlate;
  for (const key of hk.head) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return undefined;
}
