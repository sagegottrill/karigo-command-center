import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingSitesManager } from "@/components/fleetopsx/loading-sites-manager";
import {
  ADD_LOADING_SITE_LABEL,
  isAddingLoadingSite,
  loadingSiteChoices,
  PARTNER_TRUCK_TYPE_OPTIONS,
  resolvePartnerLoadingSite,
  type PartnerLoadingSiteDraft,
} from "@/lib/fleetopsx/partner-request-options";
import { notificationService, orderService, partnerSiteService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";

/**
 * Petroline's own haulage, raised from the Transport Manager's portal.
 *
 * Everything a partner submits has to pass through this portal anyway — and when
 * the job is OUR job (Petroline hauling for its own customers) the same lifecycle
 * is what captures the cost: the request is approved, Fleet Ops assigns the truck,
 * the turnaround comes back for the final approval, and the direct costs are
 * booked against the trip like any other load. A request typed anywhere else
 * would never enter that pipeline.
 *
 * It is filed under the partner name below, so the queue, the company filter and
 * the CSV all show exactly whose job it is.
 */
export const Route = createFileRoute("/workspace/app/new-request")({
  component: TransportManagerNewRequest,
});

/** The company this request belongs to — our own, not a partner's. */
export const INTERNAL_REQUEST_COMPANY = "Petroline";

type LoadingSite = PartnerLoadingSiteDraft;

const inputClass =
  "h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]";
const selectClass = `${inputClass} appearance-none`;

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
        {label}
        {required ? <span className="text-[#ED351D]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-[#5C6470]">{hint}</span> : null}
    </label>
  );
}

