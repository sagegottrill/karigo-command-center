import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { authService, notificationService, tripService, adminService } from "@/lib/fleetopsx/services";
import { getToken } from "@/lib/fleetopsx/apiClient";

const POLL_MS = 30_000;

export type LiveBadges = {
  unreadNotifications: number;
  partnerRequestsPending: number;
  passwordRequestsPending: number;
  fleetDispatchPending: number;
};

const EMPTY: LiveBadges = {
  unreadNotifications: 0,
  partnerRequestsPending: 0,
  passwordRequestsPending: 0,
  fleetDispatchPending: 0,
};

// ---- Module-level singleton store: ONE poller per page, shared by every
// ---- chrome component (sidebar + header + mobile nav) so all dots always
// ---- show identical live numbers and we never double-poll the API.

let current: LiveBadges = { ...EMPTY };
let inFlight = false;
let pollTimer: number | null = null;
let lastPathname = "";
const subscribers = new Set<(b: LiveBadges) => void>();

function emit() {
  for (const fn of subscribers) fn(current);
}

async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    const roles = authService.getRoles();
    const isPartner = roles.includes("Customer Portals (External)");

    // 1. Unread notifications — everyone (server scopes by role)
    const unreadP = notificationService
      .getUnreadCount()
      .then((n) => ["unread", n] as const)
      .catch(() => ["unread", 0] as const);

    // 2. Pending partner requests — internal roles only (partner users can't list trips)
    const requestsP = isPartner
      ? Promise.resolve(["requests", 0] as const)
      : tripService
          .list()
          .then((trips) => ["requests", trips.filter((t) => t.status === "Requested").length] as const)
          .catch(() => ["requests", 0] as const);

    // 3. Fleet dispatch queue — TM-approved / awaiting-FO-assignment trips
    const dispatchP = isPartner
      ? Promise.resolve(["dispatch", 0] as const)
      : tripService
          .list()
          .then(
            (trips) =>
              [
                "dispatch",
                trips.filter((t) => t.status === ("Approved" as string) || t.status === "Awaiting Approval").length,
              ] as const,
          )
          .catch(() => ["dispatch", 0] as const);

    // 4. Password reset requests — user-management roles only (/users is TM/PA/HR-gated)
    const passwordP = isPartner
      ? Promise.resolve(["password", 0] as const)
      : adminService
          .users()
          .then(
            (users: Array<{ passwordResetRequired?: boolean | null; status?: string | null }>) =>
              ["password", users.filter((u) => u.passwordResetRequired && u.status !== "Deleted").length] as const,
          )
          .catch(() => ["password", 0] as const);

    const results = await Promise.all([unreadP, requestsP, dispatchP, passwordP]);
    const next: LiveBadges = { ...current };
    for (const [key, value] of results) {
      if (key === "unread") next.unreadNotifications = value;
      if (key === "requests") next.partnerRequestsPending = value;
      if (key === "dispatch") next.fleetDispatchPending = value;
      if (key === "password") next.passwordRequestsPending = value;
    }
    current = next;
    emit();
  } finally {
    inFlight = false;
  }
}

function startPolling(pathname: string) {
  if (!getToken()) {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    current = { ...EMPTY };
    emit();
    return;
  }
  // Route changed → refresh immediately (cheap guard: skip if same page)
  if (pathname !== lastPathname || pollTimer === null) {
    lastPathname = pathname;
    void refresh();
  }
  if (pollTimer === null) {
    pollTimer = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("fleetopsx:badges-refresh", onFocus);
  }
}

/**
 * Single source of truth for sidebar/nav badge counts. Subscribes the calling
 * component to the shared poller (30s cadence + refresh on route change and
 * window focus). All legs soft-fail independently — a 403 or offline leg
 * yields 0 for that counter only, never breaks the others.
 */
export function useLiveBadges(): LiveBadges {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [badges, setBadges] = useState<LiveBadges>(current);

  useEffect(() => {
    subscribers.add(setBadges);
    startPolling(pathname);
    return () => {
      subscribers.delete(setBadges);
    };
  }, [pathname]);

  return badges;
}
