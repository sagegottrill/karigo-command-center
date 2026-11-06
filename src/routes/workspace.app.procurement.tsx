import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

/**
 * The procurement department shell. It paints nothing of its own: the desk is
 * the index page and the desk's inventory hangs off it, so both live under one
 * rail while each keeps its own address.
 */
export const Route = createFileRoute("/workspace/app/procurement")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = [
      "Procurement",
      "Procurement Officer",
      "Procurement Manager",
      "Procurement Clerk",
      "Head of Procurement",
      "Purchasing Officer",
      "Buyer",
      "Transport Manager",
      "Platform Admin",
      "Engineering",
      "Parts & Store",
      "Inventory",
    ];
    if (!authService.getRoles().some((r: string) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: () => <Outlet />,
});
