import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, UserRound, KeyRound } from "lucide-react";
import { authService } from "@/lib/fleetopsx/services";
import { Route as RootRoute } from "./__root";

export const Route = createFileRoute("/workspace/login")({
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";

    return {
      meta: [
        { title: `Sign in | ${tenantName}` },
        { name: "description", content: `Sign in to your ${tenantName} workspace.` },
      ],
    };
  },
  component: LoginPage,
});

/** Figma frame 37:35 — Internal Portal Sign In */
const DEPARTMENTS = [
  "Transport Manager",
  "Fleet Operations",
  "Accounts",
  "Engineering",
  "HR & Compliance",
  "Security",
  "Diesel",
  "Parts & Store",
] as const;

function LoginPage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const [department, setDepartment] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loginError, setLoginError] = useState(false);
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  const canSubmit = Boolean(department && username && password);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(false);
    try {
      const user = await authService.login(username, password);
      if (!user) {
        setLoginError(true);
        toast.error("Invalid credentials or suspended account.");
        return;
      }
      authService.setRoles(user.roles ?? []);
      toast.success(`Welcome back, ${user?.name}`);
      navigate({ to: "/workspace/app" });
    } catch (err) {
      setLoginError(true);
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Check API connectivity.");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1B2432] lg:bg-[#ffffff] w-full font-['Inter',sans-serif]">
      {/* Left — Figma 37:35 branding panel */}
      <div className="relative hidden lg:flex flex-col bg-[#1B2432] w-[720px] pt-[68px] pb-[68px] px-[67px] text-[#ffffff] h-screen justify-between shrink-0">
        <div className="flex flex-col w-full gap-[85px]">
          <img src={logoSrc} alt={tenantName || "Petroline Transport Ltd"} className="w-[178px] h-[100px] object-contain object-left" />

          <div className="flex flex-col gap-[18px]">
            <h2 className="text-[24px] font-[500] leading-[32px] text-[#ffffff]">
              Welcome to {tenantName || "Petroline"} Portal
            </h2>
            <h1 className="text-[50px] font-[700] leading-[58px] text-[#ffffff] max-w-[359px] font-['Space_Grotesk',sans-serif] tracking-[-0.9px]">
              Enterprise Fleet Operation Portal
            </h1>
            <p className="text-[20px] font-[400] leading-[28px] text-[#fafafa] max-w-[586px]">
              Centralized portal for {tenantName || "Petroline"} Personnel and Authorized Partners. Access is restricted to registered users.
            </p>
          </div>
        </div>

        <p className="text-[11.41px] font-[400] leading-normal text-white/70 uppercase tracking-[0.4px]">
          {(tenantName || "PETROLINE").toUpperCase()} FLEET OPERATION PORTAL | POWERED BY FLEETOPSX
        </p>
      </div>

      {/* Right — sign-in card */}
      <div className="flex flex-col justify-center items-center bg-[#1B2432] lg:bg-[#ffffff] w-full h-screen px-[24px] lg:px-0">
        <div className="lg:hidden flex justify-center mb-[40px]">
          <img src={logoSrc} alt={tenantName || "Petroline"} className="w-[178px] h-[60px] object-contain" />
        </div>

        <div
          className="w-full max-w-[500px] border border-[#e2e5e9] rounded-[10px] bg-[#ffffff] flex flex-col pt-[24px] pb-[24px] gap-[24px]"
          style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.1), 0px 4px 4px rgba(12,12,13,0.05)" }}
        >
          <div className="flex flex-col gap-[14px] w-full px-[24px]">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] tracking-[0.4px]">Internal Portal Sign In</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] max-w-[307px] tracking-[0.4px]">
              Enter your provisioned credentials to continue.
            </p>
          </div>

          <form className="flex flex-col gap-[24px] px-[24px]" onSubmit={handleLogin}>
            {loginError && (
              <div className="flex w-full items-center p-[16px] gap-[10px] rounded-[4px] border border-[#ed351d] bg-[#fdf2f1]">
                <p className="text-[14px] font-[400] leading-[20px] text-[#ed351d]">
                  Invalid username or password. Please contact the Transport Manager.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-[12px] w-full">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">Select Department</label>
              <div className="relative">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full h-[32px] appearance-none rounded-[4px] border border-[#e2e5e9] bg-white px-[12px] pr-[36px] text-[14px] font-[500] leading-[20px] text-[#5c6470] tracking-[0.4px] outline-none shadow-[0px_1px_2px_rgba(12,12,13,0.1)]"
                >
                  <option value="">Select</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-[12px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#5c6470]" />
              </div>
            </div>

            <div className="flex flex-col gap-[12px] w-full">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">Username</label>
              <div className="flex h-[36px] items-center gap-[10px] rounded-[4px] border border-[#e2e5e9] bg-white px-[12px] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                <UserRound className="h-4 w-4 shrink-0 text-[#5c6470]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="example: J.Doe"
                  className="w-full bg-transparent border-none outline-none text-[14px] font-[400] text-[#141a1f] placeholder-[#5c6470] tracking-[0.4px]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-[12px] w-full">
              <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">Password</label>
              <div className="flex h-[36px] items-center gap-[10px] rounded-[4px] border border-[#e2e5e9] bg-white px-[12px] shadow-[0px_4px_10px_rgba(0,0,0,0.05)]">
                <KeyRound className="h-4 w-4 shrink-0 text-[#5c6470]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="*********"
                  className="w-full bg-transparent border-none outline-none text-[14px] font-[400] text-[#141a1f] placeholder-[#5c6470] tracking-[0.4px]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                className="flex items-center gap-[10px]"
                onClick={() => setKeepSignedIn(!keepSignedIn)}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-[4px] border ${
                    keepSignedIn ? "border-[#ed351d] bg-[#ed351d]" : "border-[#e2e5e9] bg-white"
                  }`}
                >
                  {keepSignedIn ? (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="text-[14px] font-[400] text-[#1b2432]">Keep me signed in</span>
              </button>
              <Link to="/workspace/forgot-password" className="text-[14px] font-[400] text-[#1b2432] hover:underline">
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex h-[36px] w-full items-center justify-center rounded-[4px] text-[14px] font-[500] leading-[20px] text-white tracking-[0.4px] transition-colors ${
                canSubmit ? "bg-[#ed351d] hover:bg-[#d62e19]" : "bg-[rgba(237,53,29,0.4)] cursor-not-allowed"
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
