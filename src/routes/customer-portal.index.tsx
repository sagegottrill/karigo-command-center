import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Box, ShieldCheck, Zap } from "lucide-react";
import { tenantService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";

export const Route = createFileRoute("/customer-portal/")({
  loader: () => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug === "localhost" || slug === "fleetopsx") return { tenant: null };
    return tenantService.getBySlug(slug);
  },
  component: CustomerLandingPage,
});

function CustomerLandingPage() {
  const { tenant } = Route.useLoaderData();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b px-6 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
            <Box className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            {tenant?.name || "Partner"} Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/customer-portal/login"
            className="rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center lg:py-32">
          <div className="mb-6 inline-flex rounded-full bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-600">
            Secure Customer Portal
          </div>
          <h1 className="text-balance text-5xl font-extrabold tracking-tight text-gray-900 sm:text-7xl font-serif">
            Streamline your logistics.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
            Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/customer-portal/login"
              className="flex items-center gap-2 rounded-full bg-black px-8 py-4 text-base font-medium text-white transition-all hover:bg-gray-800 hover:ring-4 hover:ring-gray-200"
            >
              Access Portal <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="bg-gray-50 py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid gap-12 sm:grid-cols-3">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <Zap className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 font-serif">Instant Requests</h3>
                <p className="mt-2 text-gray-600">Create new load bookings, specify cargo details, and receive instant dispatch confirmations.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <Box className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 font-serif">Live Tracking</h3>
                <p className="mt-2 text-gray-600">View live freight movements, track vehicle status, and check accurate arrival times.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <ShieldCheck className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 font-serif">Secure Records</h3>
                <p className="mt-2 text-gray-600">Review past delivery logs, download compliance documents, and audit completed freight operations.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-gray-500">
        <p>Powered by FleetOpsX - The operating system for heavy logistics.</p>
      </footer>
    </div>
  );
}
