import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService, lubricantService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  csvStamp,
  formatMoney,
  formatQuantity,
  lubricantUnit,
  type LubricantOverview,
  type LubricantRestock,
} from "@/lib/fleetopsx/lubricant";
import {
  exportCsv,
  LubricantSearch,
  LubricantTableFooter,
  RestockModal,
  TankCard,
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
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
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

export const Route = createFileRoute("/workspace/app/lubricant-inventory")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Lubricant Inventory | FleetOpsX" },
      {
        name: "description",
        content: "Diesel and gas in the tank, and every restock that put it there.",
      },
    ],
  }),
  component: LubricantInventoryPage,
});

/** The fuel the register is filtered to — the department's own two words. */
const RESTOCK_FILTERS = ["All", "Diesel", "Gas"] as const;
type RestockFilter = (typeof RESTOCK_FILTERS)[number];

/** Restock Records — every purchase that put lubricant back in a tank. */
const RESTOCK_GRID =
  "grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)]";

/** Date over time — a restock is read by the moment it landed, not the day. */
function RestockDate({ value }: { value?: string | null }) {
  const { date, time } = formatDateLines(value);
  return (
    <span className="min-w-0 text-[14px] leading-4 text-[#5C6470]">
      {date}
      {time && <span className="block text-[12px] text-[#627084]">{time}</span>}
    </span>
  );
}

function LubricantInventoryPage() {
  const [overview, setOverview] = useState<LubricantOverview | null>(null);
  const [restocks, setRestocks] = useState<LubricantRestock[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [fuelFilter, setFuelFilter] = useState<RestockFilter>("All");
  const [page, setPage] = useState(0);
  const [restocking, setRestocking] = useState<false | "Diesel" | "Gas">(false);

  const refresh = useCallback(async () => {
    try {
      const [next, rows] = await Promise.all([
        lubricantService.overview(),
        lubricantService.restocks(),
      ]);
      setOverview(next);
      setRestocks(rows);
    } catch (err) {
      // Keep whatever is on screen — a poll that fails must not blank the tank.
      if (loading)
        toast.error(err instanceof Error ? err.message : "Failed to load the lubricant inventory.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useAutoRefresh(() => void refresh(), []);

  /** The ledger's own time frame — presets or a custom 1 – 15 Sept pair. */
  const [periodFilter, setPeriodFilter] = useState<string>("All time");
  const rangeCustom = useCustomRange();
  const range = useMemo(
    () => resolvePeriod(periodFilter, rangeCustom.custom),
    [periodFilter, rangeCustom.custom],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restocks.filter((r) => {
      if (fuelFilter !== "All" && r.fuelType !== fuelFilter) return false;
      if (!inWindow(r.createdAt, range)) return false;
      if (!q) return true;
      return [r.reference, r.fuelType, r.loggedBy, String(r.quantity)].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [restocks, query, fuelFilter, range]);

  /** The ledger's footer: deliveries, litres in and what they cost. */
  const restockSummary = (
    <SummaryBar
      items={[
        { label: "Deliveries", value: String(filtered.length) },
        {
          label: "Diesel in",
          value: `${formatQuantity(filtered.filter((r) => r.fuelType === "Diesel").reduce((s, r) => s + r.quantity, 0))} L`,
        },
        {
          label: "Gas in",
          value: `${formatQuantity(filtered.filter((r) => r.fuelType === "Gas").reduce((s, r) => s + r.quantity, 0))} KG`,
        },
        {
          label: "Delivery cost",
          value: formatMoney(
            filtered.reduce((s, r) => s + r.quantity * Number(r.unitCost ?? 0), 0),
          ),
        },
      ]}
    />
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const stocks = overview?.stocks ?? [];
  const diesel = stocks.find((s) => s.fuelType === "Diesel");
  const gas = stocks.find((s) => s.fuelType === "Gas");

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
            Lubricant Inventory
          </h2>
          <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
            Manage lubricant inventory and log restock
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRestocking("Diesel")}
          className="flex h-10 items-center justify-center rounded bg-[#ED351D] px-4 text-[14px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]"
        >
          Restock Inventory
        </button>
      </div>

      {loading && !overview ? (
        <div className="rounded-[10px] border border-[#E2E5E9] bg-white p-8 text-center text-[14px] text-[#5C6470]">
          Loading lubricant inventory…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {diesel && <TankCard stock={diesel} onClick={() => setRestocking("Diesel")} />}
          {gas && <TankCard stock={gas} onClick={() => setRestocking("Gas")} />}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        {/* Title, the search, and the department's own red filter — the shape the
            design draws for every one of its three registers. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-5">
          <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
            Restock Records
          </h3>
          <div className="flex flex-wrap items-center gap-2.5">
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
              options={RESTOCK_FILTERS}
              value={fuelFilter}
              onChange={(f) => {
                setFuelFilter(f);
                setPage(0);
              }}
              allLabel="All Lubricants"
              iconOnly
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={cn(
                "items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]",
                RESTOCK_GRID,
              )}
            >
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Restock ID
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Date
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Lubricant
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Quantity
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Logged by
              </span>
            </div>

            {slice.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                {restocks.length === 0
                  ? "No restock has been logged yet — press Restock Inventory to record the first delivery."
                  : `Nothing matches “${query.trim()}”.`}
              </p>
            ) : (
              slice.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0",
                    RESTOCK_GRID,
                  )}
                >
                  <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">
                    {row.reference}
                  </span>
                  <RestockDate value={row.createdAt} />
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {row.fuelType}
                  </span>
                  <span className="flex items-baseline gap-1.5 truncate">
                    <span className="text-[14px] font-medium tabular-nums text-[#141A1F]">
                      {formatQuantity(row.quantity)}
                    </span>
                    <span className="text-[10.5px] uppercase tracking-[0.4px] text-[#627084]">
                      {lubricantUnit(row.fuelType)}
                    </span>
                  </span>
                  <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                    {row.loggedBy}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {filtered.length > 0 ? restockSummary : null}

        <LubricantTableFooter
          from={filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}
          to={Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
          total={filtered.length}
          page={safePage}
          pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onExport={() =>
            exportCsv(
              "lubricant-restock-records.csv",
              ["Restock ID", "Date", "Lubricant", "Quantity", "Unit", "Cost per unit", "Logged by"],
              filtered.map((r) => [
                r.reference,
                csvStamp(r.createdAt),
                r.fuelType,
                r.quantity,
                lubricantUnit(r.fuelType),
                r.unitCost ?? "",
                r.loggedBy,
              ]),
            )
          }
        />
      </div>

      <RestockModal
        open={restocking !== false}
        stocks={stocks}
        initialFuel={restocking === false ? undefined : restocking}
        onClose={() => setRestocking(false)}
        onDone={(message) => {
          setRestocking(false);
          toast.success(message);
          void refresh();
        }}
      />
    </div>
  );
}
