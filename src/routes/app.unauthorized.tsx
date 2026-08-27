import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/unauthorized")({
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-critical" />
      <h1 className="mb-2 text-xl font-bold tracking-tight text-foreground">Unauthorized Access</h1>
      <p className="mb-6 max-w-[400px] text-sm text-muted-foreground">
        Your current role does not have permission to view this page. If you believe this is a mistake, contact your administrator.
      </p>
      <Button asChild>
        <Link to="/app">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
