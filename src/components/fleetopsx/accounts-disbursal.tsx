import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Printer,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  inWindow,
  resolvePeriod,
  useCustomRange,
} from "@/lib/fleetopsx/report-kit";
import { authService, tripService } from "@/lib/fleetopsx/services";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { CostBreakdownCell, DirectCostBanner } from "@/components/fleetopsx/direct-cost-banner";
import { VoucherPreviewModal } from "@/components/fleetopsx/accounts-vouchers";
import {
  COST_COLUMNS,
  COST_PAIRS,
  COST_SUBTITLE_ALL,
  DIRECT_COST_CATEGORIES,
  DISBURSEMENT_STATUSES,
  PENDING_DISBURSAL,
  PAYMENT_METHODS,
  costTotal,
  disbursalState,
  driverOf,
  longDay,
  money,
  paymentMethodShort,
  sheetOf,
  truckDetails,
  type CostSheet,
  type DirectCostKey,
} from "@/lib/fleetopsx/direct-costs";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * Direct Cost Disbursal — the Accounts department's working board.
 *
 * Every dispatched truck that carries a cost sheet appears here with the six
 * figures Fleet Ops committed and the Transport Manager endorsed, and the desk
 * pays it: bank transfer or petty cash, the reference, the officer, and whether
 * the journey is reconciled afterwards. Capturing a payment writes it onto the
 * dispatch itself, which is why the board can print "VIA BANK TRANSFER" under a
 * total and why the voucher it produces can never disagree with the money.
 */

/** The board's tracks: everything the row has to say, plus its actions —
 *  the capture action is a word, not a dot: "Pay" until the money has left,
 *  "Edit" once Accounts has recorded the payment and may correct it. */
const BOARD_GRID =
  "grid min-w-[1080px] grid-cols-[92px_140px_0.8fr_1.9fr_104px_120px_72px_32px_32px] items-center gap-3";

const TABS = ["All", PENDING_DISBURSAL, "Disbursed", "Reconciled"] as const;

type Tab = (typeof TABS)[number];

function DisbursalPill({ state }: { state: string }) {
  const tone =
    state === "Disbursed"
      ? "bg-[#22C55E] text-white"
      : state === "Reconciled"
        ? "bg-[#DCE4FB] text-[#2E4A9E]"
        : "border border-[#F2C200] bg-[#FDF6E3] text-[#B26B00]";
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-[4px] px-2.5 py-1 text-[11px] font-bold",
        tone,
      )}
    >
      {state}
    </span>
  );
}

