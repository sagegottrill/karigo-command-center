import { ApiError, getToken } from "@/lib/fleetopsx/apiClient";

/** JWT is only in browser localStorage — SSR must not call live APIs. */
export function hasBrowserAuth(): boolean {
  return typeof window !== "undefined" && !!getToken();
}

/**
 * Run a live API call only when the browser has a JWT.
 * Never throws 401/403 out of route loaders (that causes document 500 on SSR).
 */
export async function loadWithBrowserAuth<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!hasBrowserAuth()) return fallback;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return fallback;
    }
    console.error(err);
    return fallback;
  }
}
