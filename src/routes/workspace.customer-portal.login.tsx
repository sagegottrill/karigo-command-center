import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UserRound, KeyRound } from "lucide-react";
import { authService, tenantService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";

export const Route = createFileRoute("/workspace/customer-portal/login")({
  loader: async () => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug === "localhost" || slug === "fleetopsx") return { tenant: null };
    const tenant = await tenantService.getBySlug(slug);
    return { tenant };
  },
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Partner";
    return {
      meta: [
        { title: `Partner Sign in | ${tenantName}` },
        { name: "description", content: `Sign in to your ${tenantName} partner workspace.` },
      ],
    };
  },
  component: CustomerLogin,
});

function CustomerLogin() {
  const { tenant } = Route.useLoaderData();
  const navigate = useNavigate();
  const [username, setUsername] = useState("J.Doe");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loginError, setLoginError] = useState(false);

  const tenantName = tenant?.name || "Partner";
  const tenantLogo = tenant?.logoUrl || null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    const user = await authService.login(username);
    if (!user) {
      setLoginError(true);
      toast.error("Invalid credentials.");
      return;
    }
    if (!user.roles.includes("Customer Portals (External)")) {
      setLoginError(true);
      toast.error("Access denied. Please use the main employee login portal.");
      authService.logout();
      return;
    }
    
    toast.success("Welcome back", { description: `Signed in as ${user.name}` });
    navigate({ to: "/workspace/customer-portal/dashboard" });
  };

  return (
    <div className="flex min-h-screen bg-[#ffffff] w-full font-['Inter',sans-serif]">
      {/* Left Sidebar (Dark) */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-[720px] pt-[68px] pb-[68px] px-[67px] text-[#ffffff] h-screen justify-between shrink-0">
        <div className="flex flex-col w-[586px] gap-[75px]">
          <div>
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[60px] object-contain" />
            ) : (
              <img src="/logo.png" alt="Petroline Transport Ltd" className="w-[178px] h-[60px] object-contain" />
            )}
          </div>

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff] mb-[14px]">
              Welcome to {tenantName === "Partner" ? "Petroline" : tenantName} Portal
            </h2>
            <h1 className="text-[64px] font-[700] leading-[72px] text-[#ffffff] w-[467px] font-['Space_Grotesk',sans-serif]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] w-[586px]">
              Centralized portal for {tenantName === "Partner" ? "Petroline" : tenantName} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>
        
        <div className="mt-auto">
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#ffffff] w-full h-screen">
        {/* Card */}
        <div 
          className="w-[500px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[32px] pb-[32px] px-[32px] gap-[24px]"
          style={{ boxShadow: "0px 10px 40px rgba(0, 0, 0, 0.08)" }}
        >
          
          <div className="flex flex-col gap-[14px] w-full">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f]">Partner Company Portal Sign In</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470]">
              Sign in to manage your shipments and requests.
            </p>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-[24px]" onSubmit={handleLogin}>
            
            {loginError && (
              <div className="flex w-[436px] items-center p-[16px] gap-[10px] rounded-[4px] border-[1px] border-[#ed351d] bg-[#fdf2f1]">
                <p className="text-[14px] font-[400] leading-[20px] text-[#ed351d]">
                  Invalid username or password. Please contact the Transport Manager.
                </p>
              </div>
            )}

            {/* Username Input */}
            <div className="flex flex-col gap-[8px] w-[436px]">
              <label className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">
                Username
              </label>
              <div className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#141a1f] bg-[#ffffff] h-[36px]">
                <UserRound className="w-[16px] h-[16px] text-[#141a1f]" />
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="example: J.Doe"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[20px] text-[#141a1f] placeholder-[#8e95a1]" 
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-[8px] w-[436px]">
              <label className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">
                Password
              </label>
              <div className="flex flex-row items-center py-[8px] px-[12px] gap-[10px] rounded-[4px] border-[1px] border-[#141a1f] bg-[#ffffff] h-[36px]">
                <KeyRound className="w-[16px] h-[16px] text-[#141a1f]" />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="*********"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[20px] text-[#141a1f] placeholder-[#8e95a1]" 
                />
              </div>
            </div>

            {/* Keep me signed in & Forgot Password */}
            <div className="flex flex-row items-center justify-between w-[436px] mt-[-8px]">
              <div className="flex flex-row gap-[10px] items-center cursor-pointer" onClick={() => setKeepSignedIn(!keepSignedIn)}>
                <div className={`w-[16px] h-[16px] rounded-[4px] border-[1px] flex items-center justify-center ${keepSignedIn ? 'border-[#ed351d] bg-[#ed351d]' : 'border-[#e2e5e9] bg-transparent'}`}>
                  {keepSignedIn && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-[14px] font-[400] leading-[20px] text-[#141a1f]">Keep me signed in</span>
              </div>
              <Link to="/workspace/forgot-password" className="text-[14px] font-[400] leading-[20px] text-[#141a1f] hover:underline">
                Forgot Password?
              </Link>
            </div>

            {/* Submit Button */}
            <button type="submit" className="flex flex-row items-center justify-center py-[10px] px-[16px] rounded-[4px] bg-[#f5a89e] w-[436px] hover:bg-[#f3988c] transition-colors mt-[8px]">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Sign In</span>
            </button>
          </form>

          <div className="w-full h-[1px] bg-[#e2e5e9] my-[8px]"></div>
          
          <p className="text-[11px] font-[400] leading-[14px] text-[#8e95a1] tracking-[0.05em] text-center w-full uppercase">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}

