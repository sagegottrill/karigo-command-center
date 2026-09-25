import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import {
  driverService,
  fleetService,
  lubricantService,
  tripService,
} from "@/lib/fleetopsx/services";
import { buildAnalyticsReport, type AnalyticsReport } from "@/lib/fleetopsx/analytics";
import { REPORT_PERIODS, reportWindow } from "@/lib/fleetopsx/period";
import { partnerOf } from "@/lib/fleetopsx/tracking-ops";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { printSheet } from "@/components/fleetopsx/dashboard-drill";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { formatQuantity } from "@/lib/fleetopsx/lubricant";
import { cn } from "@/lib/utils";

/**
 * Analytics & Reports — the Transport Manager's end-to-end read of the whole
 * operation, in one place and one window at a time.
 *
 * Everything on this page is computed from the live truth (trips, the fleet,
 * drivers, the tank, the pour ledger) by `buildAnalyticsReport` — the same
 * lists the departments work from, filtered through the SAME time frames the
 * boards offer, so "diesel to Saba Steel in two weeks" here is the same two
 * weeks and the same litres the lubricant board sums. Every table exports to
 * CSV, and the whole report prints as one sheet for the boardroom.
 *
 * The route is the TM's alone: every department's numbers, and the money on
 * them, are his to read — no department sees another's ledger here.
 */
export const Route = createFileRoute("/workspace/app/analytics")({
  head: () => ({
    meta: [{ title: "Analytics & Reports | FleetOpsX" }],
  }),
  component: AnalyticsPage,
});

const money = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

