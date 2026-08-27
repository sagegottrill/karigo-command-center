import { MapPin, PlusCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type CustomerTab = "order" | "map" | "help";

interface CustomerBottomNavProps {
  activeTab: CustomerTab;
  onTabChange: (tab: CustomerTab) => void;
}

export function CustomerBottomNav({ activeTab, onTabChange }: CustomerBottomNavProps) {
  const tabs = [
    { id: "order", label: "Order", icon: PlusCircle },
    { id: "map", label: "Track", icon: MapPin },
    { id: "help", label: "Help", icon: HelpCircle },
  ] as const;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-16 border-t border-black/[0.05] bg-white pb-safe pt-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-1 flex-col items-center justify-center space-y-1 touch-manipulation"
          >
            <Icon
              className={cn("h-6 w-6 transition-colors", isActive ? "text-primary" : "text-muted-foreground")}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <span
              className={cn(
                "text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
