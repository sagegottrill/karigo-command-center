/**
 * The departments a notification can come from, and where each one lives.
 *
 * The Transport Manager's center used to be one pile of 900 rows sorted by
 * nothing but recency, so "what has Engineering sent me" was unanswerable and
 * the 57 dispatches waiting on him were buried under truck-status bookkeeping.
 * Every row now carries the module that produced it, and this file is the single
 * place that says what each module is called, how it reads, and which board it
 * belongs to — so the center, the popover and the bell badge can never disagree.
 */
import { authService } from "./services";
import type { Notification } from "./types";

export type NotificationModuleName =
  | "Fleet Operations"
  | "Gate Security"
  | "Tracking"
  | "Engineering"
  | "Inventory"
  | "HR & Personnel"
  | "Accounts"
  | "Fuel & Lubricant"
  | "Partners"
  | "System";

type ModuleShape = {
  /** The board this department works on. */
  board: string;
  /** Board label, for "Open …" affordances. */
  boardLabel: string;
  /** Short chip label. */
  short: string;
  /** The one line that says what this module's rows are about. */
  blurb: string;
};

export const NOTIFICATION_MODULES: Record<NotificationModuleName, ModuleShape> = {
  "Fleet Operations": {
    board: "/workspace/app/dispatch-history",
    boardLabel: "Dispatch history",
    short: "Fleet Ops",
    blurb: "Requests, assignments and dispatch lifecycle",
  },
  "Gate Security": {
    board: "/workspace/app/gate",
    boardLabel: "Gate house",
    short: "Gate",
    blurb: "Gate departures and returns",
  },
  Tracking: {
    board: "/workspace/app/live-tracking",
    boardLabel: "Live tracking",
    short: "Tracking",
    blurb: "Location checkpoints and delays",
  },
  Engineering: {
    board: "/workspace/app/engineering",
    boardLabel: "Engineering",
    short: "Engineering",
    blurb: "Work orders, repairs and parts",
  },
  Inventory: {
    board: "/workspace/app/inventory-desk",
    boardLabel: "Inventory desk",
    short: "Inventory",
    blurb: "Handoffs, inbound stock and store variances",
  },
  "HR & Personnel": {
    board: "/workspace/app/hr",
    boardLabel: "Staff records",
    short: "HR",
    blurb: "Staff, licences and duty",
  },
  Accounts: {
    board: "/workspace/app/accounts",
    boardLabel: "Accounts",
    short: "Accounts",
    blurb: "Accounts, expenses and logins",
  },
  "Fuel & Lubricant": {
    board: "/workspace/app/lubricant-inventory",
    boardLabel: "Fuel & lubricant",
    short: "Fuel",
    blurb: "The tank, releases and disbursements",
  },
  Partners: {
    board: "/workspace/app/partner-requests",
    boardLabel: "Partner requests",
    short: "Partners",
    blurb: "Requests raised by partner companies",
  },
  System: {
    board: "/workspace/app/notifications",
    boardLabel: "Notification center",
    short: "System",
    blurb: "Platform-level notices",
  },
};

/** Where this reader's full notification center lives. */
export function notificationCenterPath(): string {
  return authService.getRoles().includes("Customer Portals (External)")
    ? "/workspace/customer-portal/notifications"
    : "/workspace/app/notifications";
}

/** Reading order for the rail: the queues the TM works first, System last. */
export const MODULE_ORDER: NotificationModuleName[] = [
  "Fleet Operations",
  "Partners",
  "Gate Security",
  "Tracking",
  "Engineering",
  "Fuel & Lubricant",
  "HR & Personnel",
  "Accounts",
  "System",
];

/** A row's module, falling back to the platform bucket for legacy rows. */
export function moduleOf(row: Notification): NotificationModuleName {
  const name = String(row.module || "").trim() as NotificationModuleName;
  return name in NOTIFICATION_MODULES ? name : "System";
}

export function moduleShape(row: Notification): ModuleShape {
  return NOTIFICATION_MODULES[moduleOf(row)];
}

/** Roles allowed into the dispatch record page — a link there must not 403. */
const DISPATCH_DETAIL_ROLES = [
  "Transport Manager",
  "Fleet Operations",
  "Security",
  "Tracking",
  "Loading",
  "Platform Admin",
];

/**
 * Where a row should take the reader.
 *
 * Dispatch-family alerts carry the trip's own id, so those open the dispatch
 * itself — but only for roles the record page admits. Everyone else, and every
 * other module, is sent to the board the alert belongs to rather than to a
 * redirect. `record` is the display reference (DIS-xxxxx), never an internal id.
 */
export function notificationTarget(row: Notification): {
  to: string;
  label: string;
  record: string | null;
  opensRecord: boolean;
} {
  const record = (row.refLabel || "").trim() || null;
  const roles = authService.getRoles();

  /**
   * A partner reads the same rows through a different portal, and every staff
   * board is closed to them — sending them there would only bounce them to
   * Unauthorized. Their own cargo record is the right destination.
   */
  if (roles.includes("Customer Portals (External)")) {
    const hasRecord =
      Boolean(row.refId) && /^(dispatch|tracking|gate)\./.test(String(row.eventKey || ""));
    if (hasRecord) {
      return {
        to: `/workspace/customer-portal/${row.refId}`,
        label: "Open request",
        record,
        opensRecord: true,
      };
    }
    return {
      to: "/workspace/customer-portal/request",
      label: "My requests",
      record,
      opensRecord: false,
    };
  }

  const opensRecordFamily =
    /^(dispatch|tracking|fuel|gate)\./.test(String(row.eventKey || "")) ||
    /^DIS-/i.test(record || "");
  const allowed = roles.some((role: string) => DISPATCH_DETAIL_ROLES.includes(role));

  if (opensRecordFamily && row.refId && allowed) {
    return {
      to: `/workspace/app/active-dispatch/${row.refId}`,
      label: "Open dispatch",
      record,
      opensRecord: true,
    };
  }

  const shape = moduleShape(row);
  return { to: shape.board, label: shape.boardLabel, record, opensRecord: false };
}

/**
 * The relative age of a row, measured from its own timestamp rather than from
 * the human string the API writes ("Just now" is only true for a moment).
 */
export function relativeAge(row: Notification): string {
  const stamp = row.createdAt ? Date.parse(String(row.createdAt)) : NaN;
  if (Number.isNaN(stamp)) return row.time || "—";
  const mins = Math.max(0, Math.round((Date.now() - stamp) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(stamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The absolute stamp, for the tooltip — the fact behind the word. */
export function absoluteStamp(row: Notification): string {
  const stamp = row.createdAt ? Date.parse(String(row.createdAt)) : NaN;
  if (Number.isNaN(stamp)) return row.time || "—";
  return new Date(stamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Severity, as the center draws it.
 *
 * Compared as a string: the API writes `error` on some rows (a suspension, a
 * declined request) which the model's union does not list, and a strict
 * comparison silently dropped those to blue instead of red.
 */
export function severityTone(row: Notification): "red" | "amber" | "green" | "blue" {
  const severity = String(row.severity || "");
  if (severity === "critical" || severity === "error") return "red";
  if (severity === "warning") return "amber";
  if (severity === "success") return "green";
  return "blue";
}

export const SEVERITY_CLASS: Record<"red" | "amber" | "green" | "blue", string> = {
  red: "bg-[#ED351D]",
  amber: "bg-[#F79009]",
  green: "bg-[#12B76A]",
  blue: "bg-[#2463EB]",
};