function ReportCard({
  title,
  subtitle,
  children,
  onExport,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onExport?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-[3px]">
          <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">{title}</h3>
          <p className="text-[12px] text-[#5C6470]">{subtitle}</p>
        </div>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="h-9 rounded-[6px] border border-[#E2E5E9] px-3 text-[12.5px] font-semibold text-[#1B2432] hover:bg-[#F1F2F4]"
          >
            Export CSV
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Table({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  const cols = columns.map((c) => (c === "#" ? "minmax(0,0.7fr)" : "minmax(0,1fr)")).join(" ");
  return (
    <div className="flex flex-col">
      <div
        className="grid items-center gap-3 border-b border-[#E2E5E9] pb-3"
        style={{ gridTemplateColumns: cols }}
      >
        {columns.map((c) => (
          <span key={c} className="text-[13.5px] font-semibold text-[#1B2432]">
            {c}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Row({ values, strongFirst = true }: { values: React.ReactNode[]; strongFirst?: boolean }) {
  return (
    <div
      className="grid items-center gap-3 border-b border-[#E2E5E9] py-3 text-[13.5px] text-[#344256] last:border-b-0"
      style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
    >
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("truncate", i === 0 && strongFirst && "font-medium text-[#1B2432]")}
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[13px] text-[#5C6470]">{text}</p>;
}

function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);
  const [heads, setHeads] = useState<unknown[]>([]);
  const [drivers, setDrivers] = useState<unknown[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [restocks, setRestocks] = useState<any[]>([]);
  const [disbursals, setDisbursals] = useState<any[]>([]);

  /** The two filters the whole page answers to. */
  const [period, setPeriod] = useState<string>("Two weeks");
  const [company, setCompany] = useState<string>("All companies");
  const [pages, setPages] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const [tripRows, headRows, driverRows, overview, restockRows, pourRows] = await Promise.all([
        tripService.list().catch(() => [] as any[]),
        fleetService.listHeads().catch(() => [] as unknown[]),
        driverService.list().catch(() => [] as unknown[]),
        lubricantService.overview().catch(() => null),
        lubricantService.restocks().catch(() => [] as any[]),
        lubricantService.disbursals().catch(() => [] as any[]),
      ]);
      setTrips(tripRows as any[]);
      setHeads(headRows);
      setDrivers(driverRows);
      setStocks(overview?.stocks ?? []);
      setRestocks(restockRows);
      setDisbursals(pourRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** The report's window — named `range` so the global `window` survives. */
  const range = useMemo(() => reportWindow(period), [period]);

  const companies = useMemo(() => {
    const seen = new Set<string>();
    for (const t of trips) {
      const name = partnerOf(t).trim();
      if (name) seen.add(name);
    }
    return ["All companies", ...Array.from(seen).sort((a, b) => a.localeCompare(b))];
  }, [trips]);

  const report: AnalyticsReport = useMemo(
    () =>
      buildAnalyticsReport({
        trips: trips as any,
        heads,
        drivers,
        stocks,
        restocks,
        disbursals,
        window: range,
        company: company === "All companies" ? null : company,
      }),
    [trips, heads, drivers, stocks, restocks, disbursals, range, company],
  );

  const setPage = (key: string, page: number) => setPages((p) => ({ ...p, [key]: page }));
  const pageOf = (key: string, total: number) =>
    Math.min(pages[key] ?? 0, Math.max(1, Math.ceil(total / PAGE_SIZE)) - 1);

  const slice = <T,>(key: string, rows: T[]) => {
    const page = pageOf(key, rows.length);
    return { page, rows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: rows.length };
  };

  const rangeLabel = range ? range.label : "All time";
  const companyLabel = company === "All companies" ? "every partner" : company;

  /* ------------------------------------------------------------ printing -- */

  const printReport = () => {
    const kpi = report.fleet;
    const rows = (values: (string | number)[][]) =>
      values.map((v) => `<tr>${v.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    printSheet(
      "Analytics & Reports",
      `${companyLabel} · ${rangeLabel} · printed ${new Date().toLocaleString("en-NG")}`,
      `<p><strong>Requests:</strong> ${kpi.requests} · completed ${kpi.completed} · on the road ${kpi.inTransit} · declined ${kpi.declined}</p>
       <p><strong>Direct cost committed:</strong> ${money(kpi.directCost)} · <strong>Fuel dispensed:</strong> ${money(kpi.fuelCost)} across ${report.fuels.reduce((s, f) => s + f.pours, 0)} pour(s)</p>
       <h2>By partner</h2>
       <table><thead><tr><th>Partner</th><th>Requests</th><th>Completed</th><th>On the road</th><th>Direct cost</th><th>Diesel (L)</th><th>Gas (KG)</th><th>Fuel cost</th></tr></thead><tbody>${
         rows(
           report.companies.map((c) => [
             c.partner,
             c.requests,
             c.completed,
             c.inTransit,
             money(c.directCost),
             formatQuantity(c.dieselQty),
             formatQuantity(c.gasQty),
             money(c.fuelCost),
           ]),
         ) || `<tr><td colspan="8">No partner moved in this window.</td></tr>`
       }</tbody></table>
       <h2>By driver</h2>
       <table><thead><tr><th>Driver</th><th>Trips</th><th>Completed</th><th>Dispensed</th><th>Fuel cost</th></tr></thead><tbody>${
         rows(
           report.drivers.map((d) => [
             d.driver,
             d.trips,
             d.completed,
             `${formatQuantity(d.litres)}`,
             money(d.fuelCost),
           ]),
         ) || `<tr><td colspan="5">No driver ran in this window.</td></tr>`
       }</tbody></table>
       <h2>By destination</h2>
       <table><thead><tr><th>Destination</th><th>Trips</th><th>Completed</th><th>Direct cost</th><th>Dispensed</th></tr></thead><tbody>${
         rows(
           report.destinations.map((d) => [
             d.destination,
             d.trips,
             d.completed,
             money(d.directCost),
             formatQuantity(d.litres),
           ]),
         ) || `<tr><td colspan="5">No destination served in this window.</td></tr>`
       }</tbody></table>
       <h2>Fuel &amp; tank</h2>
       <table><thead><tr><th>Fuel</th><th>Dispensed</th><th>Cost</th><th>Pours</th><th>Restocked</th><th>Restock cost</th><th>In tank</th><th>Minimum</th></tr></thead><tbody>${
         rows(
           report.fuels.map((f) => [
             f.fuelType,
             `${formatQuantity(f.dispensedQty)} ${f.unit.toLowerCase()}`,
             money(f.dispensedCost),
             f.pours,
             `${formatQuantity(f.restockedQty)} ${f.unit.toLowerCase()}`,
             money(f.restockedCost),
             `${formatQuantity(f.tankQty)} ${f.unit.toLowerCase()}`,
             formatQuantity(f.tankMin),
           ]),
         ) || `<tr><td colspan="8">No fuel recorded.</td></tr>`
       }</tbody></table>`,
    );
  };

  const exportCompanies = () =>
    exportCsv(
      "analytics-companies.csv",
      [
        "Partner",
        "Requests",
        "Completed",
        "On the road",
        "Direct cost",
        "Diesel (L)",
        "Gas (KG)",
        "Fuel cost",
      ],
      report.companies.map((c) => [
        c.partner,
        c.requests,
        c.completed,
        c.inTransit,
        c.directCost,
        c.dieselQty,
        c.gasQty,
        c.fuelCost,
      ]),
    );
  const exportDrivers = () =>
    exportCsv(
      "analytics-drivers.csv",
      ["Driver", "Trips", "Completed", "Dispensed", "Fuel cost"],
      report.drivers.map((d) => [d.driver, d.trips, d.completed, d.litres, d.fuelCost]),
    );
  const exportDestinations = () =>
    exportCsv(
      "analytics-destinations.csv",
      ["Destination", "Trips", "Completed", "Direct cost", "Dispensed"],
      report.destinations.map((d) => [d.destination, d.trips, d.completed, d.directCost, d.litres]),
    );
  const exportTrend = () =>
    exportCsv(
      "analytics-daily-trend.csv",
      ["Day", "Requests", "Completed", "Dispensed", "Fuel cost"],
      report.trend.map((p) => [p.day, p.requests, p.completed, p.litres, p.cost]),
    );

  /* -------------------------------------------------------------- view ---- */

  const kpis = [
    {
      label: "Requests",
      value: String(report.fleet.requests),
      sub: range ? range.label : "All time",
    },
    {
      label: "Completed",
      value: String(report.fleet.completed),
      sub: range ? "in the window" : "of all time",
    },
    { label: "On the Road", value: String(report.fleet.inTransit), sub: "scheduled + moving" },
    { label: "Direct Cost", value: money(report.fleet.directCost), sub: "committed on loads" },
    { label: "Fuel Dispensed", value: money(report.fleet.fuelCost), sub: "what the pours cost" },
    {
      label: "Fleet & Crew",
      value: `${report.fleet.trucks} · ${report.fleet.drivers}`,
      sub: "heads · drivers",
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[26px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[22px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[26px]">
            Analytics &amp; Reports
          </h2>
          <p className="text-[11px] uppercase tracking-[0.4px] text-[#5C6470]">
            The whole operation, end to end · {companyLabel} · {rangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setPages({});
            }}
            aria-label="Filter by partner"
            className="h-10 max-w-[200px] rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
          >
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPages({});
            }}
            aria-label="Filter by period"
            className="h-10 rounded-[6px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
          >
            {REPORT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={printReport}
            className="flex h-10 items-center gap-2 rounded-[6px] bg-[#1B2432] px-4 text-[13.5px] font-semibold text-white hover:bg-[#2a3547]"
          >
            <Printer className="size-4" />
            Print report
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-[13.5px] text-[#5C6470]">Building the report…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="flex flex-col gap-1 rounded-[10px] border border-[#E2E5E9] bg-white p-4"
              >
                <span className="text-[11.4px] uppercase leading-4 tracking-[0.4px] text-[#627084]">
                  {k.label}
                </span>
                <span className="text-[24px] font-semibold leading-7 tabular-nums text-[#141A1F]">
                  {k.value}
                </span>
                <span className="text-[11.5px] tracking-[0.4px] text-[#5C6470]">{k.sub}</span>
              </div>
            ))}
          </div>

          <ReportCard
            title="By Partner"
            subtitle={`Requests, cost and every litre dispensed per partner · ${rangeLabel}`}
            onExport={exportCompanies}
          >
            <Table
              columns={[
                "Partner",
                "Requests",
                "Completed",
                "On the road",
                "Direct cost",
                "Diesel (L)",
                "Gas (KG)",
                "Fuel cost",
              ]}
            >
              {slice("companies", report.companies).rows.length === 0 ? (
                <Empty text="No partner moved in this window." />
              ) : (
                slice("companies", report.companies).rows.map((c) => (
                  <Row
                    key={c.partner}
                    values={[
                      c.partner,
                      c.requests,
                      c.completed,
                      c.inTransit,
                      money(c.directCost),
                      formatQuantity(c.dieselQty),
                      formatQuantity(c.gasQty),
                      money(c.fuelCost),
                    ]}
                  />
                ))
              )}
            </Table>
            {report.companies.length > PAGE_SIZE ? (
              <MiniPager
                page={pageOf("companies", report.companies.length)}
                pageCount={Math.max(1, Math.ceil(report.companies.length / PAGE_SIZE))}
                onPage={(p) => setPage("companies", p)}
                total={report.companies.length}
                unit="partner"
              />
            ) : null}
          </ReportCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ReportCard
              title="By Driver"
              subtitle={`Trips run and litres dispensed per driver · top 20 · ${rangeLabel}`}
              onExport={exportDrivers}
            >
              <Table columns={["Driver", "Trips", "Completed", "Dispensed", "Fuel cost"]}>
                {slice("drivers", report.drivers).rows.length === 0 ? (
                  <Empty text="No driver ran in this window." />
                ) : (
                  slice("drivers", report.drivers).rows.map((d) => (
                    <Row
                      key={d.driver}
                      values={[
                        d.driver,
                        d.trips,
                        d.completed,
                        formatQuantity(d.litres),
                        money(d.fuelCost),
                      ]}
                    />
                  ))
                )}
              </Table>
            </ReportCard>

            <ReportCard
              title="By Destination"
              subtitle={`Where the loads went and what they cost · top 20 · ${rangeLabel}`}
              onExport={exportDestinations}
            >
              <Table columns={["Destination", "Trips", "Completed", "Direct cost", "Dispensed"]}>
                {slice("destinations", report.destinations).rows.length === 0 ? (
                  <Empty text="No destination served in this window." />
                ) : (
                  slice("destinations", report.destinations).rows.map((d) => (
                    <Row
                      key={d.destination}
                      values={[
                        d.destination,
                        d.trips,
                        d.completed,
                        money(d.directCost),
                        formatQuantity(d.litres),
                      ]}
                    />
                  ))
                )}
              </Table>
            </ReportCard>
          </div>

          <ReportCard
            title="Fuel & Tank"
            subtitle="What was dispensed, what was delivered into the tank, and what stands"
          >
            <Table
              columns={[
                "Fuel",
                "Dispensed",
                "Cost",
                "Pours",
                "Restocked",
                "Restock cost",
                "In tank",
                "Minimum",
              ]}
            >
              {report.fuels.map((f) => (
                <Row
                  key={f.fuelType}
                  values={[
                    f.fuelType,
                    `${formatQuantity(f.dispensedQty)} ${f.unit.toLowerCase()}`,
                    money(f.dispensedCost),
                    f.pours,
                    `${formatQuantity(f.restockedQty)} ${f.unit.toLowerCase()}`,
                    money(f.restockedCost),
                    `${formatQuantity(f.tankQty)} ${f.unit.toLowerCase()}`,
                    formatQuantity(f.tankMin),
                  ]}
                />
              ))}
            </Table>
          </ReportCard>

          <ReportCard
            title="Daily Trend"
            subtitle={`The last 14 days, one row per day · ${rangeLabel}`}
            onExport={exportTrend}
          >
            <Table columns={["Day", "Requests", "Completed", "Dispensed", "Fuel cost"]}>
              {report.trend.map((p) => (
                <Row
                  key={p.day}
                  values={[p.day, p.requests, p.completed, formatQuantity(p.litres), money(p.cost)]}
                />
              ))}
            </Table>
          </ReportCard>
        </>
      )}
    </div>
  );
}

function MiniPager({
  page,
  pageCount,
  onPage,
  total,
  unit,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
  unit: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] pt-4">
      <span className="text-[13.5px] font-semibold text-[#1B2432]">
        {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, total)} of {total} {unit}
        {total === 1 ? "" : "s"}
      </span>
      <div className="ml-2 flex items-center gap-2.5">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          aria-label="Previous page"
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
        >
          <ChevronLeft className="size-[18px] text-[#627084]" />
        </button>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
        >
          <ChevronRight className="size-[18px] text-[#627084]" />
        </button>
      </div>
      <span className="text-[12.5px] text-[#5C6470]">
        Page {page + 1} of {pageCount}
      </span>
    </div>
  );
}
