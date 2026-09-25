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
import {
  CustomRangePicker,
  PeriodFilter,
  SummaryBar,
  resolvePeriod,
  useCustomRange,
  windowLabel,
} from "@/lib/fleetopsx/report-kit";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { printSheet } from "@/components/fleetopsx/dashboard-drill";
import { exportCsv } from "@/components/fleetopsx/lubricant-ui";
import { formatQuantity } from "@/lib/fleetopsx/lubricant";
import { partnerOf } from "@/lib/fleetopsx/tracking-ops";
import { cn } from "@/lib/utils";

/**
 * Analytics & Reports — the Transport Manager's end-to-end read of the whole
 * operation, in one place and one window at a time.
 *
 * The two filters at the top answer the whole page: every partner or one of
 * them, and any window — presets or a custom 1 – 15 Sept pair. Every table
 * carries an Excel-style summary at its foot (totals over the FILTERED rows,
 * so the numbers reconcile with the screen), exports to CSV, and the whole
 * report prints as one sheet for the boardroom. Figures come from the live
 * truth via `buildAnalyticsReport` — the same lists the departments work
 * from, through the same windows the boards offer.
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
  summary,
  onExport,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /** The Excel-style totals row printed under the table. */
  summary?: React.ReactNode;
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
      {summary}
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

  /** The two filters the whole page answers to — plus the custom date pair. */
  const [period, setPeriod] = useState<string>("Two weeks");
  const [company, setCompany] = useState<string>("All companies");
  const custom = useCustomRange();
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

  const range = useMemo(() => resolvePeriod(period, custom.custom), [period, custom.custom]);

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
    return {
      page,
      rows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
      total: rows.length,
    };
  };

  const rangeText = windowLabel(period, range);
  const companyLabel = company === "All companies" ? "every partner" : company;

  /* ---------------------------------------------------------- summaries -- */

  const partnerSummary = (
    <SummaryBar
      items={[
        { label: "Partners", value: String(report.companies.length) },
        { label: "Requests", value: String(report.fleet.requests) },
        {
          label: "Diesel out",
          value: `${formatQuantity(report.fuels.find((f) => f.fuelType === "Diesel")?.dispensedQty ?? 0)} L`,
        },
        {
          label: "Gas out",
          value: `${formatQuantity(report.fuels.find((f) => f.fuelType === "Gas")?.dispensedQty ?? 0)} KG`,
        },
        { label: "Direct cost", value: money(report.fleet.directCost) },
        { label: "Fuel cost", value: money(report.fleet.fuelCost) },
      ]}
    />
  );

  const driverSummary = (
    <SummaryBar
      items={[
        { label: "Drivers", value: String(report.drivers.length) },
        { label: "Trips", value: String(report.drivers.reduce((s, d) => s + d.trips, 0)) },
        { label: "Completed", value: String(report.drivers.reduce((s, d) => s + d.completed, 0)) },
        {
          label: "Dispensed",
          value: formatQuantity(report.drivers.reduce((s, d) => s + d.litres, 0)),
        },
        { label: "Fuel cost", value: money(report.drivers.reduce((s, d) => s + d.fuelCost, 0)) },
      ]}
    />
  );

  const destinationSummary = (
    <SummaryBar
      items={[
        { label: "Destinations", value: String(report.destinations.length) },
        { label: "Trips", value: String(report.destinations.reduce((s, d) => s + d.trips, 0)) },
        {
          label: "Direct cost",
          value: money(report.destinations.reduce((s, d) => s + d.directCost, 0)),
        },
        {
          label: "Dispensed",
          value: formatQuantity(report.destinations.reduce((s, d) => s + d.litres, 0)),
        },
      ]}
    />
  );

  const fuelSummary = (
    <SummaryBar
      items={[
        { label: "Dispensed", value: `${formatQuantity(report.fleet.litresDispensed)} units` },
        { label: "Pours", value: String(report.fleet.pours) },
        { label: "Fuel cost", value: money(report.fleet.fuelCost) },
        {
          label: "Restocked",
          value: `${formatQuantity(report.fuels.reduce((s, f) => s + f.restockedQty, 0))} units`,
        },
        {
          label: "Restock cost",
          value: money(report.fuels.reduce((s, f) => s + f.restockedCost, 0)),
        },
      ]}
    />
  );

  const trendSummary = (
    <SummaryBar
      items={[
        { label: "Days", value: "14" },
        { label: "Requests", value: String(report.trend.reduce((s, p) => s + p.requests, 0)) },
        { label: "Completed", value: String(report.trend.reduce((s, p) => s + p.completed, 0)) },
        {
          label: "Dispensed",
          value: formatQuantity(report.trend.reduce((s, p) => s + p.litres, 0)),
        },
        { label: "Fuel cost", value: money(report.trend.reduce((s, p) => s + p.cost, 0)) },
      ]}
    />
  );

  /* ------------------------------------------------------------ printing -- */

  const printReport = () => {
    const kpi = report.fleet;
    const rows = (values: (string | number)[][]) =>
      values.map((v) => `<tr>${v.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    printSheet(
      "Analytics & Reports",
      `${companyLabel} · ${rangeText} · printed ${new Date().toLocaleString("en-NG")}`,
      `<p><strong>Requests:</strong> ${kpi.requests} · completed ${kpi.completed} · on the road ${kpi.inTransit} · declined ${kpi.declined}</p>
       <p><strong>Direct cost committed:</strong> ${money(kpi.directCost)}${kpi.avgDirectPerRequest === null ? "" : ` (avg ${money(kpi.avgDirectPerRequest)}/request)`} · <strong>Fuel dispensed:</strong> ${money(kpi.fuelCost)} across ${kpi.pours} pour(s), ${formatQuantity(kpi.litresDispensed)} units</p>
       <h2>Lifecycle mix</h2>
       <table><thead><tr><th>Stage</th><th>Dispatches</th><th>Direct cost</th><th>Dispensed</th></tr></thead><tbody>${
         rows(
           report.statusMix.map((s) => [
             s.label,
             s.count,
             money(s.directCost),
             formatQuantity(s.litres),
           ]),
         ) || `<tr><td colspan="4">Nothing in the window.</td></tr>`
       }</tbody></table>
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
             formatQuantity(d.litres),
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
       <h2>Top lanes</h2>
       <table><thead><tr><th>Lane</th><th>Trips</th><th>Completed</th><th>Direct cost</th><th>Dispensed</th></tr></thead><tbody>${
         rows(
           report.routes.map((r) => [
             r.route,
             r.trips,
             r.completed,
             money(r.directCost),
             formatQuantity(r.litres),
           ]),
         ) || `<tr><td colspan="5">No lane ran in this window.</td></tr>`
       }</tbody></table>
       <h2>By truck</h2>
       <table><thead><tr><th>Truck</th><th>Trips</th><th>Completed</th><th>Dispensed</th><th>Fuel cost</th></tr></thead><tbody>${
         rows(
           report.trucks.map((t) => [
             t.truck,
             t.trips,
             t.completed,
             formatQuantity(t.litres),
             money(t.fuelCost),
           ]),
         ) || `<tr><td colspan="5">No truck ran in this window.</td></tr>`
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
       }</tbody></table>
       <h2>Six-month comparison</h2>
       <table><thead><tr><th>Month</th><th>Requests</th><th>Dispensed</th><th>Fuel cost</th></tr></thead><tbody>${
         rows(
           report.months.map((m) => [m.month, m.requests, formatQuantity(m.litres), money(m.cost)]),
         ) || `<tr><td colspan="4">No month on record.</td></tr>`
       }</tbody></table>
       <h2>Daily trend</h2>
       <table><thead><tr><th>Day</th><th>Requests</th><th>Completed</th><th>Dispensed</th><th>Fuel cost</th></tr></thead><tbody>${
         rows(
           report.trend.map((p) => [
             p.day,
             p.requests,
             p.completed,
             formatQuantity(p.litres),
             money(p.cost),
           ]),
         ) || `<tr><td colspan="5">No day on record.</td></tr>`
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
        "Destinations",
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
        c.destinations,
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
  const exportRoutes = () =>
    exportCsv(
      "analytics-lanes.csv",
      ["Lane", "Trips", "Completed", "Direct cost", "Dispensed"],
      report.routes.map((r) => [r.route, r.trips, r.completed, r.directCost, r.litres]),
    );
  const exportTrucks = () =>
    exportCsv(
      "analytics-trucks.csv",
      ["Truck", "Trips", "Completed", "Dispensed", "Fuel cost"],
      report.trucks.map((t) => [t.truck, t.trips, t.completed, t.litres, t.fuelCost]),
    );
  const exportStatus = () =>
    exportCsv(
      "analytics-lifecycle.csv",
      ["Stage", "Dispatches", "Direct cost", "Dispensed"],
      report.statusMix.map((s) => [s.label, s.count, s.directCost, s.litres]),
    );
  const exportMonths = () =>
    exportCsv(
      "analytics-months.csv",
      ["Month", "Requests", "Dispensed", "Fuel cost"],
      report.months.map((m) => [m.month, m.requests, m.litres, m.cost]),
    );
  const exportTrend = () =>
    exportCsv(
      "analytics-daily-trend.csv",
      ["Day", "Requests", "Completed", "Dispensed", "Fuel cost"],
      report.trend.map((p) => [p.day, p.requests, p.completed, p.litres, p.cost]),
    );

  /* -------------------------------------------------------------- view ---- */

  const kpis = [
    { label: "Requests", value: String(report.fleet.requests), sub: rangeText },
    { label: "Completed", value: String(report.fleet.completed), sub: "in the window" },
    { label: "On the Road", value: String(report.fleet.inTransit), sub: "scheduled + moving" },
    {
      label: "Direct Cost",
      value: money(report.fleet.directCost),
      sub:
        report.fleet.avgDirectPerRequest === null
          ? "committed on loads"
          : `avg ${money(report.fleet.avgDirectPerRequest)}/load`,
    },
    {
      label: "Fuel Dispensed",
      value: money(report.fleet.fuelCost),
      sub: `${formatQuantity(report.fleet.litresDispensed)} units · ${report.fleet.pours} pour(s)`,
    },
    {
      label: "Fleet & Crew",
      value: `${report.fleet.trucks} · ${report.fleet.drivers}`,
      sub: `${report.fleet.trucksOnRoad} on the road now`,
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
            The whole operation, end to end · {companyLabel} · {rangeText}
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
          <PeriodFilter
            value={period}
            onChange={(v) => {
              setPeriod(v);
              setPages({});
            }}
            custom={custom.custom}
            customOpen={custom.open}
            onToggleCustom={custom.setOpen}
          >
            <CustomRangePicker custom={custom.custom} onSet={custom.set} onClear={custom.clear} />
          </PeriodFilter>
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
            title="Lifecycle Mix"
            subtitle="Where every dispatch in the window stands, with the money and litres in each stage"
            onExport={exportStatus}
          >
            <Table columns={["Stage", "Dispatches", "Direct cost", "Dispensed"]}>
              {report.statusMix.every((s) => s.count === 0) ? (
                <Empty text="Nothing is in the window yet." />
              ) : (
                report.statusMix
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <Row
                      key={s.label}
                      values={[s.label, s.count, money(s.directCost), formatQuantity(s.litres)]}
                    />
                  ))
              )}
            </Table>
          </ReportCard>

          <ReportCard
            title="By Partner"
            subtitle={`Requests, cost and every litre dispensed per partner · ${rangeText}`}
            summary={partnerSummary}
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
            <MiniPager
              page={pageOf("companies", report.companies.length)}
              pageCount={Math.max(1, Math.ceil(report.companies.length / PAGE_SIZE))}
              onPage={(p) => setPage("companies", p)}
              total={report.companies.length}
              unit="partner"
            />
          </ReportCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ReportCard
              title="By Driver"
              subtitle={`Trips run and litres dispensed per driver · top 20 · ${rangeText}`}
              summary={driverSummary}
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
              subtitle={`Where the loads went and what they cost · top 20 · ${rangeText}`}
              summary={destinationSummary}
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

            <ReportCard
              title="Top Lanes"
              subtitle={`Pickup → dropoff performance · top 12 · ${rangeText}`}
              onExport={exportRoutes}
            >
              <Table columns={["Lane", "Trips", "Completed", "Direct cost", "Dispensed"]}>
                {report.routes.length === 0 ? (
                  <Empty text="No lane ran in this window." />
                ) : (
                  report.routes.map((r) => (
                    <Row
                      key={r.route}
                      values={[
                        r.route,
                        r.trips,
                        r.completed,
                        money(r.directCost),
                        formatQuantity(r.litres),
                      ]}
                    />
                  ))
                )}
              </Table>
            </ReportCard>

            <ReportCard
              title="By Truck"
              subtitle={`Which heads are pulling and what they draw · top 12 · ${rangeText}`}
              onExport={exportTrucks}
            >
              <Table columns={["Truck", "Trips", "Completed", "Dispensed", "Fuel cost"]}>
                {report.trucks.length === 0 ? (
                  <Empty text="No truck ran in this window." />
                ) : (
                  report.trucks.map((t) => (
                    <Row
                      key={t.truck}
                      values={[
                        t.truck,
                        t.trips,
                        t.completed,
                        formatQuantity(t.litres),
                        money(t.fuelCost),
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
            summary={fuelSummary}
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

          <div className="grid gap-5 xl:grid-cols-2">
            <ReportCard
              title="Six-Month Comparison"
              subtitle="Requests, litres and fuel money month by month"
              onExport={exportMonths}
            >
              <Table columns={["Month", "Requests", "Dispensed", "Fuel cost"]}>
                {report.months.map((m) => (
                  <Row
                    key={m.month}
                    values={[m.month, m.requests, formatQuantity(m.litres), money(m.cost)]}
                  />
                ))}
              </Table>
            </ReportCard>

            <ReportCard
              title="Daily Trend"
              subtitle={`The last 14 days, one row per day · ${rangeText}`}
              summary={trendSummary}
              onExport={exportTrend}
            >
              <Table columns={["Day", "Requests", "Completed", "Dispensed", "Fuel cost"]}>
                {report.trend.map((p) => (
                  <Row
                    key={p.day}
                    values={[
                      p.day,
                      p.requests,
                      p.completed,
                      formatQuantity(p.litres),
                      money(p.cost),
                    ]}
                  />
                ))}
              </Table>
            </ReportCard>
          </div>
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
