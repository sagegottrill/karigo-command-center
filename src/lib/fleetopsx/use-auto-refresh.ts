import { useEffect } from "react";

type Options = {
  /** Milliseconds between polls (default 10s). */
  interval?: number;
  /** Skip polling entirely (e.g. no live session). */
  enabled?: boolean;
  /** Refire only while the tab is visible (default true). */
  onlyWhenVisible?: boolean;
};

/**
 * Near-real-time page refresh: polls every 10s (+ on focus / tab-visible) so
 * new data appears without a manual browser refresh. Visibility-gated so a
 * background tab on mobile doesn't hammer the API.
 */
export function useAutoRefresh(fn: () => void, deps: unknown[] = [], options: Options = {}) {
  const { interval = 10_000, enabled = true, onlyWhenVisible = true } = options;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (onlyWhenVisible && document.visibilityState === "hidden") return;
      fn();
    }, interval);

    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    const onFocus = () => fn();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
