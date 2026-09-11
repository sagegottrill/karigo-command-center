/**
 * Department-scoped notifications — filter + synthesize from live ops (no Figma dummy rows).
 */
import { displayRequestId } from "./request-id";
import { looksLikeUuid } from "./display-ids";
import type { Driver, Expense, Notification, Trip, WorkOrder } from "./types";

export type NotificationCategory = Notification["category"];

const ROLE_CATEGORIES: Record<string, NotificationCategory[]> = {
  "Transport Manager": ["Operations", "Approvals", "Compliance", "Engineering", "Security", "System"],
  "Platform Admin": ["Operations", "Approvals", "Compliance", "Engineering", "Security", "System"],
  Superadmin: ["Operations", "Approvals", "Compliance", "Engineering", "Security", "System"],
  "Fleet Operations": ["Operations", "System"],
  Engineering: ["Engineering", "System"],
  "Parts & Store": ["Engineering", "System"],
  Accounts: ["Approvals", "System"],
  HR: ["Compliance", "System"],
  Security: ["Security", "Operations", "System"],
  Driver: ["Operations", "System"],
  "Customer Portals (External)": ["Operations", "System"],
  Diesel: ["Operations", "System"],
};

export function categoriesForRoles(roles: string[]): NotificationCategory[] {
  const set = new Set<NotificationCategory>();
  for (const role of roles) {
    const cats = ROLE_CATEGORIES[role];
    if (cats) cats.forEach((c) => set.add(c));
  }
  if (set.size === 0) {
    set.add("System");
    set.add("Operations");
  }
  return [...set];
}

export function tabsForRoles(roles: string[]): Array<"All" | "Operations" | "Approval" | "Engineering" | "Security" | "Compliance"> {
  const cats = categoriesForRoles(roles);
  const tabs: Array<"All" | "Operations" | "Approval" | "Engineering" | "Security" | "Compliance"> = ["All"];
  if (cats.includes("Operations")) tabs.push("Operations");
  if (cats.includes("Approvals")) tabs.push("Approval");
  if (cats.includes("Engineering")) tabs.push("Engineering");
  if (cats.includes("Security")) tabs.push("Security");
  if (cats.includes("Compliance")) tabs.push("Compliance");
  return tabs;
}

function isNonsenseNotification(n: Notification): boolean {
  const title = (n.title || "").trim();
  const body = (n.body || "").trim();
  if (!title && !body) return true;
  if (looksLikeUuid(title) || looksLikeUuid(body)) return true;
  if (/^[0-9a-f-]{20,}$/i.test(title)) return true;
  if (/lorem|placeholder|sample|dummy|test notif/i.test(`${title} ${body}`)) return true;
  if (/kim lee|marcus sterling|req-85126|cap-992/i.test(`${title} ${body}`)) return true;
  return false;
}

