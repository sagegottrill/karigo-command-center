import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wave-style collapse control: a small circular chevron that sits half off
 * the sidebar's right edge. Expanded it points left (collapse); collapsed it
 * points right (expand). Desktop only — on mobile the sidebar is an
 * off-canvas drawer already driven by the header's panel button.
 */
export function SidebarCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
      className={cn(
        "absolute -right-3 top-1/2 z-50 hidden h-6 w-6 -translate-y-1/2 items-center justify-center",
        "rounded-full border border-[#E4E7EC] bg-white text-[#5C6470]",
        "shadow-[0px_1px_3px_rgba(16,24,40,0.12)] transition-colors",
        "hover:bg-[#F1F2F4] hover:text-[#1B2432] md:flex",
      )}
    >
      {collapsed ? (
        <ChevronRight className="size-3.5" strokeWidth={2} />
      ) : (
        <ChevronLeft className="size-3.5" strokeWidth={2} />
      )}
    </button>
  );
}
