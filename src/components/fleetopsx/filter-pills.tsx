import { cn } from "@/lib/utils";

/** Dashboard-matching filter pills — active = near-black. */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[] | T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-[4px] px-3.5 py-1.5 text-[12px] font-medium transition-colors duration-150",
            value === opt
              ? "bg-[#1d1d1f] text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
              : "bg-black/[0.04] text-muted-foreground hover:bg-black/[0.07] hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