function TransportManagerNewRequest() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [customerConsignee, setCustomerConsignee] = useState("");
  const [product, setProduct] = useState("");
  const [truckType, setTruckType] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [routingType, setRoutingType] = useState<"Single" | "Multiple">("Single");
  const [loadingSites, setLoadingSites] = useState<LoadingSite[]>([
    { id: "initial", type: "", customValue: "" },
  ]);
  // OUR saved loading sites. Scoped to the internal company, so a yard typed once
  // is offered on the next internal request instead of being retyped.
  const [savedSites, setSavedSites] = useState<string[]>([]);

  useEffect(() => {
    void partnerSiteService
      .list(INTERNAL_REQUEST_COMPANY)
      .then(setSavedSites)
      .catch(() => setSavedSites([]));
  }, []);

  const setSite = (index: number, patch: Partial<LoadingSite>) =>
    setLoadingSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerConsignee.trim() || !product.trim() || !truckType || !destination.trim()) {
      toast.error("Please fill the customer, product, truck type and destination.");
      return;
    }

    const finalSites = loadingSites.map(resolvePartnerLoadingSite).filter(Boolean);
    if (finalSites.length === 0 || (routingType === "Multiple" && finalSites.length !== loadingSites.length)) {
      toast.error("Please specify every loading site.");
      return;
    }
    if (new Set(finalSites.map((s) => s.toLowerCase())).size !== finalSites.length) {
      toast.error("Each loading site can only be selected once.");
      return;
    }

    const pickup = finalSites[0];
    if (!pickup) {
      toast.error("Please specify a loading site.");
      return;
    }

    setSubmitting(true);
    try {
      const newlyAdded = finalSites.filter(
        (site) => !savedSites.some((known) => known.toLowerCase() === site.toLowerCase()),
      );
      await Promise.all(
        newlyAdded.map((site) => partnerSiteService.add(site, INTERNAL_REQUEST_COMPANY).catch(() => null)),
      );
      if (newlyAdded.length) setSavedSites((prev) => [...prev, ...newlyAdded]);

      await orderService.submitCustomerOrder({
        // The partner name the queue, the company filter and the CSV all read.
        customer: INTERNAL_REQUEST_COMPANY,
        customerConsignee: customerConsignee.trim(),
        cargo: product.trim(),
        requestedTruckType: truckType,
        tailType: truckType,
        loadingRoutingType: routingType,
        loadingSite: finalSites,
        pickup,
        dropoff: destination.trim(),
        dropoffAddress: destinationAddress.trim(),
      });

      void notificationService
        .create({
          title: "New Internal Request",
          body: `Petroline request for ${customerConsignee.trim()} — ${product.trim()} to ${destination.trim()}.`,
          category: "Approvals",
        })
        .catch(() => {});

      toast.success("Request raised — it is now in Partner Requests for approval.");
      navigate({ to: "/workspace/app/partner-requests" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit the request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">New Delivery Request</h2>
        <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
          raise a request for {INTERNAL_REQUEST_COMPANY}'s own haulage
        </p>
      </div>

      {/* Why this screen exists: an internal job raised anywhere else never enters
          the pipeline, so its cost is never captured. */}
      <div className="rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 text-[13px] text-[#5C6470]">
        Filed under partner <span className="font-semibold text-[#1B2432]">{INTERNAL_REQUEST_COMPANY}</span> — it
        enters the same lifecycle as a partner request (approval → Fleet Ops assignment → final approval), which
        is what gets the diesel, allowance and waybill cost booked against the trip.
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        <section className="rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <h3 className="border-b border-[#E2E5E9] pb-2 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            Request Details
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Customer Name (Consignee)" required hint="Who Petroline is hauling for.">
              <input
                value={customerConsignee}
                onChange={(e) => setCustomerConsignee(e.target.value)}
                placeholder="example: Dangote"
                className={inputClass}
              />
            </Field>
            <Field label="Product" required>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="example: Steel"
                className={inputClass}
              />
            </Field>
            <Field label="Truck Type" required>
              <select value={truckType} onChange={(e) => setTruckType(e.target.value)} className={selectClass}>
                <option value="">Select</option>
                {PARTNER_TRUCK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Final Destination" required>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="example: Kute, Abuja"
                className={inputClass}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Destination Address (optional)" hint="Leave blank if it is not known yet.">
                <input
                  value={destinationAddress}
                  onChange={(e) => setDestinationAddress(e.target.value)}
                  placeholder="example: 12 Kute Road, off Airport Road"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <h3 className="border-b border-[#E2E5E9] pb-2 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            Loading Sites
          </h3>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Routing Type</span>
              <div className="flex flex-wrap gap-5">
                {(["Single", "Multiple"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setRoutingType(type);
                      if (type === "Single") {
                        setLoadingSites([
                          loadingSites[0] ?? { id: crypto.randomUUID(), type: "", customValue: "" },
                        ]);
                      }
                    }}
                    className="flex items-center gap-3"
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-full border",
                        routingType === type ? "border-[#ED351D]" : "border-[#E2E5E9]",
                      )}
                    >
                      {routingType === type ? <span className="size-2.5 rounded-full bg-[#ED351D]" /> : null}
                    </span>
                    <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                      {type === "Single" ? "Single Site Loading" : "Multiple Site Loading"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Select Loading Site</span>
              {loadingSites.map((site, index) => (
                <div key={site.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <select
                      value={site.type}
                      onChange={(e) =>
                        setSite(index, {
                          type: e.target.value,
                          customValue: isAddingLoadingSite(e.target.value) ? site.customValue : "",
                        })
                      }
                      className={selectClass}
                    >
                      <option value="">Select</option>
                      {loadingSiteChoices(savedSites).map((opt) => {
                        const takenElsewhere = loadingSites.some((s, i) => {
                          if (i === index) return false;
                          if (isAddingLoadingSite(opt)) return false;
                          return s.type === opt;
                        });
                        return (
                          <option key={opt} value={opt} disabled={takenElsewhere}>
                            {opt}
                            {takenElsewhere ? " (already selected)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    {routingType === "Multiple" && loadingSites.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setLoadingSites(loadingSites.filter((_, i) => i !== index))}
                        className="grid size-10 shrink-0 place-items-center rounded border border-[#E2E5E9]"
                        aria-label="Remove this loading site"
                      >
                        <Trash2 className="size-4 text-[#ED351D]" />
                      </button>
                    ) : null}
                  </div>
                  {isAddingLoadingSite(site.type) ? (
                    <input
                      value={site.customValue}
                      onChange={(e) => setSite(index, { customValue: e.target.value })}
                      onBlur={() => {
                        const custom = site.customValue.trim().toLowerCase();
                        if (!custom) return;
                        const duplicate = loadingSites.some((s, i) => {
                          if (i === index) return false;
                          const other = (s.type === "Others" ? s.customValue : s.type).trim().toLowerCase();
                          return Boolean(other) && other === custom;
                        });
                        if (duplicate) {
                          toast.error("Each loading site can only be selected once");
                          setSite(index, { customValue: "" });
                        }
                      }}
                      placeholder="Enter the specific loading address"
                      className={inputClass}
                    />
                  ) : null}
                </div>
              ))}

              {savedSites.length === 0 ? (
                <p className="text-[11px] tracking-[0.4px] text-[#5C6470]">
                  No internal loading site saved yet — choose “{ADD_LOADING_SITE_LABEL}”, type the yard, and it is
                  offered on the next internal request.
                </p>
              ) : null}
              <LoadingSitesManager sites={savedSites} onChange={setSavedSites} />
              {routingType === "Multiple" ? (
                <button
                  type="button"
                  onClick={() =>
                    setLoadingSites([...loadingSites, { id: crypto.randomUUID(), type: "", customValue: "" }])
                  }
                  className="flex h-10 items-center justify-center gap-1.5 rounded bg-[#1B2432] px-6 text-[14px] font-medium text-white"
                >
                  <Plus className="size-4" />
                  Add Another Site
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/workspace/app/partner-requests" })}
            className="h-10 rounded border border-[#E2E5E9] px-4 text-[14px] font-medium text-[#1B2432]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded bg-[#ED351D] px-4 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19] disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
