import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "warning" | "critical" | "neutral" | "primary";

/**
 * Internal road-states the client asked to keep off-screen: a truck coming back
 * (Returning) or being unloaded (Offloading) still reads as "In Transit" — the
 * lifecycle detail lives in Trip/Return history, not in the status label.
 */
const HIDDEN_STATUS_LABEL: Record<string, string> = {
  Returning: "In Transit",
  Offloading: "In Transit",
};

export function displayStatusLabel(status: string): string {
  return HIDDEN_STATUS_LABEL[status] ?? status;
}

const TONE_MAP: Record<string, Tone> = {
  Active: "success",
  Available: "success",
  Approved: "success",
  Completed: "success",
  Valid: "success",
  "In Stock": "success",
  Released: "success",
  Online: "success",
  "En Route": "primary",
  "In Transit": "primary",
  // Fleet asset state (FO bookkeeping) — never a dispatch/customer state.
  "Out of Yard": "primary",
  Assigned: "primary",
  "On Trip": "primary",
  Loaded: "info",
  Offloading: "info",
  Returning: "info",
  Scheduled: "info",
  Diagnosing: "info",
  Testing: "info",
  Incoming: "info",
  Outgoing: "neutral",
  Reported: "warning",
  Pending: "warning",
  Delayed: "warning",
  Stopped: "warning",
  Maintenance: "warning",
  "Low Stock": "warning",
  "Expiring Soon": "warning",
  "Awaiting Parts": "warning",
  Clarification: "warning",
  Repairing: "warning",
  High: "warning",
  Medium: "info",
  Low: "neutral",
  Normal: "neutral",
  "Off Duty": "neutral",
  Invited: "neutral",
  Rejected: "critical",
  Critical: "critical",
  Expired: "critical",
  Suspended: "critical",
  "Out of Stock": "critical",
  "Out of Service": "critical",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-[#34c759]/12 text-[#248a3d]",
  info: "bg-[#64d2ff]/18 text-[#0077a8]",
  warning: "bg-[#ff9f0a]/16 text-[#9a6700]",
  critical: "bg-[#ff3b30]/12 text-[#d70015]",
  neutral: "bg-black/[0.05] text-[#6e6e73]",
  primary: "bg-[#1d1d1f]/10 text-[#1d1d1f]",
};

export function StatusBadge({
  status: rawStatus,
  tone,
  dot = true,
  className,
}: {
  status: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  const status = displayStatusLabel(rawStatus);
  const resolved = tone ?? TONE_MAP[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em]",
        TONE_CLASS[resolved],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {status}
    </span>
  );
}
