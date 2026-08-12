import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { appleSpring } from "@/lib/karigo/apple-motion";

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
  const reduce = useReducedMotion();

  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={appleSpring.press}
      className={cn(
        "group relative overflow-hidden rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.035)]",
        accent && "ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
            strokeWidth={1.75}
          />
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="num text-[28px] leading-none font-semibold tracking-[-0.04em] text-foreground">{value}</span>
        {unit && <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>}
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
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
    </motion.div>
  );
}
