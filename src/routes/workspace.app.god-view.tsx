import { createFileRoute, Link } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, ArrowUpRight, Fuel, Gauge, Truck, Wrench } from "lucide-react";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { ChartFrame } from "@/components/fleetopsx/chart-frame";
import { MetricCard } from "@/components/fleetopsx/metric-card";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardService, formatNaira } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/god-view")({
  loader: async () => {
    const overview = await dashboardService.getOverview();
    const charts = await dashboardService.charts();
    return { ...overview, charts };
  },
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "God View | FleetOpsX" },
      { name: "description", content: "Revenue, utilisation, fuel and open issues." },
      { property: "og:title", content: "God View | FleetOpsX" },
      { property: "og:description", content: "Revenue, utilisation, fuel and open issues." },
    ],
  }),
  component: GodViewPage,
});

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 14,
  fontSize: 12,
  color: "#1d1d1f",
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
};

function GodViewPage() {
  const { trips: TRIPS, drivers: DRIVERS, expenses: EXPENSES, workOrders: WORK_ORDERS, inventory: INVENTORY, alerts: ALERTS, charts } = Route.useLoaderData();
  const revenue = charts.costRevenue.reduce((s: any, r: any) => s + r.revenue, 0) * 1_000_000;
  const cost = charts.costRevenue.reduce((s: any, r: any) => s + r.cost, 0) * 1_000_000;
  const utilisation = Math.round(charts.utilisation.reduce((s: any, r: any) => s + r.utilisation, 0) / charts.utilisation.length);
  const completed = TRIPS.filter((t) => t.status === "Completed").length;
  const delayed = TRIPS.filter((t) => t.status === "Delayed").length;
  const fuelCost = EXPENSES.filter((e) => e.type === "Fuel").reduce((s, e) => s + e.amount, 0);
  const maintCost = WORK_ORDERS.reduce((s, w) => s + w.cost, 0);
  const pendingExp = EXPENSES.filter((e) => e.status === "Pending").reduce((s, e) => s + e.amount, 0);

  const bottlenecks = [
    { label: "Delayed trips", value: delayed, tone: "warning" as const, to: "/workspace/app/trips" },
    { label: "Maintenance backlog", value: WORK_ORDERS.filter((w) => w.status !== "Completed").length, tone: "critical" as const, to: "/workspace/app/engineering" },
    { label: "Pending approvals", value: EXPENSES.filter((e) => e.status === "Pending").length, tone: "info" as const, to: "/workspace/app/accounts" },
    { label: "Driver shortages", value: DRIVERS.filter((d) => d.status === "Available").length < 8 ? 1 : 0, tone: "warning" as const, to: "/workspace/app/drivers" },
    { label: "Low inventory", value: INVENTORY.filter((i) => i.status !== "In Stock").length, tone: "warning" as const, to: "/workspace/app/inventory" },
  ];

  return (
    <>
      <PageHeader
        title="Management God View"
        description="Costs, fleet use and the issues that need a decision today."
        meta={
          <>
            <StatusBadge status="Online" />
            <span className="num text-[11px] text-muted-foreground">Petroline Transport · PTL-001 · Aug 2026</span>
          </>
        }
        actions={
          <Tabs defaultValue="monthly">
            <TabsList className="h-8">
              {["daily", "weekly", "monthly"].map((v) => (
                <TabsTrigger key={v} value={v} className="h-6 text-[11px] capitalize">{v}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Revenue" value={formatNaira(revenue)} delta="+8.2%" deltaTone="up" accent icon={Gauge} />
        <MetricCard label="Operating Cost" value={formatNaira(cost)} delta="+3.1%" deltaTone="down" />
        <MetricCard label="Fleet Utilisation" value={`${utilisation}%`} hint="target 80%" icon={Truck} />
        <MetricCard label="Trips Completed" value={completed} delta={`${delayed} delayed`} deltaTone={delayed > 5 ? "down" : "up"} />
        <MetricCard label="Fuel Cost" value={formatNaira(fuelCost)} icon={Fuel} />
        <MetricCard label="Maintenance Cost" value={formatNaira(maintCost)} icon={Wrench} />
        <MetricCard label="Expense Exposure" value={formatNaira(pendingExp)} hint="pending approvals" />
        <MetricCard label="Operational Efficiency" value="87.4%" delta="+2.1 pts" deltaTone="up" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionPanel title="Fleet Utilisation" description="Daily utilisation vs 80% target" bodyClassName="p-4">
          <ChartFrame><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={charts.utilisation}>
              <defs>
                <linearGradient id="utilFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} domain={[40, 100]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
              <Area type="monotone" dataKey="utilisation" stroke="var(--chart-1)" fill="url(#utilFill)" strokeWidth={2} />
              <Line type="monotone" dataKey="target" stroke="var(--chart-3)" strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer></ChartFrame>
        </SectionPanel>

        <SectionPanel title="Trip Performance" description="Completed vs delayed" bodyClassName="p-4">
          <ChartFrame><ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.tripPerformance} barGap={4} barCategoryGap="28%">
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} />
              <Bar dataKey="delayed" fill="var(--chart-5)" radius={[6, 6, 6, 6]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer></ChartFrame>
        </SectionPanel>

        <SectionPanel title="Fuel Efficiency" description="Actual vs standard Km/L" bodyClassName="p-4">
          <ChartFrame><ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.fuel}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} domain={[2.5, 3.6]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="actual" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="standard" stroke="var(--chart-4)" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer></ChartFrame>
        </SectionPanel>

        <SectionPanel title="Expense Breakdown" description="Fuel / repairs / tolls / allowances" bodyClassName="p-4">
          <ChartFrame><ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={charts.expenseSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {charts.expenseSplit.map((_: any, i: number) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer></ChartFrame>
        </SectionPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionPanel title="Revenue vs Operating Cost" description="₦ millions · trailing six months" bodyClassName="p-4">
          <ChartFrame><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.costRevenue}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} strokeWidth={2} />
              <Area type="monotone" dataKey="cost" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer></ChartFrame>
        </SectionPanel>

        <SectionPanel title="Operational Bottlenecks" description="Open issues" bodyClassName="space-y-2 p-3">
          {bottlenecks.map((b) => (
            <Link
              key={b.label}
              to={b.to}
              className="flex items-center gap-3 rounded-[16px] border border-black/[0.04] bg-black/[0.02] px-3.5 py-3 transition-colors hover:bg-black/[0.04]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{b.label}</p>
                <p className="num text-[10px] text-muted-foreground uppercase">{b.tone}</p>
              </div>
              <span className="num text-lg font-semibold text-foreground">{b.value}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
          <div className="pt-1">
            <Button asChild size="sm" variant="outline" className="h-8 w-full text-xs">
              <Link to="/workspace/app/reports">Open full reports catalogue</Link>
            </Button>
          </div>
          <div className="rounded-[16px] border border-black/[0.04] bg-black/[0.02] p-3.5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Critical alert</p>
            <p className="mt-1 text-xs text-foreground">{ALERTS[0]?.message}</p>
          </div>
        </SectionPanel>
      </div>
    </>
  );
}

