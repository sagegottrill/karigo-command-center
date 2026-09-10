import { useEffect, useMemo, useState } from "react";
import { allowMockFallback } from "@/lib/fleetopsx/apiClient";
import { adminService, fleetService } from "@/lib/fleetopsx/services";
import type { Driver, Expense, Trip, TruckHead, TruckTail, User } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

type OverviewData = {
  trips: Trip[];
  trucks: TruckHead[];
  drivers: Driver[];
  expenses: Expense[];
};

const CARD_SHADOW =
  "shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]";

function isPartnerTrip(trip: Trip) {
  return trip.customer === "Customer Portal" || trip.status === "Requested";
}

function countByStatus(items: { status: string }[], status: string) {
  return items.filter((item) => item.status === status).length;
}

function StatCard({
  label,
  value,
  hint,
  hintClass,
  tall,
}: {
  label: string;
  value: number;
  hint?: string;
  hintClass?: string;
  tall?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[160px] flex-1 flex-col gap-2.5 overflow-hidden rounded-[10px] bg-white p-[15px]",
        CARD_SHADOW,
        tall ? "h-[116px]" : "h-[105px]",
      )}
    >
      <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">{label}</span>
      <span className="font-['Space_Grotesk',sans-serif] text-[36px] font-bold leading-9 text-[#1B2432]">
        {value}
      </span>
      {hint ? <span className={cn("text-[10px] font-medium leading-normal", hintClass)}>{hint}</span> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex w-full items-center border-b border-[rgba(92,100,112,0.3)] pb-2.5">
      <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">{children}</h2>
    </div>
  );
}

export function CentralDashboard({ data }: { data: OverviewData }) {
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    void adminService.users().then(setUsers);
    if (allowMockFallback()) {
      void fleetService.listTails().then(setTails);
    }
  }, []);

  const stats = useMemo(() => {
    const trips = data.trips ?? [];
    const heads = data.trucks ?? [];
    const partnerTrips = trips.filter(isPartnerTrip);
    const pending = partnerTrips.filter((t) => t.status === "Requested" || t.status === "Awaiting Approval");
    const inTransit = partnerTrips.filter((t) =>
      t.status === "En Route" || t.status === "Loaded" || t.status === "Offloading" || t.status === "Returning",
    );
    const completed = partnerTrips.filter((t) => t.status === "Completed");
    const declined = 0;

    const active = trips.filter(
      (t) =>
        t.status === "Scheduled" ||
        t.status === "Loaded" ||
        t.status === "En Route" ||
        t.status === "Offloading" ||
        t.status === "Returning" ||
        t.status === "Delayed" ||
        t.status === "Stopped",
    );
    const slight = active.filter((t) => t.status === "Delayed");
    const significant = active.filter((t) => t.status === "Stopped");
    const onSchedule = active.filter((t) => t.status !== "Delayed" && t.status !== "Stopped");

    const staff = users.filter(
      (u) =>
        u.status !== "Deleted" &&
        u.department !== "External Partner" &&
        !u.roles.includes("Customer Portals (External)") &&
        !u.partnerCompanyName,
    );

    return {
      requests: {
        total: partnerTrips.length,
        inTransit: inTransit.length,
        pending: pending.length,
        declined,
        completed: completed.length,
      },
      dispatch: {
        total: active.length,
        onSchedule: onSchedule.length,
        slight: slight.length,
        significant: significant.length,
      },
      heads: {
        total: heads.length,
        available: countByStatus(heads, "Available"),
        inTransit: countByStatus(heads, "In Transit") + countByStatus(heads, "Assigned"),
        maintenance: countByStatus(heads, "Maintenance"),
        out: countByStatus(heads, "Out of Service"),
      },
      tails: {
        total: tails.length,
        available: countByStatus(tails, "Available"),
        inTransit: countByStatus(tails, "In Transit") + countByStatus(tails, "Assigned"),
        maintenance: countByStatus(tails, "Maintenance"),
        out: countByStatus(tails, "Out of Service"),
      },
      staff: {
        total: staff.length,
        active: staff.filter((u) => u.status === "Active" || u.status === "Invited").length,
        suspended: staff.filter((u) => u.status === "Suspended").length,
      },
    };
  }, [data.trips, data.trucks, tails, users]);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-[30px] max-md:px-4 max-md:py-5">
      {/* Figma 472:17727 */}
      <SectionTitle>Customer Requests</SectionTitle>
      <div className="flex flex-wrap gap-5">
        <StatCard tall label="Total Requests" value={stats.requests.total} />
        <StatCard
          tall
          label="In transit"
          value={stats.requests.inTransit}
          hint={stats.requests.inTransit > 0 ? "Look out for your delivery" : undefined}
          hintClass="text-[#34C759]"
        />
        <StatCard tall label="Pending" value={stats.requests.pending} />
        <StatCard tall label="Declined" value={stats.requests.declined} />
        <StatCard tall label="Completed" value={stats.requests.completed} />
      </div>

      <SectionTitle>Active Dispatch</SectionTitle>
      <div className="flex flex-wrap gap-5">
        <StatCard label="Total Active Dispatch" value={stats.dispatch.total} />
        <StatCard label="On Schedule" value={stats.dispatch.onSchedule} />
        <StatCard
          label="Slight Delay"
          value={stats.dispatch.slight}
          hint={stats.dispatch.slight > 0 ? "Attention needed" : undefined}
          hintClass="text-[#F99E1F]"
        />
        <StatCard
          label="Significant Delay"
          value={stats.dispatch.significant}
          hint={stats.dispatch.significant > 0 ? "Escalation needed" : undefined}
          hintClass="text-[#EF4343]"
        />
      </div>

      <SectionTitle>Fleet Registry</SectionTitle>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-5">
          <StatCard label="Total Head" value={stats.heads.total} />
          <StatCard
            label="Available Head"
            value={stats.heads.available}
            hint={stats.heads.available > 0 ? "ready to dispatch" : undefined}
            hintClass="text-[#34C759]"
          />
          <StatCard label="Head In Transit" value={stats.heads.inTransit} />
          <StatCard label="Head In Maintenance" value={stats.heads.maintenance} />
          <StatCard
            label="Head Out of Service"
            value={stats.heads.out}
            hint={stats.heads.out > 0 ? "unavailable" : undefined}
            hintClass="text-[#ED351D]"
          />
        </div>
        <div className="flex flex-wrap gap-5">
          <StatCard label="Total Tail" value={stats.tails.total} />
          <StatCard
            label="Available Tail"
            value={stats.tails.available}
            hint={stats.tails.available > 0 ? "ready to dispatch" : undefined}
            hintClass="text-[#34C759]"
          />
          <StatCard label="Tail In Transit" value={stats.tails.inTransit} />
          <StatCard label="Tail In Maintenance" value={stats.tails.maintenance} />
          <StatCard
            label="Tail Out of Service"
            value={stats.tails.out}
            hint={stats.tails.out > 0 ? "unavailable" : undefined}
            hintClass="text-[#ED351D]"
          />
        </div>
      </div>

      <SectionTitle>Staff Registry</SectionTitle>
      <div className="flex flex-wrap gap-5">
        <StatCard label="Total Staff Account" value={stats.staff.total} />
        <StatCard label="Active Accounts" value={stats.staff.active} />
        <StatCard label="Suspended Accounts" value={stats.staff.suspended} />
      </div>
    </div>
  );
}
