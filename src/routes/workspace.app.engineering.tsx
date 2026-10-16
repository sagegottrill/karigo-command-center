import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * THE MERGED ENGINEERING PAGE.
 *
 * The old Work Orders board (/engineering) was folded into the single
 * Engineering page (/engineering-requests) — the department is ONE board now:
 * requests first, then the maintenance queues, log and the official report.
 * This file keeps the old URL alive: notifications, role homes and links that
 * still point at the work-orders board land on the right page.
 */
export const Route = createFileRoute("/workspace/app/engineering")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/app/engineering-requests", replace: true });
  },
});
