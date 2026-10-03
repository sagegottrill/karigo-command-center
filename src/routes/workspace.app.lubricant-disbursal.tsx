import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService, lubricantService } from "@/lib/fleetopsx/services";
import {
  liveListFuelDesk,
  liveSetFuelRequestStatus,
  type FuelDesk,
} from "@/lib/fleetopsx/live-api";
import type { FuelRequest } from "@/lib/fleetopsx/types";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  approvalGate,
  csvStamp,
  formatQuantity,
  lubricantDispatchId,
  lubricantUnit,
  lubricantWithQuantity,
  resolveVehicle,
  type LubricantOverview,
  type LubricantRequestRow,
} from "@/lib/fleetopsx/lubricant";
import {
  DispatchDetailsModal,
  exportCsv,
  LubricantSearch,
  LubricantTableFooter,
  printDisbursalTicket,
} from "@/components/fleetopsx/lubricant-ui";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  inWindow,
  resolvePeriod,
  useCustomRange,
} from "@/lib/fleetopsx/report-kit";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
import { cn } from "@/lib/utils";

const ALLOWED = [
  "Lubricant",
  "Lubricant Manager",
  "Lubricant Operations",
  "Inventory",
  "Fuel Manager",
  "Fleet Operations",
  "Transport Manager",
  "Platform Admin",
];

export const Route = createFileRoute("/workspace/app/lubricant-disbursal")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Disburse Request | FleetOpsX" },
      { name: "description", content: "Dispense diesel and gas against an active dispatch." },
    ],
  }),
  component: LogDisbursalPage,
});

/**
 * The register the department drew: what left the tank and where it went.
 * Dispatch ID leads (the job is identified by its ticket), and the row closes
 * with the lubricant itself — fuel and quantity in one cell, "Diesel (60)".
 */
const REQUEST_GRID =
  "grid grid-cols-[minmax(110px,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_44px]";

type FuelFilter = "All" | "Diesel" | "Gas";
const FUEL_FILTERS: readonly FuelFilter[] = ["All", "Diesel", "Gas"];

