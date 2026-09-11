import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowBigRight, ChevronLeft, ChevronRight, ListFilter, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { displayCapFromTrip, displayPlateFromTrip } from "@/lib/fleetopsx/display-ids";
import { driverService, tripService } from "@/lib/fleetopsx/services";
import {
  dispatchDisplayId,
  getTrackingDelayStatus,
  isActiveDispatchTrip,
  TRACKING_DELAY_COLOR,
  type TrackingDelayStatus,
} from "@/lib/fleetopsx/tracking-ops";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

function headCell(trip: Trip) {
  const cap = displayCapFromTrip(trip);
  const plate = displayPlateFromTrip(trip);
  if (cap && plate) return `${cap} (${plate})`;
  return cap || plate || "";
}

export const Route = createFileRoute("/workspace/app/active-dispatch/")({
  head: () => ({
    meta: [
      { title: "Active Dispatch | Tracking Ops" },
      { name: "description", content: "Monitor active dispatches and manually log location checkpoints." },
    ],
  }),
  component: ActiveDispatchPage,
});

const PAGE_SIZE = 10;
const FILTERS = ["All", "On Schedule", "Slight delay", "Significant Delay"] as const;
type FilterTab = (typeof FILTERS)[number];

function ActiveDispatchPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("All");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [allTrips, allDrivers] = await Promise.all([tripService.list(), driverService.list()]);
        if (cancelled) return;
        setTrips(allTrips.filter(isActiveDispatchTrip));
        setDrivers(allDrivers);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load active dispatches");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const phoneByDriverId = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(d.id, d.phone);
    return map;
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((trip) => {
      const delay = getTrackingDelayStatus(trip);
      if (filter !== "All" && delay !== filter) return false;
      if (!q) return true;
      const hay = [
        dispatchDisplayId(trip),
        trip.driverName,
        trip.truckReg,
        trip.headId,
        trip.tailType,
        trip.dropoff,
        phoneByDriverId.get(trip.driverId ?? "") ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [trips, search, filter, phoneByDriverId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, filter]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.message("Nothing to export");
      return;
    }
    const header = ["Dispatch ID", "Driver", "Truck Head", "Tail Type", "Phone Number", "Destination", "Status"];
    const lines = filtered.map((trip) => {
      const delay = getTrackingDelayStatus(trip);
      const phone = (trip.driverId && phoneByDriverId.get(trip.driverId)) || "";
      return [
        dispatchDisplayId(trip),
        trip.driverName ?? "",
        headCell(trip),
        trip.tailType ?? "",
        phone,
        trip.dropoff ?? "",
        delay,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "active-dispatch.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[30px] md:p-[30px]">
        <FigmaLoadingState label="Loading active dispatches…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-1 md:hidden">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F]">Active Dispatch</h2>
        <p className="text-[12px] text-[#5C6470]">Manually Log Location Checkpoints.</p>
      </div>

      <div className="hidden items-center justify-between md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Active Dispatch</h2>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manually Log Location Checkpoints.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={exportCsv}
        className="flex h-8 w-[123px] items-center gap-[5px] rounded bg-[#1B2432] px-[7px] py-[5px] text-[14px] font-medium tracking-[0.4px] text-white md:hidden"
      >
        <Upload className="size-[18px]" strokeWidth={1.5} />
        Export CSV
      </button>

      <div className="flex flex-col gap-[15px] border-b border-[#E2E5E9] pb-[5px] md:hidden">
        <div className="flex items-center gap-5">
          <div className="flex h-9 flex-1 items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
            <Search className="size-[22px] shrink-0 text-[#5C6470]" strokeWidth={1.5} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="grid size-9 place-items-center rounded bg-[#ED351D]"
          >
            <ListFilter className="size-5 text-white" strokeWidth={1.5} />
          </button>
        </div>
        {filterOpen && (
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setFilterOpen(false);
                }}
                className={cn(
                  "rounded px-3 py-1 text-[12px]",
                  filter === f ? "bg-[#1B2432] text-white" : "bg-[#E2E5E9]/50 text-[#141A1F]",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <StatusLegend mobile />
      </div>

      <div className="hidden overflow-hidden rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)] md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="flex h-9 w-[320px] items-center gap-2.5 rounded border border-[rgba(92,100,112,0.6)] px-3 shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
              <Search className="size-[22px] shrink-0 text-[#5C6470]" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                className="grid size-9 place-items-center rounded bg-[#ED351D]"
              >
                <ListFilter className="size-5 text-white" strokeWidth={1.5} />
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-11 z-20 min-w-[180px] rounded border border-[#E2E5E9] bg-white p-2 shadow-lg">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFilter(f);
                        setFilterOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded px-3 py-2 text-left text-[13px]",
                        filter === f ? "bg-[#1B2432] text-white" : "hover:bg-[#F1F2F4]",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <StatusLegend />
        </div>

        {filtered.length === 0 ? (
          <FigmaEmptyState title="No active dispatches" body="Active trips will appear here when available from the live API." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E9] text-left text-[12px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                    <th className="px-3 py-3">Dispatch ID</th>
                    <th className="px-3 py-3">Driver</th>
                    <th className="px-3 py-3">Truck Head</th>
                    <th className="px-3 py-3">Tail Type</th>
                    <th className="px-3 py-3">Phone Number</th>
                    <th className="px-3 py-3">Destination</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((trip) => {
                    const delay = getTrackingDelayStatus(trip);
                    const phone = (trip.driverId && phoneByDriverId.get(trip.driverId)) || "";
                    return (
                      <tr key={trip.id} className="border-b border-[#E2E5E9] text-[14px] text-[#1B2432]">
                        <td className="px-3 py-4 font-semibold tracking-[0.4px]">{dispatchDisplayId(trip)}</td>
                        <td className="px-3 py-4">{trip.driverName || ""}</td>
                        <td className="px-3 py-4">{headCell(trip)}</td>
                        <td className="px-3 py-4">{trip.tailType || ""}</td>
                        <td className="px-3 py-4">{phone}</td>
                        <td className="px-3 py-4">{trip.dropoff || ""}</td>
                        <td className="px-3 py-4">
                          <span
                            className="inline-block size-3 rounded-full"
                            style={{ backgroundColor: TRACKING_DELAY_COLOR[delay] }}
                            title={delay}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/workspace/app/active-dispatch/$dispatchId",
                                params: { dispatchId: trip.id },
                              })
                            }
                            className="inline-flex items-center gap-[5px] rounded bg-[#1B2432] px-2.5 py-1.5 text-[12px] font-medium text-white"
                          >
                            Log Location
                            <ArrowBigRight className="size-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[14px] text-[#5C6470]">
                <span>
                  {from} - {to} of {filtered.length}
                </span>
                <button
                  type="button"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded border border-[#E2E5E9] disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="grid size-8 place-items-center rounded border border-[#E2E5E9] disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-8 items-center gap-[5px] rounded bg-[#1B2432] px-[7px] text-[14px] font-medium text-white"
              >
                <Upload className="size-[18px]" strokeWidth={1.5} />
                Export CSV
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {filtered.length === 0 ? (
          <FigmaEmptyState title="No active dispatches" body="Active trips will appear here when available from the live API." />
        ) : (
          pageRows.map((trip) => {
            const delay = getTrackingDelayStatus(trip);
            const phone = (trip.driverId && phoneByDriverId.get(trip.driverId)) || "";
            return (
              <div
                key={trip.id}
                className="flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-[10px] rounded-full"
                      style={{ backgroundColor: TRACKING_DELAY_COLOR[delay] }}
                    />
                    <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">
                      {dispatchDisplayId(trip)}
                    </span>
                  </div>
                  <Link
                    to="/workspace/app/active-dispatch/$dispatchId"
                    params={{ dispatchId: trip.id }}
                    className="inline-flex items-center gap-[5px] rounded bg-[#1B2432] px-2.5 py-1 text-[10px] font-medium text-white"
                  >
                    Log Location
                    <ArrowBigRight className="size-3.5" strokeWidth={1.5} />
                  </Link>
                </div>
                <MetaRow label="Driver:" value={trip.driverName || ""} />
                <MetaRow label="Head No:" value={headCell(trip)} accent />
                <MetaRow label="Truck Type:" value={trip.tailType || ""} />
                <MetaRow label="Phone No:" value={phone} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-medium text-[#5C6470]">{label}</span>
      <span className={cn("min-w-0 flex-1", accent ? "font-semibold text-[#ED351D]" : "text-[#344256]")}>{value}</span>
    </div>
  );
}

function StatusLegend({ mobile = false }: { mobile?: boolean }) {
  const items: { label: TrackingDelayStatus; color: string }[] = [
    { label: "On Schedule", color: TRACKING_DELAY_COLOR["On Schedule"] },
    { label: "Slight delay", color: TRACKING_DELAY_COLOR["Slight delay"] },
    { label: "Significant Delay", color: TRACKING_DELAY_COLOR["Significant Delay"] },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", !mobile && "gap-5")}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-[9px]">
          <span className="size-[10px] rounded-full md:size-3" style={{ backgroundColor: item.color }} />
          <span
            className={cn(
              "font-medium tracking-[0.4px]",
              mobile ? "text-[12px]" : "text-[14px] text-[#5C6470]",
              mobile && item.label === "On Schedule" && "text-[#0ACF83]",
              mobile && item.label === "Slight delay" && "text-[#F99E1F]",
              mobile && item.label === "Significant Delay" && "text-[#FF7262]",
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
