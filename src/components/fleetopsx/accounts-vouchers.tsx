import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { tripService } from "@/lib/fleetopsx/services";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { CostBreakdownCell, DirectCostBanner } from "@/components/fleetopsx/direct-cost-banner";
import {
  COST_COLUMNS,
  COST_PAIRS,
  COST_SUBTITLE_ALL,
  costTotal,
  dayLabel,
  driverOf,
  isDisbursed,
  money,
  paymentMethodShort,
  sheetOf,
  truckDetails,
  voucherRef,
  type CostSheet,
} from "@/lib/fleetopsx/direct-costs";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * Disbursal Voucher — the Accounts department's register of certificates issued.
 *
 * A voucher here is not a document anybody types: it is a dispatch that HAS been
 * paid. The register therefore lists exactly the dispatches the desk has
 * disbursed, shows who paid them, and prints the certificate from the same
 * figures the board captured — so a certificate can never fall out of step with
 * the payment behind it.
 */

/** The register's tracks, sized for the card it lives in. */
const VOUCHER_GRID =
  "grid min-w-[1040px] grid-cols-[112px_150px_0.8fr_1.9fr_120px_140px_140px] items-center gap-3";

function rowMatchesMethod(sheet: CostSheet, filter: string) {
  if (filter === "All") return true;
  return paymentMethodShort(sheet.disbursement?.paymentMethod) === filter;
}

