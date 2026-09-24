import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/app/unauthorized")({
  component: UnauthorizedPage,
});

/** Each department's home so "Return to Dashboard" never loops back into a blocked page. */
function homeForRoles(roles: string[]): string {
  if (roles.includes("Tracking")) return "/workspace/app/active-dispatch";
  if (roles.includes("Security")) return "/workspace/app/gate";
  if (roles.includes("Fleet Operations")) return "/workspace/app/dispatch";
  // The store departments land on their own boards, never on the TM's Central
  // Dashboard (which would bounce a department role straight back here).
  if (roles.some((r) => /^parts & store$|^parts and store$/i.test(r))) return "/workspace/app/parts";
  if (roles.some((r) => /^inventory$|head of inventory|store floor attendant/i.test(r))) return "/workspace/app/inventory-desk";
  if (roles.includes("Engineering")) return "/workspace/app/engineering";
  if (roles.includes("HR")) return "/workspace/app/hr";
  if (roles.includes("Lubricant")) return "/workspace/app/lubricant-inventory";
  if (roles.includes("Loading")) return "/workspace/app/active-dispatch";
  return "/workspace/app";
}

function UnauthorizedPage() {
  const home = homeForRoles(authService.getRoles());
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-critical" />
      <h1 className="mb-2 text-xl font-bold tracking-tight text-foreground">Unauthorized Access</h1>
      <p className="mb-6 max-w-[400px] text-sm text-muted-foreground">
        Your current role does not have permission to view this page. If you believe this is a mistake, contact your administrator.
      </p>
      <Button asChild>
        <Link to={home}>Return to Dashboard</Link>
      </Button>
    </div>
  );
}
