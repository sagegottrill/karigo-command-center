import { useEffect, useMemo, useRef, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The red filter button next to the search bar, shared by every table page.
 * Opens a status-menu popover (fixed backdrop so stray re-renders can't eat
 * the click) and shows a ring while a non-"All" filter is active — the same
 * pattern as the Fleet Dispatch filter.
 */
export function FilterButton<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Optional label override, e.g. (s) => s === "All" ? "All Statuses" : s. */
  label?: (option: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const describe = (option: T) => (label ? label(option) : option);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid size-9 place-items-center rounded bg-[#ED351D] hover:bg-[#d62e19] text-white",
          value !== "All" && "ring-2 ring-[#1B2432] ring-offset-2",
        )}
        aria-label="Filter by status"
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 w-[190px] rounded border border-[#E2E5E9] bg-white py-1 shadow-[0px_4px_16px_rgba(0,0,0,0.15)]">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] tracking-[0.4px] text-[#141A1F] hover:bg-[#F1F2F4]"
              >
                <span className="w-4 shrink-0">
                  {value === option && <Check className="size-3.5 text-[#ED351D]" strokeWidth={2.5} />}
                </span>
                {describe(option)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Second filter button — the same red control as FilterButton, but for a value a
 * row can hold several of (a partner company, a department): tick boxes instead
 * of a single choice, and the menu stays open so several boxes can be ticked in
 * one visit.
 *
 * An empty `selected` means NO filter, exactly like "All" in FilterButton, so the
 * button only carries its ring once something is actually ticked — and the ring
 * count says how many, because a multi-filter that hides rows with no visible
 * reason is how a table reads as broken.
 */
export function CheckboxFilterButton<T extends string>({
  options,
  selected,
  onChange,
  allLabel,
  emptyLabel = "Nothing to filter yet",
  noun = "filter",
}: {
  options: readonly T[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** The "no filter" row, e.g. "All companies". */
  allLabel: string;
  /** Shown in place of the list when there is nothing to tick yet. */
  emptyLabel?: string;
  /** What is being filtered, for screen readers: "company", "department". */
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chosen = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (option: T) => {
    const next = new Set(chosen);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    // Keep the caller's own option order, so the CSV/filter state never depends
    // on the order boxes were ticked in.
    onChange(options.filter((o) => next.has(o)));
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative grid size-9 place-items-center rounded bg-[#ED351D] hover:bg-[#d62e19] text-white",
          selected.length > 0 && "ring-2 ring-[#1B2432] ring-offset-2",
        )}
        aria-label={`Filter by ${noun}`}
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        {selected.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full bg-[#1B2432] px-1 text-[10px] font-semibold leading-4 text-white">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-50 mt-1 max-h-[320px] w-[230px] overflow-y-auto rounded border border-[#E2E5E9] bg-white py-1 shadow-[0px_4px_16px_rgba(0,0,0,0.15)]">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium tracking-[0.4px] text-[#141A1F] hover:bg-[#F1F2F4]"
            >
              <Box checked={selected.length === 0} />
              {allLabel}
            </button>
            <div className="my-1 border-t border-[#E2E5E9]" />
            {options.length === 0 && (
              <p className="px-3 py-2 text-[13px] tracking-[0.4px] text-[#5C6470]">{emptyLabel}</p>
            )}
            {options.map((option) => (
              <button
                key={option}
                type="button"
                // Multi-select: ticking one box must not close the menu, or the
                // second company can never be ticked.
                onClick={() => toggle(option)}
                aria-pressed={chosen.has(option)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] tracking-[0.4px] text-[#141A1F] hover:bg-[#F1F2F4]"
              >
                <Box checked={chosen.has(option)} />
                <span className="truncate" title={option}>
                  {option}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A tick box that reads as a box (not a bare tick) so an empty list is visible. */
function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[3px] border",
        checked ? "border-[#ED351D] bg-[#ED351D]" : "border-[#8C97A6] bg-white",
      )}
    >
      {checked && <Check className="size-3 text-white" strokeWidth={3} />}
    </span>
  );
}
