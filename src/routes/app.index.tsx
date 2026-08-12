import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle, ArrowUpRight, Ban, CheckCircle2, ClipboardCheck, Fuel,
  Plus, Route as RouteIcon, Truck, Users, Wrench,
} from "lucide-react";
import { MetricCard } from "@/components/karigo/metric-card";
import { PageHeader, SectionPanel } from "@/components/karigo/page-header";
import { LiveOperationsMap } from "@/components/karigo/live-map";
import { StatusBadge } from "@/components/karigo/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTIVITY, ALERTS, TRIPS } from "@/lib/karigo/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Command Center — Karigo TMS" },
      { name: "description", content: "Live operational state of the Petroline Transport fleet: trips, trucks, drivers, approvals and alerts." },
      { property: "og:title", content: "Command Center — Karigo TMS" },
      { property: "og:description", content: "Live operational state of the fleet: trips, trucks, drivers, approvals and alerts." },
    ],
  }),
  component: Dashboard,
});

const ALERT_STYLE = {
  Critical: { tone: "border-critical/40 bg-critical/10", icon: AlertTriangle, color: "text-critical" },
  Warning: { tone: "border-warning/40 bg-warning/10", icon: AlertTriangle, color: "text-warning" },
  Approval: { tone: "border-info/40 bg-info/10", icon: ClipboardCheck, color: "text-info" },
  System: { tone: "border-border bg-surface-raised", icon: Ban, color: "text-muted-foreground" },
} as const;

const TONE_DOT = {
  info: "bg-info", success: "bg-success", warning: "bg-warning", critical: "bg-critical",
} as const;

function Dashboard() {
  return (
    <>
      <PageHeader
        title="Command Center"
        description="Live operational state — Petroline Transport, 12 Aug 2026."
        meta={
          <>
            <StatusBadge status="Online" />
            <span className="num text-[11px] text-muted-foreground">Last sync 10:42:31 · Workspace PTL-001</span>
          </>
        }
        actions={
          <>
            <Tabs defaultValue="today">
              <TabsList className="h-8">
                {["today", "week", "month"].map((v) => (
                  <TabsTrigger key={v} value={v} className="h-6 text-[11px] capitalize">{v}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
              <Link to="/app/dispatch"><Plus className="h-3.5 w-3.5" />Create Dispatch</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Active Trips" value={42} delta="+8.4%" deltaTone="up" hint="today" icon={RouteIcon} accent />
        <MetricCard label="Available Trucks" value={68} hint="12 under maintenance" icon={Truck} />
        <MetricCard label="Available Drivers" value={74} hint="6 unavailable" icon={Users} />
        <MetricCard label="Pending Approvals" value={18} delta="₦4.82M" deltaTone="neutral" hint="total exposure" icon={ClipboardCheck} />
        <MetricCard label="Fuel Allocation" value="8,420" unit="L" hint="issued today" icon={Fuel} />
        <MetricCard label="Maintenance Alerts" value={7} delta="3 critical" deltaTone="down" icon={Wrench} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionPanel
          title="Live Operations Map"
          description="26 assets transmitting · simulated telemetry"
          bodyClassName="p-3"
          actions={<StatusBadge status="En Route" />}
        >
          <LiveOperationsMap trips={TRIPS} />
        </SectionPanel>

        <div className="flex flex-col gap-5">
          <SectionPanel title="Critical Alerts" description="Exception-first queue" bodyClassName="space-y-2 p-3">
            {ALERTS.map((a) => {
              const s = ALERT_STYLE[a.level];
              return (
                <div key={a.id} className={cn("flex items-start gap-2.5 rounded-md border p-2.5", s.tone)}>
                  <s.icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug font-medium text-foreground">{a.message}</p>
                    <p className="num mt-0.5 text-[10px] text-muted-foreground">{a.level.toUpperCase()} · {a.reference}</p>
                  </div>
                </div>
              );
            })}
          </SectionPanel>

          <SectionPanel
            title="Operations Activity"
            description="Who · what · when · reference"
            bodyClassName="p-0"
            actions={<Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-[11px]"><Link to="/app/audit">Audit<ArrowUpRight className="h-3 w-3" /></Link></Button>}
          >
            <ul className="max-h-[360px] divide-y divide-border/60 overflow-y-auto">
              {ACTIVITY.map((e) => (
                <li key={e.id} className="flex gap-2.5 px-4 py-2.5">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[e.tone])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">
                      <span className="num font-semibold">{e.reference}</span> — {e.action}
                    </p>
                    <p className="num mt-0.5 text-[10px] text-muted-foreground">
                      {e.time} · {e.user} · {e.module}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {[
          { title: "Dispatch a trip", body: "Assign truck, driver and route in five guided steps.", to: "/app/dispatch", icon: RouteIcon },
          { title: "Approve expenses", body: "18 requests pending across three approval levels.", to: "/app/accounts", icon: CheckCircle2 },
          { title: "Workshop queue", body: "27 work orders — 3 critical repairs in progress.", to: "/app/engineering", icon: Wrench },
        ].map((c) => (
          <Link
            key={c.title}
            to={c.to}
            className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/45"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
              <c.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.body}</p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </>
  );
}
