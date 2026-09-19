import { createFileRoute, redirect } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  humanCode,
} from "@/lib/fleetopsx/display-ids";
import { displayDispatchId as dispatchId } from "@/lib/fleetopsx/request-id";
import { authService, tripService } from "@/lib/fleetopsx/services";
import { completeTripReturn } from "@/lib/fleetopsx/return-trip";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

// Rows per page — the shared portal setting (lib/fleetopsx/pagination).

export const Route = createFileRoute("/workspace/app/gate")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Security", "Platform Admin"];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Security Log | Gate Security Portal" },
      { name: "description", content: "Log departure and return timestamps for dispatch and vehicles." },
    ],
  }),
  component: SecurityLogPage,
});

function plateOf(trip: Trip) {
  return displayPlateFromTrip(trip) || humanCode(trip.truckReg) || "—";
}

function headOf(trip: Trip) {
  return displayCapFromTrip(trip) || "—";
}

function tailOf(trip: Trip) {
  return humanCode(trip.tailNumber, trip.tailType) || "—";
}

const GATE_STATUS_FILTERS = ["All", "Not Departed", "Departed", "Returned"] as const;

/** Actual gate stamp (date+time) when the truck has departed — null shows the placeholder. */
function departureStamp(trip: Trip): string | null {
  if (["En Route", "Loaded", "Offloading", "Returning", "Completed"].includes(trip.status)) {
    if (trip.startTime && trip.startTime !== "—" && trip.startTime !== "-") return trip.startTime;
    return "Departed";
  }
  return null;
}

/** Actual gate stamp (date+time) when the truck has returned — null shows the placeholder. */
function returnStamp(trip: Trip): string | null {
  if (trip.status === "Completed" || trip.status === "Returning") {
    if (trip.eta && trip.eta !== "—" && trip.eta !== "-") return trip.eta;
    return "Returned";
  }
  return null;
}

/** Parse any stored stamp (ISO or "15 Sept 2026, 08:51") into two lines; null when unparseable. */
function parseStamp(value: string): { date: string; time: string } | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Departure/Return cell: real date with time underneath, green; italic placeholder when pending. */
function StampCell({ value, fallback }: { value: string | null; fallback: string }) {
  if (!value) {
    return <span className="text-[13px] italic tracking-[0.4px] text-[#627084]">{fallback}</span>;
  }
  const stamp = parseStamp(value);
  if (!stamp) {
    return <span className="text-[13px] font-medium tracking-[0.4px] text-[#34C759]">{value}</span>;
  }
  return (
    <span className="text-[13px] font-medium leading-4 tracking-[0.4px] text-[#34C759]">
      {stamp.date}
      <span className="block text-[12px] font-normal text-[#34C759]/80">{stamp.time}</span>
    </span>
  );
}

/** CSV text for a stamp cell. */
function stampCsv(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const stamp = parseStamp(value);
  return stamp ? `${stamp.date} ${stamp.time}` : value;
}

function SecurityLogPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof GATE_STATUS_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [logForm, setLogForm] = useState({
    driverName: "",
    truckHead: "",
    tailNumber: "",
    plateNumber: "",
  });
  const [menuTripId, setMenuTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stampNow = () =>
    new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Closing the trip is shared with the Tracking department's own "Truck
  // Returned" action — see lib/fleetopsx/return-trip.ts. One implementation, so
  // the gate and the tracking crew can never close a dispatch differently.
  const handleLogReturn = async (trip: Trip) => {
    try {
      const { marked } = await completeTripReturn(trip);
      toast.success(marked ? "Return logged — truck set to Check Up" : "Return logged");
      setMenuTripId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log return");
    }
  };

  const refresh = async () => {
    const list = await tripService.list();
    setTrips(list);
  };

  useEffect(() => {
    void refresh()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load security log"))
      .finally(() => setLoading(false));
  }, []);

  // Near real-time: gate sees departures/returns as dispatch status flips.
  useAutoRefresh(() => {
    void refresh().catch(() => {});
  });

  const openLogModal = (trip?: Trip) => {
    const t = trip ?? trips.find((x) => x.status === "Scheduled") ?? trips[0];
    if (t) {
      setSelectedTripId(t.id);
      setLogForm({
        driverName: t.driverName || "",
        truckHead: headOf(t),
        tailNumber: tailOf(t) === "—" ? "" : tailOf(t),
        plateNumber: plateOf(t) === "—" ? "" : plateOf(t),
      });
    } else {
      setSelectedTripId("");
      setLogForm({ driverName: "", truckHead: "", tailNumber: "", plateNumber: "" });
    }
    setLogOpen(true);
  };

  const handleLogDeparture = async () => {
    if (!selectedTripId) {
      toast.error("Select a dispatch to log.");
      return;
    }
    if (!logForm.driverName.trim() || !logForm.truckHead.trim() || !logForm.plateNumber.trim()) {
      toast.error("Driver, truck head, and plate are required.");
      return;
    }
    setSaving(true);
    try {
      const stamp = stampNow();
      await tripService.update(selectedTripId, {
        status: "En Route",
        driverName: logForm.driverName.trim(),
        truckReg: logForm.tailNumber.trim()
          ? `${logForm.plateNumber.trim()} / ${logForm.tailNumber.trim()}`
          : logForm.plateNumber.trim(),
        tailNumber: logForm.tailNumber.trim() || undefined,
        startTime: stamp,
      });
      toast.success("Departure logged");
      setLogOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log departure");
    } finally {
      setSaving(false);
    }
  };

  const listing = useMemo(() => {
    return trips.filter((t) =>
      ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Completed", "Delayed"].includes(t.status),
    );
  }, [trips]);

  const filtered = listing.filter((t) => {
    if (statusFilter !== "All") {
      const departed = departureStamp(t) !== null;
      const returned = returnStamp(t) !== null;
      if (statusFilter === "Not Departed" && departed) return false;
      if (statusFilter === "Departed" && (!departed || returned)) return false;
      if (statusFilter === "Returned" && !returned) return false;
    }
    const hay =
      `${dispatchId(t)} ${t.driverName ?? ""} ${headOf(t)} ${plateOf(t)} ${tailOf(t)} ${t.dropoff}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + slice.length);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.message("Nothing to export");
      return;
    }
    // Same order as the table — the dispatch ID closes the row.
    const header = "Driver,Truck Head,Plate No,Tail No,Departure,Return,Dispatch ID\n";
    const body = filtered
      .map(
        (t) =>
          `${t.driverName || ""},${headOf(t)},${plateOf(t)},${tailOf(t)},${stampCsv(departureStamp(t), "Not Departed")},${stampCsv(returnStamp(t), "Not Returned")},${dispatchId(t)}`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "security_log.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <FigmaLoadingState label="Loading security log…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px] md:hidden">
        <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#141A1F]">Dispatch Logs</h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
          Log departure and return timestamp for dispatch and vehicles
        </p>
      </div>

      <div className="hidden items-start justify-between gap-4 md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Dispatch Logs</h2>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Log departure and return timestamp for dispatch and vehicles
          </p>
        </div>
        <button
          type="button"
          onClick={() => openLogModal()}
          className="flex h-9 items-center gap-1.5 rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Plus className="size-4" strokeWidth={2} />
          Log Vehicle departure
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" />
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
        <FilterButton
          options={GATE_STATUS_FILTERS}
          value={statusFilter}
          onChange={(s) => {
            setStatusFilter(s);
            setPage(0);
          }}
        />
        <button
          type="button"
          onClick={exportCsv}
          className="hidden h-9 items-center gap-1.5 rounded bg-[#1B2432] px-3 text-[14px] tracking-[0.4px] text-white md:flex"
        >
          <Download className="size-4" />
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="hidden grid-cols-[150px_110px_120px_110px_1fr_1fr_96px_40px] items-center gap-4 border-b border-[#E2E5E9] px-5 py-3 md:grid">
          {["Driver", "Truck Head", "Plate No", "Tail No", "Departure", "Return", "Dispatch ID"].map((h) => (
            <span key={h} className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
          <span />
        </div>

        {slice.map((trip) => {
          const dep = departureStamp(trip);
          const ret = returnStamp(trip);
          return (
            <div
              key={trip.id}
              className="grid grid-cols-1 gap-2 border-b border-[#E2E5E9] px-4 py-3 last:border-0 md:grid-cols-[150px_110px_120px_110px_1fr_1fr_96px_40px] md:items-center md:gap-4 md:px-5"
            >
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.driverName || "—"}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{headOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{plateOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{tailOf(trip)}</span>
              <StampCell value={dep} fallback="Not Departed" />
              <StampCell value={ret} fallback="Not Returned" />
              {/* The ID closes the row on every table; on the stacked phone view
                  it carries its own label so it cannot read as an orphan value. */}
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                <span className="text-[#627084] md:hidden">Dispatch ID: </span>
                {dispatchId(trip)}
              </span>
              <div className="hidden justify-self-end md:block">
                <RowActionMenu
                  open={menuTripId === trip.id}
                  onOpenChange={(o) => setMenuTripId(o ? trip.id : null)}
                  label="Gate log options"
                  width={176}
                  items={[
                    { label: "Log Departure", onSelect: () => openLogModal(trip) },
                    { label: "Log Return", onSelect: () => void handleLogReturn(trip) },
                  ]}
                />
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <FigmaEmptyState
            title="No dispatch movements yet"
            body="Departures and returns will appear here for gate logging."
          />
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E5E9] px-5 py-3">
            <div className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
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
              <button
                type="button"
                onClick={exportCsv}
                className="flex h-8 items-center gap-1.5 rounded bg-[#1B2432] px-2.5 text-[12px] tracking-[0.4px] text-white md:hidden"
              >
                Export CSV
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => openLogModal()}
        className="fixed right-4 bottom-24 flex h-11 items-center gap-2 rounded-full bg-[#ED351D] hover:bg-[#d62e19] px-4 text-[14px] font-medium text-white shadow-lg md:hidden"
      >
        <Plus className="size-4" />
        Log Vehicle
      </button>

      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[406px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Log Vehicle</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#141A1F]">
                Dispatch *
                <select
                  className="h-10 rounded border border-[#E2E5E9] px-3 text-sm"
                  value={selectedTripId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTripId(id);
                    const t = trips.find((x) => x.id === id);
                    if (t) {
                      setLogForm({
                        driverName: t.driverName || "",
                        truckHead: headOf(t),
                        tailNumber: tailOf(t) === "—" ? "" : tailOf(t),
                        plateNumber: plateOf(t) === "—" ? "" : plateOf(t),
                      });
                    }
                  }}
                >
                  <option value="">Select dispatch</option>
                  {trips
                    .filter((t) => ["Scheduled", "En Route", "Loaded", "Returning"].includes(t.status))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {dispatchId(t)} · {t.driverName || "Driver TBD"}
                      </option>
                    ))}
                </select>
              </label>
              {(
                [
                  ["driverName", "Driver Name *", "example: J.Doe"],
                  ["truckHead", "Truck Head *", "example: P002"],
                  ["tailNumber", "Tail Number", "example: B001"],
                  ["plateNumber", "Plate Number *", "example: KSF 72 YF"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key} className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#141A1F]">
                  {label}
                  <input
                    className="h-10 rounded border border-[#E2E5E9] px-3 text-sm"
                    placeholder={placeholder}
                    value={logForm[key]}
                    onChange={(e) => setLogForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-4 pt-2">
              <button
                type="button"
                onClick={() => setLogOpen(false)}
                className="text-[14px] font-bold text-[#ED351D]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleLogDeparture()}
                className="h-11 rounded-lg bg-[#ED351D] hover:bg-[#d62e19] px-6 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {saving ? "Logging…" : "Log Departure"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
