import { createFileRoute, redirect } from "@tanstack/react-router";
import { authService, messageService, tripService } from "@/lib/fleetopsx/services";
import { loadWithBrowserAuth } from "@/lib/fleetopsx/live-loader";
import { useState, useRef, useEffect } from "react";
import { Send, Check, CheckCheck, Paperclip, MoreVertical, Search, Phone, Video, Smile } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Conversation, Message, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/messages")({
  loader: () =>
    loadWithBrowserAuth(
      async () => {
        const [convos, trips] = await Promise.all([messageService.list(), tripService.list()]);
        return { convos, trips };
      },
      { convos: [] as Conversation[], trips: [] as Trip[] },
    ),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = ["Transport Manager", "Fleet Operations", "Diesel", "Engineering", "Parts & Store", "Accounts", "HR", "Security", "Driver", "Customer Portals (External)"];
    if (!authService.getRoles().some(r => allowed.includes(r as any))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Messages | FleetOpsX" },
      { name: "description", content: "Contextual communication: direct messages, department channels and trip-specific operations threads." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { convos: initialConvos } = Route.useLoaderData();
  const [convos, setConvos] = useState(initialConvos);
  const [activeId, setActiveId] = useState(initialConvos[0]?.id || "");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void messageService.list().then((next) => {
      setConvos(next);
      setActiveId((prev) => prev || next[0]?.id || "");
    });
  }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const active = convos.find((c) => c.id === activeId) || convos[0];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages, activeId]);

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || !active) return;
    const msg: Message = { id: `m${active.messages.length + 1}`, author: "You", role: "Operations Admin", body: draft, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), self: true };
    setConvos(convos.map((c) => (c.id === activeId ? { ...c, unread: 0, messages: [...c.messages, msg] } : c)));
    setDraft("");
  };

  const filteredConvos = convos.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.subtitle.toLowerCase().includes(search.toLowerCase()));

  const SECTIONS = [
    { key: "trip", label: "Trip Threads" },
    { key: "channel", label: "Department Channels" },
    { key: "direct", label: "Direct Messages" },
  ];

  return (
    <div className="flex h-[calc(100vh-100px)] lg:h-[calc(100vh-80px)] w-full overflow-hidden rounded-[16px] border border-black/[0.05] bg-white shadow-sm font-['Inter',sans-serif]">
      
      {/* Sidebar - Chat List */}
      <div className={cn(
        "flex flex-col border-r border-black/[0.05] bg-[#f8f9fa] transition-all duration-300 ease-apple w-full md:w-[320px] lg:w-[380px] shrink-0",
        activeId ? "hidden md:flex" : "flex"
      )}>
        {/* Sidebar Header */}
        <div className="flex h-[60px] items-center justify-between px-4 border-b border-black/[0.05] bg-[#f1f2f4]">
          <h2 className="text-lg font-semibold text-[#1d1d1f]">Messages</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-3 bg-white border-b border-black/[0.03]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              className="w-full bg-[#f1f2f4] rounded-full h-9 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto sleek-scrollbar">
          {SECTIONS.map((section) => {
            const list = filteredConvos.filter((c) => c.kind === section.key);
            if (list.length === 0) return null;
            return (
              <div key={section.key} className="mb-2">
                <div className="px-4 py-2 sticky top-0 bg-[#f8f9fa]/95 backdrop-blur-sm z-10 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {section.label}
                </div>
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setConvos(convos.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 transition-colors text-left",
                      activeId === c.id ? "bg-[#e8f1fc] text-[#1d1d1f]" : "hover:bg-black/[0.03]"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white",
                      c.kind === "trip" ? "bg-[#34c759]" : c.kind === "channel" ? "bg-[#0071e3]" : "bg-[#5856d6]"
                    )}>
                      {c.name.charAt(0)}
                    </div>
                    
                    <div className="flex-1 min-w-0 border-b border-black/[0.03] pb-3 -mb-3 h-full">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="truncate font-semibold text-[15px]">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{c.lastAt}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[13px] text-muted-foreground pr-2">{c.subtitle}</span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#34c759] px-1.5 text-[11px] font-bold text-white shadow-sm">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      {active ? (
        <div className={cn(
          "flex-1 flex flex-col bg-[#efeae2] relative transition-all duration-300 ease-apple",
          !activeId ? "hidden md:flex" : "flex"
        )}
        style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v3/yl/r/r_Q5Oex89vX.png')", backgroundSize: '400px', opacity: 0.95 }}
        >
          {/* Chat Header */}
          <div className="flex h-[60px] items-center justify-between px-4 border-b border-black/[0.05] bg-[#f1f2f4] z-10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                onClick={() => setActiveId("")}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white",
                active.kind === "trip" ? "bg-[#34c759]" : active.kind === "channel" ? "bg-[#0071e3]" : "bg-[#5856d6]"
              )}>
                {active.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-[15px]">{active.name}</h3>
                <p className="truncate text-xs text-muted-foreground">{active.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full">
                <Phone className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full hidden sm:flex">
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sleek-scrollbar relative z-10" style={{ background: 'rgba(239, 234, 226, 0.85)' }}>
            <div className="text-center mb-6">
              <span className="inline-block bg-[#ffeb3b]/50 backdrop-blur-sm text-yellow-900 text-[11px] font-medium px-4 py-1.5 rounded-[8px] shadow-sm">
                Messages are secured with end-to-end encryption.
              </span>
            </div>
            
            {active.messages.map((m, i) => {
              const showAuthor = !m.self && (i === 0 || active.messages[i - 1]?.author !== m.author);
              return (
                <div key={m.id} className={cn("flex w-full", m.self ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "relative max-w-[85%] md:max-w-[70%] rounded-[12px] px-3 py-2 text-[14px] shadow-sm flex flex-col",
                    m.self 
                      ? "bg-[#d9fdd3] text-[#111b21] rounded-tr-[4px]" 
                      : "bg-white text-[#111b21] rounded-tl-[4px]"
                  )}>
                    {showAuthor && (
                      <span className="text-[12px] font-semibold text-[#00a884] mb-0.5">
                        {m.author}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap leading-relaxed">{m.body}</span>
                    <div className="flex items-center justify-end gap-1 mt-1 -mb-1">
                      <span className="text-[10px] text-[#667781] select-none">{m.time}</span>
                      {m.self && (
                        <CheckCheck className={cn("h-3.5 w-3.5", m.id === `m${active.messages.length}` ? "text-[#53bdeb]" : "text-[#53bdeb]")} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Chat Input */}
          <div className="flex items-end gap-2 p-3 bg-[#f1f2f4] z-10 shrink-0">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0 rounded-full hidden sm:flex">
              <Smile className="h-6 w-6" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0 rounded-full">
              <Paperclip className="h-6 w-6" />
            </Button>
            <form onSubmit={send} className="flex-1 flex bg-white rounded-[20px] shadow-sm items-center">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message"
                className="flex-1 border-0 bg-transparent h-[40px] px-4 text-[15px] focus-visible:ring-0 shadow-none"
              />
            </form>
            {draft.trim() ? (
              <Button onClick={send} size="icon" className="h-10 w-10 shrink-0 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white transition-transform transform active:scale-95">
                <Send className="h-5 w-5 ml-1" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0 rounded-full transition-transform">
                <svg viewBox="0 0 24 24" width="24" height="24" className="fill-current text-[#54656f]"><path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.468 2.349 8.468 4.35v7.061c0 2.001 1.53 3.531 3.531 3.531z"></path><path d="M17.34 11.411c0 3.02-2.31 5.485-5.341 5.485s-5.341-2.465-5.341-5.485H4.21c0 3.89 3.06 7.151 6.84 7.63v3.29h2.9v-3.29c3.78-0.48 6.84-3.74 6.84-7.63h-2.45z"></path></svg>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#f8f9fa] border-l border-black/[0.05]">
          <div className="text-center max-w-sm px-6">
            <h2 className="text-[28px] font-light text-[#1d1d1f] mb-3">FleetOpsX Web</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select a conversation from the sidebar to view operations threads, channels, and direct messages.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
