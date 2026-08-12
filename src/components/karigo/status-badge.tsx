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
  success: "border-success/35 bg-success/12 text-success",
  info: "border-info/35 bg-info/12 text-info",
  warning: "border-warning/35 bg-warning/12 text-warning",
  critical: "border-critical/40 bg-critical/15 text-critical",
  neutral: "border-border bg-muted/60 text-muted-foreground",
  primary: "border-primary/40 bg-primary/12 text-primary",
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
        TONE_CLASS[resolved],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {status}
    </span>
  );
}
