import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/login")({
  head: ({ routeContext }) => {
    // @ts-ignore - Route context is passed but type might not be fully inferred here depending on router version
    const tenantName = routeContext?.tenantName || "Workspace";
    
    return {
      meta: [
        { title: `Sign in | ${tenantName}` },
        { name: "description", content: `Sign in to your ${tenantName} workspace.` },
        { property: "og:title", content: `Sign in | ${tenantName}` },
        { property: "og:description", content: `Sign in to your ${tenantName} workspace.` },
      ],
    };
  },
  component: LoginPage,
});

import { Route as RootRoute } from "./__root";

function LoginPage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const WORKSPACES = authService.getWorkspaces();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!.id);
  const [username, setUsername] = useState("tbalogun");
  const [password, setPassword] = useState("password");
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [userContext, setUserContext] = useState<any>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await authService.login(username);
    if (!user) {
      toast.error("Invalid credentials or suspended account.");
      return;
    }
    if (user.passwordResetRequired) {
      setUserContext(user);
      setResetting(true);
      toast.info("Security Policy", { description: "You must change your default password to continue." });
      return;
    }
    toast.success("Welcome back", { description: `Signed in as ${user.roleNames.join(', ')}` });
    if (user.roles.includes("Customer Portals (External)")) {
      navigate({ to: "/customer-portal/dashboard" });
    } else {
      navigate({ to: "/app" });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    await authService.completeFirstTimeLogin(userContext.id);
    toast.success("Password updated successfully.");
    if (userContext.roles.includes("Customer Portals (External)")) {
      navigate({ to: "/customer-portal/dashboard" });
    } else {
      navigate({ to: "/app" });
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
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

      <div className="flex items-center justify-center p-6 bg-white">
        {resetting ? (
          <form className="w-full max-w-sm space-y-5" onSubmit={handleReset}>
            <div>
              <h2 className="text-[28px] font-semibold tracking-[-0.025em]">Set New Password</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                First-time login requires a password update to secure your account.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="h-11 rounded-xl text-[13px]"
              />
            </div>
            <Button type="submit" className="h-11 w-full rounded-full bg-orange-500 hover:bg-orange-600 text-white text-[14px]">
              Update & Continue
            </Button>
          </form>
        ) : (
          <form className="w-full max-w-sm space-y-5" onSubmit={handleLogin}>
            <div>
              <h2 className="text-[24px] font-semibold tracking-tight text-[#141a1f]">Internal Portal Sign In</h2>
              <p className="mt-1.5 text-[14px] text-slate-500">Enter your provisioned credentials to continue.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium text-[#141a1f]">Select Department</Label>
              <Select value={workspace} onValueChange={setWorkspace}>
                <SelectTrigger className="h-11 rounded-md text-[14px] border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>{WORKSPACES.map((w) => <SelectItem key={w.id} value={w.id} className="text-[13px]">{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Username</Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. tbalogun"
                className="h-11 rounded-xl text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl text-[13px]"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox defaultChecked /> Keep me signed in
              </label>
              <Link to="/forgot-password" className="text-[13px] text-foreground underline-offset-2 hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" className="h-11 w-full rounded-full bg-orange-500 hover:bg-orange-600 text-white text-[14px]">Sign in</Button>
          </form>
        )}
      </div>
    </div>
  );
}
