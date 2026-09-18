import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { displayRequestedTruckType } from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { countBuckets } from "@/lib/fleetopsx/status-buckets";
import { authService, tripService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/dashboard")({
  component: PartnerPortalDashboard,
});

type PartnerUiStatus = "Pending" | "Seen" | "Approved" | "Declined" | "In transit" | "Completed";

function toPartnerStatus(status: TripStatus): PartnerUiStatus {
  switch (status) {
    case "Requested":
    case "Draft":
      return "Pending";
    case "Awaiting Approval":
    case "Approved":
    case "Approved for Dispatch":
      // TM's FIRST approval = acknowledged only. "Approved" comes after the
      // second (final) approval, when the trip is Scheduled and on the road.
      return "Seen";
    case "Scheduled":
      return "Approved";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
    case "En Route":
    case "Loaded":
    case "Offloading":
    case "Returning":
    case "Delayed":
      return "In transit";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function partnerStatusClass(status: PartnerUiStatus) {
  switch (status) {
    case "Pending":
      return "bg-[#FC0] text-white";
    case "Seen":
      return "bg-[#F99E1F] text-white";
    case "Approved":
      return "bg-[#34C759] text-white";
    case "Declined":
      return "bg-[#ED351D] text-white";
    case "In transit":
      return "bg-[#CB30E0] text-white";
    case "Completed":
      return "bg-[#007AFF] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatTripDate(value: string | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * A partner can withdraw only a request nobody has acted on yet — mirrors the
 * server rule, so the Delete action disappears once the TM has handled it.
 */
function isWithdrawable(status: TripStatus | string): boolean {
  return status === "Requested" || status === "Awaiting Approval";
}

function isPartnerTrip(trip: Trip, companyName: string | undefined) {
  // Live API: `customer` = partner company; `customerConsignee` = form consignee.
  // The server already scopes GET /trips to this partner's company, so any trip
  // returned IS theirs — never hide rows just because the local profile is stale
  // (that was blanking the whole dashboard for existing sessions).
  if (trip.customer === "Customer Portal") return true;
  if (!companyName) return true;
  const a = companyName.trim().toLowerCase();
  const b = (trip.customer || "").trim().toLowerCase();
  return Boolean(!b || a === b || b.includes(a) || a.includes(b));
}

function PartnerPortalDashboard() {
  const navigate = useNavigate();
  const currentUser = authService.getCurrentUser();
  const [requests, setRequests] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<"id" | "date" | "consignee" | "product" | "truck" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"Ascending" | "Descending">("Descending");
  const [draftSortKey, setDraftSortKey] = useState<"id" | "date" | "consignee" | "product" | "truck" | "status">("date");
  const [draftSortOrder, setDraftSortOrder] = useState<"Ascending" | "Descending">("Descending");
  const [filtersApplied, setFiltersApplied] = useState(false);

  const refresh = async () => {
    const allTrips = await tripService.list();
    setRequests(allTrips.filter((t) => isPartnerTrip(t, currentUser?.partnerCompanyName)));
  };

  useEffect(() => {
    void refresh()
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  // Near real-time: approval / assignment / tracking progress appears on the
  // partner dashboard within seconds (10s poll + focus / tab-visible refresh).
  useAutoRefresh(() => {
    void refresh().catch(() => {});
  });

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.customerConsignee && r.customerConsignee.toLowerCase().includes(q)) ||
          displayRequestId(r).toLowerCase().includes(q) ||
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.dropoff && r.dropoff.toLowerCase().includes(q)) ||
          (r.cargo && r.cargo.toLowerCase().includes(q)),
      );
    }
    const dir = sortOrder === "Descending" ? -1 : 1;
    return [...result].sort((a, b) => {
      const statusA = toPartnerStatus(a.status);
      const statusB = toPartnerStatus(b.status);
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = displayRequestId(a).localeCompare(displayRequestId(b));
          break;
        case "date":
          cmp = String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || ""));
          break;
        case "consignee":
          cmp = (a.customerConsignee || "").localeCompare(b.customerConsignee || "");
          break;
        case "product":
          cmp = (a.cargo || "").localeCompare(b.cargo || "");
          break;
        case "truck":
          cmp = displayRequestedTruckType(a).localeCompare(displayRequestedTruckType(b));
          break;
        case "status":
          cmp = statusA.localeCompare(statusB);
          break;
        default: {
          const _exhaustive: never = sortKey;
          return _exhaustive;
        }
      }
      return cmp * dir;
    });
  }, [requests, searchQuery, sortKey, sortOrder]);

  // Partner cards via shared buckets — identical semantics to the staff
  // dashboards (a truck Stopped en route is "In transit", not "Declined").
  const partnerCounts = countBuckets(requests);
  const totalRequests = requests.length;
  const inTransit = partnerCounts.inTransit;
  const pending = partnerCounts.pending;
  // First approval (acknowledged, awaiting final approval) is "Seen";
  // "Approved" counts only the TM's second approval (Scheduled/on the road).
  const seen = partnerCounts.approved + partnerCounts.awaiting;
  const approved = partnerCounts.scheduled;
  const declined = partnerCounts.declined;
  const completed = partnerCounts.completed;

  const handleDelete = async () => {
    if (!deleteModalOpen) return;
    await tripService.delete(deleteModalOpen);
    setDeleteModalOpen(null);
    await refresh();
  };

  const openDetails = (trip: Trip, edit = false) => {
    try {
      sessionStorage.setItem(`fleetopsx_partner_trip_${trip.id}`, JSON.stringify(trip));
    } catch {
      /* ignore quota */
    }
    navigate({
      to: "/workspace/customer-portal/$requestId",
      params: { requestId: trip.id },
      search: { edit: edit ? "1" : undefined },
    });
  };

  /**
   * A request the partner may still change: it has not been acted on by anyone
   * yet, OR the Transport Manager sent it back for correction (which returns it
   * to Requested with a note). Mirrors the server's own edit rule.
   */
  const isEditable = (status: TripStatus | string) => ["Requested", "Draft", "Awaiting Approval"].includes(status);

  const openSortModal = () => {
    setDraftSortKey(sortKey);
    setDraftSortOrder(sortOrder);
    setSortModalOpen(true);
  };

  const saveSort = () => {
    setSortKey(draftSortKey);
    setSortOrder(draftSortOrder);
    setFiltersApplied(true);
    setSortModalOpen(false);
  };

  const clearSortKeyChip = () => {
    setSortKey("date");
    setDraftSortKey("date");
    if (sortOrder === "Descending") setFiltersApplied(false);
  };

  const clearSortOrderChip = () => {
    setSortOrder("Descending");
    setDraftSortOrder("Descending");
    if (sortKey === "date") setFiltersApplied(false);
  };

  const clearAllFilterChips = () => {
    setSortKey("date");
    setSortOrder("Descending");
    setDraftSortKey("date");
    setDraftSortOrder("Descending");
    setFiltersApplied(false);
  };

  const sortOptions = [
    { key: "id" as const, label: "ID No." },
    { key: "date" as const, label: "Date" },
    { key: "consignee" as const, label: "Consignee" },
    { key: "product" as const, label: "Product" },
    { key: "truck" as const, label: "Truck Type" },
    { key: "status" as const, label: "Status" },
  ];

  const orderOptions = [
    { key: "Ascending" as const, label: "Ascending" },
    { key: "Descending" as const, label: "Descending" },
  ];

  const activeSortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "Date";

  /** Figma SearchAndFilter Variant2 (`124:3827`): sort-key = red, order = navy. */
  const FilterChip = ({
    label,
    onRemove,
    tone,
  }: {
    label: string;
    onRemove: () => void;
    tone: "sort" | "order";
  }) => (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-3.5 rounded px-[7px] py-[5px]",
        tone === "sort" ? "bg-[#ED351D]" : "bg-[#1B2432]",
      )}
    >
      <span className="text-[12px] font-normal tracking-[0.4px] text-white">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-3 place-items-center text-white/90 hover:text-white"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </span>
  );

  /** Figma Filter-Order (`124:3478`): white row; only checkbox fills red when selected. */
  const CheckRow = ({
    selected,
    label,
    onSelect,
  }: {
    selected: boolean;
    label: string;
    onSelect: () => void;
  }) => (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-9 w-fit items-center gap-2.5 rounded bg-white px-2.5 py-[7px] text-left"
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border border-[#E2E5E9] shadow-[0px_4px_5px_rgba(0,0,0,0.05)]",
          selected ? "bg-[#ED351D]" : "bg-transparent",
        )}
      >
        {selected ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}
      </span>
      <span className="text-[14px] font-medium tracking-[0.4px] text-[rgba(92,100,112,0.6)]">{label}</span>
    </button>
  );

  const statCards = [
    { label: "Total Requests", value: totalRequests },
    { label: "In transit", value: inTransit, hint: inTransit > 0 ? "Look out for your delivery" : undefined },
    { label: "Pending", value: pending },
    { label: "Seen", value: seen },
    { label: "Approved", value: approved },
    { label: "Declined", value: declined },
    { label: "Completed", value: completed },
  ] as const;

  return (
    <PartnerPortalShell>
      <main className="box-border flex w-full max-w-none flex-1 flex-col gap-5 p-4 md:gap-[30px] md:p-[30px]">
        {/* Stat cards — responsive grid fills content width from lg (sidebar) up */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 lg:gap-[14px] 2xl:grid-cols-7">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="flex min-h-[100px] w-full flex-col rounded-[10px] bg-white p-[15px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)] lg:min-h-[116px]"
            >
              <p className="text-[13px] font-medium tracking-[0.4px] text-[#5C6470] sm:text-[14px]">{card.label}</p>
              <p className="mt-2 font-space-grotesk text-[28px] font-bold leading-none text-[#1B2432] sm:mt-2.5 sm:text-[36px] sm:leading-9">
                {card.value}
              </p>
              {"hint" in card && card.hint ? (
                <p className="mt-auto pt-2 text-[10px] font-medium text-[#34C759]">{card.hint}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-[5px]">
            <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432] sm:text-[24px] sm:font-medium sm:leading-8">
              Recent Requests
            </h2>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)] sm:text-[11.4px]">
              Track your transport requests and their current statuses
            </p>
          </div>
          <Link
            to="/workspace/customer-portal/request"
            className="flex h-10 w-full shrink-0 items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white sm:w-[235px]"
          >
            + New Request
          </Link>
        </div>

        <div className="flex w-full flex-col items-start gap-2.5">
          <div className="flex w-full items-center justify-start gap-3 sm:gap-5">
            <div className="flex h-10 w-full max-w-[540px] items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
              <Search className="size-5 shrink-0 text-[#5C6470] sm:size-[22px]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full min-w-0 bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <button
              type="button"
              onClick={openSortModal}
              className="grid size-10 shrink-0 place-items-center rounded bg-[#ED351D]"
              aria-label="Filter requests"
            >
              <ListFilter className="size-5 text-white" />
            </button>
          </div>
          {filtersApplied ? (
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip label={activeSortLabel} onRemove={clearSortKeyChip} tone="sort" />
              <FilterChip label={sortOrder} onRemove={clearSortOrderChip} tone="order" />
              <button
                type="button"
                onClick={clearAllFilterChips}
                className="text-[12px] font-medium tracking-[0.4px] text-[#ED351D] hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <FigmaLoadingState label="Loading requests…" />
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-6">
            <FigmaEmptyState
              title={searchQuery ? "No matching requests" : "No transport requests yet"}
              body="Submit a new transport request and follow its progress here."
            />
          </div>
        ) : (
          <>
            {/* Mobile cards — Figma 294:8644 (with the design's per-card action menu) */}
            <div className="flex flex-col gap-3 lg:hidden">
              {filteredRequests.map((r) => {
                const uiStatus = toPartnerStatus(r.status);
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetails(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openDetails(r);
                    }}
                    className="cursor-pointer rounded-[10px] border border-[#E2E5E9] bg-white p-4 text-left shadow-[0px_4px_10px_rgba(0,0,0,0.05)]"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#8E95A1]">{formatTripDate(r.scheduledDate)}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex h-[22px] items-center rounded px-3 text-[10px] font-medium",
                            partnerStatusClass(uiStatus),
                          )}
                        >
                          {uiStatus}
                        </span>
                        {/* The Transport Manager sent this one back — the partner
                            corrects it and resends instead of re-raising it. */}
                        {r.partnerNote ? (
                          <span
                            title={`Transport Manager: ${r.partnerNote}`}
                            className="inline-flex h-[22px] items-center rounded bg-[#FDECEA] px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#B42318]"
                          >
                            Action
                          </span>
                        ) : null}
                        {/* Per-card CTA menu (Details / Delete) — same as the design. */}
                        <span onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            open={rowMenuOpen === r.id}
                            onOpenChange={(o) => setRowMenuOpen(o ? r.id : null)}
                            label="Request options"
                            width={170}
                            items={[
                              { label: "Details", onSelect: () => openDetails(r) },
                              // Returned by the TM for correction (or never acted on
                              // yet) — open the editable form.
                              ...(isEditable(r.status)
                                ? [
                                    {
                                      label: r.partnerNote ? "Correct & Resend" : "Edit Request",
                                      onSelect: () => openDetails(r, true),
                                    },
                                  ]
                                : []),
                              // Only a still-pending request can be withdrawn.
                              ...(isWithdrawable(r.status)
                                ? [
                                    {
                                      label: "Delete",
                                      onSelect: () => setDeleteModalOpen(r.id),
                                      danger: true,
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </span>
                      </div>
                    </div>
                    <p className="mb-3 text-[16px] font-semibold text-[#1B2432]">{r.customerConsignee || "—"}</p>
                    <dl className="grid gap-2 text-[13px]">
                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <dt className="font-medium text-[#5C6470]">ID No:</dt>
                        <dd className="font-semibold text-[#ED351D]">{displayRequestId(r)}</dd>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <dt className="font-medium text-[#5C6470]">Product</dt>
                        <dd className="font-medium text-[#1B2432]">{r.cargo || "—"}</dd>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <dt className="font-medium text-[#5C6470]">Truck Type</dt>
                        <dd className="font-medium text-[#1B2432]">
                          {displayRequestedTruckType(r) || "—"}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <dt className="font-medium text-[#5C6470]">Destination</dt>
                        <dd className="font-medium leading-snug text-[#1B2432]">{r.dropoff || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>

            {/* Desktop table — Figma 294:5225 */}
            <div className="hidden w-full rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-5 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_32px_rgba(12,12,13,0.1)] lg:block lg:px-5 lg:py-6">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E2E5E9] text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">ID No.</th>
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Consignee</th>
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Product</th>
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Truck Type</th>
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Destination</th>
                      <th className="whitespace-nowrap py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((r) => {
                      const uiStatus = toPartnerStatus(r.status);
                      return (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b border-[#E2E5E9] last:border-0 hover:bg-[#F8F9FA]"
                          onClick={() => openDetails(r)}
                        >
                          <td className="whitespace-nowrap py-2.5 pr-3 text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                            {displayRequestId(r)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-3 text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                            {formatTripDate(r.scheduledDate)}
                          </td>
                          <td className="max-w-[220px] truncate py-2.5 pr-3 text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                            {r.customerConsignee || "—"}
                          </td>
                          <td className="max-w-[160px] truncate py-2.5 pr-3 text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                            {r.cargo || "—"}
                          </td>
                          <td className="max-w-[140px] truncate py-2.5 pr-3 text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                            {displayRequestedTruckType(r) || "—"}
                          </td>
                          <td className="max-w-[200px] truncate py-2.5 pr-3 text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                            {r.dropoff || "—"}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "inline-flex h-[22px] min-w-[68px] items-center justify-center rounded px-3 text-[10px] font-medium",
                                  partnerStatusClass(uiStatus),
                                )}
                              >
                                {uiStatus}
                              </span>
                              {r.partnerNote ? (
                                <span
                                  title={`Transport Manager: ${r.partnerNote}`}
                                  className="inline-flex h-[22px] items-center rounded bg-[#FDECEA] px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#B42318]"
                                >
                                  Action
                                </span>
                              ) : null}
                              <RowActionMenu
                                open={rowMenuOpen === r.id}
                                onOpenChange={(o) => setRowMenuOpen(o ? r.id : null)}
                                label="Request options"
                                width={170}
                                items={[
                                  { label: "Details", onSelect: () => openDetails(r) },
                                  // Returned by the TM for correction (or never acted
                                  // on yet) — open the editable form.
                                  ...(isEditable(r.status)
                                    ? [
                                        {
                                          label: r.partnerNote ? "Correct & Resend" : "Edit Request",
                                          onSelect: () => openDetails(r, true),
                                        },
                                      ]
                                    : []),
                                  ...(isWithdrawable(r.status)
                                    ? [
                                        {
                                          label: "Delete",
                                          onSelect: () => setDeleteModalOpen(r.id),
                                          danger: true,
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {sortModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-[490px] flex-col items-end gap-[15px] rounded-[10px] bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
            <div className="w-full border-b border-[#E2E5E9]">
              <h3 className="h-8 text-[16px] font-semibold tracking-[0.4px] text-[#ED351D]">Sort By</h3>
            </div>
            <div className="flex w-full flex-col gap-1">
              {sortOptions.map((opt) => (
                <CheckRow
                  key={opt.key}
                  label={opt.label}
                  selected={draftSortKey === opt.key}
                  onSelect={() => setDraftSortKey(opt.key)}
                />
              ))}
            </div>
            <div className="w-full border-b border-[#E2E5E9]">
              <h3 className="h-8 text-[16px] font-semibold tracking-[0.4px] text-[#ED351D]">Order By</h3>
            </div>
            <div className="flex w-full flex-col gap-[5px]">
              {orderOptions.map((opt) => (
                <CheckRow
                  key={opt.key}
                  label={opt.label}
                  selected={draftSortOrder === opt.key}
                  onSelect={() => setDraftSortOrder(opt.key)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={saveSort}
              className="flex h-8 w-[119px] items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-[320px] flex-col items-center rounded-lg bg-white p-8 text-center shadow-[0px_1px_2px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
            <div className="mb-4 grid size-[60px] place-items-center rounded-lg border-2 border-[#ED351D]">
              <span className="text-[24px] font-semibold text-[#ED351D]">!</span>
            </div>
            <p className="mb-8 max-w-[200px] text-[14px] font-medium text-[#5C6470]">
              Are you sure you want to delete this request?
            </p>
            <div className="flex w-full justify-center gap-4">
              <button type="button" onClick={() => setDeleteModalOpen(null)} className="h-10 flex-1 text-[14px] font-medium text-[#ED351D]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="h-10 flex-1 rounded bg-[#ED351D] hover:bg-[#d62e19] text-[14px] font-medium text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </PartnerPortalShell>
  );
}
