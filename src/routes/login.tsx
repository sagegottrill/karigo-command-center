import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKSPACES } from "@/lib/karigo/mock-data";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Karigo TMS" },
      { name: "description", content: "Sign in to the Karigo transport command center workspace." },
      { property: "og:title", content: "Sign in — Karigo TMS" },
      { property: "og:description", content: "Sign in to the Karigo transport command center workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]!.id);

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border/70 bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground">K</span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">Karigo</span>
          </span>
          <div>
            <h1 className="max-w-md text-[40px] leading-[1.08] font-semibold tracking-[-0.03em]">
              The digital command center for modern transport operations
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Fleet, dispatch, fuel, engineering, inventory, accounts and gate control in one accountable enterprise environment.
            </p>
          </div>
          <p className="num text-[12px] text-muted-foreground">Forah Technology · Prototype v1.0</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Signed in", { description: `Workspace ${workspace}` });
            navigate({ to: "/app" });
          }}
        >
          <div>
            <h2 className="text-[28px] font-semibold tracking-[-0.025em]">Sign in</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Access your transport workspace.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Company workspace</Label>
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger className="h-11 rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{WORKSPACES.map((w) => <SelectItem key={w.id} value={w.id} className="text-[13px]">{w.name} · {w.id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Email</Label>
            <Input type="email" required defaultValue="okwudili.fortune@petroline.ng" className="h-11 rounded-xl text-[13px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Password</Label>
            <Input type="password" required defaultValue="karigo-demo" className="h-11 rounded-xl text-[13px]" />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Checkbox defaultChecked /> Remember me
            </label>
            <Link to="/forgot-password" className="text-[13px] text-primary hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" className="h-11 w-full gap-1.5 rounded-full text-[14px]"><Lock className="h-3.5 w-3.5" />Sign In</Button>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" /> Role-based access · audited sessions
          </p>
          <p className="text-center text-[13px] text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Back to karigo.com.ng</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
