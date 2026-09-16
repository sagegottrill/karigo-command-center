import { useEffect, useRef, useState } from "react";
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
