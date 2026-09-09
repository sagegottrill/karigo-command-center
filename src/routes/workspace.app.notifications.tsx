import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/notifications")({
  loader: () => notificationService.list(),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Diesel", "Engineering", "Parts & Store", "Accounts", "HR", "Security", "Driver", "Customer Portals (External)"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Notifications | FleetOpsX" },
      { name: "description", content: "Operations, approvals, compliance, engineering and security notifications in one categorised centre." },
    ],
  }),
  component: NotificationsPage,
});

const CATEGORIES = ["All", "Operations", "Approval", "Engineering"] as const;

function NotificationsPage() {
  const initialNotifications = Route.useLoaderData();
  const [items, setItems] = useState(initialNotifications);
  const [cat, setCat] = useState<string>("All");

  const rows = cat === "All" ? items : items.filter((n) => n.category === cat);
  const unreadCount = items.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-['Inter',sans-serif]">
      {/* Desktop Header */}
      <div className="hidden md:block w-full bg-white border-b border-[#e2e5e9] px-6 py-4">
        <div className="flex items-center justify-between max-w-[1400px] mx-auto">
          <div>
            <h1 className="text-xl font-bold text-[#141a1f]">Notification</h1>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Items that needs to be checked out categorized</p>
          </div>
          <button
            onClick={() => {
              void notificationService.markAllRead().then(() => {
                setItems(items.map((n) => ({ ...n, read: true })));
                toast.success("All notifications marked as read");
              });
            }}
            className="text-[13px] font-semibold text-[#141a1f] border border-[#e2e5e9] h-9 px-4 rounded-[6px] hover:bg-slate-50 transition-colors"
          >
            Mark all as Read
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 max-w-[1400px] mx-auto">
        {/* Mobile Header */}
        <div className="md:hidden mb-6">
          <h1 className="text-[22px] font-bold text-[#141a1f]">Notification Center</h1>
          <p className="text-[13px] text-slate-500 leading-snug mt-1.5">Items that need to be checked out categorized.</p>
          <button
            onClick={() => {
              void notificationService.markAllRead().then(() => {
                setItems(items.map((n) => ({ ...n, read: true })));
                toast.success("All notifications marked as read");
              });
            }}
            className="mt-4 text-[13px] font-semibold text-[#141a1f] border border-[#e2e5e9] h-9 px-4 rounded-[6px] bg-white hover:bg-slate-50 transition-colors"
          >
            Mark all as Read
          </button>
        </div>

        {/* Notification Card */}
        <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e2e5e9] overflow-hidden">
          {/* Card Header with Category Tabs */}
          <div className="p-4 md:p-5 border-b border-[#e2e5e9]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-bold text-[#141a1f]">Notification Center</h2>
                <span className="bg-[#ea3a3d] text-white text-[11px] font-bold h-6 px-2 rounded-[4px] flex items-center justify-center">
                  {unreadCount}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCat(c)}
                    className={cn(
                      "text-[12px] font-semibold px-3.5 py-1.5 rounded-[4px] transition-colors border",
                      cat === c
                        ? "bg-[#1B2432] text-white border-[#1B2432]"
                        : "bg-white text-[#5c6470] border-[#e2e5e9] hover:border-[#c1c5ca]"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notification Items */}
          <ul className="divide-y divide-[#f0f1f3]">
            {rows.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex items-start justify-between gap-4 px-4 md:px-5 py-4 transition-colors hover:bg-slate-50/60 cursor-pointer",
                  !n.read && "bg-white"
                )}
                onClick={() => {
                  if (!n.read) {
                    void notificationService.toggleRead(n.id).then(() => {
                      setItems(items.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                    });
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#141a1f]">{n.title}</p>
                  <p className="text-[13px] text-[#5c6470] mt-0.5">{n.body}</p>
                  <p className="text-[12px] text-[#9ca3af] mt-1">{n.time}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <span className={cn("text-[12px] font-medium", n.read ? "text-[#9ca3af]" : "text-[#141a1f]")}>
                    {n.read ? "Read" : "Unread"}
                  </span>
                  {!n.read && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ea3a3d]"></span>
                  )}
                </div>
              </li>
            ))}

            {rows.length === 0 && (
              <li className="px-5 py-12 text-center">
                <p className="text-[14px] text-[#9ca3af]">No notifications in this category.</p>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
