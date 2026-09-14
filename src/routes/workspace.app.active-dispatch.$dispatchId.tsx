import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronDown, MapPin, MapPinCheck, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayCapFromTrip,
  displayDriverAssigned,
  displayPlateFromTrip,
  humanCode,
} from "@/lib/fleetopsx/display-ids";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import {
  addCheckpoint,
  dispatchDisplayId,
  getTrackingDelayStatus,
  listCheckpoints,
  TRACKING_DELAY_COLOR,
  type LocationCheckpoint,
  type TrackingDelayStatus,
} from "@/lib/fleetopsx/tracking-ops";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/active-dispatch/$dispatchId")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Security", "Tracking", "Platform Admin"];
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
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [delayStatus, setDelayStatus] = useState<TrackingDelayStatus>("On Schedule");
  const [leg, setLeg] = useState<"Outgoing" | "Return">("Outgoing");
  const [legOpen, setLegOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [checkpoints, setCheckpoints] = useState<LocationCheckpoint[]>([]);
  const [saving, setSaving] = useState(false);

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
        // Resolve driver by ID first; fall back to NAME — FO assignments store
        // the name only, and the phone lives on the driver row.
        const assignedName = next.driverName && next.driverName !== "Unassigned" ? next.driverName.trim() : "";
        if (next.driverId || assignedName) {
          void driverService
            .list()
            .then((drivers: Driver[]) => {
              if (cancelled) return;
              const found = next!.driverId
                ? drivers.find((d) => d.id === next!.driverId)
                : drivers.find((d) => d.name.trim().toLowerCase() === assignedName.toLowerCase());
              if (found) setDriver(found);
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

  const outgoing = useMemo(() => checkpoints.filter((c) => c.leg === "Outgoing"), [checkpoints]);
  const returning = useMemo(() => checkpoints.filter((c) => c.leg === "Return"), [checkpoints]);

  /**
   * Status dropdown is a TRACKING LABEL, not a trip-status write. Changing it
   * used to PATCH the trip to Delayed/Stopped — which silently re-bucketed the
   * trip and made it vanish from the Active Dispatch board (Stopped-without-
   * truck = Declined). Tracking reports observations; only FO/TM change the
   * lifecycle status.
   */
  const applyStatus = (next: TrackingDelayStatus) => {
    setDelayStatus(next);
    setStatusOpen(false);
    toast.success(`Tracking status noted: ${next}`);
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
      setCheckpoints((prev) => [row, ...prev]);
      setLocation("");
      toast.success("Location checkpoint saved");
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
        <FigmaEmptyState title="Dispatch not found" body="Return to Active Dispatch and try again." />
      </div>
    );
  }

  const company =
    trip.customer && trip.customer !== "Customer Portal" ? trip.customer : trip.customerConsignee || "";
  const sites = (trip.loadingSite ?? []).filter(Boolean);
  const driverPhone = driver?.phone?.trim() || "";

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      {/* Header — Figma 470:11566 Frame 71: 30px back arrow + 16px semibold title */}
      <div className="flex items-center gap-[15px]">
        <button
          type="button"
          onClick={() => navigate({ to: "/workspace/app/active-dispatch" })}
          className="grid size-[30px] shrink-0 place-items-center rounded-full text-[#1B2432] hover:bg-black/5"
          aria-label="Back to Active Dispatch"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h2 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[18px]">
          Access Location History and Log New Locations
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                className="flex h-9 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium text-[#1B2432] shadow-[0px_1px_4px_rgba(12,12,13,0.08)] hover:border-[#5C6470]/40"
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }} />
                Update Status
                <ChevronDown className="size-4 text-[#5C6470]" />
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                  <div className="absolute right-0 top-11 z-40 min-w-[190px] rounded-[6px] border border-[#E2E5E9] bg-white py-2 shadow-[0px_4px_16px_rgba(0,0,0,0.12)]">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => applyStatus(opt)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] font-medium tracking-[0.4px] hover:bg-[#F1F2F4]",
                          opt === delayStatus ? "text-[#ED351D]" : "text-[#344256]",
                        )}
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

          <div className="mt-5">
            <p className="mb-2.5 text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">Customer Details</p>
            <div className="flex flex-col gap-2">
              <DetailRow label="Customer Name:" value={trip.customerConsignee || trip.customer || "—"} bold />
              <DetailRow label="Destination:" value={trip.dropoff || "—"} bold />
              <DetailRow label="Loading Site(s):" value={sites.length ? sites.join(", ") : trip.pickup || "—"} bold />
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2.5 text-[14px] font-bold tracking-[0.4px] text-[#1B2432]">
              Vehicle & Operator Details
            </p>
            <div className="flex flex-col gap-2">
              <DetailRow label="Truck Head (Cap Number):" value={displayCapFromTrip(trip) || "—"} bold />
              <DetailRow label="Truck Head Plate Number:" value={displayPlateFromTrip(trip) || "—"} bold />
              <DetailRow
                label="Truck Tail assigned:"
                value={
                  humanCode(trip.tailNumber, trip.tailType)
                    ? trip.tailType && trip.tailNumber && trip.tailType !== trip.tailNumber
                      ? `${trip.tailType} (${trip.tailNumber})`
                      : humanCode(trip.tailNumber, trip.tailType)
                    : "—"
                }
                bold
              />
              <DetailRow label="Driver Assigned:" value={displayDriverAssigned(driver, trip.driverName) || "—"} bold />
              <DetailRow label="Driver Contact Phone:" value={driverPhone || "—"} bold />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-[#E2E5E9] pt-3 text-[13px] font-medium text-[#5C6470]">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }} />
            Current: {delayStatus}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Log New Location — Figma Frame 96 (657px) */}
          <section className="rounded-[10px] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
            <div className="mb-5 flex items-center gap-3 border-b border-[#E2E5E9] pb-4">
              <span className="grid size-6 place-items-center rounded-full bg-[#ED351D]/10">
                <MapPinCheck className="size-4 text-[#ED351D]" />
              </span>
              <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#5C6470]">Log New Location</h3>
            </div>

            {/* Dispatch Trip (leg) dropdown — custom, matches Figma "Button dialog" */}
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
                      {(["Outgoing", "Return"] as const).map((opt) => (
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

            <div className="mb-6">
              <span className="mb-1.5 block text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                Add Current Location <span className="text-[#ED351D]">*</span>
              </span>
              <div className="flex h-10 items-center gap-2.5 rounded border border-[#E2E5E9] bg-white px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)] focus-within:border-[#1B2432]">
                <MapPin className="size-4 shrink-0 text-[#5C6470]" strokeWidth={1.5} />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="eg: Alpha, Lokoja"
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
                {saving ? "Saving…" : "Save Update"}
              </button>
            </div>
          </section>

          {/* History cards side by side — Figma Frame 9 */}
          <div className="grid gap-5 md:grid-cols-2">
            <HistoryCard title="Outgoing History" rows={outgoing} />
            <HistoryCard title="Return History" rows={returning} />
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

/** Figma detail row: 13px grey label + 13px semibold dark value on one line. */
function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-0.5 text-[13px] leading-5">
      <span className="tracking-[0.4px] text-[#5C6470]">{label}</span>
      <span className={cn("break-words tracking-[0.4px]", bold ? "font-semibold text-[#1B2432]" : "text-[#5C6470]")}>
        {value}
      </span>
    </div>
  );
}

/** Figma history card: 18px semibold grey title, red 14px location + 10px timestamp. */
function HistoryCard({ title, rows }: { title: string; rows: LocationCheckpoint[] }) {
  return (
    <section className="rounded-[10px] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <h3 className="mb-3 text-[18px] font-semibold tracking-[0.4px] text-[#5C6470]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[14px] font-light italic text-[#5C6470]/70">No history logged yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const d = new Date(row.at);
            const valid = !Number.isNaN(d.getTime());
            return (
              <li key={row.id} className="flex items-start justify-between gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#ED351D]">{row.location}</span>
                <span className="shrink-0 text-right text-[10px] font-medium leading-4 text-[#5C6470]">
                  {valid
                    ? `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}\n${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
