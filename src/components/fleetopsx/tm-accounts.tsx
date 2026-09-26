import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Printer,
  Search,
  SlidersHorizontal,
  TrendingDown,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TmVouchers } from "@/components/fleetopsx/tm-vouchers";
import { DepartmentTabStrip } from "@/components/fleetopsx/department-sidebar";
import { FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  inWindow,
  resolvePeriod,
  useCustomRange,
} from "@/lib/fleetopsx/report-kit";
import {
  accountService,
  engineeringService,
  fleetService,
  inventoryService,
  tripService,
} from "@/lib/fleetopsx/services";
import { costTotal, dayLabel, money, sheetOf } from "@/lib/fleetopsx/direct-costs";
import type { Expense, InventoryMovement, TruckHead, WorkOrder, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * Accounts — the Transport Manager's side of the money, as ONE department.
 *
 * The pattern is the Engineering department's: one department, several boards
 * that read as tabs across the top of it. Four boards:
 *
 *   Direct Expense   — the per-dispatch cost sheets (TmVouchers, unchanged).
 *   Indirect Expense — the money that is not a dispatch: spare parts, repairs &
 *                      maintenance, tires & rims, and other expenses (police
 *                      claims, insurance, medical injuries…).
 *   Estimates & Depreciation — the standing assumptions (straight-line, useful
 *                      life, rate) and the asset base they will charge against.
 *   Analytics        — the money as pictures: profit and loss, what the spend
 *                      is made of, and how cash actually moved.
 *
 * The indirect figures are READ from the departments that generate them, the
 * same way the direct sheet is read from the dispatch itself — this board never
 * re-enters a figure another department already owns:
 *
 *   Spare Parts           → the store's movement ledger (purchases in, issues
 *                           out at their recorded value).
 *   Repairs & Maintenance → workshop work orders (their `cost`; the workshop's
 *                           own repair-expense rows describe the same money, so
 *                           they are not counted twice).
 *   Tires & Rims          → purchases/issues and workshop jobs whose item or
 *                           category is tyre/rim.
 *   Other Expenses        → the expense ledger's non-trip "Other" rows — the
 *                           figures the cost clients will hand over (papers,
 *                           engineering, HR) land here.
 */

const TABS = [
  { label: "Direct Expense", icon: Wallet },
  { label: "Indirect Expense", icon: SlidersHorizontal },
  { label: "Estimates & Depreciation", icon: TrendingDown },
  { label: "Analytics", icon: BarChart3 },
] as const;

const INDIRECT_CATEGORIES = [
  "Spare Parts",
  "Repairs & Maintenance",
  "Tires & Rims",
  "Other Expenses",
] as const;
type IndirectCategory = (typeof INDIRECT_CATEGORIES)[number];

type IndirectRow = {
  id: string;
  category: IndirectCategory;
  /** What the money bought. */
  label: string;
  /** The generating record, so a figure can always be traced back. */
  detail: string;
  truck: string;
  amount: number;
  date: string;
  source: string;
  status?: string;
};

/** `CAP (PLATE)` from the register — a movement row only carries the plate. */
const capOf = (heads: TruckHead[], plate: string) => {
  const clean = plate.trim();
  if (!clean || /^unassigned$/i.test(clean)) return "—";
  const head = heads.find((h) => h.registration.trim() === clean);
  return head?.capNumber ? `${head.capNumber} (${clean})` : clean;
};

const isTyreLine = (text: string) => /tyre|tire|rim/i.test(text);

