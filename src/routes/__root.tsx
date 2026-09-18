import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { tenantService } from "@/lib/fleetopsx/services";
import { getHostnameServerFn } from "@/lib/fleetopsx/hostname";
import { useNotificationEngine } from "@/lib/fleetopsx/notification-engine";
import { useDeployWatcher } from "@/lib/fleetopsx/use-deploy-watcher";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="num text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This module or record does not exist in this workspace.
        </p>
        <div className="mt-6">
          <Link
            to="/workspace/app"
            className="inline-flex items-center justify-center rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This screen didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again in a moment.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Try again
          </button>
          <a
            href="/workspace/app"
            className="inline-flex items-center justify-center rounded-full border border-black/[0.1] bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.03]"
          >
            Go to overview
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; tenantSlug: string; tenantName: string; tenantLogo?: string }>()({
  head: (args: any) => {
    const ctx = args.routeContext || args.context;
    const title = ctx?.tenantName ? `${ctx.tenantName} | Workspace` : "Workspace";
    const tenantIcon: string | null = ctx?.tenantLogo || null;
    const tenantIconIsSvg = Boolean(tenantIcon && tenantIcon.toLowerCase().endsWith(".svg"));

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        {
          name: "description",
          content: "Transport management for fleet, trips, fuel, workshop and expenses.",
        },
        { name: "author", content: ctx?.tenantName || "Platform" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/manifest.json" },
        // Browser-tab mark. The platform default is the Petroline EMBLEM, not the
        // old /fleetopsx.svg: that SVG drew white text on transparency, so every
        // light browser theme rendered it as an invisible squiggle in the tab.
        ...(tenantIcon
          ? [
              {
                rel: "icon",
                href: tenantIcon,
                type: tenantIconIsSvg ? "image/svg+xml" : "image/png",
              },
            ]
          : [
              { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
              { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
            ]),
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
  beforeLoad: async ({ location }) => {
    let tenantSlug = "";
    const hostname = await getHostnameServerFn();
    
    if (hostname) {
      if (hostname === "petroline.fleetopsx.com") {
        tenantSlug = "petrolline"; // Map to mock data slug
      } else if (hostname.includes("fleetopsx.com")) {
        const parts = hostname.split(".");
        if (parts.length >= 3 && parts[0] !== "www") {
          tenantSlug = parts[0] || "";
        }
      } else if (hostname.endsWith(".localhost")) {
        tenantSlug = hostname.split(".")[0] || "";
      }
    }

    // NOTE: /workspace/* is reachable on ANY host (apex domain, preview URLs,
    // IP). It used to redirect back to the landing page when no tenant
    // subdomain matched — which silently destroyed live sessions whenever the
    // portal was opened from a non-subdomain host (looked like "the app logged
    // me out"). Tenant branding falls back to the platform default instead.
    
    const platformTenant = tenantSlug
      ? await tenantService.getBySlug(tenantSlug)
      : null;
    
    let fallbackName = "Unknown Tenant";
    if (tenantSlug === "petrolline") {
      fallbackName = "Petroline Transport Ltd";
    }
    
    const tenantName = platformTenant ? platformTenant.name : (tenantSlug ? fallbackName : "FleetOpsX");
    const tenantLogo = platformTenant?.logo;

    return { tenantSlug, tenantName, tenantLogo };
  },
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Real-time notifications: chime + toast pop-up + tab-title badge, one 10s
  // poll shared app-wide (idle on public/login routes).
  useNotificationEngine();
  // A tab keeps the bundle it loaded, so a deploy is invisible until someone
  // reloads — this notices and offers the reload.
  useDeployWatcher();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="bottom-right" theme="light" richColors />
    </QueryClientProvider>
  );
}

