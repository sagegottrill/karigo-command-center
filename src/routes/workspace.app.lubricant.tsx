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
  jobLocation,
  LUBRICANT_RANGES,
  lubricantUnit,
  resolveVehicle,
  withinRange,
  type LubricantDisbursalRow,
  type LubricantOverview,
  type LubricantRequestRow,
  type LubricantRange,
} from "@/lib/fleetopsx/lubricant";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exportCsv, LubricantSearch, LubricantTableFooter } from "@/components/fleetopsx/lubricant-ui";
import { formatDateLines } from "@/lib/fleetopsx/display-dates";
import { cn } from "@/lib/utils";

/**
 * Who may see the money.
 *
 * The department dispenses litres; only the Transport Manager, Fleet Operations,
 * Accounts and the platform see what those litres cost.
 */
const ALLOWED = ["Transport Manager", "Platform Admin", "Fleet Operations", "Accounts", "Accountant"];

export const Route = createFileRoute("/workspace/app/lubricant")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Lubricant | FleetOpsX" },
      {
        name: "description",
        content: "Diesel and gas in the tank, what was dispensed each day and what it cost, by company and truck.",
      },
    ],
  }),
  component: LubricantReportPage,
});

const REPORT_GRID =
  "grid grid-cols-[minmax(104px,0.85fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.95fr)]";

function ReportDate({ value }: { value?: string | null }) {
  const { date, time } = formatDateLines(value);
  return (
    <span className="min-w-0 text-[14px] leading-4 text-[#5C6470]">
      {date}
      {time && <span className="block text-[12px] text-[#627084]">{time}</span>}
    </span>
  );
}

function StatBox({
  label,
  value,
  unit,
  note,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent?: "amber" | "green" | "plain";
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <span className="text-[11.4px] uppercase leading-4 tracking-[0.4px] text-[#627084]">{label}</span>
      <span className="flex items-end gap-1.5">
        <span className="text-[26px] font-semibold leading-7 tabular-nums text-[#141A1F]">{value}</span>
        {unit && <span className="pb-0.5 text-[11.4px] uppercase tracking-[0.4px] text-[#627084]">{unit}</span>}
      </span>
      {note && (
        <span
          className={cn(
            "text-[11.5px] tracking-[0.4px]",
            accent === "amber" ? "text-[#ED351D]" : accent === "green" ? "text-emerald-600" : "text-[#627084]",
          )}
        >
          {note}
        </span>
      )}
    </div>
  );
}

