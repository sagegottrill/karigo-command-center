import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UserRound, KeyRound, Server } from "lucide-react";
import { authService } from "@/lib/fleetopsx/services";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/superadmin/login")({
  head: () => ({
    meta: [
      { title: "Platform Admin Login | FleetOpsX" },
    ],
  }),
  component: SuperAdminLoginPage,
});

function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loginError, setLoginError] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    try {
      const user = await authService.login(username, password);
      if (!user || !user.roles.includes("Platform Admin")) {
        setLoginError(true);
        toast.error("Invalid credentials or unauthorized.");
        return;
      }
      authService.setRoles(user.roles ?? []);
      toast.success(`Welcome back, ${user.name}`);
      navigate({ to: "/superadmin" });
    } catch (err) {
      setLoginError(true);
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Check API connectivity.");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1B2432] lg:bg-[#f1f2f4] w-full font-['Inter',sans-serif]">
      {/* Right Content (Centered) */}
      <div className="flex flex-col justify-center items-center bg-[#1B2432] lg:bg-[#f1f2f4] w-full h-screen px-[24px] lg:px-0">
        
        {/* Card */}
        <div 
          className="w-full max-w-[450px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[40px] pb-[40px] px-[24px] md:px-[40px] gap-[24px]"
          style={{ boxShadow: "0px 10px 40px rgba(0, 0, 0, 0.08)" }}
        >
          <div className="flex flex-col items-center gap-[14px] w-full text-center mb-4">
            <div className="w-[48px] h-[48px] rounded-full bg-[#1B2432] text-white flex items-center justify-center mb-2">
              <Server className="w-[24px] h-[24px]" />
            </div>
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Platform Admin Login</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">
              System administration and tenant management.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-[24px] w-full">
            <div className="flex flex-col gap-[16px] w-full">
              {/* Username Input */}
              <div className="relative">
                <label className="text-[14px] font-[500] leading-[20px] text-[#141a1f] mb-2 block">Username or Email</label>
                <div className="relative">
                  <span className="absolute left-[12px] top-1/2 -translate-y-1/2 text-[#a0a6b1]">
                    <UserRound size={20} strokeWidth={2} />
                  </span>
                  <input
                    type="text"
                    placeholder="Enter your username"
                    className="h-[44px] w-full border-[1px] border-[#e2e5e9] rounded-[4px] pl-[40px] pr-[12px] text-[15px] focus:outline-none focus:border-[#e3351d] transition-colors"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="relative">
                <label className="text-[14px] font-[500] leading-[20px] text-[#141a1f] mb-2 block">Password</label>
                <div className="relative">
                  <span className="absolute left-[12px] top-1/2 -translate-y-1/2 text-[#a0a6b1]">
                    <KeyRound size={20} strokeWidth={2} />
                  </span>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    className="h-[44px] w-full border-[1px] border-[#e2e5e9] rounded-[4px] pl-[40px] pr-[12px] text-[15px] focus:outline-none focus:border-[#e3351d] transition-colors"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Keep me signed in & Forgot Password */}
              <div className="flex justify-between items-center mt-2">
                <label className="flex items-center gap-[8px] cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="w-[16px] h-[16px] rounded-[4px] border-[#e2e5e9] text-[#e3351d] focus:ring-[#e3351d]"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                  />
                  <span className="text-[14px] font-[400] text-[#5c6470]">Keep me signed in</span>
                </label>
                <a href="#" className="text-[14px] font-[500] text-[#e3351d] hover:underline">
                  Forgot Password?
                </a>
              </div>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full h-[48px] bg-[#e3351d] hover:bg-[#d62e19] text-[#ffffff] text-[16px] font-[600] rounded-[6px] transition-colors mt-2"
            >
              Sign In to Platform Admin
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
