import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { redirect } from "@tanstack/react-router";
import { authService, tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { ArrowLeft, Download, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/components/fleetopsx/data-table";

export const Route = createFileRoute("/workspace/app/dispatch-history")({
  loader: async () => {
    const trips = await tripService.list();
    return { trips };
  },
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dispatch History | FleetOpsX" },
      { name: "description", content: "View and manage dispatch history records." },
    ],
  }),
  component: DispatchHistoryPage,
});

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "In Transit": { bg: "#ea3a3d", text: "#fff" },
  "Pending": { bg: "#ff9f0a", text: "#fff" },
  "Cancelled": { bg: "#dc2626", text: "#fff" },
  "Completed": { bg: "#34c759", text: "#fff" },
  "Scheduled": { bg: "#3b82f6", text: "#fff" },
  "Requested": { bg: "#8b5cf6", text: "#fff" },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || { bg: "#6b7280", text: "#fff" };
  return (
    <span
      className="text-[11px] font-semibold px-3 py-1 rounded-[4px] whitespace-nowrap"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {status}
    </span>
  );
}

const formatN = (num: number) =>
  new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// ─────────────────────────────────────────────────────────────
// DISPATCH DETAIL & TIMELINE (shown when a row is clicked)
// ─────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { label: "Request Approved", done: true },
  { label: "Dispatch Created", done: true },
  { label: "Driver Assigned", done: true },
  { label: "Pickup Completed", done: true },
  {
    label: "In Transit",
    done: true,
    children: [
      { label: "Location 1", done: true },
      { label: "Location 2", done: true },
      { label: "Location 3", done: true },
      { label: "Location 4", done: true },
    ],
  },
  { label: "At Destination", done: true, confirmable: true },
  { label: "Offloaded", done: false },
  { label: "Return Trip", done: false },
  { label: "Arrival at Gate House", done: false, confirmable: true },
];

function buildTimeline(status: string) {
  // For "Completed" trips, mark everything as done
  if (status === "Completed") {
    return TIMELINE_STEPS.map(s => ({
      ...s,
      done: true,
      children: s.children?.map(c => ({ ...c, done: true })),
    }));
  }
  // For "In Transit", show default above
  return TIMELINE_STEPS;
}

