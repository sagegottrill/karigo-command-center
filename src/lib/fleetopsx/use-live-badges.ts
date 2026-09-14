import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { authService, notificationService, tripService, adminService } from "@/lib/fleetopsx/services";
import { isInBucket, TM_REQUESTS_BUCKETS } from "@/lib/fleetopsx/status-buckets";
import { getToken } from "@/lib/fleetopsx/apiClient";

// 10s keeps sidebar dots near real-time without hammering the API (all legs
// share one /trips call, so the cost is two GETs per tick).
const POLL_MS = 10_000;

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

    // 2 + 3. Trip-derived badges — internal roles only (partner users can't list trips).
    //         One shared /trips call feeds both counters.
    const tripsP = isPartner
      ? Promise.resolve([])
      : tripService.list().catch(() => []);
    // Badge semantics = the queue the dot links to (shared buckets module):
    //   Partner Requests dot  → TM_REQUESTS_BUCKETS (fresh, unapproved requests)
    //   Fleet Operation dot   → trips awaiting the TM's FINAL approval on /fleet
    const requestsP = tripsP.then(
      (trips) => ["requests", trips.filter((t) => isInBucket(t, TM_REQUESTS_BUCKETS)).length] as const,
    );
    const dispatchP = tripsP.then(
      (trips) => ["dispatch", trips.filter((t) => isInBucket(t, ["awaiting"])).length] as const,
    );

    // 4. Password reset requests — server gates GET /api/users to Platform Admin
    //    and HR. Any other role gets a 403 here, so only call it for those roles.
    const canListUsers = roles.includes("Platform Admin") || roles.includes("HR");
    const passwordP = isPartner || !canListUsers
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
    // Tab becoming visible again (mobile background) refreshes instantly.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refresh();
    });
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
