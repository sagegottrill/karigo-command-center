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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border bg-surface lg:block">
        <div className="grid-backdrop absolute inset-0 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">K</span>
            <span className="text-sm font-semibold tracking-[0.2em] uppercase">Karigo</span>
          </span>
          <div>
            <h1 className="max-w-md text-4xl leading-tight font-semibold uppercase">The digital command center for modern transport operations</h1>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Fleet, dispatch, fuel, engineering, inventory, accounts and gate control in one accountable enterprise environment.
            </p>
          </div>
          <p className="num text-[11px] text-muted-foreground">Forah Technology · Prototype v1.0</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("Signed in", { description: `Workspace ${workspace}` });
            navigate({ to: "/app" });
          }}
        >
          <div>
            <h2 className="text-2xl font-semibold uppercase">Sign in</h2>
            <p className="mt-1 text-xs text-muted-foreground">Access your transport workspace.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company workspace</Label>
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{WORKSPACES.map((w) => <SelectItem key={w.id} value={w.id} className="text-xs">{w.name} · {w.id}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" required defaultValue="okwudili.fortune@petroline.ng" className="h-9 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <Input type="password" required defaultValue="karigo-demo" className="h-9 text-xs" />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox defaultChecked /> Remember me
            </label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" className="h-9 w-full gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" />Sign In</Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" /> Role-based access · audited sessions
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Back to karigo.com.ng</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
