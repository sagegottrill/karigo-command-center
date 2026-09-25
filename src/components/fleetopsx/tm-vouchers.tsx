import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { tripService } from "@/lib/fleetopsx/services";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { DirectCostBanner } from "@/components/fleetopsx/direct-cost-banner";
import {
  COST_COLUMNS as CELL_COLUMNS,
  COST_PAIRS as BREAKDOWN_PAIRS,
  DIRECT_COST_CATEGORIES as CATEGORIES,
  PENDING_DISBURSAL,
  costTotal as sum,
  dayLabel,
  disbursalState,
  driverOf,
  money,
  sheetOf,
  truckDetails,
  voucherRef,
} from "@/lib/fleetopsx/direct-costs";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * Direct Cost Vouchers — the Transport Manager's side of Accounts.
 *
 * A voucher is not a separate money document here: it IS a dispatch's own cost
 * sheet, the six figures Fleet Ops committed when the trip was configured
 * (trip allowance, return waybill, motor boy, transit tickets, extra allowance and
 * bonus). Reading it from the dispatch means the screen can never disagree with
 * what the trip actually costs.
 *
 * There is NO approve/decline here: every sheet on this table was already
 * approved the moment the Transport Manager approved the dispatch — a second
 * decision layer answered "what is he approving?" with nothing (Daniel). The
 * only fact this table tracks is whether the money has LEFT: Pending until
 * Accounts records the payment, Paid once they have — read from Accounts' own
 * disbursement entry, never from a decision blob.
 */

/**
 * The voucher table's eight tracks, sized to fit the card it lives in (the
 * 32px end is the print button).
 */
const VOUCHER_GRID =
  "grid min-w-[1000px] grid-cols-[96px_102px_136px_0.7fr_1.95fr_108px_88px_32px] items-center gap-3";

function StatusPill({ status }: { status: string }) {
  const tone = status === "Paid" ? "bg-[#22C55E] text-white" : "bg-[#F2C200] text-[#1B2432]";
  return (
    <span className={cn("inline-block rounded-[4px] px-2.5 py-1 text-[11px] font-bold", tone)}>
      {status}
    </span>
  );
}

