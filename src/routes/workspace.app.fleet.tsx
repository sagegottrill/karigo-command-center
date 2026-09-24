import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DispatchDetailsModal } from "@/components/fleetopsx/dispatch-details-modal";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { TmEditAssignmentModal } from "@/components/fleetopsx/tm-edit-assignment-modal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  displayRequestedTruckType,
} from "@/lib/fleetopsx/display-ids";
import { formatDateLines, formatDateTimeStamp, formatTableDate } from "@/lib/fleetopsx/display-dates";
import { dispatchSearchText, matchesQuery } from "@/lib/fleetopsx/search-match";
import { expectedReturnAt, formatTripDuration } from "@/lib/fleetopsx/trip-duration";
import { CheckboxFilterButton, FilterButton } from "@/components/fleetopsx/filter-button";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { displayDispatchId as dispatchId, displayRequestId } from "@/lib/fleetopsx/request-id";
import {
  assignmentReleaseService,
  authService,
  driverService,
  fleetService,
  tripService,
} from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { hasAssignment, queueOrder } from "@/lib/fleetopsx/status-buckets";
import type { Driver, Trip, TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/fleet")({
  component: FleetDispatchRequests,
});

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).

/** Desktop table columns — fr units so the table flexes to fit 1280–1920px
    laptops instead of forcing the page sideways (screenshot bug). */
const FLEET_GRID =
  // Column order is the order the row is read in: the DATE leads (what came in
  // first), then who it is for, the truck, and the DISPATCH ID last — it is the
  // reference you look up after you have found the row, not the first thing you
  // read. Status keeps its own wide track: it has to hold "Awaiting Approval" on
  // ONE line — 86px wrapped it into a two-line pill that read as a glitch.
  "grid grid-cols-[minmax(108px,0.75fr)_minmax(72px,0.85fr)_minmax(64px,0.7fr)_minmax(104px,0.75fr)_minmax(80px,0.55fr)_minmax(72px,0.85fr)_minmax(108px,0.75fr)_minmax(100px,0.7fr)_minmax(146px,0.8fr)_minmax(92px,0.55fr)_auto]";

/** What the search box actually reaches, said out loud when it finds nothing. */
const SEARCH_COVERS =
  "It matches the dispatch ID, the partner or customer company, the truck's cap code and plate, the driver, the drop-off location and the status word.";

function noMatchBody(query: string): string {
  return `Nothing on this board matches “${query.trim()}”. ${SEARCH_COVERS}`;
}

function isDispatchRequest(trip: Trip) {
  // Every dispatched request stays visible across its lifecycle with a status
  // pill — approving/declining used to make rows vanish with no trace. Raw
  // partner requests (no assignment yet) still belong to Partner Requests.
  const assigned = hasAssignment(trip);
  // A request the TM sent back with nothing assigned yet (the send-back clears
  // Fleet Ops' work) must STILL be visible here with its reason — otherwise the
  // row silently vanishes from the TM's own table the moment they correct it.
  if (!assigned) return trip.status === "Awaiting Approval" || Boolean(trip.sendBackReason);
  // Every status an assigned dispatch can REACH stays on this table. The moving
  // ones (Loaded / En Route / Offloading / Returning / Delayed) were missing from
  // this list, so the moment Tracking logged the truck off the yard the row
  // vanished from the Transport Manager's own table — the exact "it just
  // disappears" the client kept hitting.
  return [
    "Awaiting Approval",
    "Approved",
    "Approved for Dispatch",
    "Scheduled",
    "Loaded",
    "En Route",
    "Offloading",
    "Returning",
    "Delayed",
    "Completed",
    "Stopped",
  ].includes(trip.status);
}

/** The moving statuses — one word for all of them on this table. */
const IN_TRANSIT_STATUSES = ["Loaded", "En Route", "Offloading", "Returning", "Delayed"];

/**
 * Every status this table can DISPLAY on a row.
 *
 * It is deliberately wider than the filter below: a dispatch can read "Approved"
 * (released to Fleet Ops, no truck yet) or "Completed" while the red filter only
 * offers the three the Transport Manager actually acts on. Rows must keep their
 * real status even when the filter cannot select it.
 */
type FleetStatus =
  | "Awaiting Approval"
  | "Approved"
  | "Scheduled"
  | "In Transit"
  | "Completed"
  | "Declined";