function DispatchDetail({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const timeline = buildTimeline(trip.status);

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-['Inter',sans-serif]">
      {/* Desktop Header */}
      <div className="hidden md:block w-full bg-white border-b border-[#e2e5e9] px-6 py-4">
        <h1 className="text-xl font-bold text-[#141a1f]">Fleet Operations Portal</h1>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Manage the lifecycle of every dispatch within the company</p>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1400px] mx-auto">
        {/* Back + Export Row */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-2 text-[13px] md:text-[14px] font-semibold text-[#141a1f] hover:text-black transition-colors">
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            <span>Dispatch Details and Timeline</span>
          </button>
          <button className="flex items-center gap-2 bg-[#1B2432] text-white text-[12px] font-semibold h-9 px-4 rounded-[4px] hover:bg-black transition-colors">
            <Download className="h-4 w-4" />
            Export CVS
          </button>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left — Dispatch Details */}
          <div className="flex-1 bg-white rounded-xl border border-[#e2e5e9] shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 border-b border-[#e2e5e9] flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#141a1f]">Dispatch Details</h2>
                <p className="text-[12px] text-[#5c6470] mt-1">TICKET REQ-8126 &bull; SABA STEEL</p>
              </div>
              <StatusPill status={trip.status === "En Route" || trip.status === "Loaded" ? "In Transit" : trip.status} />
            </div>

            <div className="p-5 md:p-6 space-y-6">
              {/* Customer Details */}
              <div>
                <h4 className="text-[14px] font-bold text-[#141a1f] mb-3 border-b border-[#e2e5e9] pb-2">Customer Details</h4>
                <div className="space-y-2.5">
                  <DetailRow label="Customer Name:" value={trip.customer || "Janeth Doe"} />
                  <DetailRow label="Destination:" value={trip.dropoff || "ABC, Alake Estate"} />
                  <DetailRow label="Loading Site(s):" value="Babangida\nHappy Home" />
                </div>
              </div>

              {/* Vehicle & Operator Details */}
              <div>
                <h4 className="text-[14px] font-bold text-[#141a1f] mb-3 border-b border-[#e2e5e9] pb-2">Vehicle & Operator Details</h4>
                <div className="space-y-2.5">
                  <DetailRow label="Truck Head (Cap Number):" value={trip.headId || "CAP-9921-X"} />
                  <DetailRow label="Truck Head Plate Number:" value="LA-223-XA" />
                  <DetailRow label="Truck Tail assigned:" value="Semi Sided (TL-4402-A)" />
                  <DetailRow label="Driver Assigned:" value={`${trip.driverName || "Marcus Sterling"} (${trip.driverId || "SL-00829"})`} />
                  <DetailRow label="Driver Contact Phone:" value="+234 803 111 2222" />
                </div>
              </div>

              {/* Expense Configuration Breakdown */}
              <div>
                <h4 className="text-[14px] font-bold text-[#141a1f] mb-3 border-b border-[#e2e5e9] pb-2">Expense Configuration Breakdown</h4>
                <div className="space-y-2.5">
                  <DetailRow label="Trip Allowance:" value={formatN(trip.directCosts?.tripAllowance || 10000)} />
                  <DetailRow label="Return Waybill:" value={formatN(trip.directCosts?.returnWaybill || 10000)} />
                  <DetailRow label="Motor Boy Allowance:" value={formatN(trip.directCosts?.motorBoy || 5000)} />
                  <DetailRow label="Transit Road Tickets:" value={formatN(trip.directCosts?.ticket || 2000)} />
                  <DetailRow label="Extra Contingency:" value={formatN(trip.directCosts?.extraAllowance || 8000)} />
                  <DetailRow label="Lubricant:" value="(60litres) 76,800.00" />
                  <div className="border-t border-[#e2e5e9] my-1"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-[#141a1f]">Total Configured Expense:</span>
                    <span className="font-bold text-[15px] text-[#34c759]">{formatN(35000)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right — Dispatch Timeline */}
          <div className="flex-1 lg:max-w-[480px] bg-white rounded-xl border border-[#e2e5e9] shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 border-b border-[#e2e5e9]">
              <h2 className="text-xl font-bold text-[#141a1f]">Dispatch Timeline</h2>
            </div>
            <div className="p-5 md:p-6">
              <ol className="relative ml-3 border-l-2 border-[#e2e5e9] pl-7 space-y-0">
                {timeline.map((step, i) => (
                  <li key={step.label} className="relative pb-6 last:pb-0">
                    {/* Main Dot */}
                    <span className={cn(
                      "absolute -left-[33px] top-0.5 w-4 h-4 rounded-full border-2",
                      step.done
                        ? "bg-[#ea3a3d] border-[#ea3a3d]"
                        : "bg-white border-[#d1d5db]"
                    )} />
                    <div>
                      <p className={cn("text-[13px] font-bold", step.done ? "text-[#ea3a3d]" : "text-[#9ca3af]")}>
                        {step.label}
                      </p>
                      <p className="text-[11px] text-[#9ca3af] mt-0.5">3rd Aug 2026 • 06:25</p>
                    </div>

                    {/* Sub-locations for In Transit / Return Trip */}
                    {step.children && (
                      <ol className="relative ml-2 mt-3 border-l border-[#e2e5e9] pl-5 space-y-3">
                        {step.children.map((child) => (
                          <li key={child.label} className="relative">
                            <span className={cn(
                              "absolute -left-[22px] top-0.5 w-2.5 h-2.5 rounded-full border-2",
                              child.done ? "bg-[#ea3a3d] border-[#ea3a3d]" : "bg-white border-[#d1d5db]"
                            )} />
                            <p className={cn("text-[12px] font-semibold", child.done ? "text-[#ea3a3d]" : "text-[#9ca3af]")}>
                              {child.label}
                            </p>
                            <p className="text-[10px] text-[#9ca3af]">3rd Aug 2026 • 06:25</p>
                          </li>
                        ))}
                      </ol>
                    )}

                    {/* Arrival Confirmation Button */}
                    {step.confirmable && step.done && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="w-3 h-3 rounded-full bg-[#34c759]"></span>
                        <span className="bg-[#1B2432] text-white text-[10px] font-semibold px-3 py-1 rounded-full">
                          Arrival Confirmation
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start text-[13px]">
      <span className="text-[#5c6470] shrink-0">{label}</span>
      <span className="font-semibold text-[#141a1f] text-right whitespace-pre-line">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DISPATCH HISTORY LIST PAGE
// ─────────────────────────────────────────────────────────────

function DispatchHistoryPage() {
  const { trips } = Route.useLoaderData();
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter trips based on search
  const filteredTrips = trips.filter(t =>
    !searchQuery ||
    t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.cargo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedTrip) {
    return <DispatchDetail trip={selectedTrip} onBack={() => setSelectedTrip(null)} />;
  }

  const historyColumns: Column<Trip>[] = [
    { key: "id", header: "Request ID", sortValue: (r) => r.id, cell: (r) => <span className="font-semibold text-[#141a1f]">{r.id}</span> },
    { key: "date", header: "Date", sortValue: (r) => r.scheduledDate, cell: (r) => <span className="text-[#5c6470]">{r.scheduledDate || "02 Sept 2026"}</span> },
    { key: "company", header: "Company", sortValue: (r) => r.customer, cell: (r) => <span className="text-[#141a1f]">{r.customer}</span> },
    { key: "product", header: "Product", sortValue: (r) => r.cargo, cell: (r) => <span className="text-[#5c6470]">{r.cargo}</span> },
    { key: "truckType", header: "Truck Type", sortValue: () => "Flat", cell: () => <span className="text-[#5c6470]">Flat</span> },
    { key: "destination", header: "Destination", sortValue: (r) => r.dropoff, cell: (r) => <span className="text-[#5c6470]">{r.dropoff || "ABC, Alake Estate"}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => {
        // Map internal statuses to display statuses
        const displayStatus = r.status === "En Route" || r.status === "Loaded" ? "In Transit" :
          r.status === "Requested" || r.status === "Awaiting Approval" ? "Pending" :
          r.status === "Approved for Dispatch" || r.status === "Scheduled" ? "Pending" :
          r.status;
        return <StatusPill status={displayStatus} />;
      }
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-['Inter',sans-serif]">
      {/* Desktop Header */}
      <div className="hidden md:block w-full bg-white border-b border-[#e2e5e9] px-6 py-4">
        <h1 className="text-xl font-bold text-[#141a1f]">Dispatch History</h1>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Manage and track live fleet status.</p>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1400px] mx-auto">
        {/* Mobile Header */}
        <div className="md:hidden mb-6">
          <h1 className="text-[22px] font-bold text-[#141a1f]">Dispatch History</h1>
          <p className="text-[13px] text-slate-500 leading-snug mt-1.5">Manage and track live fleet status.</p>
        </div>

        {/* Export Button */}
        <div className="flex justify-end mb-4">
          <button className="flex items-center gap-2 bg-[#1B2432] text-white text-[12px] font-semibold h-9 px-4 rounded-[4px] hover:bg-black transition-colors">
            <Download className="h-4 w-4" />
            Export CVS
          </button>
        </div>

        {/* Mobile Fleet Register Header */}
        <div className="md:hidden mb-4">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[16px] font-bold text-[#141a1f]">Fleet Register</h2>
            <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
              {filteredTrips.length}
            </span>
          </div>
          
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-3 bg-white border border-[#e2e5e9] rounded-[8px] text-sm focus:outline-none focus:border-[#ea3a3d]"
              />
            </div>
            <button className="h-10 w-10 bg-[#ea3a3d] rounded-[8px] flex items-center justify-center shrink-0">
              <SlidersHorizontal className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden hidden md:block">
          <div className="p-4 border-b border-[#e2e5e9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#141a1f]">History</h2>
              <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-5 px-1.5 rounded-[4px] flex items-center justify-center">
                {filteredTrips.length}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-10 pr-3 bg-white border border-[#e2e5e9] rounded-[6px] text-sm w-[200px] focus:outline-none focus:border-[#ea3a3d]"
                />
              </div>
              <button className="h-9 w-9 bg-[#ea3a3d] rounded-[6px] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
          <div onClick={(e) => {
            const row = (e.target as HTMLElement).closest("tr");
            if (row) {
              const idx = Array.from(row.parentElement?.children || []).indexOf(row);
              if (idx >= 0 && filteredTrips[idx]) {
                setSelectedTrip(filteredTrips[idx]);
              }
            }
          }} className="cursor-pointer">
            <DataTable
              rows={filteredTrips}
              columns={historyColumns}
              pageSize={10}
            />
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col gap-3 pb-24">
          {filteredTrips.map(r => {
            const displayStatus = r.status === "En Route" || r.status === "Loaded" ? "In Transit" :
              r.status === "Requested" || r.status === "Awaiting Approval" ? "Pending" :
              r.status === "Approved for Dispatch" || r.status === "Scheduled" ? "Pending" :
              r.status;
            return (
              <div
                key={r.id}
                onClick={() => setSelectedTrip(r)}
                className="bg-white rounded-[8px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] cursor-pointer active:bg-slate-50 transition-colors"
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="text-[11px] text-[#5c6470]">02 Sept 2026</div>
                  <StatusPill status={displayStatus} />
                </div>
                <h3 className="font-bold text-[#1a2332] text-[15px] mb-3">{r.customer}</h3>
                <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[13px]">
                  <span className="text-[#5c6470]">Request ID:</span>
                  <span className="text-[#ea3a3d] font-semibold">{r.id}</span>
                  
                  <span className="text-[#5c6470]">Product:</span>
                  <span className="text-[#3c4250]">{r.cargo}</span>
                  
                  <span className="text-[#5c6470]">Truck Type:</span>
                  <span className="text-[#3c4250]">Flat</span>
                  
                  <span className="text-[#5c6470]">Destination:</span>
                  <span className="text-[#3c4250]">{r.dropoff || "ABC, Alake Estate"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