/** The store ledger's money lines, named by the four indirect categories. */
function movementRows(heads: TruckHead[], movements: InventoryMovement[]): IndirectRow[] {
  const rows: IndirectRow[] = [];
  for (const line of movements) {
    if (line.kind !== "Purchase" && line.kind !== "Issue") continue;
    const value = Math.abs(Number(line.value ?? 0));
    const fallback = Math.abs(Number(line.quantity ?? 0) * Number(line.unitCost ?? 0));
    const amount = value > 0 ? value : fallback;
    if (!(amount > 0)) continue;
    const tyres = isTyreLine(`${line.itemName} ${line.sku}`);
    if (line.kind === "Purchase") {
      rows.push({
        id: `mv-${line.id}`,
        category: tyres ? "Tires & Rims" : "Spare Parts",
        label: line.itemName,
        detail: `Purchase from ${line.vendor?.trim() || "vendor not recorded"}${
          line.reference ? ` · ${line.reference}` : ""
        }`,
        truck: capOf(heads, line.truckReg ?? ""),
        amount,
        date: line.actedAt,
        source: "Store Purchase",
      });
    } else {
      rows.push({
        id: `mv-${line.id}`,
        category: tyres ? "Tires & Rims" : "Spare Parts",
        label: `${line.itemName} issued to ${line.truckReg?.trim() || "the floor"}`,
        detail: `Requisition draw${line.note ? ` · ${line.note}` : ""}`,
        truck: capOf(heads, line.truckReg ?? ""),
        amount,
        date: line.actedAt,
        source: "Store Issue",
      });
    }
  }
  return rows;
}

/** The workshop's jobs — every repair on this board is a work order. */
function workOrderRows(orders: WorkOrder[]): IndirectRow[] {
  return orders
    .filter((order) => order.status !== "Cancelled" && Number(order.cost ?? 0) > 0)
    .map((order) => ({
      id: `wo-${order.id}`,
      category: (isTyreLine(`${order.category} ${order.defect}`)
        ? "Tires & Rims"
        : "Repairs & Maintenance") as IndirectCategory,
      label: order.defect,
      detail: `Work order · ${order.category} · ${order.mechanic?.trim() || "mechanic unassigned"}`,
      truck: order.truckReg?.trim() || "—",
      amount: Number(order.cost ?? 0),
      date: order.reportedAt,
      source: "Workshop",
    }));
}

/**
 * The expense ledger's non-trip "Other" rows: police claims, insurance,
 * medical injuries — the stream the cost clients will feed.
 *
 * Trip-tagged rows (Toll / Allowance / Fuel against a dispatch) are direct
 * money and live on the voucher; repairs read from the workshop's own jobs.
 */
function otherExpenseRows(expenses: Expense[]): IndirectRow[] {
  return expenses
    .filter(
      (expense) =>
        expense.type === "Other" &&
        expense.status !== "Rejected" &&
        !/engineering/i.test(expense.requester ?? "") &&
        Number(expense.amount ?? 0) > 0,
    )
    .map((expense) => ({
      id: `xp-${expense.id}`,
      category: "Other Expenses" as IndirectCategory,
      label: expense.description?.trim() || "General expense",
      detail: `Recorded by ${expense.requester?.trim() || "—"}${
        expense.approvalLevel ? ` · ${expense.approvalLevel}` : ""
      }`,
      truck: expense.tripId ? `Dispatch ${String(expense.tripId).slice(0, 8)}` : "—",
      amount: Number(expense.amount ?? 0),
      date: expense.date,
      source: "Expense Entry",
      status: expense.status,
    }));
}

const PAGE_BG = "flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[26px] md:p-[30px]";

const INDIRECT_GRID =
  "grid min-w-[920px] grid-cols-[96px_170px_1.7fr_130px_120px_118px] items-center gap-3";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Rejected"
      ? "bg-[#ED351D] text-white"
      : status === "Disbursed"
        ? "bg-[#22C55E] text-white"
        : "bg-[#F2C200] text-[#1B2432]";
  return (
    <span className={cn("inline-block rounded-[4px] px-2.5 py-1 text-[11px] font-bold", tone)}>
      {status}
    </span>
  );
}

