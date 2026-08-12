import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  hint,
  icon: Icon,
  accent = false,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  hint?: string;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40",
        accent && "border-primary/35 bg-primary/[0.06]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-3xl leading-none font-semibold text-foreground">{value}</span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {delta && (
          <span
            className={cn(
              "num text-[11px] font-semibold",
              deltaTone === "up" && "text-success",
              deltaTone === "down" && "text-critical",
              deltaTone === "neutral" && "text-muted-foreground",
            )}
          >
            {delta}
          </span>
        )}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
