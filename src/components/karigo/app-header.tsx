import { useState } from "react";
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
import { NOTIFICATIONS, WORKSPACES } from "@/lib/karigo/mock-data";
import { NAV } from "./app-sidebar";
import { StatusBadge } from "./status-badge";
import { toast } from "sonner";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(true);
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hits = globalSearch(query);
  const groups = [...new Set(hits.map((h) => h.group))];
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;

  const active = NAV.find((n) => (n.to === "/app" ? pathname === "/app" : pathname.startsWith(n.to)));
  const crumbTail = pathname.split("/").filter(Boolean).slice(2);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/92 px-4 backdrop-blur">
      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onToggleSidebar}>
        <PanelLeft className="h-4 w-4" />
      </Button>

      <div className="hidden min-w-0 items-center gap-2 lg:flex">
        <span className="num rounded border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-foreground">
          {workspace.name}
        </span>
        <span className="text-muted-foreground">/</span>
        <Link to="/app" className="text-xs text-muted-foreground hover:text-foreground">Workspace</Link>
        {active && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="truncate text-xs font-medium text-foreground">{active.label}</span>
          </>
        )}
        {crumbTail.length > 1 && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="num truncate text-xs text-muted-foreground uppercase">{crumbTail.at(-1)}</span>
          </>
        )}
      </div>

      <button
        onClick={() => setOpen(true)}
        className="mx-auto hidden h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 md:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search trips, trucks, drivers, expenses…</span>
        <kbd className="num rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => {
            setOnline(!online);
            toast(online ? "Offline mode simulated" : "Connection restored", {
              description: online ? "3 records queued for synchronization." : "All records synchronized.",
            });
          }}
          className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-semibold tracking-wider uppercase sm:flex"
        >
          {online ? (
            <><CircleDot className="h-3 w-3 text-success" /> <span className="text-success">Online</span></>
          ) : (
            <><WifiOff className="h-3 w-3 text-warning" /> <span className="text-warning">Offline — 3 pending</span></>
          )}
        </button>

        <Button asChild variant="ghost" size="sm" className="relative h-8 w-8 p-0">
          <Link to="/app/notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="num absolute top-0.5 right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-critical px-1 text-[9px] font-bold text-critical-foreground">
                {unread}
              </span>
            )}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Link to="/app/messages"><MessageSquare className="h-4 w-4" /></Link>
        </Button>
        <Button variant="ghost" size="sm" className="hidden h-8 w-8 p-0 sm:inline-flex" onClick={() => toast("Karigo help centre", { description: "Product documentation opens here." })}>
          <HelpCircle className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md border border-border bg-surface py-1 pr-2 pl-1.5 transition-colors hover:border-primary/40">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/15 text-[10px] font-bold text-primary">OF</span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-[11px] leading-tight font-semibold text-foreground">Okwudili Fortune</span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground">Operations Admin</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
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
