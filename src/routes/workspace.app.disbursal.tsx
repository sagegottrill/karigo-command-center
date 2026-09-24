import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountsDisbursal } from "@/components/fleetopsx/accounts-disbursal";
import { authService } from "@/lib/fleetopsx/services";

/**
 * Dispatch Disbursal — the Accounts department's home board.
 *
 * The desk that pays. The Transport Manager's side ENDORSES a dispatch's cost
 * sheet (see /workspace/app/accounts); this is where the money moves, which is
 * why it is the Accounts department's own portal rather than a page of his.
 */
const ALLOWED = ["Accounts", "Accountant", "Platform Admin"];

export const Route = createFileRoute("/workspace/app/disbursal")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((role: string) => ALLOWED.includes(role))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: AccountsDisbursal,
});
