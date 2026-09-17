import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, MapPin, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { PartnerLiveMap } from "@/components/fleetopsx/partner-live-map";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import {
  listCheckpoints,
  normalizeLeg,
  stageDots,
  tripLoadingSites,
  type LocationCheckpoint,
  type TrackingLeg,
} from "@/lib/fleetopsx/tracking-ops";
import {
  PARTNER_LOADING_SITE_OPTIONS,
  PARTNER_TRUCK_TYPE_OPTIONS,
  resolvePartnerLoadingSite,
  type PartnerLoadingSiteDraft,
} from "@/lib/fleetopsx/partner-request-options";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  displayRequestedTruckType,
  humanCode,
  looksLikeUuid,
} from "@/lib/fleetopsx/display-ids";
import { driverService, tripService } from "@/lib/fleetopsx/services";
import type { Driver, Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/$requestId")({
  component: PartnerRequestDetailsPage,
});

type PartnerUiStatus = "Pending" | "Seen" | "Approved" | "Declined" | "In transit" | "Completed";

/** Split joined site strings so each site is its own field (Figma 356:9825). */
function sitesToDrafts(sites: string[]): PartnerLoadingSiteDraft[] {
  if (sites.length === 0) {
    return [{ id: crypto.randomUUID(), type: "", customValue: "" }];
  }
  return sites.map((site) => {
    const known = PARTNER_LOADING_SITE_OPTIONS.find(
      (opt) => opt !== "Others" && opt.toLowerCase() === site.toLowerCase(),
    );
    if (known) {
      return { id: crypto.randomUUID(), type: known, customValue: "" };
    }
    return { id: crypto.randomUUID(), type: "Others", customValue: site };
  });
}

