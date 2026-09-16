import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search } from "lucide-react";
import { authService } from "@/lib/fleetopsx/services";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { formatDateLines, formatDateTimeStamp, formatTableDate } from "@/lib/fleetopsx/display-dates";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { displayRequestId as requestId } from "@/lib/fleetopsx/request-id";
import { displayRequestedTruckType } from "@/lib/fleetopsx/display-ids";
import { tripService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { partnerQueueOrder, toPartnerUiStatus, type PartnerUiStatus } from "@/lib/fleetopsx/status-buckets";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/partner-requests")({
  // Acting on a partner request needs the same roles the API accepts (PATCH
  // /trips) — without this guard any department could deep-link in and get a
  // 403 "Insufficient privileges" on Approve / Decline.
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: AdminPartnerRequests,
});

const PAGE_SIZE = 10;

function isPartnerRequest(trip: Trip) {
  // EVERY partner request stays visible here across its whole lifecycle —
  // approving/declining used to make rows vanish because this list only kept
  // raw `Requested` rows. Now every status shows with a colored pill, and the
  // status filter finds them.
  return (
    Boolean(trip.customer?.trim()) ||
    Boolean(trip.customerConsignee?.trim()) ||
    trip.status === "Requested" ||
    trip.status === "Draft"
  );
}

/** Date Dispatched = the TM's final approval that put the truck on the road. */
function dispatchedAtOf(t: Trip): string | null {
  return t.dispatchedAt ?? null;
}

const STATUS_FILTERS: Array<"All" | PartnerUiStatus> = [
  "All",
  "Pending",
  "Approved",
  "In transit",
  "Completed",
  "Declined",
];

/** Same palette the partner portal uses for these labels. */
function statusPillClass(status: PartnerUiStatus) {
  switch (status) {
    case "Pending":
      return "bg-[#FC0] text-white";
    case "Approved":
      return "bg-[#34C759] text-white";
    case "Declined":
      return "bg-[#ED351D] text-white";
    case "In transit":
      return "bg-[#CB30E0] text-white";
    case "Completed":
      return "bg-[#007AFF] text-white";
  }
}

function StatusPill({ status }: { status: PartnerUiStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded px-3 text-[12px] font-medium tracking-[0.4px] shadow-[0px_1px_4px_rgba(12,12,13,0.1)]",
        statusPillClass(status),
      )}
    >
      {status}
    </span>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">{label}</span>
      <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470]">
        {value}
      </div>
    </div>
  );
}

