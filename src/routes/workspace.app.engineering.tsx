import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Plus, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RowActionMenu, type RowMenuItem } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  authService,
  engineeringService,
  fleetService,
  formatNairaFull,
  nextWorkOrderStatus,
} from "@/lib/fleetopsx/services";
import type { TruckHead, WorkOrder, WorkOrderStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/engineering")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Engineering", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: EngineeringWorkshop,
});

const WORK_ORDER_FILTERS = [
  "All",
  "Reported",
  "Diagnosing",
  "Awaiting Parts",
  "Repairing",
  "Testing",
  "Completed",
  "Cancelled",
] as const;

const TRUCK_FILTERS = [
  "All",
  "Check Up",
  "Maintenance",
  "Accident",
  "Available",
  "Out of Yard",
] as const;

const CATEGORIES = [
  "Engine",
  "Gearbox",
  "Brakes",
  "Tyres",
  "Electrical",
  "Body / Panel",
  "Suspension",
  "Routine Check-up",
  "General",
] as const;

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

/**
 * Who works this board.
 *
 * Engineering & Maintenance owns the workshop; the Transport Manager reads the
 * same work orders, costs and truck verdicts as oversight — a glimpse of the
 * department, not its desk.
 */
const ENGINEERING_OWNER_ROLES = [
  "Engineering",
  "Engineering & Maintenance",
  "Engineering and Maintenance",
  "Platform Admin",
];

/** Who may even open the board: the department itself plus its supervisor. */
const ENGINEERING_ACCESS_ROLES = [...ENGINEERING_OWNER_ROLES, "Transport Manager"];

function rolesCanWorkOnTrucks() {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => ENGINEERING_OWNER_ROLES.includes(r));
}

