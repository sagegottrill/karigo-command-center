import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService, lubricantService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  csvStamp,
  formatQuantity,
  lubricantDispatchId,
  lubricantUnit,
  lubricantWithQuantity,
  resolveVehicle,
  type LubricantDisbursalRow,
} from "@/lib/fleetopsx/lubricant";
import {
  DisbursalViewModal,
  exportCsv,
  LubricantSearch,
  LubricantTableFooter,
} from "@/components/fleetopsx/lubricant-ui";
import { FilterButton } from "@/components/fleetopsx/filter-button";
import { RowActionMenu } from "@/components/fleetopsx/row-action-menu";
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

export const Route = createFileRoute("/workspace/app/lubricant-history")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Disbursal History | FleetOpsX" },
      {
        name: "description",
        content:
          "Every diesel and gas disbursal: which truck, which driver, how much and who dispensed it.",
      },
    ],
  }),
  component: DisbursalHistoryPage,
});

/**
 * The ledger the department drew: the ticket leads, the pour closes it.
 * The date is WHEN IT WAS POUMPED — the record is what came off the tank,
 * not the paperwork that allowed it.
 */
const HISTORY_GRID =
  "grid grid-cols-[minmax(110px,0.9fr)_minmax(96px,0.75fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1fr)_44px]";

type FuelFilter = "All" | "Diesel" | "Gas";
const FUEL_FILTERS: readonly FuelFilter[] = ["All", "Diesel", "Gas"];

function HistoryDate({ value }: { value?: string | null }) {
  const { date, time } = formatDateLines(value);
  return (
    <span className="min-w-0 text-[14px] leading-4 text-[#5C6470]">
      {date}
      {time && <span className="block text-[12px] text-[#627084]">{time}</span>}
    </span>
  );
}

function DisbursalHistoryPage() {
  const [rows, setRows] = useState<LubricantDisbursalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [fuelFilter, setFuelFilter] = useState<FuelFilter>("All");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<LubricantDisbursalRow | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await lubricantService.disbursals());
    } catch (err) {
      if (loading)
        toast.error(err instanceof Error ? err.message : "Failed to load the disbursal history.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useAutoRefresh(() => void refresh(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (fuelFilter !== "All" && row.fuelType !== fuelFilter) return false;
      if (!q) return true;
      const v = resolveVehicle(row);
      return [
        lubricantDispatchId(row),
        row.reference,
        v.capNumber,
        v.plate,
        v.driverName,
        v.driverPhone,
        row.fuelType,
        row.dispensedBy,
        row.dropoff,
        row.trip?.pickup,
        row.trip?.customer,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [rows, query, fuelFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const totals = useMemo(() => {
    const litres: Record<string, number> = {};
    for (const r of filtered) litres[r.fuelType] = (litres[r.fuelType] ?? 0) + r.quantity;
    return litres;
  }, [filtered]);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Disbursal History
        </h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
          Manage lubricant disbursal history
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">
              Logged Disbursal
            </h3>
            {filtered.length > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] font-medium text-white">
                {filtered.length}
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

        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div
              className={cn(
                "items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]",
                HISTORY_GRID,
              )}
            >
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Dispatch ID
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Date
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
                Lubricant
              </span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
                Dispensed by
              </span>
              <span />
            </div>

            {loading && rows.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                Loading disbursal history…
              </p>
            ) : slice.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                {rows.length === 0
                  ? "No lubricant has been dispensed yet. Disburse Request records what leaves the tank."
                  : `Nothing matches “${query.trim()}”.`}
              </p>
            ) : (
              slice.map((row) => {
                const v = resolveVehicle(row);
                return (
                  <div
                    key={row.id}
                    onClick={() => setActive(row)}
                    className={cn(
                      "cursor-pointer items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0 hover:bg-[#F7F8F9]",
                      HISTORY_GRID,
                    )}
                  >
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">
                      {lubricantDispatchId(row)}
                    </span>
                    <HistoryDate value={row.createdAt} />
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
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">
                      {lubricantWithQuantity(row.fuelType, row.quantity)}
                    </span>
                    <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">
                      {row.dispensedBy}
                    </span>
                    <span className="justify-self-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu
                        open={menuFor === row.id}
                        onOpenChange={(o) => setMenuFor(o ? row.id : null)}
                        label={`Options for ${lubricantDispatchId(row)}`}
                        width={180}
                        items={[
                          {
                            label: "View Details",
                            onSelect: () => setActive(row),
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

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-[#F1F2F4] px-4 py-3">
            <span className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
              {filtered.length} disbursal{filtered.length === 1 ? "" : "s"} poured
            </span>
            {Object.entries(totals).map(([fuelType, total]) => (
              <span key={fuelType} className="text-[12.5px] tracking-[0.4px] text-[#141A1F]">
                {fuelType}:{" "}
                <span className="font-semibold tabular-nums">{formatQuantity(total)}</span>{" "}
                {lubricantUnit(fuelType).toLowerCase()}
              </span>
            ))}
          </div>
        )}

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
              "lubricant-disbursal-history.csv",
              [
                "Dispatch ID",
                "Date",
                "Driver",
                "Truck Head",
                "Tail Type",
                "Phone Number",
                "Lubricant",
                "Quantity",
                "Unit",
                "Dispensed by",
                "Dispensed At",
              ],
              filtered.map((r) => {
                const v = resolveVehicle(r);
                return [
                  lubricantDispatchId(r),
                  csvStamp(r.createdAt),
                  v.driverName,
                  v.capNumber,
                  v.bodyType,
                  v.driverPhone,
                  r.fuelType,
                  r.quantity,
                  lubricantUnit(r.fuelType),
                  r.dispensedBy,
                  csvStamp(r.createdAt),
                ];
              }),
            )
          }
        />
      </div>

      <DisbursalViewModal open={active !== null} row={active} onClose={() => setActive(null)} />
    </div>
  );
}
