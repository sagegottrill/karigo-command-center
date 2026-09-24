import { useEffect, useState } from "react";
import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  FleetOperationsMobileNav,
  FleetOperationsSidebar,
  shouldUseFleetOpsShell,
} from "@/components/fleetopsx/fleet-operations-sidebar";
import {
  GateSecurityMobileNav,
  GateSecuritySidebar,
  shouldUseGateSecurityShell,
} from "@/components/fleetopsx/gate-security-sidebar";
import {
  TrackingOperationsMobileNav,
  TrackingOperationsSidebar,
  shouldUseTrackingOpsShell,
} from "@/components/fleetopsx/tracking-operations-sidebar";
import {
  LoadingOperationsMobileNav,
  LoadingOperationsSidebar,
  shouldUseLoadingShell,
} from "@/components/fleetopsx/loading-operations-sidebar";
import {
  LubricantMobileNav,
  LubricantSidebar,
  shouldUseLubricantShell,
} from "@/components/fleetopsx/lubricant-sidebar";
import {
  TransportAdminMobileNav,
  TransportAdminSidebar,
} from "@/components/fleetopsx/transport-admin-sidebar";
import {
  DepartmentMobileNav,
  DepartmentSidebar,
  shouldUseAccountsShell,
  shouldUseEngineeringShell,
  shouldUseHrShell,
  shouldUseInventoryShell,
  shouldUsePartsStoreShell,
  type DepartmentKey,
} from "@/components/fleetopsx/department-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { authService } from "@/lib/fleetopsx/services";
import { getToken, clearSession, allowMockFallback } from "@/lib/fleetopsx/apiClient";
import { getActiveRole } from "@/lib/fleetopsx/active-role";
import { getActiveRoleHome } from "@/lib/fleetopsx/role-home";
import { installSessionGuards } from "@/lib/fleetopsx/session";
import { cn } from "@/lib/utils";

/**
 * Is this session a PARTNER session right now?
 *
 * True for an account that only holds the partner role, or one whose currently
 * selected department IS the partner role. False when the account also holds a
 * staff role and is switched to it — the partner side must not swallow them.
 */
function partnerOnly(roles: string[], active: string) {
  if (!roles.includes("Customer Portals (External)")) return false;
  return roles.length === 1 || active === "Customer Portals (External)";
}

export const Route = createFileRoute("/workspace/app")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    const hasLiveToken = !!getToken();

    if (!allowMockFallback() && user && !hasLiveToken) {
      clearSession();
      throw redirect({ to: "/workspace/login" });
    }

    if (!user || (!allowMockFallback() && !hasLiveToken)) {
      throw redirect({ to: "/workspace/login" });
    }

    if (user.passwordResetRequired) {
      throw redirect({ to: "/workspace/forgot-password" });
    }

    const roles = authService.getRoles();
    // Landing redirect respects the department currently selected (multi-role users):
    // the root of /workspace/app always resolves to the active role's own portal home.
    const active = getActiveRole(roles);
    const scoped = active ? [active] : roles;

    // A partner login belongs in the customer portal — but only while the partner
    // role is the one being worked as. Someone who ALSO holds a staff role (our own
    // company runs both sides of the counter) must not be locked out of the staff
    // app: the selected department decides, and the partner portal can switch back.
    if (partnerOnly(roles, active)) {
      throw redirect({ to: "/workspace/customer-portal/dashboard" });
    }

    const path = location.pathname;
    if (path === "/workspace/app" || path === "/workspace/app/") {
      const home = getActiveRoleHome(scoped, active);
      if (home !== "/workspace/app") {
        throw redirect({ to: home });
      }
    }
  },
  component: AppShell,
  notFoundComponent: PortalNotFound,
});

/**
 * An address inside the portal that no page claims.
 *
 * The old Karigo screens used to answer these by bouncing the person to the
 * dashboard, which is why nobody noticed they were dead: the address never
 * changed what they got, it just quietly ate the URL. They are gone now, and the
 * router's own default prints a bare "Not Found" inside the chrome, which reads
 * like the app broke. This says what happened and walks them back to their own
 * department's first page.
 */