function loadingSitesFor(trip: Trip): string[] {
  const fromArray = (trip.loadingSite ?? [])
    .flatMap((s) => String(s).split(/[;,]/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromArray.length > 0) return fromArray;
  const raw = trip.pickup?.trim() ?? "";
  if (!raw) return [];
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function AdminPartnerRequests() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<Trip | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    void tripService.list()
      .then((nextTrips) => {
        setTrips(nextTrips);
      })
      .finally(() => setLoading(false));
  }, []);

  // Near real-time: new partner requests and status changes appear live
  // (10s poll + refresh on focus / tab-visible) — no manual reload needed.
  useAutoRefresh(() => {
    void tripService.list().then(setTrips).catch(() => {});
  });

  // FIFO queue: requests nobody has acted on yet are pinned to the top, oldest
  // first, so the TM sees at a glance what is still waiting on him. Everything
  // already actioned drops below them, most recent first.
  const listing = useMemo(() => trips.filter(isPartnerRequest).sort(partnerQueueOrder), [trips]);

  const filtered = listing.filter((t) => {
    if (statusFilter !== "All" && toPartnerUiStatus(t) !== statusFilter) return false;
    const hay =
      `${requestId(t)} ${t.customer} ${t.customerConsignee ?? ""} ${t.cargo} ${displayRequestedTruckType(t)} ${t.dropoff}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers = "Date Requested,Request ID,Partner,Customer Name,Product,Truck Type,Drop-off Location,Date Approved,Status\n";
    const csv = filtered
      .map(
        (t) =>
          `${formatTableDate(t.createdAt)},${requestId(t)},${t.customer === "Customer Portal" ? "" : t.customer},${t.customerConsignee ?? ""},${t.cargo},${displayRequestedTruckType(t)},${t.dropoff},${formatTableDate(dispatchedAtOf(t))},${toPartnerUiStatus(t)}`,
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partner_requests.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const handleApprove = async (trip: Trip) => {
    if (approvingId) return;
    setMenuFor(null);
    // Guarded: show pending state, distinct offline message, revert on failure —
    // a dropped connection must never read as "approved".
    setApprovingId(trip.id);
    try {
      await tripService.initialApprove(trip.id);
      toast.success(`Request ${requestId(trip)} approved.`);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      const fresh = await tripService.list();
      setTrips(fresh);
      if (!fresh.some((t) => t.id === trip.id && t.status !== "Requested")) {
        toast.error("Network issue — the approval may not have saved. Check your connection and try again.");
      }
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(offline
        ? "You are offline — request NOT approved. Reconnect and try again."
        : `Failed to approve: ${err instanceof Error ? err.message : "network error"}. The request is unchanged.`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleDecline = async (trip: Trip) => {
    setMenuFor(null);
    setDetail(null);
    try {
      await tripService.update(trip.id, { status: "Stopped" });
      toast.warning(`Request ${requestId(trip)} declined.`);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      void tripService.list().then(setTrips);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline request.");
    }
  };

  return (
    <>
      {/* Figma desktop 480:15293 · mobile 480:16151 */}
      <div className="flex w-full flex-col gap-4 bg-[#F1F2F4] p-4 pb-28 md:gap-5 md:p-[30px] md:pb-[30px]">
        <div className="flex flex-col gap-1 border-b border-[rgba(92,100,112,0.3)] pb-1.5 md:gap-[5px] md:border-0 md:pb-0">
          <div className="flex items-center gap-[5px] md:block">
            <button
              type="button"
              onClick={() => navigate({ to: "/workspace/app" })}
              className="grid size-6 place-items-center text-[#141A1F] md:hidden"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
              Partner Requests
            </h2>
          </div>
          <p className="hidden text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)] md:block">
            take action on partner requests
          </p>
        </div>

        <button
          type="button"
          onClick={exportCSV}
          className="flex h-8 w-full items-center justify-center gap-[5px] rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white md:hidden"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>

        <div className="flex w-full items-center gap-5 md:hidden">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-[22px] -translate-y-1/2 text-[#5C6470]"
              strokeWidth={1.5}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search"
              className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-11 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number]);
              setPage(0);
            }}
            className="h-9 shrink-0 rounded border border-[rgba(92,100,112,0.6)] bg-white px-2 text-[12px] font-medium tracking-[0.4px] text-[#141A1F] outline-none"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Statuses" : s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[11px] md:hidden">
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching partner requests" : "No partner requests yet"}
              body={
                query
                  ? "Try a different request ID, partner, or destination."
                  : "Requests submitted by partner companies will appear here."
              }
            />
          )}
          {slice.map((trip) => {
            const partner = trip.customer === "Customer Portal" ? "" : trip.customer;
            return (
              <div
                key={trip.id}
                className="relative flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">{requestId(trip)}</span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={toPartnerUiStatus(trip)} />
                    <RowActionMenu
                      open={menuFor === trip.id}
                      onOpenChange={(o) => setMenuFor(o ? trip.id : null)}
                      label="Request options"
                      width={170}
                      items={[
                        { label: "View Details", onSelect: () => setDetail(trip) },
                        {
                          label: approvingId === trip.id ? "Approving…" : "Approve",
                          onSelect: () => void handleApprove(trip),
                          disabled: approvingId === trip.id,
                        },
                        { label: "Decline", onSelect: () => handleDecline(trip), danger: true },
                      ]}
                    />
                  </div>
                </div>
                <MetaRow label="Partner:" value={partner} accent />
                <MetaRow label="Name:" value={trip.customerConsignee || ""} />
                <MetaRow label="Product:" value={trip.cargo || ""} />
                <MetaRow label="Truck Type:" value={displayRequestedTruckType(trip)} />
                <MetaRow label="Drop-off Location:" value={trip.dropoff || ""} />
                <MetaRow label="Date Requested:" value={formatDateTimeStamp(trip.createdAt)} />
                <MetaRow label="Date Approved:" value={formatDateTimeStamp(dispatchedAtOf(trip))} />
              </div>
            );
          })}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#E2E5E9] pt-2.5">
              <div className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                <span>
                  {from} - {to}
                </span>
                <span>of {filtered.length}</span>
              </div>
              <div className="flex items-center gap-2.5">
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

        <div className="hidden w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:block">
          <div className="mb-4 flex items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
                setPage(0);
              }}
              label={(s) => (s === "All" ? "All Statuses" : s)}
            />
          </div>

          <div className="overflow-x-auto">
            {/* No min-width floor: the fr grid flexes to the viewport, so the
                page never scrolls sideways on smaller laptops. */}
            <div className="w-full">
              <div className="grid grid-cols-[minmax(110px,0.9fr)_minmax(88px,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(110px,0.9fr)_minmax(80px,0.7fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]">
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Requested</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Request ID</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Partner</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Customer Name</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Product</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck Type</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Drop-off Location</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Approved</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Status</span>
                <span className="w-5" />
              </div>

              {slice.map((trip) => (
                <div
                  key={trip.id}
                  className="relative grid h-12 grid-cols-[minmax(110px,0.9fr)_minmax(88px,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(110px,0.9fr)_minmax(80px,0.7fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0"
                >
                  <span className="text-[14px] leading-4 tracking-[0.4px] text-[#5C6470]">
                    {formatDateLines(trip.createdAt).date}
                    {formatDateLines(trip.createdAt).time && (
                      <span className="block text-[12px] text-[#627084]">{formatDateLines(trip.createdAt).time}</span>
                    )}
                  </span>
                  <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                    {requestId(trip)}
                  </span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {trip.customer === "Customer Portal" ? "" : trip.customer}
                  </span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {trip.customerConsignee}
                  </span>
                  <span className="truncate text-[12px] tracking-[0.4px] text-[#627084]">{trip.cargo}</span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {displayRequestedTruckType(trip) || "—"}
                  </span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                  <span className="text-[14px] leading-4 tracking-[0.4px] text-[#5C6470]">
                    {dispatchedAtOf(trip) ? (
                      <>
                        {formatDateLines(dispatchedAtOf(trip)).date}
                        <span className="block text-[12px] text-[#627084]">{formatDateLines(dispatchedAtOf(trip)).time}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <StatusPill status={toPartnerUiStatus(trip)} />
                  <div className="shrink-0 justify-self-end">
                    <RowActionMenu
                      open={menuFor === trip.id}
                      onOpenChange={(o) => setMenuFor(o ? trip.id : null)}
                      label="Request options"
                      items={[
                        { label: "View Details", onSelect: () => setDetail(trip) },
                        ...(toPartnerUiStatus(trip) === "Pending"
                          ? [
                              {
                                label: approvingId === trip.id ? "Approving…" : "Approve",
                                onSelect: () => void handleApprove(trip),
                                disabled: approvingId === trip.id,
                              },
                              { label: "Decline", onSelect: () => void handleDecline(trip), danger: true },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching partner requests" : "No partner requests yet"}
              body={
                query
                  ? "Try a different request ID, partner, or destination."
                  : "Requests submitted by partner companies will appear here."
              }
            />
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {filtered.length}</span>
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
                <button
                  type="button"
                  onClick={exportCSV}
                  className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
                >
                  <Download className="size-[18px]" strokeWidth={1.75} />
                  Export CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4" onClick={() => setDetail(null)}>
          <div
            className="flex max-h-[90vh] w-[406px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Request Details</h3>
            </div>
            <ReadOnlyField label="Customer Name" value={detail.customerConsignee ?? ""} />
            <ReadOnlyField label="Product" value={detail.cargo} />
            <ReadOnlyField label="Truck Type" value={displayRequestedTruckType(detail)} />
            <ReadOnlyField label="Drop-off Location" value={detail.dropoff} />
            <ReadOnlyField label="Date Requested" value={formatDateTimeStamp(detail.createdAt)} />
            <ReadOnlyField label="Date Approved" value={formatDateTimeStamp(dispatchedAtOf(detail))} />
            {loadingSitesFor(detail).length > 0 ? (
              <div className="flex w-full flex-col gap-1.5">
                <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Loading Site(s)</span>
                {loadingSitesFor(detail).map((site) => (
                  <div
                    key={site}
                    className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470]"
                  >
                    {site}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setDetail(null)} className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">
                Go Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleDecline(detail);
                    setDetail(null);
                  }}
                  className="flex h-8 items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Decline Request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleApprove(detail);
                    setDetail(null);
                  }}
                  className="flex h-8 items-center rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Approve Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-medium text-[#5C6470]">{label}</span>
      <span className={cn("min-w-0 flex-1", accent ? "font-semibold text-[#ED351D]" : "text-[#344256]")}>
        {value}
      </span>
    </div>
  );
}
