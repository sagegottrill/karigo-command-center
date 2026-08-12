import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Marketing landing is stashed for now.
 * Restore from: src/stashed/landing-page.tsx.bak
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