/** Status → its pill, in the portal's own tones. */
function statusPillClass(status: WorkOrderStatus) {
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

function priorityPillClass(priority: WorkOrder["priority"]) {
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

function truckStatusPillClass(status: TruckHead["status"]) {
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
function truckLabel(head: TruckHead) {
  const cap = displayHeadCap(head) || head.number;
  return head.registration ? `${cap} (${head.registration})` : cap;
}

/**
 * Which truck a work order is for.
 *
 * Jobs raised from this page store the PLATE (so the Transport Manager's fleet
 * audit can match them), but legacy rows carry a cap label — `P073 (APP857YL)`
 * or just `P073` — so every shape is resolved back to a registry row.
 */
function workOrderKeys(order: WorkOrder) {
  const raw = String(order.truckReg ?? "").trim();
  const inParens = /\(([^)]+)\)/.exec(raw)?.[1];
  const cap = raw.split(/[\s(]/)[0] ?? "";
  return {
    plate: (inParens ?? raw).trim().toLowerCase(),
    head: cap.trim().toLowerCase(),
  };
}

function headKeys(head: TruckHead) {
  return {
    plate: String(head.registration ?? "").trim().toLowerCase(),
    head: [head.capNumber, head.number].filter(Boolean).map((v) => String(v).trim().toLowerCase()),
  };
}

function resolveTruck(order: WorkOrder, heads: TruckHead[]): TruckHead | undefined {
  const keys = workOrderKeys(order);
  return heads.find((h) => {
    const hk = headKeys(h);
    if (keys.plate && hk.plate && keys.plate === hk.plate) return true;
    return keys.head && hk.head.includes(keys.head);
  });
}

/** One label + control + hint — the same field shape the Staff Records dialog uses. */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
        {label}
        {required ? <span className="text-[#ED351D]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-[#5C6470]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded border border-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none";
const selectClass = `${inputClass} bg-white`;

type OrderDraft = {
  truckReg: string;
  defect: string;
  category: string;
  priority: WorkOrder["priority"];
  mechanic: string;
  cost: string;
  notes: string;
  /** Raise the job and take the truck out of service in one action. */
  sendToMaintenance: boolean;
};

const emptyDraft = (): OrderDraft => ({
  truckReg: "",
  defect: "",
  category: "General",
  priority: "Medium",
  mechanic: "",
  cost: "",
  notes: "",
  sendToMaintenance: true,
});

function EngineeringWorkshop() {
  const navigate = useNavigate();
  // Read after mount: the session lives in localStorage, so a server-rendered
  // guess at the role would hydrate mismatched.
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    // The route gate cannot see the session on a hard page load (beforeLoad runs
    // server-side, where localStorage does not exist), so the role is re-checked
    // in the browser — the same belt-and-braces the admin forms use.
    const roles = authService.getRoles();
    setCanEdit(rolesCanWorkOnTrucks());
    if (!roles.some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof WORK_ORDER_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);

  const [truckQuery, setTruckQuery] = useState("");
  const [truckFilter, setTruckFilter] = useState<(typeof TRUCK_FILTERS)[number]>("All");
  const [truckPage, setTruckPage] = useState(0);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [truckMenuFor, setTruckMenuFor] = useState<string | null>(null);

  const [draft, setDraft] = useState<OrderDraft | null>(null);
  /** Editing an existing job — keeps its id so the same form can patch it. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ head: TruckHead; status: TruckHead["status"] } | null>(null);

  const refresh = async () => {
    const [wos, fleet] = await Promise.all([
      engineeringService.listWorkOrders(),
      fleetService.listHeads().catch(() => [] as TruckHead[]),
    ]);
    setOrders(wos);
    setHeads(fleet);
  };

  useEffect(() => {
    void refresh()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the workshop"))
      .finally(() => setLoading(false));
  }, []);

  /** Highest number-free cap list for the truck picker, A→Z like the registry. */
  const truckOptions = useMemo(
    () => [...heads].sort((a, b) => truckLabel(a).localeCompare(truckLabel(b))),
    [heads],
  );

  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== "Completed" && o.status !== "Cancelled"),
    [orders],
  );

  /** Latest job per truck — the check-up record on a truck's row. */
  const latestByTruck = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const order of orders) {
      const keys = workOrderKeys(order);
      const key = keys.plate || keys.head;
      if (!key) continue;
      const current = map.get(key);
      const at = new Date(order.reportedAt || 0).getTime();
      if (!current || at > new Date(current.reportedAt || 0).getTime()) map.set(key, order);
    }
    return map;
  }, [orders]);

  const openByTruck = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const order of openOrders) {
      const keys = workOrderKeys(order);
      const key = keys.plate || keys.head;
      if (key && !map.has(key)) map.set(key, order);
    }
    return map;
  }, [openOrders]);

  const orderForTruck = (head: TruckHead) => {
    const hk = headKeys(head);
    return openByTruck.get(hk.plate) ?? hk.head.map((k) => openByTruck.get(k)).find(Boolean);
  };

  const latestForTruck = (head: TruckHead) => {
    const hk = headKeys(head);
    return latestByTruck.get(hk.plate) ?? hk.head.map((k) => latestByTruck.get(k)).find(Boolean);
  };

  const summary = useMemo(() => {
    const count = (s: WorkOrderStatus) => orders.filter((o) => o.status === s).length;
    const spend = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (Number(o.cost) || 0), 0);
    const trucks = (s: TruckHead["status"]) => heads.filter((h) => h.status === s).length;
    return {
      open: openOrders.length,
      diagnosing: count("Diagnosing"),
      awaitingParts: count("Awaiting Parts"),
      repairing: count("Repairing"),
      testing: count("Testing"),
      completed: count("Completed"),
      spend,
      checkUp: trucks("Check Up"),
      maintenance: trucks("Maintenance"),
      accident: trucks("Accident"),
    };
  }, [orders, heads, openOrders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => statusFilter === "All" || o.status === statusFilter)
      .filter((o) => {
        if (!q) return true;
        const head = resolveTruck(o, heads);
        const hay = [
          o.truckReg,
          o.defect,
          o.category,
          o.mechanic,
          o.reportedBy,
          o.notes,
          head ? truckLabel(head) : "",
          head ? head.make : "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      // Newest first, always — the job raised a minute ago is the one being worked.
      .sort((a, b) => new Date(b.reportedAt || 0).getTime() - new Date(a.reportedAt || 0).getTime());
  }, [orders, statusFilter, query, heads]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filteredOrders.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filteredOrders.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filteredOrders.length, currentPage * PAGE_SIZE + PAGE_SIZE);

  /**
   * The trucks that need Engineering come first, in the order the yard asks:
   * a truck that just came back through the gate is waiting on us, a truck that
   * is out on a job is not. Within a status the cap number orders the list.
   */
  const TRUCK_RANK: Record<string, number> = {
    "Check Up": 0,
    Maintenance: 1,
    Accident: 2,
    Available: 3,
    Assigned: 4,
    "Out of Yard": 5,
    Blocked: 6,
  };

  const filteredTrucks = useMemo(() => {
    const q = truckQuery.trim().toLowerCase();
    return truckOptions
      .filter((h) => truckFilter === "All" || h.status === truckFilter)
      .filter((h) => {
        if (!q) return true;
        return `${truckLabel(h)} ${h.make} ${h.type} ${h.status}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const rank = (TRUCK_RANK[a.status] ?? 9) - (TRUCK_RANK[b.status] ?? 9);
        return rank !== 0 ? rank : (displayHeadCap(a) || a.number).localeCompare(displayHeadCap(b) || b.number);
      });
  }, [truckOptions, truckFilter, truckQuery]);

  /**
   * The fleet runs to 115 heads; paging keeps the workshop board readable
   * instead of burying the work orders under a hundred "no check-up" rows.
   */
  const truckPageCount = Math.max(1, Math.ceil(filteredTrucks.length / PAGE_SIZE));
  const currentTruckPage = Math.min(truckPage, truckPageCount - 1);
  const truckSlice = filteredTrucks.slice(
    currentTruckPage * PAGE_SIZE,
    currentTruckPage * PAGE_SIZE + PAGE_SIZE,
  );
  const truckFrom = filteredTrucks.length === 0 ? 0 : currentTruckPage * PAGE_SIZE + 1;
  const truckTo = Math.min(filteredTrucks.length, currentTruckPage * PAGE_SIZE + PAGE_SIZE);

  const patchOrder = async (order: WorkOrder, updates: Record<string, unknown>, message: string) => {
    try {
      const updated = await engineeringService.updateWorkOrder(order.id, updates);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const plate = /\(([^)]+)\)/.exec(draft.truckReg)?.[1] ?? draft.truckReg;
    const truck = truckOptions.find((h) => truckLabel(h) === draft.truckReg);
    const truckReg = truck ? truck.registration : plate.trim();
    if (!truckReg || !draft.defect.trim()) {
      toast.error("Truck and defect are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await engineeringService.updateWorkOrder(editingId, {
          truckReg,
          defect: draft.defect.trim(),
          category: draft.category,
          priority: draft.priority,
          mechanic: draft.mechanic.trim(),
          cost: Number(draft.cost) || 0,
          notes: draft.notes.trim(),
        });
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        toast.success("Work order updated.");
      } else {
        const created = await engineeringService.createWorkOrder({
          truckReg,
          defect: draft.defect.trim(),
          category: draft.category,
          priority: draft.priority,
          mechanic: draft.mechanic.trim(),
          reportedBy: authService.getCurrentUser()?.name || "Engineering",
          cost: Number(draft.cost) || 0,
          notes: draft.notes.trim(),
        });
        setOrders((prev) => [created, ...prev]);
        if (draft.sendToMaintenance && truck && truck.status !== "Maintenance") {
          await setTruckStatus(truck, "Maintenance", `WO raised — ${created.defect}`);
        }
        toast.success(`Work order raised for ${truckReg}.`);
      }
      setDraft(null);
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the work order");
    } finally {
      setSaving(false);
    }
  };

  const setTruckStatus = async (head: TruckHead, status: TruckHead["status"], note?: string) => {
    try {
      await fleetService.updateHeadStatus(head.id, status);
      setHeads((prev) => prev.map((h) => (h.id === head.id ? { ...h, status } : h)));
      toast.success(`${truckLabel(head)} → ${status}${note ? ` · ${note}` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the truck's status");
    }
  };

  const exportCSV = () => {
    const headers =
      "Date Reported,Truck Head,Customer Defect,Category,Priority,Mechanic,Reported By,Cost (₦),Status,Started,Completed,Notes\n";
    const csv = filteredOrders
      .map((o) => {
        const head = resolveTruck(o, heads);
        const lines = formatDateLines(o.reportedAt);
        return [
          `${lines.date} ${lines.time}`,
          head ? truckLabel(head) : o.truckReg,
          o.defect,
          o.category,
          o.priority,
          o.mechanic || "Unassigned",
          o.reportedBy,
          Number(o.cost) || 0,
          o.status,
          o.startedAt ? formatDateLines(o.startedAt).date : "",
          o.completedAt ? formatDateLines(o.completedAt).date : "",
          o.notes,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "engineering_work_orders.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const orderMenu = (order: WorkOrder): RowMenuItem[] => {
    const next = nextWorkOrderStatus(order.status);
    return [
      {
        label: "Assign mechanic…",
        onSelect: () => {
          setEditingId(order.id);
          setDraft({
            truckReg: resolveTruck(order, heads) ? truckLabel(resolveTruck(order, heads)!) : order.truckReg,
            defect: order.defect,
            category: order.category,
            priority: order.priority,
            mechanic: order.mechanic === "Unassigned" ? "" : order.mechanic,
            cost: order.cost ? String(order.cost) : "",
            notes: order.notes,
            sendToMaintenance: false,
          });
        },
      },
      {
        label: next ? `Advance to ${next}` : "Job already closed",
        disabled: !next,
        onSelect: () => {
          void engineeringService
            .advance(order)
            .then((updated) => {
              if (updated) setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
              toast.success(next ? `Moved to ${next}.` : "Job is closed.");
            })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not advance the job"));
        },
      },
      {
        label: "Mark completed",
        hidden: order.status === "Completed",
        onSelect: () => void patchOrder(order, { status: "Completed", completedAt: new Date().toISOString() }, "Job closed."),
      },
      {
        label: "Reopen job",
        hidden: order.status !== "Completed" && order.status !== "Cancelled",
        onSelect: () => void patchOrder(order, { status: "Reported", completedAt: null }, "Job reopened at Reported."),
      },
      {
        label: "Cancel job",
        danger: true,
        hidden: order.status === "Cancelled" || order.status === "Completed",
        onSelect: () => {
          const reason = window.prompt("Why is this job being cancelled? (goes on the record)") ?? "";
          void patchOrder(order, { status: "Cancelled", notes: reason, completedAt: new Date().toISOString() }, "Job cancelled.");
        },
      },
    ];
  };

  const truckMenu = (head: TruckHead): RowMenuItem[] => {
    const open = orderForTruck(head);
    return [
      {
        // The formal verdict — the only path that also closes the open job and
        // stamps the truck's check-up date, so it leads the menu when a truck is
        // sitting on "Check Up".
        label: "Give check-up verdict…",
        hidden: head.status !== "Check Up",
        onSelect: () => setVerdict({ head, status: "Available" }),
      },
      {
        label: "Available — passed check-up",
        onSelect: () => {
          if (open) {
            void engineeringService
              .complete(open.id)
              .then((updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o))))
              .catch(() => {});
          }
          void setTruckStatus(head, "Available", open ? `closed ${open.defect}` : undefined);
        },
      },
      { label: "Under Maintenance", onSelect: () => void setTruckStatus(head, "Maintenance") },
      { label: "Accident — out of order", onSelect: () => void setTruckStatus(head, "Accident") },
      { label: "Back to Check-up", onSelect: () => void setTruckStatus(head, "Check Up") },
      {
        label: "Raise work order…",
        onSelect: () => {
          setEditingId(null);
          setVerdict(null);
          setDraft({
            ...emptyDraft(),
            truckReg: truckLabel(head),
            category: head.status === "Accident" ? "Body / Panel" : "Routine Check-up",
            priority: head.status === "Accident" ? "High" : "Medium",
            sendToMaintenance: head.status !== "Maintenance",
          });
        },
      },
    ];
  };

  return (
    <>
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Engineering &amp; Maintenance</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              workshop work orders, truck check-up verdicts and repair spend
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — Engineering &amp; Maintenance works this board
              </span>
            )}
          </div>
          <div className={cn("flex items-center gap-2", !canEdit && "hidden")}>
            <button
              type="button"
              onClick={exportCSV}
              className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              <Download className="size-[18px]" strokeWidth={1.75} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft());
              }}
              className="flex h-8 items-center gap-1.5 rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]"
            >
              <Plus className="size-4" />
              Raise Work Order
            </button>
          </div>
        </div>

        {/* Counted from the records themselves — no tile is a guess, and the
            trucks a verdict is still owed on lead the strip. An even grid, not
            flex-wrap: ten tiles wrapped 9+1 left the last one stretched across
            the whole page on a 1600 screen. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            { label: "Open Work Orders", value: summary.open, tone: "text-[#1B2432]" },
            { label: "Diagnosing", value: summary.diagnosing, tone: "text-[#2F6BD8]" },
            { label: "Awaiting Parts", value: summary.awaitingParts, tone: "text-[#B26A00]" },
            { label: "In Repair", value: summary.repairing, tone: "text-[#ED351D]" },
            { label: "Testing", value: summary.testing, tone: "text-[#1B2432]" },
            { label: "Completed", value: summary.completed, tone: "text-[#0A8F4D]" },
            { label: "Repair Spend", value: formatNairaFull(summary.spend), tone: "text-[#1B2432]" },
            { label: "Awaiting Check-up", value: summary.checkUp, tone: "text-[#2F6BD8]" },
            { label: "Under Maintenance", value: summary.maintenance, tone: "text-[#B26A00]" },
            { label: "Accident", value: summary.accident, tone: "text-[#ED351D]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                {stat.label}
              </span>
              <span className={cn("text-[20px] font-semibold leading-7", stat.tone)}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* ---- Work orders ---- */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search truck, defect, mechanic…"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={WORK_ORDER_FILTERS}
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
                setPage(0);
              }}
              allLabel="All Statuses"
            />
            <span className="ml-auto text-[13px] text-[#5C6470]">
              {openOrders.length} open job{openOrders.length === 1 ? "" : "s"} on the floor
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[120px_170px_1fr_130px_100px_150px_130px_110px_120px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {[
                  "Date",
                  "Truck Head",
                  "Defect",
                  "Category",
                  "Priority",
                  "Mechanic",
                  "Reported By",
                  "Cost",
                  "Status",
                ].map((h) => (
                  <span key={h} className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
                    {h}
                  </span>
                ))}
              </div>

              {slice.map((order) => {
                const head = resolveTruck(order, heads);
                const lines = formatDateLines(order.reportedAt);
                return (
                  <div
                    key={order.id}
                    className="grid grid-cols-[120px_170px_1fr_130px_100px_150px_130px_110px_120px_44px] items-center gap-4 border-b border-[#E2E5E9] py-3"
                  >
                    {/* Date first, ID last — the reading order the desks asked for. */}
                    <span className="flex flex-col gap-0.5 text-[13px] leading-tight text-[#5C6470]">
                      <span>{lines.date}</span>
                      {lines.time ? <span className="text-[11px]">{lines.time}</span> : null}
                    </span>
                    <span className="flex flex-col gap-0.5 text-[14px] text-[#344256]">
                      <span>{head ? displayHeadCap(head) || head.number : order.truckReg}</span>
                      <span className="text-[11px] text-[#5C6470]">{head?.registration || "—"}</span>
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[14px] capitalize text-[#344256]">{order.defect}</span>
                      {order.notes ? <span className="text-[11px] text-[#5C6470]">{order.notes}</span> : null}
                    </span>
                    <span className="text-[14px] text-[#5C6470]">{order.category}</span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-fit items-center rounded px-2 text-[10px] font-medium",
                        priorityPillClass(order.priority),
                      )}
                    >
                      {order.priority}
                    </span>
                    <span className="text-[14px] text-[#5C6470]">
                      {order.mechanic && order.mechanic !== "Unassigned" ? order.mechanic : "Unassigned"}
                    </span>
                    <span className="text-[14px] text-[#5C6470]">{order.reportedBy}</span>
                    <span className="text-[14px] text-[#344256]">
                      {order.cost ? formatNairaFull(order.cost) : "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                        statusPillClass(order.status),
                      )}
                    >
                      {order.status}
                    </span>
                    {canEdit ? (
                      <RowActionMenu
                        items={orderMenu(order)}
                        open={menuFor === order.id}
                        onOpenChange={(open) => setMenuFor(open ? order.id : null)}
                        label={`Options for ${order.defect}`}
                      />
                    ) : (
                      <span className="text-[11px] text-[#98A0AC]">View only</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {loading && <FigmaLoadingState />}
          {!loading && filteredOrders.length === 0 && (
            <FigmaEmptyState
              title={query || statusFilter !== "All" ? "No matching work orders" : "No work orders yet"}
              body={
                query || statusFilter !== "All"
                  ? "Try another truck, defect or mechanic, or clear the status filter."
                  : "Raise one from the button above, or take a truck out of service below."
              }
            />
          )}

          {!loading && filteredOrders.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {filteredOrders.length}</span>
              <div className="ml-2 flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---- Truck availability: the verdict Engineering owes the yard ---- */}
        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-col gap-4 border-b border-[#E2E5E9] pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-[5px]">
                <h3 className="text-[18px] font-semibold leading-6 text-[#1B2432]">Truck Availability</h3>
                <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                  every truck that comes back through the gate is ours to clear
                </p>
              </div>
              <div className="relative ml-auto w-full max-w-[360px]">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
                <input
                  value={truckQuery}
                  onChange={(e) => {
                    setTruckQuery(e.target.value);
                    setTruckPage(0);
                  }}
                  placeholder="Search cap number or plate"
                  className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
                />
              </div>
              <FilterButton
                options={TRUCK_FILTERS}
                value={truckFilter}
                onChange={(f) => {
                  setTruckFilter(f);
                  setTruckPage(0);
                }}
                allLabel="All Trucks"
                noun="fleet status"
              />
            </div>
            {summary.checkUp === 0 && (
              <p className="flex items-center gap-2 text-[13px] text-[#5C6470]">
                <Wrench className="size-4 text-[#2F6BD8]" strokeWidth={1.5} />
                No truck is waiting on a check-up verdict right now.
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-[170px_140px_140px_1fr_160px_150px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {["Truck Head", "Plate", "Status", "Open Work Order", "Last Check-up", "Make / Body"].map((h) => (
                  <span key={h} className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
                    {h}
                  </span>
                ))}
              </div>
              {/* The list is ordered by who is waiting on us, and says how much
                  of the fleet it is showing rather than silently truncating. */}
              <p className="border-b border-[#E2E5E9] py-2 text-[12px] text-[#5C6470]">
                {truckFrom} - {truckTo} of {filteredTrucks.length} truck{filteredTrucks.length === 1 ? "" : "s"}
                {truckFilter === "All" ? " · the ones waiting on us first" : ` · ${truckFilter}`}
              </p>                {truckSlice.map((head) => {
                const open = orderForTruck(head);
                const last = latestForTruck(head);
                const lastLine = last ? formatDateLines(last.reportedAt) : null;
                return (
                  <div
                    key={head.id}
                    className="grid grid-cols-[170px_140px_140px_1fr_160px_150px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5"
                  >
                    <span className="text-[14px] font-medium text-[#344256]">{displayHeadCap(head) || head.number}</span>
                    <span className="text-[14px] text-[#5C6470]">{head.registration || "—"}</span>
                    <span
                      className={cn(
                        "inline-flex h-[22px] w-fit items-center rounded px-2.5 text-[10px] font-medium",
                        truckStatusPillClass(head.status),
                      )}
                    >
                      {head.status}
                    </span>
                    <span className="flex flex-col gap-0.5 text-[13px] text-[#5C6470]">
                      {open ? (
                        <>
                          <span className="capitalize text-[#344256]">{open.defect}</span>
                          <span className="text-[11px]">
                            {open.status} · {open.mechanic && open.mechanic !== "Unassigned" ? open.mechanic : "no mechanic yet"}
                          </span>
                        </>
                      ) : (
                        <span>—</span>
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5 text-[13px] text-[#5C6470]">
                      {lastLine ? (
                        <>
                          <span>{lastLine.date}</span>
                          <span className="text-[11px]">
                            {last?.status === "Completed" ? "Passed" : last?.status === "Cancelled" ? "Cancelled" : "Open job"}
                          </span>
                        </>
                      ) : (
                        <span>No check-up on record</span>
                      )}
                    </span>
                    <span className="text-[13px] text-[#5C6470]">{head.make}</span>
                    {canEdit ? (
                      <RowActionMenu
                        items={truckMenu(head)}
                        open={truckMenuFor === head.id}
                        onOpenChange={(open2) => setTruckMenuFor(open2 ? head.id : null)}
                        label={`Options for ${truckLabel(head)}`}
                      />
                    ) : (
                      <span className="text-[11px] text-[#98A0AC]">View only</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!loading && filteredTrucks.length === 0 && (
            <FigmaEmptyState
              title="No truck matches"
              body="Try another cap number or plate, or clear the status filter."
            />
          )}

          {!loading && filteredTrucks.length > PAGE_SIZE && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentTruckPage === 0}
                  onClick={() => setTruckPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page of trucks"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentTruckPage >= truckPageCount - 1}
                  onClick={() => setTruckPage((p) => Math.min(truckPageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page of trucks"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Raise / edit a work order ---- */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                {editingId ? "Edit Work Order" : "Raise Work Order"}
              </h3>
            </div>
            <Field label="Truck Head" required hint="Cap number with its plate — the truck the job is for.">
              <select
                value={draft.truckReg}
                onChange={(e) => setDraft({ ...draft, truckReg: e.target.value })}
                className={selectClass}
              >
                <option value="">Select a truck</option>
                {truckOptions.map((h) => (
                  <option key={h.id} value={truckLabel(h)}>
                    {truckLabel(h)} · {h.status}
                  </option>
                ))}
                {/* A legacy job may name a truck that is no longer on the roster —
                    keep the value selectable so saving cannot silently retarget it. */}
                {draft.truckReg && !truckOptions.some((h) => truckLabel(h) === draft.truckReg) && (
                  <option value={draft.truckReg}>{draft.truckReg} · not in the registry</option>
                )}
              </select>
            </Field>
            <Field label="Defect / Job" required hint="What is wrong, in the words the workshop will read.">
              <input
                value={draft.defect}
                onChange={(e) => setDraft({ ...draft, defect: e.target.value })}
                placeholder="example: Brake pads worn, front axle"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className={selectClass}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkOrder["priority"] })}
                  className={selectClass}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mechanic" hint="Free text — the workshop's own people.">
                <input
                  value={draft.mechanic}
                  onChange={(e) => setDraft({ ...draft, mechanic: e.target.value })}
                  placeholder="example: Musa Adamu"
                  className={inputClass}
                />
              </Field>
              <Field label="Cost (₦)" hint="Parts and labour, as invoiced.">
                <input
                  type="number"
                  min={0}
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                  placeholder="0"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
                className="w-full rounded border border-[#1B2432] px-3 py-2 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none"
              />
            </Field>
            {!editingId && (
              <label className="flex items-center gap-2 text-[13px] text-[#5C6470]">
                <input
                  type="checkbox"
                  checked={draft.sendToMaintenance}
                  onChange={(e) => setDraft({ ...draft, sendToMaintenance: e.target.checked })}
                  className="size-4"
                />
                Take this truck out of service (status → Under Maintenance) when the job is raised
              </label>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
                className="h-9 rounded border border-[#E2E5E9] px-4 text-[14px] font-medium text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDraft()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[14px] font-medium text-white hover:bg-[#d62e19] disabled:opacity-60"
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Raise work order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Check-up verdict on a truck ---- */}
      {verdict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[460px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                {truckLabel(verdict.head)}
              </h3>
              <p className="mt-1 text-[12px] text-[#5C6470]">
                Currently {verdict.head.status}. The verdict decides whether dispatch can use this truck.
              </p>
            </div>
            {(["Available", "Maintenance", "Accident"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-[14px] text-[#344256]">
                <input
                  type="radio"
                  name="verdict"
                  checked={verdict.status === option}
                  onChange={() => setVerdict({ ...verdict, status: option })}
                  className="size-4"
                />
                {option === "Available"
                  ? "Available — passed check-up, dispatch may use it"
                  : option === "Maintenance"
                    ? "Under Maintenance — goes to the workshop"
                    : "Accident — out of order"}
              </label>
            ))}
            <div className="flex items-center justify-end gap-2 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={() => setVerdict(null)}
                className="h-9 rounded border border-[#E2E5E9] px-4 text-[14px] font-medium text-[#1B2432]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const open = orderForTruck(verdict.head);
                  if (verdict.status === "Available" && open) {
                    void engineeringService
                      .complete(open.id)
                      .then((updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o))))
                      .catch(() => {});
                  }
                  void setTruckStatus(verdict.head, verdict.status, open ? `${open.defect} closed` : undefined);
                  setVerdict(null);
                }}
                className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium text-white"
              >
                Save verdict
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
