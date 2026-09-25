import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronDown, MapPin, MapPinCheck, Phone, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayCapFromTrip,
  displayCapPlateFromTrip,
  displayDriverAssigned,
  displayPlateFromTrip,
  humanCode,
} from "@/lib/fleetopsx/display-ids";
import { driverForTrip, type TripDriverMatch } from "@/lib/fleetopsx/driver-duty";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import {
  canLogTracking as canLogTrackingRole,
  loggableLegs as loggableLegsFor,
} from "@/lib/fleetopsx/active-role";
import {
  addCheckpoint,
  dispatchDisplayId,
  getTrackingDelayStatus,
  listCheckpoints,
  loadingSiteProgress,
  normalizeLeg,
  normalizeSiteKey,
  stageDots,
  TRACKING_DELAY_COLOR,
  TRACKING_LEGS,
  tripLoadingSites,
  type LocationCheckpoint,
  type TrackingDelayStatus,
  type TrackingLeg,
} from "@/lib/fleetopsx/tracking-ops";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { dispatchFields, printDispatch } from "@/components/fleetopsx/dispatch-details-modal";
import { completeTripReturn } from "@/lib/fleetopsx/return-trip";
import { canSeeTmPricing } from "@/lib/fleetopsx/active-role";
import { expectedReturnAt, tripDelay } from "@/lib/fleetopsx/trip-duration";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/active-dispatch/$dispatchId")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = [
      "Transport Manager",
      "Fleet Operations",
      "Security",
      "Tracking",
      "Loading",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [{ title: "Log Location | Tracking Ops" }],
  }),
  component: LogLocationPage,
});

const STATUS_OPTIONS: TrackingDelayStatus[] = ["On Schedule", "Slight delay", "Significant Delay"];

