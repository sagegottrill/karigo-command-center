import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ListFilter, MoreVertical, Search, X } from "lucide-react";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { authService, tripService } from "@/lib/fleetopsx/services";
import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/dashboard")({
  component: PartnerPortalDashboard,
});

type PartnerUiStatus = "Pending" | "Declined" | "In transit" | "Completed";

function toPartnerStatus(status: TripStatus): PartnerUiStatus {
  switch (status) {
    case "Requested":
    case "Awaiting Approval":
      return "Pending";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
    case "Scheduled":
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
    case "Declined":
      return "bg-[#ED351D] text-white";
    case "In transit":
      return "bg-[#CB30E0] text-white";
    case "Completed":
      return "bg-[#34C759] text-white";
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

function isPartnerTrip(trip: Trip, companyName: string | undefined) {
  // Live API: `customer` = partner company; `customerConsignee` = form consignee.
  if (trip.customer === "Customer Portal") return true;
  if (companyName && trip.customer === companyName) return true;
  return false;
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
          cmp = (a.tailType || "").localeCompare(b.tailType || "");
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

  const totalRequests = requests.length;
  const inTransit = requests.filter((r) => toPartnerStatus(r.status) === "In transit").length;
  const pending = requests.filter((r) => toPartnerStatus(r.status) === "Pending").length;
  const declined = requests.filter((r) => toPartnerStatus(r.status) === "Declined").length;
  const completed = requests.filter((r) => toPartnerStatus(r.status) === "Completed").length;

  const handleDelete = async () => {
    if (!deleteModalOpen) return;
    await tripService.delete(deleteModalOpen);
    setDeleteModalOpen(null);
    await refresh();
  };

  const openDetails = (trip: Trip) => {
    try {
      sessionStorage.setItem(`fleetopsx_partner_trip_${trip.id}`, JSON.stringify(trip));
    } catch {
      /* ignore quota */
    }
    navigate({ to: "/workspace/customer-portal/$requestId", params: { requestId: trip.id } });
  };

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
    { key: "consignee" as const, label: "Cosignee" },
    { key: "product" as const, label: "Product" },
    { key: "truck" as const, label: "Truck Type" },
    { key: "status" as const, label: "Status" },
  ];

  const orderOptions = [
    { key: "Ascending" as const, label: "Ascending" },
    { key: "Descending" as const, label: "Descending" },
  ];

  const activeSortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "Date";

  const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
    <span className="inline-flex h-8 items-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]">
      <span className="text-[13px] font-medium tracking-[0.4px] text-[#5C6470]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-4 place-items-center rounded text-[#5C6470] hover:text-[#ED351D]"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3.5" strokeWidth={2.25} />
      </button>
    </span>
  );

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
      className="flex h-9 w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-left"
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border border-[#E2E5E9] shadow-[0px_4px_5px_rgba(0,0,0,0.05)]",
          selected ? "bg-[#ED351D]" : "bg-white",
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
    { label: "Declined", value: declined },
    { label: "Completed", value: completed },
  ] as const;

  return (
    <PartnerPortalShell>
      <main className="box-border flex w-full max-w-none flex-1 flex-col gap-5 p-4 md:gap-[30px] md:p-[30px]">
        {/* Stat cards — responsive grid fills content width from lg (sidebar) up */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-[14px]">
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
            className="flex h-10 w-full shrink-0 items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white sm:w-[235px]"
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
              <FilterChip label={activeSortLabel} onRemove={clearSortKeyChip} />
              <FilterChip label={sortOrder} onRemove={clearSortOrderChip} />
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
              body="Submit a new request — live trips from the API will list here."
            />
          </div>
        ) : (
          <>
            {/* Mobile cards — Figma 294:8644 */}
            <div className="flex flex-col gap-3 lg:hidden">
              {filteredRequests.map((r) => {
                const uiStatus = toPartnerStatus(r.status);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openDetails(r)}
                    className="rounded-[10px] border border-[#E2E5E9] bg-white p-4 text-left shadow-[0px_4px_10px_rgba(0,0,0,0.05)]"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#8E95A1]">{formatTripDate(r.scheduledDate)}</span>
                      <span
                        className={cn(
                          "inline-flex h-[22px] items-center rounded px-3 text-[10px] font-medium",
                          partnerStatusClass(uiStatus),
                        )}
                      >
                        {uiStatus}
                      </span>
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
                        <dd className="font-medium text-[#1B2432]">{r.tailType || "—"}</dd>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <dt className="font-medium text-[#5C6470]">Destination</dt>
                        <dd className="font-medium leading-snug text-[#1B2432]">{r.dropoff || "—"}</dd>
                      </div>
                    </dl>
                  </button>
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
                      <th className="whitespace-nowrap py-2.5 pr-3 font-semibold">Cosignee</th>
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
                            {r.tailType || "—"}
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
                              <div className="relative">
                                <button
                                  type="button"
                                  className="p-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRowMenuOpen(rowMenuOpen === r.id ? null : r.id);
                                  }}
                                >
                                  <MoreVertical className="size-5 text-[#5C6470]" />
                                </button>
                                {rowMenuOpen === r.id && (
                                  <div className="absolute right-0 top-7 z-10 w-[160px] rounded-[10px] border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_24px_rgba(0,0,0,0.08)]">
                                    <button
                                      type="button"
                                      className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRowMenuOpen(null);
                                        openDetails(r);
                                      }}
                                    >
                                      Details
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#ED351D] hover:bg-red-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRowMenuOpen(null);
                                        setDeleteModalOpen(r.id);
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
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
              className="flex h-8 w-[119px] items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
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
                className="h-10 flex-1 rounded bg-[#ED351D] text-[14px] font-medium text-white"
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
