import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ArrowBigRight, Check, ChevronLeft, ChevronRight, ListFilter, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayCapFromTrip, displayPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import { dispatchSearchText, matchesQuery } from "@/lib/fleetopsx/search-match";
import {
  listCheckpoints,
  loadingSiteProgress,
  partnerOf,
  stageDots,
  tripLoadingSites,
  type LocationCheckpoint,
} from "@/lib/fleetopsx/tracking-ops";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import { canLogLoading, canLogTracking } from "@/lib/fleetopsx/active-role";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import {
  dispatchDisplayId,
  getTrackingDelayStatus,
  isActiveDispatchTrip,
  sortLatestFirst,
  TRACKING_DELAY_COLOR,
  type TrackingDelayStatus,
} from "@/lib/fleetopsx/tracking-ops";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

function headCell(trip: Trip) {
  const cap = displayCapFromTrip(trip);
  const plate = displayPlateFromTrip(trip);
  if (cap && plate) return `${cap} (${plate})`;
  return cap || plate || "";
}

export const Route = createFileRoute("/workspace/app/active-dispatch/")({
  // Same audience as the dispatch detail page: TM and Fleet Ops track trucks
  // here alongside Tracking Ops, Security and Platform Admin.
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Security", "Tracking", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Active Dispatch | Live Tracking" },
      {
        name: "description",
        content:
          "Track every active dispatch — the journey, and each loading site as it is collected.",
      },
    ],
  }),
  component: ActiveDispatchPage,
});

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).
const FILTERS = ["All", "On Schedule", "Slight delay", "Significant Delay"] as const;
type FilterTab = (typeof FILTERS)[number];

function ActiveDispatchPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [partner, setPartner] = useState<string>("All partners");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("All");
  const [page, setPage] = useState(0);
  // Every checkpoint the board's visible rows have, keyed by dispatch. The latest
  // one answers "where is that truck right now?", and the Loading ones answer the
  // loading department's own question — "how much of this load is collected, and
  // which sites are still outstanding?" — from the same fetch, so the two columns
  // can never disagree.
  const [checkpointsByTrip, setCheckpointsByTrip] = useState<Record<string, LocationCheckpoint[]>>({});
  const lastStopOf = (tripId: string) => checkpointsByTrip[tripId]?.[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [allTrips, allDrivers] = await Promise.all([tripService.list(), driverService.list()]);
        if (cancelled) return;
        setTrips(allTrips.filter(isActiveDispatchTrip).sort(sortLatestFirst));
        setDrivers(allDrivers);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load active dispatches");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Near real-time: board tracks moving trucks — 10s poll (+ focus / visible).
  useAutoRefresh(() => {
    void (async () => {
      try {
        const [allTrips, allDrivers] = await Promise.all([tripService.list(), driverService.list()]);
        setTrips(allTrips.filter(isActiveDispatchTrip).sort(sortLatestFirst));
        setDrivers(allDrivers);
      } catch {
        /* keep last good data */
      }
    })();
  });

  const phoneByDriverId = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.phone);
    return map;
  }, [drivers]);

  // FO assignment stores driver NAME only — resolve phones by name too.
  const phoneByDriverName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.name.trim().toLowerCase(), d.phone);
    return map;
  }, [drivers]);

  // The page is shared by three kinds of visitor, and the wording has to match
  // what each of them can actually do here: Tracking logs the whole journey, the
  // Loading department marks collection (which is a checkpoint too — the same
  // record, so a site marked loaded here is loaded for everyone), and TM / Fleet
  // Ops / Security only ever read them.
  const roles = authService.getRoles();
  const logsJourney = canLogTracking(roles);
  const logsLoading = !logsJourney && canLogLoading(roles);
  const locationActionLabel = logsJourney ? "Log Location" : logsLoading ? "Log Loading" : "View Location";
  const pageBlurb = logsJourney
    ? "Monitor active dispatches and manually log location checkpoints"
    : logsLoading
      ? "Track every active dispatch and mark each loading site as it is collected"
      : "Track every active dispatch and its location history";

  const phoneFor = (trip: Trip) => {
    const byId = trip.driverId ? phoneByDriverId.get(trip.driverId) : undefined;
    if (byId) return byId;
    const name = trip.driverName?.trim().toLowerCase();
    return (name && phoneByDriverName.get(name)) || "";
  };

  const partners = useMemo(() => {
    const seen = new Set<string>();
    for (const trip of trips) {
      const name = partnerOf(trip);
      if (name) seen.add(name);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((trip) => {
      const delay = getTrackingDelayStatus(trip);
      if (filter !== "All" && delay !== filter) return false;
      // Partner filter — "show me Saba's trucks" without typing a search.
      if (partner !== "All partners" && partnerOf(trip) !== partner) return false;
      if (!q) return true;
      // What a dispatcher or loader actually types: the truck's cap code, its
      // plate, the driver, the loading site the truck is bound for. Spacing and
      // punctuation in the query are ignored, so "KSF 72 YF" finds "KSF72YF".
      const hay = [
        dispatchDisplayId(trip),
        dispatchSearchText(trip),
        displayCapFromTrip(trip),
        displayPlateFromTrip(trip),
        partnerOf(trip),
        tripLoadingSites(trip).join(" "),
        getTrackingDelayStatus(trip),
        phoneFor(trip),
      ]
        .filter(Boolean)
        .join(" ");
      return matchesQuery(hay, q);
    });
  }, [trips, search, filter, partner, phoneByDriverId, phoneByDriverName]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, filter, partner]);

  /**
   * The board's "Last Seen" column.
   *
   * The API only serves checkpoints one trip at a time (GET /tracking/:tripId —
   * there is no bulk route), so only the rows actually on screen are fetched.
   * Logging a checkpoint does not touch the trip row, so the 10s trips poll can
   * never reveal it: this refreshes on its own slower cadence, plus the moment the
   * tab is brought back into view.
   */
  const visibleIds = pageRows.map((trip) => trip.id).join(",");
  useEffect(() => {
    const ids = visibleIds ? visibleIds.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const rows = await Promise.all(
        ids.map(async (id) => {
          const list = await listCheckpoints(id).catch(() => [] as LocationCheckpoint[]);
          return [id, list] as const;
        }),
      );
      if (cancelled) return;
      setCheckpointsByTrip((prev) => {
        const next = { ...prev };
        for (const [id, list] of rows) next[id] = list;
        return next;
      });
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [visibleIds]);

  const exportCsv = async () => {
    if (filtered.length === 0) {
      toast.message("Nothing to export");
      return;
    }
    // The export covers every page, so fetch the checkpoints that were never on
    // screen — the file must not disagree with what the board shows.
    const stops = await Promise.all(
      filtered.map(async (trip) => {
        const known = checkpointsByTrip[trip.id];
        if (known !== undefined) return [trip.id, known] as const;
        const list = await listCheckpoints(trip.id).catch(() => [] as LocationCheckpoint[]);
        return [trip.id, list] as const;
      }),
    );
    const stopsById = new Map(stops);
    const header = [
      "Dispatch ID",
      "Driver",
      "Truck Head",
      "Tail Type",
      "Phone Number",
      "Loading Site(s)",
      "Loading Progress",
      "Drop-off Location",
      "Last Location",
      "Last Location Time",
      "Status",
    ];
    const lines = filtered.map((trip) => {
      const delay = getTrackingDelayStatus(trip);
      const list = stopsById.get(trip.id) ?? [];
      const stop = lastStopLabel(list[0] ?? null);
      const progress = loadingSiteProgress(tripLoadingSites(trip), list);
      return [
        dispatchDisplayId(trip),
        trip.driverName ?? "",
        headCell(trip),
        trip.tailType ?? "",
        phoneFor(trip),
        tripLoadingSites(trip).join(" | "),
        progress ? `${progress.logged} of ${progress.total} site(s) loaded` : "",
        trip.dropoff ?? "",
        stop.place,
        stop.when,
        delay,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "active-dispatch.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[30px] md:p-[30px]">
        <FigmaLoadingState label="Loading active dispatches…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-1 md:hidden">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F]">Active Dispatch</h2>
        <p className="text-[12px] text-[#5C6470]">{pageBlurb}</p>
      </div>

      <div className="hidden items-center justify-between md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Active Dispatch</h2>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            {pageBlurb}
          </p>
        </div>
      </div>

      <p className="hidden text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[#1B2432] md:block">
        MANUALLY LOG LOCATION CHECKPOINTS
      </p>

      <button
        type="button"
        onClick={exportCsv}
        className="flex h-8 w-[123px] items-center gap-[5px] rounded bg-[#1B2432] px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-white md:hidden"
      >
        <Upload className="size-[18px]" strokeWidth={1.5} />
        Export CSV
      </button>

      <div className="flex flex-col gap-[15px] border-b border-[#E2E5E9] pb-[5px] md:hidden">
        <div className="flex items-center gap-5">
          <div className="flex h-9 flex-1 items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
            <Search className="size-[22px] shrink-0 text-[#5C6470]" strokeWidth={1.5} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dispatch, truck (plate or cap), driver…"
              className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="grid size-9 place-items-center rounded bg-[#ED351D] hover:bg-[#d62e19]"
          >
            <ListFilter className="size-5 text-white" strokeWidth={1.5} />
          </button>
        </div>
        {filterOpen && (
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setFilterOpen(false);
                }}
                className={cn(
                  "rounded px-3 py-1 text-[12px]",
                  filter === f ? "bg-[#1B2432] text-white" : "bg-[#E2E5E9]/50 text-[#141A1F]",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        {partners.length > 1 ? (
          <select
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            aria-label="Filter by partner"
            className="h-9 w-full cursor-pointer rounded border border-[rgba(92,100,112,0.6)] bg-white px-3 text-[13px] font-medium text-[#1B2432] outline-none"
          >
            {["All partners", ...partners].map((name) => (
              <option key={name} value={name} className="bg-white text-[#1B2432]">
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <StatusLegend mobile />
      </div>

      <div className="hidden overflow-hidden rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)] md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="flex h-9 w-[320px] items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
              <Search className="size-[22px] shrink-0 text-[#5C6470]" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dispatch, truck (plate or cap), driver…"
                className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            {partners.length > 1 ? (
              <select
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                aria-label="Filter by partner"
                className="h-9 cursor-pointer rounded border border-[rgba(92,100,112,0.6)] bg-white px-3 text-[13px] font-medium text-[#1B2432] shadow-[0px_4px_10px_rgba(0,0,0,0.05)] outline-none"
              >
                {["All partners", ...partners].map((name) => (
                  <option key={name} value={name} className="bg-white text-[#1B2432]">
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                className="grid size-9 place-items-center rounded bg-[#ED351D] hover:bg-[#d62e19]"
              >
                <ListFilter className="size-5 text-white" strokeWidth={1.5} />
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-11 z-20 min-w-[180px] rounded border border-[#E2E5E9] bg-white p-2 shadow-lg">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFilter(f);
                        setFilterOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded px-3 py-2 text-left text-[13px]",
                        filter === f ? "bg-[#1B2432] text-white" : "hover:bg-[#F1F2F4]",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <StatusLegend />
        </div>

        {filtered.length === 0 ? (
          <FigmaEmptyState title="No active dispatches" body="Trips currently on the road will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">                <table className="w-full min-w-[1170px] border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E9] text-left text-[12px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                    <th className="px-3 py-3">Dispatch ID</th>
                    <th className="px-3 py-3">Driver</th>
                    <th className="px-3 py-3">Truck Head</th>
                    <th className="px-3 py-3">Tail Type</th>
                    <th className="px-3 py-3">Phone Number</th>
                    <th className="px-3 py-3">Loading Site(s)</th>
                    <th className="px-3 py-3">Loading</th>
                    <th className="px-3 py-3">Drop-off Location</th>
                    <th className="px-3 py-3">Last Location</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((trip) => {
                    const delay = getTrackingDelayStatus(trip);
                    return (
                      <tr key={trip.id} className="border-b border-[#E2E5E9] text-[14px] text-[#1B2432]">
                        <td className="px-3 py-4 font-semibold tracking-[0.4px]">{dispatchDisplayId(trip)}</td>
                        <td className="px-3 py-4">{trip.driverName || ""}</td>
                        <td className="px-3 py-4">{headCell(trip)}</td>
                        <td className="px-3 py-4">{trip.tailType || ""}</td>
                        <td className="px-3 py-4">{phoneFor(trip)}</td>
                        <td className="px-3 py-4" title={tripLoadingSites(trip).join(", ") || undefined}>
                          {loadingSitesLabel(trip)}
                        </td>
                        <td className="px-3 py-4">
                          <LoadingProgressCell trip={trip} checkpoints={checkpointsByTrip[trip.id]} />
                        </td>
                        <td className="px-3 py-4">{trip.dropoff || ""}</td>
                        <td className="px-3 py-4">
                          <LastStopCell checkpoint={lastStopOf(trip.id)} />
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className="inline-block size-3 rounded-full"
                            style={{ backgroundColor: TRACKING_DELAY_COLOR[delay] }}
                            title={delay}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/workspace/app/active-dispatch/$dispatchId",
                                params: { dispatchId: trip.id },
                              })
                            }
                            className="inline-flex items-center gap-[5px] rounded bg-[#1B2432] px-2.5 py-1.5 text-[12px] font-medium text-white"
                          >
                            {locationActionLabel}
                            <ArrowBigRight className="size-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[14px] text-[#5C6470]">
                <span>
                  {from} - {to} of {filtered.length}
                </span>
                <button
                  type="button"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded border border-[#E2E5E9] disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded border border-[#E2E5E9] disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-8 items-center gap-[5px] rounded bg-[#1B2432] px-[7px] text-[14px] font-medium text-white"
              >
                <Upload className="size-[18px]" strokeWidth={1.5} />
                Export CSV
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {filtered.length === 0 ? (
          <FigmaEmptyState title="No active dispatches" body="Trips currently on the road will appear here." />
        ) : (
          pageRows.map((trip) => {
            const delay = getTrackingDelayStatus(trip);
            return (
              <div
                key={trip.id}
                className="flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-[10px] rounded-full"
                      style={{ backgroundColor: TRACKING_DELAY_COLOR[delay] }}
                    />
                    <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">
                      {dispatchDisplayId(trip)}
                    </span>
                  </div>
                  <Link
                    to="/workspace/app/active-dispatch/$dispatchId"
                    params={{ dispatchId: trip.id }}
                    className="inline-flex items-center gap-[5px] rounded bg-[#1B2432] px-2.5 py-1 text-[10px] font-medium text-white"
                  >
                    {locationActionLabel}
                    <ArrowBigRight className="size-3.5" strokeWidth={1.5} />
                  </Link>
                </div>
                <MetaRow label="Driver:" value={trip.driverName || ""} />
                <MetaRow label="Head No:" value={headCell(trip)} accent />
                {/* The BODY comes from the tail, not the head — mislabelling it
                    "Head Type" made operators read it as the truck's own type. */}
                <MetaRow label="Tail Type:" value={trip.tailType || ""} />
                <MetaRow label="Phone No:" value={phoneFor(trip)} />
                <MetaRow label="Loading Site(s):" value={loadingSitesLabel(trip)} />
                {/* How much of the load is collected — the mobile card's own copy of
                    the board's Loading column. */}
                <MetaRow
                  label="Loading:"
                  value={loadingProgressLabel(trip, checkpointsByTrip[trip.id])}
                  accent={isLoadingComplete(trip, checkpointsByTrip[trip.id])}
                />
                <MetaRow
                  label="Last Seen:"
                  value={lastStopRowLabel(lastStopOf(trip.id))}
                  accent={Boolean(lastStopOf(trip.id))}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Compact loading-site label for the board: the single site by name, or
 * "first +N" for a multiple-loading request (the full list lives on the detail).
 */
function loadingSitesLabel(trip: Trip): string {
  const sites = tripLoadingSites(trip);
  if (sites.length === 0) return "—";
  const first = sites[0] ?? "—";
  return sites.length === 1 ? first : `${first} +${sites.length - 1}`;
}

/**
 * The last place a truck was logged, split for a table cell: the place on its
 * own line and a compact time underneath. Today's checkpoints drop the date
 * ("09:12"), older ones keep a short day ("18 Sept 09:12") — so a stale entry is
 * visible as stale rather than looking like it just happened.
 */
function lastStopLabel(checkpoint?: LocationCheckpoint | null): { place: string; when: string } {
  const place = (checkpoint?.location || "").trim();
  if (!place) return { place: "—", when: "" };
  const at = checkpoint?.at ? new Date(checkpoint.at) : null;
  if (!at || Number.isNaN(at.getTime())) return { place, when: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const sameDay = at.toDateString() === new Date().toDateString();
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { place, when: sameDay ? clock : `${day} ${clock}` };
}

/** The same value on one line, for the mobile card. */
function lastStopRowLabel(checkpoint?: LocationCheckpoint | null): string {
  const { place, when } = lastStopLabel(checkpoint);
  if (place === "—") return "No checkpoint logged yet";
  return when ? `${place} · ${when}` : place;
}

/** "2 of 3 sites" for a multi-loading request, or null when there is nothing to count. */
function loadingProgressOf(trip: Trip, checkpoints?: LocationCheckpoint[]) {
  const sites = tripLoadingSites(trip);
  if (sites.length === 0) return null;
  return loadingSiteProgress(sites, checkpoints ?? []);
}

function isLoadingComplete(trip: Trip, checkpoints?: LocationCheckpoint[]) {
  const progress = loadingProgressOf(trip, checkpoints);
  return Boolean(progress && progress.total > 0 && progress.logged === progress.total);
}

function loadingProgressLabel(trip: Trip, checkpoints?: LocationCheckpoint[]) {
  const progress = loadingProgressOf(trip, checkpoints);
  return progress ? `${progress.logged} of ${progress.total} site(s)` : "—";
}

/**
 * "Loading" cell — how much of the load is collected.
 *
 * The Loading department's whole job in one column: which sites are done and how
 * many are left, so a loader can see at a glance whether the next truck is theirs
 * and what is still outstanding. It reads the SAME checkpoints the Last Location
 * column reads, so a site marked loaded by Tracking and one marked loaded by
 * Loading are counted identically — one record, one number.
 */
function LoadingProgressCell({
  trip,
  checkpoints,
}: {
  trip: Trip;
  checkpoints?: LocationCheckpoint[];
}) {
  const sites = tripLoadingSites(trip);
  if (sites.length === 0) return <span className="text-[#5C6470]">—</span>;
  const list = checkpoints ?? [];
  const progress = loadingSiteProgress(sites, list);
  if (!progress) return <span className="text-[#5C6470]">—</span>;
  // stageDots leads with one dot per requested site, in request order, so the
  // outstanding ones are simply the un-logged entries at the head of that list.
  const outstanding = stageDots("Loading", sites, list)
    .slice(0, sites.length)
    .filter((dot) => !dot.logged)
    .map((dot) => dot.label);
  const done = progress.logged === progress.total;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium tracking-[0.4px]",
        done ? "bg-[#0ACF83]/15 text-[#0B7A4E]" : "bg-[#FC0]/20 text-[#1B2432]",
      )}
      title={
        done
          ? `All ${progress.total} site(s) loaded`
          : `Loaded: ${progress.logged} of ${progress.total} — still outstanding: ${outstanding.join(", ")}`
      }
    >
      {done ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
      {progress.logged}/{progress.total}
    </span>
  );
}

/** "Last Location" cell — place over time, with the leg it was logged against on hover. */
function LastStopCell({ checkpoint }: { checkpoint?: LocationCheckpoint | null }) {
  const { place, when } = lastStopLabel(checkpoint);
  if (place === "—") {
    return <span className="text-[13px] text-[#5C6470]">—</span>;
  }
  return (
    <span
      className="flex flex-col leading-tight"
      title={checkpoint ? `${checkpoint.leg}${when ? ` · ${when}` : ""}` : undefined}
    >
      <span className="font-medium">{place}</span>
      {when ? <span className="text-[11.4px] text-[#5C6470]">{when}</span> : null}
    </span>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-medium text-[#5C6470]">{label}</span>
      <span className={cn("min-w-0 flex-1", accent ? "font-semibold text-[#ED351D]" : "text-[#344256]")}>{value}</span>
    </div>
  );
}

function StatusLegend({ mobile = false }: { mobile?: boolean }) {
  const items: { label: TrackingDelayStatus; color: string }[] = [
    { label: "On Schedule", color: TRACKING_DELAY_COLOR["On Schedule"] },
    { label: "Slight delay", color: TRACKING_DELAY_COLOR["Slight delay"] },
    { label: "Significant Delay", color: TRACKING_DELAY_COLOR["Significant Delay"] },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", !mobile && "gap-5")}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-[9px]">
          <span className="size-[10px] rounded-full md:size-3" style={{ backgroundColor: item.color }} />
          <span
            className={cn(
              "font-medium tracking-[0.4px]",
              mobile ? "text-[12px]" : "text-[14px] text-[#5C6470]",
              mobile && item.label === "On Schedule" && "text-[#0ACF83]",
              mobile && item.label === "Slight delay" && "text-[#F99E1F]",
              mobile && item.label === "Significant Delay" && "text-[#FF7262]",
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
