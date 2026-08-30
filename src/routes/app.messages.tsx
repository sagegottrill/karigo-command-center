import { createFileRoute } from "@tanstack/react-router";
import { redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionPanel, FieldRow } from "@/components/fleetopsx/page-header";
import { StatusBadge } from "@/components/fleetopsx/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messageService, tripService } from "@/lib/fleetopsx/services";
import type { Conversation, Message } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/messages")({
  loader: async () => {
    const [convos, trips] = await Promise.all([
      messageService.list(),
      tripService.list()
    ]);
    return { convos, trips };
  },
  beforeLoad: () => {
    const allowed = ["Transport Manager", "Fleet Operations", "Diesel", "Engineering", "Parts & Store", "Accounts", "HR", "Security", "Driver", "Customer Portals (External)"];
    if (!allowed.includes(authService.getRole())) {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "Messages | FleetOpsX" },
      { name: "description", content: "Contextual communication: direct messages, department channels and trip-specific operations threads." },
      { property: "og:title", content: "Messages | FleetOpsX" },
      { property: "og:description", content: "Direct messages, department channels and trip operations threads." },
    ],
  }),
  component: MessagesPage,
});

const SECTIONS: { key: Conversation["kind"]; label: string }[] = [
  { key: "trip", label: "Trip Threads" },
  { key: "channel", label: "Department Channels" },
  { key: "direct", label: "Direct Messages" },
];

function MessagesPage() {
  const { convos: initialConvos, trips: TRIPS } = Route.useLoaderData();
  const [convos, setConvos] = useState(initialConvos);
  const [activeId, setActiveId] = useState(initialConvos[0]?.id || "");
  const [draft, setDraft] = useState("");
  const active = convos.find((c) => c.id === activeId) || convos[0]!;
  const trip = TRIPS.find((t) => t.id === active.tripId);

  const send = () => {
    if (!draft.trim()) return;
    const msg: Message = { id: `m${active.messages.length + 1}`, author: "You", role: "Operations Admin", body: draft, time: "now", self: true };
    setConvos(convos.map((c) => (c.id === activeId ? { ...c, unread: 0, messages: [...c.messages, msg] } : c)));
    setDraft("");
    toast.success("Message sent");
  };

  return (
    <>
      <PageHeader title="Messages" description="Messages linked to trips, teams and people." />
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <SectionPanel title="Conversations" bodyClassName="p-0">
          <div className="max-h-[560px] space-y-0.5 overflow-y-auto p-2">
            {SECTIONS.map((s) => (
              <div key={s.key}>
                <p className="px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{s.label}</p>
                {convos.filter((c) => c.kind === s.key).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setActiveId(c.id); setConvos(convos.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x))); }}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors",
                      activeId === c.id
                        ? "bg-black/[0.04] text-foreground"
                        : "hover:bg-black/[0.03]",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.subtitle}</p>
                    </div>
                    {c.unread > 0 && <span className="num rounded-full bg-[#1d1d1f] px-2 py-0.5 text-[10px] font-semibold text-white">{c.unread}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title={active.name} description={active.subtitle} bodyClassName="flex h-[560px] flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {active.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[70%] rounded-[16px] px-3.5 py-2.5",
                  m.self
                    ? "ml-auto bg-[#1d1d1f]/8 text-foreground"
                    : "border border-black/[0.04] bg-black/[0.03]",
                )}
              >
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{m.author} · {m.role}</p>
                <p className="mt-1 text-xs text-foreground">{m.body}</p>
                <p className="num mt-1 text-[10px] text-muted-foreground">{m.time}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-black/[0.05] p-3">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a message…" className="h-9 rounded-full border-black/[0.08] bg-black/[0.03] text-[13px]" />
            <Button size="sm" className="h-9 w-9 rounded-full p-0" onClick={send}><Send className="h-3.5 w-3.5" /></Button>
          </div>
        </SectionPanel>

        <SectionPanel title="Context" bodyClassName="pt-1">
          {trip ? (
            <>
              <FieldRow label="Trip" value={trip.id} />
              <FieldRow label="Status" value={<StatusBadge status={trip.status} />} />
              <FieldRow label="Truck" value={trip.truckReg} />
              <FieldRow label="Driver" value={trip.driverName} />
              <FieldRow label="Route" value={`${trip.pickup} → ${trip.dropoff}`} />
              <FieldRow label="Documents" value="waybill.pdf · POD.jpg" />
            </>
          ) : (
            <>
              <FieldRow label="Type" value={active.kind === "channel" ? "Department channel" : "Direct message"} />
              <FieldRow label="Participants" value={active.participants.join(", ")} />
              <FieldRow label="Retention" value="Audited · 24 months" />
            </>
          )}
        </SectionPanel>
      </div>
    </>
  );
}