/** "03 Oct, 14:32" — when the draw was raised, so the oldest ask reads first. */
function deskStamp(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LogDisbursalPage() {
  const [requests, setRequests] = useState<LubricantRequestRow[]>([]);
  const [overview, setOverview] = useState<LubricantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [fuelFilter, setFuelFilter] = useState<FuelFilter>("All");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<LubricantRequestRow | null>(null);
  /** Whether the row was opened to read, or to pour straight away. */
  const [activeStep, setActiveStep] = useState<"details" | "log">("details");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  /**
   * The tank draws themselves — a request the Transport Manager (or the gate,
   * or a mechanic) raises never touches a dispatch, so the ticket queue above
   * can never show it. It belongs on the SAME screen the attendant works from,
   * because the pump that pours for a partner's truck is the pump that answers
   * this.
   */
  const [desk, setDesk] = useState<FuelDesk | null>(null);
  const [deskAction, setDeskAction] = useState<{
    row: FuelRequest;
    action: "Authorized" | "Declined";
  } | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [rows, next, deskRows] = await Promise.all([
        lubricantService.requests(),
        lubricantService.overview(),
        // The desk queue is a second source; if it is unavailable the dispatch
        // register above must still load.
        liveListFuelDesk().catch(() => null),
      ]);
      setRequests(rows);
      setOverview(next);
      setDesk(deskRows);
    } catch (err) {
      if (loading)
        toast.error(err instanceof Error ? err.message : "Failed to load the disbursal requests.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useAutoRefresh(() => void refresh(), []);

  /** The queue's own time frame — presets or a custom 1 – 15 Sept pair. */
  const [periodFilter, setPeriodFilter] = useState<string>("All time");
  const rangeCustom = useCustomRange();
  const range = useMemo(
    () => resolvePeriod(periodFilter, rangeCustom.custom),
    [periodFilter, rangeCustom.custom],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (fuelFilter !== "All" && r.request?.fuelType !== fuelFilter) return false;
      if (!inWindow(r.approvedAt ?? r.createdAt, range)) return false;
      if (!q) return true;
      const v = resolveVehicle(r);
      return [
        lubricantDispatchId(r),
        r.reference,
        v.capNumber,
        v.plate,
        v.driverName,
        v.driverPhone,
        r.truckReg,
        r.customer,
        r.dropoff,
        r.status,
        r.request?.fuelType,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [requests, query, fuelFilter, range]);

  /**
   * The queue is APPROVED TICKETS ONLY (PRD §2/§3): a row joins it the moment
   * the Transport Manager releases litres, not when the trip is dispatched.
   * What still waits stays visible as a count, never as an attendable row.
   */
  const ready = useMemo(() => filtered.filter((r) => approvalGate(r) === "released"), [filtered]);
  const waitingCount = filtered.length - ready.length;

  /** The queue's footer: tickets attendable now, per fuel, litres to pour. */
  const queueSummary = (
    <SummaryBar
      items={[
        { label: "Tickets", value: String(ready.length) },
        {
          label: "Diesel",
          value: `${formatQuantity(
            ready
              .filter((r) => r.request?.fuelType === "Diesel")
              .reduce((s, r) => s + Number(r.request?.quantity ?? 0), 0),
          )} L`,
        },
        {
          label: "Gas",
          value: `${formatQuantity(
            ready
              .filter((r) => r.request?.fuelType === "Gas")
              .reduce((s, r) => s + Number(r.request?.quantity ?? 0), 0),
          )} KG`,
        },
        ...(waitingCount > 0 ? [{ label: "Waiting on the TM", value: String(waitingCount) }] : []),
      ]}
    />
  );

  const pageCount = Math.max(1, Math.ceil(ready.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = ready.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const stocks = overview?.stocks ?? [];
  const prices = overview?.prices ?? {};

  /** Waiting first — the pump reads what is owed before what is already cleared. */
  const deskRows = useMemo(() => [...(desk?.waiting ?? []), ...(desk?.cleared ?? [])], [desk]);
  const deskWaiting = desk?.waiting.length ?? 0;
  const deskCleared = desk?.cleared.length ?? 0;

  const applyDeskDecision = async () => {
    if (!deskAction) return;
    const { row, action } = deskAction;
    setActing(true);
    try {
      await liveSetFuelRequestStatus(
        row.id,
        action,
        action === "Declined" ? declineReason.trim() : undefined,
      );
      toast.success(
        action === "Authorized"
          ? `${row.reference} cleared — ${formatQuantity(row.quantity)} ${row.unit} of ${row.fuelType} is released to draw.`
          : `${row.reference} declined${declineReason.trim() ? " — the raiser sees the reason" : ""}.`,
      );
      setDeskAction(null);
      setDeclineReason("");
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The decision did not save.");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Disburse Request
        </h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
          Log disbursement for active dispatch
        </p>
      </div>

      {/*
       * The OTHER thing the pump answers: tank draws that never touch a trip.
       * The Transport Manager raises them from his own portal (or the gate, or a
       * mechanic), and until now only the bell and the mobile worklist carried
       * them — the attendant working THIS screen could scroll past one forever.
       * Same pump, same queue, same screen as the diesel that goes to partners.
       */}
      <section className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Fuel requests at the desk
            </h3>
            {deskWaiting > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] font-medium text-white">
                {deskWaiting}
              </span>
            )}
          </div>
          <p className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
            {deskWaiting > 0
              ? `${formatQuantity(deskWaiting)} waiting on your word · ${formatQuantity(deskCleared)} cleared to draw`
              : "tank draws from the Transport Manager, the gate and the mechanic"}
          </p>
        </div>

        {deskRows.length === 0 ? (
          <p className="py-4 text-center text-[13.5px] text-[#5C6470]">
            {desk === null
              ? "Loading the desk queue…"
              : "No fuel request is waiting. The moment the Transport Manager raises one, it appears here."}
          </p>
        ) : (
          <div className="flex flex-col">
            {deskRows.map((r) => {
              const waiting = r.status === "Requested";
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#E2E5E9] py-2.5 last:border-b-0"
                >
                  <span className="w-[86px] shrink-0 text-[14px] font-medium tabular-nums tracking-[0.4px] text-[#1B2432]">
                    {r.reference}
                  </span>
                  <span className="shrink-0 text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                    {r.fuelType} · {formatQuantity(r.quantity)} {r.unit}
                  </span>
                  <span className="min-w-[150px] shrink-0 text-[13.5px] tracking-[0.4px] text-[#5C6470]">
                    {r.requestedBy}
                    {r.requestedFor ? ` · for ${r.requestedFor}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] tracking-[0.4px] text-[#627084]">
                    {r.purpose ||
                      (r.source === "Walk-In Sale"
                        ? "Walk-in buyer at the gate"
                        : "Internal draw on the tank")}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums tracking-[0.4px] text-[#8A93A0]">
                    {deskStamp(r.createdAt)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-1 text-[12px] font-medium",
                      r.status === "Authorized"
                        ? "bg-[#E7F6EC] text-[#137A3D]"
                        : r.status === "Declined"
                          ? "bg-[#FDECEA] text-[#C0392B]"
                          : "bg-[#FFF3D6] text-[#8A5A00]",
                    )}
                  >
                    {r.status}
                  </span>

                  {waiting ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDeskAction({ row: r, action: "Authorized" })}
                        className="h-8 rounded bg-[#1B2432] px-3 text-[13px] font-medium tracking-[0.4px] text-white hover:bg-[#0F1620]"
                      >
                        Authorize
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineReason("");
                          setDeskAction({ row: r, action: "Declined" });
                        }}
                        className="h-8 rounded border border-[#E2E5E9] px-3 text-[13px] font-medium tracking-[0.4px] text-[#C0392B] hover:bg-[#FDECEA]"
                      >
                        Decline
                      </button>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[12.5px] tracking-[0.4px] text-[#137A3D]">
                      Cleared — awaiting the pump
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {" "}
            <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Disbursal Request
            </h3>
            {ready.length > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] font-medium text-white">
                {ready.length}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LubricantSearch
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder="Search"
            />
            <PeriodFilter
              value={periodFilter}
              onChange={(v) => {
                setPeriodFilter(v);
                setPage(0);
              }}
              custom={rangeCustom.custom}
              customOpen={rangeCustom.open}
              onToggleCustom={rangeCustom.setOpen}
            >
              <CustomRangePicker
                custom={rangeCustom.custom}
                onSet={rangeCustom.set}
                onClear={() => {
                  rangeCustom.clear();
                  setPage(0);
                }}
              />
            </PeriodFilter>
            <FilterButton
              iconOnly
              options={FUEL_FILTERS}
              value={fuelFilter}
              onChange={(next) => {
                setFuelFilter(next);
                setPage(0);
              }}
              noun="lubricant"
              allLabel="All lubricants"
            />
          </div>
        </div>

        {/**
         * The waiting count, not a waiting table: Fleet Ops' dispatches stay
         * invisible as rows until the TM releases them — the attendant sees
         * how many are coming and nothing she may not yet pour.
         */}
        {waitingCount > 0 && (
          <p className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
            {formatQuantity(waitingCount)} more dispatch{waitingCount === 1 ? "" : "es"} waiting on
            the Transport Manager's release.
          </p>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              className={cn(
                "items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]",
                REQUEST_GRID,
              )}
            >
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Dispatch ID
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Driver
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Truck Head
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Tail Type
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Phone Number
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Destination
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Lubricant
              </span>
              <span />
            </div>

            {loading && requests.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                Loading disbursal requests…
              </p>
            ) : slice.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                {requests.length === 0
                  ? "No approved ticket yet. A dispatch appears here the moment the Transport Manager releases its litres."
                  : ready.length === 0
                    ? `All ${formatQuantity(filtered.length)} matching dispatch${filtered.length === 1 ? "" : "es"} still wait on the Transport Manager's release.`
                    : `Nothing matches “${query.trim()}”.`}
              </p>
            ) : (
              slice.map((row) => {
                const v = resolveVehicle(row);
                return (
                  <div
                    key={row.id}
                    onClick={() => {
                      setActiveStep("details");
                      setActive(row);
                    }}
                    className={cn(
                      "cursor-pointer items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0 hover:bg-[#F7F8F9]",
                      REQUEST_GRID,
                    )}
                  >
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">
                      {lubricantDispatchId(row)}
                    </span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                      {v.driverName}
                    </span>
                    <span className="truncate text-[13px] tracking-[0.4px] text-[#627084]">
                      {v.capNumber}
                    </span>
                    <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                      {v.bodyType}
                    </span>
                    <span className="truncate text-[14px] tabular-nums tracking-[0.4px] text-[#5C6470]">
                      {v.driverPhone}
                    </span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                      {row.dropoff || "—"}
                    </span>
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                      {lubricantWithQuantity(
                        row.request?.fuelType ?? "Diesel",
                        row.request?.quantity ?? 0,
                      )}
                    </span>
                    <span className="justify-self-end" onClick={(e) => e.stopPropagation()}>
                      {/**
                       * The gatekeeper (PRD §2/§3): the ticket reads here the
                       * moment the trip is dispatched, but the pour only opens
                       * once the Transport Manager has RELEASED litres for it —
                       * Fleet Ops' sign-off alone does not fuel a truck.
                       */}
                      <RowActionMenu
                        open={menuFor === row.id}
                        onOpenChange={(o) => setMenuFor(o ? row.id : null)}
                        label={`Options for ${lubricantDispatchId(row)}`}
                        width={180}
                        items={[
                          {
                            label: "View Details",
                            onSelect: () => {
                              setActiveStep("details");
                              setActive(row);
                            },
                          },
                          {
                            label: "Print Ticket",
                            onSelect: () => printDisbursalTicket(row),
                          },
                          {
                            label: "Disburse Lubricant",
                            hidden: approvalGate(row) !== "released",
                            onSelect: () => {
                              setActiveStep("log");
                              setActive(row);
                            },
                          },
                        ]}
                      />
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {ready.length > 0 ? queueSummary : null}

        <LubricantTableFooter
          from={ready.length === 0 ? 0 : safePage * PAGE_SIZE + 1}
          to={Math.min((safePage + 1) * PAGE_SIZE, ready.length)}
          total={ready.length}
          page={safePage}
          pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onExport={() =>
            exportCsv(
              "lubricant-disbursal-requests.csv",
              [
                "Dispatch ID",
                "Driver",
                "Truck Head",
                "Tail Type",
                "Phone Number",
                "Destination",
                "Lubricant",
                "Quantity",
                "Unit",
                "Assigned",
              ],
              ready.map((r) => {
                const v = resolveVehicle(r);
                return [
                  lubricantDispatchId(r),
                  v.driverName,
                  v.capNumber,
                  v.bodyType,
                  v.driverPhone,
                  r.dropoff ?? "",
                  r.request?.fuelType ?? "",
                  r.request?.quantity ?? 0,
                  lubricantUnit(r.request?.fuelType ?? "Diesel"),
                  csvStamp(r.assignedAt ?? r.createdAt),
                ];
              }),
            )
          }
        />
      </div>

      <DispatchDetailsModal
        key={active?.id ?? "none"}
        open={active !== null}
        row={active}
        stocks={stocks}
        prices={prices}
        initialStep={
          activeStep === "log" && active && approvalGate(active) !== "released"
            ? "details"
            : activeStep
        }
        onClose={() => setActive(null)}
        onDone={(message) => {
          setActive(null);
          toast.success(message);
          void refresh();
        }}
      />

      {/* The desk's word on one draw: clear it to pour, or push it back with a
          reason the Transport Manager reads on his own screen. */}
      {deskAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#141A1F]/60 p-4">
          <div className="flex w-[400px] max-w-full flex-col gap-4 rounded-[10px] bg-white p-6 shadow-[0px_4px_16px_rgba(12,12,13,0.2)]">
            <div className="flex flex-col gap-1">
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {deskAction.action === "Authorized"
                  ? `Clear ${deskAction.row.reference} to draw?`
                  : `Decline ${deskAction.row.reference}?`}
              </span>
              <p className="text-[14px] leading-5 text-[#5C6470]">
                {`${deskAction.row.fuelType} · ${formatQuantity(deskAction.row.quantity)} ${deskAction.row.unit} · raised by ${deskAction.row.requestedBy}${deskAction.row.requestedFor ? ` for ${deskAction.row.requestedFor}` : ""}.`}
                {deskAction.action === "Authorized"
                  ? " The litres leave the tank when they are poured."
                  : " The raiser is told it was declined."}
              </p>
            </div>

            {deskAction.action === "Declined" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium tracking-[0.4px] text-[#141A1F]">
                  Reason <span className="text-[#5C6470]">(optional)</span>
                </span>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  placeholder="example: tank below minimum until the restock lands"
                  className="w-full rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#8A93A0] focus:border-[#1B2432]"
                />
              </label>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeskAction(null);
                  setDeclineReason("");
                }}
                disabled={acting}
                className="h-10 rounded px-5 text-[14px] font-medium text-[#5C6470] hover:bg-[#F1F2F4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyDeskDecision()}
                disabled={acting}
                className={cn(
                  "h-10 rounded px-5 text-[14px] font-medium text-white disabled:opacity-60",
                  deskAction.action === "Authorized"
                    ? "bg-[#1B2432] hover:bg-[#0F1620]"
                    : "bg-[#ED351D] hover:bg-[#D52F18]",
                )}
              >
                {acting ? "Saving…" : deskAction.action === "Authorized" ? "Authorize" : "Decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
