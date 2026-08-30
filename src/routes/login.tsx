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
    toast.success("Welcome back", { description: `Signed in as ${user.roleName}` });
    if (user.role === "Customer Portals (External)") {
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
    if (userContext.role === "Customer Portals (External)") {
      navigate({ to: "/customer-portal/dashboard" });
    } else {
      navigate({ to: "/app" });
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-black/[0.06] bg-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(0,113,227,0.1),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          {tenantLogo ? (
            <div className="inline-flex items-center w-max">
              <img src={tenantLogo} alt={tenantName} className="h-12 w-auto object-contain max-w-[200px]" />
            </div>
          ) : (
            <div className="inline-flex items-center gap-3 rounded-[14px] px-3 py-2 w-max">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1d1d1f] text-lg font-bold text-white shadow-lg">
                {tenantName.charAt(0)}
              </div>
              <span className="text-xl font-bold tracking-tight text-[#1d1d1f]">
                {tenantName}
              </span>
            </div>
          )}
          <div>
            <h1 className="max-w-md text-[36px] leading-[1.1] font-semibold tracking-[-0.03em]">
              Run fleet ops from one place
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Trips, fuel, workshop, expenses and gate logs — all in one place.
            </p>
          </div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{tenantName} PORTAL</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
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
            <Button type="submit" className="h-11 w-full rounded-full text-[14px]">Update & Continue</Button>
          </form>
        ) : (
          <form className="w-full max-w-sm space-y-5" onSubmit={handleLogin}>
            <div>
              <h2 className="text-[28px] font-semibold tracking-[-0.025em]">Sign in</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Use your work email or username to continue.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Workspace</Label>
              <Select value={workspace} onValueChange={setWorkspace}>
                <SelectTrigger className="h-11 rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
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
            <Button type="submit" className="h-11 w-full rounded-full text-[14px]">Sign in</Button>
          </form>
        )}
      </div>
    </div>
  );
}