/**
 * What the red filter offers, in the order the work arrives: the dispatch sitting
 * on the TM's approval first, then what is on the board, then what he closed.
 * "Approved" and "Completed" were dropped from this menu on the client's call —
 * three choices that each mean one clear action beat six that needed reading.
 */
const STATUS_FILTERS: Array<"All" | "Awaiting Approval" | "Scheduled" | "Declined"> = [
  "All",
  "Awaiting Approval",
  "Scheduled",
  "Declined",
];

function fleetStatusOf(trip: Trip): FleetStatus {
  if (trip.status === "Stopped") return "Declined";
  if (trip.status === "Approved for Dispatch") return "Approved";
  // The truck has left: one word for the whole on-road stretch, so the row reads
  // the same whether it is loading, running or offloading.
  if (IN_TRANSIT_STATUSES.includes(trip.status)) return "In Transit";
  return trip.status as FleetStatus;
}

/**
 * The order the TM reads this table in: the dispatch sitting on HIS approval
 * (amber) first, then what Fleet Ops still has to schedule, then what is already
 * on the board. Finished and rejected work sinks to the bottom — freshest first,
 * so the one you just closed is the one you can see. Without this the amber row
 * that needs a decision was scattered anywhere down the page.
 */
const FLEET_QUEUE_RANK: Record<string, number> = {
  "Awaiting Approval": 0,
  Approved: 1,
  Scheduled: 2,
  "In Transit": 3,
  Completed: 4,
  Declined: 5,
};

/**
 * A status this table has never been taught still has to land somewhere — it
 * sorts below the known live ones rather than turning the whole column into NaN.
 */
function fleetQueueRank(trip: Trip): number {
  return FLEET_QUEUE_RANK[fleetStatusOf(trip)] ?? 5;
}

/** Plain-language meaning of each dispatch status, shown on hover. */
const STATUS_HINT: Record<FleetStatus, string> = {
  "Awaiting Approval":
    "Fleet Ops has configured this dispatch — approve it to put the truck on the road.",
  Approved: "Approved and waiting on Fleet Ops to schedule the truck.",
  Scheduled: "Approved and scheduled — the truck is on the dispatch board.",
  "In Transit": "The truck is out of the yard and moving — see it on Tracking Operations.",
  Completed: "Delivered — the dispatch is closed.",
  Declined: "Rejected by the Transport Manager.",
};

function StatusPill({ status }: { status: FleetStatus }) {
  const cls =
    status === "Declined"
      ? "bg-[#ED351D] text-white"
      : status === "Approved"
        ? "bg-[#34C759] text-white"
        : status === "Completed"
          ? "bg-[#007AFF] text-white"
          : status === "Scheduled"
            ? "bg-[#CB30E0] text-white"
            : status === "In Transit"
              ? "bg-[#30B0C7] text-white"
              : // Amber needs dark text: white on #FC0 was barely legible.
                "bg-[#FC0] text-[#1B2432]";
  return (
    <span
      title={STATUS_HINT[status] || status}
      className={cn(
        // nowrap: a two-line pill inside a 22px-high chip read as a broken cell.
        "inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded px-3 text-[12px] font-medium tracking-[0.4px] shadow-[0px_1px_4px_rgba(12,12,13,0.1)]",
        cls,
      )}
    >
      {status}
    </span>
  );
}

function headLabel(trip: Trip, heads: TruckHead[]) {
  const head =
    heads.find(
      (h) =>
        h.id === trip.headId ||
        h.number === trip.headId ||
        h.capNumber === trip.headId,
    ) ?? null;
  const cap = displayCapFromTrip(trip, head);
  const plate = displayPlateFromTrip(trip, head);
  if (cap && plate) return `${cap} (${plate})`;
  return cap || plate || "";
}

/** What the partner asked for — the requested/head type. tailType is only a
    fallback: pre-backfill rows and unassigned requests kept the request in
    tailType, and this column must not mix requested vs fitted data. */
function fleetTruckTypeOf(trip: Trip): string {
  return displayRequestedTruckType(trip) || trip.tailType || "—";
}

