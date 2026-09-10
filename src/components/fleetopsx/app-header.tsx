import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, ChevronDown, LogOut, MessageSquare, PanelLeft,
  Settings, User, Search
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { globalSearch, authService, notificationService } from "@/lib/fleetopsx/services";
import { NAV } from "./app-sidebar";
import { toast } from "sonner";
import { Route as RootRoute } from "../../routes/__root";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ROLES = authService.getAllRoles();
  const WORKSPACES = authService.getWorkspaces();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!);
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const currentUser = mounted ? authService.getCurrentUser() : null;
  const roleNames = authService.getRoles();
  const roleName = roleNames.join(', ');
  const role = ROLES.find(r => r.name === roleName) ?? ROLES[0]!;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hits = globalSearch(query);
  const groups = [...new Set(hits.map((h) => h.group))];
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void notificationService.getUnreadCount().then((count) => {
      if (!cancelled) setUnread(count);
    }).catch(() => {
      if (!cancelled) setUnread(0);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const active = NAV.find((n) =>
    n.to === "/workspace/app" ? pathname === "/workspace/app" || pathname === "/workspace/app/" : pathname.startsWith(n.to),
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
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-[#e2e5e9] bg-[#ffffff] px-4 lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#141a1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#e2e5e9] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
      >
        <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <Link to="/workspace/app" className="flex h-9 items-center gap-2 overflow-hidden rounded-[10px] bg-white px-2 md:hidden">
        {tenantLogo ? (
          <img src={tenantLogo} alt={tenantName} className="h-6 w-auto object-contain max-w-[120px]" />
        ) : (
          <>
            <div className="grid h-6 w-6 place-items-center rounded bg-[#1d1d1f] text-[10px] font-bold text-white">
              {tenantName.charAt(0)}
            </div>
            <span className="text-[13px] font-bold text-[#1d1d1f]">{tenantName}</span>
          </>
        )}
      </Link>

      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span className="truncate rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-[#141a1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#e2e5e9]">
          {workspace.name}
        </span>
        {active && (
          <>
            <span className="text-[12px] text-[#8e95a1]">/</span>
            <span className="truncate text-[13px] font-semibold tracking-[-0.015em] text-[#141a1f]">
              {active.label}
            </span>
          </>
        )}
        {detailId && detailId !== active?.to.split("/").pop() && (
          <>
            <span className="text-[12px] text-[#8e95a1]">/</span>
            <span className="num truncate text-[12px] text-[#8e95a1]">{detailId}</span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto hidden h-[36px] w-full max-w-md items-center gap-2.5 rounded-[8px] bg-[#f6f7f9] border border-[#e2e5e9] px-3 text-[13px] text-[#8e95a1] transition-colors duration-150 hover:bg-[#e2e5e9]/50 hover:text-[#141a1f] md:flex"
      >
        <Search className="h-4 w-4" strokeWidth={1.75} />
        <span className="flex-1 text-left font-[400]">Search trips, trucks, drivers...</span>
        <kbd className="num rounded-[4px] bg-[#e2e5e9] px-1.5 py-0.5 text-[10px] font-medium text-[#5c6470]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          to="/workspace/app/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full bg-white text-[#141a1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#e2e5e9] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="num absolute top-1 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#ed351d] px-1 text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>

        <Link
          to="/workspace/app/messages"
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#141a1f] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#e2e5e9] transition-colors hover:bg-black/[0.03] active:scale-[0.97]"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-white py-1 pr-2.5 pl-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#e2e5e9] transition-colors hover:bg-black/[0.02] active:scale-[0.98]"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#141a1f] text-[10px] font-semibold text-[#ffffff]">
                {mounted ? (currentUser?.initials || "U") : "U"}
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block truncate text-[12px] leading-tight font-semibold text-[#141a1f]">
                  {mounted ? (currentUser?.name || "User") : "User"}
                </span>
                <span className="block truncate text-[10px] leading-tight text-[#8e95a1]">{role.name}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8e95a1]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 rounded-[18px] border-[#e2e5e9] p-1.5 shadow-[0px_4px_24px_rgba(0,0,0,0.04)]"
          >
            <DropdownMenuLabel className="px-2.5 py-2 text-[11px] font-semibold tracking-[0.04em] text-[#8e95a1] uppercase">
              Workspace
            </DropdownMenuLabel>
            {WORKSPACES.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => {
                  setWorkspace(w);
                  toast.success(`Switched to ${w.name}`);
                }}
                className="flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-[#f6f7f9]"
              >
                <span className="truncate font-[500] text-[#141a1f]">{w.name}</span>
                <span className="num shrink-0 text-[10px] text-[#8e95a1]">{w.id}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="my-1.5 bg-[#e2e5e9]" />
            <DropdownMenuItem asChild className="rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-[#f6f7f9] text-[#141a1f] font-[500]">
              <Link to="/workspace/app/admin"><User className="mr-2 h-3.5 w-3.5" />Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-[#f6f7f9] text-[#141a1f] font-[500]">
              <Link to="/workspace/app/admin"><Settings className="mr-2 h-3.5 w-3.5" />Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1.5 bg-[#e2e5e9]" />
            <DropdownMenuItem 
              asChild 
              className="cursor-pointer rounded-[8px] px-2.5 py-2 text-[13px] hover:bg-[#f6f7f9] text-[#ed351d] font-[500]"
              onClick={() => {
                authService.logout();
                toast.success("Signed out");
              }}
            >
              <Link to="/workspace/login"><LogOut className="mr-2 h-3.5 w-3.5" />Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search TRP-00842, TRK-104, driver..."
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
                  <span className="truncate text-xs text-[#8e95a1]">{h.meta}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </header>
  );
}

