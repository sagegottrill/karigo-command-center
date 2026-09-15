/**
 * Real-time notification engine — sound + toast pop-up + cross-tab dedupe.
 *
 * One instance lives in the root shell. Every 10s it pulls the scoped
 * notification list from the backend and:
 *   1. plays a soft chime for NEW unread notifications (browser autoplay rules
 *      honored — the chime is primed by the first user interaction),
 *   2. pops a Sonner toast per new item (max 3 per batch, oldest collapsed),
 *   3. only alerts in ONE tab at a time (localStorage lock so 5 open tabs don't
 *      all ring at once),
 *   4. badges the document title with the unread count.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouterState } from "@tanstack/react-router";
import { notificationService } from "./services";
import { getToken } from "./apiClient";
import type { Notification } from "./types";

const STATE_KEY = "fleetopsx_notif_engine_state";
const LOCK_KEY = "fleetopsx_notif_alert_lock";
const POLL_MS = 10_000;
const MAX_IDS = 200;

type EngineState = { lastTs: number; ids: string[] };

function loadState(): EngineState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EngineState;
      if (typeof parsed.lastTs === "number" && Array.isArray(parsed.ids)) return parsed;
    }
  } catch {
    /* corrupted state — reset */
  }
  return { lastTs: 0, ids: [] };
}

function saveState(state: EngineState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...state, ids: state.ids.slice(-MAX_IDS) }));
  } catch {
    /* quota — non-fatal */
  }
}

/** Claim the cross-tab alert lock; returns false when another tab alerted <2.5s ago. */
function claimAlertLock(): boolean {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (now - last < 2500) return false;
    localStorage.setItem(LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

// ---- Chime (WebAudio, no asset, unlocked by first user gesture) ----

let audioCtx: AudioContext | null = null;
let primed = false;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function unlockNotificationAudio() {
  if (primed && audioCtx) return;
  try {
    const w = window as AudioWindow;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    primed = true;
  } catch {
    /* no audio available */
  }
}

/** Soft two-tone chime for a new notification. */
export function playNotificationChime() {
  try {
    unlockNotificationAudio();
    const ctx = audioCtx;
    if (!ctx || ctx.state === "suspended") return;
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.14;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    /* audio is best-effort */
  }
}

function timeLabel(value: unknown): string {
  const t = value ? Date.parse(String(value)) : NaN;
  if (Number.isNaN(t)) return "Just now";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function applyTitleBadge(count: number) {
  if (typeof document === "undefined") return;
  const base = document.title.replace(/^\(\d+\)\s*/, "");
  document.title = count > 0 ? `(${count}) ${base}` : base;
}

let polling = false;

async function pollOnce() {
  if (polling) return;
  if (!getToken()) {
    applyTitleBadge(0);
    return;
  }
  polling = true;
  try {
    const items = (await notificationService.list()) as Notification[];
    const state = loadState();
    const firstRun = state.ids.length === 0 && state.lastTs === 0;

    const created = (n: Notification) => {
      const raw = (n as Notification & { createdAt?: string }).createdAt;
      const t = raw ? Date.parse(raw) : NaN;
      return Number.isNaN(t) ? 0 : t;
    };
    const maxCreated = items.reduce((m, n) => Math.max(m, created(n)), 0);

    // A notification is "new" when we have never seen its id (the very first
    // run seeds history silently — no chime storm for pre-existing unread) AND
    // it is unread.
    const known = new Set(state.ids);
    const fresh = firstRun ? [] : items.filter((n) => !n.read && !known.has(n.id));

    const nextState: EngineState = { ids: [...known, ...items.map((n) => n.id)], lastTs: Math.max(state.lastTs, maxCreated) };
    saveState(nextState);

    if (fresh.length > 0 && claimAlertLock()) {
      playNotificationChime();
      for (const n of fresh.slice(0, 3)) {
        toast(n.title || "New notification", {
          description: [n.body, timeLabel((n as Notification & { createdAt?: string }).createdAt ?? n.time)]
            .filter(Boolean)
            .join(" · "),
        });
      }
      if (fresh.length > 3) {
        toast(`${fresh.length - 3} more new notification${fresh.length - 3 === 1 ? "" : "s"}`, {
          description: "Open the Notification Center to review them.",
        });
      }
    }

    applyTitleBadge(items.filter((n) => !n.read).length);
    window.dispatchEvent(new CustomEvent("fleetopsx:notifications-refresh", { detail: { count: items.length } }));
  } catch {
    /* offline / 401 — badge poller handles session cleanup */
  } finally {
    polling = false;
  }
}

/** Mount ONCE in the app shell. Idle on public/login routes. */
export function useNotificationEngine() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const inApp =
      pathname.startsWith("/workspace/app") || pathname.startsWith("/workspace/customer-portal");
    const onAuthPage = pathname.includes("/login") || pathname.includes("/forgot-password");
    if (!inApp || onAuthPage || typeof window === "undefined") return;

    void pollOnce();
    const id = window.setInterval(() => void pollOnce(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pathname]);

  // Prime the chime on the first user gesture (browser autoplay policy).
  useEffect(() => {
    const prime = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", prime, { capture: true, once: true });
    window.addEventListener("keydown", prime, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", prime, { capture: true });
      window.removeEventListener("keydown", prime, { capture: true });
    };
  }, []);

  // Hard logout must clear engine history so a different user starts fresh.
  useEffect(() => {
    const onLogout = () => {
      try {
        localStorage.removeItem(STATE_KEY);
      } catch {
        /* ignore */
      }
      applyTitleBadge(0);
    };
    window.addEventListener("fleetopsx:logged-out", onLogout);
    return () => window.removeEventListener("fleetopsx:logged-out", onLogout);
  }, []);
}
