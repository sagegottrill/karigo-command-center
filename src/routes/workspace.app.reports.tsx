import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useState } from "react";
import {
  Activity, Download, FileBarChart, Fuel, Truck, Users, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PageHeader, SectionPanel } from "@/components/fleetopsx/page-header";
import { ChartFrame } from "@/components/fleetopsx/chart-frame";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNaira, dashboardService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/reports")({
  loader: async () => {
    const overview = await dashboardService.getOverview();
    const charts = await dashboardService.charts();
    return { ...overview, charts };
  },
  beforeLoad: () => {
    if (typeof window === 'undefined') return;
    const allowed = ["Transport Manager", "Accounts"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Reports | FleetOpsX" },
      { name: "description", content: "Reports for fleet, trips, fuel and accounts." },
      { property: "og:title", content: "Reports | FleetOpsX" },
      { property: "og:description", content: "Reports for fleet, trips, fuel and accounts." },
    ],
  }),
  component: ReportsPage,
});

const CATALOGUE = [
  {
    key: "fleet",
    title: "Fleet Reports",
    icon: Truck,
    items: ["Fleet utilisation", "Vehicle status register", "Vehicle performance"],
  },
  {
    key: "trips",
    title: "Trip Reports",
    icon: Activity,
    items: ["Trips completed", "Delayed trips", "Distance traveled"],
  },
  {
    key: "fuel",
    title: "Fuel Reports",
    icon: Fuel,
    items: ["Consumption", "Km/L efficiency", "Fuel variance"],
  },
  {
    key: "engineering",
    title: "Engineering Reports",
    icon: Wrench,
    items: ["Repairs completed", "Maintenance cost", "Downtime analysis"],
  },
  {
    key: "hr",
    title: "HR Reports",
    icon: Users,
    items: ["Driver activity", "Compliance status", "Availability"],
  },
  {
    key: "accounts",
    title: "Accounts Reports",
    icon: FileBarChart,
    items: ["Expenses", "Approvals turnaround", "Operational spending"],
  },
] as const;

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 14,
  fontSize: 12,
  color: "#1d1d1f",
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
};

