import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fixed-height chart host so Recharts never collapses / squashes. */
export function ChartFrame({
  children,
  className,
  height = 280,
}: {
  children: ReactNode;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height, minHeight: height }}>
      {children}
    </div>
  );
}
