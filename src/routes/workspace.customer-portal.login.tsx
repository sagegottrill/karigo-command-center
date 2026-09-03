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

  const tenantName = tenant?.name || "Partner";
  const tenantLogo = tenant?.logoUrl || null;

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
    <div className="grid min-h-screen bg-[#ffffff] lg:grid-cols-2">
      {/* Left Sidebar (Dark) - 720x1024 */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-full pt-[68px] pb-[68px] pl-[67px] pr-[67px] text-[#ffffff] h-full justify-between">
        <div className="w-[586px] flex flex-col gap-[75px]">
          <div>
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="w-[178px] h-[100px] object-contain" />
            ) : (
              <div className="text-[32px] font-bold tracking-tight text-[#ffffff]">
                {tenantName}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff] mb-[14px]">
              Welcome to {tenantName} Portal
            </h2>
            <h1 className="text-[64px] font-[700] leading-[72px] text-[#ffffff] w-[467px]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] w-[586px]">
              Centralized portal for {tenantName} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>
        
        <div className="mt-auto pt-[68px]">
           <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#ffffff] tracking-wide uppercase">
             {tenantName} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
           </p>
        </div>
      </div>

      {/* Right Content (White) */}
      <div className="flex flex-col justify-center items-center bg-[#ffffff] w-full h-full">
        {/* Background+Border */}
        <div className="w-[500px] h-[471.13px] border-[1px] border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[23.53px] pb-[24.06px] px-[24px] gap-[24px]">
          
          <div className="flex flex-col gap-[14px] w-full">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] h-[32px]">Partner Company Portal Sign In</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] h-[40px] w-[307px]">
              Sign in to manage your shipments and requests.
            </p>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-[24px]" onSubmit={handleLogin}>
            
            {/* Username Input */}
            <div className="flex flex-col gap-[12px] w-[449.87px] h-[62px]">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] h-[14px]">
                Username
              </label>
              <div className="flex flex-row items-center pt-[8.46px] pb-[8.47px] pl-[12.07px] pr-[12.07px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] w-[449.87px] h-[36px]">
                <UserRound className="w-[16px] h-[16px] text-[#5c6470]" />
                <input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder="example: J.Doe"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[16.94px] text-[#5c6470] placeholder-[#5c6470]" 
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-[12px] w-[449.87px] h-[62px]">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] h-[14px]">
                Password
              </label>
              <div className="flex flex-row items-center pt-[8.46px] pb-[8.47px] pl-[12.07px] pr-[12.07px] gap-[10px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#ffffff] w-[449.87px] h-[36px]">
                <KeyRound className="w-[16px] h-[16px] text-[#5c6470]" />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  placeholder="*********"
                  className="flex-1 bg-transparent border-none outline-none text-[14px] font-[400] leading-[16.94px] text-[#5c6470] placeholder-[#5c6470]" 
                />
              </div>
            </div>

            {/* Keep me signed in & Forgot Password */}
            <div className="flex flex-row items-center justify-between w-[450px] h-[17px]">
              <div className="flex flex-row gap-[10px] items-center cursor-pointer" onClick={() => setKeepSignedIn(!keepSignedIn)}>
                <div className={`w-[16px] h-[16px] rounded-[4px] border-[1px] flex items-center justify-center ${keepSignedIn ? 'border-[#ed351d] bg-[#ed351d]' : 'border-[#e2e5e9] bg-[#ffffff]'}`}>
                  {keepSignedIn && <div className="w-[8px] h-[8px] bg-white rounded-sm" />}
                </div>
                <span className="text-[14px] font-[400] leading-[16.94px] text-[#1b2432]">Keep me signed in</span>
              </div>
              <Link to="/workspace/forgot-password" className="text-[14px] font-[400] leading-[16.94px] text-[#1b2432] hover:underline">
                Forgot Password?
              </Link>
            </div>

            {/* OAuth Buttons & Divider */}
            <div className="flex flex-col gap-[16px] w-[450px]">
              <div className="flex flex-row items-center w-full justify-between h-[16px]">
                <div className="flex-1 border-t-[1.07px] border-[#e2e5e9]"></div>
                <div className="bg-[#ffffff] px-[8px]">
                  <span className="text-[12px] font-[400] leading-[16px] text-[#5c6470]">Or continue with</span>
                </div>
                <div className="flex-1 border-t-[1.07px] border-[#e2e5e9]"></div>
              </div>
              <div className="flex flex-row gap-[24px] w-[450px] h-[36px]">
                <button type="button" onClick={() => toast.info('GitHub auth not implemented')} className="flex flex-row justify-center items-center pt-[6.59px] pb-[7.41px] px-[26.31px] gap-[8px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#fafafa] flex-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C3.78 14.2 3.31 12.64 3.31 12.64C2.95 11.71 2.41 11.47 2.41 11.47C1.67 10.96 2.47 10.97 2.47 10.97C3.29 11.03 3.72 11.81 3.72 11.81C4.45 13.06 5.63 12.7 6.09 12.49C6.16 11.97 6.37 11.61 6.6 11.41C4.82 11.21 2.95 10.52 2.95 7.57C2.95 6.73 3.25 6.04 3.75 5.51C3.67 5.31 3.41 4.53 3.83 3.47C3.83 3.47 4.49 3.26 6.01 4.29C6.64 4.12 7.32 4.03 8 4.03C8.68 4.03 9.36 4.12 9.99 4.29C11.51 3.26 12.17 3.47 12.17 3.47C12.59 4.53 12.33 5.31 12.25 5.51C12.75 6.04 13.05 6.73 13.05 7.57C13.05 10.53 11.18 11.2 9.4 11.4C9.69 11.65 9.94 12.13 9.94 12.89C9.94 13.98 9.93 14.86 9.93 15.21C9.93 15.42 10.08 15.67 10.48 15.59C13.71 14.53 16 11.54 16 8C16 3.58 12.42 0 8 0Z" fill="#141a1f"/></svg>
                  <span className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">GitHub</span>
                </button>
                <button type="button" onClick={() => toast.info('Google auth not implemented')} className="flex flex-row justify-center items-center pt-[6.59px] pb-[7.41px] px-[25.55px] gap-[8px] rounded-[4px] border-[1px] border-[#e2e5e9] bg-[#fafafa] flex-1">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.545 8.18182C15.545 7.61364 15.4941 7.06818 15.3986 6.54545H8V9.64091H12.2318C12.0491 10.6386 11.4886 11.4886 10.6409 12.0545V14.0682H13.1818C14.6682 12.6977 15.545 10.6273 15.545 8.18182Z" fill="#4285F4"/><path d="M8 15.8636C10.1227 15.8636 11.9045 15.1614 13.1818 14.0682L10.6409 12.0545C9.94545 12.5205 9.04773 12.8 8 12.8C5.97273 12.8 4.25455 11.4318 3.64091 9.58864H1.01364V11.625C2.30227 14.1841 4.93636 15.8636 8 15.8636Z" fill="#34A853"/><path d="M3.64091 9.58864C3.48409 9.11818 3.39545 8.57045 3.39545 8C3.39545 7.42955 3.48409 6.88182 3.64091 6.41136V4.375H1.01364C0.484091 5.43182 0.181818 6.67727 0.181818 8C0.181818 9.32273 0.484091 10.5682 1.01364 11.625L3.64091 9.58864Z" fill="#FBBC05"/><path d="M8 3.2C9.15682 3.2 10.1932 3.59773 11.0114 4.375L13.2364 2.15C11.9045 0.909091 10.1227 0.136364 8 0.136364C4.93636 0.136364 2.30227 1.81591 1.01364 4.375L3.64091 6.41136C4.25455 4.56818 5.97273 3.2 8 3.2Z" fill="#EA4335"/></svg>
                  <span className="text-[14px] font-[500] leading-[20px] text-[#141a1f]">Google</span>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="flex flex-row items-center justify-center pt-[5.61px] pb-[6.39px] px-[12px] rounded-[4px] bg-[#ed351d] w-[450px] h-[36px] hover:bg-[#d62e19] transition-colors mt-[8px]">
              <span className="text-[14px] font-[500] leading-[20px] text-[#ffffff]">Sign In</span>
            </button>
          </form>

          <div className="w-[450px] h-[0px] border-t-[1px] border-[#e2e5e9]"></div>
          
          <p className="text-[11.41px] font-[400] leading-[13.81px] text-[#5c6470] tracking-wide">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}

