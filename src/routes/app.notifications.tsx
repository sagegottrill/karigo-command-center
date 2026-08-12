import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/karigo/filter-pills";
import { NOTIFICATIONS } from "@/lib/karigo/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | Karigo" },
      { name: "description", content: "Operations, approvals, compliance, engineering and security notifications in one categorised centre." },
      { property: "og:title", content: "Notifications | Karigo" },
      { property: "og:description", content: "Categorised operational notification centre for the Karigo workspace." },
    ],
  }),
  component: NotificationsPage,
});

const CATEGORIES = ["All", "Operations", "Approvals", "Compliance", "Engineering", "Security", "System"] as const;

function NotificationsPage() {
  const [items, setItems] = useState(NOTIFICATIONS);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const rows = cat === "All" ? items : items.filter((n) => n.category === cat);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Items that need a look, grouped by area."
        actions={
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setItems(items.map((n) => ({ ...n, read: true }))); toast.success("All notifications marked as read"); }}>
            Mark all read
          </Button>
        }
      />
      <SectionPanel
        title="Notification Centre"
        description={`${rows.length} notifications`}
        bodyClassName="p-0"
        actions={<FilterPills options={CATEGORIES} value={cat} onChange={setCat} />}
      >
        <ul className="divide-y divide-border/60">
          {rows.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-black/[0.03]")}>
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.severity === "critical" ? "bg-critical" : n.severity === "warning" ? "bg-warning" : n.severity === "success" ? "bg-success" : "bg-info")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-foreground">{n.title}</p>
                  <StatusBadge status={n.category} dot={false} tone="neutral" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                <p className="num mt-1 text-[10px] text-muted-foreground">{n.time}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 shrink-0 text-[11px]" onClick={() => setItems(items.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)))}>
                {n.read ? "Unread" : "Read"}
              </Button>
            </li>
          ))}
        </ul>
      </SectionPanel>
    </>
  );
}
