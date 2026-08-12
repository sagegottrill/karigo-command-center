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
        "group relative overflow-hidden rounded-2xl border border-border/80 bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]",
        accent && "border-primary/20 bg-primary/[0.04]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/80 group-hover:text-primary" />}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-[28px] leading-none font-semibold tracking-[-0.03em] text-foreground">{value}</span>
        {unit && <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>}
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
    </div>
  );
}
