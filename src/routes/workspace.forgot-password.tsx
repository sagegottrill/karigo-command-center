import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, UserRound } from "lucide-react";
import { authService } from "@/lib/fleetopsx/services";
import { Route as RootRoute } from "./__root";

type ForgotSearch = {
  mode?: "request" | "new";
};

export const Route = createFileRoute("/workspace/forgot-password")({
  validateSearch: (search: Record<string, unknown>): ForgotSearch => ({
    mode: search.mode === "request" ? "request" : "new",
  }),
  head: ({ routeContext, match }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";
    const mode = match.search.mode === "request" ? "request" : "new";
    return {
      meta: [
        {
          title: mode === "request" ? `Forgot Password | ${tenantName}` : `Set New Password | ${tenantName}`,
        },
        {
          name: "description",
          content:
            mode === "request"
              ? `Reset password for ${tenantName}.`
              : `Set new password for ${tenantName}.`,
        },
      ],
    };
  },
  component: ForgotPasswordPage,
});

function AuthShell({ children }: { children: ReactNode }) {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  return (
    <div className="flex min-h-screen bg-[#1B2432] lg:bg-[#ffffff] w-full font-['Inter',sans-serif]">
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

      <div className="flex flex-col justify-center items-center bg-[#1B2432] lg:bg-[#ffffff] w-full h-screen px-[24px] lg:px-0">
        <div className="lg:hidden flex justify-center mb-[40px]">
          <img src={logoSrc} alt={tenantName || "Petroline"} className="w-[178px] h-[60px] object-contain" />
        </div>
        {children}
      </div>
    </div>
  );
}

/** Figma 59:368 Reset Password + 42:959 New Password */
function ForgotPasswordPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    toast.success("Password request sent", {
      description: "Your Transport Manager will review and issue a temporary password.",
    });
    navigate({ to: "/workspace/login" });
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = authService.getCurrentUser();
    if (!user) {
      toast.error("Session expired. Please sign in again.");
      navigate({ to: "/workspace/login" });
      return;
    }
    if (password.trim().length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    try {
      await authService.completeFirstTimeLogin(user.id, password.trim());
      toast.success("Password updated", {
        description: "Your new password has been set.",
      });
      if (user.roles.includes("Customer Portals (External)")) {
        navigate({ to: "/workspace/customer-portal/dashboard" });
      } else {
        navigate({ to: "/workspace/app" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password.");
    }
  };

  if (mode === "request") {
    const canSubmit = Boolean(username.trim());
    return (
      <AuthShell>
        <div
          className="w-full max-w-[500px] border border-[#e2e5e9] rounded-[10px] bg-white flex flex-col gap-[32px] px-[24px] py-[24px]"
          style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.1), 0px 4px 4px rgba(12,12,13,0.05)" }}
        >
          <Link to="/workspace/login" className="flex items-center gap-[10px] text-[#5c6470] hover:text-[#141a1f] w-fit">
            <ArrowLeft className="h-6 w-6" />
            <span className="text-[14px] font-[400] leading-[20px] tracking-[0.4px]">Back to Sign In</span>
          </Link>

          <div className="flex flex-col gap-[14px]">
            <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] tracking-[0.4px]">Forgot Password</h1>
            <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] max-w-[307px] tracking-[0.4px]">
              Enter your username on your account and we will send a new password.
            </p>
          </div>

          <form className="flex flex-col gap-[32px]" onSubmit={handleRequestReset}>
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

            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex h-[36px] w-full items-center justify-center rounded-[4px] text-[14px] font-[500] leading-[20px] text-white tracking-[0.4px] ${
                canSubmit ? "bg-[#ed351d] hover:bg-[#d62e19]" : "bg-[rgba(237,53,29,0.4)] cursor-not-allowed"
              }`}
            >
              Reset Password
            </button>
          </form>

          <div className="h-px bg-[#e2e5e9]" />
          <p className="text-center text-[11.41px] font-[400] uppercase tracking-[0.4px] text-[#5c6470]">POWERED BY FLEETOPSX</p>
        </div>
      </AuthShell>
    );
  }

  const canUpdate = Boolean(password);
  return (
    <AuthShell>
      <div
        className="w-full max-w-[500px] border border-[#e2e5e9] rounded-[10px] bg-white flex flex-col gap-[32px] px-[24px] py-[24px]"
        style={{ boxShadow: "0px 4px 16px rgba(12,12,13,0.1), 0px 4px 4px rgba(12,12,13,0.05)" }}
      >
        <Link to="/workspace/login" className="flex items-center gap-[10px] text-[#5c6470] hover:text-[#141a1f] w-fit">
          <ArrowLeft className="h-6 w-6" />
          <span className="text-[14px] font-[400] leading-[20px] tracking-[0.4px]">Back to Sign In</span>
        </Link>

        <div className="flex flex-col gap-[14px]">
          <h1 className="text-[24px] font-[600] leading-[32px] text-[#141a1f] tracking-[0.4px]">Set New Password</h1>
          <p className="text-[14px] font-[400] leading-[20px] text-[#5c6470] max-w-[307px] tracking-[0.4px]">
            First-time login requires a password update to secure your account.
          </p>
        </div>

        <form className="flex flex-col gap-[32px]" onSubmit={handleSetNewPassword}>
          <div className="flex flex-col gap-[12px] w-full">
            <label className="text-[14px] font-[500] leading-[14px] text-[#141a1f] tracking-[0.4px]">New Password</label>
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

          <button
            type="submit"
            disabled={!canUpdate}
            className={`flex h-[36px] w-full items-center justify-center rounded-[4px] text-[14px] font-[500] leading-[20px] text-white tracking-[0.4px] ${
              canUpdate ? "bg-[#ed351d] hover:bg-[#d62e19]" : "bg-[rgba(237,53,29,0.4)] cursor-not-allowed"
            }`}
          >
            Update and Continue
          </button>
        </form>

        <div className="h-px bg-[#e2e5e9]" />
        <p className="text-center text-[11.41px] font-[400] uppercase tracking-[0.4px] text-[#5c6470]">POWERED BY FLEETOPSX</p>
      </div>
    </AuthShell>
  );
}
