import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UserRound, KeyRound } from "lucide-react";
import { authService, tenantService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";
import { clearSession } from "@/lib/fleetopsx/apiClient";
import { enterAuthenticatedApp } from "@/lib/fleetopsx/session";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loginError, setLoginError] = useState(false);

  const tenantName = tenant?.name || "Petroline";
  const tenantLogo = tenant?.logo || "/figma/petroline-logo.png";
  const canSubmit = Boolean(username && password);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    try {
      const user = await authService.login(username, password);
      if (!user) {
        setLoginError(true);
        toast.error("Invalid credentials.");
        return;
      }
      if (!user.roles.includes("Customer Portals (External)")) {
        setLoginError(true);
        toast.error("Access denied. Please use the main employee login portal.");
        clearSession();
        return;
      }
      authService.setRoles(user.roles ?? []);
      toast.success("Welcome back", { description: `Signed in as ${user.name}` });
      void keepSignedIn;
      enterAuthenticatedApp("/workspace/customer-portal/dashboard");
    } catch (err) {
      setLoginError(true);
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Check API connectivity.");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#1B2432] font-['Inter',sans-serif] lg:bg-[#ffffff]">
      <div className="relative hidden h-screen w-[720px] shrink-0 flex-col justify-between bg-[#1B2432] px-[67px] pb-[68px] pt-[68px] text-[#ffffff] lg:flex">
        <div className="flex w-full flex-col gap-[85px]">
          <img
            src={tenantLogo}
            alt={tenantName}
            className="h-[100px] w-[178px] object-contain object-left"
          />
          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff]">
              Welcome to {tenantName} Portal
            </h2>
            <h1 className="max-w-[359px] font-['Space_Grotesk',sans-serif] text-[50px] font-[700] leading-[58px] tracking-[-0.9px] text-[#ffffff]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="max-w-[586px] text-[20px] font-[400] leading-[28px] text-[#fafafa]">
              Centralized portal for {tenantName} Personnel and Authorized Partners. Access is restricted to
              registered users.
            </p>
          </div>
        </div>
        <p className="text-[11.41px] font-[400] uppercase leading-normal tracking-[0.4px] text-white/70">
          {(tenantName || "PETROLINE").toUpperCase()} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
        </p>
      </div>

      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#1B2432] px-[24px] lg:bg-[#ffffff] lg:px-0">
        <div className="mb-[40px] flex justify-center lg:hidden">
          <img src={tenantLogo} alt={tenantName} className="h-[60px] w-[178px] object-contain" />
        </div>

        <div
          className="flex w-full max-w-[500px] flex-col gap-[24px] rounded-[10px] border border-[#e2e5e9] bg-[#ffffff] pb-[24px] pt-[24px]"
          style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.1), 0px 4px 4px rgba(12,12,13,0.05)" }}
        >
          <div className="flex w-full flex-col gap-[14px] px-[24px]">
            <h1 className="text-[24px] font-[600] leading-[32px] tracking-[0.4px] text-[#141a1f]">
              Partner Company Portal Sign In
            </h1>
            <p className="max-w-[307px] text-[14px] font-[400] leading-[20px] tracking-[0.4px] text-[#5c6470]">
              Sign in to manage your shipments and requests.
            </p>
          </div>

          <form className="flex flex-col gap-[24px] px-[24px]" onSubmit={handleLogin}>
            {loginError && (
              <div className="flex w-full items-center gap-[10px] rounded-[4px] border border-[#ed351d] bg-[#fdf2f1] p-[16px]">
                <p className="text-[14px] font-[400] leading-[20px] text-[#ed351d]">
                  Invalid username or password. Please contact the Transport Manager.
                </p>
              </div>
            )}

            <div className="flex w-full flex-col gap-[12px]">
              <label className="text-[14px] font-[500] leading-[14px] tracking-[0.4px] text-[#141a1f]">
                Username
              </label>
              <div className="flex h-[36px] items-center gap-[10px] rounded-[4px] border border-[#e2e5e9] bg-white px-[12px] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                <UserRound className="h-4 w-4 shrink-0 text-[#5c6470]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="example: J.Doe"
                  className="w-full border-none bg-transparent text-[14px] font-[400] text-[#141a1f] tracking-[0.4px] outline-none placeholder-[#5c6470]"
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-[12px]">
              <label className="text-[14px] font-[500] leading-[14px] tracking-[0.4px] text-[#141a1f]">
                Password
              </label>
              <div className="flex h-[36px] items-center gap-[10px] rounded-[4px] border border-[#e2e5e9] bg-white px-[12px] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                <KeyRound className="h-4 w-4 shrink-0 text-[#5c6470]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="*********"
                  className="w-full border-none bg-transparent text-[14px] font-[400] text-[#141a1f] tracking-[0.4px] outline-none placeholder-[#5c6470]"
                />
              </div>
            </div>

            <div className="flex w-full items-center justify-between">
              <button type="button" className="flex items-center gap-[10px]" onClick={() => setKeepSignedIn(!keepSignedIn)}>
                <span
                  className={`grid h-4 w-4 place-items-center rounded-[4px] border ${
                    keepSignedIn ? "border-[#ed351d] bg-[#ed351d]" : "border-[#e2e5e9] bg-white"
                  }`}
                >
                  {keepSignedIn ? (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="text-[14px] font-[400] text-[#1b2432]">Keep me signed in</span>
              </button>
              <Link
                to="/workspace/forgot-password"
                search={{ mode: "request" }}
                className="text-[14px] font-[400] text-[#1b2432] hover:underline"
              >
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex h-[36px] w-full items-center justify-center rounded-[4px] text-[14px] font-[500] leading-[20px] tracking-[0.4px] text-white transition-colors ${
                canSubmit ? "bg-[#ed351d] hover:bg-[#d62e19]" : "cursor-not-allowed bg-[rgba(237,53,29,0.4)]"
              }`}
            >
              Sign In
            </button>
          </form>

          <div className="mx-[24px] h-px bg-[#e2e5e9]" />
          <p className="px-[24px] text-center text-[11.41px] font-[400] uppercase tracking-[0.4px] text-[#5c6470]">
            POWERED BY FLEETOPSX
          </p>
        </div>
      </div>
    </div>
  );
}
