import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/partner-requests")({
  component: AdminPartnerRequests,
});

const PAGE_SIZE = 4;

function isPartnerRequest(trip: Trip) {
  return trip.status === "Requested" || trip.customer === "Customer Portal";
}

function requestId(trip: Trip) {
  if (/^REQ-/i.test(trip.id)) return trip.id;
  const digits = trip.id.replace(/\D/g, "").slice(-5) || trip.id.slice(-5);
  return `REQ-${digits.padStart(5, "0")}`;
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">{label}</span>
      <div className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470]">
        {value}
      </div>
    </div>
  );
}

function loadingSitesFor(trip: Trip): string[] {
  const fromArray = (trip.loadingSite ?? []).map((s) => s.trim()).filter(Boolean);
  if (fromArray.length > 0) return fromArray;
  const raw = trip.pickup?.trim() ?? "";
  if (!raw) return [];
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function AdminPartnerRequests() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<Trip | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void tripService
      .list()
      .then(setTrips)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const listing = useMemo(
    () => trips.filter((t) => isPartnerRequest(t) && t.status === "Requested"),
    [trips],
  );

  const filtered = listing.filter((t) => {
    const hay = `${requestId(t)} ${t.customer} ${t.customerConsignee ?? ""} ${t.cargo} ${t.tailType ?? ""} ${t.dropoff}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers = "Request ID,Partner,Customer Name,Product,Truck Type,Destination\n";
    const csv = filtered
      .map(
        (t) =>
          `${requestId(t)},${t.customer === "Customer Portal" ? "" : t.customer},${t.customerConsignee ?? ""},${t.cargo},${t.tailType ?? ""},${t.dropoff}`,
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partner_requests.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const handleApprove = async (trip: Trip) => {
    setMenuFor(null);
    await tripService.initialApprove(trip.id);
    toast.success(`Request ${requestId(trip)} approved.`);
    void tripService.list().then(setTrips);
  };

  const handleDecline = async (trip: Trip) => {
    setMenuFor(null);
    setDetail(null);
    try {
      await tripService.update(trip.id, { status: "Stopped" });
      toast.warning(`Request ${requestId(trip)} declined.`);
      void tripService.list().then(setTrips);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to decline request.");
    }
  };

  return (
    <>
      {/* Figma desktop 480:15293 · mobile 480:16151 */}
      <div className="flex w-full flex-col gap-4 bg-[#F1F2F4] p-4 pb-28 md:gap-5 md:p-[30px] md:pb-[30px]">
        <div className="flex flex-col gap-1 border-b border-[rgba(92,100,112,0.3)] pb-1.5 md:gap-[5px] md:border-0 md:pb-0">
          <div className="flex items-center gap-[5px] md:block">
            <button
              type="button"
              onClick={() => navigate({ to: "/workspace/app" })}
              className="grid size-6 place-items-center text-[#141A1F] md:hidden"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
              Partner Requests
            </h2>
          </div>
          <p className="hidden text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)] md:block">
            take action on partner requests
          </p>
        </div>

        <button
          type="button"
          onClick={exportCSV}
          className="flex h-8 w-full items-center justify-center gap-[5px] rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white md:hidden"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>

        <div className="flex w-full items-center gap-5 md:hidden">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-[22px] -translate-y-1/2 text-[#5C6470]"
              strokeWidth={1.5}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search"
              className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-11 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
            />
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded bg-[#ED351D] text-white"
            aria-label="Filter"
          >
            <SlidersHorizontal className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-[11px] md:hidden">
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching partner requests" : "No partner requests yet"}
              body={
                query
                  ? "Try a different request ID, partner, or destination."
                  : "Delivery requests partners submit will list here from the live API."
              }
            />
          )}
          {slice.map((trip) => {
            const partner = trip.customer === "Customer Portal" ? "" : trip.customer;
            return (
              <div
                key={trip.id}
                className="relative flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">{requestId(trip)}</span>
                  <div ref={menuFor === trip.id ? menuRef : undefined} className="relative">
                    <button
                      type="button"
                      className="grid size-5 place-items-center text-[#1B2432]"
                      onClick={() => setMenuFor((id) => (id === trip.id ? null : trip.id))}
                    >
                      <MoreVertical className="size-5" />
                    </button>
                    {menuFor === trip.id && (
                      <div className="absolute top-6 right-0 z-30 w-[160px] rounded-[6px] bg-white py-2.5 shadow-[0px_4px_4px_rgba(0,0,0,0.15)]">
                        <button
                          type="button"
                          className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
                          onClick={() => {
                            setMenuFor(null);
                            setDetail(trip);
                          }}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
                          onClick={() => void handleApprove(trip)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#ED351D] hover:bg-[#F1F2F4]"
                          onClick={() => handleDecline(trip)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <MetaRow label="Partner:" value={partner} accent />
                <MetaRow label="Name:" value={trip.customerConsignee || ""} />
                <MetaRow label="Product:" value={trip.cargo || ""} />
                <MetaRow label="Truck Type:" value={trip.tailType || ""} />
                <MetaRow label="Destination:" value={trip.dropoff || ""} />
              </div>
            );
          })}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#E2E5E9] pt-2.5">
              <div className="flex items-center gap-2.5 text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                <span>
                  {from} - {to}
                </span>
                <span>of {filtered.length}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:block">
          <div className="mb-4 flex items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <button type="button" className="grid size-9 place-items-center rounded bg-[#ED351D] text-white" aria-label="Filter">
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid grid-cols-[96px_156px_167px_116px_144px_1fr_40px] items-center gap-[30px] border-b border-[#E2E5E9] py-[15px]">
            {["Request ID", "Partner", "Customer Name", "Product", "Truck Type", "Destination"].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
            <span />
          </div>

          {slice.map((trip) => (
            <div
              key={trip.id}
              className="relative grid grid-cols-[96px_156px_167px_116px_144px_1fr_40px] items-center gap-[30px] border-b border-[#E2E5E9] py-2.5"
            >
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{requestId(trip)}</span>
              <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                {trip.customer === "Customer Portal" ? "" : trip.customer}
              </span>
              <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.customerConsignee}</span>
              <span className="text-[12px] tracking-[0.4px] text-[#627084]">{trip.cargo}</span>
              <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.tailType}</span>
              <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
              <div ref={menuFor === trip.id ? menuRef : undefined} className="relative justify-self-end">
                <button
                  type="button"
                  className="grid size-8 place-items-center text-[#1B2432]"
                  onClick={() => setMenuFor((id) => (id === trip.id ? null : trip.id))}
                >
                  <MoreVertical className="size-5" />
                </button>
                {menuFor === trip.id && (
                  <div className="absolute top-8 right-0 z-30 w-[160px] rounded-[6px] bg-white py-2.5 shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)]">
                    <button
                      type="button"
                      className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
                      onClick={() => {
                        setMenuFor(null);
                        setDetail(trip);
                      }}
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#344256] hover:bg-[#F1F2F4]"
                      onClick={() => void handleApprove(trip)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-[137px] items-center px-3 text-[14px] font-medium tracking-[0.4px] text-[#ED351D] hover:bg-[#F1F2F4]"
                      onClick={() => handleDecline(trip)}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching partner requests" : "No partner requests yet"}
              body={
                query
                  ? "Try a different request ID, partner, or destination."
                  : "Delivery requests partners submit will list here from the live API."
              }
            />
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to}
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {filtered.length}</span>
              <div className="ml-2 flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  onClick={exportCSV}
                  className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
                >
                  <Download className="size-[18px]" strokeWidth={1.75} />
                  Export CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex w-[406px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="border-b border-[#E2E5E9] py-2">
              <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">Request Details</h3>
            </div>
            <ReadOnlyField label="Customer Name" value={detail.customerConsignee} />
            <ReadOnlyField label="Product" value={detail.cargo} />
            <ReadOnlyField label="Truck Type" value={detail.tailType} />
            <ReadOnlyField label="Destination" value={detail.dropoff} />
            {loadingSitesFor(detail).length > 0 ? (
              <div className="flex w-full flex-col gap-1.5">
                <span className="text-[14px] font-medium leading-[14px] tracking-[0.4px] text-[#141A1F]">Loading Site(s)</span>
                {loadingSitesFor(detail).map((site) => (
                  <div
                    key={site}
                    className="flex h-10 items-center rounded border border-[#E2E5E9] bg-[rgba(226,229,233,0.5)] px-3 text-[14px] tracking-[0.4px] text-[#5C6470]"
                  >
                    {site}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setDetail(null)} className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">
                Go Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleDecline(detail);
                    setDetail(null);
                  }}
                  className="flex h-8 items-center rounded bg-[#ED351D] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Decline Request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleApprove(detail);
                    setDetail(null);
                  }}
                  className="flex h-8 items-center rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white"
                >
                  Approve Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-medium text-[#5C6470]">{label}</span>
      <span className={cn("min-w-0 flex-1", accent ? "font-semibold text-[#ED351D]" : "text-[#344256]")}>
        {value}
      </span>
    </div>
  );
}
