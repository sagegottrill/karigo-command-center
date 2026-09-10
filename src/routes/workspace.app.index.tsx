import { useMemo, useState, useEffect } from "react";
import { useNavigate, useRouter, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight,
  ChevronsUpDown, Download, MessageSquare, Phone, Plus, Truck, Wrench,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { FilterPills } from "@/components/fleetopsx/filter-pills";
import { CommandCenterMap } from "@/components/fleetopsx/command-center-map";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira, tripService, dashboardService, authService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { 
  TransportManagerDashboard, 
  FleetManagerDashboard, 
  FuelManagerDashboard, 
  AccountantDashboard, 
  GateDashboard, 
  HRDashboard, 
  EngineerDashboard, 
  ProcurementDashboard 
} from "@/components/fleetopsx/role-dashboards";

export const Route = createFileRoute("/workspace/app/")({
  loader: () => dashboardService.getOverview(),
  head: () => ({
    meta: [
      { title: "Overview | FleetOpsX" },
      { name: "description", content: "Fleet overview for Tenant Transport." },
      { property: "og:title", content: "Overview | FleetOpsX" },
      { property: "og:description", content: "Fleet overview for Tenant Transport." },
    ],
  }),
  component: Dashboard,
});



const FILTERS = ["All Trips", "En Route", "Delayed", "Completed"] as const;

const card =
  "flex flex-col rounded-[10px] border-[1px] border-[#e2e5e9] bg-[#ffffff] shadow-[0px_4px_24px_rgba(0,0,0,0.04)]";

const tooltipStyle = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 14,
  fontSize: 12,
  color: "#1d1d1f",
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
};

function Dashboard() {
  const roles = authService.getRoles();
  const data = Route.useLoaderData();

  if (roles.includes("Transport Manager")) return <ManagementDashboard data={data} />;
  if (roles.includes("Fleet Operations")) return <FleetManagerDashboard {...data} />;
  if (roles.includes("Diesel")) return <FuelManagerDashboard {...data} />;
  if (roles.includes("Accounts")) return <AccountantDashboard {...data} />;
  if (roles.includes("Security")) return <GateDashboard {...data} />;
  if (roles.includes("HR")) return <HRDashboard {...data} />;
  if (roles.includes("Engineering")) return <EngineerDashboard {...data} />;
  if (roles.includes("Parts & Store")) return <ProcurementDashboard {...data} />;
  
  // Fallback
  return <div className="p-8 flex items-center justify-center min-h-[50vh] text-muted-foreground flex-col gap-4">
    <p>No dashboard available for this role.</p>
    <p>Debug roles: {JSON.stringify(roles)}</p>
  </div>;
}

