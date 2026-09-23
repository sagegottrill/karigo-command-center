import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download, Search, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayDispatchId as dispatchId } from "@/lib/fleetopsx/request-id";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import { canSeeTmPricing } from "@/lib/fleetopsx/active-role";
import {
  displayCapFromTrip,
  displayCapPlateFromTrip,
  displayPlateFromTrip,
} from "@/lib/fleetopsx/display-ids";
import { formatMovementStamp } from "@/lib/fleetopsx/display-dates";
import { hasAssignment } from "@/lib/fleetopsx/status-buckets";
import {
  listCheckpoints,
  loadingSiteProgress,
  normalizeLeg,
  stageDots,
  tripLoadingSites,
  type LocationCheckpoint,
  type TrackingLeg,
} from "@/lib/fleetopsx/tracking-ops";

/**
 * The assigned truck as the operators read it off the vehicle: cap code first,
 * plate in brackets — "P073 (APP857YL)", the same pairing the Transport
 * Manager's board and every printout use. Empty while nothing is assigned, so
 * a request still sitting with the TM never advertises a truck it does not
 * have.
 *
 * The pairing itself lives in `displayCapPlateFromTrip` — the gate log, the
 * Transport Manager's boards and this history all read the one rule, so the
 * same truck cannot be labelled two ways on two screens.
 */
function headCell(trip: Trip) {
  return displayCapPlateFromTrip(trip) || "—";
}
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { dispatchSearchText, matchesQuery } from "@/lib/fleetopsx/search-match";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/dispatch-history")({
  // Live JWT is browser-only — never SSR-fetch
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dispatch History | FleetOpsX" },
      { name: "description", content: "View and manage dispatch history records." },
    ],
  }),
  component: DispatchHistoryPage,
});

type DisplayStatus = "In Transit" | "Pending" | "Scheduled" | "Declined" | "Completed";

/**
 * The client asked for exactly three working states here — Scheduled, Pending,
 * Declined — with "All" kept only as the way back to the full list. In Transit
 * and Completed are deliberately dropped: the live ones are followed on Active
 * Dispatch and Live Tracking, not in a history filter.
 */
const HISTORY_STATUS_FILTERS = ["All", "Scheduled", "Pending", "Declined"] as const;

const STATUS_STYLES: Record<DisplayStatus, string> = {
  "In Transit": "bg-[#A259FF] text-white",
  Pending: "bg-[#FC0] text-[#1B2432]",
  // Booked and on the board, not yet moving — its own word, not "Pending":
  // the Transport Manager has already final-approved these, so calling them
  // pending read as work still waiting on somebody.
  Scheduled: "bg-[#007AFF] text-white",
  Declined: "bg-[#FF383C] text-white",
  Completed: "bg-[#34C759] text-white",
};

