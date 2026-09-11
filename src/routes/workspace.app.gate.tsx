import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  humanCode,
} from "@/lib/fleetopsx/display-ids";
import { displayRequestId } from "@/lib/fleetopsx/request-id";
import { authService, tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

export const Route = createFileRoute("/workspace/app/gate")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Security", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
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

function dispatchId(trip: Trip) {
  return displayRequestId(trip).replace(/^REQ-/i, "DIS-");
}

function plateOf(trip: Trip) {
  return displayPlateFromTrip(trip) || humanCode(trip.truckReg) || "—";
}

function headOf(trip: Trip) {
  return displayCapFromTrip(trip) || "—";
}

function tailOf(trip: Trip) {
  return humanCode(trip.tailNumber, trip.tailType) || "—";
}

function departureLabel(trip: Trip) {
  if (["En Route", "Loaded", "Offloading", "Returning", "Completed"].includes(trip.status)) {
    return trip.startTime && trip.startTime !== "—" ? trip.startTime : "Departed";
  }
  return "Not Departed";
}

function returnLabel(trip: Trip) {
  if (trip.status === "Completed" || trip.status === "Returning") {
    return trip.eta && trip.eta !== "—" ? trip.eta : "Returned";
  }
  return "Not Returned";
}

function isPendingStamp(label: string) {
  return label === "Not Departed" || label === "Not Returned";
}

function SecurityLogPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
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

  const stampNow = () =>
    new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleLogReturn = async (trip: Trip) => {
    try {
      await tripService.update(trip.id, {
        status: "Completed",
        eta: stampNow(),
        progress: 100,
      });
      toast.success("Return logged");
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
    const header = "Dispatch ID,Driver,Truck Head,Plate No,Tail No,Departure,Return\n";
    const body = filtered
      .map(
        (t) =>
          `${dispatchId(t)},${t.driverName || ""},${headOf(t)},${plateOf(t)},${tailOf(t)},${departureLabel(t)},${returnLabel(t)}`,
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
          className="flex h-9 items-center gap-1.5 rounded bg-[#ED351D] px-3 text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Plus className="size-4" strokeWidth={2} />
          Log Vehicle
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
        <button type="button" className="grid size-9 place-items-center rounded bg-[#ED351D] text-white" aria-label="Filter">
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        </button>
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
        <div className="hidden grid-cols-[96px_150px_110px_120px_110px_1fr_1fr_40px] items-center gap-4 border-b border-[#E2E5E9] px-5 py-3 md:grid">
          {["Dispatch ID", "Driver", "Truck Head", "Plate No", "Tail No", "Departure", "Return"].map((h) => (
            <span key={h} className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
          <span />
        </div>

        {slice.map((trip) => {
          const dep = departureLabel(trip);
          const ret = returnLabel(trip);
          return (
            <div
              key={trip.id}
              className="grid grid-cols-1 gap-2 border-b border-[#E2E5E9] px-4 py-3 last:border-0 md:grid-cols-[96px_150px_110px_120px_110px_1fr_1fr_40px] md:items-center md:gap-4 md:px-5"
            >
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{dispatchId(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.driverName || "—"}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{headOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{plateOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{tailOf(trip)}</span>
              <span
                className={cn(
                  "text-[13px] tracking-[0.4px]",
                  isPendingStamp(dep) ? "italic text-[#627084]" : "font-medium text-[#34C759]",
                )}
              >
                {dep}
              </span>
              <span
                className={cn(
                  "text-[13px] tracking-[0.4px]",
                  isPendingStamp(ret) ? "italic text-[#627084]" : "font-medium text-[#34C759]",
                )}
              >
                {ret}
              </span>
              <div className="relative hidden justify-self-end md:block">
                <button
                  type="button"
                  className="grid place-items-center text-[#1B2432]"
                  aria-label="Options"
                  onClick={() => setMenuTripId((id) => (id === trip.id ? null : trip.id))}
                >
                  <MoreVertical className="size-5" />
                </button>
                {menuTripId === trip.id && (
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left text-[13px] text-[#1B2432] hover:bg-[#F1F2F4]"
                      onClick={() => {
                        setMenuTripId(null);
                        openLogModal(trip);
                      }}
                    >
                      Log Departure
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left text-[13px] text-[#1B2432] hover:bg-[#F1F2F4]"
                      onClick={() => void handleLogReturn(trip)}
                    >
                      Log Return
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <FigmaEmptyState
            title="No dispatch movements yet"
            body="Active and completed dispatches will list here for departure and return logging."
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
        className="fixed right-4 bottom-24 flex h-11 items-center gap-2 rounded-full bg-[#ED351D] px-4 text-[14px] font-medium text-white shadow-lg md:hidden"
      >
        <Plus className="size-4" />
        Log Vehicle
      </button>

      {logOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex w-[406px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
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
                className="h-11 rounded-lg bg-[#ED351D] px-6 text-[14px] font-bold text-white disabled:opacity-60"
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