export function AccountsDisbursal() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [capture, setCapture] = useState<Trip | null>(null);
  const [preview, setPreview] = useState<Trip | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTrips(await tripService.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the disbursal board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Only dispatches that were actually configured with costs are payable. */
  const payable = useMemo(
    () => trips.filter((trip) => trip.directCosts && costTotal(sheetOf(trip)) > 0),
    [trips],
  );

  /** The ledger's own time frame — presets or a custom 1 – 15 Sept pair. */
  const [periodFilter, setPeriodFilter] = useState<string>("All time");
  const rangeCustom = useCustomRange();
  const range = useMemo(
    () => resolvePeriod(periodFilter, rangeCustom.custom),
    [periodFilter, rangeCustom.custom],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payable.filter((trip) => {
      const state = disbursalState(sheetOf(trip));
      if (tab !== "All" && state !== tab) return false;
      if (!inWindow(trip.createdAt, range)) return false;
      if (!q) return true;
      return [
        truckDetails(trip),
        trip.dropoff,
        trip.customerConsignee,
        driverOf(trip),
        state,
        sheetOf(trip).disbursement?.officer,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [payable, query, tab, range]);

  /** The ledger's footer: vouchers and the money in each state. */
  const ledgerSummary = (
    <SummaryBar
      items={[
        { label: "Vouchers", value: String(rows.length) },
        {
          label: "Total committed",
          value: money(rows.reduce((sum, trip) => sum + costTotal(sheetOf(trip)), 0)),
        },
        {
          label: "Pending",
          value: String(
            rows.filter((trip) => disbursalState(sheetOf(trip)) === PENDING_DISBURSAL).length,
          ),
        },
        {
          label: "Reconciled",
          value: String(
            rows.filter((trip) => disbursalState(sheetOf(trip)) === "Reconciled").length,
          ),
        },
      ]}
    />
  );

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const trip of payable) {
      const state = disbursalState(sheetOf(trip));
      by[state] = (by[state] ?? 0) + 1;
    }
    return by;
  }, [payable]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const owing = payable.filter((trip) => disbursalState(sheetOf(trip)) === PENDING_DISBURSAL);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[26px] md:p-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Direct Cost Disbursal
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          Record and reconcile direct trip expended for all dispatch.
        </p>
      </div>

      <DirectCostBanner subtitle={COST_SUBTITLE_ALL} sheets={payable.map(sheetOf)} />

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Dispatched Trucks
            </h3>
            {owing.length > 0 ? (
              <span className="text-[12.5px] text-[#5C6470]">{owing.length} awaiting payment</span>
            ) : null}
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
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
            <div className="flex items-center gap-2">
              {TABS.map((option) => {
                const active = option === tab;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setTab(option);
                      setPage(0);
                    }}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-[6px] px-3.5 text-[13px] font-medium",
                      active
                        ? "bg-[#1B2432] text-white"
                        : "border border-[#E2E5E9] bg-white text-[#5C6470] hover:bg-[#F1F2F4]",
                    )}
                  >
                    {option === PENDING_DISBURSAL ? "Pending" : option}
                    {option !== "All" ? (
                      <span
                        className={cn("tabular-nums", active ? "text-white/70" : "text-[#9CA3AF]")}
                      >
                        {counts[option] ?? 0}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Filter dispatches"
                onClick={() => setFilterOpen((open) => !open)}
                className="grid size-10 place-items-center rounded-[6px] bg-[#ED351D] text-white"
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
                  <div className="absolute right-0 z-20 mt-2 w-[230px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
                    {["All costs", "Not yet paid", "Paid, journey open", "Reconciled"].map(
                      (option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setTab(
                              option === "Not yet paid"
                                ? PENDING_DISBURSAL
                                : option === "Paid, journey open"
                                  ? "Disbursed"
                                  : option === "Reconciled"
                                    ? "Reconciled"
                                    : "All",
                            );
                            setPage(0);
                            setFilterOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-[13px] text-[#5C6470] hover:bg-[#F1F2F4]"
                        >
                          {option}
                        </button>
                      ),
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-x-auto">
          <div
            className={cn(
              BOARD_GRID,
              "border-b border-[#E2E5E9] pb-3 text-[13.5px] font-semibold text-[#1B2432]",
            )}
          >
            <span>Date</span>
            <span>Truck Details</span>
            <span>Destination</span>
            <span>Itemized Direct Cost Breakdown</span>
            <span>Total Cost</span>
            <span>Status</span>
            <span />
            <span />
            <span />
          </div>

          {loading ? (
            <p className="py-6 text-[13px] text-[#5C6470]">Loading dispatches…</p>
          ) : slice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              {payable.length === 0
                ? "No dispatch carries a direct-cost breakdown yet. Every trip Fleet Ops configures with allowances, waybill, motor boy, tickets, extra allowance or bonus appears here to be paid."
                : "No dispatch matches this view."}
            </p>
          ) : (
            slice.map((trip) => {
              const sheet = sheetOf(trip);
              const state = disbursalState(sheet);
              const method = paymentMethodShort(sheet.disbursement?.paymentMethod);
              return (
                <div
                  key={trip.id}
                  className={cn(
                    BOARD_GRID,
                    "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]",
                  )}
                >
                  <span className="text-[#5C6470]">{longDay(trip.createdAt)}</span>
                  <span>{truckDetails(trip)}</span>
                  <span>{trip.dropoff || "—"}</span>
                  <CostBreakdownCell sheet={sheet} columns={COST_COLUMNS} />
                  <span className="flex flex-col leading-4">
                    <span className="font-semibold tabular-nums text-[#1B2432]">
                      {money(costTotal(sheet))}
                    </span>
                    {method ? (
                      <span className="text-[10px] uppercase text-[#5C6470]">{method}</span>
                    ) : null}
                  </span>
                  <span>
                    <DisbursalPill state={state} />
                  </span>
                  <span className="flex justify-end">
                    {state === PENDING_DISBURSAL ? (
                      <button
                        type="button"
                        aria-label={`Pay disbursal for ${truckDetails(trip)}`}
                        onClick={() => setCapture(trip)}
                        className="h-8 rounded-[4px] bg-[#ED351D] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#d92c15]"
                      >
                        Pay
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Edit disbursal for ${truckDetails(trip)}`}
                        onClick={() => setCapture(trip)}
                        className="flex h-8 items-center gap-1.5 rounded-[4px] border border-[#E2E5E9] px-3 text-[12.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                    )}
                  </span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      aria-label={`Print voucher for ${truckDetails(trip)}`}
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

        {rows.length > 0 ? ledgerSummary : null}

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
                  "direct-cost-disbursal.csv",
                  [
                    "Date",
                    "Truck Details",
                    "Destination",
                    ...COST_COLUMNS.flat().map((item) => item.label),
                    "Total Cost",
                    "Status",
                    "Payment Method",
                    "Bank Ref",
                    "Disbursing Officer",
                  ],
                  rows.map((trip) => {
                    const sheet = sheetOf(trip);
                    return [
                      longDay(trip.createdAt),
                      truckDetails(trip),
                      trip.dropoff ?? "",
                      ...COST_COLUMNS.flat().map((item) => Number(sheet[item.key] ?? 0)),
                      costTotal(sheet),
                      disbursalState(sheet),
                      sheet.disbursement?.paymentMethod ?? "",
                      sheet.disbursement?.bankRef ?? "",
                      sheet.disbursement?.officer ?? "",
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

      {capture ? (
        <CaptureDisbursementModal
          trip={capture}
          onClose={() => setCapture(null)}
          onSaved={async () => {
            setCapture(null);
            await refresh();
          }}
        />
      ) : null}

      {preview ? <VoucherPreviewModal trip={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

/** Field styling shared by both modals, so they read as one tool. */
const FIELD =
  "h-11 w-full rounded-[4px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]";

function IdentityCard({ trip }: { trip: Trip }) {
  return (
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
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4 md:p-10">
      <div className="w-full max-w-[740px] rounded-[10px] bg-white p-5 shadow-[0px_24px_60px_rgba(12,12,13,0.35)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-[20px] font-semibold text-[#1B2432]">{title}</h3>
            <p className="text-[12.5px] text-[#5C6470]">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-[4px] text-[#1B2432] hover:bg-[#F1F2F4]"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
        <div className="mt-5 flex items-center justify-end gap-5 border-t border-[#E2E5E9] pt-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * The capture: what the desk pays, corrected if Fleet Ops configured it wrong,
 * and how the money left the office.
 */
function CaptureDisbursementModal({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const sheet = sheetOf(trip);
  const [amounts, setAmounts] = useState<Record<DirectCostKey, string>>(() => {
    const initial = {} as Record<DirectCostKey, string>;
    for (const category of DIRECT_COST_CATEGORIES) {
      initial[category.key] = String(Number(sheet[category.key] ?? 0));
    }
    return initial;
  });
  const [paymentMethod, setPaymentMethod] = useState(sheet.disbursement?.paymentMethod ?? "");
  const [bankRef, setBankRef] = useState(sheet.disbursement?.bankRef ?? "");
  const [officer, setOfficer] = useState(
    sheet.disbursement?.officer ?? authService.getCurrentUser()?.name ?? "",
  );
  const [status, setStatus] = useState(sheet.disbursement?.status ?? "");
  const [busy, setBusy] = useState(false);

  const total =
    DIRECT_COST_CATEGORIES.reduce((sum, category) => sum + Number(amounts[category.key] || 0), 0) +
    (sheet.extras ?? []).reduce((sum, line) => sum + Number(line.amount ?? 0), 0);

  const save = async () => {
    if (!status) {
      toast.error("Record what happened to the money before saving.");
      return;
    }
    if (status === DISBURSEMENT_STATUSES[0] && !paymentMethod) {
      toast.error("A disbursal needs the method it left by.");
      return;
    }
    const corrected: Partial<Record<DirectCostKey, number>> = {};
    for (const category of DIRECT_COST_CATEGORIES) {
      const typed = Number(amounts[category.key] || 0);
      if (typed !== Number(sheet[category.key] ?? 0)) corrected[category.key] = typed;
    }
    setBusy(true);
    try {
      await tripService.captureDisbursement(trip.id, {
        amounts: corrected,
        paymentMethod,
        bankRef,
        officer,
        status,
      });
      toast.success(
        `${truckDetails(trip)} — ${money(total)} recorded as ${status === DISBURSEMENT_STATUSES[1] ? "reconciled" : "disbursed"}.`,
      );
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The disbursal was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      await tripService.captureDisbursement(trip.id, { status: PENDING_DISBURSAL });
      toast.success(`${truckDetails(trip)} — the disbursal recorded against it was withdrawn.`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen this dispatch.");
    } finally {
      setBusy(false);
    }
  };

  const alreadyPaid = Boolean(sheet.disbursement?.status);

  return (
    <ModalShell
      title="Direct Cost Disbursement Capture"
      subtitle={truckDetails(trip)}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-[13.5px] font-semibold text-[#ED351D] hover:underline"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="h-11 rounded-[4px] bg-[#ED351D] px-5 text-[13.5px] font-semibold text-white hover:bg-[#d92c15] disabled:opacity-50"
          >
            Save and Confirm Disbursement
          </button>
        </>
      }
    >
      <IdentityCard trip={trip} />

      <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">Itemized Direct Cost Breakdown</h4>
      <p className="mt-1 text-[11.5px] text-[#9CA3AF]">
        Correct a figure here and the capture records the correction with the payment.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {COST_PAIRS.flat().map((category) => (
          <label key={category.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[#344256]">{category.label}</span>
            <input
              value={amounts[category.key]}
              onChange={(e) =>
                setAmounts((current) => ({ ...current, [category.key]: e.target.value }))
              }
              inputMode="numeric"
              className={cn(FIELD, "tabular-nums")}
            />
          </label>
        ))}
      </div>

      {(sheet.extras ?? []).length > 0 ? (
        <div className="mt-3 flex flex-col gap-1 rounded-[4px] bg-[#F1F2F4] p-3 text-[12px] text-[#344256]">
          {(sheet.extras ?? []).map((line, index) => (
            <span
              key={`${line.label}-${index}`}
              className="flex items-center justify-between gap-3"
            >
              <span>{line.label}</span>
              <span className="tabular-nums">{money(line.amount)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-[#1B2432] px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
          Total Direct Disbursement
        </span>
        <span className="text-[26px] font-semibold tabular-nums text-[#2BB673]">
          {money(total)}
        </span>
      </div>

      <h4 className="mt-5 text-[16px] font-bold text-[#1B2432]">Disbursement Details</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#344256]">Payment Method</span>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={cn(FIELD, !paymentMethod && "text-[#9CA3AF]")}
          >
            <option value="">Select</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#344256]">Payment/Bank Ref. No.</span>
          <input
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
            placeholder="REF-"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#344256]">Disbursing Officer</span>
          <input value={officer} onChange={(e) => setOfficer(e.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#344256]">Disbursement Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={cn(FIELD, !status && "text-[#9CA3AF]")}
          >
            <option value="">Select</option>
            {DISBURSEMENT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {alreadyPaid ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void reopen()}
          className="mt-4 text-[12px] font-semibold text-[#ED351D] hover:underline disabled:opacity-50"
        >
          Withdraw this disbursal and mark the dispatch unpaid again
        </button>
      ) : null}
    </ModalShell>
  );
}
