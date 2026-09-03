import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { tenantService } from "@/lib/fleetopsx/services";
import { getHostnameServerFn } from "@/lib/fleetopsx/hostname";

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
  head: ({ routeContext }) => {
    const title = routeContext?.tenantName ? `${routeContext.tenantName} | Workspace` : "Workspace";
    const iconUrl = routeContext?.tenantLogo ? routeContext.tenantLogo : "/fleetopsx.svg";

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        {
          name: "description",
          content: "Transport management for fleet, trips, fuel, workshop and expenses.",
        },
        { name: "author", content: routeContext?.tenantName || "Platform" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "icon", href: iconUrl, type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/workspace/apple-touch-icon.png" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
  beforeLoad: async () => {
    let tenantSlug = "";
    const hostname = await getHostnameServerFn();
    
    if (hostname) {
      if (hostname === "petroline.fleetopsx.com") {
        tenantSlug = "petrolline"; // Map to mock data slug
      } else if (hostname.includes("fleetopsx.com")) {
        const parts = hostname.split(".");
        if (parts.length >= 3 && parts[0] !== "www") {
          tenantSlug = parts[0];
        }
      } else if (hostname.endsWith(".localhost")) {
        tenantSlug = hostname.split(".")[0] || "";
      }
    }
    
    const platformTenants = await tenantService.list();
    const platformTenant = platformTenants.find(t => t.tenantSlug === tenantSlug || t.domain === tenantSlug);
    const tenantName = platformTenant ? platformTenant.name : (tenantSlug ? "Unknown Tenant" : "FleetOpsX");
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

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="bottom-right" theme="light" richColors />
    </QueryClientProvider>
  );
}