function toPartnerStatus(status: TripStatus): PartnerUiStatus {
  // Partner semantics — mirrors status-buckets.toPartnerUiStatus, EXCEPT that
  // the TM's FIRST approval is only "Seen" (orange): the partner sees
  // "Approved" (green) only after the second/final approval (Scheduled).
  switch (status) {
    case "Requested":
    case "Draft":
      return "Pending";
    case "Awaiting Approval":
    case "Approved":
    case "Approved for Dispatch":
      return "Seen";
    case "Scheduled":
      return "Approved";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
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
    case "Seen":
      return "bg-[#F99E1F] text-white";
    case "Approved":
      return "bg-[#0ACF83] text-white";
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

/** "seen" = the TM's first approval: acknowledged (orange), not yet approved. */
type PartnerTimelineStep = {
  label: string;
  state: "done" | "current" | "seen" | "pending";
  at?: string;
  /** Tracking stage whose logged locations render as sub-dots under this step. */
  stage?: TrackingLeg;
};

/** "15 Sept 2026 • 06:15" — every step shows its own date AND time. */
function stampLabel(value?: string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${time}`;
}

/** Partner Request Timeline — Declined stops at Request Declined (not the full dispatch path). */
function partnerRequestTimeline(trip: Trip): PartnerTimelineStep[] {
  const submittedAt = stampLabel(trip.createdAt) ?? stampLabel(trip.scheduledDate);
  const seenAt = stampLabel(trip.approvedAt);
  const assignedAt = stampLabel(trip.assignedAt);
  const approvedAt = stampLabel(trip.dispatchedAt);

  if (trip.status === "Stopped") {
    return [
      { label: "Request Submitted", state: "done", at: submittedAt },
      { label: "Request Declined", state: "current", at: stampLabel(trip.dispatchedAt) ?? seenAt },
    ];
  }

  if (trip.status === "Requested" || trip.status === "Draft") {
    return [
      { label: "Request Submitted", state: "current", at: submittedAt },
      { label: "Request Seen", state: "pending" },
      { label: "Dispatch Created", state: "pending" },
      { label: "Driver Assigned", state: "pending" },
      { label: "Loading", state: "pending", stage: "Loading" },
      { label: "In Transit", state: "pending", stage: "In Transit" },
      { label: "At Destination", state: "pending", stage: "At Destination" },
      { label: "Offloaded", state: "pending", stage: "Offloaded" },
      { label: "Returned", state: "pending", stage: "Return" },
    ];
  }

  const hasDriver =
    Boolean(trip.driverId) ||
    Boolean(trip.driverName && trip.driverName !== "Unassigned" && trip.driverName.trim() !== "");

  // Two-step approval: the TM's first approval only marks the request "Seen"
  // (orange). "Approved" (green) happens after final approval, when the trip
  // becomes Scheduled and the truck is on the road.
  const dispatched = [
    "Scheduled",
    "Loaded",
    "En Route",
    "Delayed",
    "Offloading",
    "Returning",
    "Completed",
  ].includes(trip.status);

  const loading = trip.status === "Loaded" ? "current" : dispatched ? "done" : "pending";
  const inTransit =
    trip.status === "En Route" || trip.status === "Delayed"
      ? "current"
      : ["Offloading", "Returning", "Completed"].includes(trip.status)
        ? "done"
        : "pending";
  const atDestination =
    trip.status === "Offloading" ? "current" : ["Returning", "Completed"].includes(trip.status) ? "done" : "pending";
  const offloaded =
    trip.status === "Returning" ? "current" : trip.status === "Completed" ? "done" : "pending";
  const returned = trip.status === "Completed" ? "done" : trip.status === "Returning" ? "current" : "pending";

  const steps: PartnerTimelineStep[] = [
    { label: "Request Submitted", state: "done", at: submittedAt },
    dispatched
      ? { label: "Request Approved", state: "done", at: approvedAt ?? seenAt }
      : { label: "Request Seen", state: seenAt ? "seen" : "current", at: seenAt },
    {
      label: "Dispatch Created",
      state: hasDriver || dispatched ? "done" : "current",
      at: hasDriver || dispatched ? (assignedAt ?? approvedAt) : undefined,
    },
    {
      label: "Driver Assigned",
      state: dispatched ? "done" : hasDriver ? "current" : "pending",
      at: hasDriver ? (assignedAt ?? approvedAt) : undefined,
    },
    { label: "Loading", state: loading, stage: "Loading" },
    { label: "In Transit", state: inTransit, stage: "In Transit" },
    { label: "At Destination", state: atDestination, stage: "At Destination" },
    { label: "Offloaded", state: offloaded, stage: "Offloaded" },
    { label: "Returned", state: returned, stage: "Return" },
  ];
  return steps;
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

/** Figma 356:9825 — each detail section ends with a ghost Cancel + solid red Delete Request. */
function SectionActions({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex w-full items-center justify-end gap-[30px] border-t border-[#E2E5E9] pt-4">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex h-10 w-[149px] items-center justify-center rounded px-3 text-[14px] font-medium tracking-[0.4px] text-[#ED351D]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex h-10 w-[132px] items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
      >
        Delete Request
      </button>
    </div>
  );
}

function PartnerRequestDetailsPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [driverPhone, setDriverPhone] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState("");
  const [draftProduct, setDraftProduct] = useState("");
  const [draftTruckType, setDraftTruckType] = useState("");
  const [draftDestination, setDraftDestination] = useState("");
  const [draftSites, setDraftSites] = useState<PartnerLoadingSiteDraft[]>([
    { id: "initial", type: "", customValue: "" },
  ]);
  const [truckDropdownOpen, setTruckDropdownOpen] = useState(false);
  const [siteDropdownIndex, setSiteDropdownIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  // Driver phone: resolve by ID when present, else by NAME from the directory
  // (FO assignment stores driverName only — the phone always lives on the
  // driver row, so matching by name recovers it end-to-end).
  useEffect(() => {
    let cancelled = false;
    const assignedName = trip?.driverName && trip.driverName !== "Unassigned" ? trip.driverName.trim() : "";
    if (!trip?.driverId && !assignedName) {
      setDriverPhone("");
      return;
    }
    void driverService
      .list()
      .then((drivers: Driver[]) => {
        if (cancelled) return;
        const found = trip?.driverId
          ? drivers.find((d) => d.id === trip.driverId)
          : drivers.find((d) => d.name.trim().toLowerCase() === assignedName.toLowerCase());
        setDriverPhone(found?.phone?.trim() || "");
      })
      .catch(() => {
        if (!cancelled) setDriverPhone("");
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.driverId, trip?.driverName]);

  // Tracking Ops checkpoints — polled so Tracking's manual logs appear here live.
  const [checkpoints, setCheckpoints] = useState<LocationCheckpoint[]>([]);
  useEffect(() => {
    if (!trip?.id) return;
    let cancelled = false;
    const load = () => {
      void listCheckpoints(trip.id)
        .then((rows) => {
          if (!cancelled) setCheckpoints(rows);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trip?.id]);

  // Loading sites the request was raised with — the Loading step breaks down
  // per site for multiple-loading requests, not just as free-form checkpoints.
  const loadingSites = useMemo(() => (trip ? tripLoadingSites(trip) : []), [trip]);

  /**
   * Timeline = what the Tracking team has actually logged, with the trip status
   * ladder filling in the gaps. A stage with a checkpoint is no longer "ahead of
   * us", even when the status hasn't advanced yet — that mismatch is why logged
   * stages used to render as empty circles.
   */
  const timeline = useMemo(() => {
    if (!trip) return [];
    const base = partnerRequestTimeline(trip);
    const loggedAt = new Map<TrackingLeg, number>();
    for (const cp of checkpoints) {
      const stage = normalizeLeg(cp.leg);
      const t = new Date(cp.at).getTime();
      if (!Number.isNaN(t) && t > (loggedAt.get(stage) ?? -Infinity)) loggedAt.set(stage, t);
    }
    if (loggedAt.size === 0) return base;

    const settled = trip.status === "Completed";
    const latest = [...loggedAt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return base.map((step) => {
      if (!step.stage) return step;
      const logged = loggedAt.has(step.stage);
      if (!logged) return step;
      if (settled) return { ...step, state: "done" as const };
      if (step.stage === latest && step.state === "pending") return { ...step, state: "current" as const };
      if (step.state === "pending") return { ...step, state: "done" as const };
      return step;
    });
  }, [trip, checkpoints]);
  const uiStatus = trip ? toPartnerStatus(trip.status) : "Pending";
  const truckParts = (trip?.truckReg || "").split(" / ").map((p) => p.trim()).filter(Boolean);
  // Head = PLATE only (truckReg is "PLATE / TAILCODE" — never show the tail code
  // in the head row). Tail = its type, with its code as the serial.
  const truckHead =
    truckParts[0] && truckParts[0] !== "TBD" && !looksLikeUuid(truckParts[0])
      ? truckParts[0]
      : trip
        ? displayPlateFromTrip(trip) || "—"
        : "—";
  // Cap and plate are one husband-and-wife unit — show them side by side.
  const capPlate =
    [trip ? displayCapFromTrip(trip) : "", truckHead].filter(Boolean).join(" · ") || truckHead;
  const truckTail = trip?.tailType || truckParts[1] || "—";
  /** What the partner asked for — distinct from the tail that was fitted. */
  const requestedTruckType = trip ? displayRequestedTruckType(trip) : "";
  const serial = humanCode(trip?.tailNumber) || "—";
  const hasAssignment = Boolean(
    trip && (trip.driverId || (trip.driverName && trip.driverName !== "Unassigned") || trip.truckReg || trip.headId),
  );
  // Live map shows as soon as a truck/driver is assigned — not only once moving.
  // A dispatch the Transport Manager sent back is being reworked — the rejected
  // truck/driver must not be presented to the partner as their assignment.
  const sentBackForCorrection = Boolean(trip?.sendBackReason);
  const showLiveMap =
    !sentBackForCorrection && (uiStatus === "In transit" || uiStatus === "Completed" || hasAssignment);
  const canConfirmArrival = trip
    ? ["En Route", "Loaded", "Scheduled", "Delayed"].includes(trip.status)
    : false;
  // Withdrawable only while the request is still pending — the server refuses a
  // partner edit/delete once the TM or Fleet Ops has acted on it.
  const canDelete = trip ? ["Requested", "Awaiting Approval"].includes(trip.status) : false;
  const canModify = trip ? ["Requested", "Awaiting Approval"].includes(trip.status) : false;

  const openModifyModal = () => {
    if (!trip) return;
    setDraftCustomer(trip.customerConsignee || "");
    setDraftProduct(trip.cargo || "");
    setDraftTruckType(displayRequestedTruckType(trip));
    setDraftDestination(trip.dropoff || "");
    setDraftSites(sitesToDrafts(tripLoadingSites(trip)));
    setTruckDropdownOpen(false);
    setSiteDropdownIndex(null);
    setModifyOpen(true);
  };

  const closeModifyModal = () => {
    setModifyOpen(false);
    setTruckDropdownOpen(false);
    setSiteDropdownIndex(null);
  };

  const saveModify = async () => {
    if (!trip) return;
    const sites = draftSites.map(resolvePartnerLoadingSite).filter(Boolean);
    const unique = new Set(sites.map((s) => s.toLowerCase()));
    if (sites.length > 0 && unique.size !== sites.length) {
      toast.error("Each loading site can only be selected once");
      return;
    }
    if (sites.length === 0) {
      toast.error("Add at least one loading site");
      return;
    }
    if (!draftTruckType.trim()) {
      toast.error("Select a truck type");
      return;
    }
    setSaving(true);
    try {
      const updated = await tripService.updateTrip(trip.id, {
        customerConsignee: draftCustomer.trim(),
        cargo: draftProduct.trim(),
        // The REQUEST's truck type — never `tailType`, which belongs to the
        // tail Fleet Ops assigned (a partner edit must not touch that).
        requestedTruckType: draftTruckType.trim(),
        dropoff: draftDestination.trim(),
        pickup: sites[0] || trip.pickup,
        loadingSite: sites,
        // The correction answers the Transport Manager's note — clear it so the
        // "Action" flag does not outlive the fix.
        partnerNote: null,
      });
      setTrip(updated);
      try {
        sessionStorage.setItem(`fleetopsx_partner_trip_${updated.id}`, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      closeModifyModal();
      toast.success("Request updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!trip) return;
    const rows = [
      ["Ticket", displayRequestId(trip)],
      ["Status", uiStatus],
      ["Customer Name", trip.customerConsignee || ""],
      ["Product", trip.cargo],
      ["Truck Type", requestedTruckType],
      ["Destination", trip.dropoff],
      ...loadingSites.map((site, i) => [`Loading Site ${i + 1}`, site]),
      ["Driver", trip.driverName || ""],
      ["Truck Head (Cap Number / Plate)", capPlate],
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

  const inputClass =
    "flex h-10 w-full items-center rounded border border-[#E2E5E9] bg-white px-3 text-[14px] tracking-[0.4px] text-[#1B2432] shadow-[0px_4px_10px_rgba(0,0,0,0.05)] outline-none focus:border-[#1B2432]";

  return (
    <PartnerPortalShell>
      {loading ? (
        <div className="p-8">
          <FigmaLoadingState label="Loading request…" />
        </div>
      ) : !trip ? (
        <div className="p-8">
          <FigmaEmptyState title="Request not found" body="We couldn't find this request. It may have been removed or the link is incorrect." />
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
            <div className="flex flex-wrap items-center gap-3 sm:gap-[30px]">
              {canModify ? (
                <button
                  type="button"
                  onClick={openModifyModal}
                  className="flex h-8 items-center gap-[5px] rounded bg-[#1B2432] px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-white lg:bg-transparent lg:text-[#1B2432]"
                >
                  <Pencil className="size-[16px]" />
                  Modify
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleExport}
                className="flex h-8 items-center gap-[5px] rounded bg-[#1B2432] px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-white"
              >
                <Upload className="size-[18px]" />
                Export CSV
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

          {/* The Transport Manager returned this request for correction — say so
              up front, and say why, before the partner reads anything else. */}
          {trip.partnerNote ? (
            <div className="w-full rounded-[10px] border border-[#F5B5AA] bg-[#FDECEA] p-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-[#B42318]">
                Action required — returned by the Transport Manager
              </p>
              <p className="mt-1 text-[14px] text-[#7A271A]">{trip.partnerNote}</p>
              <p className="mt-1 text-[12px] text-[#7A271A]/80">
                Correct the details below and save — this stays the same request, nothing has to be raised again.
              </p>
            </div>
          ) : null}

          <div className="grid w-full min-w-0 gap-5 lg:grid-cols-2 lg:gap-[35px]">
            {/* Request Details — Figma 356:9825 */}
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-5">
                  <ReadonlyField label="Product" value={trip.cargo} />
                  <ReadonlyField label="Truck Type" value={requestedTruckType} />
                </div>
                <ReadonlyField label="Destination" value={trip.dropoff} />
                {/* One label, then each site in its own field (stacked) */}
                <div className="flex w-full min-w-0 flex-col gap-1.5">
                  <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">
                    Loading Site(s)
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {(loadingSites.length > 0 ? loadingSites : ["—"]).map((site, index) => (
                      <div
                        key={`${site}-${index}`}
                        className="flex min-h-10 w-full items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]"
                      >
                        {site}
                      </div>
                    ))}
                  </div>
                </div>
                {canDelete ? <SectionActions onDelete={() => setDeleteOpen(true)} /> : null}
              </div>
            </section>

            {/* Real-Time Tracking — Figma `356:9890` / pending `356:9825` */}
            <section className="flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border border-white bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]">
              <div className="border-b border-[#5C6470]/40 px-5 py-2.5">
                <h3 className="text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
                  Real-Time Tracking
                </h3>
              </div>
              <div
                className={cn(
                  "relative flex min-h-[280px] flex-1 items-center justify-center sm:min-h-[419px]",
                  showLiveMap ? "bg-[#E8ECF0]" : "bg-white",
                )}
              >
                {showLiveMap ? (
                  <PartnerLiveMap trip={trip} checkpoints={checkpoints} />
                ) : (
                  <div className="relative z-[1] flex w-full max-w-[355px] flex-col items-center justify-center gap-[15px] px-6 text-center">
                    <p className="text-[14px] font-medium leading-[17.5px] tracking-[0.4px] text-[#5C6470]">
                      Awaiting Assignment
                    </p>
                    <p className="text-[10px] font-medium leading-normal text-[rgba(92,100,112,0.3)]">
                      Live tracking will begin once a truck has been assigned and the request is approved.
                    </p>
                  </div>
                )}
              </div>
              <div className="h-12 shrink-0 border-t border-[#5C6470]/40 px-5" />
              {canDelete ? (
                <div className="flex w-full items-center justify-end gap-[30px] px-5 pb-5">
                  <SectionActions onDelete={() => setDeleteOpen(true)} />
                </div>
              ) : null}
            </section>

            {/* Assignment Details */}
            <section className="w-full min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-[15px] shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)]">
              <div className="mb-4 w-full border-b border-[#E2E5E9] py-2">
                <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Assignment Details</h3>
              </div>
              {trip.status === "Requested" ||
              trip.status === "Awaiting Approval" ||
              sentBackForCorrection ||
              trip.status === "Stopped" ||
              (!trip.driverId && (!trip.driverName || trip.driverName === "Unassigned")) ? (
                <div className="px-4 py-10 text-center text-[14px] font-normal italic tracking-[0.4px] text-[#5C6470]">
                  {sentBackForCorrection
                    ? "With Fleet Operations for correction — a new truck and driver will be assigned."
                    : trip.status === "Requested"
                      ? "Awaiting Transport Manager approval and assignment."
                      : "Approved — awaiting fleet assignment of driver and truck."}
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <ReadonlyField
                    label="Driver Name"
                    value={trip.driverName && trip.driverName !== "Unassigned" ? trip.driverName : "—"}
                  />
                  <ReadonlyField label="Driver Phone Number" value={driverPhone || "—"} />
                  <ReadonlyField label="Truck Head (Cap Number / Plate)" value={capPlate} />
                  <ReadonlyField label="Truck Tail (Type)" value={truckTail} />
                  <ReadonlyField label="Serial Number" value={serial} />
                </div>
              )}
              {canDelete ? <SectionActions onDelete={() => setDeleteOpen(true)} /> : null}
            </section>

            {/* Request Timeline */}
            <section className="w-full min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-2.5 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_16px_rgba(12,12,13,0.1)] sm:px-[30px]">
              <div className="mb-5 w-full border-b border-[#E2E5E9] py-2">
                <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Request Timeline</h3>
              </div>
              <div className="relative flex flex-col gap-5 pb-4">
                <div className="absolute bottom-6 left-[9px] top-2 w-px bg-[#E2E5E9]" />
                {timeline.map((step) => {
                  const done = step.state === "done";
                  const current = step.state === "current";
                  const seen = step.state === "seen";
                  // Green = completed / in progress, ORANGE = first approval only
                  // ("Seen"), red only on decline, grey for what's still ahead.
                  const dotClass =
                    uiStatus === "Declined" && current
                      ? "bg-[#ED351D]"
                      : seen
                        ? "bg-[#F99E1F]"
                        : done || (current && uiStatus !== "Declined")
                          ? "bg-[#0ACF83]"
                          : "bg-[#D1D5DB]";
                  const labelClass =
                    uiStatus === "Declined" && current
                      ? "text-[#ED351D]"
                      : seen
                        ? "text-[#F99E1F]"
                        : done || (current && uiStatus !== "Declined")
                          ? "text-[#1B2432]"
                          : "text-[#5C6470]";
                  const isDestination = step.label === "At Destination";
                  // Sub-dots for this step. Loading breaks down PER REQUESTED SITE
                  // (a multiple-loading request lists every site, outstanding ones
                  // included); other stages are the locations Tracking logged.
                  const dots = step.stage ? stageDots(step.stage, loadingSites, checkpoints) : [];
                  const loggedDots = dots.filter((d) => d.logged);
                  const latestDotKey = loggedDots[0]?.key;
                  const siteTotal = step.stage === "Loading" ? loadingSites.length : 0;
                  // Every step shows a timestamp: lifecycle stamps for the early
                  // steps, the newest logged checkpoint for each tracking stage.
                  const stepStamp = loggedDots[0] ? stampLabel(loggedDots[0].at) : step.at;
                  return (
                    <div key={step.label} className="relative flex items-start gap-[50px]">
                      <div
                        className={cn(
                          "relative z-[1] mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full",
                          dotClass,
                        )}
                      >
                        {done || current || seen ? (
                          <Check className="size-2.5 text-white" strokeWidth={3} />
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className={cn("text-[14px] font-normal tracking-[0.4px]", labelClass)}>{step.label}</p>
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
                        {stepStamp ? (
                          <p className="text-[10px] font-normal text-[rgba(92,100,112,0.6)]">{stepStamp}</p>
                        ) : null}
                        {siteTotal > 0 ? (
                          <p className="text-[10px] font-medium text-[#5C6470]">
                            {loggedDots.length} of {siteTotal} site{siteTotal === 1 ? "" : "s"} loaded
                          </p>
                        ) : null}
                        {dots.length > 0 && (
                          <div className="relative mt-1 flex flex-col gap-2 pl-1">
                            {dots.map((cp, i) => (
                              <div key={cp.key || i} className="flex items-center gap-2.5">
                                {cp.logged ? (
                                  <span
                                    className={cn(
                                      "size-2 shrink-0 rounded-full",
                                      i === 0 ? "bg-[#0ACF83]" : "bg-[#0ACF83]/45",
                                    )}
                                  />
                                ) : (
                                  <span
                                    className="size-2 shrink-0 rounded-full border border-[#C6CAD1] bg-transparent"
                                    title="Not logged yet"
                                  />
                                )}
                                <span
                                  className={cn(
                                    "text-[11px] font-medium tracking-[0.4px]",
                                    cp.logged ? "text-[#344256]" : "text-[#8E95A1]",
                                  )}
                                >
                                  {cp.label}
                                </span>
                                {!cp.logged ? (
                                  <span className="text-[10px] font-medium text-[#8E95A1]">
                                    awaiting log
                                  </span>
                                ) : null}
                                {cp.at ? (
                                  <span className="text-[10px] text-[rgba(92,100,112,0.6)]">
                                    {new Date(cp.at).toLocaleString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ) : null}
                                {cp.logged && cp.key === latestDotKey ? (
                                  <span className="rounded bg-[#0ACF83]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-[#0ACF83]">
                                    Latest
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {canDelete ? <SectionActions onDelete={() => setDeleteOpen(true)} /> : null}
            </section>
          </div>
        </main>
      )}

      {/* Modify — center modal; Truck Type + Loading Sites are dropdowns (same lists as New Request) */}
      {modifyOpen && trip ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-[490px] flex-col gap-[15px] overflow-y-auto rounded-[10px] bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
            <div className="w-full border-b border-[#E2E5E9]">
              <h3 className="h-8 text-[16px] font-semibold tracking-[0.4px] text-[#ED351D]">Modify Request</h3>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Customer Name</span>
                <input
                  value={draftCustomer}
                  onChange={(e) => setDraftCustomer(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Figma Partner Request Details: Product + Truck Type share one row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Product</span>
                  <input
                    value={draftProduct}
                    onChange={(e) => setDraftProduct(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className={cn("relative flex min-w-0 flex-col gap-1.5", truckDropdownOpen ? "z-40" : "z-10")}>
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Truck Type</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTruckDropdownOpen((o) => !o);
                      setSiteDropdownIndex(null);
                    }}
                    className={cn(inputClass, "justify-between")}
                  >
                    <span className={draftTruckType ? "text-[#1B2432]" : "text-[#5C6470]"}>
                      {draftTruckType || "Select"}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-[#5C6470]" />
                  </button>
                  {truckDropdownOpen ? (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                      {PARTNER_TRUCK_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setDraftTruckType(opt);
                            setTruckDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2.5 text-left text-[14px]",
                            draftTruckType === opt ? "bg-[#ED351D] text-white" : "text-[#1B2432] hover:bg-[#F1F2F4]",
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Destination</span>
                <input
                  value={draftDestination}
                  onChange={(e) => setDraftDestination(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Select Loading Site</span>
                {draftSites.map((site, index) => {
                  const display =
                    site.type === "Others"
                      ? site.customValue.trim() || "Others"
                      : site.type || "Select";
                  return (
                    <div
                      key={site.id}
                      className={cn(
                        "relative flex flex-col gap-2",
                        siteDropdownIndex === index ? "z-50" : "z-10",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSiteDropdownIndex(siteDropdownIndex === index ? null : index);
                            setTruckDropdownOpen(false);
                          }}
                          className={cn(inputClass, "flex-1 justify-between")}
                        >
                          <span className={site.type ? "text-[#1B2432]" : "text-[#5C6470]"}>{display}</span>
                          <ChevronDown className="size-4 shrink-0 text-[#5C6470]" />
                        </button>
                        {draftSites.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setDraftSites((prev) => prev.filter((_, i) => i !== index))}
                            className="rounded p-2 hover:bg-black/5"
                            aria-label="Remove loading site"
                          >
                            <Trash2 className="size-5 text-[#ED351D]" />
                          </button>
                        ) : null}
                      </div>
                      {siteDropdownIndex === index ? (
                        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[220px] overflow-y-auto overscroll-contain rounded border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                          {PARTNER_LOADING_SITE_OPTIONS.map((opt) => {
                            const takenElsewhere = draftSites.some((s, i) => {
                              if (i === index) return false;
                              if (opt === "Others") return false;
                              return s.type === opt;
                            });
                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={takenElsewhere}
                                onClick={() => {
                                  if (takenElsewhere) return;
                                  setDraftSites((prev) =>
                                    prev.map((s, i) =>
                                      i === index
                                        ? {
                                            id: s.id,
                                            type: opt,
                                            customValue: opt === "Others" ? s.customValue : "",
                                          }
                                        : s,
                                    ),
                                  );
                                  setSiteDropdownIndex(null);
                                }}
                                className={cn(
                                  "w-full px-3 py-2.5 text-left text-[14px]",
                                  takenElsewhere
                                    ? "cursor-not-allowed text-[#A8AEB7] opacity-50"
                                    : site.type === opt
                                      ? "bg-[#ED351D] text-white"
                                      : "text-[#1B2432] hover:bg-[#F1F2F4]",
                                )}
                              >
                                {opt}
                                {takenElsewhere ? " (already selected)" : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {site.type === "Others" ? (
                        <input
                          value={site.customValue}
                          onChange={(e) =>
                            setDraftSites((prev) =>
                              prev.map((s, i) => (i === index ? { ...s, customValue: e.target.value } : s)),
                            )
                          }
                          placeholder="Enter loading site name"
                          className={inputClass}
                        />
                      ) : null}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setDraftSites((prev) => [
                      ...prev,
                      { id: crypto.randomUUID(), type: "", customValue: "" },
                    ])
                  }
                  className="self-start text-[13px] font-medium tracking-[0.4px] text-[#ED351D]"
                >
                  + Add loading site
                </button>
              </div>
            </div>

            <div className="flex w-full items-center justify-between border-t border-[#E2E5E9] pt-3">
              <button
                type="button"
                onClick={closeModifyModal}
                disabled={saving}
                className="flex h-10 w-[149px] items-center justify-center rounded px-3 text-[14px] font-medium tracking-[0.4px] text-[#ED351D]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveModify()}
                disabled={saving}
                className="flex h-10 items-center justify-center rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save your changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                className="h-10 flex-1 rounded bg-[#ED351D] hover:bg-[#d62e19] text-[14px] font-medium text-white"
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
