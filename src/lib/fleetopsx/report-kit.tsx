import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { inPeriod, periodRange, reportWindow, type PeriodRange } from "@/lib/fleetopsx/period";
import { cn } from "@/lib/utils";

/**
 * The filter kit every report table shares — one custom-range control, one
 * window resolver, one summary bar.
 *
 * Filters were per-module hand-rolls that drifted: the lubricant board grew a
 * period select the rest of the app never heard of, and no table could answer
 * "1 – 15 Sept". This module is the whole vocabulary now:
 *
 *  - PERIOD_OPTIONS — the words, ending in the custom range.
 *  - resolvePeriod  — option words → a real window (null = all time).
 *  - inWindow       — does a stamp belong to the selection?
 *  - useCustomRange — the date-pair picker state the Custom option opens.
 *  - SummaryBar     — the Excel-style totals strip every table prints at its
 *    foot: module-specific figures over the FILTERED rows, not all rows, so
 *    the numbers always reconcile with what is on the screen.
 */

export const PERIOD_OPTIONS = [
  "All time",
  "Today",
  "One week",
  "Two weeks",
  "One month",
  "Custom",
] as const;

export type PeriodOption = (typeof PERIOD_OPTIONS)[number];

export type CustomRange = { from: string; to: string };

/** The window one option resolves to — null means all time. */
export function resolvePeriod(
  period: string,
  custom: CustomRange | null,
  now = new Date(),
): PeriodRange | null {
  if (period === "Custom") {
    if (!custom?.from && !custom?.to) return null;
    return periodRange("custom", now, custom.from, custom.to);
  }
  return reportWindow(period, now);
}

/** Is this stamp inside the selection? An all-time selection is inside always. */
export function inWindow(
  value: string | Date | null | undefined,
  window: PeriodRange | null,
): boolean {
  if (!window) return true;
  return inPeriod(value, window);
}

/** The human words for what is selected — "Two weeks" or "1 – 15 Sept 2026". */
export function windowLabel(period: string, window: PeriodRange | null): string {
  if (period === "All time" || !window) return "All time";
  if (period === "Custom") return window.label;
  return `${period} · ${window.label}`;
}

/** The date-pair state behind the Custom option. */
export function useCustomRange(initial?: Partial<CustomRange>) {
  const [custom, setCustom] = useState<CustomRange>({
    from: initial?.from ?? "",
    to: initial?.to ?? "",
  });
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<CustomRange>) => setCustom((c) => ({ ...c, ...patch }));
  const clear = () => {
    setCustom({ from: "", to: "" });
    setOpen(false);
  };
  return { custom, set, clear, open, setOpen };
}

/**
 * The Custom option's popover: two date inputs and the words it resolved to.
 * Rendered by each table's PeriodFilter so the control never leaves the header.
 */
export function CustomRangePicker({
  custom,
  onSet,
  onClear,
}: {
  custom: CustomRange;
  onSet: (patch: Partial<CustomRange>) => void;
  onClear: () => void;
}) {
  const label =
    custom.from && custom.to
      ? windowLabel("Custom", resolvePeriod("Custom", custom))
      : custom.from
        ? `From ${custom.from}`
        : "Pick both dates";
  return (
    <div className="absolute right-0 z-30 mt-2 w-[240px] rounded-[8px] border border-[#E2E5E9] bg-white p-3 shadow-[0px_12px_32px_rgba(12,12,13,0.18)]">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
        {label}
      </span>
      <label className="mb-2 flex items-center justify-between gap-2 text-[12.5px] text-[#344256]">
        From
        <input
          type="date"
          value={custom.from}
          onChange={(e) => onSet({ from: e.target.value })}
          className="h-8 rounded border border-[#E2E5E9] px-2 text-[12.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
        />
      </label>
      <label className="mb-3 flex items-center justify-between gap-2 text-[12.5px] text-[#344256]">
        To
        <input
          type="date"
          value={custom.to}
          onChange={(e) => onSet({ to: e.target.value })}
          className="h-8 rounded border border-[#E2E5E9] px-2 text-[12.5px] text-[#1B2432] outline-none focus:border-[#1B2432]"
        />
      </label>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] font-medium text-[#5C6470] hover:text-[#1B2432]"
        >
          Clear
        </button>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.4px]",
            custom.from && custom.to ? "text-emerald-600" : "text-[#9CA3AF]",
          )}
        >
          {custom.from && custom.to ? "Applied" : "Open range"}
        </span>
      </div>
    </div>
  );
}

/**
 * The period select itself: the shared presets plus Custom, which opens the
 * date-pair popover. Controlled by the table's own state.
 */
export function PeriodFilter({
  value,
  onChange,
  custom,
  customOpen,
  onToggleCustom,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  custom: CustomRange;
  customOpen: boolean;
  onToggleCustom: (open: boolean) => void;
  /** Rendered when Custom is picked — the date-pair popover. */
  children?: React.ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (next === "Custom") onToggleCustom(true);
        }}
        aria-label="Filter by period"
        className={cn(
          "h-10 rounded-[6px] border bg-white px-3 text-[13.5px] text-[#1B2432] outline-none focus:border-[#1B2432]",
          value === "Custom" ? "border-[#ED351D]" : "border-[#E2E5E9]",
        )}
      >
        {PERIOD_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {value === "Custom" && customOpen ? (
        <>
          <button
            type="button"
            aria-label="Close custom range"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => onToggleCustom(false)}
          />
          {children}
        </>
      ) : null}
    </div>
  );
}

/**
 * The Excel-style footer every report table prints: labelled totals over the
 * FILTERED rows — the numbers reconcile with the screen or they are wrong.
 */
export function SummaryBar({
  items,
  className,
}: {
  items: Array<{ label: string; value: string; strong?: boolean }>;
  className?: string;
}) {
  const printable = useMemo(() => items.filter((i) => i.value), [items]);
  if (printable.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[6px] bg-[#F1F2F4] px-4 py-3",
        className,
      )}
    >
      <CalendarDays className="size-3.5 shrink-0 text-[#9CA3AF]" />
      {printable.map((i) => (
        <span key={i.label} className="text-[12.5px] tracking-[0.4px] text-[#5C6470]">
          {i.label}:{" "}
          <span
            className={cn(
              "tabular-nums",
              i.strong === false ? "font-normal" : "font-semibold text-[#1B2432]",
            )}
          >
            {i.value}
          </span>
        </span>
      ))}
    </div>
  );
}
