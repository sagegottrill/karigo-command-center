import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, tenantSlug: "", tenantName: "", tenantLogo: null },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // STALE-TAB SELF-HEAL (29 Oct 2026): a portal tab left open since before a
  // deploy keeps its old bundle. The first navigation to a not-yet-visited
  // route then asks the CDN for a lazy chunk that no longer exists, the import
  // fails, and the page sits there fully painted but inert — the "Security
  // Module is not functioning / TM too, the buttons are no longer responding"
  // afternoon. One automatic reload picks up the fresh bundle; the flag keeps
  // a genuinely broken deploy from looping forever, and clears once the fresh
  // page has been alive for a few seconds so the next deploy can self-heal too.
  if (typeof window !== "undefined") {
    const RELOAD_FLAG = "fleetopsx_chunk_reload";
    const reloadOnce = () => {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", (event) => {
      event.preventDefault();
      reloadOnce();
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = String((event as PromiseRejectionEvent).reason?.message || event.reason || "");
      if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(reason)) {
        reloadOnce();
      }
    });
    window.setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 10_000);
  }

  return router;
};
