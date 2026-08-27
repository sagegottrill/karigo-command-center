import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow, EmptyState } from "@/components/karigo/page-header";
import { StatusBadge } from "@/components/karigo/status-badge";
import { MetricCard } from "@/components/karigo/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONVERSATIONS } from "@/lib/karigo/mock-data";
import { messageService, tripService } from "@/lib/karigo/services";
import type { Message, Trip } from "@/lib/karigo/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/trips/$tripId")({
  head: ({ params }) => ({
    meta: [
      { title: `Trip ${params.tripId} | Karigo` },
      { name: "description", content: `Execution detail, timeline and operations thread for trip ${params.tripId}.` },
      { property: "og:title", content: `Trip ${params.tripId} | Karigo` },
      { property: "og:description", content: `Execution detail, timeline and operations thread for trip ${params.tripId}.` },
    ],
  }),
  component: TripDetail,
});

function TripDetail() {
  const { tripId } = Route.useParams();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    void tripService.get(tripId).then((t) => {
      setTrip(t);
      const thread = CONVERSATIONS.find((c) => c.tripId === (t?.id ?? tripId)) ?? CONVERSATIONS.find((c) => c.kind === "trip");
      setMessages(thread ? [...thread.messages] : []);
      setThreadId(thread?.id ?? null);
    });
  }, [tripId]);

  if (trip === undefined) {
    return <p className="text-xs text-muted-foreground">Loading trip…</p>;
  }

  if (!trip) {
    return (
      <EmptyState
        title="Trip not found"
        description={`No trip record matches ${tripId}.`}
        action={<Button asChild size="sm" variant="outline" className="h-8 text-xs"><Link to="/app/trips">Back to trips</Link></Button>}
      />
    );
  }

  const timeline = tripService.timeline(trip);

  const send = async () => {
    if (!draft.trim()) return;
    if (threadId) await messageService.send(threadId, draft);
    setMessages((prev) => [...prev, { id: `m${prev.length + 1}`, author: "You", role: "Operations Admin", body: draft, time: "now", self: true }]);
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
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => {
              void tripService.updateStatus(trip.id).then(status => {
                toast.success("Trip status advanced", { description: `${trip.id} updated to ${status}.` });
                void tripService.get(trip.id).then(setTrip);
              });
            }}>
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
          <ol className="relative ml-2 border-l border-black/10 pl-5">
            {timeline.map((s) => (
              <li key={s.label} className="relative pb-4 last:pb-0">
                <span className={cn(
                  "absolute -left-[23px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border",
                  s.state === "done" && "border-success bg-success text-success-foreground",
                  s.state === "current" && "border-[#1d1d1f] bg-[#1d1d1f] text-white",
                  s.state === "pending" && "border-black/15 bg-white",
                )}>
                  {s.state === "done" ? <Check className="h-2 w-2" /> : s.state === "current" ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
                </span>
                <p className={cn("text-xs font-medium", s.state === "pending" ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
                {s.at && <p className="num text-[10px] text-muted-foreground">{s.at}</p>}
              </li>
            ))}
          </ol>
        </SectionPanel>

        <SectionPanel title={`${trip.id} Operations Thread`} description="Dispatcher · Driver · Fleet · Accounts · Management" bodyClassName="flex h-[360px] flex-col p-0">
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("max-w-[90%] rounded-[16px] px-3 py-2", m.self ? "ml-auto bg-[#1d1d1f]/8 text-foreground" : "bg-black/[0.04]")}>
                <p className="text-[10px] font-semibold text-muted-foreground">{m.author} · {m.role}</p>
                <p className="mt-0.5 text-xs text-foreground">{m.body}</p>
                <p className="num mt-1 text-[10px] text-muted-foreground">{m.time}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-black/[0.05] p-3">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder="Message trip thread…" className="h-8 text-xs" />
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => void send()}><Send className="h-3.5 w-3.5" /></Button>
          </div>
        </SectionPanel>
      </div>
    </>
  );
}
