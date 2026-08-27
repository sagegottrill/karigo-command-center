import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight,
  ChevronsUpDown, Download, MessageSquare, Phone, Plus, Truck, Wrench,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { StatusBadge } from "@/components/karigo/status-badge";
import { FilterPills } from "@/components/karigo/filter-pills";
import { CommandCenterMap } from "@/components/karigo/command-center-map";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DRIVERS, EXPENSES, FEATURED_TRIP_ID, TRIPS, TRUCKS } from "@/lib/karigo/mock-data";
import { formatNaira, tripService } from "@/lib/karigo/services";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { authService } from "@/lib/karigo/services";
import { 
  TransportManagerDashboard, 
  FleetManagerDashboard, 
  FuelManagerDashboard, 
  AccountantDashboard, 
  GateDashboard, 
  HRDashboard, 
  EngineerDashboard, 
  ProcurementDashboard 
} from "@/components/karigo/role-dashboards";

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

const FILTERS = ["All Trips", "En Route", "Delayed", "Completed"] as const;

const card =
  "rounded-[24px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)]";

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 14,
  fontSize: 12,
  color: "#1d1d1f",
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
};

function Dashboard() {
  const role = authService.getRole();

  // If the role is Super Admin or Executive, they get the original God View / Dashboard
  if (role === "Super Admin" || role === "Executive") {
    return <ManagementDashboard />;
  }
  
  if (role === "Operations Manager") return <TransportManagerDashboard />;
  if (role === "Fleet Manager") return <FleetManagerDashboard />;
  if (role === "Fuel Manager") return <FuelManagerDashboard />;
  if (role === "Accountant") return <AccountantDashboard />;
  if (role === "Security Officer") return <GateDashboard />;
  if (role === "HR Manager") return <HRDashboard />;
  if (role === "Engineer" || role === "Mechanic") return <EngineerDashboard />;
  if (role === "Procurement Manager") return <ProcurementDashboard />;
  
  // Fallback
  return <div className="p-8">No dashboard available for this role.</div>;
}

function ManagementDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Trips");
  const [page, setPage] = useState(0);

  const featured = TRIPS.find((t) => t.id === FEATURED_TRIP_ID) ?? TRIPS[0]!;
  const timeline = tripService.timeline(featured);
  const driver = DRIVERS.find((d) => d.id === featured.driverId);

  const ready = TRUCKS.filter((t) => t.status === "Available" || t.status === "Assigned").length;
  const mechanic = TRUCKS.filter((t) => t.status === "Maintenance").length;
  const accident = TRUCKS.filter((t) => t.status === "Out of Service").length;
  const totalTrucks = TRUCKS.length;
  const trucksOnRoad = TRUCKS.filter((t) => t.status === "In Transit" || t.status === "Assigned").length;

  const driversFree = DRIVERS.filter((d) => d.status === "Available").length;
  const tripsMoving = TRIPS.filter((t) =>
    ["En Route", "Loaded", "Offloading", "Returning"].includes(t.status),
  ).length;
  const tripsDelayed = TRIPS.filter((t) => t.status === "Delayed").length;
  const approvals = EXPENSES.filter((e) => e.status === "Pending" || e.status === "Clarification").length;
  const revenue = 272_980_190;

  const rows = useMemo(() => {
    if (filter === "All Trips") return TRIPS;
    return TRIPS.filter((t) => t.status === filter);
  }, [filter]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice(page * pageSize, page * pageSize + pageSize);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const truckZones = [
    { title: "Ready to go", value: ready, color: "#34c759", soft: "rgba(52,199,89,0.12)", icon: Truck, to: "/app/fleet" as const, hint: "Can leave the yard today" },
    { title: "With mechanic", value: mechanic, color: "#ff9f0a", soft: "rgba(255,159,10,0.14)", icon: Wrench, to: "/app/engineering" as const, hint: "Repair or service" },
    { title: "Accident / broken", value: accident, color: "#ff3b30", soft: "rgba(255,59,48,0.12)", icon: AlertTriangle, to: "/app/fleet" as const, hint: "Not safe to send out" },
  ];

  return (
    <>
      {/* Hero */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.035em] text-foreground sm:text-[36px] lg:text-[40px]">
            Hello Okwudili,{" "}
            <span className="text-muted-foreground">{greeting}</span>
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Select defaultValue="aug">
              <SelectTrigger className="h-10 w-[132px] rounded-full border-black/[0.08] bg-white text-[13px] shadow-sm">
                <SelectValue />
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
              onClick={() => toast.success("Export queued")}
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
      </div>

      {/* Truck zones — big cards, clear for anyone */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Trucks</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {totalTrucks} trucks in total · {trucksOnRoad} on the road
            </p>
          </div>
          <Link to="/app/fleet" className="text-[13px] font-medium underline-offset-2 hover:underline">
            See all trucks
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {truckZones.map((z) => (
            <Link
              key={z.title}
              to={z.to}
              className={cn(card, "block p-5 transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99] sm:p-6")}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="grid h-12 w-12 place-items-center rounded-full"
                  style={{ background: z.soft, color: z.color }}
                >
                  <z.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <span className="num text-[13px] font-semibold text-muted-foreground">
                  {Math.round((z.value / Math.max(totalTrucks, 1)) * 100)}%
                </span>
              </div>
              <p
                className="num mt-6 text-[52px] leading-none font-semibold tracking-[-0.05em] sm:text-[56px]"
                style={{ color: z.color }}
              >
                {z.value}
              </p>
              <p className="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-foreground">{z.title}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{z.hint}</p>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(z.value / Math.max(totalTrucks, 1)) * 100}%`,
                    background: z.color,
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/*
        Trip stats left · Analytic + Fleet stacked right (no empty stretch)
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-stretch">
        {/* Trip Statistics */}
        <section className={cn(card, "flex flex-col p-4 sm:p-5 xl:col-span-7")}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Trip Statistics</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Daily dispatch vs completed deliveries</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#1d1d1f]" /> Trip</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#b7cfe6]" /> Delivery</span>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 font-medium text-foreground">Daily</span>
            </div>
          </div>
          <div className="h-[240px] w-full sm:h-[280px] xl:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DAILY_STATS} barGap={4} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} width={28} tick={{ fill: "#86868b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Bar dataKey="trip" fill="#1d1d1f" radius={[6, 6, 6, 6]} maxBarSize={14} />
                <Bar dataKey="delivery" fill="#b7cfe6" radius={[6, 6, 6, 6]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Right column — Analytic stacked on Fleet so neither stretches empty */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1 xl:content-stretch">
          {/* Analytic View */}
          <section className={cn(card, "flex flex-col p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Analytic View</h2>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium">Monthly</span>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <svg viewBox="0 0 200 112" className="h-[112px] w-[160px] shrink-0 sm:h-[120px] sm:w-[170px]" aria-hidden>
                <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke="#eef2f6" strokeWidth="16" strokeLinecap="round" />
                <path d="M 18 100 A 82 82 0 0 1 173.5 48.8" fill="none" stroke="#1d1d1f" strokeWidth="16" strokeLinecap="round" />
                <path d="M 18 100 A 82 82 0 0 1 173.5 48.8" fill="none" stroke="#a8c5e2" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
                <text x="100" y="78" textAnchor="middle" fill="#6e6e73" style={{ fontSize: 10 }}>Of target</text>
                <text x="100" y="98" textAnchor="middle" fill="#1d1d1f" style={{ fontSize: 24, fontWeight: 600, fontFamily: "ui-monospace, SF Mono, Menlo, monospace", letterSpacing: "-0.04em" }}>78%</text>
              </svg>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">Operating revenue</p>
                <p className="num mt-1 text-[22px] leading-none font-semibold tracking-[-0.04em] sm:text-[24px]">
                  {formatNaira(revenue)}
                </p>
                <p className="mt-1.5 inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#34c759]">
                  +2.45% <ArrowUpRight className="h-3.5 w-3.5" />
                </p>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <div className="rounded-[12px] bg-black/[0.03] px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground">Target</p>
                    <p className="num text-[12px] font-semibold">₦350M</p>
                  </div>
                  <div className="rounded-[12px] bg-black/[0.03] px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground">Left</p>
                    <p className="num text-[12px] font-semibold">₦77M</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Fleet on road */}
          <section className={cn(card, "relative flex flex-col overflow-hidden p-0")}>
            <div className="absolute inset-0 bg-[linear-gradient(165deg,#f7fafc_0%,#e8f0f8_55%,#dbe7f3_100%)]" />
            <div className="relative z-[1] flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-muted-foreground">Fleet on road</p>
                <p className="num mt-1 text-[32px] leading-none font-semibold tracking-[-0.04em]">{trucksOnRoad}</p>
                <p className="mt-1.5 flex items-center gap-0.5 text-[12px] font-semibold text-[#34c759]">
                  +1.51% <ArrowUpRight className="h-3.5 w-3.5" />
                </p>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {totalTrucks} trucks · {driversFree} drivers free
                </p>
              </div>
              <span className="rounded-full bg-[#34c759]/15 px-2.5 py-1 text-[11px] font-semibold text-[#248a3d]">
                On-Route
              </span>
            </div>
            <div className="relative z-[1] flex items-end justify-center px-2 pb-0 pt-1">
              <img
                src={`${import.meta.env.BASE_URL}images/fleet-truck.png`}
                alt="Heavy transport truck"
                className="h-[130px] w-full object-contain object-bottom drop-shadow-[0_14px_24px_rgba(0,0,0,0.2)] sm:h-[140px]"
              />
            </div>
          </section>
        </div>

        {/* Tracking Trip */}
        <section className={cn(card, "flex flex-col overflow-hidden xl:col-span-12 xl:grid xl:grid-cols-[1fr_1.2fr_1fr]")}>
          <div className="border-b border-black/[0.05] p-4 sm:p-5 xl:border-r xl:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Tracking Trip</h2>
              <StatusBadge status={featured.status} />
            </div>
            <p className="num mt-1 text-[12px] text-muted-foreground">{featured.id}</p>
            <div className="relative mt-4 h-28 overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#f4f7fb,#e7eef6)]">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:22px_22px]" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path d="M8 30 C 28 8, 45 34, 62 16 S 88 10, 94 22" fill="none" stroke="#1d1d1f" strokeWidth="1.2" strokeDasharray="2 1.5" />
                <circle cx="8" cy="30" r="2.2" fill="#1d1d1f" />
                <circle cx="94" cy="22" r="2.2" fill="#1d1d1f" />
              </svg>
              <div className="absolute right-3 bottom-2 left-3 flex justify-between text-[10px] font-medium text-muted-foreground">
                <span>{featured.pickup}</span>
                <span>{featured.dropoff}</span>
              </div>
            </div>
          </div>

          <ol className="space-y-3 border-b border-black/[0.05] p-4 sm:p-5 xl:border-r xl:border-b-0">
            {timeline.slice(0, 5).map((step) => (
              <li key={step.label} className="flex gap-3">
                <span className="mt-1.5 flex flex-col items-center">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      step.state === "done" && "bg-[#1d1d1f]",
                      step.state === "current" && "bg-[#1d1d1f] ring-4 ring-[#1d1d1f]/12",
                      step.state === "pending" && "bg-black/15",
                    )}
                  />
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

          <div className="flex items-center gap-3 p-4 sm:p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-[11px] font-semibold text-white">
              {driver?.initials ?? "DR"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">{featured.driverName}</p>
              <p className="text-[11px] text-muted-foreground">Assigned driver</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-9 w-9 rounded-full p-0">
              <Link to="/app/messages"><MessageSquare className="h-4 w-4" strokeWidth={1.75} /></Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 rounded-full p-0"
              onClick={() => toast("Calling driver…", { description: driver?.phone ?? "Contact unavailable" })}
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </section>
      </div>

      <CommandCenterMap
        trips={TRIPS}
        activeTrips={tripsMoving}
        trucks={totalTrucks}
        approvals={approvals}
      />

      {/* Drivers — big and clear */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cn(card, "p-5 sm:p-6")}>
          <p className="text-[13px] font-medium text-muted-foreground">Drivers free now</p>
          <p className="num mt-3 text-[56px] leading-none font-semibold tracking-[-0.05em] text-[#34c759]">
            {driversFree}
          </p>
          <p className="mt-2 text-[14px] text-muted-foreground">Ready to take a trip</p>
          <Link to="/app/drivers" className="mt-5 inline-block text-[13px] font-medium underline-offset-2 hover:underline">
            See all drivers
          </Link>
        </section>
        <section className={cn(card, "p-5 sm:p-6")}>
          <p className="text-[13px] font-medium text-muted-foreground">Delayed trips</p>
          <p className="num mt-3 text-[56px] leading-none font-semibold tracking-[-0.05em] text-[#ff3b30]">
            {tripsDelayed}
          </p>
          <p className="mt-2 text-[14px] text-muted-foreground">Check these first</p>
          <Link to="/app/trips" className="mt-5 inline-block text-[13px] font-medium underline-offset-2 hover:underline">
            Open trips
          </Link>
        </section>
      </div>

      {/* Trip activities */}
      <section className={cn(card, "p-4 sm:p-5")}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] sm:text-[20px]">Trip activities</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Tap a row to open the trip</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <FilterPills
              options={FILTERS}
              value={filter}
              onChange={(f) => { setFilter(f); setPage(0); }}
            />
            <p className="num text-[12px] text-muted-foreground">
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 w-8 rounded-full p-0" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 w-8 rounded-full p-0" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-[#efeff1]">
                {(["Order Id", "Category", "Company", "Arrival Time", "Route", "Status"] as const).map((h, i, arr) => (
                  <th
                    key={h}
                    className={cn(
                      "px-4 py-3 text-[12px] font-medium text-[#3a3a3c]",
                      i === 0 && "rounded-l-full pl-5",
                      i === arr.length - 1 && "rounded-r-full pr-5",
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {h}
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate({ to: "/app/trips/$tripId", params: { tripId: t.id } })}
                  className="cursor-pointer transition-colors hover:bg-black/[0.015]"
                >
                  <td className="num border-b border-black/[0.04] px-4 py-3.5 pl-5 text-[13px] font-semibold">{t.id}</td>
                  <td className="border-b border-black/[0.04] px-4 py-3.5 text-[13px] text-muted-foreground">{t.cargo}</td>
                  <td className="border-b border-black/[0.04] px-4 py-3.5 text-[13px]">{t.customer}</td>
                  <td className="num border-b border-black/[0.04] px-4 py-3.5 text-[13px]">{t.eta}</td>
                  <td className="border-b border-black/[0.04] px-4 py-3.5 text-[13px] text-muted-foreground">{t.pickup} → {t.dropoff}</td>
                  <td className="border-b border-black/[0.04] px-4 py-3.5 pr-5"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