function toDisplayStatus(status: Trip["status"]): DisplayStatus {
  switch (status) {
    case "En Route":
    case "Loaded":
    case "Offloading":
    case "Returning":
    case "Delayed":
      return "In Transit";
    // Pending means exactly one thing for Fleet Ops: the Transport Manager has
    // not approved it yet. The moment he does — whether Fleet Ops has assigned a
    // truck yet or not — the dispatch is scheduled work, not a pending request.
    case "Requested":
    case "Draft":
      return "Pending";
    case "Approved":
    case "Approved for Dispatch":
    case "Awaiting Approval":
    case "Scheduled":
      return "Scheduled";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded px-3 text-[12px] font-medium tracking-[0.4px] shadow-[0px_1px_4px_rgba(12,12,13,0.1)]",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function formatHistoryDate(trip: Trip) {
  const raw = trip.scheduledDate?.trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return raw;
}

/** Sortable timestamp of the date this page shows, 0 when unreadable. */
function dateValue(trip: Trip) {
  const parsed = Date.parse(trip.scheduledDate ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function companyName(trip: Trip) {
  if (trip.customer && trip.customer !== "Customer Portal") return trip.customer;
  return trip.customerConsignee ?? "";
}

function formatN(num: number) {
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function DetailRow({ label, value }: { label: string; value?: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <span className="shrink-0 text-[#5C6470]">{label}</span>
      <span className="max-w-[58%] text-right font-semibold whitespace-pre-line text-[#1B2432]">{value}</span>
    </div>
  );
}

type StepState = "done" | "current" | "pending";

type TimelineStep = {
  label: string;
  state: StepState;
  /** The REAL stamp for this step. Absent when the step has not happened — a
   *  date under a step nobody reached reads as though it had happened. */
  at?: string;
  /** Tracking stage whose logged checkpoints hang under this step as sub-dots. */
  stage?: TrackingLeg;
  /** Plain-language note, e.g. the driver on the assignment step. */
  meta?: string;
};

/** Newest checkpoint logged against a stage, or nothing if Tracking has not been there yet. */
function newestCheckpoint(checkpoints: LocationCheckpoint[], stage: TrackingLeg): LocationCheckpoint | undefined {
  return checkpoints
    .filter((cp) => normalizeLeg(cp.leg) === stage)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .pop();
}

/**
 * The dispatch timeline, built from what actually happened.
 *
 * Every step is grounded in a real signal — the lifecycle stamps on the trip
 * (created / approved / assigned / released by the gate), the status ladder, and
 * the checkpoints the Tracking team logs — and a step only shows a date when
 * that date exists. The page used to render a fixed nine-step ladder with the
 * first six marked complete for every dispatch, so a request with no truck and
 * no driver still claimed "Driver Assigned, Loading, In Transit" with invented
 * Location 1–4 dots. Nothing here is invented: the steps ahead carry no date,
 * the sub-dots are Tracking's own checkpoint names, and a request still waiting
 * on the TM shows the approval it is waiting for.
 */
function fleetDispatchTimeline(trip: Trip, checkpoints: LocationCheckpoint[]): TimelineStep[] {
  // A declined request never went anywhere: stop at the decline rather than
  // drawing the road it never travelled.
  if (trip.status === "Stopped") {
    return [
      { label: "Request Submitted", state: "done", at: trip.createdAt },
      { label: "Request Declined", state: "current", at: trip.updatedAt ?? undefined },
    ];
  }

  const status = String(trip.status);
  const assigned = hasAssignment(trip);
  const leftYard = ["Loaded", "En Route", "Delayed", "Offloading", "Returning", "Completed"].includes(status);
  const moving = ["En Route", "Delayed", "Offloading", "Returning", "Completed"].includes(status);
  const arrived = ["Offloading", "Returning", "Completed"].includes(status);
  const offloaded = ["Returning", "Completed"].includes(status);
  const returned = status === "Completed";

  const loading = newestCheckpoint(checkpoints, "Loading");
  const transit = newestCheckpoint(checkpoints, "In Transit");
  const destination = newestCheckpoint(checkpoints, "At Destination");
  const offload = newestCheckpoint(checkpoints, "Offloaded");
  const back = newestCheckpoint(checkpoints, "Return");

  const steps: Array<Omit<TimelineStep, "state"> & { done: boolean }> = [
    { label: "Request Submitted", done: true, at: trip.createdAt },
    {
      label: "Request Approved",
      done: Boolean(trip.approvedAt) || assigned || leftYard,
      at: trip.approvedAt ?? undefined,
    },
    {
      label: "Truck & Driver Assigned",
      done: assigned,
      at: assigned ? (trip.assignedAt ?? undefined) : undefined,
      meta: assigned ? (trip.driverName && trip.driverName !== "Unassigned" ? trip.driverName : undefined) : undefined,
    },
    {
      label: "Left the Yard",
      done: Boolean(trip.dispatchedAt) || leftYard,
      at: trip.dispatchedAt ?? undefined,
    },
    { label: "Loading", done: leftYard || Boolean(loading), at: loading?.at, stage: "Loading" },
    { label: "In Transit", done: moving || Boolean(transit), at: transit?.at, stage: "In Transit" },
    {
      label: "At Destination",
      done: arrived || Boolean(destination),
      at: destination?.at,
      stage: "At Destination",
    },
    { label: "Offloaded", done: offloaded || Boolean(offload), at: offload?.at, stage: "Offloaded" },
    { label: "Returned", done: returned || Boolean(back), at: back?.at, stage: "Return" },
  ];

  // The furthest step actually reached is the one that happened last; the step
  // after it is the one being worked on, and everything beyond that is ahead.
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), 0);
  return steps.map((step, i) => ({
    ...step,
    state: i <= lastDone ? ("done" as const) : i === lastDone + 1 ? ("current" as const) : ("pending" as const),
  }));
}

function DispatchDetail({
  trip,
  driver,
  checkpoints,
  onBack,
}: {
  trip: Trip;
  driver?: Driver;
  checkpoints: LocationCheckpoint[];
  onBack: () => void;
}) {
  const displayStatus = toDisplayStatus(trip.status);
  // Fleet Ops configures litres, not price — the TM's fuel cost stays hidden.
  const showTmPricing = canSeeTmPricing(authService.getRoles());
  const sites = tripLoadingSites(trip);
  const timeline = fleetDispatchTimeline(trip, checkpoints);
  const siteProgress = loadingSiteProgress(sites, checkpoints);

  /**
   * Export THIS dispatch — its details and the timeline as it actually stands,
   * stamps and outstanding steps included. The button said "Import CSV" while
   * raising an "Exported" toast and writing no file at all.
   */
  const exportDispatch = () => {
    const rows: Array<[string, string]> = [
      ["Dispatch ID", dispatchId(trip)],
      ["Partner", companyName(trip)],
      ["Customer", trip.customerConsignee ?? ""],
      ["Product", trip.cargo],
      ["Truck Head", headCell(trip)],
      ["Body Type", trip.tailType ?? ""],
      ["Driver", driver?.name || trip.driverName || ""],
      ["Driver ID", driver?.employeeId ?? ""],
      ["Driver Phone", driver?.phone ?? ""],
      ["Loading Site(s)", sites.join(" • ")],
      ["Drop-off Location", trip.dropoff],
      ["Status", displayStatus],
      ["", ""],
      ["Step", "When"],
    ];
    for (const step of timeline) {
      rows.push([
        step.label,
        step.at ? formatMovementStamp(step.at) : step.state === "done" ? "Done (no stamp)" : "Not yet",
      ]);
      for (const dot of step.stage ? stageDots(step.stage, sites, checkpoints) : []) {
        rows.push([
          `    ${dot.label}`,
          dot.logged && dot.at ? formatMovementStamp(dot.at) : "outstanding",
        ]);
      }
    }
    const csv = rows.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch_${dispatchId(trip)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${dispatchId(trip)}.`);
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      {/* Figma 443:13089 — Export under title on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          <span className="hidden md:inline">Dispatch Details and Timeline</span>
          <span className="md:hidden">Dispatch Details and Timeline</span>
        </button>
        <button
          type="button"
          onClick={exportDispatch}
          className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex-1 overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] p-5">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Details</h2>
              <p className="mt-1 text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
                Ticket {dispatchId(trip)}
                {companyName(trip) ? `  •  ${companyName(trip)}` : ""}
              </p>
            </div>
            <StatusPill status={displayStatus} />
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
              <span className="text-[14px] font-bold text-[#1B2432]">Customer Details</span>
              <DetailRow label="Customer Name:" value={trip.customerConsignee} />
              <DetailRow label="Destination:" value={trip.dropoff} />
              <DetailRow
                label="Loading Site(s):"
                value={trip.loadingSite?.filter(Boolean).join("\n") || trip.pickup}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
              <span className="text-[14px] font-bold text-[#1B2432]">Vehicle & Operator Details</span>
              {/* truckReg is "PLATE / TAILCODE" — the head rows show the head's own
                  identifiers only; the tail lives on its own row. */}
              <DetailRow label="Truck Head (Cap Number):" value={displayCapFromTrip(trip)} />
              <DetailRow label="Truck Head Plate Number:" value={displayPlateFromTrip(trip)} />
              <DetailRow
                label="Truck Tail assigned:"
                value={
                  trip.tailNumber
                    ? trip.tailType && trip.tailNumber !== trip.tailType
                      ? `${trip.tailType} (${trip.tailNumber})`
                      : trip.tailNumber
                    : trip.tailType || undefined
                }
              />
              {/* The trip record carries only the driver's name (and their roster
                  id) — staff number and phone live on the roster. Until that
                  lookup existed here the phone row silently printed nothing on
                  every dispatch, assigned or not. */}
              <DetailRow label="Driver Assigned:" value={driver?.name || trip.driverName} />
              <DetailRow label="Driver ID:" value={driver?.employeeId} />
              <DetailRow label="Driver Contact Phone:" value={driver?.phone} />
            </div>

            {(trip.directCosts || typeof trip.totalCosts === "number") && (
              <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
                <span className="text-[14px] font-bold text-[#1B2432]">Expense Configuration Breakdown</span>
                {trip.directCosts && (
                  <>
                    <DetailRow label="Trip Allowance:" value={formatN(trip.directCosts.tripAllowance)} />
                    <DetailRow label="Return Waybill:" value={formatN(trip.directCosts.returnWaybill)} />
                    <DetailRow label="Motor Boy Allowance:" value={formatN(trip.directCosts.motorBoy)} />
                    <DetailRow label="Transit Road Tickets:" value={formatN(trip.directCosts.ticket)} />
                    <DetailRow label="Extra Contingency:" value={formatN(trip.directCosts.extraAllowance)} />
                    <DetailRow label="Bonus:" value={formatN(trip.directCosts.bonus ?? 0)} />
                    <DetailRow label="Lubricant:" value={trip.directCosts.lubricantType} />
                    {typeof trip.directCosts.lubricantQuantity === "number" ? (
                      <DetailRow label="Lubricant Quantity:" value={String(trip.directCosts.lubricantQuantity)} />
                    ) : null}
                    {showTmPricing && typeof trip.directCosts.lubricantCost === "number" ? (
                      <DetailRow label="Lubricant Cost:" value={formatN(trip.directCosts.lubricantCost)} />
                    ) : null}
                  </>
                )}
                {typeof trip.totalCosts === "number" && (
                  <>
                    <div className="h-px w-full bg-[#E2E5E9]" />
                    <div className="flex items-center justify-between gap-4 text-[14px] font-bold">
                      <span className="text-[#1B2432]">
                        Total Configured Expense{showTmPricing ? ":" : " (excl. fuel):"}
                      </span>
                      <span className="text-[#ED351D]">
                        {formatN(
                          showTmPricing
                            ? trip.totalCosts
                            : // Fleet Ops never sees the TM-priced fuel component.
                              trip.totalCosts - (trip.directCosts?.lubricantCost ?? 0),
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)] lg:max-w-[480px]">
          <div className="border-b border-[#E2E5E9] p-5">
            <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Timeline</h2>
          </div>
          <div className="p-4 md:p-5">
            <ol className="relative ml-2 space-y-0 border-l-2 border-[#E2E5E9] pl-6 md:ml-3 md:pl-7">
              {timeline.map((step) => {
                const done = step.state === "done";
                const current = step.state === "current";
                // Sub-dots are Tracking's own checkpoints. Loading lists every
                // site the request was raised with — the ones not yet collected
                // stay visible (hollow) so "1 of 2 sites loaded" is countable
                // instead of a site quietly disappearing.
                const dots = step.stage ? stageDots(step.stage, sites, checkpoints) : [];
                return (
                  <li key={step.label} className="relative pb-4 last:pb-0 md:pb-6">
                    <span
                      className={cn(
                        "absolute -left-[29px] top-0.5 size-3.5 rounded-full border-2 md:-left-[33px] md:size-4",
                        done
                          ? "border-[#ED351D] bg-[#ED351D]"
                          : current
                            ? "border-[#ED351D] bg-white"
                            : "border-[#D1D5DB] bg-white",
                      )}
                    >
                      {done ? <span className="absolute inset-[3px] rounded-full bg-white md:inset-1" /> : null}
                      {current ? (
                        <span className="absolute inset-[3px] rounded-full bg-[#ED351D] md:inset-1" />
                      ) : null}
                    </span>
                    <p
                      className={cn(
                        "text-[13px] font-bold",
                        done ? "text-[#ED351D]" : current ? "text-[#1B2432]" : "text-[#9CA3AF]",
                      )}
                    >
                      {step.label}
                      {current ? <span className="ml-2 text-[11px] font-medium text-[#5C6470]">in progress</span> : null}
                    </p>
                    {/* Only real stamps are printed: a step nobody reached carries
                        no date at all. */}
                    {step.at ? (
                      <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{formatMovementStamp(step.at)}</p>
                    ) : null}
                    {step.meta ? (
                      <p className="mt-0.5 text-[11px] font-medium text-[#5C6470]">{step.meta}</p>
                    ) : null}
                    {step.label === "Loading" && siteProgress ? (
                      <p className="mt-0.5 text-[11px] text-[#5C6470]">
                        {siteProgress.logged} of {siteProgress.total} site{siteProgress.total === 1 ? "" : "s"} loaded
                      </p>
                    ) : null}
                    {dots.length > 0 ? (
                      <ol className="relative mt-2 ml-1 space-y-2 border-l border-[#E2E5E9] pl-4 md:mt-3 md:ml-2 md:space-y-3 md:pl-5">
                        {dots.map((dot) => (
                          <li key={dot.key} className="relative">
                            <span
                              className={cn(
                                "absolute -left-[21px] top-1 size-2 rounded-full border md:-left-[23px]",
                                dot.logged ? "border-[#ED351D] bg-[#ED351D]" : "border-[#D1D5DB] bg-white",
                              )}
                            />
                            <p
                              className={cn(
                                "text-[12px] font-medium",
                                dot.logged ? "text-[#5C6470]" : "text-[#9CA3AF]",
                              )}
                            >
                              {dot.label}
                            </p>
                            {dot.at ? (
                              <p className="mt-0.5 text-[10px] text-[#9CA3AF]">{formatMovementStamp(dot.at)}</p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function DispatchHistoryPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  // The OPEN dispatch is held by id and re-read from the live list, so a truck
  // assigned, a gate departure or a delivery landing while somebody has the
  // detail open actually reaches the screen. It used to be a snapshot taken at
  // the moment of the click: the 10s refresh updated the table underneath while
  // the panel kept advertising "Unassigned" forever.
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [openedTrip, setOpenedTrip] = useState<Trip | null>(null);
  const [checkpoints, setCheckpoints] = useState<LocationCheckpoint[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof HISTORY_STATUS_FILTERS)[number]>("All");

  useEffect(() => {
    void tripService
      .list()
      .then(setTrips)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load dispatch history"))
      .finally(() => setLoading(false));
    void driverService.list().then(setDrivers).catch(() => {});
  }, []);

  // Near real-time: status changes (departed, returned, completed) appear live
  // on the history tables (10s poll + focus / tab-visible refresh).
  useAutoRefresh(() => {
    void tripService.list().then(setTrips).catch(() => {});
    void driverService.list().then(setDrivers).catch(() => {});
  });

  const openTrip = (trip: Trip) => {
    setOpenedTrip(trip);
    setSelectedTripId(trip.id);
  };

  const selectedTrip = useMemo(
    () => (selectedTripId ? (trips.find((t) => t.id === selectedTripId) ?? openedTrip) : null),
    [trips, selectedTripId, openedTrip],
  );

  // The Tracking team's checkpoints for the open dispatch. Polled, so a location
  // they log while the panel is open appears as a new sub-dot without a reload.
  useEffect(() => {
    if (!selectedTripId) {
      setCheckpoints([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void listCheckpoints(selectedTripId)
        .then((rows) => {
          if (!cancelled) setCheckpoints(rows);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedTripId]);

  /**
   * The driver behind a dispatch, resolved from the roster.
   *
   * A trip stores the driver's NAME plus the roster id, so everything else —
   * staff number, phone, licence — has to be looked up. That lookup was missing
   * here, which is why Fleet Ops could see "Driver Assigned: Unassigned" and an
   * empty phone line and nothing else about who was driving.
   */
  const driverFor = useMemo(() => {
    const key = (s: string | undefined | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    const byId = new Map<string, Driver>();
    const byName = new Map<string, Driver>();
    for (const d of drivers) {
      byId.set(d.id, d);
      const name = key(d.name);
      if (name) byName.set(name, d);
    }
    // Dispatches store the driver's NAME — the id is not carried on the trip in
    // practice — so the name is the real key, with the id tried first when a
    // row happens to have one. A name that matches nobody (a bare "MUSA" typed
    // onto an old dispatch) resolves to nothing rather than to another driver:
    // a wrong phone number on a dispatch is worse than a blank one.
    return (trip: Trip): Driver | undefined =>
      (trip.driverId ? byId.get(trip.driverId) : undefined) ?? byName.get(key(trip.driverName));
  }, [drivers]);

  const filteredTrips = useMemo(() => {
    const rows = trips.filter((t) => {
      if (statusFilter !== "All" && toDisplayStatus(t.status) !== statusFilter) return false;
      // The shared matcher, so what is typed finds what is on screen: the
      // dispatch id as shown, every column's text, the date as displayed, and
      // the truck/driver numbers however they are punctuated.
      const hay = [
        dispatchId(t),
        formatHistoryDate(t),
        companyName(t),
        toDisplayStatus(t.status),
        t.status,
        t.driverName ?? "",
        headCell(t),
      ].join(" ");
      return matchesQuery(`${hay} ${dispatchSearchText(t)}`, searchQuery);
    });
    // Pending sits on top — it is the only thing on this page still waiting on
    // somebody (the Transport Manager). Everything already approved reads
    // Scheduled below it, newest first, same as the working queues.
    return rows.sort((a, b) => {
      const rank = (t: Trip) => (toDisplayStatus(t.status) === "Pending" ? 0 : 1);
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return dateValue(b) - dateValue(a);
    });
  }, [trips, searchQuery, statusFilter]);

  const exportCSV = () => {
    const headers =
      "Date,Company,Customer,Product,Truck Head,Body Type,Destination,Dispatch ID,Status,Driver,Driver ID,Driver Phone\n";
    const csv = filteredTrips
      .map((t) => {
        const driver = driverFor(t);
        return `${formatHistoryDate(t)},${companyName(t)},${t.customerConsignee ?? ""},${t.cargo},${headCell(t)},${t.tailType ?? ""},${t.dropoff},${dispatchId(t)},${toDisplayStatus(t.status)},${driver?.name || t.driverName || ""},${driver?.employeeId ?? ""},${driver?.phone ?? ""}`;
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dispatch_history.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  if (selectedTrip) {
    return (
      <DispatchDetail
        trip={selectedTrip}
        driver={driverFor(selectedTrip)}
        checkpoints={checkpoints}
        onBack={() => {
          setSelectedTripId(null);
          setOpenedTrip(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <FigmaLoadingState label="Loading dispatch history…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Dispatch History</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manage and track live fleet status.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">History</h3>
            <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white">
              {filteredTrips.length}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative w-full max-w-[400px] min-w-[200px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={HISTORY_STATUS_FILTERS}
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
              }}
              allLabel="All Statuses"
            />
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(100px,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(96px,0.8fr)_auto] items-center gap-x-4 border-b border-[#E2E5E9] py-2.5 md:grid">
          {/* This column is the body the load rides in (Flat, Flatbed Tail, Side
              Guide) — calling it "Head Type" made operators read it as the cab. */}
          {["Date", "Company", "Customer", "Product", "Truck Head", "Body Type", "Drop-off Location", "Dispatch ID", "Status"].map((h) => (
            <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 md:hidden">
          {filteredTrips.map((trip) => {
            const status = toDisplayStatus(trip.status);
            return (
              <button
                key={`m-${trip.id}`}
                type="button"
                onClick={() => openTrip(trip)}
                className="flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 text-left shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold capitalize tracking-[0.4px] text-[#303D50]">
                    {formatHistoryDate(trip) || "—"}
                  </span>
                  <StatusPill status={status} />
                </div>
                <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">{companyName(trip) || "—"}</p>
                <div className="flex flex-col gap-1 text-[12px]">
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Customer:</span>
                    <span className="flex-1 text-[#344256]">{trip.customerConsignee || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Product:</span>
                    <span className="flex-1 text-[#344256]">{trip.cargo || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Truck Head:</span>
                    <span className="flex-1 text-[#344256]">{headCell(trip)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Driver:</span>
                    <span className="flex-1 text-[#344256]">
                      {driverFor(trip)?.name || trip.driverName || "—"}
                      {driverFor(trip)?.phone ? ` · ${driverFor(trip)!.phone}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Drop-off Location:</span>
                    <span className="flex-1 text-[#344256]">{trip.dropoff || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Dispatch ID:</span>
                    <span className="flex-1 font-semibold text-[#344256]">{dispatchId(trip)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="hidden md:block">
          {filteredTrips.map((trip) => {
            const status = toDisplayStatus(trip.status);
            return (
              <button
                key={trip.id}
                type="button"
                onClick={() => openTrip(trip)}
                className="grid w-full grid-cols-[minmax(100px,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(96px,0.8fr)_auto] items-center gap-x-4 border-b border-[#E2E5E9] py-2.5 text-left last:border-b-0"
              >
                <span className="truncate text-[14px] font-semibold capitalize tracking-[0.4px] text-[#5C6470]">{formatHistoryDate(trip)}</span>
                <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{companyName(trip)}</span>
                <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.customerConsignee || "—"}</span>
                <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.cargo}</span>
                <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">{headCell(trip)}</span>
                <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.tailType}</span>
                <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{dispatchId(trip)}</span>
                <StatusPill status={status} />
              </button>
            );
          })}
        </div>

        {filteredTrips.length === 0 && (
          <FigmaEmptyState
            title={searchQuery ? "No matching dispatch history" : "No dispatch history yet"}
            body={
              searchQuery
                ? "Try a different dispatch ID, company, or destination."
                : "Completed and in-progress dispatches will appear here."
            }
          />
        )}
      </div>
    </div>
  );
}