function LogLocationPage() {
  const { dispatchId } = Route.useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  // The roster row behind the dispatch AND how it was found — a driver resolved
  // from the truck rather than the name is said to be that, not presented as the
  // name the dispatch itself carries.
  const [driverMatch, setDriverMatch] = useState<TripDriverMatch | null>(null);
  const driver = driverMatch?.driver ?? null;
  const [loading, setLoading] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [delayStatus, setDelayStatus] = useState<TrackingDelayStatus>("On Schedule");
  const [leg, setLeg] = useState<TrackingLeg>("Loading");
  const [legOpen, setLegOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [checkpoints, setCheckpoints] = useState<LocationCheckpoint[]>([]);
  const [saving, setSaving] = useState(false);
  // Ending the trip is destructive (it closes the dispatch and sends the truck to
  // Check Up), so it asks once before it runs.
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next: Trip | null = await tripService.get(dispatchId).catch(() => null);
        if (!next) {
          const all = await tripService.list();
          next = all.find((t) => t.id === dispatchId) ?? null;
        }
        if (cancelled) return;
        if (!next) {
          toast.error("Dispatch not found");
          navigate({ to: "/workspace/app/active-dispatch" });
          return;
        }
        setTrip(next);
        setDelayStatus(getTrackingDelayStatus(next));
        setCheckpoints(await listCheckpoints(next.id));
        // The driver behind this dispatch, resolved from the roster: FO
        // assignments store the name as it was typed and no id at all, so the
        // rules (and why they never guess between two men) live in `driverForTrip`.
        if (next.driverId || next.driverName?.trim()) {
          void driverService
            .list()
            .then((drivers: Driver[]) => {
              if (cancelled) return;
              const match = driverForTrip(next!, drivers);
              if (match) setDriverMatch(match);
            })
            .catch(() => {});
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load dispatch");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatchId, navigate]);

  /**
   * Roles decide the whole shape of this page (Tracking logs the journey, Loading
   * logs collection, everyone else only views), so they are read as HOOKS-LEVEL
   * data here — above the loading / not-found early returns below.
   *
   * They used to sit after those returns, which made the tab-title useEffect
   * conditional: the first render bailed out at "Loading dispatch…" before reaching
   * the hook, the next render called it, and React threw #310 (more hooks than the
   * previous render) the moment the dispatch loaded — the page died on arrival.
   */
  const roles = authService.getRoles();
  const canLogTracking = canLogTrackingRole(roles);
  const loggableLegs = loggableLegsFor(roles, TRACKING_LEGS);
  const canLogAnything = loggableLegs.length > 0;
  const loadingOnly = canLogAnything && !canLogTracking;
  /**
   * Who may CLOSE the trip. Tracking and Security are the two who physically see
   * the truck come back; the Loading department only marks collection and has no
   * view of the return at all. A trip that is already over (Completed) or was
   * declined (Stopped) is never offered the button again.
   */
  const CLOSING_ROLES = ["Tracking", "Tracking Operations", "Security", "Platform Admin"];
  const canCloseTrip =
    roles.some((r: string) => CLOSING_ROLES.includes(String(r))) &&
    trip?.status !== "Completed" &&
    trip?.status !== "Stopped";
  // The tab title follows the same rule — a viewer's page is not "Log Location".
  useEffect(() => {
    document.title = canLogTracking
      ? "Log Location | Tracking Ops"
      : loadingOnly
        ? "Log Loading | Loading Ops"
        : "Track Location | Dispatch";
  }, [canLogTracking, loadingOnly]);

  /**
   * Status dropdown is a TRACKING LABEL, not a trip-status write. Changing it
   * used to PATCH the trip to Delayed/Stopped — which silently re-bucketed the
   * trip and made it vanish from the Tracking Operations board (Stopped-without-
   * truck = Declined). Tracking reports observations; only FO/TM change the
   * lifecycle status.
   */
  const applyStatus = (next: TrackingDelayStatus) => {
    setDelayStatus(next);
    setStatusOpen(false);
    toast.success(`Tracking status noted: ${next}`);
  };

  /**
   * Close the trip — the truck is back, so the circle is over. This is the end
   * point the Tracking department never had: the dispatch leaves the active board
   * (it is no longer a truck that is out) and the head and tail go to Check Up via
   * the same shared routine Security's gate uses.
   */
  const closeTrip = async () => {
    if (!trip) return;
    setClosing(true);
    try {
      const { marked } = await completeTripReturn(trip);
      toast.success(
        marked
          ? `${dispatchDisplayId(trip)} closed — the truck is back and on Check Up.`
          : `${dispatchDisplayId(trip)} closed — the truck is back.`,
      );
      setConfirmClose(false);
      navigate({ to: "/workspace/app/active-dispatch" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end the trip");
    } finally {
      setClosing(false);
    }
  };

  const saveLocation = async () => {
    if (!trip) return;
    if (!location.trim()) {
      toast.error("Add current location");
      return;
    }
    setSaving(true);
    try {
      const row = await addCheckpoint({ tripId: trip.id, location: location.trim(), leg });
      // One source of truth: if the other department already logged this exact
      // stage + place, the API returns THAT entry instead of a duplicate. Say so
      // rather than silently pretending a new one was written.
      const alreadyLogged = Boolean((row as { duplicate?: boolean }).duplicate);
      setCheckpoints((prev) =>
        alreadyLogged
          ? prev.map((cp) => (cp.id === row.id ? row : cp))
          : [row, ...prev.filter((cp) => cp.id !== row.id)],
      );
      setLocation("");
      if (alreadyLogged) {
        toast.info(`${row.location} was already logged — nothing was duplicated.`);
      } else {
        toast.success(loadingOnly ? "Site marked as loaded" : "Location checkpoint saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save checkpoint");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:p-[30px]">
        <FigmaLoadingState label="Loading dispatch…" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-[30px]">
        <FigmaEmptyState title="Dispatch not found" body="Return to Tracking Operations and try again." />
      </div>
    );
  }

  const company =
    trip.customer && trip.customer !== "Customer Portal" ? trip.customer : trip.customerConsignee || "";
  // A multiple-loading request lists every site the truck must collect, in
  // order. Tracking logs them one by one, so the site list drives both the log
  // form (pick which site you are at) and the history (what is still outstanding).
  const sites = tripLoadingSites(trip);
  const siteProgress = loadingSiteProgress(sites, checkpoints);
  const driverPhone = driver?.phone?.trim() || "";
  /**
   * How the roster row was found, when it was not the name the dispatch carries.
   * The details are worth having; they are not worth passing off as something the
   * dispatch itself said.
   */
  const driverNote =
    driverMatch?.via === "truck"
      ? `Roster details matched by the truck on this dispatch (${displayCapFromTrip(trip)}).`
      : driverMatch?.via === "token"
        ? "Roster details matched by the name typed on this dispatch."
        : undefined;
  // Only the Tracking department logs the whole journey and moves the delay
  // status. The Loading department logs ONE thing here — collection — and that
  // entry is the same checkpoint record Tracking writes, so whichever of the two
  // marks a site first is the truth and the other simply agrees with it (the API
  // refuses the duplicate). Everyone else (Transport Manager, Fleet Ops, Security)
  // gets the same page as pure visibility — all of it decided by the `roles` read
  // above the early returns.
  const hideTmPricing = !canSeeTmPricing(roles);
  const detailFields = dispatchFields(trip, driver ?? undefined, undefined, hideTmPricing);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      {/* Header — Figma 470:11566 Frame 71: 30px back arrow + 16px semibold title */}
      <div className="flex items-center gap-[15px]">
        <button
          type="button"
          onClick={() => navigate({ to: "/workspace/app/active-dispatch" })}
          className="grid size-[30px] shrink-0 place-items-center rounded-full text-[#1B2432] hover:bg-black/5"
          aria-label="Back to Tracking Operations"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h2 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[18px]">
          {canLogTracking
            ? "Access Location History and Log New Locations"
            : loadingOnly
              ? "Mark Each Loading Site as it is Collected"
              : "Track Location and History"}
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[440px_1fr] lg:gap-[30px]">
        {/* Dispatch Details — Figma Background+Border 429px card */}
        <section className="h-fit rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Details</h3>
              <p className="mt-1 text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
                TICKET {dispatchDisplayId(trip)}
                {company ? ` • ${company}` : ""}
              </p>
            </div>
            {/* Update Status dropdown — Figma 472:15170 style */}
            <div className="flex items-start gap-2">
              {/* THE END OF THE CYCLE. A dispatch had no end point on this side at
                  all: the only thing that ever closed a trip was Security's gate,
                  so a truck that had come home sat on the Tracking board forever.
                  The people who watch the truck arrive close it here, the same way
                  the gate does. */}
              {canCloseTrip ? (
                confirmClose ? (
                  <div className="flex h-9 items-center gap-2 rounded border border-[#ED351D] bg-white px-3 shadow-[0px_1px_4px_rgba(12,12,13,0.08)]">
                    <span className="text-[12px] tracking-[0.4px] text-[#1B2432]">Truck back in the yard?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmClose(false)}
                      className="text-[12px] font-medium text-[#5C6470] hover:text-[#1B2432]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={closing}
                      onClick={() => void closeTrip()}
                      className="rounded bg-[#ED351D] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-60 hover:bg-[#d62e19]"
                    >
                      {closing ? "Closing…" : "Yes, end trip"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClose(true)}
                    className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium text-[#1B2432] shadow-[0px_1px_4px_rgba(12,12,13,0.08)] hover:border-[#5C6470]/40"
                    aria-label="Mark the truck as returned and end the trip"
                    title="The truck is back — this closes the trip"
                  >
                    <Check className="size-4" />
                    Truck Returned
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={() => printDispatch(detailFields)}
                className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium text-[#1B2432] shadow-[0px_1px_4px_rgba(12,12,13,0.08)] hover:border-[#5C6470]/40"
                aria-label="Print dispatch details"
                title="Print dispatch details"
              >
                <Printer className="size-4" />
                Print
              </button>
              <div className="relative">
              {canLogTracking ? (
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium shadow-[0px_1px_4px_rgba(12,12,13,0.08)] hover:border-[#5C6470]/40"
                style={{ color: TRACKING_DELAY_COLOR[delayStatus] }}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }} />
                {delayStatus}
                <ChevronDown className="size-4 text-[#5C6470]" />
              </button>
              ) : (
                <span
                  className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] bg-[#F5F6F8] px-3 text-[13px] font-medium"
                  style={{ color: TRACKING_DELAY_COLOR[delayStatus] }}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }} />
                  {delayStatus}
                </span>
              )}
              {canLogTracking && statusOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                  <div className="absolute right-0 top-11 z-40 min-w-[190px] rounded-[10px] border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => applyStatus(opt)}
                        className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[14px] font-medium tracking-[0.4px] hover:bg-[#F5F6F8]"
                        style={{ color: TRACKING_DELAY_COLOR[opt] }}
                      >
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[opt] }} />
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="rounded-[10px] bg-[#F5F6F8] p-4">
              <p className="mb-3 text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Customer Details</p>
              <div className="flex flex-col gap-3">
                <DetailRow label="Customer Name:" value={trip.customerConsignee || trip.customer || "—"} />
                <DetailRow label="Destination:" value={trip.dropoff || "—"} />
                <DetailRow label="Loading Site(s):" value={sites.length ? sites.join(", ") : trip.pickup || "—"} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="rounded-[10px] bg-[#F5F6F8] p-4">
              <p className="mb-3 text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">
                Vehicle & Operator Details
              </p>
              <div className="flex flex-col gap-3">
                {/* This row used to print `vehicle[0]`, which is the truck TYPE the
                    partner requested — so a dispatch on P019 read "Truck Head: Flat".
                    The head is the cap with its plate: the one pairing the gate log
                    and every board use. */}
                <DetailRow label="Truck Head (Cap Number / Plate):" value={displayCapPlateFromTrip(trip) || "—"} />
                <DetailRow
                  label="Truck Tail assigned:"
                  value={
                    humanCode(trip.tailNumber, trip.tailType)
                      ? trip.tailType && trip.tailNumber && trip.tailType !== trip.tailNumber
                        ? `${trip.tailType} (${trip.tailNumber})`
                        : humanCode(trip.tailNumber, trip.tailType)
                      : "—"
                  }
                />
                <DetailRow label="Driver Assigned:" value={displayDriverAssigned(driver, trip.driverName) || "—"} />
                <DetailRow label="Driver Contact Phone:" value={driverPhone || "—"} />
                {driverNote ? (
                  <p className="text-[11px] leading-4 text-[#9CA3AF]">{driverNote}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E2E5E9] pt-3 text-[13px] font-medium text-[#5C6470]">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }} />
            Current: {delayStatus}
            {/* The evidence behind the status: the Transport Manager's promise
                (days on the road) and the date the cargo is due back. */}
            {tripDelay(trip) ? (
              <span className="text-[#627084]">
                · {tripDelay(trip)!.progressLabel}
                {expectedReturnAt(trip)
                  ? ` · due back ${expectedReturnAt(trip)!.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : ""}
                {tripDelay(trip)!.daysOver > 0 ? ` · ${tripDelay(trip)!.daysOver} day(s) over` : ""}
              </span>
            ) : null}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Log New Location — Figma Frame 96 (657px). Tracking and Loading write
              here (the same checkpoint); every other role reads the history. */}
          {canLogAnything ? (
          <section className="rounded-[10px] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <div className="mb-5 flex items-center gap-3 border-b border-[#E2E5E9] pb-4">
              <span className="grid size-6 place-items-center rounded-full bg-[#ED351D]/10">
                <MapPinCheck className="size-4 text-[#ED351D]" />
              </span>
              <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#5C6470]">
                {loadingOnly ? "Log Loaded Site" : "Log New Location"}
              </h3>
            </div>

            {/* Dispatch Trip (leg) dropdown — custom, matches Figma "Button dialog".
                A role with only one stage to log (Loading) sees it stated, not
                offered: there is nothing else they are allowed to pick. */}
            {loggableLegs.length > 1 ? (
            <div className="mb-4">
              <span className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Dispatch Trip <span className="text-[#ED351D]">*</span>
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLegOpen((v) => !v)}
                  className="flex h-10 w-full items-center justify-between rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium text-[#5C6470] outline-none hover:border-[#5C6470]/40"
                >
                  {leg}
                  <ChevronDown className={cn("size-4 text-[#5C6470] transition-transform", legOpen && "rotate-180")} />
                </button>
                {legOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setLegOpen(false)} />
                    <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-[6px] border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]">
                      {loggableLegs.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setLeg(opt);
                            setLegOpen(false);
                          }}
                          className={cn(
                            "flex h-9 w-full items-center px-3 text-left text-[14px] font-medium tracking-[0.4px]",
                            opt === leg ? "bg-[#ED351D] text-white" : "text-[#344256] hover:bg-[#F1F2F4]",
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            ) : (
              <div className="mb-4">
                <span className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Dispatch Trip
                </span>
                <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[#F5F6F8] px-3 text-[14px] font-medium text-[#5C6470]">
                  {loggableLegs[0] ?? "Loading"}
                </div>
              </div>
            )}

            {/* Multiple-loading requests: pick the site being collected. Logging
                per site is what gives the partner a breakdown under Loading. */}
            {leg === "Loading" && sites.length > 0 ? (
              <div className="mb-4">
                <span className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Loading Site <span className="text-[#ED351D]">*</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {sites.map((site) => {
                    const logged = stageDots("Loading", sites, checkpoints).some(
                      (d) => d.logged && d.label === site,
                    );
                    const selected = normalizeSiteKey(location) === normalizeSiteKey(site);
                    return (
                      <button
                        key={site}
                        type="button"
                        onClick={() => setLocation(site)}
                        className={cn(
                          "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium tracking-[0.4px] transition-colors",
                          selected
                            ? "border-[#ED351D] bg-[#ED351D] text-white"
                            : logged
                              ? "border-[#0ACF83]/40 bg-[#0ACF83]/10 text-[#0B7A4E]"
                              : "border-[#E2E5E9] bg-white text-[#344256] hover:bg-[#F1F2F4]",
                        )}
                      >
                        {logged ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                        {site}
                      </button>
                    );
                  })}
                </div>
                {siteProgress ? (
                  <p className="mt-1.5 text-[11px] tracking-[0.4px] text-[#627084]">
                    {siteProgress.logged} of {siteProgress.total} site
                    {siteProgress.total === 1 ? "" : "s"} logged
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mb-6">
              <span className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Add Current Location <span className="text-[#ED351D]">*</span>
              </span>
              <div className="flex h-10 items-center gap-2.5 rounded border border-[#E2E5E9] bg-white px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)] focus-within:border-[#1B2432]">
                <MapPin className="size-4 shrink-0 text-[#5C6470]" strokeWidth={1.5} />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                    placeholder={leg === "Loading" && sites.length > 0 ? "Pick a loading site above" : "eg: Alpha, Lokoja"}
                  className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[#E2E5E9] pt-4">
              <button
                type="button"
                onClick={() => navigate({ to: "/workspace/app/active-dispatch" })}
                className="flex h-9 flex-1 items-center justify-center text-[14px] font-medium tracking-[0.4px] text-[#ED351D]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveLocation()}
                className="flex h-9 flex-1 items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : loadingOnly ? "Mark as Loaded" : "Save Update"}
              </button>
            </div>
          </section>
          ) : null}

          {/* Stage history — every stage carries its own growing sub-dots */}
          <div className="grid gap-5 md:grid-cols-2">
            <HistoryCard
              title="Trip History"
              stages={["Loading", "In Transit", "At Destination", "Offloaded"]}
              sites={sites}
              checkpoints={checkpoints}
            />
            <HistoryCard title="Return History" stages={["Return"]} sites={sites} checkpoints={checkpoints} />
          </div>
        </div>
      </div>

      {driverPhone ? (
        <a
          href={`tel:${driverPhone}`}
          className="fixed bottom-24 right-4 z-30 flex h-11 items-center gap-2 rounded-full bg-[#0ACF83] px-4 text-[13px] font-semibold text-white shadow-[0px_4px_16px_rgba(10,207,131,0.4)] md:bottom-6 md:right-6"
        >
          <Phone className="size-4" />
          Call {driver?.name?.split(" ")[0] || "Driver"} · {driverPhone}
        </a>
      ) : null}
    </div>
  );
}

/** Figma detail row: grey label left, dark semibold value right-aligned. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px] leading-5">
      <span className="shrink-0 tracking-[0.4px] text-[#5C6470]">{label}</span>
      <span className="text-right font-semibold tracking-[0.4px] text-[#1B2432]">{value}</span>
    </div>
  );
}

/**
 * History card grouped by stage: the stage name sits on the red timeline and
 * every logged location under it is a sub-dot, so the Tracking team can keep
 * adding locations to any stage and the list just grows.
 */
function HistoryCard({
  title,
  stages,
  sites,
  checkpoints,
}: {
  title: string;
  stages: TrackingLeg[];
  /** Requested loading sites — the Loading stage lists every one of them. */
  sites: string[];
  checkpoints: LocationCheckpoint[];
}) {
  // Loading shows the request's sites (outstanding ones included); every other
  // stage shows what was logged against it.
  const dotsFor = (stage: TrackingLeg) => stageDots(stage, sites, checkpoints);
  const total = stages.reduce((n, s) => n + dotsFor(s).length, 0);
  return (
    <section className="rounded-[10px] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <h3 className="mb-4 border-b border-[#E2E5E9] pb-3 text-[18px] font-semibold tracking-[0.4px] text-[#5C6470]">
        {title}
      </h3>
      {total === 0 ? (
        <p className="text-[14px] font-light italic text-[#5C6470]/70">No history logged yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {stages.map((stage) => {
            const rows = dotsFor(stage);
            if (rows.length === 0) return null;
            const loggedRows = rows.filter((r) => r.logged);
            const latest = loggedRows[0];
            return (
              <div key={stage} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-[15px] shrink-0 place-items-center rounded-full border-2 border-[#ED351D] bg-white">
                    <span className="size-[5px] rounded-full bg-[#ED351D]" />
                  </span>
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">{stage}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      loggedRows.length === rows.length
                        ? "bg-[#F1F2F4] text-[#5C6470]"
                        : "bg-[#F99E1F]/15 text-[#B26A00]",
                    )}
                  >
                    {loggedRows.length === rows.length
                      ? rows.length
                      : `${loggedRows.length}/${rows.length} logged`}
                  </span>
                  {/* Stage timestamp — when this stage was last updated. */}
                  {latest && !Number.isNaN(new Date(latest.at ?? "").getTime()) ? (
                    <span className="text-[10px] font-medium text-[#5C6470]">
                      {new Date(latest.at ?? "").toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      •{" "}
                      {new Date(latest.at ?? "").toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </div>
                {/* Sub-dots: one per logged location, newest first. */}
                <ol className="ml-[7px] flex flex-col gap-3 border-l border-[#E2E5E9] pl-5">
                  {rows.map((row) => {
                    const d = new Date(row.at ?? "");
                    const valid = !Number.isNaN(d.getTime());
                    const when = valid
                      ? `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} • ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                      : "";
                    return (
                      <li key={row.key} className="relative flex flex-col gap-1">
                        {row.logged ? (
                          <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-[#ED351D]/60" />
                        ) : (
                          <span className="absolute -left-[25px] top-1.5 size-2 rounded-full border border-[#C6CAD1] bg-white" />
                        )}
                        <span
                          className={cn(
                            "text-[14px] font-medium tracking-[0.4px]",
                            row.logged ? "text-[#ED351D]" : "text-[#8E95A1]",
                          )}
                        >
                          {row.label}
                        </span>
                        {row.logged && when ? (
                          <span className="text-[10px] font-medium text-[#5C6470]">{when}</span>
                        ) : null}
                        {!row.logged ? (
                          <span className="text-[10px] font-medium text-[#8E95A1]">
                            Awaiting load — log this site to complete it
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
