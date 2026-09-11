import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ListFilter, MoreVertical, Search } from "lucide-react";
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
    setSortModalOpen(false);
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
      <main className="flex w-full flex-col gap-4 p-4 sm:gap-[30px] sm:p-[30px]">
        {/* Stat cards — scroll on mobile, 5-up full width on desktop */}
        <div className="-mx-1 flex w-full gap-3 overflow-x-auto px-1 pb-1 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="min-w-[150px] w-full shrink-0 rounded-[10px] bg-white p-[15px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)] xl:min-w-0"
            >
              <p className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">{card.label}</p>
              <p className="mt-2.5 font-space-grotesk text-[36px] font-bold leading-9 text-[#1B2432]">{card.value}</p>
              {"hint" in card && card.hint ? (
                <p className="mt-3.5 text-[10px] font-medium text-[#34C759]">{card.hint}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432] sm:text-[24px] sm:font-medium sm:leading-8">
              Recent Requests
            </h2>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)] sm:text-[11.4px]">
              Track your transport requests and their current statuses
            </p>
          </div>
          <Link
            to="/workspace/customer-portal/request"
            className="flex h-10 w-full items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white sm:w-[235px]"
          >
            + New Request
          </Link>
        </div>

        <div className="flex w-full items-center justify-end gap-3 sm:gap-5">
          <div className="flex h-10 w-full max-w-[540px] items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
            <Search className="size-5 shrink-0 text-[#5C6470] sm:size-[22px]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
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

            {/* Desktop table — Figma 294:5225 (full-width columns) */}
            <div className="hidden w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-6 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_32px_rgba(12,12,13,0.1)] lg:block">
              <div className="w-full min-w-0">
                <div className="mb-2 grid w-full grid-cols-[minmax(96px,0.9fr)_minmax(110px,1.1fr)_minmax(140px,1.6fr)_minmax(100px,1.1fr)_minmax(100px,1fr)_minmax(140px,1.5fr)_minmax(120px,1fr)] gap-3 border-b border-[#E2E5E9] py-2.5 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                  <span>ID No.</span>
                  <span>Date</span>
                  <span>Cosignee</span>
                  <span>Product</span>
                  <span>Truck Type</span>
                  <span>Destination</span>
                  <span>Status</span>
                </div>
                {filteredRequests.map((r) => {
                  const uiStatus = toPartnerStatus(r.status);
                  return (
                    <div
                      key={r.id}
                      className="grid w-full cursor-pointer grid-cols-[minmax(96px,0.9fr)_minmax(110px,1.1fr)_minmax(140px,1.6fr)_minmax(100px,1.1fr)_minmax(100px,1fr)_minmax(140px,1.5fr)_minmax(120px,1fr)] items-center gap-3 border-b border-[#E2E5E9] py-2.5 last:border-0"
                      onClick={() => openDetails(r)}
                    >
                      <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                        {displayRequestId(r)}
                      </span>
                      <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {formatTripDate(r.scheduledDate)}
                      </span>
                      <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.customerConsignee || "—"}
                      </span>
                      <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.cargo || "—"}
                      </span>
                      <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.tailType || "—"}
                      </span>
                      <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                        {r.dropoff || "—"}
                      </span>
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
                    </div>
                  );
                })}
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
