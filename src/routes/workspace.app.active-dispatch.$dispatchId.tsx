import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MapPin } from "lucide-react";
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
    const allowed = ["Transport Manager", "Fleet Operations", "Security", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
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
  const [location, setLocation] = useState("");
  const [checkpoints, setCheckpoints] = useState<LocationCheckpoint[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next = await tripService.get(dispatchId);
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
        setCheckpoints(listCheckpoints(next.id));
        if (next.driverId) {
          const d = await driverService.get(next.driverId);
          if (!cancelled) setDriver(d);
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

  const applyStatus = async (next: TrackingDelayStatus) => {
    if (!trip) return;
    setDelayStatus(next);
    setStatusOpen(false);
    let apiStatus = trip.status;
    switch (next) {
      case "On Schedule":
        apiStatus = trip.status === "Delayed" || trip.status === "Stopped" ? "En Route" : trip.status;
        break;
      case "Slight delay":
        apiStatus = "Stopped";
        break;
      case "Significant Delay":
        apiStatus = "Delayed";
        break;
      default: {
        const _exhaustive: never = next;
        return _exhaustive;
      }
    }
    try {
      await tripService.setStatus(trip.id, apiStatus);
      setTrip({ ...trip, status: apiStatus });
      toast.success("Status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
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
      const row = addCheckpoint({ tripId: trip.id, location: location.trim(), leg });
      setCheckpoints((prev) => [row, ...prev]);
      setLocation("");
      toast.success("Location checkpoint saved");
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

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/workspace/app/active-dispatch" })}
          className="grid size-8 place-items-center text-[#1B2432]"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-[18px] font-medium tracking-[0.4px] text-[#1B2432] md:text-[24px] md:leading-8">
          Access Location History and Log New Locations
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Details</h3>
              <p className="mt-1 text-[12px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                TICKET {dispatchDisplayId(trip)}
                {company ? ` • ${company}` : ""}
              </p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen((v) => !v)}
                className="rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2432] shadow-sm"
              >
                Update Status
              </button>
              {statusOpen && (
                <div className="absolute right-0 top-11 z-20 min-w-[180px] rounded border border-[#E2E5E9] bg-white p-2 shadow-lg">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => void applyStatus(opt)}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-[#F1F2F4]"
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: TRACKING_DELAY_COLOR[opt] }}
                      />
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">Customer Details</p>
            <DetailRow label="Destination" value={trip.dropoff || ""} />
            <DetailRow label="Loading Site(s)" value={sites.length ? sites.join(", ") : trip.pickup || ""} />
          </div>

          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
              Vehicle & Operator Details
            </p>
            <DetailRow label="Truck Head (Cap Number)" value={displayCapFromTrip(trip)} />
            <DetailRow label="Truck Head Plate Number" value={displayPlateFromTrip(trip)} />
            <DetailRow
              label="Truck Tail assigned"
              value={
                humanCode(trip.tailNumber, trip.tailType)
                  ? trip.tailType && trip.tailNumber && trip.tailType !== trip.tailNumber
                    ? `${trip.tailType} (${trip.tailNumber})`
                    : humanCode(trip.tailNumber, trip.tailType)
                  : ""
              }
            />
            <DetailRow
              label="Driver Assigned"
              value={displayDriverAssigned(driver, trip.driverName)}
            />
            <DetailRow label="Driver Contact Phone" value={driver?.phone || ""} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-[13px] text-[#5C6470]">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TRACKING_DELAY_COLOR[delayStatus] }}
            />
            Current: {delayStatus}
          </div>
        </section>

        <section className="rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
          <div className="mb-5 flex items-center gap-2">
            <MapPin className="size-5 text-[#ED351D]" strokeWidth={1.5} />
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">Log New Location</h3>
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-[13px] font-medium text-[#1B2432]">
              Dispatch Trip <span className="text-[#ED351D]">*</span>
            </span>
            <select
              value={leg}
              onChange={(e) => setLeg(e.target.value as "Outgoing" | "Return")}
              className="h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#1B2432] outline-none"
            >
              <option value="Outgoing">Outgoing</option>
              <option value="Return">Return</option>
            </select>
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-[13px] font-medium text-[#1B2432]">
              Add Current Location <span className="text-[#ED351D]">*</span>
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="eg: Alpha, Lokoja"
              className="h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
            />
          </label>

          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate({ to: "/workspace/app/active-dispatch" })}
              className="text-[14px] font-medium text-[#ED351D]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveLocation()}
              className="rounded bg-[#ED351D] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
            >
              Save Update
            </button>
          </div>
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <HistoryCard title="Outgoing History" rows={outgoing} />
        <HistoryCard title="Return History" rows={returning} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 grid grid-cols-[160px_1fr] gap-2 text-[13px]">
      <span className="text-[#5C6470]">{label}</span>
      <span className="text-[#1B2432]">{value}</span>
    </div>
  );
}

function HistoryCard({ title, rows }: { title: string; rows: LocationCheckpoint[] }) {
  return (
    <section className="rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
      <h3 className="mb-3 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[14px] italic text-[#5C6470]/70">No history logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] pb-2 text-[13px]">
              <span className="text-[#1B2432]">{row.location}</span>
              <span className="shrink-0 text-[#5C6470]">
                {new Date(row.at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
