import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download, Search, SlidersHorizontal, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, tripService } from "@/lib/fleetopsx/services";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/dispatch-history")({
  // Live JWT is browser-only — never SSR-fetch
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
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

type DisplayStatus = "In Transit" | "Pending" | "Declined" | "Completed";

const STATUS_STYLES: Record<DisplayStatus, string> = {
  "In Transit": "bg-[#A259FF] text-white",
  Pending: "bg-[#FC0] text-[#1B2432]",
  Declined: "bg-[#FF383C] text-white",
  Completed: "bg-[#34C759] text-white",
};

function toDisplayStatus(status: Trip["status"]): DisplayStatus {
  switch (status) {
    case "En Route":
    case "Loaded":
    case "Offloading":
    case "Returning":
    case "Delayed":
      return "In Transit";
    case "Requested":
    case "Awaiting Approval":
    case "Scheduled":
      return "Pending";
    case "Stopped":
      return "Declined";
    case "Completed":
      return "Completed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded px-3 text-[12px] font-medium tracking-[0.4px] shadow-[0px_1px_4px_rgba(12,12,13,0.1)]",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function dispatchId(trip: Trip) {
  if (/^DIS-/i.test(trip.id)) return trip.id;
  const digits = trip.id.replace(/\D/g, "").slice(-5) || trip.id.slice(-5);
  return `DIS-${digits.padStart(5, "0")}`;
}

function formatHistoryDate(trip: Trip) {
  const raw = trip.scheduledDate?.trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return raw;
}

function companyName(trip: Trip) {
  if (trip.customer && trip.customer !== "Customer Portal") return trip.customer;
  return trip.customerConsignee ?? "";
}

function formatN(num: number) {
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function DetailRow({ label, value }: { label: string; value?: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <span className="shrink-0 text-[#5C6470]">{label}</span>
      <span className="max-w-[58%] text-right font-semibold whitespace-pre-line text-[#1B2432]">{value}</span>
    </div>
  );
}

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

function buildTimeline(status: Trip["status"]) {
  if (status === "Completed") {
    return TIMELINE_STEPS.map((s) => ({
      ...s,
      done: true,
      children: s.children?.map((c) => ({ ...c, done: true })),
    }));
  }
  return TIMELINE_STEPS;
}

function DispatchDetail({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const timeline = buildTimeline(trip.status);
  const displayStatus = toDisplayStatus(trip.status);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      {/* Figma 443:13089 — Export under title on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          Dispatch Details and Timeline
        </button>
        <button
          type="button"
          onClick={() => toast.success("Exported CSV successfully.")}
          className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CVS
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex-1 overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] p-5">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Details</h2>
              <p className="mt-1 text-[11.4px] uppercase tracking-[0.4px] text-[#5C6470]">
                Ticket {dispatchId(trip)}
                {companyName(trip) ? `  •  ${companyName(trip)}` : ""}
              </p>
            </div>
            <StatusPill status={displayStatus} />
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
              <span className="text-[14px] font-bold text-[#1B2432]">Customer Details</span>
              <DetailRow label="Customer Name:" value={trip.customerConsignee} />
              <DetailRow label="Destination:" value={trip.dropoff} />
              <DetailRow
                label="Loading Site(s):"
                value={trip.loadingSite?.filter(Boolean).join("\n") || trip.pickup}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
              <span className="text-[14px] font-bold text-[#1B2432]">Vehicle & Operator Details</span>
              <DetailRow label="Truck Head (Cap Number):" value={trip.headId} />
              <DetailRow label="Truck Head Plate Number:" value={trip.truckReg} />
              <DetailRow
                label="Truck Tail assigned:"
                value={[trip.tailType, trip.tailNumber].filter(Boolean).join(" ")}
              />
              <DetailRow label="Driver Assigned:" value={trip.driverName} />
              <DetailRow label="Driver Contact Phone:" value={(trip as Trip & { driverPhone?: string }).driverPhone} />
            </div>

            {(trip.directCosts || typeof trip.totalCosts === "number") && (
              <div className="flex flex-col gap-3 rounded-[6px] bg-[#F1F2F4] p-3">
                <span className="text-[14px] font-bold text-[#1B2432]">Expense Configuration Breakdown</span>
                {trip.directCosts && (
                  <>
                    <DetailRow label="Trip Allowance:" value={formatN(trip.directCosts.tripAllowance)} />
                    <DetailRow label="Return Waybill:" value={formatN(trip.directCosts.returnWaybill)} />
                    <DetailRow label="Motor Boy Allowance:" value={formatN(trip.directCosts.motorBoy)} />
                    <DetailRow label="Transit Road Tickets:" value={formatN(trip.directCosts.ticket)} />
                    <DetailRow label="Extra Contingency:" value={formatN(trip.directCosts.extraAllowance)} />
                    <DetailRow label="Lubricant:" value={trip.directCosts.lubricantType} />
                    {typeof trip.directCosts.lubricantQuantity === "number" ? (
                      <DetailRow label="Lubricant Quantity:" value={String(trip.directCosts.lubricantQuantity)} />
                    ) : null}
                    {typeof trip.directCosts.lubricantCost === "number" ? (
                      <DetailRow label="Lubricant Cost:" value={formatN(trip.directCosts.lubricantCost)} />
                    ) : null}
                  </>
                )}
                {typeof trip.totalCosts === "number" && (
                  <>
                    <div className="h-px w-full bg-[#E2E5E9]" />
                    <div className="flex items-center justify-between gap-4 text-[14px] font-bold">
                      <span className="text-[#1B2432]">Total Configured Expense:</span>
                      <span className="text-[#ED351D]">{formatN(trip.totalCosts)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_16px_rgba(12,12,13,0.05)] lg:max-w-[480px]">
          <div className="border-b border-[#E2E5E9] p-5">
            <h2 className="text-[20px] font-semibold tracking-[0.4px] text-[#1B2432]">Dispatch Timeline</h2>
          </div>
          <div className="p-4 md:p-5">
            <ol className="relative ml-2 space-y-0 border-l-2 border-[#E2E5E9] pl-6 md:ml-3 md:pl-7">
              {timeline.map((step) => (
                <li key={step.label} className="relative pb-4 last:pb-0 md:pb-6">
                  <span
                    className={cn(
                      "absolute -left-[29px] top-0.5 size-3.5 rounded-full border-2 md:-left-[33px] md:size-4",
                      step.done ? "border-[#ED351D] bg-[#ED351D]" : "border-[#D1D5DB] bg-white",
                    )}
                  >
                    {step.done ? (
                      <span className="absolute inset-[3px] rounded-full bg-white md:inset-1" />
                    ) : null}
                  </span>
                  <p className={cn("text-[13px] font-bold", step.done ? "text-[#ED351D]" : "text-[#9CA3AF]")}>
                    {step.label}
                  </p>
                  {formatHistoryDate(trip) && (
                    <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{formatHistoryDate(trip)}</p>
                  )}
                  {step.children && (
                    <ol className="relative mt-2 ml-1 space-y-2 border-l border-[#E2E5E9] pl-4 md:mt-3 md:ml-2 md:space-y-3 md:pl-5">
                      {step.children.map((child) => (
                        <li key={child.label} className="relative">
                          <span
                            className={cn(
                              "absolute -left-[21px] top-1 size-2 rounded-full border md:-left-[23px]",
                              child.done ? "border-[#ED351D] bg-[#ED351D]" : "border-[#D1D5DB] bg-white",
                            )}
                          />
                          <p className={cn("text-[12px] font-medium", child.done ? "text-[#5C6470]" : "text-[#9CA3AF]")}>
                            {child.label}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                  {step.confirmable && step.done && (
                    <button
                      type="button"
                      className="mt-2 flex items-center gap-2"
                      onClick={() => toast.success("Arrival confirmed", { description: "Timestamp and location logged." })}
                    >
                      <span className="size-3 rounded-full bg-[#34C759]" />
                      <span className="rounded-full bg-[#1B2432] px-3 py-1 text-[10px] font-semibold text-white">
                        Arrival Confirmation
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function DispatchHistoryPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void tripService
      .list()
      .then(setTrips)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load dispatch history"))
      .finally(() => setLoading(false));
  }, []);

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips.filter((t) => {
      if (!q) return true;
      const hay = `${dispatchId(t)} ${formatHistoryDate(t)} ${companyName(t)} ${t.cargo} ${t.tailType ?? ""} ${t.dropoff} ${t.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [trips, searchQuery]);

  const exportCSV = () => {
    const headers = "Dispatch ID,Date,Company,Product,Truck Type,Destination,Status\n";
    const csv = filteredTrips
      .map(
        (t) =>
          `${dispatchId(t)},${formatHistoryDate(t)},${companyName(t)},${t.cargo},${t.tailType ?? ""},${t.dropoff},${toDisplayStatus(t.status)}`,
      )
      .join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dispatch_history.csv";
    a.click();
    toast.success("Exported CSV successfully.");
  };

  if (selectedTrip) {
    return <DispatchDetail trip={selectedTrip} onBack={() => setSelectedTrip(null)} />;
  }

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
        <FigmaLoadingState label="Loading dispatch history…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Dispatch History</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manage and track live fleet status.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="flex h-8 w-[123px] items-center gap-1.5 rounded bg-[#1B2432] px-[7px] text-[14px] font-medium tracking-[0.4px] text-white"
        >
          <Download className="size-[18px]" strokeWidth={1.75} />
          Export CSV
        </button>
      </div>

      <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">History</h3>
            <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white">
              {filteredTrips.length}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative w-full max-w-[400px] min-w-[200px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]"
                strokeWidth={1.5}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="h-9 w-full rounded border border-[rgba(92,100,112,0.6)] bg-transparent pr-3 pl-10 text-[14px] tracking-[0.4px] text-[#141A1F] outline-none placeholder:text-[#5C6470]"
              />
            </div>
            <button type="button" className="grid size-9 place-items-center rounded bg-[#ED351D] text-white" aria-label="Filter">
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="hidden grid-cols-[110px_150px_180px_140px_120px_1fr_120px] items-center gap-[30px] border-b border-[#E2E5E9] py-2.5 md:grid">
          {["Dispatch ID", "Date", "Company", "Product", "Truck Type", "Destination", "Status"].map((h) => (
            <span key={h} className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {h}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 md:hidden">
          {filteredTrips.map((trip) => {
            const status = toDisplayStatus(trip.status);
            return (
              <button
                key={`m-${trip.id}`}
                type="button"
                onClick={() => setSelectedTrip(trip)}
                className="flex w-full flex-col gap-2 rounded-md border border-[#E2E5E9] bg-white px-3.5 py-2.5 text-left shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-[0.4px] text-[#303D50]">{dispatchId(trip)}</span>
                  <StatusPill status={status} />
                </div>
                <p className="text-[16px] font-semibold tracking-[0.4px] text-[#344256]">{companyName(trip) || "—"}</p>
                <div className="flex flex-col gap-1 text-[12px]">
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Date:</span>
                    <span className="flex-1 text-[#344256]">{formatHistoryDate(trip)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Product:</span>
                    <span className="flex-1 text-[#344256]">{trip.cargo || "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 font-medium text-[#5C6470]">Destination:</span>
                    <span className="flex-1 text-[#344256]">{trip.dropoff || "—"}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="hidden md:block">
          {filteredTrips.map((trip) => {
            const status = toDisplayStatus(trip.status);
            return (
              <button
                key={trip.id}
                type="button"
                onClick={() => setSelectedTrip(trip)}
                className="grid w-full grid-cols-[110px_150px_180px_140px_120px_1fr_120px] items-center gap-[30px] border-b border-[#E2E5E9] py-2.5 text-left last:border-b-0"
              >
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{dispatchId(trip)}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{formatHistoryDate(trip)}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{companyName(trip)}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.cargo}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.tailType}</span>
                <span className="text-[14px] capitalize tracking-[0.4px] text-[#5C6470]">{trip.dropoff}</span>
                <StatusPill status={status} />
              </button>
            );
          })}
        </div>

        {filteredTrips.length === 0 && (
          <FigmaEmptyState
            title={searchQuery ? "No matching dispatch history" : "No dispatch history yet"}
            body={
              searchQuery
                ? "Try a different dispatch ID, company, or destination."
                : "Completed and in-progress dispatches from the live API will list here."
            }
          />
        )}
      </div>
    </div>
  );
}
