import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, ChevronDown, CircleDot, HelpCircle, LogOut, MessageSquare, PanelLeft,
  Search, Settings, User, WifiOff,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { globalSearch } from "@/lib/karigo/services";
import { NOTIFICATIONS, ROLES, WORKSPACES } from "@/lib/karigo/mock-data";
import { NAV } from "./app-sidebar";
import { toast } from "sonner";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(true);
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!);
  const [role, setRole] = useState(ROLES.find((r) => r.key === "operations_manager") ?? ROLES[2]!);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hits = globalSearch(query);
  const groups = [...new Set(hits.map((h) => h.group))];
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;

  const active = NAV.find((n) =>
    n.to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(n.to),
  );
  const detailId = pathname.split("/").filter(Boolean).slice(2).at(-1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-black/[0.05] bg-[#f5f5f7]/90 px-4 backdrop-blur-xl lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
      >
        <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="truncate rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06]">
          {workspace.name}
        </span>
        {active && (
          <>
            <span className="text-[12px] text-black/25">/</span>
            <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-foreground">
              {active.label}
            </span>
          </>
        )}
        {detailId && detailId !== active?.to.split("/").pop() && (
          <>
            <span className="text-[12px] text-black/25">/</span>
            <span className="num truncate text-[12px] text-muted-foreground">{detailId}</span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto hidden h-10 w-full max-w-md items-center gap-2.5 rounded-full bg-white px-4 text-[13px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors duration-150 hover:bg-black/[0.02] hover:text-foreground md:flex"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="flex-1 text-left">Search trips, trucks, drivers…</span>
        <kbd className="num rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOnline(!online);
            toast(online ? "You're offline" : "Back online", {
              description: online ? "3 changes waiting to sync." : "Everything is up to date.",
            });
          }}
          className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] sm:flex"
        >
          {online ? (
            <>
              <CircleDot className="h-3 w-3 text-[#34c759]" />
              <span className="text-[#1d1d1f]">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-[#ff9f0a]" />
              <span className="text-[#1d1d1f]">Offline · 3</span>
            </>
          )}
        </button>

        <Link
          to="/app/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="num absolute top-1 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#ff3b30] px-1 text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>

        <Link
          to="/app/messages"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
        </Link>

        <button
          type="button"
          className="hidden h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.03] active:scale-[0.97] sm:grid"
          onClick={() => toast("Help", { description: "Guides and support will open here." })}
        >
          <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-white py-1 pr-2.5 pl-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] active:scale-[0.98]"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1d1d1f] text-[10px] font-semibold text-white">
                OF
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-[12px] leading-tight font-semibold text-foreground">
                  Okwudili Fortune
                </span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground">{role.name}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 rounded-[18px] border-black/[0.06] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
          >
            <DropdownMenuLabel className="px-2.5 py-2 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Workspace
            </DropdownMenuLabel>
            {WORKSPACES.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => {
                  setWorkspace(w);
                  toast.success(`Switched to ${w.name}`);
                }}
                className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px]"
              >
                <span className="truncate">{w.name}</span>
                <span className="num shrink-0 text-[10px] text-muted-foreground">{w.id}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-1.5 bg-black/[0.06]" />
            <DropdownMenuLabel className="px-2.5 py-2 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Switch role
            </DropdownMenuLabel>
            {ROLES.slice(0, 8).map((r) => (
              <DropdownMenuItem
                key={r.key}
                onClick={() => {
                  setRole(r);
                  toast.success(`Signed in as ${r.name}`);
                  if (r.key === "executive") navigate({ to: "/app/god-view" });
                  if (r.key === "accountant") navigate({ to: "/app/accounts" });
                  if (r.key === "engineer" || r.key === "mechanic") navigate({ to: "/app/engineering" });
                  if (r.key === "hr_manager") navigate({ to: "/app/drivers" });
                  if (r.key === "security_officer") navigate({ to: "/app/gate" });
                }}
                className="rounded-xl px-2.5 py-2 text-[13px]"
              >
                {r.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-1.5 bg-black/[0.06]" />
            <DropdownMenuItem asChild className="rounded-xl px-2.5 py-2 text-[13px]">
              <Link to="/app/admin"><User className="mr-2 h-3.5 w-3.5" />Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl px-2.5 py-2 text-[13px]">
              <Link to="/app/admin"><Settings className="mr-2 h-3.5 w-3.5" />Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1.5 bg-black/[0.06]" />
            <DropdownMenuItem asChild className="rounded-xl px-2.5 py-2 text-[13px]">
              <Link to="/login"><LogOut className="mr-2 h-3.5 w-3.5" />Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search TRP-00842, TRK-104, driver…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {hits.filter((h) => h.group === g).map((h, i) => (
                <CommandItem
                  key={`${g}-${i}`}
                  value={`${g}-${h.label}-${i}`}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: h.to, params: h.params } as never);
                  }}
                >
                  <span className="num mr-2 text-xs font-semibold">{h.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.meta}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </header>
  );
}
