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
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [sent, setSent] = useState(false);

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* Left Sidebar (Dark) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1B2432] p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.05),transparent_60%)]" />
        
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            {tenantLogo ? (
              <div className="mb-12 inline-flex items-center w-max rounded-2xl bg-white/5 p-4 border border-white/10 backdrop-blur-sm">
                <img src={tenantLogo} alt={tenantName} className="h-12 w-auto object-contain max-w-[200px]" />
              </div>
            ) : (
              <div className="mb-12 inline-flex items-center gap-3 rounded-[14px] px-3 py-2 w-max">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-[#1B2432] shadow-lg">
                  {tenantName.charAt(0)}
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  {tenantName}
                </span>
              </div>
            )}

            <p className="text-[13px] font-medium text-slate-400 mb-2">Welcome to {tenantName} Portal</p>
            <h1 className="max-w-md font-space-grotesk text-[36px] font-bold leading-[1.1] tracking-[-0.03em] text-white">
              Manage your fleet operation with confidence
            </h1>
            <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-slate-300 font-medium">
              Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="h-1 w-12 bg-orange-500 rounded-full"></div>
             <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">POWERED BY FLEETOPSX | COPYRIGHT 2026</p>
          </div>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex items-center justify-center p-6 bg-white relative">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
            toast.success("Check your email", {
              description: "If that account exists, we sent a reset link.",
            });
          }}
        >
          <Link to="/login" className="inline-block text-[13px] font-medium text-slate-500 hover:text-[#141a1f] transition-colors mb-2">
            &larr; Back to sign in
          </Link>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight text-[#141a1f]">Reset Password</h2>
            <p className="mt-1.5 text-[14px] text-slate-500">
              Enter the email on your account and we will send a reset link.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-[#141a1f]">Email Address</Label>
            <Input type="email" required placeholder="name@company.com" defaultValue="okwudili.fortune@petroline.ng" className="h-11 rounded-xl text-[14px]" />
          </div>
          <Button type="submit" className="h-11 w-full rounded-full bg-orange-500 hover:bg-orange-600 text-white text-[14px] mt-2 transition-colors">
            {sent ? "Send again" : "Send reset link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