function LubricantReportPage() {
  const [overview, setOverview] = useState<LubricantOverview | null>(null);
  const [rows, setRows] = useState<LubricantDisbursalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<LubricantRange>("All time");
  const [companies, setCompanies] = useState<string[]>([]);
  const [companyMenu, setCompanyMenu] = useState(false);
  const [page, setPage] = useState(0);
  /** Fleet Ops' diesel asks, and the TM's release on each — the desk he works. */
  const [asks, setAsks] = useState<LubricantRequestRow[]>([]);
  /** The ask currently being released — the modal's subject, null when closed. */
  const [releasing, setReleasing] = useState<LubricantRequestRow | null>(null);
  const [releaseValue, setReleaseValue] = useState("");
  const [releaseSaving, setReleaseSaving] = useState(false);
  /**
   * The TM's release queue pages, 20 to a page.
   *
   * It used to show eight and then dump the rest behind "Show all 62", which
   * turned the page into a 62-row scroll. A page at a time is scannable and the
   * count is still exact.
   */
  const [queuePage, setQueuePage] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [next, history, pending] = await Promise.all([
        lubricantService.overview(),
        lubricantService.disbursals(),
        lubricantService.requests().catch(() => [] as LubricantRequestRow[]),
      ]);
      setOverview(next);
      setRows(history);
      setAsks(pending);
    } catch (err) {
      if (loading) toast.error(err instanceof Error ? err.message : "Failed to load the lubricant report.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useAutoRefresh(() => void refresh(), []);

  /*
   * THE RELEASE, ON THE DEPARTMENT'S OWN PAGE. Fleet Ops works out what each
   * dispatch needs; the pump refuses to dispense more than the Transport
   * Manager released. That decision used to live only on his dashboard, so
   * opening the module itself gave him nothing to act on — the queue and the
   * decision now sit together here.
   */
  const isTm = authService.getRoles().includes("Transport Manager");
  const pendingAsks = useMemo(() => asks.filter((a) => !a.approval), [asks]);
  /*
   * ONE number for "still waiting". The stat card and the queue header used to
   * print the server's count and the loaded list respectively, which is how the
   * same screen showed 63 and 62 at once. Both now read the list the queue
   * pages; the server's count is only the fallback for a role whose request
   * queue does not load at all.
   */
  const waitingForRelease = asks.length > 0 ? pendingAsks.length : (overview?.counts.requests ?? 0);
  const queuePageCount = Math.max(1, Math.ceil(pendingAsks.length / PAGE_SIZE));
  const safeQueuePage = Math.min(queuePage, queuePageCount - 1);
  const queueRows = pendingAsks.slice(safeQueuePage * PAGE_SIZE, (safeQueuePage + 1) * PAGE_SIZE);

  const openRelease = (ask: LubricantRequestRow) => {
    setReleasing(ask);
    setReleaseValue(String(ask.request.quantity));
  };

  const confirmRelease = async () => {
    if (!releasing) return;
    const litres = Number(releaseValue.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(litres) || litres <= 0) {
      toast.error("Enter a positive number.");
      return;
    }
    setReleaseSaving(true);
    try {
      await lubricantService.authorize(
        releasing.id,
        litres,
        authService.getCurrentUser()?.name || "Transport Manager",
      );
      toast.success(`${formatQuantity(litres)} released — the pump cannot exceed it.`);
      setReleasing(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The release was not saved.");
    } finally {
      setReleaseSaving(false);
    }
  };

  /** Every company that has ever been dispensed to, so the filter can offer them. */
  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const name = String(r.trip?.customer ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const want = companies.map((c) => c.toLowerCase());
    return rows.filter((row) => {
      if (!withinRange(row.createdAt, range)) return false;
      const company = String(row.trip?.customer ?? "").trim();
      if (want.length && !want.includes(company.toLowerCase())) return false;
      if (!q) return true;
      const v = resolveVehicle(row);
      return [row.reference, v.capNumber, v.plate, v.driverName, v.bodyType, row.fuelType, company, row.dropoff].some(
        (value) => String(value ?? "").toLowerCase().includes(q),
      );
    });
  }, [rows, query, range, companies]);

  const totals = useMemo(() => {
    const litres: Record<string, number> = {};
    let amount = 0;
    for (const r of filtered) {
      litres[r.fuelType] = (litres[r.fuelType] ?? 0) + r.quantity;
      amount += r.amount;
    }
    return { litres, amount };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const diesel = overview?.stocks.find((s) => s.fuelType === "Diesel");
  const gas = overview?.stocks.find((s) => s.fuelType === "Gas");
  const dayLitres = (overview?.daily.litres.Diesel ?? 0) + (overview?.daily.litres.Gas ?? 0);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Lubricant
        </h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
          What is in the tank, what was dispensed today and what it cost
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatBox
          label="Total Diesel Available"
          value={formatQuantity(diesel?.quantity ?? 0)}
          unit="litres"
          note={diesel?.low ? `Below the ${formatQuantity(diesel?.minLevel ?? 0)} L minimum` : "Above minimum"}
          accent={diesel?.low ? "amber" : "green"}
        />
        <StatBox
          label="Total Gas Available"
          value={formatQuantity(gas?.quantity ?? 0)}
          unit="kg"
          note={gas?.low ? `Below the ${formatQuantity(gas?.minLevel ?? 0)} KG minimum` : "Above minimum"}
          accent={gas?.low ? "amber" : "green"}
        />
        <StatBox
          label="Diesel & Gas Dispensed Today"
          value={formatQuantity(dayLitres)}
          unit="litres / kg"
          note={`${formatMoney(overview?.daily.amount ?? 0)} today`}
        />
        <StatBox
          label="Trucks Dispensed Today"
          value={formatQuantity(overview?.daily.trucks ?? 0)}
          unit="trucks"
          note={`${formatQuantity(waitingForRelease)} still waiting for lubricant`}
          accent={(overview?.counts.requests ?? 0) > 0 ? "amber" : "plain"}
        />
      </div>

      {isTm && pendingAsks.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-[16px] font-medium text-[#1B2432]">
                Awaiting your release ({pendingAsks.length})
              </h3>
              <p className="text-[12px] text-[#5C6470]">
                Fleet Ops' figure per dispatch — the pump refuses to dispense more than you release.
              </p>
            </div>
          </div>
          <div className="flex flex-col divide-y divide-[#E2E5E9]">
            {queueRows.map((ask) => (
              <div key={ask.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[13.5px] text-[#344256]">
                  {ask.request.quantity} {ask.request.fuelType === "Gas" ? "kg" : "L"} ·{" "}
                  {ask.customer || "—"} · {ask.dropoff || "—"}
                </span>
                <button
                  type="button"
                  onClick={() => openRelease(ask)}
                  className="h-8 shrink-0 rounded bg-[#1B2432] px-3 text-[12px] font-semibold text-white hover:bg-[#2a3547]"
                >
                  Release
                </button>
              </div>
            ))}
          </div>
          {pendingAsks.length > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-4">
              <span className="text-[13.5px] font-semibold tabular-nums text-[#1B2432]">
                {safeQueuePage * PAGE_SIZE + 1} -{" "}
                {Math.min((safeQueuePage + 1) * PAGE_SIZE, pendingAsks.length)}
              </span>
              <span className="text-[13.5px] font-semibold text-[#1B2432]">
                of {pendingAsks.length} awaiting release
              </span>
              <div className="ml-2 flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={safeQueuePage === 0}
                  onClick={() => setQueuePage((p) => Math.max(0, p - 1))}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-[18px] text-[#627084]" />
                </button>
                <button
                  type="button"
                  disabled={safeQueuePage + 1 >= queuePageCount}
                  onClick={() => setQueuePage((p) => p + 1)}
                  className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-[18px] text-[#627084]" />
                </button>
              </div>
              <span className="text-[12.5px] text-[#5C6470]">
                Page {safeQueuePage + 1} of {queuePageCount}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispensed Lubricant</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={range}
              onChange={(e) => {
                setRange(e.target.value as LubricantRange);
                setPage(0);
              }}
              aria-label="Date range"
              className="h-10 rounded border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#141A1F] outline-none focus:border-[#1B2432]"
            >
              {LUBRICANT_RANGES.filter((r) => r !== "Today").map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setCompanyMenu((v) => !v)}
                aria-expanded={companyMenu}
                className={cn(
                  "flex h-10 items-center gap-2 rounded border bg-white px-3 text-[13.5px] tracking-[0.4px]",
                  companies.length ? "border-[#ED351D] text-[#ED351D]" : "border-[#E2E5E9] text-[#141A1F]",
                )}
              >
                {companies.length === 0
                  ? "All companies"
                  : companies.length === 1
                    ? companies[0]
                    : `${companies[0]} +${companies.length - 1}`}
                <span aria-hidden>▾</span>
              </button>
              {companyMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setCompanyMenu(false)} />
                  <div className="absolute right-0 z-40 mt-1 max-h-[280px] w-[240px] overflow-auto rounded-lg border border-[#E2E5E9] bg-white p-2 shadow-[0px_8px_24px_rgba(12,12,13,0.15)]">
                    <button
                      type="button"
                      onClick={() => {
                        setCompanies([]);
                        setPage(0);
                      }}
                      className="mb-1 w-full rounded px-2 py-1.5 text-left text-[13px] text-[#5C6470] hover:bg-[#F1F2F4]"
                    >
                      All companies
                    </button>
                    {companyOptions.length === 0 && (
                      <p className="px-2 py-1.5 text-[12.5px] text-[#9AA1AC]">No company has been dispensed to yet.</p>
                    )}
                    {companyOptions.map((name) => {
                      const ticked = companies.some((c) => c.toLowerCase() === name.toLowerCase());
                      return (
                        <label
                          key={name}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-[#141A1F] hover:bg-[#F1F2F4]"
                        >
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => {
                              setCompanies((prev) =>
                                ticked ? prev.filter((c) => c.toLowerCase() !== name.toLowerCase()) : [...prev, name],
                              );
                              setPage(0);
                            }}
                            className="size-4 accent-[#ED351D]"
                          />
                          {name}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <LubricantSearch
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder="Search truck (cap or plate), driver…"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className={cn("items-center gap-x-3 border-b border-[#E2E5E9] py-[15px]", REPORT_GRID)}>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Date Approved</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Truck</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Driver</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Quantity</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Amount</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Company</span>
              <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch ID</span>
            </div>

            {loading && rows.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">Loading lubricant report…</p>
            ) : slice.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
                {rows.length === 0
                  ? "Nothing has been dispensed yet. Every disbursal the Lubricant department logs appears here with what it cost."
                  : "No disbursal matches this filter."}
              </p>
            ) : (
              slice.map((row) => {
                const v = resolveVehicle(row);
                return (
                  <div
                    key={row.id}
                    className={cn("items-center gap-x-3 border-b border-[#E2E5E9] py-2.5 last:border-b-0", REPORT_GRID)}
                  >
                    <ReportDate value={row.trip?.approvedAt ?? row.createdAt} />
                    <span className="truncate text-[13px] tracking-[0.4px] text-[#627084]">
                      {v.capNumber === "—" ? "—" : `${v.capNumber} (${v.plate})`}
                    </span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{v.driverName}</span>
                    <span className="flex items-baseline gap-1.5 truncate">
                      <span className="text-[14px] font-medium tabular-nums text-[#141A1F]">
                        {formatQuantity(row.quantity)}
                      </span>
                      <span className="text-[10.5px] uppercase tracking-[0.4px] text-[#627084]">
                        {lubricantUnit(row.fuelType)}
                      </span>
                    </span>
                    <span className="truncate text-[14px] font-medium tabular-nums text-[#141A1F]">
                      {formatMoney(row.amount)}
                    </span>
                    <span className="truncate text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">
                      {row.trip?.customer || jobLocation(row.trip)}
                    </span>
                    <span className="truncate text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">{row.reference}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-[#F1F2F4] px-4 py-3">
            {(["Diesel", "Gas"] as const).map((t) => (
              <span key={t} className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
                {t}: <span className="font-semibold tabular-nums text-[#141A1F]">{formatQuantity(totals.litres[t] ?? 0)}</span>{" "}
                {lubricantUnit(t).toLowerCase()}
              </span>
            ))}
            <span className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
              Total litres:{" "}
              <span className="font-semibold tabular-nums text-[#141A1F]">
                {formatQuantity((totals.litres.Diesel ?? 0) + (totals.litres.Gas ?? 0))}
              </span>
            </span>
            <span className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
              Total cost: <span className="font-semibold tabular-nums text-[#ED351D]">{formatMoney(totals.amount)}</span>
            </span>
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
              "lubricant-dispensed.csv",
              [
                "Date Approved",
                "Truck (Cap)",
                "Truck Plate",
                "Driver",
                "Lubricant",
                "Quantity",
                "Unit",
                "Rate per litre",
                "Amount",
                "Company",
                "Dispatch ID",
                "Dispensed by",
                "Dispensed At",
              ],
              filtered.map((r) => {
                const v = resolveVehicle(r);
                return [
                  csvStamp(r.trip?.approvedAt ?? r.createdAt),
                  v.capNumber,
                  v.plate,
                  v.driverName,
                  r.fuelType,
                  r.quantity,
                  lubricantUnit(r.fuelType),
                  r.unitPrice,
                  r.amount,
                  r.trip?.customer ?? "",
                  r.reference,
                  r.dispensedBy,
                  csvStamp(r.createdAt),
                ];
              }),
            )
          }
        />
      </div>

      {/* THE RELEASE MODAL — a real dialog, not a browser prompt the browser
          swallows: the figure is editable before anything is sent, Enter
          confirms, Esc backs out, and the button shows the save in flight. */}
      {releasing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B111C]/55 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setReleasing(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex w-full max-w-[420px] flex-col gap-4 rounded-[12px] bg-white p-5 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]"
            onKeyDown={(e) => {
              if (e.key === "Escape") setReleasing(null);
              if (e.key === "Enter" && !releaseSaving) void confirmRelease();
            }}
          >
            <div className="flex flex-col gap-1">
              <h4 className="text-[16px] font-semibold text-[#1B2432]">
                Release {releasing.request.fuelType === "Gas" ? "gas (kg)" : "diesel (litres)"}
              </h4>
              <p className="text-[12.5px] text-[#5C6470]">
                {releasing.customer || "This dispatch"}
                {releasing.dropoff ? ` · ${releasing.dropoff}` : ""} — Fleet Ops asks for{" "}
                <strong className="font-semibold text-[#344256]">
                  {formatQuantity(releasing.request.quantity)}
                </strong>{" "}
                {releasing.request.fuelType === "Gas" ? "kg" : "L"}. The pump cannot dispense more than you release.
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
                Litres to release
              </span>
              <input
                autoFocus
                value={releaseValue}
                onChange={(e) => setReleaseValue(e.target.value)}
                inputMode="decimal"
                className="h-11 rounded border border-[#E2E5E9] px-3 text-[16px] text-[#141A1F] outline-none focus:border-[#1B2432]"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReleasing(null)}
                className="h-9 rounded px-4 text-[13px] font-medium text-[#5C6470] hover:bg-[#F1F2F4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRelease()}
                disabled={releaseSaving}
                className="h-9 rounded bg-[#1B2432] px-4 text-[13px] font-semibold text-white hover:bg-[#2a3547] disabled:opacity-60"
              >
                {releaseSaving ? "Releasing…" : "Confirm release"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
