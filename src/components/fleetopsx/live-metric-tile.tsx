import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE, type TileTone } from "./dashboard-drill";

/**
 * The Live Operations metric tile.
 *
 * Every card on the redesigned dashboard is this one component — the Figma's
 * cards differ only in tone, icon, whether they carry a detail block and
 * whether they carry the Heads/Tails split, so a single component is what keeps
 * a green AVAILABLE card and a red ACCIDENT card identical in every other
 * respect.
 */
export function LiveMetricTile({
  label,
  value,
  hint,
  hintTone = "grey",
  tone = "grey",
  icon: Icon,
  detail,
  split,
  onClick,
  hasDrill,
  className,
  valueClass,
}: {
  label: string;
  value: number | string;
  hint?: string;
  /** Tone of the hint text only (e.g. "Instant Assignment" in green). */
  hintTone?: TileTone;
  tone?: TileTone;
  icon?: LucideIcon;
  /** Rows or a mini grid under the hairline (breakdown / daily cost). */
  detail?: React.ReactNode;
  /**
   * `Heads: n / Tails: n` — the All-Fleet split under the number. A string is
   * allowed so an unread roster draws "—" instead of a false zero.
   */
  split?: { aLabel: string; aValue: number | string; bLabel: string; bValue: number | string };
  onClick?: () => void;
  hasDrill?: boolean;
  className?: string;
  valueClass?: string;
}) {
  const t = TONE[tone];
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group relative flex min-w-0 flex-col rounded-[10px] border bg-white p-[15px] text-left",
        "shadow-[0px_4px_16px_-8px_rgba(12,12,13,0.12),0px_4px_4px_-4px_rgba(12,12,13,0.06)]",
        onClick && "transition-shadow hover:shadow-[0px_8px_24px_-10px_rgba(12,12,13,0.22)]",
        className,
      )}
      style={{ borderColor: t.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.6px] text-[#5C6470]">
          {label}
        </span>
        {Icon ? (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-[6px]"
            style={{ backgroundColor: t.chipBg }}
          >
            <Icon className="size-[15px]" strokeWidth={1.8} style={{ color: t.text }} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn(
            "font-['Space_Grotesk',sans-serif] text-[34px] font-bold leading-none tracking-[-0.5px] text-[#1B2432]",
            valueClass,
          )}
        >
          {value}
        </span>
        {hint ? (
          <span
            className="min-w-0 truncate text-[11px] font-medium leading-4"
            style={{ color: TONE[hintTone].text }}
          >
            {hint}
          </span>
        ) : null}
        {hasDrill ? (
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-[#B7BDC7] transition-colors group-hover:text-[#5C6470]" />
        ) : null}
      </div>

      <div className="mt-2.5 h-px w-full" style={{ backgroundColor: t.line }} />

      {split ? (
        <div className="mt-2.5 grid grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium leading-4 text-[#5C6470]">{split.aLabel}</span>
            <span className="font-['Space_Grotesk',sans-serif] text-[15px] font-bold leading-none text-[#1B2432]">
              {split.aValue}
            </span>
          </div>
          <div
            className="flex flex-col gap-1 border-l pl-3"
            style={{ borderColor: "rgba(92,100,112,0.25)" }}
          >
            <span className="text-[10px] font-medium leading-4 text-[#5C6470]">{split.bLabel}</span>
            <span className="font-['Space_Grotesk',sans-serif] text-[15px] font-bold leading-none text-[#1B2432]">
              {split.bValue}
            </span>
          </div>
        </div>
      ) : null}

      {detail ? <div className="mt-2.5">{detail}</div> : null}
    </Comp>
  );
}

/** `Pending: 3` — the breakdown rows inside the Total Requests tile. */
export function TileDetailRows({
  rows,
}: {
  rows: { label: string; value: number | string; tone: TileTone }[];
}) {
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={cn(
            "flex items-center justify-between gap-3 py-[5px] text-[11px]",
            i > 0 && "border-t border-[#EFF0F2]",
          )}
        >
          <span className="font-normal text-[#5C6470]">{row.label}</span>
          <span className="font-semibold tabular-nums" style={{ color: TONE[row.tone].text }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The three-column Daily Direct Cost / Diesel / Gas block in the Dispatched tile. */
export function TileCostColumns({
  columns,
}: {
  columns: { label: string; value: string; sub?: string; tone: TileTone }[];
}) {
  return (
    <div className="grid grid-cols-3">
      {columns.map((col, i) => (
        <div
          key={col.label}
          className={cn("flex min-w-0 flex-col gap-0.5", i > 0 && "border-l border-[#EFF0F2] pl-2.5")}
        >
          <span className="truncate text-[10px] font-normal leading-4 text-[#5C6470]">{col.label}</span>
          <span
            className="font-['Space_Grotesk',sans-serif] truncate text-[13px] font-bold leading-4"
            style={{ color: TONE[col.tone].text }}
          >
            {col.value}
          </span>
          {col.sub ? (
            <span className="truncate text-[10px] font-normal leading-4 text-[#8E95A1]">{col.sub}</span>
          ) : null}
          <span className="mt-1 h-px w-full" style={{ backgroundColor: TONE[col.tone].line }} />
        </div>
      ))}
    </div>
  );
}