function ManagementDashboard({ data }: { data: any }) {
  const { trips: TRIPS, trucks: TRUCKS, drivers: DRIVERS, expenses: EXPENSES } = data;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All Trips");
  const [page, setPage] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const router = useRouter();
  const [newTrip, setNewTrip] = useState({ customer: "", cargo: "", pickup: "", dropoff: "" });

  const handleCreateTrip = async () => {
    if (!newTrip.customer || !newTrip.pickup || !newTrip.dropoff) {
      toast.error("Please fill in customer, pickup, and dropoff.");
      return;
    }
    await tripService.create({
      customer: newTrip.customer,
      cargo: newTrip.cargo || "General Cargo",
      pickup: newTrip.pickup,
      dropoff: newTrip.dropoff,
      priority: "Normal",
      distanceKm: 150,
      durationLabel: "2 days",
      scheduledDate: new Date().toLocaleDateString(),
      startTime: "08:00",
      lat: 6.524,
      lng: 3.379,
      revenue: 150000,
      status: "Requested",
    } as any);
    toast.success("Trip requested successfully!");
    setIsCreateOpen(false);
    setNewTrip({ customer: "", cargo: "", pickup: "", dropoff: "" });
    router.invalidate();
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentUser = mounted ? authService.getCurrentUser() : null;

  const FEATURED_TRIP_ID = TRIPS[0]?.id;
  const featured = TRIPS.find((t: any) => t.id === FEATURED_TRIP_ID) ?? TRIPS[0];
  const timeline = featured ? tripService.timeline(featured) : [];
  const driver = featured ? DRIVERS.find((d: any) => d.id === featured.driverId) : null;

  const ready = TRUCKS.filter((t: any) => t.status === "Available" || t.status === "Assigned").length;
  const mechanic = TRUCKS.filter((t: any) => t.status === "Maintenance").length;
  const accident = TRUCKS.filter((t: any) => t.status === "Out of Service").length;
  const totalTrucks = TRUCKS.length;
  const trucksOnRoad = TRUCKS.filter((t: any) => t.status === "In Transit" || t.status === "Assigned").length;

  const driversFree = DRIVERS.filter((d: any) => d.status === "Available").length;
  const tripsMoving = TRIPS.filter((t: any) =>
    ["En Route", "Loaded", "Offloading", "Returning"].includes(t.status),
  ).length;
  const tripsDelayed = TRIPS.filter((t: any) => t.status === "Delayed").length;
  const approvals = EXPENSES.filter((e: any) => e.status === "Pending" || e.status === "Clarification").length;

  const rows = useMemo(() => {
    if (filter === "All Trips") return TRIPS;
    return TRIPS.filter((t) => t.status === filter);
  }, [filter, TRIPS]);

  const liveDailyStats = useMemo(() => {
    const statsMap: Record<string, { day: string, trip: number, delivery: number }> = {};
    for (let i = 9; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.getDate().toString().padStart(2, '0');
      statsMap[dayStr] = { day: dayStr, trip: 0, delivery: 0 };
    }
    
    TRIPS.forEach((t: any) => {
      const d = new Date(t.scheduledDate || Date.now());
      if (!isNaN(d.getTime())) {
        const dayStr = d.getDate().toString().padStart(2, '0');
        if (statsMap[dayStr]) {
          statsMap[dayStr].trip += 1;
          if (t.status === "Completed") {
            statsMap[dayStr].delivery += 1;
          }
        }
      }
    });
    return Object.values(statsMap);
  }, [TRIPS]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice(page * pageSize, page * pageSize + pageSize);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const truckZones = [
    { title: "Ready to go", value: ready, color: "#34c759", soft: "rgba(52,199,89,0.12)", icon: Truck, to: "/workspace/app/fleet" as const, hint: "Can leave the yard today" },
    { title: "With mechanic", value: mechanic, color: "#ff9f0a", soft: "rgba(255,159,10,0.14)", icon: Wrench, to: "/workspace/app/engineering" as const, hint: "Repair or service" },
    { title: "Accident / broken", value: accident, color: "#ff3b30", soft: "rgba(255,59,48,0.12)", icon: AlertTriangle, to: "/workspace/app/fleet" as const, hint: "Not safe to send out" },
  ];

  return (
    <>
      {/* Hero */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between mb-[24px]">
        <div className="min-w-0">
          <h1 className="text-[28px] font-[600] leading-[36px] text-[#141a1f] mb-[8px]">
            Hello {mounted ? (currentUser?.name?.split(" ")[0] || "User") : "User"},{" "}
            <span className="text-[#8e95a1]" suppressHydrationWarning>{greeting}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select defaultValue="aug">
              <SelectTrigger className="h-[40px] w-[132px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] text-[14px] shadow-none font-[400] text-[#141a1f]">
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
              className="h-[40px] gap-1.5 rounded-[4px] border-[#e2e5e9] bg-[#ffffff] hover:bg-[#f6f7f9] px-[16px] text-[14px] font-[500] text-[#141a1f] shadow-none transition-colors"
              onClick={() => toast.success("Export queued")}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              Export CSV
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="h-[40px] rounded-[4px] bg-[#ed351d] hover:bg-[#d62e19] px-[16px] text-[14px] font-[500] text-white shadow-none transition-colors">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Dispatch
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Trip Request</DialogTitle>
                  <DialogDescription>
                    Initiate a new dispatch request for Transport Manager approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="customer" className="text-right">Customer</Label>
                    <Input id="customer" value={newTrip.customer} onChange={(e) => setNewTrip({...newTrip, customer: e.target.value})} placeholder="e.g. Dangote Refinery" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="cargo" className="text-right">Cargo</Label>
                    <Input id="cargo" value={newTrip.cargo} onChange={(e) => setNewTrip({...newTrip, cargo: e.target.value})} placeholder="e.g. AGO" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="pickup" className="text-right">Pickup</Label>
                    <Input id="pickup" value={newTrip.pickup} onChange={(e) => setNewTrip({...newTrip, pickup: e.target.value})} placeholder="e.g. Lagos" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="dropoff" className="text-right">Dropoff</Label>
                    <Input id="dropoff" value={newTrip.dropoff} onChange={(e) => setNewTrip({...newTrip, dropoff: e.target.value})} placeholder="e.g. Abuja" className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTrip} className="bg-[#1d1d1f] text-white">Submit Request</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Truck zones — big cards, clear for anyone */}
      <div>
        <div className="mb-[16px] flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[20px] font-[600] leading-[28px] text-[#141a1f]">Trucks</h2>
            <p className="mt-0.5 text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">
              {totalTrucks} trucks in total · {trucksOnRoad} on the road
            </p>
          </div>
          <Link to="/workspace/app/fleet" className="text-[14px] font-[500] text-[#ed351d] hover:underline">
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
                className="num mt-6 text-[48px] leading-none font-[600] text-[#141a1f]"
              >
                {z.value}
              </p>
              <p className="mt-[12px] text-[16px] font-[600] text-[#141a1f]">{z.title}</p>
              <p className="mt-[4px] text-[12px] font-[400] text-[#5c6470]">{z.hint}</p>
              <div className="mt-5 h-[4px] overflow-hidden rounded-[2px] bg-[#e2e5e9]">
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
      <div className="grid grid-cols-1 gap-[16px] xl:grid-cols-12 xl:items-stretch mt-[24px]">
        {/* Trip Statistics */}
        <section className={cn(card, "flex flex-col p-[24px] xl:col-span-7")}>
          <div className="mb-[24px] flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-[600] text-[#141a1f]">Trip Statistics</h2>
              <p className="mt-0.5 text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">Daily dispatch vs completed deliveries</p>
            </div>
            <div className="flex flex-wrap items-center gap-[12px] text-[12px] font-[500] text-[#5c6470]">
              <span className="flex items-center gap-[6px]"><span className="h-[8px] w-[8px] rounded-full bg-[#141a1f]" /> Trip</span>
              <span className="flex items-center gap-[6px]"><span className="h-[8px] w-[8px] rounded-full bg-[#ed351d]" /> Delivery</span>
              <span className="rounded-[4px] bg-[#f6f7f9] px-[10px] py-[4px] font-[500] text-[#141a1f]">Daily</span>
            </div>
          </div>
          <div className="h-[240px] w-full sm:h-[280px] xl:h-[300px]">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liveDailyStats} barGap={4} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#86868b", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} width={28} tick={{ fill: "#86868b", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                  <Bar dataKey="trip" fill="#1d1d1f" radius={[6, 6, 6, 6]} maxBarSize={14} />
                  <Bar dataKey="delivery" fill="#b7cfe6" radius={[6, 6, 6, 6]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Right column — Analytic stacked on Fleet so neither stretches empty */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1 xl:content-stretch">
          {/* Quick Actions */}
          <section className={cn(card, "flex flex-col p-[24px]")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[18px] font-[600] text-[#141a1f]">Quick Actions</h2>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold">New Trip Request</span>
                  <span className="text-[10px] text-muted-foreground">Initiate a dispatch flow</span>
                </div>
              </Button>
              <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => toast("HR Module", { description: "Use the HR directory to add staff." })}>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold">Add New Driver</span>
                  <span className="text-[10px] text-muted-foreground">Register staff in the system</span>
                </div>
              </Button>
            </div>
          </section>

          {/* Fleet on road */}
          <section className={cn(card, "relative flex flex-col overflow-hidden p-0")}>
            <div className="absolute inset-0 bg-[linear-gradient(165deg,#f7fafc_0%,#e8f0f8_55%,#dbe7f3_100%)]" />
            <div className="relative z-[1] flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="min-w-0">
                <p className="text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">Fleet on road</p>
                <p className="num mt-[4px] text-[36px] leading-none font-[600] text-[#141a1f]">{trucksOnRoad}</p>
                <p className="mt-[6px] flex items-center gap-[4px] text-[12px] font-[600] text-[#34c759]">
                  +1.51% <ArrowUpRight className="h-3.5 w-3.5" />
                </p>
                <p className="mt-[6px] text-[12px] font-[400] text-[#5c6470]">
                  {totalTrucks} trucks · {driversFree} drivers free
                </p>
              </div>
              <span className="rounded-[4px] bg-[#34c759]/15 px-[10px] py-[4px] text-[12px] font-[600] text-[#248a3d]">
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
          <div className="border-b border-black/[0.05] p-[24px] xl:border-r xl:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[18px] font-[600] text-[#141a1f]">Tracking Trip</h2>
              {featured && <StatusBadge status={featured.status} />}
            </div>
            <p className="num mt-[4px] text-[12px] font-[400] text-[#8e95a1]">{featured?.id ?? "No active trips"}</p>
            <div className="relative mt-4 h-28 overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#f4f7fb,#e7eef6)]">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:22px_22px]" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path d="M8 30 C 28 8, 45 34, 62 16 S 88 10, 94 22" fill="none" stroke="#1d1d1f" strokeWidth="1.2" strokeDasharray="2 1.5" />
                <circle cx="8" cy="30" r="2.2" fill="#1d1d1f" />
                <circle cx="94" cy="22" r="2.2" fill="#1d1d1f" />
              </svg>
              <div className="absolute right-3 bottom-2 left-3 flex justify-between text-[10px] font-medium text-muted-foreground">
                <span>{featured?.pickup ?? "-"}</span>
                <span>{featured?.dropoff ?? "-"}</span>
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
              <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">{featured?.driverName ?? "No driver"}</p>
              <p className="text-[11px] text-muted-foreground">Assigned driver</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-9 w-9 rounded-full p-0">
              <Link to="/workspace/app/messages"><MessageSquare className="h-4 w-4" strokeWidth={1.75} /></Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 rounded-full p-0"
              onClick={() => toast("Calling driver...", { description: driver?.phone ?? "Contact unavailable" })}
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </section>
      </div>

      {mounted && (
        <CommandCenterMap
          trips={TRIPS}
          activeTrips={tripsMoving}
          trucks={totalTrucks}
          approvals={approvals}
        />
      )}

      {/* Drivers — big and clear */}
      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-2 mt-[24px]">
        <section className={cn(card, "p-[24px]")}>
          <p className="text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">Drivers free now</p>
          <p className="num mt-[12px] text-[56px] leading-none font-[600] text-[#34c759]">
            {driversFree}
          </p>
          <p className="mt-[8px] text-[14px] font-[400] text-[#5c6470]">Ready to take a trip</p>
          <Link to="/workspace/app/drivers" className="mt-[20px] inline-block text-[14px] font-[500] text-[#ed351d] hover:underline">
            See all drivers
          </Link>
        </section>
        <section className={cn(card, "p-[24px]")}>
          <p className="text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">Delayed trips</p>
          <p className="num mt-[12px] text-[56px] leading-none font-[600] text-[#ff3b30]">
            {tripsDelayed}
          </p>
          <p className="mt-[8px] text-[14px] font-[400] text-[#5c6470]">Check these first</p>
          <Link to="/workspace/app/trips" className="mt-[20px] inline-block text-[14px] font-[500] text-[#ed351d] hover:underline">
            Open trips
          </Link>
        </section>
      </div>

      {/* Trip activities */}
      <section className={cn(card, "p-[24px] mt-[24px]")}>
        <div className="mb-[24px] flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[20px] font-[600] leading-[28px] text-[#141a1f]">Trip activities</h2>
            <p className="mt-0.5 text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">Tap a row to open the trip</p>
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
                  onClick={() => navigate({ to: "/workspace/app/trips/$tripId", params: { tripId: t.id } })}
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

