import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The filter control next to the search bar, shared by every table page.
 *
 * It is a BOX THAT NAMES THE FILTER with a drop-down arrow — not a bare icon.
 * Two unlabelled red squares sat side by side looking like one control, and
 * nothing on screen said which filter was on or what either box filtered by,
 * so the pair read as a single confusing button.
 *
 * Closing outside the menu is done with a document `mousedown` listener, NOT a
 * full-screen backdrop. The old backdrop swallowed the first click anywhere on
 * the page while the menu was open: clicking the search box just dismissed the
 * menu without focusing the field, so the next keystrokes went nowhere and the
 * search read as broken. A listener closes the menu on the same click that then
 * lands — and focuses — whatever was actually clicked.
 */
function useCloseOnOutsideClick(open: boolean, setOpen: (next: boolean) => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, setOpen]);
}
export function FilterButton<T extends string>({
  options,
  value,
  onChange,
  label,
  allLabel,
  allValue = "All" as T,
  noun = "status",
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Optional label override, e.g. (s) => s === "All" ? "All Statuses" : s. */
  label?: (option: T) => string;
  /** What the box reads while nothing is filtered — e.g. "All Statuses". */
  allLabel?: string;
  /** The option that means "no filter" — every caller puts "All" first. */
  allValue?: T;
  /** What is being filtered, for screen readers: "status", "company". */
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(open, setOpen, wrapRef);

  const describe = (option: T) => (label ? label(option) : option);
  const isAll = value === allValue;
  const shown = isAll ? (allLabel ?? describe(allValue)) : describe(value);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 rounded border bg-white px-3 text-[13px] tracking-[0.4px] transition-colors hover:bg-[#F7F8F9]",
          isAll
            ? "border-[rgba(92,100,112,0.6)] text-[#141A1F]"
            : "border-[#ED351D] font-medium text-[#1B2432]",
        )}
        aria-label={`Filter by ${noun}`}
        aria-expanded={open}
      >
        <span className="max-w-[170px] truncate">{shown}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-[#5C6470] transition-transform", open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <>
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
 * Second filter — the same labelled box as FilterButton, but for a value a row
 * can hold several of (a partner company, a department): tick boxes instead of a
 * single choice, and the menu stays open so several boxes can be ticked in one
 * visit.
 *
 * An empty `selected` means NO filter, exactly like "All" in FilterButton. The box
 * always says what it is doing: one company reads as its name, several read as
 * "First +2" — a multi-filter that hides rows with nothing on screen saying why
 * is how a table reads as broken.
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
  useCloseOnOutsideClick(open, setOpen, wrapRef);

  const isFiltered = selected.length > 0;
  const shown =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected[0]} +${selected.length - 1}`;

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
          "flex h-9 shrink-0 items-center gap-2 rounded border bg-white px-3 text-[13px] tracking-[0.4px] transition-colors hover:bg-[#F7F8F9]",
          isFiltered
            ? "border-[#ED351D] font-medium text-[#1B2432]"
            : "border-[rgba(92,100,112,0.6)] text-[#141A1F]",
        )}
        aria-label={`Filter by ${noun}`}
        aria-expanded={open}
      >
        <span className="max-w-[170px] truncate">{shown}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-[#5C6470] transition-transform", open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <>
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
