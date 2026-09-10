import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import type { Driver, Trip } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/fleet")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: FleetDispatchRequests,
});

const PAGE_SIZE = 4;

function isDispatchRequest(trip: Trip) {
  return trip.status === "Requested" || trip.status === "Awaiting Approval";
}

function dispatchId(trip: Trip) {
  if (/^DIS-/i.test(trip.id)) return trip.id;
  const digits = trip.id.replace(/\D/g, "").slice(-5) || trip.id.slice(-5);
  return `DIS-${digits.padStart(5, "0")}`;
}

function FleetDispatchRequests() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Trip | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([tripService.list(), driverService.list()])
      .then(([nextTrips, nextDrivers]) => {
        setTrips(nextTrips);
        setDrivers(nextDrivers);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const driverById = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of drivers) map.set(d.id, d);
    return map;
  }, [drivers]);

  const listing = useMemo(
    () => trips.filter((t) => isDispatchRequest(t) && !declinedIds.includes(t.id)),
    [trips, declinedIds],
  );

  const filtered = listing.filter((t) => {
    const driver = t.driverId ? driverById.get(t.driverId) : undefined;
    const hay = `${dispatchId(t)} ${t.driverName ?? ""} ${driver?.name ?? ""} ${t.headId ?? ""} ${t.truckReg ?? ""} ${t.tailType ?? ""} ${driver?.phone ?? ""} ${t.dropoff}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCSV = () => {
    const headers = "Dispatch ID,Driver,Truck Head,Tail Type,Phone Number,Destination\n";
    const csv = filtered
      .map((t) => {
        const driver = t.driverId ? driverById.get(t.driverId) : undefined;
        return `${dispatchId(t)},${t.driverName || driver?.name || ""},${t.headId || t.truckReg || ""},${t.tailType || ""},${driver?.phone || ""},${t.dropoff}`;
      })
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dispatch_requests.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  const handleApprove = async (trip: Trip) => {
    setMenuFor(null);
    await tripService.initialApprove(trip.id);
    toast.success(`Dispatch ${dispatchId(trip)} approved.`);
    void tripService.list().then(setTrips);
  };

  const handleDecline = (trip: Trip) => {
    setMenuFor(null);
    setDeclinedIds((ids) => [...ids, trip.id]);
    toast.warning(`Dispatch ${dispatchId(trip)} declined.`);
  };

  return (
    <>
      {/* Figma 480:15035 layout — rows from live /trips + /drivers */}
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Fleet Dispatch Requests</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            take action on dispatch requests
          </p>
        </div>

        <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
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

          <div className="hidden grid-cols-[110px_156px_144px_144px_140px_1fr_40px] items-center gap-6 border-b border-[#E2E5E9] py-[15px] md:grid">
            {["Dispatch ID", "Driver", "Truck Head", "Tail Type", "Phone Number", "Destination"].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
            <span />
          </div>

          {slice.map((trip) => {
            const driver = trip.driverId ? driverById.get(trip.driverId) : undefined;
            return (
              <div
                key={trip.id}
                className="relative grid grid-cols-[1fr_40px] items-center gap-2 border-b border-[#E2E5E9] py-2.5 md:grid-cols-[110px_156px_144px_144px_140px_1fr_40px] md:gap-6"
              >
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{dispatchId(trip)}</span>
                <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">
                  {trip.driverName || driver?.name}
                </span>
                <span className="hidden text-[14px] tracking-[0.4px] text-[#5C6470] md:block">
                  {trip.headId || trip.truckReg}
                </span>
                <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">
                  {trip.tailType}
                </span>
                <span className="hidden text-[14px] tracking-[0.4px] text-[#5C6470] md:block">{driver?.phone}</span>
                <span className="hidden text-[14px] capitalize tracking-[0.4px] text-[#5C6470] md:block">{trip.dropoff}</span>
                <div ref={menuFor === trip.id ? menuRef : undefined} className="relative justify-self-end">
                  <button
                    type="button"
                    className="grid size-8 place-items-center text-[#1B2432]"
                    onClick={() => setMenuFor((id) => (id === trip.id ? null : trip.id))}
                  >
                    <MoreVertical className="size-5" />
                  </button>
                  {menuFor === trip.id && (
                    <div className="absolute top-8 right-0 z-30 w-[160px] rounded-[6px] bg-white py-2.5 shadow-[0px_4px_4px_rgba(0,0,0,0.15)]">
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
            );
          })}

          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query ? "No matching dispatch requests" : "No dispatch requests yet"}
              body={
                query
                  ? "Try a different dispatch ID, driver, or destination."
                  : "Requests waiting for dispatch will list here from the live API."
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
                Export CVS
              </button>
            </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="w-full max-w-[480px] rounded-[10px] bg-white p-8 shadow-[0px_10px_40px_rgba(0,0,0,0.08)]">
            <h3 className="mb-4 text-[18px] font-semibold text-[#1B2432]">{dispatchId(detail)}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
              {detail.driverName && (
                <>
                  <dt className="text-[#8E95A1]">Driver</dt>
                  <dd className="text-[#1B2432]">{detail.driverName}</dd>
                </>
              )}
              {(detail.headId || detail.truckReg) && (
                <>
                  <dt className="text-[#8E95A1]">Truck head</dt>
                  <dd className="text-[#1B2432]">{detail.headId || detail.truckReg}</dd>
                </>
              )}
              {detail.tailType && (
                <>
                  <dt className="text-[#8E95A1]">Tail type</dt>
                  <dd className="text-[#1B2432]">{detail.tailType}</dd>
                </>
              )}
              {detail.dropoff && (
                <>
                  <dt className="text-[#8E95A1]">Destination</dt>
                  <dd className="text-[#1B2432]">{detail.dropoff}</dd>
                </>
              )}
              {detail.pickup && (
                <>
                  <dt className="text-[#8E95A1]">Pickup</dt>
                  <dd className="text-[#1B2432]">{detail.pickup}</dd>
                </>
              )}
            </dl>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setDetail(null)} className="text-[14px] font-medium text-[#ED351D]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
