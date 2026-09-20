import { useEffect, useMemo, useState } from "react";
import { adminService, authService, dashboardService, fleetService } from "@/lib/fleetopsx/services";
import { dailyActivity } from "@/lib/fleetopsx/daily-stats";
import { DailyCaptureBand, useDailyClock } from "./daily-capture";
import { TrackingUpdatesPanel } from "./tracking-updates-panel";
import { ACTIVE_DISPATCH_BUCKETS, countBuckets, isInBucket } from "@/lib/fleetopsx/status-buckets";
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
  return (
    trip.status === "Requested" ||
    trip.customer === "Customer Portal" ||
    Boolean(trip.customerConsignee?.trim())
  );
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
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  hintClass?: string;
  tall?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-[10px] bg-white p-[15px]",
        CARD_SHADOW,
        tall ? "h-[116px]" : "h-[105px]",
        className,
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

/**
 * Section header. The `scope` chip states out loud whether the numbers under it
 * are TODAY's capture, an all-time total, or the live state right now — so no
 * card can look stale without saying so.
 */
function SectionTitle({ children, scope }: { children: string; scope?: string }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-[rgba(92,100,112,0.3)] pb-2.5">
      <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[24px] md:font-medium md:leading-8">
        {children}
      </h2>
      {scope ? (
        <span className="rounded-[4px] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">
          {scope}
        </span>
      ) : null}
    </div>
  );
}

