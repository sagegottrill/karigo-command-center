import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
  hint?: React.ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] p-[16px] shadow-[0px_4px_24px_rgba(0,0,0,0.04)] overflow-hidden",
        accent && "bg-[#f6f7f9]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-[500] tracking-[0.05em] text-[#8e95a1] uppercase">{label}</p>
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0 text-[#8e95a1] transition-colors group-hover:text-[#141a1f]"
            strokeWidth={1.75}
          />
        )}
      </div>
      <div className="mt-[12px] flex items-baseline gap-1.5">
        <span className="num max-w-full truncate text-[28px] leading-none font-[600] text-[#141a1f]">{value}</span>
        {unit && <span className="text-[14px] font-[500] text-[#5c6470]">{unit}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[12px] font-semibold",
              deltaTone === "up" && "text-[#34c759]",
              deltaTone === "down" && "text-[#ff3b30]",
              deltaTone === "neutral" && "text-muted-foreground",
            )}
          >
            {delta}
            {deltaTone === "up" && <ArrowUpRight className="h-3.5 w-3.5" />}
            {deltaTone === "down" && <ArrowDownRight className="h-3.5 w-3.5" />}
          </span>
        )}
        {hint && <span className="text-[12px] font-[400] text-[#5c6470]">{hint}</span>}
      </div>
    </div>
  );
}
