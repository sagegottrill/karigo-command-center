import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, MapPin, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import {
  PARTNER_LOADING_SITE_OPTIONS,
  PARTNER_TRUCK_TYPE_OPTIONS,
  resolvePartnerLoadingSite,
  type PartnerLoadingSiteDraft,
} from "@/lib/fleetopsx/partner-request-options";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/$requestId")({
  component: PartnerRequestDetailsPage,
});

type PartnerUiStatus = "Pending" | "Declined" | "In transit" | "Completed";

/** Split joined site strings so each site is its own field (Figma 356:9825). */
function normalizeLoadingSites(trip: Trip | null | undefined): string[] {
  if (!trip) return [];
  const raw =
    trip.loadingSite && trip.loadingSite.length > 0
      ? trip.loadingSite
      : trip.pickup
        ? [trip.pickup]
        : [];
  const sites: string[] = [];
  for (const entry of raw) {
    const parts = String(entry)
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (!sites.some((s) => s.toLowerCase() === part.toLowerCase())) {
        sites.push(part);
      }
    }
  }
  return sites;
}

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

  const timeline = useMemo(() => (trip ? tripService.timeline(trip) : []), [trip]);
  const uiStatus = trip ? toPartnerStatus(trip.status) : "Pending";
  const loadingSites = normalizeLoadingSites(trip);
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
  const canModify = trip ? ["Requested", "Awaiting Approval"].includes(trip.status) : false;

  const openModifyModal = () => {
    if (!trip) return;
    setDraftCustomer(trip.customerConsignee || "");
    setDraftProduct(trip.cargo || "");
    setDraftTruckType(trip.tailType || "");
    setDraftDestination(trip.dropoff || "");
    setDraftSites(sitesToDrafts(normalizeLoadingSites(trip)));
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
        tailType: draftTruckType.trim(),
        dropoff: draftDestination.trim(),
        pickup: sites[0] || trip.pickup,
        loadingSite: sites,
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
      ["Truck Type", trip.tailType || ""],
      ["Destination", trip.dropoff],
      ...loadingSites.map((site, i) => [`Loading Site ${i + 1}`, site]),
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
            <div className="flex flex-wrap items-center gap-3 sm:gap-[30px]">
              {canModify ? (
                <button
                  type="button"
                  onClick={openModifyModal}
                  className="flex h-8 items-center gap-[5px] rounded px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-[#1B2432]"
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
                  <ReadonlyField label="Truck Type" value={trip.tailType} />
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
                  <div className="relative z-[1] flex max-w-sm flex-col items-center gap-[15px] px-6 text-center">
                    <p className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">Awaiting Assignment</p>
                    <p className="text-[10px] font-medium text-[rgba(92,100,112,0.3)]">
                      Live tracking will begin once a truck has been assigned and the request is approved.
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
                  <ReadonlyField
                    label="Driver Name"
                    value={trip.driverName && trip.driverName !== "Unassigned" ? trip.driverName : "—"}
                  />
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
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Product</span>
                <input
                  value={draftProduct}
                  onChange={(e) => setDraftProduct(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className={cn("relative flex flex-col gap-1.5", truckDropdownOpen ? "z-40" : "z-10")}>
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

            <div className="flex w-full items-center justify-end gap-3 border-t border-[#E2E5E9] pt-3">
              <button
                type="button"
                onClick={closeModifyModal}
                disabled={saving}
                className="h-8 px-3 text-[14px] font-medium tracking-[0.4px] text-[#ED351D]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveModify()}
                disabled={saving}
                className="flex h-8 w-[119px] items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
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
