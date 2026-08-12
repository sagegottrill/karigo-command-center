import type { LucideIcon } from "lucide-react";
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
        "group relative overflow-hidden rounded-[18px] border border-black/[0.06] bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.03)]",
        accent && "border-primary/15 bg-[linear-gradient(180deg,rgba(0,113,227,0.06),rgba(255,255,255,0.9))]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label-sm">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary" strokeWidth={1.75} />}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-[28px] leading-none font-semibold tracking-[-0.035em] text-foreground">{value}</span>
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
    </motion.div>
  );
}
