/**
 * Hard session boundaries for production — clear storage and leave history stack.
 */
import { clearSession, getStoredUser, getToken } from "./apiClient";

const PARTNER_ROLE = "Customer Portals (External)";

export function hasLiveSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getToken() && getStoredUser());
}

export function isPartnerSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const rolesRaw = localStorage.getItem("fleetopsx_roles");
    const roles = rolesRaw ? (JSON.parse(rolesRaw) as string[]) : [];
    if (roles.includes(PARTNER_ROLE)) return true;
    const user = getStoredUser<{ roles?: string[] }>();
    return Boolean(user?.roles?.includes(PARTNER_ROLE));
  } catch {
    return false;
  }
}

/** Drop JWT/profile when switching Internal ↔ Partner (logo / account-type). */
export function clearPortalSession() {
  clearSession();
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
