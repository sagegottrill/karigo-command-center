import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKSPACES, ROLES } from "@/lib/fleetopsx/mock-data";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in | FLEETOPSX" },
      { name: "description", content: "Sign in to your FLEETOPSX workspace." },
      { property: "og:title", content: "Sign in | FLEETOPSX" },
      { property: "og:description", content: "Sign in to your FLEETOPSX workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!.id);

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-black/[0.06] bg-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(0,113,227,0.1),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="inline-flex items-center rounded-[14px] bg-[#0a0a0a] px-3 py-2">
            <img
              src={`${import.meta.env.BASE_URL}fleetopsx.png`}
              alt="FLEETOPSX"
              className="h-8 w-auto max-w-[160px] object-contain object-left"
            />
          </div>
          <div>
            <h1 className="max-w-md text-[36px] leading-[1.1] font-semibold tracking-[-0.03em]">
              Run fleet ops from one place
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Trips, fuel, workshop, expenses and gate logs — all in one place.
            </p>
          </div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground">FLEETOPSX</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const selectedRole = formData.get("role") as string;
            authService.setRole(selectedRole || "Super Admin");
            toast.success("Welcome back", { description: `Signed in as ${selectedRole}` });
            navigate({ to: "/app" });
          }}
        >
          <div>
            <h2 className="text-[28px] font-semibold tracking-[-0.025em]">Sign in</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Use your work email to continue.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Workspace</Label>
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger className="h-11 rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{WORKSPACES.map((w) => <SelectItem key={w.id} value={w.id} className="text-[13px]">{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Identity / Role (Mock Login)</Label>
            <Select defaultValue={ROLES[2]?.name} name="role">
              <SelectTrigger className="h-11 rounded-xl text-[13px]"><SelectValue placeholder="Select identity" /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.key} value={r.name} className="text-[13px]">{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Checkbox defaultChecked /> Keep me signed in
            </label>
            <Link to="/forgot-password" className="text-[13px] text-foreground underline-offset-2 hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" className="h-11 w-full rounded-full text-[14px]">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
