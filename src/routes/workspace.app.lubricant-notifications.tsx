import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { authService, lubricantService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import type { LubricantFeedItem } from "@/lib/fleetopsx/lubricant";
import { relativeTime, SeverityDot } from "@/components/fleetopsx/lubricant-ui";
import { cn } from "@/lib/utils";

const ALLOWED = [
  "Lubricant",
  "Lubricant Manager",
  "Lubricant Operations",
  "Inventory",
  "Fuel Manager",
  "Fleet Operations",
  "Transport Manager",
  "Platform Admin",
];

export const Route = createFileRoute("/workspace/app/lubricant-notifications")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Notification | FleetOpsX" },
      { name: "description", content: "Tanks running low, trucks waiting for lubricant, and what was dispensed." },
    ],
  }),
  component: LubricantNotificationsPage,
});

function LubricantNotificationsPage() {
  const [feed, setFeed] = useState<LubricantFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      setFeed(await lubricantService.notifications());
    } catch (err) {
      if (loading) toast.error(err instanceof Error ? err.message : "Failed to load the notifications.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useAutoRefresh(() => void refresh(), []);

  const attention = feed.filter((f) => f.severity === "warning" || f.severity === "error" || f.kind === "request").length;

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Notification
        </h2>
        <p className="text-[12px] uppercase tracking-[0.4px] text-[#5C6470] md:text-[11.4px] md:text-[rgba(92,100,112,0.6)]">
          Items that needs to be checked out categorized
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-4 shadow-[0px_4px_16px_rgba(12,12,13,0.05)] md:p-5">
        <div className="flex items-center gap-3">
          <h3 className="text-[17px] font-semibold tracking-[0.4px] text-[#1B2432]">Notification Center</h3>
          {attention > 0 && (
            <span className="grid h-6 min-w-6 place-items-center rounded-[10px] bg-[#ED351D] px-1.5 text-[12px] font-medium text-white">
              {attention}
            </span>
          )}
        </div>

        {loading && feed.length === 0 ? (
          <p className="py-8 text-center text-[13.5px] text-[#5C6470]">Loading notifications…</p>
        ) : feed.length === 0 ? (
          <p className="py-8 text-center text-[13.5px] text-[#5C6470]">
            Nothing needs attention. Tanks are above their minimum and no truck is waiting for lubricant.
          </p>
        ) : (
          <div className="flex flex-col">
            {feed.map((item) => (
              <div
                key={item.id}
                role={item.kind === "request" ? "button" : undefined}
                tabIndex={item.kind === "request" ? 0 : undefined}
                onClick={item.kind === "request" ? () => void navigate({ to: "/workspace/app/lubricant-disbursal" }) : undefined}
                onKeyDown={
                  item.kind === "request"
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") void navigate({ to: "/workspace/app/lubricant-disbursal" });
                      }
                    : undefined
                }
                className={cn(
                  "flex items-start gap-3 border-b border-[#E2E5E9] px-1 py-3.5 last:border-b-0",
                  item.kind === "request" && "cursor-pointer hover:bg-[#F7F8F9]",
                )}
              >
                <SeverityDot severity={item.severity} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14px] font-medium tracking-[0.4px] text-[#141A1F]">{item.title}</span>
                  <span className="truncate text-[12.5px] tracking-[0.4px] text-[#5C6470]">{item.body}</span>
                  <span className="text-[11.5px] tracking-[0.4px] text-[#9AA1AC]">{relativeTime(item.at)}</span>
                </div>
                {item.kind === "request" && (
                  <span className="shrink-0 self-center rounded border border-[#ED351D] px-3 py-1.5 text-[12.5px] font-medium text-[#ED351D]">
                    Log
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
