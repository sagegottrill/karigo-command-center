import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  /** Red text for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

/**
 * Viewport-aware row action menu (the table 3-dots).
 *
 * Renders in a portal at document level so NO ancestor — scroll container,
 * overflow clip, table row, z-stack — can cut it off. Measures the trigger on
 * open and flips above the row when there isn't room below (bottom rows no
 * longer require scrolling); clamps horizontally to the viewport. Closes on
 * outside pointer-down, Escape, resize and scroll.
 */
export function RowActionMenu({
  items,
  open,
  onOpenChange,
  align = "right",
  label = "Options",
  width = 190,
}: {
  items: RowMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "right" | "left";
  label?: string;
  width?: number;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const visible = items.filter((i) => !i.hidden);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Flip above when the panel would spill past the bottom and there is
      // more room above than below — the "scroll to see the menu" killer.
      let top: number;
      if (panelH && spaceBelow < panelH + 8 && spaceAbove > spaceBelow) {
        top = Math.max(8, rect.top - panelH - 6);
      } else {
        top = rect.bottom + 6;
      }
      const left =
        align === "right"
          ? Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
          : Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place); // re-measure once panel height is known
    const close = () => onOpenChange(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, align, width, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-5 shrink-0 place-items-center text-[#1B2432]"
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical className="size-5" strokeWidth={1.75} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[100] rounded-[6px] bg-white py-2.5 shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)]"
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn(
                  "flex h-9 w-full items-center px-3 text-left text-[14px] font-medium tracking-[0.4px] hover:bg-[#F1F2F4]",
                  item.danger ? "text-[#ED351D]" : "text-[#344256]",
                  item.disabled && "cursor-not-allowed opacity-50",
                )}
                onClick={() => {
                  onOpenChange(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
