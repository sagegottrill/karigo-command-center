import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { authService, tenantService } from "@/lib/fleetopsx/services";
import { Truck } from "lucide-react";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";

export const Route = createFileRoute("/workspace/customer-portal/login")({
  loader: async () => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug === "localhost" || slug === "fleetopsx") return { tenant: null };
    const tenant = await tenantService.getBySlug(slug);
    return { tenant };
  },
  component: CustomerLogin,
});

function CustomerLogin() {
  const { tenant } = Route.useLoaderData();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await authService.login(username);
    if (!user) {
      toast.error("Invalid credentials.");
      return;
    }
    if (!user.roles.includes("Customer Portals (External)")) {
      toast.error("Access denied. Please use the main employee login portal.");
      authService.logout();
      return;
    }
    
    toast.success("Welcome back", { description: `Signed in as ${user.name}` });
    navigate({ to: "/workspace/customer-portal/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex flex-col items-center border-b border-gray-100 bg-gray-50/50 p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white shadow-sm">
            <Truck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {tenant?.name || "Partner"} Portal
          </h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to manage your shipments and requests.</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your email"
                autoComplete="username"
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/" className="text-xs font-medium text-black hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" className="w-full rounded-xl" size="lg">
              Sign In to Portal
            </Button>
          </form>
          
          <div className="mt-8 text-center text-xs text-gray-400">
            <p>Powered by FleetOpsX</p>
          </div>
        </div>
      </div>
    </div>
  );
}