function IndirectBoard({ rows, loading }: { rows: IndirectRow[]; loading: boolean }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [periodFilter, setPeriodFilter] = useState("All time");
  const rangeCustom = useCustomRange();
  const range = useMemo(
    () => resolvePeriod(periodFilter, rangeCustom.custom),
    [periodFilter, rangeCustom.custom],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (categoryFilter !== "All categories" && row.category !== categoryFilter) return false;
        if (!inWindow(row.date, range)) return false;
        if (!q) return true;
        return [row.label, row.detail, row.truck, row.category, row.source, row.status].some(
          (value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(q),
        );
      })
      .sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
  }, [rows, query, categoryFilter, range]);

  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  const byCategory = (category: IndirectCategory) =>
    money(
      filtered.filter((row) => row.category === category).reduce((sum, row) => sum + row.amount, 0),
    );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className={PAGE_BG}>
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Indirect Expenses
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          Spare parts · repairs &amp; maintenance · tires &amp; rims · other expenses — read from
          the store, the workshop and the expense ledger, never re-entered here.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Indirect Ledger
            </h3>
            <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
              {filtered.length}
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
                placeholder="Search item, note, truck…"
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
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Filter categories"
                onClick={() => setFilterOpen((o) => !o)}
                className={cn(
                  "grid size-10 place-items-center rounded-[6px] text-white",
                  categoryFilter === "All categories" ? "bg-[#ED351D]" : "bg-[#1B2432]",
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
                  <div className="absolute right-0 z-20 mt-2 w-[220px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white py-1 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
                    {["All categories", ...INDIRECT_CATEGORIES].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(opt);
                          setPage(0);
                          setFilterOpen(false);
                        }}
                        className={cn(
                          "block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F1F2F4]",
                          opt === categoryFilter
                            ? "font-semibold text-[#1B2432]"
                            : "text-[#5C6470]",
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
              INDIRECT_GRID,
              "border-b border-[#E2E5E9] pb-3 text-[13.5px] font-semibold text-[#1B2432]",
            )}
          >
            <span>Date</span>
            <span>Category</span>
            <span>Description</span>
            <span>Truck</span>
            <span>Source</span>
            <span className="text-right">Amount</span>
          </div>

          {loading ? (
            <FigmaLoadingState label="Reading the store, workshop and expense ledgers…" />
          ) : slice.length === 0 ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              Nothing indirect recorded in this window yet. Spare-parts purchases and issues arrive
              from the store's ledger, repairs from workshop work orders, and the other-expense
              figures (police claims, insurance, medical) from the desks that raise them.
            </p>
          ) : (
            slice.map((row) => (
              <div
                key={row.id}
                className={cn(
                  INDIRECT_GRID,
                  "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]",
                )}
              >
                <span className="text-[#5C6470]">{dayLabel(row.date)}</span>
                <span className="font-medium text-[#1B2432]">{row.category}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[#1B2432]">{row.label}</span>
                  <span className="text-[11.5px] text-[#5C6470]">{row.detail}</span>
                </span>
                <span>{row.truck}</span>
                <span className="flex flex-col gap-1">
                  <span className="text-[11.5px] uppercase tracking-[0.4px] text-[#5C6470]">
                    {row.source}
                  </span>
                  {row.status ? <StatusPill status={row.status} /> : null}
                </span>
                <span className="text-right font-semibold tabular-nums text-[#1B2432]">
                  {money(row.amount)}
                </span>
              </div>
            ))
          )}
        </div>

        {filtered.length > 0 ? (
          <SummaryBar
            items={[
              { label: "Total Indirect", value: money(total) },
              { label: "Spare Parts", value: byCategory("Spare Parts") },
              { label: "Repairs & Maint.", value: byCategory("Repairs & Maintenance") },
              { label: "Tires & Rims", value: byCategory("Tires & Rims") },
              { label: "Other Expenses", value: byCategory("Other Expenses") },
            ]}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-5">
          <span className="text-[15px] font-semibold tabular-nums text-[#1B2432]">
            {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1} -{" "}
            {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
          </span>
          <span className="text-[15px] font-semibold text-[#1B2432]">of {filtered.length}</span>
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
              onClick={() =>
                exportCsv(
                  "indirect-expenses.csv",
                  [
                    "Date",
                    "Category",
                    "Description",
                    "Detail",
                    "Truck",
                    "Source",
                    "Status",
                    "Amount",
                  ],
                  filtered.map((row) => [
                    dayLabel(row.date),
                    row.category,
                    row.label,
                    row.detail,
                    row.truck,
                    row.source,
                    row.status ?? "",
                    row.amount,
                  ]),
                )
              }
              className="h-10 rounded-[6px] border border-[#E2E5E9] px-4 text-[13.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Estimates & Depreciation — the standing assumptions, held on the page the
 * money reports to.
 *
 * The fleet register does not yet carry acquisition cost, so no charge is
 * invented: the board pins the METHOD (straight-line, ten-year life, 10% p.a.)
 * and lists the asset base it will charge against. When cost lands on the
 * register, each truck's annual and monthly charge fills in from the same row.
 */
function DepreciationBoard({ heads, loading }: { heads: TruckHead[]; loading: boolean }) {
  const year = new Date().getFullYear();
  const RATE = 0.1;

  const assets = useMemo(
    () =>
      [...heads]
        .sort((a, b) => a.number.localeCompare(b.number))
        .map((head) => ({
          id: head.id,
          asset: head.capNumber ? `${head.capNumber} (${head.registration})` : head.registration,
          make: head.make,
          yearBought: head.year,
          age: head.year > 0 ? Math.max(0, year - head.year) : null,
          status: head.status,
          annual: null as number | null,
        })),
    [heads, year],
  );

  const summary = (
    <SummaryBar
      items={[
        { label: "Depreciable Assets", value: String(assets.length) },
        { label: "Method", value: "Straight Line" },
        { label: "Useful Life", value: "10 years" },
        { label: "Rate", value: "10% p.a." },
        { label: "Charges", value: "Awaiting cost" },
      ]}
    />
  );

  return (
    <div className={PAGE_BG}>
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Estimates &amp; Depreciation
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          The standing estimates: straight-line depreciation over a ten-year life at 10% per annum,
          charged against the truck register.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
            Depreciable Assets — Truck Heads
          </h3>
          <span className="grid h-7 min-w-[28px] place-items-center rounded-[4px] bg-[#ED351D] px-2 text-[13px] font-bold text-white">
            {assets.length}
          </span>
        </div>

        {loading ? (
          <FigmaLoadingState label="Reading the fleet register…" />
        ) : (
          <>
            <div className="flex flex-col overflow-x-auto">
              <div
                className={cn(
                  "grid min-w-[820px] grid-cols-[1.3fr_1fr_90px_90px_130px_1fr_1fr] items-center gap-3",
                  "border-b border-[#E2E5E9] pb-3 text-[13.5px] font-semibold text-[#1B2432]",
                )}
              >
                <span>Asset</span>
                <span>Make</span>
                <span>Year</span>
                <span>Age</span>
                <span>Status</span>
                <span className="text-right">Acquisition Cost</span>
                <span className="text-right">Annual Charge</span>
              </div>
              {assets.length === 0 ? (
                <p className="py-6 text-[13px] text-[#5C6470]">
                  No truck heads on the register yet.
                </p>
              ) : (
                assets.map((asset) => (
                  <div
                    key={asset.id}
                    className={cn(
                      "grid min-w-[820px] grid-cols-[1.3fr_1fr_90px_90px_130px_1fr_1fr] items-center gap-3",
                      "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]",
                    )}
                  >
                    <span className="font-medium text-[#1B2432]">{asset.asset}</span>
                    <span>{asset.make || "—"}</span>
                    <span>{asset.yearBought || "—"}</span>
                    <span>
                      {asset.age === null ? "—" : `${asset.age} yr${asset.age === 1 ? "" : "s"}`}
                    </span>
                    <span>{asset.status || "—"}</span>
                    <span className="text-right text-[#9CA3AF]">Not yet recorded</span>
                    <span className="text-right text-[#9CA3AF]">
                      {asset.annual === null ? "10% when cost lands" : money(asset.annual)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {assets.length > 0 ? summary : null}

            <div className="rounded-[6px] bg-[#F1F2F4] p-4 text-[12.5px] leading-5 text-[#5C6470]">
              <p className="font-semibold text-[#1B2432]">How the estimates arrive</p>
              <p className="mt-1.5">
                Acquisition cost is not yet captured on the fleet register, so no charge is invented
                here. Once each truck's cost is recorded, its annual charge (cost ÷ 10 years) and
                monthly charge (annual ÷ 12) post from this same table. The repair and tyre figures
                feeding the Indirect board come from Engineering and the store; the cost base for
                depreciation comes from the same desks.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ Analytics ════════════════════════════════ */

/**
 * The Analytics board — the money as pictures, the way the accounts dashboard
 * mock draws it: Profit and Loss (accrual, income vs expenses bars), an
 * Expenses Breakdown donut with the legend's percentages, and Cash Flow (cash
 * basis, inflow/outflow bars with the net-change line). The figures come from
 * the same ledgers the other three boards read — nothing is re-entered.
 *
 * One honest gap, stated on the board: trip revenue is not yet recorded on
 * dispatches, so income sits at zero and the charts light up expense-first.
 * When revenue starts landing on trips, the same bars fill without a code
 * change.
 */

const MONTH_GRID = "grid min-w-[720px] grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center gap-3";

/** A slice under one percent reads "<1%", never "0%". */
const percentOf = (share: number, total: number) => {
  if (total <= 0) return "0%";
  const percent = (share / total) * 100;
  return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`;
};

/** Naira, short — the chart axis, not the ledger: 3.6M, 900K. */
function shortNaira(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}₦${Math.round(abs / 1_000)}K`;
  return `${sign}₦${Math.round(abs)}`;
}

const monthKeyOfDate = (value: string | Date | null | undefined) => {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime())
    ? null
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

type MoneyPoint = {
  label: string;
  /** Accrual income — what the dispatch was worth (trip revenue). */
  income: number;
  /** Accrual expenses — cost sheets committed + indirect lines raised. */
  expenses: number;
  /** The direct share of `expenses`, for the breakdown donut. */
  direct: number;
  /** Cash that actually arrived (deposits recorded, revenue collected). */
  inflow: number;
  /** Cash that actually left (payments recorded, indirect spend). */
  outflow: number;
  /** inflow − outflow, the net-change line. */
  net: number;
};

/** The backwards month axis — oldest first, current month last. */
function monthAxis(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${d.toLocaleDateString("en-GB", { month: "short" })} '${String(d.getFullYear()).slice(2)}`,
    };
  });
}

function buildMoneySeries(trips: Trip[], indirect: IndirectRow[], monthsBack: number) {
  const axis = monthAxis(new Date(), monthsBack);
  const buckets = new Map<string, MoneyPoint>(
    axis.map((month) => [
      month.key,
      { label: month.label, income: 0, expenses: 0, direct: 0, inflow: 0, outflow: 0, net: 0 },
    ]),
  );

  for (const trip of trips) {
    const created = monthKeyOfDate(trip.createdAt);
    const createdPoint = created ? buckets.get(created) : undefined;
    if (!createdPoint) continue;
    const sheet = sheetOf(trip);
    const total = costTotal(sheet);
    // Accrual: the dispatch's worth and its cost sheet, at the moment raised.
    createdPoint.income += Number(trip.revenue ?? 0);
    createdPoint.expenses += total;
    createdPoint.direct += total;
    // Cash in: what Accounts recorded as paid, at the stamp they wrote.
    const paidAt = monthKeyOfDate(sheet.disbursement?.at ?? null);
    if (sheet.disbursement?.status && paidAt && buckets.has(paidAt)) {
      const paid = buckets.get(paidAt)!;
      paid.inflow += total; // the money that reached the operation
      paid.outflow += total; // and left again, onto the truck — net zero
    }
  }

  for (const row of indirect) {
    const at = monthKeyOfDate(row.date);
    const point = at ? buckets.get(at) : undefined;
    if (!point) continue;
    point.expenses += row.amount;
    point.outflow += row.amount;
  }

  const series = axis.map((month) => {
    const point = buckets.get(month.key)!;
    point.net = point.inflow - point.outflow;
    return point;
  });

  // The donut's slices: direct vs each indirect category, biggest first, and
  // anything past the fourth slice folds into "Other" the way the mock does.
  const perCategory = new Map<string, number>();
  for (const row of indirect) {
    const at = monthKeyOfDate(row.date);
    if (!at || !buckets.has(at)) continue;
    perCategory.set(row.category, (perCategory.get(row.category) ?? 0) + row.amount);
  }
  const directTotal = series.reduce((sum, point) => sum + point.direct, 0);
  const raw = [
    { label: "Direct Costs", amount: directTotal },
    ...INDIRECT_CATEGORIES.map((category) => ({
      label: category,
      amount: perCategory.get(category) ?? 0,
    })),
  ]
    .filter((slice) => slice.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const slices =
    raw.length > 5
      ? [
          ...raw.slice(0, 4),
          { label: "Other", amount: raw.slice(4).reduce((sum, s) => sum + s.amount, 0) },
        ]
      : raw;

  const netTotal = series.reduce((sum, point) => sum + point.net, 0);
  return { series, slices, netTotal };
}

function ChartCard({
  title,
  basis,
  badge,
  children,
}: {
  title: string;
  basis: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2.5 text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">
            {title}
            {badge ? (
              <span className="rounded-[4px] bg-[#F7E9B0] px-2 py-0.5 text-[11px] font-bold text-[#7A5C00]">
                {badge}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-[#5C6470]">{basis}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-9 items-center gap-2 rounded-[6px] border border-[#1B2432] px-3.5 text-[13px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
        >
          <Printer className="size-4" />
          View report
        </button>
      </div>
      {children}
    </section>
  );
}

function LegendSwatch({ label, className }: { label: string; className: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("inline-block size-3 rounded-[3px]", className)} />
      <span>{label}</span>
    </span>
  );
}

/** The hatched "everything else" swatch, as the mock's legend draws it. */
function HatchLegend({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 12 12" className="size-3 rounded-[3px] border border-[#C6CDD5]">
        <path
          d="M0 12 L12 0 M0 6 L6 0 M6 12 L12 6"
          stroke="#9AA5B1"
          strokeWidth="1.2"
          fill="none"
        />
      </svg>
      <span>{label}</span>
    </span>
  );
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #E2E5E9",
  fontSize: 12.5,
  boxShadow: "0px 8px 24px rgba(12,12,13,0.12)",
} as const;

function ProfitLossCard({ data }: { data: MoneyPoint[] }) {
  return (
    <ChartCard title="Profit and Loss" basis="Accrual (paid & unpaid)">
      <div className="mb-2 flex items-center gap-6 pl-1 text-[13px] text-[#344256]">
        <LegendSwatch className="bg-[#0A7F58]" label="Income" />
        <HatchLegend label="Expenses" />
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#E2E5E9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10.5, fill: "#5C6470" }}
            axisLine={{ stroke: "#E2E5E9" }}
            tickLine={false}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={54}
          />
          <YAxis
            tickFormatter={shortNaira}
            tick={{ fontSize: 11, fill: "#5C6470" }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
          <Tooltip
            formatter={(value) => money(Number(value))}
            cursor={{ fill: "rgba(27,36,50,0.04)" }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar
            dataKey="income"
            name="Income"
            fill="#0A7F58"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="expenses"
            name="Expenses"
            fill="#C6CDD5"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const DONUT_PALETTE = ["#1B2432", "#5C6470", "#9AA5B1", "#C6CDD5", "#E2E5E9"];

function BreakdownDonutCard({ slices }: { slices: Array<{ label: string; amount: number }> }) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  return (
    <ChartCard
      title="Expenses Breakdown"
      basis="Direct and indirect, this period"
      badge="Live data"
    >
      {total > 0 ? (
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:gap-10">
          <div className="relative">
            <ResponsiveContainer width={210} height={210}>
              <PieChart>
                <Pie
                  data={slices.map((slice) => ({ name: slice.label, value: slice.amount }))}
                  dataKey="value"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={1}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.label} fill={DONUT_PALETTE[index % DONUT_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    `${money(Number(value))} · ${Math.round((Number(value) / total) * 100)}%`,
                    String(name),
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-[0.4px] text-[#9CA3AF]">Total</span>
              <span className="text-[15px] font-semibold text-[#1B2432]">{shortNaira(total)}</span>
            </div>
          </div>
          <ul className="flex flex-col gap-2.5">
            {slices.map((slice, index) => (
              <li
                key={slice.label}
                className="flex items-center gap-2.5 text-[13.5px] text-[#344256]"
              >
                {slice.label === "Other" ? (
                  <svg viewBox="0 0 12 12" className="size-3 rounded-[3px] border border-[#C6CDD5]">
                    <path
                      d="M0 12 L12 0 M0 6 L6 0 M6 12 L12 6"
                      stroke="#9AA5B1"
                      strokeWidth="1.2"
                      fill="none"
                    />
                  </svg>
                ) : (
                  <span
                    className="size-3 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                  />
                )}
                <span className="font-semibold tabular-nums text-[#1B2432]">
                  {percentOf(slice.amount, total)}
                </span>
                <span>{slice.label}</span>
                <span className="text-[12px] text-[#5C6470]">{money(slice.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="py-10 text-center text-[13px] text-[#5C6470]">
          No expense lines in this window yet — the donut fills as the voucher and indirect ledgers
          record money.
        </p>
      )}
    </ChartCard>
  );
}

function CashFlowCard({ data }: { data: MoneyPoint[] }) {
  return (
    <ChartCard title="Cash Flow" basis="Always displays cash basis (paid)">
      <div className="mb-2 flex flex-wrap items-center gap-6 pl-1 text-[13px] text-[#344256]">
        <LegendSwatch className="bg-[#0A7F58]" label="Inflow" />
        <HatchLegend label="Outflow" />
        <span className="flex items-center gap-2">
          <span className="h-[2px] w-5 bg-[#F2C200]" />
          <span>Net change</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E2E5E9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10.5, fill: "#5C6470" }}
            axisLine={{ stroke: "#E2E5E9" }}
            tickLine={false}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={54}
          />
          <YAxis
            tickFormatter={shortNaira}
            tick={{ fontSize: 11, fill: "#5C6470" }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
          <Tooltip formatter={(value) => money(Number(value))} contentStyle={TOOLTIP_STYLE} />
          <Bar
            dataKey="inflow"
            name="Inflow"
            fill="#0A7F58"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="outflow"
            name="Outflow"
            fill="#C6CDD5"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
          <Line
            type="linear"
            dataKey="net"
            name="Net change"
            stroke="#F2C200"
            strokeWidth={2}
            dot={{ r: 3, fill: "#F2C200", stroke: "#FFFFFF", strokeWidth: 1 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="flex items-start gap-1.5 text-[11.5px] leading-4 text-[#9CA3AF]">
        <Ellipsis className="mt-0.5 size-3.5 shrink-0" />
        Cash basis: only money Accounts has recorded moves these bars. A voucher payment shows as
        cash in (the money that reached the operation) and cash out (onto the truck) in the same
        month; indirect spend leaves as it is recorded. Income rides on trip revenue — until revenue
        is recorded on dispatches, the inflow line follows the payment stamps alone.
      </p>
    </ChartCard>
  );
}

function AnalyticsBoard({
  trips,
  indirectRows,
  loading,
}: {
  trips: Trip[];
  indirectRows: IndirectRow[];
  loading: boolean;
}) {
  const [periodFilter, setPeriodFilter] = useState("Last 12 months");
  const monthsBack =
    periodFilter === "Last 3 months" ? 3 : periodFilter === "Last 6 months" ? 6 : 12;

  const { series, slices, netTotal } = useMemo(
    () => buildMoneySeries(trips, indirectRows, monthsBack),
    [trips, indirectRows, monthsBack],
  );

  return (
    <div className={PAGE_BG}>
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
          Analytics
        </h2>
        <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
          The department's money as pictures — profit and loss, what the spend is made of, and how
          cash actually moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex h-11 w-full items-center md:w-[280px]">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-11 w-full appearance-none rounded-[8px] border border-[#E2E5E9] bg-white px-4 text-[14px] font-medium text-[#1B2432] outline-none focus:border-[#1B2432]"
          >
            {["Last 3 months", "Last 6 months", "Last 12 months"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-[#5C6470]" />
        </label>
      </div>

      {loading ? (
        <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <FigmaLoadingState label="Building the charts from the ledgers…" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ProfitLossCard data={series} />
          <BreakdownDonutCard slices={slices} />
          <div className="xl:col-span-2">
            <CashFlowCard data={series} />
          </div>
        </div>
      )}

      {/* The ledger behind the charts, for the days a picture is not enough. */}
      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
            Monthly Ledger
          </h3>
          <button
            type="button"
            onClick={() =>
              exportCsv(
                "accounts-analytics.csv",
                ["Month", "Income (Revenue)", "Cash In", "Cash Out", "Net Change"],
                series.map((point) => [
                  point.label,
                  point.income,
                  point.inflow,
                  point.outflow,
                  point.net,
                ]),
              )
            }
            className="h-10 rounded-[6px] border border-[#E2E5E9] px-4 text-[13.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
          >
            Export CSV
          </button>
        </div>
        <div className="flex flex-col overflow-x-auto">
          <div
            className={cn(
              MONTH_GRID,
              "border-b border-[#E2E5E9] pb-3 text-[13.5px] font-semibold text-[#1B2432]",
            )}
          >
            <span>Month</span>
            <span className="text-right">Income (Revenue)</span>
            <span className="text-right">Cash In</span>
            <span className="text-right">Cash Out</span>
            <span className="text-right">Net Change</span>
          </div>
          {series.every((point) => !point.income && !point.inflow && !point.outflow) ? (
            <p className="py-6 text-[13px] text-[#5C6470]">
              No revenue or recorded payments in this window yet — income lights up as revenue is
              recorded on dispatches, cash as Accounts records payments.
            </p>
          ) : null}
          {series.map((point) => (
            <div
              key={point.label}
              className={cn(
                MONTH_GRID,
                "border-b border-[#E2E5E9] py-3.5 text-[13px] text-[#344256]",
              )}
            >
              <span className="font-medium text-[#1B2432]">{point.label}</span>
              <span className="text-right tabular-nums">{money(point.income)}</span>
              <span className="text-right tabular-nums">{money(point.inflow)}</span>
              <span className="text-right tabular-nums">{money(point.outflow)}</span>
              <span
                className={cn(
                  "text-right font-semibold tabular-nums",
                  point.net < 0 ? "text-[#ED351D]" : "text-[#1B2432]",
                )}
              >
                {money(point.net)}
              </span>
            </div>
          ))}
          <div className={cn(MONTH_GRID, "pt-3.5 text-[13.5px] font-semibold text-[#1B2432]")}>
            <span>Net position ({monthsBack} months)</span>
            <span />
            <span />
            <span />
            <span
              className={cn(
                "text-right tabular-nums",
                netTotal < 0 ? "text-[#ED351D]" : "text-[#1B2432]",
              )}
            >
              {money(netTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TmAccounts() {
  const [tab, setTab] = useState<string>(TABS[0].label);
  const [loading, setLoading] = useState(true);
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  const refresh = useCallback(async () => {
    // One department, four boards — the figures are read once, here, from the
    // departments that generate them. A failed source renders empty rather
    // than taking the page down.
    const [headRes, orderRes, movementRes, expenseRes, tripRes] = await Promise.allSettled([
      fleetService.listHeads(),
      engineeringService.listWorkOrders(),
      inventoryService.movements(),
      accountService.list(),
      tripService.list(),
    ]);
    if (headRes.status === "fulfilled") setHeads(headRes.value);
    if (orderRes.status === "fulfilled") setOrders(orderRes.value);
    if (movementRes.status === "fulfilled") setMovements(movementRes.value);
    if (expenseRes.status === "fulfilled") setExpenses(expenseRes.value);
    if (tripRes.status === "fulfilled") setTrips(tripRes.value);
    if (
      headRes.status === "rejected" &&
      orderRes.status === "rejected" &&
      movementRes.status === "rejected" &&
      expenseRes.status === "rejected" &&
      tripRes.status === "rejected"
    ) {
      toast.error("Could not reach the ledgers behind the Accounts boards.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const indirectRows = useMemo(
    () => [
      ...movementRows(heads, movements),
      ...workOrderRows(orders),
      ...otherExpenseRows(expenses),
    ],
    [heads, movements, orders, expenses],
  );

  return (
    <>
      {/*
       * The Engineering pattern, applied to Accounts: the department's boards
       * as tabs across the top. One department, three views — no new sidebar
       * entries, no new routes.
       */}
      <DepartmentTabStrip
        items={TABS.map((item) => ({ label: item.label, icon: item.icon }))}
        active={tab}
        onSelect={setTab}
      />
      {tab === "Direct Expense" ? <TmVouchers /> : null}
      {tab === "Indirect Expense" ? <IndirectBoard rows={indirectRows} loading={loading} /> : null}
      {tab === "Estimates & Depreciation" ? (
        <DepreciationBoard heads={heads} loading={loading} />
      ) : null}
      {tab === "Analytics" ? (
        <AnalyticsBoard trips={trips} indirectRows={indirectRows} loading={loading} />
      ) : null}
    </>
  );
}
