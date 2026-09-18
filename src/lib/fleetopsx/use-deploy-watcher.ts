import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Tell a long-lived tab when a new build is live.
 *
 * The app is a single-page app: a tab that was opened before a deploy keeps
 * running that old bundle until somebody reloads it, so fixes that ARE live look
 * like they never shipped — three times now the same "it's still broken" report
 * turned out to be a tab that predated the deploy.
 *
 * Each tab therefore compares the entry bundle it is running with the one the
 * server currently serves (`index.html` is `max-age=0, must-revalidate`, so a
 * plain re-fetch is the truth) and, when they differ, says so with a Reload
 * button instead of leaving the operator to guess.
 */

/** `/assets/index-8ApX5.js` — the hashed entry bundle, the app's build identity. */
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

const TOAST_ID = "fleetopsx-deploy-available";

/** The entry bundle THIS tab is running. */
function loadedEntry(): string | null {
  if (typeof document === "undefined") return null;
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  for (const s of scripts) {
    const match = s.src?.match(ENTRY_RE);
    if (match) return match[0];
  }
  return null;
}

/** The entry bundle the server serves RIGHT NOW. */
async function servedEntry(): Promise<string | null> {
  const res = await fetch("/", {
    cache: "no-store",
    headers: { accept: "text/html" },
  });
  if (!res.ok) return null;
  const match: RegExpMatchArray | null = (await res.text()).match(ENTRY_RE);
  return match ? match[0] : null;
}

export function useDeployWatcher() {
  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      // The guard is the entry bundle itself, not a DEV flag: dev serves modules
      // from /src and the SSR HTML has no `/assets/index-*.js`, so a development
      // tab finds nothing to compare and stays silent — while a test can still put
      // one in the page and watch this detect it.
      const loaded = loadedEntry();
      if (!loaded) return;
      try {
        const served = await servedEntry();
        if (!served || served === loaded || stopped) return;
        // Reuses one id, so repeated checks update the same notice instead of
        // stacking copies. Long enough to be read, short enough to dismiss itself
        // — it comes back the next time the operator returns to the tab.
        toast("A new version of FleetOpsX is available", {
          id: TOAST_ID,
          duration: 25_000,
          description: "This tab is still running the previous build. Reload to pick up the latest fixes.",
          action: { label: "Reload now", onClick: () => window.location.reload() },
        });
      } catch {
        // Offline or the server blipped — try again on the next tick.
      }
    };

    // Re-check when the operator comes back to the tab, so the notice is waiting
    // for them rather than arriving mid-typing.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // Slow backstop for a tab that is never switched away from; the real trigger
    // is the operator coming back to it.
    const timer = window.setInterval(() => void check(), 600_000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
