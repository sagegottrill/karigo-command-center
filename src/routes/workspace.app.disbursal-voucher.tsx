import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountsVouchers } from "@/components/fleetopsx/accounts-vouchers";
import { authService } from "@/lib/fleetopsx/services";

/**
 * Disbursal Voucher — the Accounts department's register of certificates issued.
 *
 * The second page of the desk that pays: every dispatch it has disbursed, who
 * paid it and how, with the certificate printable from the record itself.
 */
const ALLOWED = ["Accounts", "Accountant", "Platform Admin"];

export const Route = createFileRoute("/workspace/app/disbursal-voucher")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((role: string) => ALLOWED.includes(role))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: AccountsVouchers,
});
