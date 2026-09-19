import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search } from "lucide-react";
import { authService } from "@/lib/fleetopsx/services";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton, CheckboxFilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { formatDateLines, formatDateTimeStamp, formatTableDate } from "@/lib/fleetopsx/display-dates";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { displayRequestId as requestId } from "@/lib/fleetopsx/request-id";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  displayRequestedTruckType,
  displayTruckAssigned,
} from "@/lib/fleetopsx/display-ids";
import { dispatchSearchText, matchesQuery } from "@/lib/fleetopsx/search-match";
import { assignmentReleaseService, tripService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import {
  approvedStampOf,
  partnerQueueOrder,
  toPartnerUiStatus,
  type PartnerUiStatus,
} from "@/lib/fleetopsx/status-buckets";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * The table's "Loading Point" cell: the first site by name, or "first +N" when
 * the request collects from several (the full list is in the tooltip and on the
 * request's own details). Same shape the tracking board uses, so one request
 * never reads differently in two places.
 */
function loadingPointLabel(trip: Trip): string {
  const sites = loadingSitesFor(trip);
  if (sites.length === 0) return "—";
  return sites.length === 1 ? sites[0]! : `${sites[0]} +${sites.length - 1}`;
}

/**
 * The truck as a row shows it: the cap code beside its plate, never apart.
 * "—" until Fleet Ops assigns one — an approved request can still have none.
 */
function truckCell(trip: Trip): string {
  return displayTruckAssigned(trip) || "—";
}

/**
 * Does a query look like something painted on a cab (GRR171XA, KSF 72 YF) or a
 * cap code (P017)? Only ever used to explain an empty result, never to filter.
 */
function looksLikeTruckNumber(query: string): boolean {
  const v = query.trim();
  if (!v || /^(req|dis)/i.test(v)) return false;
  return /[a-z]/i.test(v) && /\d/.test(v);
}

/** What the search box actually covers — said out loud when it finds nothing. */
const SEARCH_COVERS =
  "Search covers the Request ID, partner, customer name, product, truck (cap code and plate), tail, driver, loading sites and drop-off location.";

/** Body of the empty state under an active search: it names what was typed. */
function noMatchBody(query: string): string {
  const head = `Nothing on this list matches “${query.trim()}”.`;
  // The one case that reads as a broken search but is not: a truck number typed
  // for a request that has no truck yet (Fleet Ops assigns it after approval).
  if (looksLikeTruckNumber(query)) {
    return `${head} A truck only shows on a request once Fleet Ops assigns it, so an approved request can still be waiting for one. ${SEARCH_COVERS}`;
  }
  return `${head} ${SEARCH_COVERS}`;
}

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

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).

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

/**
 * The partner company a request belongs to — the value behind this table's
 * "Partner" column, the company filter and the CSV. One helper so the column,
 * the filter list and the export can never disagree about whose request it is.
 */
function partnerNameOf(trip: Pick<Trip, "customer">): string {
  return trip.customer === "Customer Portal" ? "" : (trip.customer ?? "");
}

const STATUS_FILTERS: Array<"All" | PartnerUiStatus> = [
  "All",
  "Pending",
  "Seen",
  "Approved",
  "In transit",
  "Completed",
  "Declined",
];

/** Same palette the partner portal uses for these labels. */
function statusPillClass(status: PartnerUiStatus) {
  switch (status) {
    case "Pending":
      // Amber needs dark text — white on #FC0 was barely legible.
      return "bg-[#FC0] text-[#1B2432]";
    case "Seen":
      // Same orange the partner portals use for an acknowledged request.
      return "bg-[#F99E1F] text-white";
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

/**
 * Which request actions still make sense in this state — ONE rule, used by the
 * row menu, the mobile card menu and the details modal so the three can never
 * offer different things again.
 *
 *  - Mark as Seen  → only while the request is Pending. It is the FIRST
 *    approval; on a request already dispatched it would pull the trip back to
 *    Approved and quietly un-dispatch a truck that may be on the road.
 *  - Return to Customer → the request goes back to the partner to correct, for as
 *    long as it has not ended. When a truck was already assigned the return
 *    RELEASES that dispatch first (head, tail, driver, costs) and then hands the
 *    request back, so the customer can edit it — the customer asking for a change
 *    is the normal reason a TM needs this, and the only other answer the page had
 *    was "Decline", which told the partner nothing and kept the vehicle busy.
 *  - Decline       → anything that has not already ended. A request declined
 *    after assignment still reads as Declined everywhere (never "In transit").
 */
function requestActions(status: PartnerUiStatus) {
  const ended = status === "Declined" || status === "Completed";
  return {
    canMarkSeen: status === "Pending",
    canSendBack: !ended,
    canDecline: !ended,
  };
}

/**
 * True once Fleet Ops has put a truck on this request, so returning it to the
 * customer has a dispatch to undo first.
 */
function hasDispatch(status: PartnerUiStatus) {
  return status === "Approved" || status === "In transit";
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
  // Ticked partner companies. Empty = no company filter (every row shows), so the
  // table is never mysteriously empty on first load.
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<Trip | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [noteTrip, setNoteTrip] = useState<Trip | null>(null);
  const [noteMode, setNoteMode] = useState<"sendback" | "decline">("sendback");
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);

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

  // Queue order, act-on-me first: Seen (opened, still no approval date on it) then
  // Pending hold the top, oldest waiting first; Approved and in transit run below,
  // and finished/rejected rows sit at the bottom. The CSV exports `filtered`, so
  // the file matches the screen row for row.
  const listing = useMemo(() => trips.filter(isPartnerRequest).sort(partnerQueueOrder), [trips]);

  // Every partner company that actually has a request on this board — the filter
  // never offers a company with nothing behind it, and it stays in sync by itself
  // as partners are added.
  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const t of listing) {
      const name = partnerNameOf(t).trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [listing]);

  const filtered = listing.filter((t) => {
    if (statusFilter !== "All" && toPartnerUiStatus(t) !== statusFilter) return false;
    if (companyFilter.length > 0 && !companyFilter.includes(partnerNameOf(t))) return false;
    // Search reaches the TRUCK as the operators name it — the cap code on the cab
    // and the plate beside it — plus the tail, the assigned driver, the loading
    // sites and both ends of the run. Spaces and punctuation in the query are
    // ignored, so "KSF 72 YF" finds the plate stored as "KSF72YF" and "p-017"
    // finds cap "P017". The status word stays searchable too.
    const hay = `${requestId(t)} ${dispatchSearchText(t)} ${displayCapFromTrip(t)} ${displayPlateFromTrip(t)} ${toPartnerUiStatus(t)}`;
    return matchesQuery(hay, query);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  // An empty table has to say WHY it is empty: no requests yet, nothing matching
  // the search, or nothing matching the ticked filter buttons — otherwise a filter
  // left on reads as a broken page.
  const filtersActive = statusFilter !== "All" || companyFilter.length > 0;
  const emptyTitle = query
    ? "No matching partner requests"
    : filtersActive
      ? "No requests match this filter"
      : "No partner requests yet";
  const emptyBody = query
    ? `${noMatchBody(query)}${filtersActive ? " A filter button is also on — clear it to widen the search." : ""}`
    : filtersActive
      ? "Nothing here matches the filter you picked. Press a red filter button and choose “All” to see every request again."
      : "Requests submitted by partner companies will appear here.";

  const exportCSV = () => {
    const headers =
      "Date Requested,Request ID,Partner,Customer Name,Product,Truck Type,Truck,Loading Point,Drop-off Location,Date Approved,Status\n";
    const csv = filtered
      .map(
        (t) =>
          `${formatTableDate(t.createdAt)},${requestId(t)},${partnerNameOf(t)},${t.customerConsignee ?? ""},${t.cargo},${displayRequestedTruckType(t)},${displayTruckAssigned(t)},${loadingPointLabel(t)},${t.dropoff},${formatTableDate(approvedStampOf(t))},${toPartnerUiStatus(t)}`,
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

  /**
   * The FIRST approval — the TM acknowledging a request. This is NOT the final
   * approval: the partner reads it as "Seen" (orange) and "Approved" (green)
   * only arrives once Fleet Ops has a truck and the dispatch is scheduled. The
   * button is labelled for what it produces so the two steps can't be confused.
   */
  const handleMarkSeen = async (trip: Trip) => {
    if (approvingId) return;
    // Guard the ENDPOINT, not just the button: "Mark as Seen" is the first
    // approval and must never be applied to a request that has already moved on
    // (it would set the trip back to Approved and un-dispatch a live truck).
    if (toPartnerUiStatus(trip) !== "Pending") {
      setMenuFor(null);
      toast.error("This request has already been actioned — it can no longer be marked as Seen.");
      return;
    }
    setMenuFor(null);
    // Guarded: show pending state, distinct offline message, revert on failure —
    // a dropped connection must never read as "seen".
    setApprovingId(trip.id);
    try {
      await tripService.initialApprove(trip.id);
      toast.success(`Request ${requestId(trip)} marked as Seen.`, {
        description: "The partner now sees this request as Seen.",
      });
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      const fresh = await tripService.list();
      setTrips(fresh);
      if (!fresh.some((t) => t.id === trip.id && t.status !== "Requested")) {
        toast.error("Network issue — the request may not have been marked as Seen. Check your connection and try again.");
      }
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(offline
        ? "You are offline — request NOT marked as Seen. Reconnect and try again."
        : `Failed to mark as Seen: ${err instanceof Error ? err.message : "network error"}. The request is unchanged.`);
    } finally {
      setApprovingId(null);
    }
  };

  /**
   * Two ways to answer a partner request wrongly raised:
   *  - Send Back  → the request returns to the partner to correct and resend
   *                 (it is NOT a decline; the partner never re-raises it).
   *  - Decline    → the request is rejected, with an optional reason.
   * Both carry a note the partner reads on their portal.
   */
  const openNote = (trip: Trip, mode: "sendback" | "decline") => {
    setMenuFor(null);
    setDetail(null);
    setNote("");
    setNoteMode(mode);
    setNoteTrip(trip);
  };

  const confirmNote = async () => {
    if (!noteTrip) return;
    const text = note.trim();
    if (noteMode === "sendback" && !text) {
      toast.error("Tell the partner what to correct.");
      return;
    }
    // Same guard as the menu: a request that has ended has nothing to return.
    if (noteMode === "sendback" && !requestActions(toPartnerUiStatus(noteTrip)).canSendBack) {
      setNoteTrip(null);
      toast.error("This request has already ended — it cannot be returned to the customer.");
      return;
    }
    setNoting(true);
    const declining = noteMode === "decline";
    const returning = !declining;
    try {
      // Both answers clear the assignment the request was holding — a declined
      // request is dead, and a returned one has to be editable by the customer
      // again without a truck still pointing at it. The approval stamps go too,
      // so a returned request does not keep advertising a dispatch that no
      // longer exists (the partner's "Date Approved" would lie otherwise).
      await tripService.update(noteTrip.id, {
        status: declining ? "Stopped" : "Requested",
        partnerNote: text || null,
        ...assignmentReleaseService.clearedFields(),
        ...(returning ? { approvedAt: null, dispatchedAt: null } : {}),
      });
      const freed = await assignmentReleaseService.releaseAssets(noteTrip);
      // Read the row back BEFORE claiming success. A decline that does not stick
      // is the worst failure this page has: the toast says "declined", the row
      // still reads In transit, and the request quietly stays on the road. The
      // API now refuses to revive a declined request, so anything other than the
      // expected status here means the save was lost or overruled — and it is
      // said out loud instead of being papered over with a success message.
      const fresh = await tripService.list();
      setTrips(fresh);
      const after = fresh.find((t) => t.id === noteTrip.id);
      const expected: PartnerUiStatus = declining ? "Declined" : "Pending";
      const actual = after ? toPartnerUiStatus(after) : null;
      if (actual !== expected) {
        toast.error(
          `The ${declining ? "decline" : "return to the customer"} did NOT save — request ${requestId(noteTrip)} is still ${actual ?? "unreadable"}. Nothing was changed, so please try again.`,
        );
        return;
      }
      toast[declining ? "warning" : "success"](
        declining
          ? `Request ${requestId(noteTrip)} declined.`
          : `Request ${requestId(noteTrip)} returned to the customer to correct.`,
        freed.length
          ? { description: `Released back to the fleet: ${freed.join(", ")}.` }
          : undefined,
      );
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      setNoteTrip(null);
      setNote("");
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(
        offline
          ? "You are offline — nothing was saved. Reconnect and try again."
          : err instanceof Error
            ? err.message
            : "Failed to save.",
      );
    } finally {
      setNoting(false);
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
              placeholder="Search request, partner, truck (cap or plate)…"
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
          <CheckboxFilterButton
            options={companyOptions}
            selected={companyFilter}
            onChange={(next) => {
              setCompanyFilter(next);
              setPage(0);
            }}
            allLabel="All companies"
            emptyLabel="No partner company has a request yet"
            noun="partner company"
          />
        </div>

        <div className="flex flex-col gap-[11px] md:hidden">
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && <FigmaEmptyState title={emptyTitle} body={emptyBody} />}
          {slice.map((trip) => {
            const partner = partnerNameOf(trip);
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
                        ...(requestActions(toPartnerUiStatus(trip)).canMarkSeen
                          ? [
                              {
                                label: approvingId === trip.id ? "Marking…" : "Mark as Seen",
                                onSelect: () => void handleMarkSeen(trip),
                                disabled: approvingId === trip.id,
                              },
                            ]
                          : []),
                        ...(requestActions(toPartnerUiStatus(trip)).canSendBack
                          ? [{ label: "Return to Customer", onSelect: () => openNote(trip, "sendback") }]
                          : []),
                        ...(requestActions(toPartnerUiStatus(trip)).canDecline
                          ? [{ label: "Decline", onSelect: () => openNote(trip, "decline"), danger: true }]
                          : []),
                      ]}
                    />
                  </div>
                </div>
                <MetaRow label="Partner:" value={partner} accent />
                <MetaRow label="Name:" value={trip.customerConsignee || ""} />
                <MetaRow label="Product:" value={trip.cargo || ""} />
                <MetaRow label="Truck Type:" value={displayRequestedTruckType(trip)} />
                <MetaRow label="Truck:" value={displayTruckAssigned(trip) || "—"} />
                <MetaRow label="Loading Point:" value={loadingPointLabel(trip)} />
                <MetaRow label="Drop-off Location:" value={trip.dropoff || ""} />
                <MetaRow label="Date Requested:" value={formatDateTimeStamp(trip.createdAt)} />
                <MetaRow label="Date Approved:" value={formatDateTimeStamp(approvedStampOf(trip))} />
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
                placeholder="Search request, partner, truck (cap or plate)…"
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
            {/* Second filter: partner company, several at once — tick the companies
                whose requests you want to see, or “All companies” for every one. */}
            <CheckboxFilterButton
              options={companyOptions}
              selected={companyFilter}
              onChange={(next) => {
                setCompanyFilter(next);
                setPage(0);
              }}
              allLabel="All companies"
              emptyLabel="No partner company has a request yet"
              noun="partner company"
            />
          </div>

          <div className="overflow-x-auto">
            {/* No min-width floor: the fr grid flexes to the viewport, so the
                page never scrolls sideways on smaller laptops. */}
            <div className="w-full">
              <div className="grid grid-cols-[minmax(110px,0.9fr)_minmax(88px,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(104px,1fr)_minmax(0,0.95fr)_minmax(0,1fr)_minmax(110px,0.9fr)_minmax(80px,0.7fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]">
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Requested</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Request ID</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Partner</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Customer Name</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Product</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck Type</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Loading Point</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Drop-off Location</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Approved</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Status</span>
                <span className="w-5" />
              </div>

              {slice.map((trip) => (
                <div
                  key={trip.id}
                  className="relative grid h-12 grid-cols-[minmax(110px,0.9fr)_minmax(88px,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(104px,1fr)_minmax(0,0.95fr)_minmax(0,1fr)_minmax(110px,0.9fr)_minmax(80px,0.7fr)_auto] items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0"
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
                    {partnerNameOf(trip)}
                  </span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {trip.customerConsignee}
                  </span>
                  <span className="truncate text-[12px] tracking-[0.4px] text-[#627084]">{trip.cargo}</span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {displayRequestedTruckType(trip) || "—"}
                  </span>
                  {/* Cap beside plate — the truck is how a request is found on the
                      phone ("where is GRR171XA"), so the search result shows it. */}
                  <span
                    className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]"
                    title={displayTruckAssigned(trip) || undefined}
                  >
                    {truckCell(trip)}
                  </span>
                  <span
                    className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]"
                    title={loadingSitesFor(trip).join(", ") || undefined}
                  >
                    {loadingPointLabel(trip)}
                  </span>
                  <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                  <span className="text-[14px] leading-4 tracking-[0.4px] text-[#5C6470]">
                    {approvedStampOf(trip) ? (
                      <>
                        {formatDateLines(approvedStampOf(trip)).date}
                        <span className="block text-[12px] text-[#627084]">
                          {formatDateLines(approvedStampOf(trip)).time}
                        </span>
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
                        ...(requestActions(toPartnerUiStatus(trip)).canMarkSeen
                          ? [
                              {
                                label: approvingId === trip.id ? "Marking…" : "Mark as Seen",
                                onSelect: () => void handleMarkSeen(trip),
                                disabled: approvingId === trip.id,
                              },
                            ]
                          : []),
                        ...(requestActions(toPartnerUiStatus(trip)).canSendBack
                          ? [{ label: "Return to Customer", onSelect: () => openNote(trip, "sendback") }]
                          : []),
                        ...(requestActions(toPartnerUiStatus(trip)).canDecline
                          ? [{ label: "Decline", onSelect: () => openNote(trip, "decline"), danger: true }]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && <FigmaEmptyState title={emptyTitle} body={emptyBody} />}

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

      {noteTrip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          onClick={() => setNoteTrip(null)}
        >
          <div
            className="flex w-[420px] max-w-full flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
              {noteMode === "sendback" ? "Return to customer" : "Decline request"}
            </h3>
            <p className="text-[13px] text-[#5C6470]">
              {noteMode === "decline"
                ? `Request ${requestId(noteTrip)} will be closed as declined. A reason helps the partner understand what was wrong.`
                : hasDispatch(toPartnerUiStatus(noteTrip))
                  ? `Request ${requestId(noteTrip)} is already dispatched. Returning it releases the truck, tail, driver and costs first, then sends it back to the customer to correct and resend — nothing is re-raised.`
                  : `Request ${requestId(noteTrip)} goes back to the customer to correct. It stays part of the same flow — the partner edits it and resends, nothing is re-raised.`}
            </p>
            <textarea
              autoFocus
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                noteMode === "sendback"
                  ? "e.g. Loading site and drop-off do not match — please correct."
                  : "e.g. Duplicate request — already covered by REQ-XXXXX."
              }
              className="w-full rounded border border-[#E2E5E9] p-3 text-[13px] text-[#1B2432] outline-none focus:border-[#ED351D]"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setNoteTrip(null)}
                className="text-[13px] font-medium text-[#627084] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={noting || (noteMode === "sendback" && !note.trim())}
                onClick={() => void confirmNote()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {noting ? "Saving…" : noteMode === "sendback" ? "Return to Customer" : "Decline"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <ReadOnlyField label="Truck" value={displayTruckAssigned(detail) || "Not assigned yet"} />
            <ReadOnlyField label="Drop-off Location" value={detail.dropoff} />
            <ReadOnlyField
              label="Destination Address"
              value={detail.dropoffAddress?.trim() ? detail.dropoffAddress : "Not provided yet"}
            />
            <ReadOnlyField label="Date Requested" value={formatDateTimeStamp(detail.createdAt)} />
            <ReadOnlyField label="Date Approved" value={formatDateTimeStamp(approvedStampOf(detail))} />
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
                {requestActions(toPartnerUiStatus(detail)).canSendBack && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetail(null);
                      openNote(detail, "sendback");
                    }}
                    className="flex h-8 items-center rounded border border-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-[#1B2432]"
                  >
                    Return to Customer
                  </button>
                )}
                {requestActions(toPartnerUiStatus(detail)).canDecline && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetail(null);
                      openNote(detail, "decline");
                    }}
                    className="flex h-8 items-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-2.5 text-[12px] tracking-[0.4px] text-white"
                  >
                    Decline Request
                  </button>
                )}
                {requestActions(toPartnerUiStatus(detail)).canMarkSeen && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleMarkSeen(detail);
                      setDetail(null);
                    }}
                    className="flex h-8 items-center rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
                  >
                    Mark as Seen
                  </button>
                )}
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
