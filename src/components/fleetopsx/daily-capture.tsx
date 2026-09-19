import { useEffect, useState } from "react";
import { formatClockTime, formatDayLabel, type DailyActivity } from "@/lib/fleetopsx/daily-stats";

/**
 * Client-only portal clock for the daily-capture band.
 *
 * It must never render on the server: a server timestamp (server timezone and
 * locale) mismatches the browser on hydration and flips Suspense boundaries to
 * client rendering (React #419). Ticking every second is what makes the board
 * roll over to the new day at midnight without a reload.
 */
export function useDailyClock(): Date | null {
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setClock(new Date());
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, []);

  return clock;
}

/**
 * The day a dashboard is reporting on, how fresh it is, and (optionally) today's
 * compact numbers. Every dashboard that shows activity mounts this, so "is this
 * today's figure or a stale all-time one?" is never a guess.
 */
export function DailyCaptureBand({ activity }: { activity?: DailyActivity | null }) {
  const clock = useDailyClock();
  if (!clock) return null;

  const chips = activity
    ? ([
        ["Requests", activity.requests],
        ["Approved", activity.approved],
        ["Dispatched", activity.dispatched],
        ["Completed", activity.completed],
        ["Declined", activity.declined],
      ] as const)
    : [];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#1B2432] px-5 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-semibold tracking-[0.4px] text-white">
          Today · {formatDayLabel(clock)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.6px] text-white/60">
          Daily capture — today's figures only, reset at midnight
        </span>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(([label, value]) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-[4px] bg-white/10 px-2 py-1 text-[11px] font-medium tracking-[0.4px] text-white/85"
            >
              {label}
              <span className="font-['Space_Grotesk',sans-serif] text-[14px] font-bold text-white">{value}</span>
            </span>
          ))}
        </div>
      ) : null}
      <span className="flex items-center gap-2 text-[12px] font-medium tracking-[0.4px] text-white/80">
        <span className="size-2 rounded-full bg-[#0ACF83]" />
        Live · updated {formatClockTime(clock)}
      </span>
    </div>
  );
}