export function filterNotificationsForRoles(items: Notification[], roles: string[]): Notification[] {
  const allowed = new Set(categoriesForRoles(roles));
  return items.filter((n) => {
    if (isNonsenseNotification(n)) return false;
    if (!allowed.has(n.category)) return false;
    return true;
  });
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Just now";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Build department-relevant alerts from live operational records when API inbox is empty/junk. */
export function synthesizeRoleNotifications(input: {
  roles: string[];
  trips: Trip[];
  expenses?: Expense[];
  workOrders?: WorkOrder[];
  drivers?: Driver[];
}): Notification[] {
  const roles = input.roles;
  const out: Notification[] = [];
  const push = (n: Omit<Notification, "id" | "read"> & { id?: string }) => {
    out.push({
      id: n.id || `syn-${out.length + 1}`,
      category: n.category,
      title: n.title,
      body: n.body,
      time: n.time,
      read: false,
      severity: n.severity,
    });
  };

  const isFo = roles.includes("Fleet Operations") && !roles.includes("Transport Manager");
  const isTm = roles.includes("Transport Manager") || roles.includes("Platform Admin");
  const isSecurity = roles.includes("Security") && !isTm;
  const isAccounts = roles.includes("Accounts") && !isTm;
  const isEngineering = roles.includes("Engineering") && !isTm;
  const isHr = roles.includes("HR") && !isTm;
  const isPartner = roles.includes("Customer Portals (External)");

  if (isFo || isTm) {
    const queue = input.trips.filter((t) => t.status === "Requested");
    for (const t of queue.slice(0, 8)) {
      push({
        id: `fo-assign-${t.id}`,
        category: "Operations",
        title: `Dispatch assignment needed · ${displayRequestId(t)}`,
        body: `${t.customer || t.customerConsignee || "Partner"} · ${t.dropoff || "Destination TBD"}`,
        time: relativeTime(t.scheduledDate),
        severity: "warning",
      });
    }
  }

  if (isTm) {
    const awaiting = input.trips.filter((t) => t.status === "Awaiting Approval");
    for (const t of awaiting.slice(0, 8)) {
      push({
        id: `tm-approve-${t.id}`,
        category: "Approvals",
        title: `Approval pending · ${displayRequestId(t)}`,
        body: `${t.driverName || "Driver TBD"} · ${t.truckReg || "Truck TBD"} · ${t.dropoff || ""}`.trim(),
        time: relativeTime(t.scheduledDate),
        severity: "warning",
      });
    }
  }

  if (isSecurity || isTm) {
    const moving = input.trips.filter((t) =>
      ["Scheduled", "En Route", "Loaded", "Offloading", "Returning"].includes(t.status),
    );
    for (const t of moving.slice(0, 8)) {
      const needsDeparture = t.status === "Scheduled" || t.status === "En Route";
      push({
        id: `sec-${t.id}`,
        category: "Security",
        title: needsDeparture
          ? `Gate departure check · ${displayRequestId(t)}`
          : `Gate return check · ${displayRequestId(t)}`,
        body: `${t.driverName || "Driver"} · ${t.truckReg || "Plate TBD"} · ${t.status}`,
        time: relativeTime(t.scheduledDate),
        severity: "info",
      });
    }
  }

  if (isAccounts || isTm) {
    for (const e of (input.expenses || []).filter((x) => x.status === "Pending" || x.status === "Clarification").slice(0, 8)) {
      push({
        id: `acc-${e.id}`,
        category: "Approvals",
        title: `Expense ${e.status.toLowerCase()} · ${e.id}`,
        body: `${e.requester || "Requester"} · ${e.type}`,
        time: relativeTime(e.date),
        severity: e.status === "Clarification" ? "warning" : "info",
      });
    }
  }

  if (isEngineering || isTm) {
    for (const w of (input.workOrders || [])
      .filter((x) => x.status === "Diagnosing" || x.status === "Repairing" || x.status === "Awaiting Parts" || x.status === "Reported")
      .slice(0, 8)) {
      push({
        id: `eng-${w.id}`,
        category: "Engineering",
        title: `Work order ${w.status} · ${w.id}`,
        body: `${w.truckReg || "Asset"} · ${w.defect || ""}`.trim(),
        time: relativeTime(w.reportedAt),
        severity: "warning",
      });
    }
  }

  if (isHr || isTm) {
    for (const d of (input.drivers || []).filter((x) => x.compliance !== "Valid").slice(0, 8)) {
      push({
        id: `hr-${d.id}`,
        category: "Compliance",
        title: `Licence ${d.compliance.toLowerCase()} · ${d.name}`,
        body: `Expires ${d.licenseExpiry || "unknown"} · ${d.licenseNumber || ""}`.trim(),
        time: "Compliance watch",
        severity: d.compliance === "Expired" ? "critical" : "warning",
      });
    }
  }

  if (isPartner) {
    for (const t of input.trips.slice(0, 8)) {
      push({
        id: `pt-${t.id}`,
        category: "Operations",
        title: `Request ${displayRequestId(t)} · ${t.status}`,
        body: `${t.cargo || "Cargo"} → ${t.dropoff || "Destination"}`,
        time: relativeTime(t.scheduledDate),
        severity: "info",
      });
    }
  }

  return out;
}

export function mergeRoleNotifications(apiItems: Notification[], roles: string[], synthesized: Notification[]): Notification[] {
  const filtered = filterNotificationsForRoles(apiItems, roles);
  if (filtered.length > 0) return filtered;
  return filterNotificationsForRoles(synthesized, roles);
}