export function AccountsVouchers() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
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

  /**
   * A voucher exists once the money has left: the register is the certificates
   * issued, so a dispatch still waiting to be paid is the board's business, not
   * this page's.
   */
  const issued = useMemo(
    () => trips.filter((trip) => trip.directCosts && isDisbursed(sheetOf(trip))),
    [trips],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issued.filter((trip) => {
      const sheet = sheetOf(trip);
      if (!rowMatchesMethod(sheet, filter)) return false;
      if (!q) return true;
      return [
        voucherRef(trip),
        truckDetails(trip),
        trip.dropoff,
        trip.customerConsignee,
        driverOf(trip),
        sheet.disbursement?.officer,
        sheet.disbursement?.status,
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [issued, query, filter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const filters = ["All", "VIA BANK TRANSFER", "VIA PETTY CASH"];

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[26px] md:p-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Direct Cost Vouchers
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          Formal disbursal certificates issued to dispatch trucks
        </p>
      </div>

      <DirectCostBanner subtitle={COST_SUBTITLE_ALL} sheets={issued.map(sheetOf)} />

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Payment Vouchers
            </h3>
            <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
              {issued.length}
            </span>
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
                onClick={() => setFilterOpen((open) => !open)}
                className={cn(
                  "grid size-10 place-items-center rounded-[6px] text-white",
                  filter === "All" ? "bg-[#ED351D]" : "bg-[#1B2432]",
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
                  <div className="absolute right-0 z-20 mt-2 w-[200px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
                    {filters.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setFilter(option);
                          setPage(0);
                          setFilterOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F1F2F4]",
                          option === filter ? "font-semibold text-[#1B2432]" : "text-[#5C6470]",
                        )}
                      >
                        {option === "All" ? "All payment methods" : option}
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
            <span>Voucher ID</span>
            <span>Truck Details</span>
            <span>Destination</span>
            <span>Itemized Direct Cost Breakdown</span>
            <span>Total Cost</span>
            <span>Disbursed by</span>
            <span />
          </div>

          {loading ? (
            <p className="py-6 text-[13px] text-[#5C6470]">Loading vouchers…</p>
          ) : slice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              {issued.length === 0
                ? "No disbursal has been captured yet. Every dispatch the desk pays appears here as a voucher, with who paid it and how."
                : "No voucher matches this search."}
            </p>
          ) : (
            slice.map((trip) => {
              const sheet = sheetOf(trip);
              return (
                <div
                  key={trip.id}
                  className={cn(VOUCHER_GRID, "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]")}
                >
                  <span className="font-medium text-[#1B2432]">{voucherRef(trip)}</span>
                  <span>{truckDetails(trip)}</span>
                  <span>{trip.dropoff || "—"}</span>
                  <CostBreakdownCell sheet={sheet} columns={COST_COLUMNS} />
                  <span className="flex flex-col leading-4">
                    <span className="font-semibold tabular-nums text-[#1B2432]">
                      {money(costTotal(sheet))}
                    </span>
                    {paymentMethodShort(sheet.disbursement?.paymentMethod) ? (
                      <span className="text-[10px] uppercase text-[#5C6470]">
                        {paymentMethodShort(sheet.disbursement?.paymentMethod)}
                      </span>
                    ) : null}
                  </span>
                  <span>{sheet.disbursement?.officer || "—"}</span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPreview(trip)}
                      className="flex h-9 items-center gap-2 whitespace-nowrap rounded-[4px] border border-[#E2E5E9] px-3 text-[12.5px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
                    >
                      <Printer className="size-4" />
                      Print Report
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
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              aria-label="Previous page"
              className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
            >
              <ChevronLeft className="size-[18px] text-[#627084]" />
            </button>
            <button
              type="button"
              disabled={safePage + 1 >= pageCount}
              onClick={() => setPage((current) => current + 1)}
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
                  "disbursal-vouchers.csv",
                  [
                    "Voucher ID",
                    "Truck Details",
                    "Destination",
                    ...COST_COLUMNS.flat().map((item) => item.label),
                    "Total Cost",
                    "Disbursed by",
                    "Payment Method",
                    "Bank Ref",
                    "Disbursement Status",
                  ],
                  rows.map((trip) => {
                    const sheet = sheetOf(trip);
                    return [
                      voucherRef(trip),
                      truckDetails(trip),
                      trip.dropoff ?? "",
                      ...COST_COLUMNS.flat().map((item) => Number(sheet[item.key] ?? 0)),
                      costTotal(sheet),
                      sheet.disbursement?.officer ?? "",
                      sheet.disbursement?.paymentMethod ?? "",
                      sheet.disbursement?.bankRef ?? "",
                      sheet.disbursement?.status ?? "",
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

      {preview ? <VoucherPreviewModal trip={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

/**
 * The certificate itself, as it is printed and handed over.
 *
 * The Accounts copy carries no approval pill: what it certifies is not whether
 * the cost was endorsed but that the money has been paid, and by whom.
 */
export function VoucherPreviewModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const sheet = sheetOf(trip);
  const received = sheet.disbursement;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4 md:p-10">
      <div className="w-full max-w-[740px] rounded-[10px] bg-white p-5 shadow-[0px_24px_60px_rgba(12,12,13,0.35)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-[20px] font-semibold text-[#1B2432]">Voucher Preview</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-9 items-center gap-2 rounded-[4px] border border-[#E2E5E9] px-3 text-[12.5px] font-medium text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              <Printer className="size-4" />
              Print Report
            </button>
            <button
              type="button"
              aria-label="Close voucher preview"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-[4px] text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="rounded-[4px] bg-[#E3F6EC] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.4px] text-[#1E9E5A]">
            Official Voucher
          </span>
          <span className="text-[13.5px] font-medium text-[#1B2432]">{voucherRef(trip)}</span>
        </div>

        <div className="mt-4 grid gap-4 rounded-[6px] border border-[#E2E5E9] p-4 sm:grid-cols-3">
          {[
            ["Destination", trip.dropoff || "—"],
            ["Truck Head", truckDetails(trip)],
            ["Driver", driverOf(trip)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.4px] text-[#9CA3AF]">
                {label}
              </span>
              <span className="text-[13.5px] text-[#1B2432]">{value}</span>
            </span>
          ))}
        </div>

        <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">Itemized Direct Cost Breakdown</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {COST_PAIRS.flat().map((item) => (
            <label key={item.key} className="flex flex-col gap-1.5">
              <span className="text-[13px] text-[#344256]">{item.label}</span>
              <span className="grid h-11 place-items-center rounded-[4px] bg-[#F1F2F4] px-3 text-left text-[14px] font-medium tabular-nums text-[#1B2432]">
                {Number(sheet[item.key] ?? 0).toLocaleString("en-NG")}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-[#1B2432] px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
            Total Direct Disbursement
          </span>
          <span className="text-[26px] font-semibold tabular-nums text-[#2BB673]">
            {money(costTotal(sheet))}
          </span>
        </div>

        <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">Disbursement Details</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ["Payment Method", received?.paymentMethod],
            ["Payment/Bank Ref. No.", received?.bankRef],
            ["Disbursing Officer", received?.officer],
            ["Disbursement Status", received?.status],
          ].map(([label, value]) => (
            <label key={label as string} className="flex flex-col gap-1.5">
              <span className="text-[13px] text-[#344256]">{label}</span>
              <span
                className={cn(
                  "grid h-11 place-items-center rounded-[4px] bg-[#F1F2F4] px-3 text-left text-[14px]",
                  value ? "text-[#1B2432]" : "text-[#9CA3AF]",
                )}
              >
                {value || "Not recorded"}
              </span>
            </label>
          ))}
        </div>

        {received?.by ? (
          <p className="mt-4 text-[11px] text-[#9CA3AF]">
            Disbursed by {received.by}
            {received.at ? ` · ${dayLabel(received.at)}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
