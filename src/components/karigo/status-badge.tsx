import { cn } from "@/lib/utils";

type Tone = "success" | "info" | "warning" | "critical" | "neutral" | "primary";

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
  success: "border-success/20 bg-success/10 text-success",
  info: "border-info/20 bg-info/10 text-info",
  warning: "border-warning/25 bg-warning/15 text-warning-foreground",
  critical: "border-critical/20 bg-critical/10 text-critical",
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/20 bg-primary/10 text-primary",
};

export function StatusBadge({
  status,
  tone,
  dot = true,
  className,
}: {
  status: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  const resolved = tone ?? TONE_MAP[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em]",
        TONE_CLASS[resolved],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {status}
    </span>
  );
}
