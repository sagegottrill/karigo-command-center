import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DispatchDetailsModal } from "@/components/fleetopsx/dispatch-details-modal";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { authService, driverService, fleetService, tripService } from "@/lib/fleetopsx/services";
import type { Driver, Trip, TruckHead } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

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
  const req = displayRequestId(trip);
  if (/^DIS-/i.test(trip.id)) return trip.id;
  return req.replace(/^REQ-/i, "DIS-");
}

function headLabel(trip: Trip, heads: TruckHead[]) {
  const head =
    heads.find(
      (h) =>
        h.id === trip.headId ||
        h.number === trip.headId ||
        h.capNumber === trip.headId,
    ) ?? null;
  const cap = displayCapFromTrip(trip, head);
  const plate = displayPlateFromTrip(trip, head);
  if (cap && plate) return `${cap} (${plate})`;
  return cap || plate || "";
}

function FleetDispatchRequests() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Trip | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([tripService.list(), driverService.list(), fleetService.listHeads()])
      .then(([nextTrips, nextDrivers, nextHeads]) => {
        setTrips(nextTrips);
        setDrivers(nextDrivers);
        setHeads(nextHeads);
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
    const hay =
      `${dispatchId(t)} ${t.driverName ?? ""} ${driver?.name ?? ""} ${t.headId ?? ""} ${t.truckReg ?? ""} ${t.tailType ?? ""} ${driver?.phone ?? ""} ${t.dropoff}`.toLowerCase();
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
        return `${dispatchId(t)},${t.driverName || driver?.name || ""},${headLabel(t, heads)},${t.tailType || ""},${driver?.phone || ""},${t.dropoff}`;
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
      {/* Figma desktop 480:15035 · mobile 480:2112 */}
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
              Fleet Dispatch Requests
            </h2>
          </div>
          <p className="hidden text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)] md:block">
            take action on dispatch requests
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

        {/* Mobile cards */}
        <div className="flex flex-col gap-[11px] md:hidden">
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
          {slice.map((trip) => {
            const driver = trip.driverId ? driverById.get(trip.driverId) : undefined;
            const approved = trip.status === "Awaiting Approval";
            return (
              <div
                key={trip.id}
                className="relative flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">
                    {dispatchId(trip)}
                  </span>
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
                        {!approved && (
                          <>
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
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <MetaRow label="Driver:" value={trip.driverName || driver?.name || ""} />
                <MetaRow label="Head No:" value={headLabel(trip, heads)} accent />
                <MetaRow label="Truck Type:" value={trip.tailType || ""} />
                <MetaRow label="Phone No:" value={driver?.phone || ""} />
                <MetaRow label="Destination:" value={trip.dropoff || ""} />
                {approved && (
                  <span className="w-fit rounded bg-[#34C759] px-2.5 py-[5px] text-[12px] tracking-[0.4px] text-white">
                    Approved
                  </span>
                )}
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

        {/* Desktop table card */}
        <div className="hidden w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:block">
          <div className="mb-4 flex items-center gap-5 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[400px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
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
            <button
              type="button"
              className="grid size-9 place-items-center rounded bg-[#ED351D] text-white"
              aria-label="Filter"
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid grid-cols-[96px_167px_144px_150px_134px_1fr_auto] items-center gap-[30px] border-b border-[#E2E5E9] py-[15px]">
            {["Dispatch ID", "Driver", "Truck Head", "Tail Type", "Phone Number", "Destination"].map((h) => (
              <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ))}
            <span className="w-[100px]" />
          </div>

          {slice.map((trip) => {
            const driver = trip.driverId ? driverById.get(trip.driverId) : undefined;
            const approved = trip.status === "Awaiting Approval";
            return (
              <div
                key={trip.id}
                className="relative grid grid-cols-[96px_167px_144px_150px_134px_1fr_auto] items-center gap-[30px] border-b border-[#E2E5E9] py-2.5"
              >
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{dispatchId(trip)}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                  {trip.driverName || driver?.name}
                </span>
                <span className="text-[12px] tracking-[0.4px] text-[#627084]">{headLabel(trip, heads)}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.tailType}</span>
                <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{driver?.phone}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                <div
                  ref={menuFor === trip.id ? menuRef : undefined}
                  className="relative flex items-center justify-end gap-2 justify-self-end"
                >
                  <button
                    type="button"
                    className="grid size-8 place-items-center text-[#1B2432]"
                    onClick={() => setMenuFor((id) => (id === trip.id ? null : trip.id))}
                  >
                    <MoreVertical className="size-5" />
                  </button>
                  {approved && (
                    <span className="rounded bg-[#34C759] px-2.5 py-[5px] text-[12px] tracking-[0.4px] text-white">
                      Approved
                    </span>
                  )}
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
                      {!approved && (
                        <>
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
                        </>
                      )}
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
                  Export CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <DispatchDetailsModal
          trip={detail}
          driver={
            detail.driverId
              ? driverById.get(detail.driverId)
              : drivers.find((d) => d.name === detail.driverName)
          }
          head={heads.find(
            (h) =>
              h.id === detail.headId ||
              h.number === detail.headId ||
              h.capNumber === detail.headId ||
              (detail.truckReg ? h.registration === detail.truckReg : false),
          )}
          onClose={() => setDetail(null)}
          onApprove={() => {
            void handleApprove(detail);
            setDetail(null);
          }}
          onDecline={() => {
            handleDecline(detail);
            setDetail(null);
          }}
        />
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
