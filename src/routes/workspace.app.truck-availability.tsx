import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu, type RowMenuItem } from "@/components/fleetopsx/row-action-menu";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { displayHeadCap } from "@/lib/fleetopsx/display-ids";
import {
  ENGINEERING_ACCESS_ROLES,
  TRUCK_RANK,
  indexWorkOrdersByTruck,
  lookupForTruck,
  rolesCanWorkOnTrucks,
  truckLabel,
  truckStatusPillClass,
} from "@/lib/fleetopsx/engineering-helpers";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { authService, engineeringService, fleetService } from "@/lib/fleetopsx/services";
import type { TruckHead, WorkOrder } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/truck-availability")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: TruckAvailability,
});

const TRUCK_FILTERS = ["All", "Check Up", "Maintenance", "Accident", "Available", "Out of Yard"] as const;

function TruckAvailability() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    // beforeLoad cannot see the session on a hard page load (it runs server-side),
    // so the role is re-checked in the browser too.
    const roles = authService.getRoles();
    setCanEdit(rolesCanWorkOnTrucks());
    if (!roles.some((r: any) => ENGINEERING_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
    }
  }, [navigate]);

  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof TRUCK_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ head: TruckHead; status: TruckHead["status"] } | null>(null);
  /** The truck the Transport Manager's read-only row menu opens. */
  const [details, setDetails] = useState<TruckHead | null>(null);

  /**
   * One truck's record for the TM's glimpse: what it is, where it stands, and
   * the last thing the workshop did to it. Engineering gives the verdict; the TM
   * reads it — and can open the row instead of finding a grey "View only" where
   * the 3-dots should be.
   */
  const truckFacts = (head: TruckHead) => {
    const openOrder = orderForTruck(head);
    const last = latestForTruck(head);
    return [
      { label: "Cap number", value: displayHeadCap(head) || head.number || "—" },
      { label: "Plate number", value: head.registration || "—" },
      { label: "Status", value: head.status },
      { label: "Make / body", value: head.make || "—" },
      {
        label: "Open work order",
        value: openOrder ? `${openOrder.defect} · ${openOrder.status}` : "None open",
      },
      { label: "Mechanic", value: openOrder?.mechanic || "Not assigned" },
      {
        label: "Last check-up",
        value: last ? formatDateLines(last.reportedAt).date : "No check-up on record",
      },
      {
        label: "Last job",
        value: last ? `${last.defect} · ${last.status}` : "—",
      },
    ];
  };

  useEffect(() => {
    void Promise.all([
      fleetService.listHeads().catch(() => [] as TruckHead[]),
      engineeringService.listWorkOrders().catch(() => [] as WorkOrder[]),
    ])
      .then(([fleet, wos]) => {
        setHeads(fleet);
        setOrders(wos);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the fleet"))
      .finally(() => setLoading(false));
  }, []);

  const { latest, open } = useMemo(() => indexWorkOrdersByTruck(orders), [orders]);
  const orderForTruck = (head: TruckHead) => lookupForTruck(open, head);
  const latestForTruck = (head: TruckHead) => lookupForTruck(latest, head);

  const counts = useMemo(() => {
    const of = (s: TruckHead["status"]) => heads.filter((h) => h.status === s).length;
    return {
      checkUp: of("Check Up"),
      maintenance: of("Maintenance"),
      accident: of("Accident"),
      available: of("Available"),
      assigned: of("Assigned"),
      outOfYard: of("Out of Yard"),
      blocked: of("Blocked"),
    };
  }, [heads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return heads
      .filter((h) => filter === "All" || h.status === filter)
      .filter((h) => !q || `${truckLabel(h)} ${h.make} ${h.type} ${h.status}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (TRUCK_RANK[a.status] ?? 9) - (TRUCK_RANK[b.status] ?? 9);
        return rank !== 0 ? rank : (displayHeadCap(a) || a.number).localeCompare(displayHeadCap(b) || b.number);
      });
  }, [heads, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + PAGE_SIZE);

  const setTruckStatus = async (head: TruckHead, status: TruckHead["status"], note?: string) => {
    try {
      await fleetService.updateHeadStatus(head.id, status, truckLabel(head));
      setHeads((prev) => prev.map((h) => (h.id === head.id ? { ...h, status } : h)));
      toast.success(`${truckLabel(head)} → ${status}${note ? ` · ${note}` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the truck's status");
    }
  };

  const truckMenu = (head: TruckHead): RowMenuItem[] => {
    const openOrder = orderForTruck(head);
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
          if (openOrder) {
            void engineeringService
              .complete(openOrder.id)
              .then((updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o))))
              .catch(() => {});
          }
          void setTruckStatus(head, "Available", openOrder ? `closed ${openOrder.defect}` : undefined);
        },
      },
      { label: "Under Maintenance", onSelect: () => void setTruckStatus(head, "Maintenance") },
      { label: "Accident — out of order", onSelect: () => void setTruckStatus(head, "Accident") },
      { label: "Back to Check-up", onSelect: () => void setTruckStatus(head, "Check Up") },
      {
        label: "Raise work order…",
        onSelect: () => navigate({ to: "/workspace/app/engineering", search: { truck: truckLabel(head) } }),
      },
    ];
  };

  const exportCSV = () => {
    const headers = "Truck Head,Plate,Status,Open Work Order,Last Check-up,Make / Body\n";
    const csv = filtered
      .map((head) => {
        const openOrder = orderForTruck(head);
        const last = latestForTruck(head);
        return [
          displayHeadCap(head) || head.number,
          head.registration,
          head.status,
          openOrder ? `${openOrder.defect} (${openOrder.status})` : "",
          last ? formatDateLines(last.reportedAt).date : "",
          head.make,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "truck_availability.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  return (
    <>
      <DepartmentTabs department="engineering" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Truck Availability</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              every truck that comes back through the gate is ours to clear
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — Engineering &amp; Maintenance owns the verdict
              </span>
            )}
          </div>
          <div className={cn("flex items-center gap-2", !canEdit && "hidden")}>
            <button
              type="button"
              onClick={exportCSV}
              className="flex h-8 items-center rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Awaiting Check-up", value: counts.checkUp, tone: "text-[#2F6BD8]" },
            { label: "Under Maintenance", value: counts.maintenance, tone: "text-[#B26A00]" },
            { label: "Accident", value: counts.accident, tone: "text-[#ED351D]" },
            { label: "Available", value: counts.available, tone: "text-[#0A8F4D]" },
            { label: "Assigned", value: counts.assigned, tone: "text-[#2F6BD8]" },
            { label: "Out of Yard", value: counts.outOfYard, tone: "text-[#5C6470]" },
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
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[360px]">
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
                placeholder="Search cap number or plate"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={TRUCK_FILTERS}
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(0);
              }}
              allLabel="All Trucks"
              noun="fleet status"
            />
            {counts.checkUp === 0 && (
              <span className="flex items-center gap-2 text-[13px] text-[#5C6470]">
                <Wrench className="size-4 text-[#2F6BD8]" strokeWidth={1.5} />
                No truck is waiting on a check-up verdict right now.
              </span>
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
              {/* The list is ordered by who is waiting on us, and says how much of
                  the fleet it is showing rather than silently truncating. */}
              <p className="border-b border-[#E2E5E9] py-2 text-[12px] text-[#5C6470]">
                {from} - {to} of {filtered.length} truck{filtered.length === 1 ? "" : "s"}
                {filter === "All" ? " · the ones waiting on us first" : ` · ${filter}`}
              </p>

              {slice.map((head) => {
                const openOrder = orderForTruck(head);
                const last = latestForTruck(head);
                const lastLine = last ? formatDateLines(last.reportedAt) : null;
                return (
                  <div
                    key={head.id}
                    className="grid grid-cols-[170px_140px_140px_1fr_160px_150px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5"
                  >
                    <span className="text-[14px] font-medium text-[#344256]">
                      {displayHeadCap(head) || head.number}
                    </span>
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
                      {openOrder ? (
                        <>
                          <span className="capitalize text-[#344256]">{openOrder.defect}</span>
                          <span className="text-[11px]">
                            {openOrder.status} ·{" "}
                            {openOrder.mechanic && openOrder.mechanic !== "Unassigned"
                              ? openOrder.mechanic
                              : "no mechanic yet"}
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
                            {last?.status === "Completed"
                              ? "Passed"
                              : last?.status === "Cancelled"
                                ? "Cancelled"
                                : "Open job"}
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
                        open={menuFor === head.id}
                        onOpenChange={(o) => setMenuFor(o ? head.id : null)}
                        label={`Options for ${truckLabel(head)}`}
                      />
                    ) : (
                      <RowActionMenu
                        items={[{ label: "View truck details", onSelect: () => setDetails(head) }]}
                        open={menuFor === head.id}
                        onOpenChange={(o) => setMenuFor(o ? head.id : null)}
                        label={`Details for ${truckLabel(head)}`}
                        width={200}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title="No truck matches"
              body="Try another cap number or plate, or clear the status filter."
            />
          )}

          {!loading && filtered.length > PAGE_SIZE && (
            <div className="mt-1 flex items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                aria-label="Previous page of trucks"
              >
                <ChevronLeft className="size-[18px] text-[#627084]" />
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                aria-label="Next page of trucks"
              >
                <ChevronRight className="size-[18px] text-[#627084]" />
              </button>
            </div>
          )}
        </div>
      </div>

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
                  const openOrder = orderForTruck(verdict.head);
                  if (verdict.status === "Available" && openOrder) {
                    void engineeringService
                      .complete(openOrder.id)
                      .then((updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o))))
                      .catch(() => {});
                  }
                  void setTruckStatus(
                    verdict.head,
                    verdict.status,
                    openOrder ? `${openOrder.defect} closed` : undefined,
                  );
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

      {/* The TM's glimpse reads the same truck through this, read-only. */}
      <RecordDetailsModal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details ? truckLabel(details) : "Truck"}
        subtitle="Truck availability · read only"
        badge={
          details ? (
            <span
              className={cn(
                "w-fit rounded px-2 py-0.5 text-[12px] font-medium tracking-[0.4px]",
                truckStatusPillClass(details.status),
              )}
            >
              {details.status}
            </span>
          ) : null
        }
        facts={details ? truckFacts(details) : []}
        note="Read-only view — Engineering & Maintenance owns this verdict. Only the workshop can clear a truck back to Available, Maintenance or Accident."
      />
    </>
  );
}
