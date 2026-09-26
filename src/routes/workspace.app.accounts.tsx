import { createFileRoute, redirect } from "@tanstack/react-router";
import { TmAccounts } from "@/components/fleetopsx/tm-accounts";
import { authService } from "@/lib/fleetopsx/services";

/**
 * Accounts — the Transport Manager's side of the money, one department.
 *
 * The page holds the department's boards as tabs, the way Engineering's three
 * boards read under one department: Direct Expense (the per-dispatch cost
 * sheets), Indirect Expense (spare parts, repairs & maintenance, tires & rims,
 * other expenses) and Estimates & Depreciation (the standing assumptions).
 *
 * Guarded like every other module: the page exists for the roles that own the
 * money. The Accounts department's own side — paying and entering the bank
 * reference — is a separate build.
 */
const ALLOWED = ["Transport Manager", "Platform Admin", "Accounts"];

export const Route = createFileRoute("/workspace/app/accounts")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => ALLOWED.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: TmAccounts,
});