export function TmVouchers() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<Trip | null>(null);
  const refresh = useCallback(async () => {
    try {
      setTrips(await tripService.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the vouchers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Only dispatches that actually carry a cost sheet are vouchers. */
  const vouchers = useMemo(
    () => trips.filter((t) => t.directCosts && sum(sheetOf(t)) > 0),
    [trips],
  );

  /** Pending until Accounts records the payment — their entry, not a decision. */
  const statusOf = (trip: Trip): "Pending" | "Paid" =>
    disbursalState(sheetOf(trip)) === PENDING_DISBURSAL ? "Pending" : "Paid";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vouchers.filter((trip) => {
      if (statusFilter !== "All statuses" && statusOf(trip) !== statusFilter) return false;
      if (!q) return true;
      return [
        voucherRef(trip),
        dayLabel(trip.createdAt),
        truckDetails(trip),
        trip.dropoff,
        trip.customerConsignee,
        driverOf(trip),
        statusOf(trip),
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [vouchers, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const pendingCount = vouchers.filter((t) => statusOf(t) === "Pending").length;

  /**
   * Today's commitments.
   *
   * "Daily" on the banner means the day the dispatch was raised: the figure that
   * moves as the day goes on, which is the one a manager audits. The Accounts
   * desk's banner totals everything it still owes — same six figures, same
   * arithmetic, one component.
   */
  const todaySheets = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return vouchers
      .filter((t) => {
        const at = new Date(t.createdAt ?? "");
        return !Number.isNaN(at.getTime()) && at >= start;
      })
      .map(sheetOf);
  }, [vouchers]);

  const previewSheet = preview ? sheetOf(preview) : null;

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[26px] md:p-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Direct Cost Vouchers
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          Manage direct cost disbursal to trucks.
        </p>
      </div>

      {/* The day's commitments, by the six things a dispatch can be paid. */}
      <DirectCostBanner
        subtitle="Aggregate across all trucks: Trip Allowance, Return Waybill, motor boy, transit tickets, extra allowance and bonus."
        sheets={todaySheets}
      />

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Payment Vouchers
            </h3>
            <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
              {vouchers.length}
            </span>{" "}
            {pendingCount > 0 ? (
              <span className="text-[12.5px] text-[#5C6470]">
                {pendingCount} awaiting Accounts' payment
              </span>
            ) : null}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <label className="relative flex h-10 w-full items-center md:w-[320px]">
              <Search className="pointer-events-none absolute left-3 size-4 text-[#9CA3AF]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search"
                className="h-10 w-full rounded-[6px] border border-[#E2E5E9] bg-white pl-9 pr-3 text-[13.5px] text-[#1B2432] outline-none placeholder:text-[#9CA3AF] focus:border-[#1B2432]"
              />
            </label>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Filter vouchers"
                onClick={() => setFilterOpen((o) => !o)}
                className={cn(
                  "grid size-10 place-items-center rounded-[6px] text-white",
                  statusFilter === "All statuses" ? "bg-[#ED351D]" : "bg-[#1B2432]",
                )}
              >
                <SlidersHorizontal className="size-4" />
              </button>
              {filterOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close filter"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setFilterOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-[180px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
                    {["All statuses", "Pending", "Paid"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt);
                          setPage(0);
                          setFilterOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F1F2F4]",
                          opt === statusFilter ? "font-semibold text-[#1B2432]" : "text-[#5C6470]",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-x-auto">
          <div
            className={cn(
              VOUCHER_GRID,
              "border-b border-[#E2E5E9] pb-3 text-[13.5px] font-semibold text-[#1B2432]",
            )}
          >
            <span>Date</span>
            <span>Voucher ID</span>
            <span>Truck Details</span>
            <span>Destination</span>
            <span>Itemized Direct Cost Breakdown</span>
            <span>Total Cost</span>
            <span>Status</span>
            <span />
          </div>

          {loading ? (
            <p className="py-6 text-[13px] text-[#5C6470]">Loading vouchers…</p>
          ) : slice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              No dispatch carries a direct-cost breakdown yet. Every trip Fleet Ops configures with
              allowances, waybill, motor boy, tickets, extra allowance or bonus appears here, with
              whether Accounts has paid it.
            </p>
          ) : (
            slice.map((trip) => {
              const sheet = sheetOf(trip);
              const status = statusOf(trip);
              return (
                <div
                  key={trip.id}
                  className={cn(
                    VOUCHER_GRID,
                    "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]",
                  )}
                >
                  <span className="text-[#5C6470]">{dayLabel(trip.createdAt)}</span>
                  <span className="font-medium text-[#1B2432]">{voucherRef(trip)}</span>
                  <span>{truckDetails(trip)}</span>
                  <span>{trip.dropoff || "—"}</span>
                  <span className="grid grid-cols-2 gap-x-4 text-[10.5px] leading-[15px]">
                    {CELL_COLUMNS.map((column, index) => (
                      <span key={index} className="flex flex-col gap-0.5">
                        {column.map((item) => (
                          <span
                            key={item.key}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <span className="text-[#9CA3AF]">{item.label}:</span>
                            <span className="whitespace-nowrap font-medium tabular-nums text-[#344256]">
                              {money(sheet[item.key])}
                            </span>
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                  <span className="font-semibold tabular-nums text-[#1B2432]">
                    {money(sum(sheet))}
                  </span>
                  <span>
                    <StatusPill status={status} />
                  </span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      aria-label={`Voucher for ${voucherRef(trip)}`}
                      onClick={() => setPreview(trip)}
                      className="grid size-8 place-items-center rounded-[4px] border border-[#E2E5E9] text-[#1B2432] hover:bg-[#F1F2F4]"
                    >
                      <Printer className="size-4" />
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
          <span className="text-[15px] font-semibold tabular-nums text-[#1B2432]">
            {rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1} -{" "}
            {Math.min((safePage + 1) * PAGE_SIZE, rows.length)}
          </span>
          <span className="text-[15px] font-semibold text-[#1B2432]">of {rows.length}</span>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
              className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
            >
              <ChevronLeft className="size-[18px] text-[#627084]" />
            </button>
            <button
              type="button"
              disabled={safePage + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
              className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
            >
              <ChevronRight className="size-[18px] text-[#627084]" />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-10 items-center gap-2 rounded-[6px] bg-[#1B2432] px-4 text-[13.5px] font-semibold text-white hover:bg-[#2a3547]"
            >
              <Printer className="size-4" />
              Print Report
            </button>
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  "direct-cost-vouchers.csv",
                  [
                    "Date",
                    "Voucher ID",
                    "Truck Details",
                    "Destination",
                    ...CATEGORIES.map((c) => c.label),
                    "Total Cost",
                    "Status",
                  ],
                  rows.map((trip) => {
                    const sheet = sheetOf(trip);
                    return [
                      dayLabel(trip.createdAt),
                      voucherRef(trip),
                      truckDetails(trip),
                      trip.dropoff ?? "",
                      ...CATEGORIES.map((c) => Number(sheet[c.key] ?? 0)),
                      sum(sheet),
                      statusOf(trip),
                    ];
                  }),
                )
              }
              className="h-10 rounded-[6px] border border-[#E2E5E9] px-4 text-[13.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {preview && previewSheet ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <div className="max-h-[92vh] w-[740px] max-w-full overflow-y-auto rounded-[10px] bg-white p-6 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[22px] font-bold tracking-[0.4px] text-[#1B2432]">
                Voucher Preview
              </h3>
              <div className="flex items-center gap-3">
                <StatusPill status={statusOf(preview)} />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex h-9 items-center gap-2 rounded-[6px] border border-[#E2E5E9] px-3 text-[13px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
                >
                  <Printer className="size-4" />
                  Voucher
                </button>
                <button
                  type="button"
                  aria-label="Close voucher preview"
                  onClick={() => setPreview(null)}
                  className="grid size-9 place-items-center rounded-[6px] text-[#1B2432] hover:bg-[#F1F2F4]"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-[4px] border border-[#2BB673] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.4px] text-[#2BB673]">
                Official Voucher
              </span>
              <span className="text-[14px] font-semibold text-[#1B2432]">
                {voucherRef(preview)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 rounded-[6px] bg-[#F1F2F4] p-4 sm:grid-cols-3">
              {[
                ["Destination", preview.dropoff || "—"],
                ["Truck Head", truckDetails(preview)],
                ["Driver", driverOf(preview)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
                    {label}
                  </span>
                  <span className="text-[14px] font-semibold text-[#1B2432]">{value}</span>
                </div>
              ))}
            </div>

            <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">
              Itemized Direct Cost Breakdown
            </h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {BREAKDOWN_PAIRS.flat().map((item) => (
                <label key={item.key} className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-[#344256]">{item.label}</span>
                  <span className="grid h-11 place-items-center rounded-[4px] bg-[#F1F2F4] px-3 text-left text-[14px] font-medium tabular-nums text-[#1B2432]">
                    {Number(previewSheet[item.key] ?? 0).toLocaleString("en-NG")}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-[#1B2432] px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
                Total Direct Disbursement
              </span>
              <span className="text-[26px] font-semibold tabular-nums text-[#2BB673]">
                {money(sum(previewSheet))}
              </span>
            </div>

            {/* Who actually paid, and how — the Accounts department's entry. Until
                they record it, this says so rather than inventing a method. */}
            <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">Disbursement Details</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["Payment Method", previewSheet.disbursement?.paymentMethod],
                ["Payment/Bank Ref. No.", previewSheet.disbursement?.bankRef],
                ["Disbursing Officer", previewSheet.disbursement?.officer],
                ["Disbursement Status", previewSheet.disbursement?.status],
              ].map(([label, value]) => (
                <label key={label as string} className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-[#344256]">{label}</span>
                  <span
                    className={cn(
                      "grid h-11 place-items-center rounded-[4px] bg-[#F1F2F4] px-3 text-left text-[14px]",
                      value ? "text-[#1B2432]" : "text-[#9CA3AF]",
                    )}
                  >
                    {value || "Not recorded by Accounts yet"}
                  </span>
                </label>
              ))}
            </div>

            {sheetOf(preview).disbursement?.officer ? (
              <p className="mt-4 text-[11px] text-[#9CA3AF]">
                Paid by {sheetOf(preview).disbursement?.officer}
                {sheetOf(preview).disbursement?.at
                  ? ` · ${dayLabel(sheetOf(preview).disbursement?.at ?? null)}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
