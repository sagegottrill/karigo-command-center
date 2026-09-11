import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PartnerPortalShell } from "@/components/fleetopsx/partner-portal-shell";
import { orderService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/request")({
  component: PartnerNewRequest,
});

const TRUCK_TYPE_OPTIONS = [
  "Full Sided",
  "Semi Sided",
  "Flat",
  "Side Guide",
  "Low Bed",
  "6 Meter Truck",
  "8 Meter Truck",
  "Pick Up",
];

const LOADING_SITE_OPTIONS = [
  "Comfortoboh",
  "Happy Home",
  "Ijesha.1",
  "Babangida.1",
  "Babangida.2",
  "Ijesha.2",
  "Babangida.3",
  "Metalberg.K",
  "Saba Factory",
  "Others",
];

type LoadingSite = { id: string; type: string; customValue: string };

const inputClass =
  "h-10 w-full rounded border border-[#E2E5E9] bg-white px-3 text-[14px] tracking-[0.4px] text-[#1B2432] shadow-[0px_4px_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]";

function PartnerNewRequest() {
  const navigate = useNavigate();
  const [customerConsignee, setCustomerConsignee] = useState("");
  const [product, setProduct] = useState("");
  const [truckType, setTruckType] = useState("");
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const [destination, setDestination] = useState("");
  const [routingType, setRoutingType] = useState<"Single" | "Multiple">("Single");
  const [loadingSites, setLoadingSites] = useState<LoadingSite[]>([
    { id: "initial", type: "", customValue: "" },
  ]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerConsignee || !truckType || !destination) {
      toast.error("Please fill all required fields");
      return;
    }

    const finalSites = loadingSites
      .map((s) => (s.type === "Others" ? s.customValue : s.type))
      .filter(Boolean);

    if (finalSites.length === 0 || (routingType === "Multiple" && finalSites.length !== loadingSites.length)) {
      toast.error("Please specify all loading sites");
      return;
    }

    const pickup = finalSites[0];
    if (!pickup) {
      toast.error("Please specify a loading site");
      return;
    }

    setSubmitting(true);
    try {
      await orderService.submitCustomerOrder({
        customerConsignee,
        cargo: product || "—",
        tailType: truckType,
        loadingRoutingType: routingType,
        loadingSite: finalSites,
        pickup,
        dropoff: destination,
      });
      toast.success("Request submitted to Fleet Operations");
      navigate({ to: "/workspace/customer-portal/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PartnerPortalShell>
      <main className="flex flex-col gap-[25px] px-[30px] py-5 max-md:px-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">New Delivery Request</h2>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Submit delivery requests
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <section className="rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-6 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_32px_rgba(12,12,13,0.1)]">
            <h3 className="border-b border-[#E2E5E9] pb-2 text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
              Request Details
            </h3>
            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Customer Name (Consignee) <span className="text-[#ED351D]">*</span>
                </span>
                <input
                  value={customerConsignee}
                  onChange={(e) => setCustomerConsignee(e.target.value)}
                  placeholder="example: J.Doe"
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">Product</span>
                <input
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="example: Steel"
                  className={inputClass}
                />
              </label>

              <div className="relative flex flex-col gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Select Truck Type <span className="text-[#ED351D]">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowTruckDropdown((v) => !v);
                    setOpenDropdownIndex(null);
                  }}
                  className={cn(inputClass, "flex items-center justify-between")}
                >
                  <span className={truckType ? "text-[#1B2432]" : "text-[#5C6470]"}>{truckType || "Select"}</span>
                  <ChevronDown className="size-4 text-[#5C6470]" />
                </button>
                {showTruckDropdown && (
                  <div className="absolute left-0 right-0 top-[72px] z-40 overflow-hidden rounded border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                    {TRUCK_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setTruckType(opt);
                          setShowTruckDropdown(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2.5 text-left text-[14px]",
                          truckType === opt ? "bg-[#ED351D] text-white" : "text-[#1B2432] hover:bg-[#F1F2F4]",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-3">
                <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Final Destination <span className="text-[#ED351D]">*</span>
                </span>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="example: Kute, Abuja"
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-[10px] border border-[#E2E5E9] bg-white px-5 py-6 shadow-[0px_4px_4px_rgba(12,12,13,0.05),0px_16px_32px_rgba(12,12,13,0.1)]">
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
                          setLoadingSites([loadingSites[0] ?? { id: crypto.randomUUID(), type: "", customValue: "" }]);
                        }
                      }}
                      className="flex items-center gap-3 rounded-md p-3"
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
                  <div key={site.id} className={cn("relative flex flex-col gap-2", openDropdownIndex === index ? "z-50" : "z-10")}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDropdownIndex(openDropdownIndex === index ? null : index);
                          setShowTruckDropdown(false);
                        }}
                        className={cn(inputClass, "flex flex-1 items-center justify-between")}
                      >
                        <span className={site.type ? "text-[#1B2432]" : "text-[#5C6470]"}>{site.type || "Select"}</span>
                        <ChevronDown className="size-4 text-[#5C6470]" />
                      </button>
                      {routingType === "Multiple" && loadingSites.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLoadingSites(loadingSites.filter((_, i) => i !== index))}
                          className="rounded p-2 hover:bg-black/5"
                        >
                          <Trash2 className="size-5 text-[#ED351D]" />
                        </button>
                      ) : null}
                    </div>
                    {openDropdownIndex === index ? (
                      <div className="absolute left-0 right-0 top-11 z-40 max-h-[250px] overflow-y-auto rounded border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(0,0,0,0.1)]">
                        {LOADING_SITE_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setLoadingSites((prev) =>
                                prev.map((s, i) =>
                                  i === index
                                    ? { id: s.id, type: opt, customValue: opt === "Others" ? s.customValue : "" }
                                    : s,
                                ),
                              );
                              setOpenDropdownIndex(null);
                            }}
                            className={cn(
                              "w-full px-3 py-2.5 text-left text-[14px]",
                              site.type === opt ? "bg-[#ED351D] text-white" : "text-[#1B2432] hover:bg-[#F1F2F4]",
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {site.type === "Others" ? (
                      <input
                        value={site.customValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLoadingSites((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, customValue: value } : s)),
                          );
                        }}
                        placeholder="Enter specific loading address"
                        className={inputClass}
                      />
                    ) : null}
                  </div>
                ))}
                {routingType === "Multiple" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLoadingSites([...loadingSites, { id: crypto.randomUUID(), type: "", customValue: "" }])
                    }
                    className="flex h-10 items-center justify-center rounded bg-[#1B2432] px-6 text-[14px] font-medium text-white"
                  >
                    Add Another Site
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex h-10 w-full items-center justify-center rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white disabled:opacity-60 sm:w-[149px]"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </main>

      {(showTruckDropdown || openDropdownIndex !== null) && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => {
            setShowTruckDropdown(false);
            setOpenDropdownIndex(null);
          }}
        />
      )}
    </PartnerPortalShell>
  );
}
