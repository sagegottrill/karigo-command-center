import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";
    
    return {
      meta: [
        { title: `Reset password | ${tenantName}` },
        { name: "description", content: `Reset your ${tenantName} password.` },
        { property: "og:title", content: `Reset password | ${tenantName}` },
        { property: "og:description", content: `Reset your ${tenantName} password.` },
      ],
    };
  },
  component: ForgotPasswordPage,
});

import { Route as RootRoute } from "./__root";

function ForgotPasswordPage() {
  const { tenantName } = RootRoute.useRouteContext();
  const [sent, setSent] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
          toast.success("Check your email", {
            description: "If that account exists, we sent a reset link.",
          });
        }}
      >
        <Link to="/login" className="text-[13px] text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">{tenantName}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Enter the email on your account and we will send a reset link.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px]">Email</Label>
          <Input type="email" required defaultValue="okwudili.fortune@petroline.ng" className="h-11 rounded-xl text-[13px]" />
        </div>
        <Button type="submit" className="h-11 w-full rounded-full text-[14px]">
          {sent ? "Send again" : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
