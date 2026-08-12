import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/karigo/page-header";
import { StatusBadge } from "@/components/karigo/status-badge";
import { MetricCard } from "@/components/karigo/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRIPS, CONVERSATIONS } from "@/lib/karigo/mock-data";
import { tripService } from "@/lib/karigo/services";
import type { Message } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/trips/$tripId")({
  head: ({ params }) => ({
    meta: [
      { title: `Trip ${params.tripId} — Karigo TMS` },
      { name: "description", content: `Execution detail, timeline and operations thread for trip ${params.tripId}.` },
      { property: "og:title", content: `Trip ${params.tripId} — Karigo TMS` },
      { property: "og:description", content: `Execution detail, timeline and operations thread for trip ${params.tripId}.` },
    ],
  }),
  loader: ({ params }) => {
    const trip = TRIPS.find((t) => t.id === params.tripId);
    if (!trip) throw notFound();
    return { trip };
  },
  component: TripDetail,
});

function TripDetail() {
  const { trip } = Route.useLoaderData();
  const timeline = tripService.timeline(trip);
  const thread = CONVERSATIONS.find((c) => c.tripId === trip.id) ?? CONVERSATIONS[0]!;
  const [messages, setMessages] = useState<Message[]>(thread.messages);
  const [draft, setDraft] = useState("");

  const send = () => {
    if (!draft.trim()) return;
    setMessages([...messages, { id: `m${messages.length + 1}`, author: "You", role: "Operations Admin", body: draft, time: "now", self: true }]);
    setDraft("");
    toast.success("Message sent to trip thread");
  };

  return (
    <>
      <PageHeader
        title={trip.id}
        description={`${trip.pickup} → ${trip.dropoff} · ${trip.customer}`}
        meta={<><StatusBadge status={trip.status} /><StatusBadge status={trip.priority} dot={false} /><span className="num text-[11px] text-muted-foreground">{trip.cargo}</span></>}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Link to="/app/trips"><ArrowLeft className="h-3.5 w-3.5" />All trips</Link></Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Trip status advanced", { description: `${trip.id} updated by Operations Admin.` })}>
              <Check className="h-3.5 w-3.5" />Advance status
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Distance" value={trip.distanceKm} unit="km" accent />
        <MetricCard label="Duration" value={trip.durationLabel} />
        <MetricCard label="ETA" value={trip.eta} hint={`departed ${trip.startTime}`} />
        <MetricCard label="Progress" value={`${trip.progress}%`} />
        <MetricCard label="Truck" value={trip.truckReg} hint={trip.truckId} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <SectionPanel title="Trip Record" bodyClassName="pt-1">
          <FieldRow label="Customer" value={trip.customer} />
          <FieldRow label="Cargo" value={trip.cargo} />
          <FieldRow label="Truck" value={`${trip.truckId} · ${trip.truckReg}`} />
          <FieldRow label="Driver" value={`${trip.driverId} · ${trip.driverName}`} />
          <FieldRow label="Scheduled" value={trip.scheduledDate} />
          <FieldRow label="Start time" value={trip.startTime} />
          <FieldRow label="Priority" value={trip.priority} />
        </SectionPanel>

        <SectionPanel title="Trip Timeline" bodyClassName="pt-2">
          <ol className="relative ml-2 border-l border-border pl-5">
            {timeline.map((s) => (
              <li key={s.label} className="relative pb-4 last:pb-0">
                <span
                  className={cn(
                    "absolute top-0.5 -left-[26px] grid h-3.5 w-3.5 place-items-center rounded-full border",
                    s.state === "done" && "border-success bg-success text-success-foreground",
                    s.state === "current" && "border-primary bg-primary",
                    s.state === "pending" && "border-border bg-background",
                  )}
                >
                  {s.state === "done" && <Check className="h-2.5 w-2.5" />}
                  {s.state === "current" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />}
                </span>
                <p className={cn("text-xs font-medium", s.state === "pending" ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
                {s.at && <p className="num text-[10px] text-muted-foreground">12 Aug 2026 · {s.at}</p>}
              </li>
            ))}
          </ol>
        </SectionPanel>

        <SectionPanel
          title="Trip Operations Thread"
          description={thread.participants.join(" · ")}
          bodyClassName="flex h-[430px] flex-col p-0"
        >
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-lg border p-2.5", m.self ? "ml-auto border-primary/40 bg-primary/10" : "border-border bg-surface-raised")}>
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{m.author} · {m.role}</p>
                <p className="mt-1 text-xs text-foreground">{m.body}</p>
                <p className="num mt-1 text-[10px] text-muted-foreground">{m.time}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border p-3">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message the trip thread…" className="h-8 text-xs" />
            <Button size="sm" className="h-8 w-8 p-0" onClick={send}><Send className="h-3.5 w-3.5" /></Button>
          </div>
        </SectionPanel>
      </div>
    </>
  );
}
