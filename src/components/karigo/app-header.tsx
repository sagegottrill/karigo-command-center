import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, ChevronDown, CircleDot, HelpCircle, LogOut, MessageSquare, PanelLeft,
  Search, Settings, User, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { StatusBadge } from "./status-badge";
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

  const active = NAV.find((n) => (n.to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(n.to)));
  const crumbTail = pathname.split("/").filter(Boolean).slice(2);

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
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 px-4">
      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={onToggleSidebar}>
        <PanelLeft className="h-4 w-4" />
      </Button>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <span className="num rounded-full border border-border/80 bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground">
          {workspace.name}
        </span>
        <span className="text-muted-foreground/50">/</span>
        <Link to="/app" className="text-[12px] text-muted-foreground hover:text-foreground">Workspace</Link>
        {active && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate text-[12px] font-medium text-foreground">{active.label}</span>
          </>
        )}
        {crumbTail.length > 1 && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="num truncate text-[12px] text-muted-foreground">{crumbTail.at(-1)}</span>
          </>
        )}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-full border border-border/80 bg-surface px-3.5 text-[13px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-primary/30 md:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search trips, trucks, drivers…</span>
        <kbd className="num rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => {
            setOnline(!online);
            toast(online ? "Offline mode simulated" : "Connection restored", {
              description: online ? "3 records queued for synchronization." : "All records synchronized.",
            });
          }}
          className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] sm:flex"
        >
          {online ? (
            <><CircleDot className="h-3 w-3 text-success" /> <span className="text-success">Online</span></>
          ) : (
            <><WifiOff className="h-3 w-3 text-warning" /> <span className="text-warning-foreground">Offline — 3 pending</span></>
          )}
        </button>

        <Button asChild variant="ghost" size="sm" className="relative h-8 w-8 rounded-full p-0">
          <Link to="/app/notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="num absolute top-0.5 right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-critical px-1 text-[9px] font-bold text-critical-foreground">
                {unread}
              </span>
            )}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0">
          <Link to="/app/messages"><MessageSquare className="h-4 w-4" /></Link>
        </Button>
        <Button variant="ghost" size="sm" className="hidden h-8 w-8 rounded-full p-0 sm:inline-flex" onClick={() => toast("Karigo help centre", { description: "Product documentation opens here." })}>
          <HelpCircle className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border/80 bg-surface py-1 pr-2 pl-1 transition-colors hover:border-primary/30">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">OF</span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-[12px] leading-tight font-semibold text-foreground">Okwudili Fortune</span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground">{role.name}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span>Workspace</span>
              <StatusBadge status="Online" />
            </DropdownMenuLabel>
            {WORKSPACES.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => {
                  setWorkspace(w);
                  toast.success(`Switched to ${w.name}`, { description: `Workspace ID ${w.id}` });
                }}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{w.name}</span>
                <span className="num shrink-0 text-[10px] text-muted-foreground">{w.id}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Demo role</DropdownMenuLabel>
            {ROLES.slice(0, 8).map((r) => (
              <DropdownMenuItem
                key={r.key}
                onClick={() => {
                  setRole(r);
                  toast.success(`Viewing as ${r.name}`, {
                    description: "Prototype role lens — menus remain fully visible for demo.",
                  });
                  if (r.key === "executive") navigate({ to: "/app/god-view" });
                  if (r.key === "accountant") navigate({ to: "/app/accounts" });
                  if (r.key === "engineer" || r.key === "mechanic") navigate({ to: "/app/engineering" });
                  if (r.key === "hr_manager") navigate({ to: "/app/drivers" });
                  if (r.key === "security_officer") navigate({ to: "/app/gate" });
                }}
                className="text-xs"
              >
                {r.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs"><Link to="/app/admin"><User className="mr-2 h-3.5 w-3.5" />Profile & permissions</Link></DropdownMenuItem>
            <DropdownMenuItem asChild className="text-xs"><Link to="/app/admin"><Settings className="mr-2 h-3.5 w-3.5" />System configuration</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs"><Link to="/login"><LogOut className="mr-2 h-3.5 w-3.5" />Sign out</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search TRP-00842, TRK-104, driver, expense…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No matching operational records.</CommandEmpty>
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
