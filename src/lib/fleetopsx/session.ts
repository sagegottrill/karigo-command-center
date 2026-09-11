/**
 * Hard session boundaries for production — clear storage and leave history stack.
 */
import { clearSession, getStoredUser, getToken } from "./apiClient";

export function hasLiveSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getToken() && getStoredUser());
}

/** Clear JWT + profile and replace the document so Back cannot re-enter another role. */
export function hardLogout(loginPath = "/workspace/login") {
  clearSession();
  if (typeof window === "undefined") return;
  window.location.replace(loginPath);
}

/** After successful login, enter the app without leaving an authenticated history entry behind. */
export function enterAuthenticatedApp(path = "/workspace/app") {
  if (typeof window === "undefined") return;
  window.location.replace(path);
}

/** Guard against bfcache / Back restoring a logged-out shell. */
export function installSessionGuards() {
  if (typeof window === "undefined") return () => {};

  const enforce = () => {
    const path = window.location.pathname;
    if (path.startsWith("/workspace/app") && !hasLiveSession()) {
      window.location.replace("/workspace/login");
      return;
    }
    if (
      path.startsWith("/workspace/customer-portal") &&
      !path.includes("/login") &&
      !hasLiveSession()
    ) {
      window.location.replace("/workspace/customer-portal/login");
    }
  };

  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) enforce();
  };

  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", enforce);
  return () => {
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("focus", enforce);
  };
}
