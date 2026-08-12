import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download,
  MessageSquare, Phone, Plus,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { StatusBadge } from "@/components/karigo/status-badge";
import { FilterPills } from "@/components/karigo/filter-pills";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DRIVERS, FEATURED_TRIP_ID, TRIPS, TRUCKS } from "@/lib/karigo/mock-data";
import { formatNaira, tripService } from "@/lib/karigo/services";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Overview | Karigo" },
      { name: "description", content: "Fleet overview for Petroline Transport." },
      { property: "og:title", content: "Overview | Karigo" },
      { property: "og:description", content: "Fleet overview for Petroline Transport." },
    ],
  }),
  component: Dashboard,
});

const DAILY_STATS = [
  { day: "10", trip: 38, delivery: 28 },
  { day: "11", trip: 44, delivery: 31 },
  { day: "12", trip: 52, delivery: 36 },
  { day: "13", trip: 41, delivery: 29 },
  { day: "14", trip: 58, delivery: 42 },
  { day: "15", trip: 47, delivery: 34 },
  { day: "16", trip: 55, delivery: 40 },
  { day: "17", trip: 62, delivery: 45 },
  { day: "18", trip: 49, delivery: 33 },
  { day: "19", trip: 56, delivery: 39 },
];

const FILTERS = ["All Trips", "Completed", "En Route", "Pending", "Delayed"] as const;

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 14,
  fontSize: 12,
  color: "#1d1d1f",
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
};

function Dashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Trips");
  const [page, setPage] = useState(0);
  const featured = TRIPS.find((t) => t.id === FEATURED_TRIP_ID) ?? TRIPS[0]!;
  const timeline = tripService.timeline(featured);
  const driver = DRIVERS.find((d) => d.id === featured.driverId);
  const trucksOnRoad = TRUCKS.filter((t) => t.status === "In Transit" || t.status === "Assigned").length;
  const revenue = 272_980_190;
  const gauge = [{ name: "rev", value: 78, fill: "#a8c5e2" }];

  const rows = useMemo(() => {
    if (filter === "All Trips") return TRIPS;
    if (filter === "Pending") return TRIPS.filter((t) => t.status === "Scheduled");
    return TRIPS.filter((t) => t.status === filter);
  }, [filter]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice(page * pageSize, page * pageSize + pageSize);

  const hour = 10;
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="flex flex-col gap-6">
      {/* Hero greeting + KPI strip */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-end">
        <div>
          <h1 className="text-[34px] leading-[1.08] font-semibold tracking-[-0.035em] text-foreground sm:text-[40px]">
            Hello Okwudili,{" "}
            <span className="text-muted-foreground">{greeting}</span>
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Select defaultValue="aug">
              <SelectTrigger className="h-10 w-[140px] rounded-full border-black/[0.08] bg-white text-[13px] shadow-sm">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aug">Aug 2026</SelectItem>
                <SelectItem value="jul">Jul 2026</SelectItem>
                <SelectItem value="jun">Jun 2026</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-10 gap-1.5 rounded-full border-black/[0.1] bg-white px-4 text-[13px]"
              onClick={() => toast.success("Export queued", { description: "Operations CSV pack prepared." })}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              Export CSV
            </Button>
            <Button asChild className="h-10 rounded-full bg-[#1d1d1f] px-5 text-[13px] text-white hover:bg-black">
              <Link to="/app/dispatch">
                <Plus className="h-3.5 w-3.5" />
                Create Dispatch
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active Trips", value: "42", delta: "+1.92%", up: true },
            { label: "Pending Approvals", value: "18", delta: "+1.89%", up: true },
            { label: "Delayed Trips", value: "6", delta: "-0.98%", up: false },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)]"
            >
              <p className="text-[12px] font-medium text-muted-foreground">{k.label}</p>
              <p className="num mt-2 text-[28px] leading-none font-semibold tracking-[-0.04em] text-foreground">{k.value}</p>
              <p className={cn("mt-2 flex items-center gap-0.5 text-[12px] font-semibold", k.up ? "text-[#34c759]" : "text-[#ff3b30]")}>
                {k.delta}
                {k.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Visualization row */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,0.95fr)]">
        {/* Trip statistics bar chart */}
        <section className="rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Trip Statistics</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Daily dispatch vs completed deliveries</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#1d1d1f]" /> Trip</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#b7cfe6]" /> Delivery</span>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 font-medium text-foreground">Daily</span>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DAILY_STATS} barGap={4} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Bar dataKey="trip" fill="#1d1d1f" radius={[6, 6, 6, 6]} maxBarSize={14} />
                <Bar dataKey="delivery" fill="#b7cfe6" radius={[6, 6, 6, 6]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Analytic gauge + fleet card */}
        <div className="flex flex-col gap-4">
          <section className="rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Analytic View</h2>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium">Monthly</span>
            </div>
            <div className="relative mx-auto h-[150px] w-full max-w-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="100%"
                  innerRadius="78%"
                  outerRadius="118%"
                  startAngle={180}
                  endAngle={0}
                  data={gauge}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar background={{ fill: "#eef2f6" }} dataKey="value" cornerRadius={12}>
                    {gauge.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </RadialBar>
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                <p className="text-[11px] text-muted-foreground">Operating revenue</p>
                <p className="num text-[22px] font-semibold tracking-[-0.03em]">{formatNaira(revenue)}</p>
                <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[12px] font-semibold text-[#34c759]">
                  +2.45% <ArrowUpRight className="h-3.5 w-3.5" />
                </p>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(183,207,230,0.45),transparent_55%)]" />
            <div className="relative flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Fleet on road</p>
                <p className="num mt-1 text-[36px] leading-none font-semibold tracking-[-0.04em]">{trucksOnRoad}</p>
                <p className="mt-2 flex items-center gap-0.5 text-[12px] font-semibold text-[#34c759]">
                  +1.51% <ArrowUpRight className="h-3.5 w-3.5" />
                </p>
              </div>
              <img
                src="https://images.unsplash.com/photo-1601584115197-04ecc1da0d0d?auto=format&fit=crop&w=420&q=80"
                alt="Heavy transport truck"
                className="h-24 w-36 object-contain drop-shadow-xl"
              />
            </div>
          </section>
        </div>

        {/* Tracking card */}
        <section className="flex flex-col overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
          <div className="border-b border-black/[0.05] px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Tracking Trip</h2>
              <StatusBadge status={featured.status} />
            </div>
            <p className="num mt-1 text-[12px] text-muted-foreground">{featured.id}</p>
          </div>

          <div className="relative mx-4 mt-4 h-28 overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#f4f7fb,#e7eef6)]">
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:22px_22px]" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path d="M8 30 C 28 8, 45 34, 62 16 S 88 10, 94 22" fill="none" stroke="#1d1d1f" strokeWidth="1.2" strokeDasharray="2 1.5" />
              <circle cx="8" cy="30" r="2.2" fill="#1d1d1f" />
              <circle cx="94" cy="22" r="2.2" fill="#1d1d1f" />
            </svg>
            <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>{featured.pickup}</span>
              <span>{featured.dropoff}</span>
            </div>
          </div>

          <ol className="flex-1 space-y-3 px-5 py-4">
            {timeline.slice(0, 5).map((step) => (
              <li key={step.label} className="flex gap-3">
                <span className="mt-1.5 flex flex-col items-center">
                  <span className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    step.state === "done" && "bg-[#1d1d1f]",
                    step.state === "current" && "bg-[#1d1d1f] ring-4 ring-[#1d1d1f]/12",
                    step.state === "pending" && "bg-black/15",
                  )} />
                  <span className="mt-1 w-px flex-1 bg-black/10" />
                </span>
                <div className="min-w-0 pb-1">
                  <p className={cn("text-[13px] font-medium", step.state === "pending" ? "text-muted-foreground" : "text-foreground")}>
                    {step.label}
                  </p>
                  <p className="num text-[11px] text-muted-foreground">{step.at ?? "Pending"}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-auto flex items-center gap-3 border-t border-black/[0.05] px-5 py-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1d1d1f] text-[11px] font-semibold text-white">
              {driver?.initials ?? "DR"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">{featured.driverName}</p>
              <p className="text-[11px] text-muted-foreground">Assigned driver</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-8 w-8 rounded-full p-0">
              <Link to="/app/messages"><MessageSquare className="h-4 w-4" strokeWidth={1.75} /></Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              onClick={() => toast("Calling driver…", { description: driver?.phone ?? "Contact unavailable" })}
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </section>
      </div>

      {/* Trip activities table */}
      <section className="rounded-[24px] border border-black/[0.05] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Trip Activities</h2>
          <FilterPills
            options={FILTERS}
            value={filter}
            onChange={(f) => { setFilter(f); setPage(0); }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {["Trip ID", "Customer", "Cargo", "ETA", "Route", "Revenue", "Status"].map((h) => (
                  <th key={h} className="px-3 py-3 text-[11px] font-medium tracking-[0.01em] text-muted-foreground first:pl-1 last:pr-1">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate({ to: "/app/trips/$tripId", params: { tripId: t.id } })}
                  className="cursor-pointer border-b border-black/[0.04] transition-colors last:border-0 hover:bg-black/[0.015]"
                >
                  <td className="num px-3 py-3.5 text-[13px] font-semibold first:pl-1">{t.id}</td>
                  <td className="px-3 py-3.5 text-[13px]">{t.customer}</td>
                  <td className="px-3 py-3.5 text-[13px] text-muted-foreground">{t.cargo}</td>
                  <td className="num px-3 py-3.5 text-[13px]">{t.eta}</td>
                  <td className="px-3 py-3.5 text-[13px] text-muted-foreground">{t.pickup} → {t.dropoff}</td>
                  <td className="num px-3 py-3.5 text-[13px] font-medium">{formatNaira(t.revenue)}</td>
                  <td className="px-3 py-3.5 last:pr-1"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="num text-[12px] text-muted-foreground">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 rounded-full p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 rounded-full p-0"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