function FleetDispatchRequests() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  // Ticked companies — empty means no company filter at all.
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [detail, setDetail] = useState<Trip | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [sendBackTrip, setSendBackTrip] = useState<Trip | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  // The TM's estimated dispatch date. Deliberately its own small action: a
  // request can be given a working date before Fleet Ops has picked a truck,
  // which the full Modify form cannot do (it demands the whole assignment).
  const [estimateTrip, setEstimateTrip] = useState<Trip | null>(null);
  const [estimateValue, setEstimateValue] = useState("");
  // How many days the vehicle is expected to spend ON THE ROAD. This is the
  // number the delay status is measured against (Fortune, 17 Sept): he sets it
  // at the FINAL approval, once Fleet Ops has put a truck on the dispatch.
  const [estimateDays, setEstimateDays] = useState("");
  // Approving and promising a duration are the same act — the modal opens from
  // the Approve action and finishes the approval when it saves.
  const [estimateApproveAfter, setEstimateApproveAfter] = useState(false);
  const [savingEstimate, setSavingEstimate] = useState(false);

  useEffect(() => {
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
    void Promise.all([tripService.list(), driverService.list(), fleetService.listHeads(), fleetService.listTails()])
      .then(([nextTrips, nextDrivers, nextHeads, nextTails]) => {
        setTrips(nextTrips);
        setDrivers(nextDrivers);
        setHeads(nextHeads);
        setTails(nextTails);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // Near real-time: 10s poll (+ focus / tab-visible) — trips/drivers/heads stay
  // current without a manual refresh.
  useAutoRefresh(() => {
    void Promise.all([tripService.list(), driverService.list(), fleetService.listHeads(), fleetService.listTails()])
      .then(([nextTrips, nextDrivers, nextHeads, nextTails]) => {
        setTrips(nextTrips);
        setDrivers(nextDrivers);
        setHeads(nextHeads);
        setTails(nextTails);
      })
      .catch(() => {});
  });

  const driverById = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of drivers) map.set(d.id, d);
    return map;
  }, [drivers]);

  const listing = useMemo(
    () =>
      trips
        .filter((t) => isDispatchRequest(t))
        .sort((a, b) =>
          queueOrder(
            { rank: fleetQueueRank(a), at: a.createdAt },
            { rank: fleetQueueRank(b), at: b.createdAt },
          ),
        ),
    [trips],
  );

  /**
   * Companies on this board — the partner that raised the work and the customer it
   * is for. Both are "the company" to the person filtering, so a tick matches a row
   * that carries the name in EITHER column.
   *
   * Grouping is case-INSENSITIVE and keeps the best spelling of each name: live
   * data holds "Metalberg" and "metalberg" (and "Metalberg Nig Ltd" beside
   * "Metalberg nig ltd") from typing, so a case-sensitive list offered 28 options
   * for 24 companies — and ticking one of a pair silently hid the other's rows.
   */
  const companyOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const t of listing) {
      for (const raw of [t.customer, t.customerConsignee]) {
        const name = (raw ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const existing = byKey.get(key);
        if (!existing || (/[A-Z]/.test(name) && !/[A-Z]/.test(existing))) byKey.set(key, name);
      }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [listing]);

  /** One lower-cased name per company a row belongs to, for case-insensitive ticks. */
  const companyOf = (t: Trip) =>
    [t.customer, t.customerConsignee]
      .map((raw) => (raw ?? "").trim().toLowerCase())
      .filter(Boolean);
  const tickedCompanyKeys = useMemo(() => new Set(companyFilter.map((c) => c.toLowerCase())), [companyFilter]);

  const filtered = listing.filter((t) => {
    if (statusFilter !== "All" && fleetStatusOf(t) !== statusFilter) return false;
    if (tickedCompanyKeys.size > 0 && !companyOf(t).some((name) => tickedCompanyKeys.has(name))) return false;
    const driver = t.driverId ? driverById.get(t.driverId) : undefined;
    // A truck number typed the way it is said out loud ("KSF 72 YF") has to find
    // the row, not just the stored spelling — cap code and plate both searched.
    // The STATUS WORD the row displays is searched too, not the stored one: the
    // pill says "Declined" while the record says "Stopped", so typing "declined"
    // used to find nothing on a table full of declined rows.
    const hay = `${dispatchId(t)} ${displayRequestId(t)} ${dispatchSearchText(t)} ${displayCapFromTrip(t)} ${displayPlateFromTrip(t)} ${fleetTruckTypeOf(t)} ${fleetStatusOf(t)} ${headLabel(t, heads)} ${driver?.name ?? ""} ${driver?.phone ?? ""}`;
    return matchesQuery(hay, query);
  });

  // An empty table must say whether the search or a filter hid the rows.
  const filtersActive = statusFilter !== "All" || companyFilter.length > 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    // Same order as the table, so the file reconciles with the screen row for row.
    const headers =
      "Date Requested,Customer,Driver,Truck Head,Truck Type,Drop-off Location,Date Approved,Est. Date,Trip Duration,Status,Dispatch ID\n";
    const csv = filtered
      .map((t) => {
        const driver = t.driverId ? driverById.get(t.driverId) : undefined;
        return `${formatDateTimeStamp(t.createdAt)},${t.customerConsignee ?? ""},${t.driverName || driver?.name || ""},${headLabel(t, heads)},${fleetTruckTypeOf(t)},${t.dropoff},${formatDateTimeStamp(t.dispatchedAt)},${t.estimatedDate ? formatTableDate(t.estimatedDate) : ""},${formatTripDuration(t.estimatedDays) || ""},${fleetStatusOf(t)},${dispatchId(t)}`;
      })
      .join("\n");
    return headers + csv;
  };

  const handleApprove = async (trip: Trip) => {
    if (approvingId) return;
    setMenuFor(null);
    // The final approval is where the TM promises how many days the truck will
    // be on the road — that promise is what delay is measured against later, and
    // what the partner is told to expect. So approval ASKS for it instead of
    // approving silently and leaving delay to be guessed by hand.
    if (!trip.estimatedDays) {
      setDetail(null);
      setEstimateTrip(trip);
      setEstimateValue((trip.estimatedDate ?? "").slice(0, 10));
      setEstimateDays("");
      setEstimateApproveAfter(true);
      toast.info("Set the trip duration to finish the approval.");
      return;
    }
    // Guarded: pending state, distinct offline message, revert on failure.
    setApprovingId(trip.id);
    try {
      await tripService.approveDispatch(trip.id);
      // Belt and braces: final approval is the moment the dispatch certainly
      // holds a truck, whatever happened on the Fleet Ops side.
      void assignmentReleaseService.claimAssets(trip);
      toast.success(`Dispatch ${dispatchId(trip)} approved.`);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      const fresh = await tripService.list();
      setTrips(fresh);
      if (!fresh.some((t) => t.id === trip.id && t.status !== "Awaiting Approval")) {
        toast.error("Network issue — the approval may not have saved. Check your connection and try again.");
      }
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(offline
        ? "You are offline — dispatch NOT approved. Reconnect and try again."
        : `Failed to approve: ${err instanceof Error ? err.message : "network error"}. The dispatch is unchanged.`);
    } finally {
      setApprovingId(null);
    }
  };

  // TM not happy with FO's assignment → back to Approved so FO re-assigns.
  // The reason travels with the dispatch: Fleet Ops sees WHAT was wrong, not
  // just that it came back.
  const handleSendBack = (trip: Trip) => {
    setMenuFor(null);
    setDetail(null);
    setSendBackNote("");
    setSendBackTrip(trip);
  };

  const openEstimate = (trip: Trip, approveAfter = false) => {
    setMenuFor(null);
    setDetail(null);
    setEstimateValue((trip.estimatedDate ?? "").slice(0, 10));
    setEstimateDays(trip.estimatedDays ? String(trip.estimatedDays) : "");
    setEstimateApproveAfter(approveAfter);
    setEstimateTrip(trip);
  };

  const closeEstimate = () => {
    setEstimateTrip(null);
    setEstimateValue("");
    setEstimateDays("");
    setEstimateApproveAfter(false);
  };

  const saveEstimate = async () => {
    if (!estimateTrip) return;
    const next = estimateValue.trim() || null;
    const days = Number(estimateDays);
    // An approval cannot go through without the duration — that is the whole
    // point of asking here.
    if (estimateApproveAfter && (!Number.isFinite(days) || days <= 0)) {
      toast.error("Enter how many days the trip is expected to take.");
      return;
    }
    setSavingEstimate(true);
    try {
      await tripService.update(estimateTrip.id, {
        estimatedDate: next,
        estimatedDays: Number.isFinite(days) && days > 0 ? days : null,
      });
      // Show it immediately — the table must not need a reload to agree.
      setTrips((prev) =>
        prev.map((t) =>
          t.id === estimateTrip.id
            ? { ...t, estimatedDate: next, estimatedDays: Number.isFinite(days) && days > 0 ? days : null }
            : t,
        ),
      );
      if (estimateApproveAfter) {
        const target = estimateTrip;
        closeEstimate();
        await handleApprove({ ...target, estimatedDays: days });
        return;
      }
      toast.success(next || days > 0 ? "Trip estimate saved." : "Trip estimate cleared.");
      closeEstimate();
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(
        offline
          ? "You are offline — the estimate was NOT saved."
          : err instanceof Error
            ? err.message
            : "Failed to save the trip estimate.",
      );
    } finally {
      setSavingEstimate(false);
    }
  };

  const confirmSendBack = async () => {
    if (!sendBackTrip) return;
    const reason = sendBackNote.trim();
    if (!reason) {
      toast.error("Add a reason so Fleet Ops knows what to fix.");
      return;
    }
    setSendingBack(true);
    try {
      // Clear EVERYTHING Fleet Ops configured for this dispatch and hand the
      // request straight back to their queue. Leaving the old truck/driver/costs
      // on the record kept the wrong dispatch visible on the TM table, Dispatch
      // History, Tracking Operations and Tracking until someone re-assigned it — the
      // client had no way to make a mistaken assignment go away.
      //   driverName/truckReg are NOT NULL columns, so they empty to "" (which
      //   reads as unassigned everywhere) rather than null.
      await tripService.update(sendBackTrip.id, {
        status: "Approved",
        ...assignmentReleaseService.clearedFields(),
        sendBackReason: reason,
      });
      // The vehicle itself is freed too, not just the record: if Fleet Ops had
      // marked the truck/tail Assigned or the driver On Trip, they go back on the
      // board so the next dispatcher can pick them.
      const freed = await assignmentReleaseService.releaseAssets(sendBackTrip);
      toast.success(
        `Dispatch ${dispatchId(sendBackTrip)} cleared and returned to Fleet Operations.`,
        {
          description: freed.length
            ? `Released back to the fleet: ${freed.join(", ")} — Fleet Ops re-assigns from the queue.`
            : "The truck, driver and costs are removed — Fleet Ops re-assigns from the queue.",
        },
      );
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      setSendBackTrip(null);
      setSendBackNote("");
      void tripService.list().then(setTrips);
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.error(
        offline
          ? "You are offline — dispatch NOT sent back. Reconnect and try again."
          : err instanceof Error
            ? err.message
            : "Failed to send dispatch back.",
      );
    } finally {
      setSendingBack(false);
    }
  };

  return (
    <>
      {/* Figma desktop 480:15035 · mobile 480:2112 */}
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
              Fleet Dispatch Requests
            </h2>
          </div>
          <p className="hidden text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)] md:block">
            take action on dispatch requests
          </p>
        </div>

        <ExportMenu
          csv={exportCSV}
          rows={filtered.length}
          title="Fleet Dispatch — Requests & Dispatches"
          fileNameBase="dispatch_requests"
          mobile
        />

        <div className="flex w-full flex-wrap items-center gap-2 md:hidden">
          {/* Search takes its own row on a phone: two named filter boxes beside it
              squeezed the field down to nothing. */}
          <div className="relative min-w-0 basis-full">
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
              placeholder="Search dispatch, truck (plate or cap), driver, company…"
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
            emptyLabel="No company has a dispatch yet"
            noun="company"
          />
        </div>

        {/* Mobile cards */}
        <div className="flex flex-col gap-[11px] md:hidden">
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching dispatch requests" : filtersActive ? "No dispatch matches this filter" : "No dispatch requests yet"}
              body={
                query
                  ? `${noMatchBody(query)}${filtersActive ? " A filter button is also on — clear it to widen the search." : ""}`
                  : filtersActive
                    ? "Nothing here matches the filter you picked. Press a red filter button and choose “All” to see every dispatch again."
                    : "After Fleet Ops assigns a truck and driver, requests wait here for final TM approval. Requests still with the partner live on Partner Requests."
              }
            />
          )}
          {slice.map((trip) => {
            const driver = trip.driverId ? driverById.get(trip.driverId) : undefined;
            return (
              <div
                key={trip.id}
                className="relative flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Phone cards follow the table's order: the date leads the card
                      and the dispatch ID closes it. */}
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">
                    {formatDateTimeStamp(trip.createdAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusPill status={fleetStatusOf(trip)} />
                    <RowActionMenu
                      open={menuFor === trip.id}
                      onOpenChange={(o) => setMenuFor(o ? trip.id : null)}
                      label="Dispatch options"
                      width={170}
                      items={[
                        { label: "View Details", onSelect: () => setDetail(trip) },
                        { label: "Set Date & Duration", onSelect: () => openEstimate(trip) },
                        ...(fleetStatusOf(trip) === "Awaiting Approval" || fleetStatusOf(trip) === "Approved" || fleetStatusOf(trip) === "Scheduled"
                          ? [{ label: "Modify", onSelect: () => setEditing(trip) }]
                          : []),
                        ...(fleetStatusOf(trip) === "Awaiting Approval"
                          ? [{
                              label: approvingId === trip.id ? "Approving…" : "Approve",
                              onSelect: () => void handleApprove(trip),
                              disabled: approvingId === trip.id,
                            }]
                          : []),
                        ...(fleetStatusOf(trip) === "Approved" || fleetStatusOf(trip) === "Scheduled"
                          ? [{ label: "Send Back to Fleet Ops", onSelect: () => void handleSendBack(trip) }]
                          : []),
                      ]}
                    />
                  </div>
                </div>
                <MetaRow label="Customer:" value={trip.customerConsignee || ""} />
                <MetaRow label="Driver:" value={trip.driverName || driver?.name || ""} />
                <MetaRow label="Head No:" value={headLabel(trip, heads)} accent />
                <MetaRow label="Truck Type:" value={fleetTruckTypeOf(trip)} />
                <MetaRow label="Phone No:" value={driver?.phone || ""} />
                <MetaRow label="Drop-off Location:" value={trip.dropoff || ""} />
                <MetaRow label="Date Approved:" value={formatDateTimeStamp(trip.dispatchedAt)} />
                <MetaRow
                  label="Est. Date:"
                  value={trip.estimatedDate ? formatTableDate(trip.estimatedDate) : ""}
                />
                <MetaRow label="Trip Duration:" value={formatTripDuration(trip.estimatedDays)} />
                <MetaRow
                  label="Expected Return:"
                  value={
                    expectedReturnAt(trip) ? formatTableDate(expectedReturnAt(trip)!.toISOString()) : ""
                  }
                />
                <MetaRow label="Dispatch ID:" value={dispatchId(trip)} />
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

        {/* Desktop table card */}
        <div className="hidden w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:block">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#E2E5E9] pb-5">
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
                placeholder="Search dispatch, truck (plate or cap), driver, company…"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            {/* Status filter — a named box with a drop-down arrow. It replaced a
                bare red square that sat beside an identical bare red square (the
                company filter), which read as one ambiguous control. */}
            <FilterButton
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
                setPage(0);
              }}
              allLabel="All Statuses"
              noun="status"
            />
            {/* Second filter: the company — several at once, tick boxes, so the
                board can be narrowed to one partner's or one customer's work. */}
            <CheckboxFilterButton
              options={companyOptions}
              selected={companyFilter}
              onChange={(next) => {
                setCompanyFilter(next);
                setPage(0);
              }}
              allLabel="All companies"
              emptyLabel="No company has a dispatch yet"
              noun="company"
            />
          </div>

          {/* Responsive grid — the table flexes to the viewport instead of
              forcing the whole page sideways on smaller laptops. */}
          <div className="overflow-x-auto">
            <div className="w-full">
              <div className={cn("items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]", FLEET_GRID)}>
                {/* Date Requested leads the row — the TM reads the request date first. */}
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Requested</span>
                <span className="truncate text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Customer</span>
                <span className="truncate text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Driver</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck Head</span>
                {/* This column shows the truck type the request was raised for —
                    labelling it "Head Type" made operators read it as the cab. */}
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck Type</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Drop-off Location</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Approved</span>
                {/* The date the TM is working to — his own estimate, until the
                    gate stamp records when the truck really left. */}
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Est. Date</span>
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Status</span>
                {/* The dispatch ID closes the row: the reference you quote once you
                    have found the dispatch you were looking for. */}
                <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch ID</span>
                <span className="justify-self-end text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Actions</span>
              </div>

              {slice.map((trip) => {
                const driver = trip.driverId ? driverById.get(trip.driverId) : undefined;
                return (
                  <div
                    key={trip.id}
                    className={cn("relative items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0", FLEET_GRID)}
                  >
                    <DateCell value={trip.createdAt} />
                    <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                      {trip.customerConsignee || "—"}
                    </span>
                    <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">
                      {trip.driverName || driver?.name}
                    </span>
                    <span className="truncate text-[12px] text-[#627084]">{headLabel(trip, heads)}</span>
                    <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">{fleetTruckTypeOf(trip)}</span>
                    <span className="truncate capitalize text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                    <DateCell value={trip.dispatchedAt} />
                    <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                      {trip.estimatedDate ? formatTableDate(trip.estimatedDate) : "—"}
                      {formatTripDuration(trip.estimatedDays) ? (
                        <span className="block text-[12px] text-[#627084]">
                          {formatTripDuration(trip.estimatedDays)} on the road
                        </span>
                      ) : null}
                    </span>
                    <span>
                      <StatusPill status={fleetStatusOf(trip)} />
                    </span>
                    <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                      {dispatchId(trip)}
                    </span>
                    <div className="flex shrink-0 items-center gap-2 justify-self-end">
                      <RowActionMenu
                        open={menuFor === trip.id}
                        onOpenChange={(o) => setMenuFor(o ? trip.id : null)}
                        label="Dispatch options"
                        items={[
                          { label: "View Details", onSelect: () => setDetail(trip) },
                          // The date the truck leaves AND how long it will be gone —
                          // the two halves of the promise the partner is given.
                          { label: "Set Date & Duration", onSelect: () => openEstimate(trip) },
                          ...(fleetStatusOf(trip) === "Awaiting Approval" || fleetStatusOf(trip) === "Approved" || fleetStatusOf(trip) === "Scheduled"
                            ? [{ label: "Modify", onSelect: () => setEditing(trip) }]
                            : []),
                          ...(fleetStatusOf(trip) === "Awaiting Approval"
                            ? [{
                                label: approvingId === trip.id ? "Approving…" : "Approve",
                                onSelect: () => void handleApprove(trip),
                                disabled: approvingId === trip.id,
                              }]
                            : []),
                          ...(fleetStatusOf(trip) === "Approved" || fleetStatusOf(trip) === "Scheduled"
                            ? [{ label: "Send Back to Fleet Ops", onSelect: () => void handleSendBack(trip) }]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching dispatch requests" : filtersActive ? "No dispatch matches this filter" : "No dispatch requests yet"}
              body={
                query
                  ? `${noMatchBody(query)}${filtersActive ? " A filter button is also on — clear it to widen the search." : ""}`
                  : filtersActive
                    ? "Nothing here matches the filter you picked. Press a red filter button and choose “All” to see every dispatch again."
                    : "After Fleet Ops assigns a truck and driver, requests wait here for final TM approval. Requests still with the partner live on Partner Requests."
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
                <ExportMenu
                  csv={exportCSV}
                  rows={filtered.length}
                  title="Fleet Dispatch — Requests & Dispatches"
                  fileNameBase="dispatch_requests"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <DispatchDetailsModal
          trip={detail}
          driver={
            detail.driverId
              ? driverById.get(detail.driverId)
              : drivers.find((d) => d.name === detail.driverName)
          }
          head={
            heads.find(
              (h) =>
                h.id === detail.headId ||
                h.number === detail.headId ||
                h.capNumber === detail.headId ||
                (detail.truckReg ? h.registration === detail.truckReg : false),
            ) ??
            // FO writes truckReg as "PLATE / TAILCODE" without headId — match the
            // head by the plate part so the Cap number always resolves.
            (() => {
              const plate = (detail.truckReg || "").split("/")[0]?.trim().toUpperCase();
              return plate
                ? heads.find((h) => h.registration.replace(/\s/g, "").toUpperCase() === plate.replace(/\s/g, ""))
                : undefined;
            })()
          }
          onClose={() => setDetail(null)}
          onApprove={() => {
            void handleApprove(detail);
            setDetail(null);
          }}
          declineLabel="Send Back to Fleet Ops"
          onDecline={() => {
            // A dispatch rejected here is an INTERNAL correction: the mistake was
            // Fleet Ops', so it goes back to them with a reason — the partner's
            // request is never declined for someone else's error.
            setDetail(null);
            handleSendBack(detail);
          }}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}

      {estimateTrip && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[420px] rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-[16px] font-bold text-[#1B2432]">
              {estimateApproveAfter ? "Approve and set trip duration" : "Trip duration & estimated date"}
            </h3>
            <p className="mt-1 text-[13px] text-[#5C6470]">
              Dispatch {dispatchId(estimateTrip)}.{" "}
              {estimateApproveAfter
                ? "Approving puts the truck on the road — say how long it is expected to take, so delay is measured against your number and the partner knows when to expect the cargo."
                : "Fleet Operations and Tracking see this date on the dispatch board until Security logs the truck out of the gate — which replaces it with the real time."}
            </p>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#1B2432]">
                Trip duration (days) {estimateApproveAfter ? <span className="text-[#ED351D]">*</span> : null}
              </span>
              <input
                type="number"
                min={1}
                autoFocus
                inputMode="numeric"
                value={estimateDays}
                onChange={(e) => setEstimateDays(e.target.value)}
                placeholder="e.g. 4"
                className="h-10 w-full rounded border border-[#E2E5E9] px-3 text-[14px] text-[#1B2432] outline-none focus:border-[#ED351D]"
              />
              <span className="text-[12px] text-[#627084]">
                How many days the vehicle is expected to spend on the road. Past this, the dispatch reads
                Slight then Significant Delay automatically.
              </span>
            </label>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#1B2432]">Estimated dispatch date</span>
              <input
                type="date"
                value={estimateValue}
                onChange={(e) => setEstimateValue(e.target.value)}
                className="h-10 w-full rounded border border-[#E2E5E9] px-3 text-[14px] text-[#1B2432] outline-none focus:border-[#ED351D]"
              />
              {expectedReturnAt({
                ...(estimateTrip as Trip),
                estimatedDays: Number(estimateDays) || null,
                estimatedDate: estimateValue || null,
              }) ? (
                <span className="text-[12px] text-[#627084]">
                  Expected return:{" "}
                  {formatTableDate(
                    expectedReturnAt({
                      ...(estimateTrip as Trip),
                      estimatedDays: Number(estimateDays) || null,
                      estimatedDate: estimateValue || null,
                    })!.toISOString(),
                  )}
                </span>
              ) : null}
            </label>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeEstimate}
                className="text-[13px] font-medium text-[#627084] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEstimate}
                onClick={() => void saveEstimate()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {savingEstimate ? "Saving…" : estimateApproveAfter ? "Approve Dispatch" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendBackTrip && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[460px] rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-[16px] font-bold text-[#1B2432]">Clear and send back to Fleet Ops</h3>
            <p className="mt-1 text-[13px] text-[#5C6470]">
              Dispatch {dispatchId(sendBackTrip)} returns to Fleet Operations for re-assignment. Everything Fleet
              Ops set on it — truck head, tail, driver and the cost configuration — is cleared, so they start from
              scratch and can edit. Tell them what needs fixing; they see this reason on the dispatch.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              placeholder="e.g. Wrong tail for a Full Sided request — re-assign with a sided tail."
              className="mt-3 w-full rounded border border-[#E2E5E9] p-3 text-[13px] text-[#1B2432] outline-none focus:border-[#ED351D]"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSendBackTrip(null);
                  setSendBackNote("");
                }}
                className="text-[13px] font-medium text-[#627084] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingBack || !sendBackNote.trim()}
                onClick={() => void confirmSendBack()}
                className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {sendingBack ? "Sending…" : "Clear & Send Back"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <TmEditAssignmentModal
          trip={editing}
          heads={heads}
          tails={tails}
          drivers={drivers}
          trips={trips}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void tripService.list().then(setTrips);
            window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
          }}
        />
      )}
    </>
  );
}

/** Two-line date cell: date on top, time under it — never truncated. */
function DateCell({ value }: { value?: string | null }) {
  const { date, time } = formatDateLines(value);
  return (
    <span className="min-w-0 text-[14px] leading-4 text-[#5C6470]">
      {date}
      {time && <span className="block text-[12px] text-[#627084]">{time}</span>}
    </span>
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

