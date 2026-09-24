import { createFileRoute, redirect } from "@tanstack/react-router";
import { TmVouchers } from "@/components/fleetopsx/tm-vouchers";
import { authService } from "@/lib/fleetopsx/services";

/**
 * Accounts — Direct Cost Vouchers.
 *
 * This path used to be a legacy Karigo redirect ("not shipped in current
 * portals"). It is now the department the Transport Manager authorises direct
 * disbursals from: one voucher per dispatch that carries a cost sheet, with his
 * approve or decline recorded against that dispatch (see TmVouchers).
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
  component: TmVouchers,
});
