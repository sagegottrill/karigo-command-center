import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Karigo TMS" },
      { name: "description", content: "Request a password reset link for your Karigo workspace." },
      { property: "og:title", content: "Reset Password — Karigo TMS" },
      { property: "og:description", content: "Request a password reset link for your Karigo workspace." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
          toast.success("Password reset link sent", {
            description: "Check your inbox for the prototype reset email.",
          });
        }}
      >
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Reset Password</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the email associated with your workspace account.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" required defaultValue="okwudili.fortune@petroline.ng" className="h-9 text-xs" />
        </div>
        <Button type="submit" className="h-9 w-full gap-1.5 text-xs">
          <Mail className="h-3.5 w-3.5" />
          {sent ? "Resend Reset Link" : "Reset Password"}
        </Button>
        {sent && (
          <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
            Reset instructions simulated. In production this would be delivered by email.
          </p>
        )}
      </form>
    </div>
  );
}