function PortalNotFound() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-[#F1F2F4] px-4">
      <div className="max-w-md text-center">
        <p className="num text-[56px] font-bold leading-none text-[#1B2432]">404</p>
        <h1 className="mt-3 text-[20px] font-semibold leading-7 text-[#1B2432]">
          This page is not part of your portal
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-[#5C6470]">
          The address may be from an older version of the system, or the module may have moved to
          another board. Nothing you were working on has been lost.
        </p>
        <Link
          to="/workspace/app"
          className="mt-5 inline-flex h-9 items-center rounded bg-[#ED351D] px-3 text-[13px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19]"
        >
          Back to my portal
        </Link>
      </div>
    </div>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [useFoShell, setUseFoShell] = useState(false);
  const [useGateShell, setUseGateShell] = useState(false);
  const [useTrackingShell, setUseTrackingShell] = useState(false);
  const [useLoadingShell, setUseLoadingShell] = useState(false);
  const [useLubricantShell, setUseLubricantShell] = useState(false);
  // HR, Engineering, Inventory and Accounts own their portals; the manager reads
  // them as an audit.
  const [departmentShell, setDepartmentShell] = useState<DepartmentKey | null>(null);
  const [shellReady, setShellReady] = useState(false);

  const [activeRole, setActiveRoleState] = useState<string>("");

  useEffect(() => {
    setCollapsed(window.innerWidth < 768);
    const applyShell = () => {
      const roles = authService.getRoles();
      // Department switch: evaluate shell predicates against the active role only.
      const active = getActiveRole(roles);
      const scoped = active && roles.length > 1 ? [active] : roles;
      setUseFoShell(shouldUseFleetOpsShell(scoped));
      setUseGateShell(shouldUseGateSecurityShell(scoped));
      setUseTrackingShell(shouldUseTrackingOpsShell(scoped));
      setUseLoadingShell(shouldUseLoadingShell(scoped));
      setUseLubricantShell(shouldUseLubricantShell(scoped));
      setDepartmentShell(
        shouldUseHrShell(scoped)
          ? "hr"
          : shouldUseEngineeringShell(scoped)
            ? "engineering"
            : // The money desk: an Accounts login works its own disbursal board, with
              // its own sidebar and its own header, never the manager's chrome.
              shouldUseAccountsShell(scoped)
              ? "accounts"
              : // Parts & Inventory is ITS OWN department — its shell is picked
                // before the storehouse's, and neither ever resolves to the
                // manager's dashboard.
                shouldUsePartsStoreShell(scoped)
                ? "parts"
                : shouldUseInventoryShell(scoped)
                  ? "inventory"
                  : null,
      );
      setActiveRoleState(active);
      setShellReady(true);
    };
    applyShell();

    // Role switch (header dropdown) re-evaluates which department shell to render.
    window.addEventListener("fleetopsx:role-switched", applyShell);
    return () => window.removeEventListener("fleetopsx:role-switched", applyShell);
  }, []);

  useEffect(() => {
    return installSessionGuards();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user || !getToken()) {
      navigate({ to: "/workspace/login" });
    } else if (user.passwordResetRequired) {
      navigate({ to: "/workspace/forgot-password" });
    } else if (partnerOnly(authService.getRoles(), getActiveRole(authService.getRoles()))) {
      navigate({ to: "/workspace/customer-portal/dashboard" });
    }
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-[#F1F2F4]">
      {departmentShell ? (
        <DepartmentSidebar
          department={departmentShell}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      ) : useGateShell ? (
        <GateSecuritySidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useLoadingShell ? (
        <LoadingOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useLubricantShell ? (
        <LubricantSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useTrackingShell ? (
        <TrackingOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useFoShell ? (
        <FleetOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : (
        <TransportAdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}
      {/* keyed remount: a role switch re-picks sidebar + header chrome */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          key={activeRole}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          forceFleetOps={shellReady ? useFoShell : false}
          forceTrackingOps={shellReady ? useTrackingShell : false}
          forceGateSecurity={shellReady ? useGateShell : false}
          forceLoadingOps={shellReady ? useLoadingShell : false}
          forceLubricantOps={shellReady ? useLubricantShell : false}
          forceDepartment={shellReady ? departmentShell : null}
        />
        <main className={cn("scroll-edge min-w-0 flex-1 overflow-auto", "pb-24 md:pb-0")}>
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
        {departmentShell ? (
          <DepartmentMobileNav department={departmentShell} />
        ) : useGateShell ? (
          <GateSecurityMobileNav />
        ) : useLoadingShell ? (
          <LoadingOperationsMobileNav />
        ) : useLubricantShell ? (
          <LubricantMobileNav />
        ) : useTrackingShell ? (
          <TrackingOperationsMobileNav />
        ) : useFoShell ? (
          <FleetOperationsMobileNav />
        ) : (
          <TransportAdminMobileNav />
        )}
      </div>
    </div>
  );
}
