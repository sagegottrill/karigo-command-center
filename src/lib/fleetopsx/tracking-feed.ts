import { useEffect, useState } from "react";
import { notificationService } from "./services";
import { displayDispatchId } from "./request-id";
import type { Notification, Trip } from "./types";

/**
 * "What is happening on the road right now."
 *
 * The Transport Manager already receives every one of these alerts — the API
 * writes them — but they only ever surfaced in the Notification Center behind the
 * bell. His dashboard showed totals, and a total cannot tell him that ONE truck
 * just reached a checkpoint. This module turns those alerts into the live feed he
 * can read without leaving the board.
 *
 * Which events count as a tracking update is decided by TITLE, because that is
 * what the API stores: the Notification row has no event-type column and no
 * dispatch link, only category/title/body/audience.
 *
 * Keep this list in step with the server (its /api/tracking and /api/gate routes
 * and TRIP_STATUS_NOTICES). A field event that is not named here simply will not
 * appear on the dashboard — a silent gap, not a loud error — so anything new the
 * Tracking department can log belongs in this list.
 */
const TRACKING_UPDATE_TITLES = [
  // The Tracking department logging a location — and Loading, which writes
  // checkpoints through the same endpoint (one source of truth, never two rows).
  "New Location has been Logged",
  // Security at the gate: the two stamps the TM cares about most — the truck is
  // out, and the truck is back.
  "Gate Departure Logged",
  "Gate Return Logged",
  // The movement outcomes a checkpoint writes onto the dispatch itself.
  "Truck Departed",
  "Dispatch Delayed",
  "Delivery Completed",
];

export function isTrackingUpdate(n: Notification): boolean {
  return TRACKING_UPDATE_TITLES.includes((n.title || "").trim());
}

/** The dispatch reference the text names, if it names one. */
export function dispatchIdIn(text: string): string | null {
  const m = (text || "").match(/DIS-[0-9A-Z]{5}\b/i);
  return m ? m[0].toUpperCase() : null;
}

/** Case/space/punctuation-insensitive plate key, so "grr 171 xa" finds "GRR171XA". */
function plateKey(value: string | null | undefined): string {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Which dispatch does this update belong to?
 *
 * First by the dispatch ID the text carries — the API writes it for checkpoints,
 * so the row is exact. The gate stamps name only a truck, so those fall back to a
 * plate match, and only when EXACTLY ONE live dispatch carries that plate: a link
 * to the wrong truck is worse than no link at all, and two trips can share a
 * plate across a swap.
 */
export function resolveTrackingTrip(n: Notification, trips: Trip[]): Trip | undefined {
  const text = `${n.title || ""} ${n.body || ""}`;

  const named = dispatchIdIn(text);
  if (named) {
    const hit = trips.find((t) => displayDispatchId(t).toUpperCase() === named);
    if (hit) return hit;
  }

  const plateMatch = text.match(/truck\s+([A-Za-z0-9 -]{4,24}?)\s*\(/i);
  if (!plateMatch) return undefined;
  const wanted = plateKey(plateMatch[1]);
  if (!wanted) return undefined;

  const hits = trips.filter((t) => {
    const reg = plateKey(t.truckReg);
    return reg === wanted || reg.includes(wanted);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * When a checkpoint landed, as an ISO stamp. The API stores a `createdAt` the
 * client-side Notification type does not declare (it predates the column), and a
 * legacy free-text `time` on very old rows — so read both and never crash on
 * either.
 */
export function trackingUpdateStamp(n: Notification): string | undefined {
  const created = (n as Notification & { createdAt?: string }).createdAt;
  if (created) return created;
  return n.time && !Number.isNaN(Date.parse(n.time)) ? n.time : undefined;
}

const MAX_ITEMS = 12;

/**
 * The most recent tracking updates, newest first.
 *
 * Refreshes off the notification engine's own 10s tick (`fleetopsx:notifications-refresh`)
 * so the dashboard is not opening a second /notifications poller beside it, with a
 * slower safety net for when the engine is not mounted and an immediate refetch
 * when the tab regains focus.
 */
export function useTrackingUpdates(trips: Trip[], limit = MAX_ITEMS) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void notificationService
        .list()
        .then((all: Notification[]) => {
          if (cancelled) return;
          // The API already returns newest-first; cap here so the board cannot
          // grow without bound as the day goes on.
          setItems(all.filter(isTrackingUpdate).slice(0, limit));
        })
        .catch(() => {
          /* offline / 401 — keep whatever is already on screen */
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    window.addEventListener("fleetopsx:notifications-refresh", load);
    window.addEventListener("focus", load);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const safety = window.setInterval(load, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("fleetopsx:notifications-refresh", load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(safety);
    };
  }, [limit]);

  return { items, loading };
}
