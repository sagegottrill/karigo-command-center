import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { RecordDetailsModal } from "@/components/fleetopsx/record-details-modal";
import { RowActionMenu, type RowMenuItem } from "@/components/fleetopsx/row-action-menu";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import {
  HR_ACCESS_ROLES,
  dutyPillClass,
  dutyStatusForWrite,
  rolesCanMaintainStaff,
} from "@/lib/fleetopsx/hr-helpers";
import {
  displayDutyStatus,
  driverIsOnLiveTrip,
  dutyTally,
  liveTripsFor,
  staleDutyStatus,
  type DutyWord,
} from "@/lib/fleetopsx/driver-duty";
import { displayDispatchId } from "@/lib/fleetopsx/request-id";
import { licenseToneClass } from "@/lib/fleetopsx/license";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import type { Driver, DriverStatus, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * Who may be put on a truck today.
 *
 * This is the control the fleet desk obeys: assignment offers Available drivers
 * and nobody else. HR decides that here rather than inside each staff record, so
 * a whole shift can be moved off duty without opening 40 dialogs — and every
 * write lands on the same live `status` column Staff Records edits.
 */
export const Route = createFileRoute("/workspace/app/hr-roster")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: DutyRoster,
});

/*
 * The duty list as the roster prints it: "On Trip" is replaced by IN TRANSIT,
 * which is the word for a man the dispatch list says is on the road. HR's own
 * three decisions keep their names.
 */
const ROSTER_FILTERS = ["All", "Available", "In Transit", "Off Duty", "Suspended"] as const;

