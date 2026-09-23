import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RaisePartsRequestModal } from "@/components/fleetopsx/raise-parts-request-modal";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu, type RowMenuItem } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import {
  ENGINEERING_ACCESS_ROLES,
  priorityPillClass,
  resolveTruck,
  rolesCanWorkOnTrucks,
  statusPillClass,
  truckLabel,
} from "@/lib/fleetopsx/engineering-helpers";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  authService,
  engineeringService,
  fleetService,
  formatNairaFull,
  inventoryService,
  nextWorkOrderStatus,
} from "@/lib/fleetopsx/services";
import type { InventoryItem, TruckHead, WorkOrder, WorkOrderStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/engineering")({
  validateSearch: (search: Record<string, unknown>): { truck?: string } => ({
    truck: typeof search.truck === "string" && search.truck ? search.truck : undefined,
  }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: EngineeringWorkOrders,
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

function EngineeringWorkOrders() {
  const navigate = useNavigate();
  const { truck: truckParam } = Route.useSearch();
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
  /** The store lines a parts request can be priced against. */
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** The job a parts request is being raised for. */
  const [partsFor, setPartsFor] = useState<WorkOrder | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof WORK_ORDER_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** The job the Transport Manager's read-only row menu opens. */
  const [details, setDetails] = useState<WorkOrder | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  /**
   * The truck as the registry names it, resolved from whatever the job stores
   * (the plate today, a cap label on legacy rows) so the TM's dialog reads
   * `P073 (APP857YL)` rather than a bare registration.
   */
  const truckLabelFor = (order: WorkOrder) => {
    const head = resolveTruck(order, heads);
    return head ? truckLabel(head) : String(order.truckReg ?? "").trim() || "—";
  };
  /** Editing an existing job — keeps its id so the same form can patch it. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = async () => {
    const [wos, fleet, store] = await Promise.all([
      engineeringService.listWorkOrders(),
      fleetService.listHeads().catch(() => [] as TruckHead[]),
      inventoryService.list().catch(() => [] as InventoryItem[]),
    ]);
    setOrders(wos);
    setHeads(fleet);
    setItems(store);
  };

  useEffect(() => {
    void refresh()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the workshop"))
      .finally(() => setLoading(false));
  }, []);

  /** Truck picker for the raise dialog — A→Z like the registry. */
  const truckOptions = useMemo(
    () => [...heads].sort((a, b) => truckLabel(a).localeCompare(truckLabel(b))),
    [heads],
  );

  // A truck handed over from the Availability board ("Raise work order…") opens
  // this dialog already pointed at it, so the two modules read as one department.
  useEffect(() => {
    if (!truckParam || !truckOptions.length) return;
    const head = truckOptions.find((h) => truckLabel(h) === truckParam || h.registration === truckParam);
    if (!head) return;
    setEditingId(null);
    setDraft({ ...emptyDraft(), truckReg: truckLabel(head) });
    void navigate({ to: "/workspace/app/engineering", search: {}, replace: true });
  }, [truckParam, truckOptions, navigate]);

  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== "Completed" && o.status !== "Cancelled"),
    [orders],
  );

  const summary = useMemo(() => {
    const count = (s: WorkOrderStatus) => orders.filter((o) => o.status === s).length;
    const spend = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (Number(o.cost) || 0), 0);
    return {
      open: openOrders.length,
      diagnosing: count("Diagnosing"),
      awaitingParts: count("Awaiting Parts"),
      repairing: count("Repairing"),
      testing: count("Testing"),
      completed: count("Completed"),
      spend,
    };
  }, [orders, openOrders]);

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
    const truck = truckOptions.find((h) => truckLabel(h) === draft.truckReg);
    const truckReg = truck ? truck.registration : (/\(([^)]+)\)/.exec(draft.truckReg)?.[1] ?? draft.truckReg).trim();
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
          await fleetService.updateHeadStatus(truck.id, "Maintenance").catch(() => {});
          setHeads((prev) => prev.map((h) => (h.id === truck.id ? { ...h, status: "Maintenance" } : h)));
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

  /**
   * The workshop's promise for when a truck comes back into service.
   *
   * It is the one date the Transport Manager audits the shop against — a job
   * still open past its own estimate is late by the workshop's own word, not by
   * a deadline someone else invented.
   */
  const setReadyDate = async (order: WorkOrder) => {
    const current = order.estimatedReadyAt ? String(order.estimatedReadyAt).slice(0, 10) : "";
    const answer = window.prompt(
      `When will ${truckLabelFor(order)} be ready to return to service? (YYYY-MM-DD)\nLeave it blank to clear the estimate.`,
      current,
    );
    if (answer === null) return;
    const value = answer.trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toast.error("Use YYYY-MM-DD, eg 2026-09-24.");
      return;
    }
    await patchOrder(
      order,
      { estimatedReadyAt: value ? new Date(`${value}T00:00:00`).toISOString() : null },
      value ? `Promised back on ${value}.` : "Return-to-service estimate cleared.",
    );
  };

  const orderMenu = (order: WorkOrder): RowMenuItem[] => {
    const next = nextWorkOrderStatus(order.status);
    return [
      {
        label: "Assign mechanic…",
        onSelect: () => {
          const head = resolveTruck(order, heads);
          setEditingId(order.id);
          setDraft({
            truckReg: head ? truckLabel(head) : order.truckReg,
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
        onSelect: () =>
          void patchOrder(order, { status: "Completed", completedAt: new Date().toISOString() }, "Job closed."),
      },
      {
        label: "Request parts…",
        onSelect: () => setPartsFor(order),
      },
      {
        label: order.estimatedReadyAt
          ? "Change return-to-service date…"
          : "Set return-to-service date…",
        onSelect: () => void setReadyDate(order),
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
          void patchOrder(
            order,
            { status: "Cancelled", notes: reason, completedAt: new Date().toISOString() },
            "Job cancelled.",
          );
        },
      },
    ];
  };

  return (
    <>
      <DepartmentTabs department="engineering" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Work Orders</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              every job the workshop has been given, and what it cost
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

        {/* Counted from the records themselves — no tile is a guess. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            { label: "Open Work Orders", value: summary.open, tone: "text-[#1B2432]" },
            { label: "Diagnosing", value: summary.diagnosing, tone: "text-[#2F6BD8]" },
            { label: "Awaiting Parts", value: summary.awaitingParts, tone: "text-[#B26A00]" },
            { label: "In Repair", value: summary.repairing, tone: "text-[#ED351D]" },
            { label: "Testing", value: summary.testing, tone: "text-[#1B2432]" },
            { label: "Completed", value: summary.completed, tone: "text-[#0A8F4D]" },
            { label: "Repair Spend", value: formatNairaFull(summary.spend), tone: "text-[#1B2432]" },
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

        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
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
                      /*
                       * The TM oversees the workshop without working it: his menu
                       * opens the job and nothing else. Before this he got a grey
                       * "View only" in place of the 3-dots and could not read the
                       * one record he might need to question.
                       */
                      <RowActionMenu
                        items={[{ label: "View work order", onSelect: () => setDetails(order) }]}
                        open={menuFor === order.id}
                        onOpenChange={(open) => setMenuFor(open ? order.id : null)}
                        label={`Details for ${order.defect}`}
                        width={190}
                      />
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
                  : "Raise one from the button above, or from a truck on the Truck Availability board."
              }
            />
          )}

          {!loading && filteredOrders.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                of {filteredOrders.length}
              </span>
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
                {/* A legacy job may name a truck no longer on the roster — keep the
                    value selectable so saving cannot silently retarget it. */}
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

      {/* The TM's glimpse reads the same job through this, read-only. */}
      <RecordDetailsModal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details ? truckLabelFor(details) : "Work order"}
        subtitle="Work order · read only"
        badge={
          details ? (
            <>
              <span
                className={cn(
                  "inline-flex h-[22px] items-center rounded px-2.5 text-[10px] font-medium",
                  statusPillClass(details.status),
                )}
              >
                {details.status}
              </span>
              <span
                className={cn(
                  "inline-flex h-[22px] items-center rounded px-2.5 text-[10px] font-medium",
                  priorityPillClass(details.priority),
                )}
              >
                {details.priority}
              </span>
            </>
          ) : null
        }
        facts={
          details
            ? [
                { label: "Truck", value: truckLabelFor(details) },
                { label: "Fault reported", value: details.defect || "—" },
                { label: "Category", value: details.category || "—" },
                { label: "Mechanic", value: details.mechanic || "Not assigned yet" },
                { label: "Repair cost", value: formatNairaFull(Number(details.cost) || 0) },
                {
                  label: "Reported",
                  value: details.reportedAt ? formatDateLines(details.reportedAt).date : "—",
                },
                {
                  label: "Work started",
                  value: details.startedAt ? formatDateLines(details.startedAt).date : "Not started",
                },
                {
                  label: "Completed",
                  value: details.completedAt ? formatDateLines(details.completedAt).date : "Still open",
                },
                {
                  label: "Return to service",
                  value: details.estimatedReadyAt
                    ? `${formatDateLines(details.estimatedReadyAt).date}${
                        details.status === "Completed" || details.status === "Cancelled"
                          ? " (closed)"
                          : new Date(details.estimatedReadyAt).getTime() < Date.now()
                            ? " — past its own date"
                            : ""
                      }`
                    : "No date promised",
                },
                { label: "Reported by", value: details.reportedBy || "—" },
                { label: "Notes", value: details.notes || "—" },
              ]
            : []
        }
        note="Read-only view — Engineering & Maintenance works this board. Only the workshop can change a stage, a mechanic or a cost."
      />

      {/* The first half of the parts loop the TM approves on his dashboard. */}
      <RaisePartsRequestModal
        open={partsFor !== null}
        onClose={() => setPartsFor(null)}
        jobs={openOrders}
        heads={heads}
        items={items}
        initialJob={partsFor}
        onCreated={() => {
          void refresh().catch(() => {});
        }}
      />
    </>
  );
}