export function CentralDashboard({ data }: { data: OverviewData }) {
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // Cards stay live: poll the same APIs the initial load used (30s).
  const [live, setLive] = useState<OverviewData>(data);
  // Daily capture clock (client-only, ticks every second).
  const clock = useDailyClock();

  useEffect(() => {
    let cancelled = false;
    // GET /users is server-gated to Platform Admin + HR — other roles must not call it.
    const canListUsers = authService.getRoles().some((r: string) => r === "Platform Admin" || r === "HR");
    const refresh = () => {
      void dashboardService
        .getOverview()
        .then((o) => {
          if (cancelled) return;
          setLive((prev) => ({
            ...prev,
            trips: o.trips ?? prev.trips,
            trucks: o.trucks ?? prev.trucks,
            drivers: o.drivers ?? prev.drivers,
            expenses: o.expenses ?? prev.expenses,
          }));
        })
        .catch(() => {});
      void fleetService
        .listTails()
        .then((t) => {
          if (!cancelled) setTails(t);
        })
        .catch(() => {});
      if (canListUsers) {
        void adminService
          .users()
          .then((u) => {
            if (!cancelled) setUsers(u);
          })
          .catch(() => {});
      }
    };
    refresh();
    // 10s near-real-time cadence (was 30s) + refetch when the tab regains
    // focus, so cards move without a manual refresh.
    const id = window.setInterval(refresh, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const stats = useMemo(() => {
    const trips = live.trips ?? [];
    const heads = live.trucks ?? [];
    const partnerTrips = trips.filter(isPartnerTrip);

    // Status semantics come from the shared buckets module so these numbers
    // match the partner portal, queues and badges exactly.
    const partnerCounts = countBuckets(partnerTrips);
    const allCounts = countBuckets(trips);

    const active = trips.filter((t) => isInBucket(t, ACTIVE_DISPATCH_BUCKETS));
    // Delay grading mirrors the Tracking board (tracking-ops): a Delayed trip on
    // a High/Critical job is significant, any other Delayed trip is slight.
    // `Stopped` is a DECLINE here, not a delay — those trips are not in `active`.
    const isSignificant = (t: (typeof active)[number]) =>
      t.status === "Delayed" && (t.priority === "Critical" || t.priority === "High");
    const slight = active.filter((t) => t.status === "Delayed" && !isSignificant(t));
    const significant = active.filter(isSignificant);
    const onSchedule = active.filter((t) => t.status !== "Delayed");

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
        // Same "In transit" definition the partner dashboard shows: anything
        // moving, including a truck stopped en route (that's a delay, not a decline).
        inTransit: partnerCounts.inTransit,
        pending: partnerCounts.pending,
        declined: partnerCounts.declined,
        completed: partnerCounts.completed,
      },
      dispatch: {
        total: active.length,
        onSchedule: onSchedule.length,
        slight: slight.length,
        significant: significant.length,
      },
      // Exposed for cross-checking against the live fleet totals.
      allCounts,
      heads: {
        total: heads.length,
        available: countByStatus(heads, "Available"),
        inTransit: countByStatus(heads, "Out of Yard") + countByStatus(heads, "Assigned"),
        checkUp: countByStatus(heads, "Check Up"),
        maintenance: countByStatus(heads, "Maintenance"),
        out: countByStatus(heads, "Accident"),
      },
      tails: {
        total: tails.length,
        available: countByStatus(tails, "Available"),
        inTransit: countByStatus(tails, "Out of Yard") + countByStatus(tails, "Assigned"),
        checkUp: countByStatus(tails, "Check Up"),
        maintenance: countByStatus(tails, "Maintenance"),
        out: countByStatus(tails, "Accident"),
      },
      staff: {
        total: staff.length,
        active: staff.filter((u) => u.status === "Active" || u.status === "Invited").length,
        suspended: staff.filter((u) => u.status === "Suspended").length,
      },
    };
  }, [live.trips, live.trucks, tails, users]);

  // Today's capture. Rebuilt from the trip stamps on every tick, so the rollover
  // at midnight needs no cron job and no stored snapshot — yesterday's numbers
  // cannot bleed into today's.
  const daily = clock ? dailyActivity(live.trips ?? [], clock) : null;

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-5 md:p-[30px] md:pb-[30px]">
      {/* Daily capture band — the day this board reports on, and how fresh it is. */}
      <DailyCaptureBand />

      {/* Figma 472:17727 / mobile 472:17760 */}
      <SectionTitle scope="Today">Today's Activity</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-5">
        <StatCard
          label="Requests Today"
          value={daily?.requests ?? 0}
          hint={stats.requests.total > 0 ? `${stats.requests.total} raised all time` : undefined}
          className="md:min-w-[160px] md:flex-1"
        />
        <StatCard label="Approved Today" value={daily?.approved ?? 0} className="md:min-w-[160px] md:flex-1" />
        <StatCard
          label="Dispatched Today"
          value={daily?.dispatched ?? 0}
          className="md:min-w-[160px] md:flex-1"
        />
        <StatCard label="Completed Today" value={daily?.completed ?? 0} className="md:min-w-[160px] md:flex-1" />
        <StatCard
          label="Declined Today"
          value={daily?.declined ?? 0}
          {...(daily && daily.declined > 0
            ? { hint: "partner was told why", hintClass: "text-[#ED351D]" }
            : {})}
          className="col-span-2 md:col-span-1 md:min-w-[160px] md:flex-1"
        />
      </div>

      <SectionTitle scope="All time">Customer Requests</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-5">
        <StatCard
          tall
          label="Total Requests"
          value={stats.requests.total}
          {...(daily && daily.requests > 0
            ? { hint: `+${daily.requests} today`, hintClass: "text-[#34C759]" }
            : {})}
          className="md:min-w-[160px] md:flex-1"
        />
        <StatCard
          tall
          label="In transit"
          value={stats.requests.inTransit}
          {...(stats.requests.inTransit > 0
            ? { hint: "Look out for your delivery", hintClass: "text-[#34C759]" }
            : {})}
          className="md:min-w-[160px] md:flex-1"
        />
        <StatCard tall label="Pending" value={stats.requests.pending} className="md:min-w-[160px] md:flex-1" />
        <StatCard tall label="Declined" value={stats.requests.declined} className="md:min-w-[160px] md:flex-1" />
        <StatCard
          tall
          label="Completed"
          value={stats.requests.completed}
          className="col-span-2 md:col-span-1 md:min-w-[160px] md:flex-1"
        />
      </div>

      <SectionTitle scope="Live now">Tracking Operations</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-5">
        <StatCard label="Active Dispatches" value={stats.dispatch.total} className="md:min-w-[160px] md:flex-1" />
        <StatCard label="On Schedule" value={stats.dispatch.onSchedule} className="md:min-w-[160px] md:flex-1" />
        <StatCard
          label="Slight Delay"
          value={stats.dispatch.slight}
          {...(stats.dispatch.slight > 0
            ? { hint: "Attention needed", hintClass: "text-[#F99E1F]" }
            : {})}
          className="md:min-w-[160px] md:flex-1"
        />
        <StatCard
          label="Significant Delay"
          value={stats.dispatch.significant}
          {...(stats.dispatch.significant > 0
            ? { hint: "Escalation needed", hintClass: "text-[#EF4343]" }
            : {})}
          className="md:min-w-[160px] md:flex-1"
        />
      </div>

      {/* The Tracking department's own updates, live, right under the numbers —
          the TM should not have to open the bell to learn that a specific truck
          just reached a checkpoint. */}
      <TrackingUpdatesPanel trips={live.trips ?? []} />

      <SectionTitle scope="Live now">Fleet Registry</SectionTitle>
      <div className="flex flex-col gap-3 md:gap-5">
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-5">
          <StatCard label="Total Head" value={stats.heads.total} className="md:min-w-[160px] md:flex-1" />
          <StatCard label="Total Tails" value={stats.tails.total} className="md:hidden" />
          <StatCard
            label="Available Head"
            value={stats.heads.available}
            {...(stats.heads.available > 0
              ? { hint: "ready to dispatch", hintClass: "text-[#34C759]" }
              : {})}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard
            label="Available Tail"
            value={stats.tails.available}
            {...(stats.tails.available > 0
              ? { hint: "ready to dispatch", hintClass: "text-[#34C759]" }
              : {})}
            className="md:hidden"
          />
          <StatCard label="Head Out of Yard" value={stats.heads.inTransit} className="md:min-w-[160px] md:flex-1" />
          <StatCard label="Tail Out of Yard" value={stats.tails.inTransit} className="md:hidden" />
          <StatCard
            label="Head Check Up"
            value={stats.heads.checkUp}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard label="Tail Check Up" value={stats.tails.checkUp} className="md:hidden" />
          <StatCard
            label="Head In Maintenance"
            value={stats.heads.maintenance}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard label="Tail In Maintenance" value={stats.tails.maintenance} className="md:hidden" />
          <StatCard
            label="Head Accident"
            value={stats.heads.out}
            {...(stats.heads.out > 0 ? { hint: "unavailable", hintClass: "text-[#ED351D]" } : {})}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard
            label="Tail Accident"
            value={stats.tails.out}
            {...(stats.tails.out > 0 ? { hint: "unavailable", hintClass: "text-[#ED351D]" } : {})}
            className="md:hidden"
          />
        </div>
        <div className="hidden flex-wrap gap-5 md:flex">
          <StatCard label="Total Tail" value={stats.tails.total} className="md:min-w-[160px] md:flex-1" />
          <StatCard
            label="Available Tail"
            value={stats.tails.available}
            {...(stats.tails.available > 0
              ? { hint: "ready to dispatch", hintClass: "text-[#34C759]" }
              : {})}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard label="Tail Out of Yard" value={stats.tails.inTransit} className="md:min-w-[160px] md:flex-1" />
          <StatCard label="Tail Check Up" value={stats.tails.checkUp} className="md:min-w-[160px] md:flex-1" />
          <StatCard
            label="Tail In Maintenance"
            value={stats.tails.maintenance}
            className="md:min-w-[160px] md:flex-1"
          />
          <StatCard
            label="Tail Accident"
            value={stats.tails.out}
            {...(stats.tails.out > 0 ? { hint: "unavailable", hintClass: "text-[#ED351D]" } : {})}
            className="md:min-w-[160px] md:flex-1"
          />
        </div>
      </div>

      <SectionTitle scope="Live now">Staff Registry</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-5">
        <StatCard
          label="Total Staff Account"
          value={stats.staff.total}
          className="col-span-2 md:col-span-1 md:min-w-[160px] md:flex-1"
        />
        <StatCard label="Active Accounts" value={stats.staff.active} className="md:min-w-[160px] md:flex-1" />
        <StatCard label="Suspended Accounts" value={stats.staff.suspended} className="md:min-w-[160px] md:flex-1" />
      </div>
    </div>
  );
}