function ReportsPage() {
  const { trips: TRIPS, drivers: DRIVERS, expenses: EXPENSES, workOrders: WORK_ORDERS, trucks: TRUCKS, charts } = Route.useLoaderData();
  const [active, setActive] = useState<(typeof CATALOGUE)[number]["key"]>("fleet");

  const exportReport = (name: string) => {
    toast.success("Report export queued", { description: `${name} Â· CSV + PDF pack prepared.` });
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Build, preview and export the reports your team uses each week."
        actions={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => exportReport("Monthly operations pack")}>
            <Download className="h-3.5 w-3.5" />Export pack
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CATALOGUE.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActive(cat.key)}
            className={cn(
              "rounded-[24px] border border-black/[0.05] bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] transition-colors",
              active === cat.key ? "bg-black/[0.03] ring-1 ring-black/10" : "hover:bg-black/[0.015]",
            )}
          >
            <div className="flex items-center gap-2">
              <cat.icon className={cn("h-4 w-4", active === cat.key ? "text-foreground" : "text-muted-foreground")} />
              <p className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">{cat.title}</p>
            </div>
            <ul className="mt-3 space-y-1.5">
              {cat.items.map((item) => (
                <li key={item} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{item}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportReport(item);
                    }}
                  >
                    Export
                  </Button>
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as typeof active)}>
        <TabsList className="h-9 flex-wrap">
          {CATALOGUE.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-xs">{c.title.replace(" Reports", "")}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="fleet" className="mt-4 grid gap-5 lg:grid-cols-2">
          <SectionPanel title="Fleet Utilisation" description="Weekly pattern" bodyClassName="p-4">
            <ChartFrame><ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.utilisation} barCategoryGap="28%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Bar dataKey="utilisation" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer></ChartFrame>
          </SectionPanel>
          <SectionPanel title="Vehicle Status Summary" bodyClassName="space-y-2">
            {(["Available", "Assigned", "In Transit", "Maintenance", "Out of Service"] as const).map((s) => (
              <div key={s} className="flex items-center justify-between rounded-[14px] border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs">
                <span>{s}</span>
                <span className="num font-semibold">{TRUCKS.filter((t) => t.status === s).length}</span>
              </div>
            ))}
          </SectionPanel>
        </TabsContent>

        <TabsContent value="trips" className="mt-4 grid gap-5 lg:grid-cols-2">
          <SectionPanel title="Completed vs Delayed" bodyClassName="p-4">
            <ChartFrame><ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.tripPerformance} barGap={4} barCategoryGap="28%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Bar dataKey="completed" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} />
                <Bar dataKey="delayed" fill="var(--chart-5)" radius={[6, 6, 6, 6]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer></ChartFrame>
          </SectionPanel>
          <SectionPanel title="Distance Snapshot" bodyClassName="space-y-2">
            <div className="flex items-center justify-between rounded-[14px] border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs">
              <span>Total trips</span><span className="num font-semibold">{TRIPS.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-[14px] border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs">
              <span>Distance traveled</span>
              <span className="num font-semibold">{TRIPS.reduce((s, t) => s + t.distanceKm, 0).toLocaleString()} km</span>
            </div>
            <div className="flex items-center justify-between rounded-[14px] border border-black/[0.04] bg-black/[0.02] px-3.5 py-2.5 text-xs">
              <span>Delayed trips</span>
              <span className="num font-semibold">{TRIPS.filter((t) => t.status === "Delayed").length}</span>
            </div>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="fuel" className="mt-4">
          <SectionPanel title="Fuel Efficiency Trend" description="Actual vs standard Km/L" bodyClassName="p-4">
            <ChartFrame><ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.fuel}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} domain={[2.5, 3.6]} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Line type="monotone" dataKey="actual" stroke="var(--chart-2)" strokeWidth={2} />
                <Line type="monotone" dataKey="standard" stroke="var(--chart-4)" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer></ChartFrame>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="engineering" className="mt-4 grid gap-5 sm:grid-cols-3">
          <SectionPanel title="Repairs" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{WORK_ORDERS.filter((w) => w.status === "Completed").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed work orders</p>
          </SectionPanel>
          <SectionPanel title="Maintenance Cost" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{formatNaira(WORK_ORDERS.reduce((s, w) => s + w.cost, 0))}</p>
            <p className="mt-1 text-xs text-muted-foreground">Workshop spend</p>
          </SectionPanel>
          <SectionPanel title="Open Downtime" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{WORK_ORDERS.filter((w) => w.status !== "Completed").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active / blocked orders</p>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="hr" className="mt-4 grid gap-5 sm:grid-cols-3">
          <SectionPanel title="Driver Activity" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{DRIVERS.filter((d) => d.status === "On Trip").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Currently on trip</p>
          </SectionPanel>
          <SectionPanel title="Compliance" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{DRIVERS.filter((d) => d.compliance === "Valid").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Valid licences</p>
          </SectionPanel>
          <SectionPanel title="Availability" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{DRIVERS.filter((d) => d.status === "Available").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ready to dispatch</p>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4 grid gap-5 sm:grid-cols-3">
          <SectionPanel title="Expenses" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{formatNaira(EXPENSES.reduce((s, e) => s + e.amount, 0))}</p>
            <p className="mt-1 text-xs text-muted-foreground">{EXPENSES.length} transactions</p>
          </SectionPanel>
          <SectionPanel title="Approvals" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{EXPENSES.filter((e) => e.status === "Pending").length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting decision</p>
          </SectionPanel>
          <SectionPanel title="Operational Spending" bodyClassName="pt-2">
            <p className="num text-3xl font-semibold tracking-[-0.04em]">{formatNaira(EXPENSES.filter((e) => e.status === "Approved").reduce((s, e) => s + e.amount, 0))}</p>
            <p className="mt-1 text-xs text-muted-foreground">Approved disbursements</p>
          </SectionPanel>
        </TabsContent>
      </Tabs>
    </>
  );
}

