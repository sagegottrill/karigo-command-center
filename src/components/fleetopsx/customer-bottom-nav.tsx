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
    { id: "help", label: "Support", icon: HelpCircle },
  ] as const;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-[90%] max-w-sm h-[68px] items-center justify-around rounded-[34px] border border-slate-200/60 bg-white/90 backdrop-blur-2xl shadow-xl pb-safe-offset">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="group relative flex flex-1 flex-col items-center justify-center space-y-1 h-full touch-manipulation"
          >
            {/* Active Indicator Glow */}
            {isActive && (
              <div className="absolute top-0 h-1 w-8 rounded-b-full bg-slate-900 opacity-80" />
            )}
            <Icon
              className={cn(
                "h-[22px] w-[22px] transition-all duration-300",
                isActive ? "text-slate-900 scale-110" : "text-slate-400 scale-100"
              )}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <span
              className={cn(
                "text-[10px] font-semibold tracking-wide transition-colors duration-300",
                isActive ? "text-slate-900" : "text-slate-400"
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
