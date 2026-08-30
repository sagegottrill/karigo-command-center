import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

export const getHostnameServerFn = createServerFn({ method: "GET" }).handler(async () => {
  const host = getRequestHost();
  if (host) {
    return host.split(":")[0]; // Remove port if present

  }
  return "";
});

export const isAppSubdomain = (hostname: string) => {
  if (!hostname) return false;
  // Local development fallback
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // You can toggle this for local testing, but usually localhost means apex domain
    // To test app subdomain locally, use something like lvh.me (e.g. app.lvh.me)
    return false; 
  }
  return hostname.startsWith("app.");
};

export const getTenantSlug = () => {
  if (typeof window === "undefined") return ""; // Server-side fallback
  const hostname = window.location.hostname;
  
  if (hostname === "petroline.fleetopsx.com") return "petrolline";
  if (hostname.includes("fleetopsx.com")) {
    const parts = hostname.split(".");
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  }
  if (hostname.endsWith(".localhost")) return hostname.split(".")[0] || "";
  
  return "";
};
