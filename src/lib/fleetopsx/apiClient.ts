/**
 * Production API client for FleetOpsX → Hetzner backend.
 *
 * Browser: prefer same-origin `/api` (Vercel rewrite / Vite proxy) to avoid mixed-content.
 * SSR: hit the absolute backend URL.
 */

const TOKEN_KEY = "fleetopsx_token";
const USER_KEY = "fleetopsx_user_id";
const ROLES_KEY = "fleetopsx_roles";
const USER_PROFILE_KEY = "fleetopsx_user";

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/** Absolute backend origin used for SSR and as rewrite target. */
export const BACKEND_API_ORIGIN = trimSlash(
  (import.meta.env.VITE_API_ORIGIN as string | undefined) || "http://2.28.45.216/api",
);

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv) return trimSlash(fromEnv);

  if (typeof window === "undefined") {
    return BACKEND_API_ORIGIN;
  }

  // Same-origin proxy in production / local Vite
  return "/api";
}

/** When true, services may fall back to localStorage mock (local/dev only). */
export function allowMockFallback(): boolean {
  return import.meta.env.VITE_USE_MOCK === "true";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setStoredUser(user: unknown | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_PROFILE_KEY);
}

export function getStoredUser<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLES_KEY);
  localStorage.removeItem(USER_PROFILE_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${getApiBaseUrl()}${path}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && !path.includes("/auth/login")) {
      clearSession();
      const next = `${window.location.pathname}${window.location.search}`;
      if (!window.location.pathname.includes("/workspace/login")) {
        window.location.assign(`/workspace/login?next=${encodeURIComponent(next)}`);
      }
    }
    const message =
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
      (data && typeof data === "object" && "message" in data && String((data as { message: unknown }).message)) ||
      `API Error: ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(endpoint: string) => fetchApi<T>(endpoint),
  post: <T = unknown>(endpoint: string, body?: unknown) =>
    fetchApi<T>(endpoint, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T = unknown>(endpoint: string, body?: unknown) =>
    fetchApi<T>(endpoint, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(endpoint: string, body?: unknown) =>
    fetchApi<T>(endpoint, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T = unknown>(endpoint: string) => fetchApi<T>(endpoint, { method: "DELETE" }),
};

/** @deprecated Prefer getApiBaseUrl(); kept for older imports */
export const API_URL = typeof window !== "undefined" ? "/api" : BACKEND_API_ORIGIN;
