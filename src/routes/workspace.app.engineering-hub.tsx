import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * THE MERGED ENGINEERING PAGE.
 *
 * The old structure was three doors into the same department: Work Orders
 * (/engineering), Maintenance Hub (/engineering-hub) and the Authorization
 * page (/engineering-requests). The department is ONE board now — requests
 * first, then the maintenance queues, log and report — so both old routes land
 * on it. This file keeps the URL alive for anything that still links here
 * (notifications, role homes, bookmarks).
 */
export const Route = createFileRoute("/workspace/app/engineering-hub")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/app/engineering-requests", replace: true });
  },
});
