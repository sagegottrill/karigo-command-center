import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/fleetopsx/confirm-dialog";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { ChevronLeft, ChevronRight, History, MoreVertical, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import {
  displayCapFromTrip,
  displayPlateFromTrip,
  humanCode,
} from "@/lib/fleetopsx/display-ids";
import { displayDispatchId as dispatchId } from "@/lib/fleetopsx/request-id";
import { authService, fleetService, tripService } from "@/lib/fleetopsx/services";
import {
  gateDepartureStamp,
  gateReturnStamp,
  gateStampLabel,
  rolesCanWorkTheGate,
  splitGateStamp,
} from "@/lib/fleetopsx/gate-helpers";
import { GATE_DEPARTED_STATUSES } from "@/lib/fleetopsx/status-buckets";
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

/**
 * Both stamps come from the shared movement helpers — the Transport Manager's
 * Security Oversight section reads the same two functions, so "has this truck
 * left?" can never be answered differently on the two boards.
 */
const departureStamp = gateDepartureStamp;
const returnStamp = gateReturnStamp;
const parseStamp = splitGateStamp;

/** Departure/Return cell: real date with time underneath, green; italic placeholder when pending. */
function StampCell({ value, fallback }: { value: string | null; fallback: string }) {
  if (!value) {
    return <span className="text-[13px] italic tracking-[0.4px] text-[#627084]">{fallback}</span>;
  }
  const stamp = gateStampLabel(value);
  if (!stamp) {
    return <span className="text-[13px] font-medium tracking-[0.4px] text-[#34C759]">{value}</span>;
  }
  /* One line, as the board draws it: the spoken date, a dot, then the time. */
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium tracking-[0.4px] text-[#34C759]">
      <span>{stamp.date}</span>
      <span className="size-1.5 shrink-0 rounded-full bg-[#34C759]" />
      <span>{stamp.time}</span>
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

  /**
   * Who is looking at this page. The Transport Manager is allowed in — he needs
   * to see what left the yard and what never came back — but the logging belongs
   * to Security, so every writing control on this page disappears for him.
   *
   * Read after mount (the session lives in localStorage, so there is nothing to
   * read while the server renders) and false until then, which keeps the log
   * read-only for a beat rather than offering a button that would fail.
   */
  const [canWorkGate, setCanWorkGate] = useState(false);
  /** The movement the TM's read-only row menu opens. */
  const [details, setDetails] = useState<Trip | null>(null);

  useEffect(() => {
    setCanWorkGate(rolesCanWorkTheGate());
  }, []);

  /**
   * One gate movement as the TM reads it: the truck, the driver, both stamps and
   * the dispatch it belongs to. Security logs the movement; the TM's menu opens
   * this and nothing else.
   */
  const movementFacts = (trip: Trip) => [
    { label: "Dispatch ID", value: dispatchId(trip) },
    { label: "Driver", value: trip.driverName || "—" },
    { label: "Truck head", value: headOf(trip) },
    { label: "Plate number", value: plateOf(trip) },
    { label: "Tail number", value: tailOf(trip) },
    { label: "Departure", value: departureStamp(trip) ? stampCsv(departureStamp(trip), "Not Departed") : "Not Departed" },
    { label: "Return", value: returnStamp(trip) ? stampCsv(returnStamp(trip), "Not Returned") : "Not Returned" },
    { label: "Route", value: trip.dropoff || "—" },
  ];

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
  /*
   * THE TRUCK'S OWN RETURN.
   *
   * A dispatch return closes its own circle. This is for the trucks that left
   * before the app went live: they are physically out, the yard register knows
   * it, and there is no dispatch to stamp — so the guard names the truck in
   * front of him and the platform closes anything naming it, frees the driver
   * and sends the truck to engineering. Nothing is typed that the system can
   * work out for itself.
   */
  const [returnTruckOpen, setReturnTruckOpen] = useState(false);
  const [returnTruckQuery, setReturnTruckQuery] = useState("");
  const [returnTruckBusy, setReturnTruckBusy] = useState<string | null>(null);
  const [yardTrucks, setYardTrucks] = useState<
    { id: string; capId: string; registration: string; status: string }[]
  >([]);

  /** The yard register, out-of-yard trucks first: that is who comes home. */
  const openReturnTruck = async () => {
    setReturnTruckOpen(true);
    setReturnTruckQuery("");
    try {
      const heads = await fleetService.listHeads();
      setYardTrucks(
        heads.map((h) => ({
          id: String(h.id),
          capId: String(h.capNumber ?? h.number ?? ""),
          registration: String(h.registration ?? ""),
          status: String(h.status ?? ""),
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the yard register");
    }
  };

  const handleReturnTruck = async (truck: { id: string; capId: string; registration: string }) => {
    setReturnTruckBusy(truck.id);
    try {
      const res = await tripService.returnTruckToYard(truck.registration || truck.capId);
      const named = res.truck ? `${res.truck.capId} (${res.truck.registration})` : truck.registration;
      toast.success(
        res.dispatchClosed
          ? `${named} is back — ${res.dispatchClosed} open dispatch${res.dispatchClosed === 1 ? "" : "es"} closed, driver freed, truck to Check Up.`
          : `${named} is back and sent to Check Up.`,
      );
      setReturnTruckOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log the truck back in");
    } finally {
      setReturnTruckBusy(null);
    }
  };

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

  /**
   * Asset-mismatch guard: what the guard typed must match what the TM approved
   * on the ticket. A driver, plate or tail that differs is exactly the
   * "wrong truck left the yard" scenario the oversight spec calls out — the
   * gate is stopped and must confirm the mismatch deliberately.
   */
  const compareAgainstTicket = (t: Trip | undefined) => {
    if (!t) return [] as string[];
    const diffs: string[] = [];
    const driverOk =
      !t.driverName ||
      t.driverName.trim().toLowerCase() === logForm.driverName.trim().toLowerCase();
    if (!driverOk) diffs.push(`Driver: ticket says ${t.driverName}, gate typed ${logForm.driverName || "—"}`);
    const plate = plateOf(t);
    const plateOk = !plate || plate.replace(/\s/g, "").toLowerCase() === logForm.plateNumber.replace(/\s/g, "").toLowerCase();
    if (!plateOk) diffs.push(`Plate: ticket says ${plate}, gate typed ${logForm.plateNumber || "—"}`);
    const tail = tailOf(t);
    const tailOk = tail === "—" || !logForm.tailNumber.trim() || tail.replace(/\s/g, "").toLowerCase() === logForm.tailNumber.replace(/\s/g, "").toLowerCase();
    if (!tailOk) diffs.push(`Tail: ticket says ${tail}, gate typed ${logForm.tailNumber || "—"}`);
    return diffs;
  };

  /** The mismatch question, asked in-app — a dismissed native dialog means the
departure silently never logs. */
  const [mismatchDiffs, setMismatchDiffs] = useState<string[] | null>(null);

  const handleLogDeparture = async (force = false) => {
    if (!selectedTripId) {
      toast.error("Select a dispatch to log.");
      return;
    }
    // Unauthorized-exit guard: only a dispatch the Transport Manager has fully
    // released (Scheduled) may leave the yard. A Requested/Awaiting-Approval
    // request reaching the gate is an unauthorized exit attempt — refused and
    // named as such, per the Security oversight spec.
    const attempting = trips.find((x) => x.id === selectedTripId);
    if (attempting && attempting.status !== "Scheduled") {
      toast.error(
        `Refused — no final dispatch approval. ${dispatchId(attempting)} is still "${attempting.status}"; the Transport Manager must release it before the gate can log it out.`,
      );
      return;
    }
    if (!logForm.driverName.trim() || !logForm.truckHead.trim() || !logForm.plateNumber.trim()) {
      toast.error("Driver, truck head, and plate are required.");
      return;
    }
    const ticket = trips.find((x) => x.id === selectedTripId);
    const diffs = compareAgainstTicket(ticket);
    if (diffs.length > 0 && !force) {
      setMismatchDiffs(diffs);
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
        // WHO logged it — the Guard Activity Ledger on the TM's Security view.
        gateOutBy: authService.getCurrentUser()?.name || "Security",
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
    /* The log shows everything the gate can be asked about: what is still to
     * leave, what has left, and what is home — the shared status sets, so this
     * board cannot disagree with the TM's Security view about a movement. */
    const logged = [...GATE_DEPARTED_STATUSES, "Scheduled"];
    return trips.filter((t) => logged.includes(t.status));
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

  // The CSV string for the shared Export menu — same order as the table, the
  // dispatch ID closing the row. The menu's Image and PDF options snapshot the
  // rendered table, so they honour the same search and filters.
  const exportCsv = () => {
    const header = "Driver,Truck Head,Plate No,Tail No,Departure,Return,Logged By,Dispatch ID\n";
    const body = filtered
      .map(
        (t) =>
          `${t.driverName || ""},${headOf(t)},${plateOf(t)},${tailOf(t)},${stampCsv(departureStamp(t), "Not Departed")},${stampCsv(returnStamp(t), "Not Returned")},${returnStamp(t) ? t.gateInBy || t.gateOutBy || "Unsigned" : departureStamp(t) ? t.gateOutBy || "Unsigned" : ""},${dispatchId(t)}`,
      )
      .join("\n");
    return header + body;
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
        {!canWorkGate ? (
          <span className="w-fit rounded bg-[#E4E6EA] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
            View only — Security logs this gate
          </span>
        ) : null}
      </div>

      <div className="hidden items-start justify-between gap-4 md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Dispatch Logs</h2>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Log departure and return timestamp for dispatch and vehicles
          </p>
          {!canWorkGate ? (
            <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
              View only — Security logs this gate
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          {/* A truck that left without a dispatch still has to be able to come
              home: name it and the platform does the rest. */}
          <button
            type="button"
            onClick={() => void openReturnTruck()}
            className="flex h-9 items-center gap-1.5 rounded border border-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] hover:bg-[#F1F2F4]"
          >
            <History className="size-4" strokeWidth={2} />
            Return a truck
          </button>
          <button
            type="button"
            onClick={() => openLogModal()}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded bg-[#ED351D] hover:bg-[#d62e19] px-3 text-[14px] font-medium tracking-[0.4px] text-white",
              !canWorkGate && "hidden",
            )}
          >
            <Plus className="size-4" strokeWidth={2} />
            Log Vehicle departure
          </button>
        </div>
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
          allLabel="All Statuses"
        />
        <ExportMenu
          csv={exportCsv}
          rows={filtered.length}
          title="Dispatch Logs — Gate Security"
          fileNameBase="security_log"
          className="hidden md:block"
        />
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        {/* The action column is wide enough for the read-only label the Transport
            Manager sees there instead of the 3-dots, so "View only" sits on one
            line rather than stacking into "View / only". */}
        <div className="hidden grid-cols-[88px_140px_92px_92px_76px_1fr_1fr_118px_48px] items-center gap-4 border-b border-[#E2E5E9] px-5 py-3 md:grid">
          {/* The dispatch ID leads, as the board draws it: the guard reads the
              ticket number off the paper and finds the row by it. */}
          {["Dispatch ID", "Driver", "Truck Head", "Plate No", "Tail No", "Departure", "Return", "Logged By"].map(
            (h) => (
              <span key={h} className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {h}
              </span>
            ),
          )}
          <span />
        </div>

        {slice.map((trip) => {
          const dep = departureStamp(trip);
          const ret = returnStamp(trip);
          return (
            <div
              key={trip.id}
              className="grid grid-cols-1 gap-2 border-b border-[#E2E5E9] px-4 py-3 last:border-0 md:grid-cols-[88px_140px_92px_92px_76px_1fr_1fr_118px_48px] md:items-center md:gap-4 md:px-5"
            >
              <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">
                <span className="text-[#627084] md:hidden">Dispatch ID: </span>
                {dispatchId(trip)}
              </span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{trip.driverName || "—"}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{headOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{plateOf(trip)}</span>
              <span className="text-[14px] tracking-[0.4px] text-[#5C6470]">{tailOf(trip)}</span>
              <StampCell value={dep} fallback="Not Departed" />
              <StampCell value={ret} fallback="Not Returned" />
              {/* WHO stamped it — the accountability column. The gate house sees
                  its own signatures here; the TM sees the same on the dashboard
                  ledger. Empty (italic) until a signed stamp exists. */}
              <span
                className={
                  (trip.gateOutBy || trip.gateInBy) && ret
                    ? "text-[13px] tracking-[0.4px] text-[#1F7A33]"
                    : (trip.gateOutBy || trip.gateInBy) && dep
                      ? "text-[13px] tracking-[0.4px] text-[#8E3D2D]"
                      : "text-[13px] italic tracking-[0.4px] text-[#627084]"
                }
              >
                <span className="text-[#627084] md:hidden">Logged By: </span>
                {(trip.gateInBy || trip.gateOutBy) && ret
                  ? trip.gateInBy
                  : (trip.gateOutBy || trip.gateInBy) && dep
                    ? trip.gateOutBy
                    : "Unsigned"}
              </span>
              <div className="hidden justify-self-end md:block">
                {canWorkGate ? (
                  <RowActionMenu
                    open={menuTripId === trip.id}
                    onOpenChange={(o) => setMenuTripId(o ? trip.id : null)}
                    label="Gate log options"
                    width={176}
                    items={[
                      { label: "Departed", onSelect: () => openLogModal(trip) },
                      { label: "Returned", onSelect: () => void handleLogReturn(trip) },
                    ]}
                  />
                ) : (
                  <RowActionMenu
                    items={[{ label: "View details", onSelect: () => setDetails(trip) }]}
                    open={menuTripId === trip.id}
                    onOpenChange={(o) => setMenuTripId(o ? trip.id : null)}
                    label={`Details for ${dispatchId(trip)}`}
                    width={180}
                  />
                )}
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
              <ExportMenu
                csv={exportCsv}
                rows={filtered.length}
                title="Dispatch Logs — Gate Security"
                fileNameBase="security_log"
                mobile
              />
            </div>
          </div>
        )}
      </div>

      {canWorkGate ? (
        <button
          type="button"
          onClick={() => openLogModal()}
          className="fixed right-4 bottom-24 flex h-11 items-center gap-2 rounded-full bg-[#ED351D] hover:bg-[#d62e19] px-4 text-[14px] font-medium text-white shadow-lg md:hidden"
        >
          <Plus className="size-4" />
          Log Vehicle
        </button>
      ) : null}

      {/* The TM's glimpse reads the movement through this, read-only. */}
      <RecordDetailsModal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details ? `Dispatch ${dispatchId(details)}` : "Gate movement"}
        subtitle="Gate log · read only"
        badge={
          details ? (
            <span className="rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
              {returnStamp(details) ? "Returned" : departureStamp(details) ? "Departed" : "Not Departed"}
            </span>
          ) : null
        }
        facts={details ? movementFacts(details) : []}
        note="Read-only view — Security logs this gate. A departure or a return can only be stamped by the gate house."
      />

      {/* The physical truck does not match the approved ticket. */}
      <ConfirmDialog
        open={mismatchDiffs !== null}
        busy={saving}
        tone="danger"
        title="Mismatch against the approved ticket"
        confirmLabel="Log the departure"
        body={
          mismatchDiffs
            ? `${mismatchDiffs.map((d) => "\u2022 " + d).join("\n")}\n\nOnly continue if the physical truck and driver in front of you match the ticket.`
            : ""
        }
        onCancel={() => setMismatchDiffs(null)}
        onConfirm={() => {
          setMismatchDiffs(null);
          void handleLogDeparture(true);
        }}
      />

      {/* RETURN A TRUCK: for the fleet that left before the app went live. */}
      {returnTruckOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex max-h-[90vh] w-[460px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]">
            <div className="flex flex-col gap-1">
              <h3 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Return a truck</h3>
              <p className="text-[12.5px] text-[#5C6470]">
                Pick the truck at the gate. Anything still open against it is closed, its driver goes back on
                the board, and the truck goes to engineering as Check Up — no dates to type.
              </p>
            </div>
            <input
              className="h-10 rounded border border-[#E2E5E9] px-3 text-sm"
              placeholder="Search cap number or plate"
              value={returnTruckQuery}
              onChange={(e) => setReturnTruckQuery(e.target.value)}
            />
            <div className="flex max-h-[320px] flex-col divide-y divide-[#E2E5E9] overflow-y-auto rounded border border-[#E2E5E9]">
              {yardTrucks.length === 0 ? (
                <p className="p-4 text-center text-[13px] text-[#8E95A1]">Reading the yard register…</p>
              ) : (
                (() => {
                  const q = returnTruckQuery.trim().toLowerCase();
                  const ranked = [...yardTrucks].sort((a, b) => {
                    const rank = (t: { status: string }) => (/out of yard|assigned/i.test(t.status) ? 0 : 1);
                    return rank(a) - rank(b) || a.capId.localeCompare(b.capId);
                  });
                  const list = q
                    ? ranked.filter((t) => `${t.capId} ${t.registration}`.toLowerCase().includes(q))
                    : ranked;
                  if (list.length === 0) {
                    return <p className="p-4 text-center text-[13px] text-[#8E95A1]">No truck matches that.</p>;
                  }
                  return list.slice(0, 60).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={returnTruckBusy !== null}
                      onClick={() => void handleReturnTruck(t)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#F7F8F9] disabled:opacity-60"
                    >
                      <span className="text-[13.5px] text-[#344256]">
                        {t.capId} {t.registration ? `(${t.registration})` : ""}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                        {returnTruckBusy === t.id ? "Returning…" : t.status}
                      </span>
                    </button>
                  ));
                })()
              )}
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setReturnTruckOpen(false)}
                className="text-[14px] font-bold text-[#ED351D]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {canWorkGate && logOpen && (
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
