import { Link } from "@tanstack/react-router";
import { ArrowUpRight, RadioTower } from "lucide-react";
import { formatTimeAgo } from "@/lib/fleetopsx/display-dates";
import { displayDispatchId } from "@/lib/fleetopsx/request-id";
import {
  dispatchIdIn,
  resolveTrackingTrip,
  trackingUpdateStamp,
  useTrackingUpdates,
} from "@/lib/fleetopsx/tracking-feed";
import type { Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-[#2463EB]",
  success: "bg-[#0ACF83]",
  warning: "bg-[#F99E1F]",
  critical: "bg-[#EF4343]",
  // The API uses `error` for a decline.
  error: "bg-[#EF4343]",
};

/**
 * What the Tracking department (and the Loading crew on the same checkpoints, and
 * Security at the gate) have just done to the trucks on the road.
 *
 * This sits beside the Tracking Operations numbers on the Transport Manager's
 * dashboard on purpose: the totals say HOW MANY are moving, this says WHICH truck
 * just moved and where — the question he actually asks all day.
 *
 * Every row carries the dispatch it belongs to when the update names one, so the
 * alert is a route into the dispatch rather than a dead end.
 */
export function TrackingUpdatesPanel({ trips }: { trips: Trip[] }) {
  const { items, loading } = useTrackingUpdates(trips);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.1),0px_4px_4px_-4px_rgba(12,12,13,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5E9] px-4 py-3">
        <div className="flex items-center gap-2">
          <RadioTower className="size-4 text-[#5C6470]" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">Tracking updates</h3>
          {unread > 0 ? (
            <span className="rounded-full bg-[#ED351D] px-2 py-0.5 text-[10px] font-bold tracking-[0.4px] text-white">
              {unread} new
            </span>
          ) : null}
        </div>
        <Link
          to="/workspace/app/notifications"
          className="text-[12px] font-medium tracking-[0.4px] text-[#ED351D] hover:underline"
        >
          View all notifications
        </Link>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-start gap-3">
              <div className="mt-1.5 size-2 shrink-0 rounded-full bg-[#E2E5E9]" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/5 rounded bg-[#E2E5E9]" />
                <div className="h-3 w-3/4 rounded bg-[#E2E5E9]" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6">
          <p className="text-[13px] tracking-[0.4px] text-[#5C6470]">
            No tracking updates yet.
          </p>
          <p className="mt-1 text-[12px] leading-snug tracking-[0.4px] text-[#8E95A1]">
            Every location the Tracking team logs — and every gate departure or return — appears here
            the moment it happens, so you can follow a truck without leaving this board.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((n) => {
            const trip = resolveTrackingTrip(n, trips);
            const stamp = trackingUpdateStamp(n);
            // The dispatch this update names, whether or not we could resolve it
            // to a live trip — an unroutable reference still has to be readable.
            const named = dispatchIdIn(`${n.title || ""} ${n.body || ""}`);
            const shown = trip ? displayDispatchId(trip) : named;
            return (
              <li
                key={n.id}
                className={cn(
                  "flex gap-3 border-b border-[#E2E5E9]/60 px-4 py-3 last:border-b-0",
                  !n.read && "bg-[#F4F9FF]",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info,
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] font-medium leading-tight tracking-[0.4px] text-[#141A1F]">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tracking-[0.4px] text-[#8E95A1]">
                      {formatTimeAgo(stamp)}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-snug tracking-[0.4px] text-[#5C6470]">{n.body}</p>
                  {trip ? (
                    <Link
                      to="/workspace/app/active-dispatch/$dispatchId"
                      params={{ dispatchId: trip.id }}
                      className="mt-1 inline-flex w-fit items-center gap-1 text-[11.5px] font-semibold tracking-[0.5px] text-[#ED351D] hover:underline"
                    >
                      Open {shown}
                      <ArrowUpRight className="size-3.5" strokeWidth={2} />
                    </Link>
                  ) : shown ? (
                    // Named on the truck but no matching live dispatch (a swap, or
                    // the trip already closed) — say so instead of dropping the ID.
                    <span className="mt-1 w-fit text-[11.5px] font-semibold tracking-[0.5px] text-[#8E95A1]">
                      {shown}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
