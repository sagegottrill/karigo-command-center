import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authService, lubricantService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  csvStamp,
  formatQuantity,
  lubricantUnit,
  resolveVehicle,
  type LubricantOverview,
  type LubricantRequestRow,
} from "@/lib/fleetopsx/lubricant";
import {
  DispatchDetailsModal,
  exportCsv,
  LubricantSearch,
  LubricantTableFooter,
} from "@/components/fleetopsx/lubricant-ui";
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
      { title: "Log Disbursal | FleetOpsX" },
      { name: "description", content: "Dispense diesel and gas against an active dispatch." },
    ],
  }),
  component: LogDisbursalPage,
});

/** A truck still waiting for its lubricant, and what it asked for. */
const REQUEST_GRID =
  "grid grid-cols-[minmax(110px,0.95fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_88px]";

function LogDisbursalPage() {
  const [requests, setRequests] = useState<LubricantRequestRow[]>([]);
  const [overview, setOverview] = useState<LubricantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<LubricantRequestRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, next] = await Promise.all([lubricantService.requests(), lubricantService.overview()]);
      setRequests(rows);
      setOverview(next);
    } catch (err) {
      if (loading) toast.error(err instanceof Error ? err.message : "Failed to load the disbursal requests.");
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
    if (!q) return requests;
    return requests.filter((r) => {
      const v = resolveVehicle(r);
      return [
        r.id,
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
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [requests, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const stocks = overview?.stocks ?? [];
  const prices = overview?.prices ?? {};

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Log Disbursal
        </h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
          Log disbursement for active dispatch
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">Disbursal Request</h3>
            {requests.length > 0 && (
              <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] font-medium text-white">
                {requests.length}
              </span>
            )}
          </div>
          <LubricantSearch
            value={query}
            onChange={setQuery}
            placeholder="Search dispatch, truck (cap or plate), driver…"
          />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className={cn("items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]", REQUEST_GRID)}>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch ID</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Driver</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck Head</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Body Type</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Drop-off Location</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Requested</span>
              <span className="justify-self-end text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Action</span>
            </div>

            {loading && requests.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">Loading disbursal requests…</p>
            ) : slice.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                {requests.length === 0
                  ? "No dispatch is waiting for lubricant. A truck appears here the moment Fleet Operations assigns one with a diesel or gas request."
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
                      REQUEST_GRID,
                    )}
                  >
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">
                      {row.reference ?? "—"}
                    </span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                      {v.driverName}
                    </span>
                    <span className="truncate text-[13px] tracking-[0.4px] text-[#627084]">
                      {v.capNumber === "—" ? "—" : `${v.capNumber} (${v.plate})`}
                    </span>
                    <span className="truncate text-[14px] tracking-[0.4px] text-[#5C6470]">{v.bodyType}</span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                      {row.dropoff || "—"}
                    </span>
                    <span className="flex items-baseline gap-1.5 truncate">
                      <span className="text-[13px] font-medium text-[#141A1F]">
                        {formatQuantity(row.request?.quantity ?? 0)}
                      </span>
                      <span className="text-[10.5px] uppercase tracking-[0.4px] text-[#627084]">
                        {lubricantUnit(row.request?.fuelType ?? "Diesel")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(row);
                      }}
                      className="justify-self-end rounded border border-[#ED351D] px-3 py-1.5 text-[12.5px] font-medium text-[#ED351D] hover:bg-[#ED351D]/5"
                    >
                      Log
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
              "lubricant-disbursal-requests.csv",
              ["Dispatch ID", "Driver", "Truck Head", "Body Type", "Drop-off Location", "Lubricant", "Quantity", "Unit", "Assigned"],
              filtered.map((r) => {
                const v = resolveVehicle(r);
                return [
                  r.reference ?? r.id,
                  v.driverName,
                  v.capNumber === "—" ? "" : `${v.capNumber} (${v.plate})`,
                  v.bodyType,
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
        open={active !== null}
        row={active}
        stocks={stocks}
        prices={prices}
        onClose={() => setActive(null)}
        onDone={(message) => {
          setActive(null);
          toast.success(message);
          void refresh();
        }}
      />
    </div>
  );
}
