import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, MapPin, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/$requestId")({
  component: PartnerRequestDetailsPage,
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

function ReadonlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">{label}</span>
      <div className="flex min-h-10 w-full items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
        {value?.trim() ? value : "—"}
      </div>
    </div>
  );
}

function PartnerRequestDetailsPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Instant paint from dashboard cache (avoid hung GET /trips/:id behind proxy)
    try {
      const raw = sessionStorage.getItem(`fleetopsx_partner_trip_${requestId}`);
      if (raw) {
        const cached = JSON.parse(raw) as Trip;
        if (cached?.id === requestId) {
          setTrip(cached);
          setLoading(false);
        }
      }
    } catch {
      /* ignore */
    }

    const load = async () => {
      try {
        const t = await tripService.get(requestId);
        if (!cancelled) {
          setTrip(t);
          if (t) {
            try {
              sessionStorage.setItem(`fleetopsx_partner_trip_${t.id}`, JSON.stringify(t));
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* keep cached trip if any */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timeout = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [requestId]);

  const timeline = useMemo(() => (trip ? tripService.timeline(trip) : []), [trip]);
  const uiStatus = trip ? toPartnerStatus(trip.status) : "Pending";
  const loadingSites =
    trip?.loadingSite && trip.loadingSite.length > 0
      ? trip.loadingSite
      : trip?.pickup
        ? [trip.pickup]
        : [];
  const truckParts = (trip?.truckReg || "").split(" / ").map((p) => p.trim()).filter(Boolean);
  const truckHead = truckParts[0] && truckParts[0] !== "TBD" ? truckParts[0] : trip?.headId || "—";
  const truckTail = trip?.tailType || truckParts[1] || "—";
  const serial = trip?.tailNumber || trip?.tailId || "—";
  const canConfirmArrival = trip
    ? ["En Route", "Loaded", "Scheduled", "Delayed"].includes(trip.status)
    : false;
  const canDelete = trip
    ? ["Requested", "Awaiting Approval", "Stopped"].includes(trip.status)
    : false;

  const handleExport = () => {
    if (!trip) return;
    const rows = [
      ["Ticket", displayRequestId(trip)],
      ["Status", uiStatus],
      ["Customer Name", trip.customerConsignee || ""],
      ["Product", trip.cargo],
      ["Truck Type", trip.tailType || ""],
      ["Destination", trip.dropoff],
      ["Loading Sites", loadingSites.join("; ")],
      ["Driver", trip.driverName || ""],
      ["Truck Head", truckHead],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayRequestId(trip)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!trip) return;
    try {
      await tripService.delete(trip.id);
      toast.success("Request deleted");
      navigate({ to: "/workspace/customer-portal/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete request");
    }
  };

  const handleConfirmArrival = async () => {
    if (!trip) return;
    setConfirming(true);
    try {
      const updated = await tripService.updateTrip(trip.id, { status: "Offloading" });
      setTrip(updated);
      toast.success("Arrival confirmed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm arrival");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <PartnerPortalShell>
      {loading ? (
        <div className="p-8">
          <FigmaLoadingState label="Loading request…" />
        </div>
      ) : !trip ? (
        <div className="p-8">
          <FigmaEmptyState title="Request not found" body="This ticket is missing or was removed from the live API." />
          <Link
            to="/workspace/customer-portal/dashboard"
            className="mt-4 inline-flex text-[14px] font-medium text-[#ED351D]"
          >
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <main className="box-border flex w-full min-w-0 max-w-none flex-col gap-5 p-4 md:gap-5 md:p-[30px]">
          <Link
            to="/workspace/customer-portal/dashboard"
            className="inline-flex items-center gap-2 text-[16px] tracking-[0.4px] text-[#5C6470]"
          >
            <ArrowLeft className="size-6" strokeWidth={1.75} />
            Back to Dashboard
          </Link>

          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Ticket {displayRequestId(trip)}</h2>
            <div className="flex items-center gap-[30px]">
              <button
                type="button"
                onClick={handleExport}
                className="flex h-8 items-center gap-[5px] rounded bg-[#1B2432] px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-white"
              >
                <Upload className="size-[18px]" />
                Export CVS
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="grid size-8 place-items-center rounded"
                  aria-label="Delete request"
                >
                  <Trash2 className="size-[22px] text-[#ED351D]" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid w-full min-w-0 gap-5 lg:grid-cols-2 lg:gap-[35px]">
            {/* Request Details */}
            <section className="w-full min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]">
              <div className="mb-4 flex w-full items-center justify-between border-b border-[#E2E5E9] py-2">
                <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Request Details</h3>
                <span
                  className={cn(
                    "inline-flex h-[22px] min-w-[77px] items-center justify-center rounded px-3 text-[12px]",
                    partnerStatusClass(uiStatus),
                  )}
                >
                  {uiStatus === "In transit" ? "In Transit" : uiStatus}
                </span>
              </div>
              <div className="flex flex-col gap-5">
                <ReadonlyField label="Customer Name" value={trip.customerConsignee} />
                <ReadonlyField label="Product" value={trip.cargo} />
                <ReadonlyField label="Truck Type" value={trip.tailType} />
                <ReadonlyField label="Destination" value={trip.dropoff} />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
                    Loading Site(s)
                  </span>
                  <div className="flex flex-col gap-2">
                    {(loadingSites.length ? loadingSites : ["—"]).map((site) => (
                      <div
                        key={site}
                        className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]"
                      >
                        {site}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Real-Time Tracking */}
            <section className="w-full min-w-0 overflow-hidden rounded-[10px] border border-white bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]">
              <div className="border-b border-[#5C6470]/40 px-5 py-2.5">
                <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">Real-Time Tracking</h3>
              </div>
              <div className="relative flex h-[280px] items-center justify-center bg-[#E8ECF0] sm:h-[419px]">
                {uiStatus === "In transit" || uiStatus === "Completed" ? (
                  <>
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,#d7dde5_0%,#eef1f4_50%,#d5dbe3_100%)]" />
                    <div className="relative z-[1] flex flex-col items-center gap-1">
                      <div className="rounded-lg bg-[rgba(15,15,20,0.88)] px-2.5 py-1.5 text-[11px] font-medium text-white">
                        {trip.dropoff || "Destination"}
                      </div>
                      <MapPin className="size-8 text-[#ED351D]" fill="#ED351D" />
                    </div>
                  </>
                ) : (
                  <div className="relative z-[1] max-w-sm px-6 text-center">
                    <MapPin className="mx-auto mb-3 size-10 text-[#5C6470]/40" />
                    <p className="text-[14px] font-medium text-[#1B2432]">Tracking unavailable</p>
                    <p className="mt-1 text-[12px] text-[#5C6470]">
                      Live map activates once Fleet Operations dispatches a vehicle.
                    </p>
                  </div>
                )}
              </div>
              <div className="h-12 border-t border-[#5C6470]/40 px-5" />
            </section>

            {/* Assignment Details */}
            <section className="w-full min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-[15px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]">
              <div className="mb-4 w-full border-b border-[#E2E5E9] py-2">
                <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Assignment Details</h3>
              </div>
              {trip.status === "Requested" || trip.status === "Awaiting Approval" ? (
                <div className="px-4 py-10 text-center text-[14px] font-normal tracking-[0.4px] text-[#5C6470]">
                  Awaiting Transport Manager approval and assignment.
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <ReadonlyField label="Driver Name" value={trip.driverName && trip.driverName !== "Unassigned" ? trip.driverName : "—"} />
                  <ReadonlyField label="Driver Phone Number" value="—" />
                  <ReadonlyField label="Truck Head" value={truckHead} />
                  <ReadonlyField label="Truck Tail (Type)" value={truckTail} />
                  <ReadonlyField label="Serial Number" value={serial} />
                </div>
              )}
            </section>

            {/* Request Timeline */}
            <section className="w-full min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-2.5 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)] sm:px-[30px]">
              <div className="mb-5 w-full border-b border-[#E2E5E9] py-2">
                <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Request Timeline</h3>
              </div>
              <div className="relative flex flex-col gap-5 pb-4">
                <div className="absolute bottom-6 left-[9px] top-2 w-px bg-[#E2E5E9]" />
                {timeline.map((step) => {
                  const active = step.state === "done" || step.state === "current";
                  const isDestination = step.label === "At Destination";
                  return (
                    <div key={step.label} className="relative flex items-start gap-[50px]">
                      <div
                        className={cn(
                          "relative z-[1] mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full",
                          active ? "bg-[#ED351D]" : "bg-[#D1D5DB]",
                        )}
                      >
                        {active ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <div className="flex flex-wrap items-center gap-3">
                          <p
                            className={cn(
                              "text-[14px] font-normal tracking-[0.4px]",
                              active ? "text-[#ED351D]" : "text-[#5C6470]",
                            )}
                          >
                            {step.label}
                          </p>
                          {isDestination && canConfirmArrival ? (
                            <button
                              type="button"
                              disabled={confirming}
                              onClick={() => void handleConfirmArrival()}
                              className="h-8 rounded bg-[#1B2432] px-3 text-[12px] font-medium text-white disabled:opacity-60"
                            >
                              {confirming ? "Confirming…" : "Confirm Arrival"}
                            </button>
                          ) : null}
                        </div>
                        {step.at ? (
                          <p className="text-[10px] font-normal text-[rgba(92,100,112,0.6)]">{step.at}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </main>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-[320px] flex-col items-center rounded-lg bg-white p-8 text-center shadow-[0px_1px_2px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
            <div className="mb-4 grid size-[60px] place-items-center rounded-lg border-2 border-[#ED351D]">
              <span className="text-[24px] font-semibold text-[#ED351D]">!</span>
            </div>
            <p className="mb-8 max-w-[200px] text-[14px] font-medium text-[#5C6470]">
              Are you sure you want to delete this request?
            </p>
            <div className="flex w-full justify-center gap-4">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="h-10 flex-1 text-[14px] font-medium text-[#ED351D]"
              >
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
