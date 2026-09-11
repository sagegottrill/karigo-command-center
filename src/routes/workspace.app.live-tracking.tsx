import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DispatchLiveMap } from "@/components/fleetopsx/dispatch-live-map";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, tripService } from "@/lib/fleetopsx/services";
import {
  getTrackingDelayStatus,
  isActiveDispatchTrip,
  TRACKING_DELAY_COLOR,
} from "@/lib/fleetopsx/tracking-ops";
import type { Trip } from "@/lib/fleetopsx/types";

export const Route = createFileRoute("/workspace/app/live-tracking")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Security", "Platform Admin"];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Live Tracking | Tracking Ops" },
      { name: "description", content: "Monitor and track live dispatch status." },
    ],
  }),
  component: LiveTrackingPage,
});

function LiveTrackingPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void tripService
      .list()
      .then((all) => {
        if (!cancelled) setTrips(all.filter(isActiveDispatchTrip));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load live tracking"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    let onSchedule = 0;
    let slight = 0;
    let significant = 0;
    for (const trip of trips) {
      const delay = getTrackingDelayStatus(trip);
      switch (delay) {
        case "On Schedule":
          onSchedule += 1;
          break;
        case "Slight delay":
          slight += 1;
          break;
        case "Significant Delay":
          significant += 1;
          break;
        default: {
          const _exhaustive: never = delay;
          return _exhaustive;
        }
      }
    }
    return { total: trips.length, onSchedule, slight, significant };
  }, [trips]);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 md:gap-[30px] md:p-[30px]">
        <FigmaLoadingState label="Loading live tracking…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432] md:text-[24px] md:font-medium md:leading-8">
          Live Tracking
        </h2>
        <p className="text-[12px] text-[#5C6470] md:text-[11.4px] md:uppercase md:tracking-[0.4px] md:text-[rgba(92,100,112,0.6)]">
          monitor and track live dispatch status
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        <StatCard label="Total Active Dispatch" value={stats.total} />
        <StatCard label="On Schedule" value={stats.onSchedule} />
        <StatCard label="Slight Delay" value={stats.slight} hint="Attention needed" hintColor="#F99E1F" />
        <StatCard
          label="Significant Delay"
          value={stats.significant}
          hint="Escalation needed"
          hintColor="#EF4343"
        />
      </div>

      <section className="relative flex flex-col gap-5 overflow-hidden rounded-[10px] bg-white p-5 shadow-[0px_1px_4px_rgba(12,12,13,0.1)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E5E9] pb-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">Active Dispatch</h3>
            <span className="grid size-8 place-items-center rounded bg-[#ED351D] text-[14px] font-medium text-white">
              {stats.total}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {(
              [
                ["On Schedule", TRACKING_DELAY_COLOR["On Schedule"]],
                ["Slight delay", TRACKING_DELAY_COLOR["Slight delay"]],
                ["Significant Delay", TRACKING_DELAY_COLOR["Significant Delay"]],
              ] as const
            ).map(([label, color]) => (
              <div key={label} className="flex items-center gap-[9px]">
                <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[14px] font-semibold tracking-[0.4px] text-[#5C6470]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {trips.length === 0 ? (
          <FigmaEmptyState
            title="No active dispatches on the map"
            body="Live trip positions appear here when active dispatches exist."
          />
        ) : (
          <div className="h-[420px] overflow-hidden rounded-[10px] border border-[#E2E5E9] md:h-[536px]">
            <DispatchLiveMap trips={trips} />
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  hintColor,
}: {
  label: string;
  value: number;
  hint?: string;
  hintColor?: string;
}) {
  return (
    <div className="flex h-[105px] flex-col gap-2.5 rounded-lg bg-white p-[15px] shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]">
      <p className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">{label}</p>
      <p className="font-[Space_Grotesk,ui-sans-serif,system-ui] text-[36px] font-bold leading-9 text-[#1B2432]">
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] font-medium" style={{ color: hintColor }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