function DutyRoster() {
  const navigate = useNavigate();
  const [canEdit, setCanEdit] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  /**
   * Every dispatch — the roster needs it to tell a driver who is genuinely out
   * on the road from one whose duty word is simply out of date. The stored
   * status alone cannot answer that (see lib/fleetopsx/driver-duty.ts).
   */
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof ROSTER_FILTERS)[number]>("All");
  const [page, setPage] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The record the Transport Manager's read-only row menu opens. */
  const [details, setDetails] = useState<Driver | null>(null);

  /**
   * Who this driver is and what they are paired with, for the TM's glimpse.
   *
   * The roster is HR's control — only HR moves a driver on or off duty — but the
   * TM still has to be able to open the row and read the record instead of
   * finding a grey "View only" where the 3-dots should be.
   */
  const driverFacts = (driver: Driver) => [
    { label: "Staff ID", value: displayDriverSalary(driver) || driver.employeeId || "—" },
    { label: "Name", value: driver.name || "—" },
    { label: "Phone", value: driver.phone || "—" },
    { label: "Duty status", value: driver.status },
    { label: "Assigned truck head", value: driver.assignedTruck || "—" },
    { label: "Assigned truck tail", value: driver.assignedTail || "—" },
    { label: "Licence number", value: driver.licenseNumber || "—" },
    {
      label: "Licence expiry",
      value: driver.licenseExpiry ? driver.licenseExpiry.slice(0, 10) : "No date on file",
    },
  ];

  useEffect(() => {
    const roles = authService.getRoles();
    setCanEdit(rolesCanMaintainStaff());
    if (!roles.some((r: any) => HR_ACCESS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
    void Promise.all([driverService.list(), tripService.list().catch(() => [] as Trip[])])
      .then(([nextDrivers, nextTrips]) => {
        setDrivers(nextDrivers);
        setTrips(nextTrips);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the roster"))
      .finally(() => setLoading(false));
  }, [navigate]);

  const counts = useMemo(() => {
    // Counted from the dispatches, not the stored words: the pills below say
    // In Transit for exactly these men, so the summary has to agree with them.
    const tally = dutyTally(drivers, trips);
    return {
      total: tally.total,
      available: tally.available,
      onTrip: tally.inTransit,
      offDuty: tally.offDuty,
      suspended: tally.suspended,
      paired: drivers.filter((d) => !!d.assignedTruck).length,
    };
  }, [drivers, trips]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      drivers
        // Filtered on the word the row PRINTS, not the stored one: picking
        // "In Transit" has to return the men the pills show as In Transit.
        .filter((d) => filter === "All" || displayDutyStatus(d, trips) === filter)
        .filter((d) => {
          if (!q) return true;
          return `${d.name} ${displayDriverSalary(d)} ${d.employeeId} ${d.phone} ${d.assignedTruck ?? ""} ${d.assignedTail ?? ""}`
            .toLowerCase()
            .includes(q);
        })
        .sort((a, b) => {
          // Available first — the people the fleet desk can actually use today.
          const rank = (d: Driver) => {
            const word = displayDutyStatus(d, trips);
            return word === "Available"
              ? 0
              : word === "In Transit"
                ? 1
                : word === "Off Duty"
                  ? 2
                  : 3;
          };
          return rank(a) - rank(b) || a.name.localeCompare(b.name);
        })
    );
  }, [drivers, filter, query, trips]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, currentPage * PAGE_SIZE + PAGE_SIZE);

  /**
   * Put a driver on a duty status.
   *
   * Available is refused while the driver carries a live dispatch: the truck is
   * out and the fleet desk must not be offered a driver who is on the road. The
   * dispatch ends through the gate (returned) or the tracking desk, not here.
   */
  const setDuty = async (driver: Driver, status: DriverStatus) => {
    if (status === driver.status) {
      setMenuFor(null);
      return;
    }
    /*
     * The refusal is decided by the DISPATCH, not by the duty word: a driver
     * whose record still says "On Trip" but who holds no live dispatch must be
     * releasable here, or a stale record can never be corrected by the only
     * department that owns it.
     *
     * And where a dispatch IS still open, this used to be a dead end — "end the
     * trip first" — while nothing in the product could end it, which is how men
     * ended up stranded on trips that had physically finished weeks earlier. The
     * authority now ends those dispatches with the man, after naming them.
     */
    const openDispatches = liveTripsFor(driver, trips);
    let closeDispatches = false;
    if (status === "Available" && openDispatches.length > 0) {
      const named = openDispatches
        .slice(0, 3)
        .map((t) => `${displayDispatchId(t)} (${t.status})`)
        .join(", ");
      const more = openDispatches.length > 3 ? ` and ${openDispatches.length - 3} more` : "";
      const ok = window.confirm(
        `${driver.name} is still named on ${openDispatches.length} open dispatch${openDispatches.length === 1 ? "" : "es"}: ${named}${more}.\n\n` +
          `Making him Available will close ${openDispatches.length === 1 ? "that dispatch" : "those dispatches"} as Completed so the fleet desk can hand him a truck. Continue?`,
      );
      if (!ok) {
        setMenuFor(null);
        return;
      }
      closeDispatches = true;
    }
    setBusy(driver.id);
    try {
      const updated = await driverService.update(driver.id, {
        status: dutyStatusForWrite(status),
        ...(closeDispatches ? { closeDispatches: true } : {}),
      } as never);
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(`${updated.name} is now ${status}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the duty status");
    } finally {
      setBusy(null);
      setMenuFor(null);
    }
  };

  /** Hand back the head/tail pairing — the truck is sold, swapped or withdrawn. */
  const clearPairing = async (driver: Driver) => {
    setBusy(driver.id);
    try {
      const updated = await driverService.update(driver.id, { truckReg: "", truckReg2: "" } as never);
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(`${updated.name} is no longer paired with a truck.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the truck pairing");
    } finally {
      setBusy(null);
      setMenuFor(null);
    }
  };

  const exportCSV = () => {
    const headers = "Name,Phone,Staff ID,Truck Head,Truck Tail,Status,Licence Class\n";
    const csv = filtered
      .map((d) =>
        [d.name, d.phone, displayDriverSalary(d) || d.employeeId, d.assignedTruck ?? "", d.assignedTail ?? "", d.status, d.licenseCategory]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    return headers + csv;
  };

  const rowMenu = (driver: Driver): RowMenuItem[] => [
    {
      /*
       * Never disabled. Greying it out while a dispatch was live was the dead
       * end: the department could see the stale dispatch, could not clear it,
       * and the driver stayed off the board. Choosing it now names the
       * dispatches and ends them with him.
       */
      label: driverIsOnLiveTrip(driver, trips)
        ? "Make Available (close open dispatch)"
        : "Mark Available",
      onSelect: () => void setDuty(driver, "Available"),
    },
    { label: "Mark On Trip", onSelect: () => void setDuty(driver, "On Trip") },
    { label: "Mark Off Duty", onSelect: () => void setDuty(driver, "Off Duty") },
    { label: "Suspend Driver", danger: true, onSelect: () => void setDuty(driver, "Suspended") },
    {
      label: "Unpair from Truck",
      hidden: !driver.assignedTruck && !driver.assignedTail,
      onSelect: () => void clearPairing(driver),
    },
  ];

  return (
    <>
      <DepartmentTabs department="hr" />
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Duty Roster</h2>
            <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
              who may be put on a truck today, and who is off the board
            </p>
            {!canEdit && (
              <span className="mt-1 w-fit rounded bg-[#F1F2F4] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">
                View only — HR &amp; Personnel sets duty status
              </span>
            )}
          </div>
          <ExportMenu csv={exportCSV} rows={filtered.length} title="Duty Roster" fileNameBase="duty_roster" />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Total Staff", value: counts.total, tone: "text-[#1B2432]" },
            { label: "Available", value: counts.available, tone: "text-[#0A8F4D]" },
            { label: "In Transit", value: counts.onTrip, tone: "text-[#B26A00]" },
            { label: "Off Duty", value: counts.offDuty, tone: "text-[#5C6470]" },
            { label: "Suspended", value: counts.suspended, tone: "text-[#ED351D]" },
            { label: "Paired To A Truck", value: counts.paired, tone: "text-[#1B2432]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white px-4 py-3 shadow-[0px_1px_4px_rgba(12,12,13,0.05)]"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#5C6470]">{stat.label}</span>
              <span className={cn("text-[20px] font-semibold leading-7", stat.tone)}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="w-full rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#E2E5E9] pb-5">
            <div className="relative w-full max-w-[360px]">
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
                placeholder="Search name, staff ID, phone or truck"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <FilterButton
              options={ROSTER_FILTERS}
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(0);
              }}
              allLabel="All Duty Statuses"
              noun="duty status"
            />
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              <div className="grid grid-cols-[1fr_150px_120px_150px_120px_130px_44px] items-center gap-4 border-b border-[#E2E5E9] py-[15px]">
                {/* The last cell is the row's 3-dots — every other board leaves
                    that header blank rather than crowding it with a label. */}
                {["Name", "Phone", "Staff ID", "Truck Head", "Truck Tail", "Duty Status", ""].map((h, i) => (
                  <span key={h || `col-${i}`} className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
                    {h}
                  </span>
                ))}
              </div>

              {slice.map((driver) => (
                <div
                  key={driver.id}
                  className="grid grid-cols-[1fr_150px_120px_150px_120px_130px_44px] items-center gap-4 border-b border-[#E2E5E9] py-2.5"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14px] capitalize text-[#344256]">{driver.name}</span>
                    {driver.licenseExpiry ? (
                      <span className={cn("text-[11px]", licenseToneClass("valid"))}>
                        Licence class {driver.licenseCategory || "not recorded"}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#B26A00]">Licence expiry not recorded</span>
                    )}
                  </span>
                  <span className="text-[14px] text-[#5C6470]">{driver.phone || "—"}</span>
                  <span className="text-[14px] font-semibold text-[#5C6470]">
                    {displayDriverSalary(driver) || driver.employeeId || "—"}
                  </span>
                  <span className="text-[14px] text-[#344256]">{driver.assignedTruck || "—"}</span>
                  <span className="text-[14px] text-[#344256]">{driver.assignedTail || "—"}</span>
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "w-fit rounded px-2 py-0.5 text-[12px] font-medium tracking-[0.4px]",
                        dutyPillClass(displayDutyStatus(driver, trips)),
                      )}
                    >
                      {displayDutyStatus(driver, trips)}
                    </span>
                    {/*
                     * The duty word against the dispatch list. A driver the list
                     * names reads IN TRANSIT above and the dispatch is named here,
                     * so "Available" never sits beside a live trip again; a driver
                     * parked on a trip word with no job is the opposite problem
                     * and is named too. Both are HR's to fix.
                     */}
                    {staleDutyStatus(driver, trips) === "should-be-free" ? (
                      <span className="text-[11px] text-[#B26A00]">No live dispatch</span>
                    ) : null}
                    {liveTripsFor(driver, trips).slice(0, 1).map((trip) => (
                      <span key={trip.id} className="text-[11px] text-[#B26A00]">
                        {displayDispatchId(trip)} · {trip.status}
                      </span>
                    ))}
                  </span>

                  {canEdit ? (
                    <RowActionMenu
                      items={rowMenu(driver)}
                      open={menuFor === driver.id}
                      onOpenChange={(open) => setMenuFor(open ? driver.id : null)}
                      label={`Actions for ${driver.name}`}
                    />
                  ) : (
                    <RowActionMenu
                      items={[{ label: "View driver details", onSelect: () => setDetails(driver) }]}
                      open={menuFor === driver.id}
                      onOpenChange={(open) => setMenuFor(open ? driver.id : null)}
                      label={`Details for ${driver.name}`}
                      width={200}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {busy && <span className="sr-only">Saving duty status…</span>}
          {loading && <FigmaLoadingState />}
          {!loading && filtered.length === 0 && (
            <FigmaEmptyState
              title={query || filter !== "All" ? "No matching staff" : "No staff records yet"}
              body={
                query || filter !== "All"
                  ? "Try another name, staff ID or truck, or clear the duty filter."
                  : "Staff and driver records will appear here once HR onboards them."
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
              </div>
            </div>
          )}
        </div>
      </div>

      <RecordDetailsModal
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details?.name || "Driver record"}
        subtitle="Duty roster · read only"
        badge={
          details ? (
            <span
              className={cn(
                "w-fit rounded px-2 py-0.5 text-[12px] font-medium tracking-[0.4px]",
                dutyPillClass(details.status),
              )}
            >
              {details.status}
            </span>
          ) : null
        }
        facts={details ? driverFacts(details) : []}
        note="Read-only view — HR & Personnel sets duty status. A driver can only be moved on or off duty from the Duty Roster by HR."
      />
    </>
  );
}
