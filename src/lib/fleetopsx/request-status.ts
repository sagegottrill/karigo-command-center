import type { FuelRequest, InventoryRequisition } from "./types";

/**
 * The engineering request chain, in the words the approved design prints.
 *
 * Parts:  supervisor raises → Awaiting HOE Review → Head validates →
 *         Awaiting Admin Approval → Transfer Manager approves →
 *         Awaiting Pickup / Awaiting Procurement (the store's queue) →
 *         Released (handed over — "Parts Issued").
 *         Legacy one-liners still travel as Pending → the same store queue.
 *
 * Lubricant: Requested → HOE Approved → Authorized (TM) → Dispensed (desk).
 */

export type RequestStage =
  | "Awaiting HOE Review"
  | "Awaiting Admin Approval"
  | "Store Queue"
  | "Issued"
  | "Rejected"
  | "Legacy";

const PILL = {
  "Awaiting HOE Review": "bg-[#F99E1F]/15 text-[#B26A00]",
  "Awaiting Admin Approval": "bg-[#2F6BD8]/10 text-[#2F6BD8]",
  "Approved by Admin": "bg-[#34C759]/15 text-[#0A8F4D]",
  "Awaiting Procurement": "bg-[#7C3AED]/10 text-[#7C3AED]",
  "Parts Issued": "bg-[#E2E5E9] text-[#5C6470]",
  Rejected: "bg-[#ED351D]/10 text-[#ED351D]",
  Pending: "bg-[#F99E1F]/15 text-[#B26A00]",
};

/** The badge the design prints for one ticket. */
export function requisitionBadge(r: Pick<InventoryRequisition, "status" | "releasedValue" | "itemId">): {
  label: string;
  pill: string;
} {
  switch (r.status) {
    case "Awaiting HOE Review":
      return { label: "Awaiting HOE Review", pill: PILL["Awaiting HOE Review"] };
    case "Awaiting Admin Approval":
      return { label: "Awaiting Admin Approval", pill: PILL["Awaiting Admin Approval"] };
    case "Awaiting Pickup":
      return { label: "Approved by Admin", pill: PILL["Approved by Admin"] };
    case "Awaiting Procurement":
      return { label: "Awaiting Procurement", pill: PILL["Awaiting Procurement"] };
    case "Released":
      // Non-stock lines the TM approves skip the shelf — they were never issued.
      return r.releasedValue != null || r.itemId
        ? { label: "Parts Issued", pill: PILL["Parts Issued"] }
        : { label: "Approved by Admin", pill: PILL["Approved by Admin"] };
    case "Rejected":
      return { label: "Rejected", pill: PILL.Rejected };
    default:
      return { label: "Pending Review", pill: PILL.Pending };
  }
}

/** May the Head of Engineering still decide this ticket? */
export const hoeReviewable = (status: string) => status === "Awaiting HOE Review";

/** May the Transfer Manager still approve this ticket? Legacy Pending included. */
export const tmApprovable = (status: string) =>
  status === "Awaiting Admin Approval" || status === "Pending";

/** One multi-line request: the header the design cards print, with its lines. */
export type RequestGroup = {
  key: string;
  targetType: string;
  truckReg: string;
  description: string;
  requestedBy: string;
  reviewedBy: string;
  date: string;
  lines: InventoryRequisition[];
  totalValue: number;
  /** The group's stage — Mixed when lines drifted apart (never normal). */
  stage: string;
};

/** Fold ticket rows into their request cards, newest first. */
export function groupRequisitions(rows: InventoryRequisition[]): RequestGroup[] {
  const map = new Map<string, RequestGroup>();
  for (const r of rows) {
    const key = r.requestGroup || `line-${r.id}`;
    const existing =
      map.get(key) ??
      ({
        key,
        targetType: r.targetType || "Truck Head",
        truckReg: r.truckReg,
        description: r.description || r.reason,
        requestedBy: r.mechanic,
        reviewedBy: r.reviewedBy,
        date: r.date,
        lines: [],
        totalValue: 0,
        stage: "",
      } satisfies RequestGroup);
    existing.lines.push(r);
    existing.totalValue += r.quantity * (Number(r.unitCost) || 0);
    if (r.date > existing.date) existing.date = r.date;
    if (r.reviewedBy) existing.reviewedBy = r.reviewedBy;
    map.set(key, existing);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    const stages = new Set(g.lines.map((l) => requisitionBadge(l).label));
    g.stage = stages.size === 1 ? ([...stages][0] ?? "Mixed") : "Mixed";
  }
  return groups.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Lubricant badge in the same words. */
export function fuelBadge(r: Pick<FuelRequest, "status">): { label: string; pill: string } {
  switch (r.status) {
    case "Requested":
      return { label: "Awaiting HOE Review", pill: PILL["Awaiting HOE Review"] };
    case "HOE Approved":
      return { label: "Awaiting Admin Approval", pill: PILL["Awaiting Admin Approval"] };
    case "Authorized":
      return { label: "Approved by Admin", pill: PILL["Approved by Admin"] };
    case "Dispensed":
      return { label: "Dispensed", pill: PILL["Parts Issued"] };
    default:
      return { label: "Declined", pill: PILL.Rejected };
  }
}

/** An engineering draw the HOE may still decide (walk-in sales skip HOE). */
export const hoeReviewableFuel = (r: Pick<FuelRequest, "status" | "targetType" | "source">) =>
  r.status === "Requested" && r.source === "Internal Use" && Boolean(r.targetType);

/** A draw the Transfer Manager may still authorise. */
export const tmAuthorizableFuel = (r: Pick<FuelRequest, "status" | "targetType" | "source">) =>
  r.status === "HOE Approved" ||
  (r.status === "Requested" && (r.source !== "Internal Use" || !r.targetType));
