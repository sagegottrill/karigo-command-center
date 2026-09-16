import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Extra hint rendered as grey text on the right (e.g. driver name). */
  hint?: string;
  disabled?: boolean;
}

/**
 * Type-to-search dropdown for long lists (100+ heads/tails/drivers).
 * Native selects force endless scrolling ("down down" stress); this renders a
 * filtered list that shrinks as the operator types. Keyboard friendly:
 * ↑/↓ move, Enter selects, Esc closes, type-ahead jumps. Click-outside closes.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  emptyText = "No match found",
  className,
  disabled,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  // Reset the filter + cursor each time the popover opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the highlighted option in view while arrowing.
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Close on outside click while the popover is open.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const commit = (option: SearchableSelectOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} data-open={open}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-sm border bg-white px-3 text-left text-sm",
          open ? "border-[#1B2432]" : "border-[#e2e5e9]",
        )}
      >
        <span className={cn("truncate", selected ? "text-[#141A1F]" : "text-[#9AA3AF]")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-[#5C6470]" strokeWidth={1.75} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[#E2E5E9] bg-white shadow-[0px_8px_24px_rgba(12,12,13,0.16)]">
          <div className="flex items-center gap-2 border-b border-[#E2E5E9] px-3 py-2">
            <Search className="size-4 shrink-0 text-[#9AA3AF]" strokeWidth={1.75} />
            <input
              ref={inputRef}
              className="h-6 w-full bg-transparent text-sm text-[#141A1F] placeholder:text-[#9AA3AF] focus:outline-none"
              placeholder="Type to filter…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  commit(matches[activeIndex]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
            />
          </div>
          <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-[#9AA3AF]">{emptyText}</li>
            )}
            {matches.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown so the input's blur never fires before the pick.
                    e.preventDefault();
                    commit(o);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                    i === activeIndex ? "bg-[#F1F2F4]" : "bg-white",
                  )}
                >
                  <span className="truncate text-[#141A1F]">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {o.hint && <span className="truncate text-[12px] text-[#9AA3AF]">{o.hint}</span>}
                    {o.value === value && <Check className="size-4 text-[#ED351D]" strokeWidth={2} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
