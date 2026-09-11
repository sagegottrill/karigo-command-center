import { redirect } from "@tanstack/react-router";

/**
 * Old Karigo prototype screens (PageHeader / DataTable UI).
 * Production Figma portals must never render these — bounce to Overview.
 */
export function redirectLegacyKarigoRoute(): never {
  throw redirect({ to: "/workspace/app" });
}
