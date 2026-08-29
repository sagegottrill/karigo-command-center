import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Fuel,
  Radar,
  Truck,
  Users,
  Wrench,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // If a tenant subdomain is detected, skip the marketing page and go straight to login
    if (context.tenantSlug) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "FleetOpsX — The Operating System for Logistics" },
      {
        name: "description",
        content:
          "Enterprise Transport Management System for fleet, dispatch, fuel, engineering, accounts and gate security.",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Truck,
    title: "Fleet Management",
    body: "Live availability, assignment state and yard visibility across the entire heavy fleet.",
  },
  {
    icon: Radar,
    title: "Dispatch",
    body: "Guided trip creation with vehicle, driver, route and compliance checks before release.",
  },
  {
    icon: Fuel,
    title: "Fuel Control",
    body: "Efficiency-locked requisitions that stop operational leakage at the pump.",
  },
  {
    icon: Wrench,
    title: "Engineering",
    body: "Defect intake, workshop queues and maintenance cost accountability.",
  },
  {
    icon: Users,
    title: "HR & Drivers",
    body: "Licence compliance, availability and assignment history in one register.",
  },
  {
    icon: ClipboardCheck,
    title: "Accounts",
    body: "Multi-level expense approvals with variance and disbursement control.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] selection:bg-blue-500/20 font-sans">
      {/* Soft Light Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-400/10 blur-[150px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[50%] rounded-full bg-purple-400/10 blur-[150px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-black/[0.05] bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <a href="#top" className="flex items-center gap-2.5 group">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1d1d1f] text-[13px] font-bold text-white shadow-sm transition-transform group-hover:scale-105">
              F
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#1d1d1f]">
              FleetOpsX
            </span>
          </a>
          <nav className="hidden items-center gap-8 text-[13px] font-medium text-slate-500 md:flex">
            <a href="#features" className="hover:text-[#1d1d1f] transition-colors">
              Features
            </a>
            <a href="#benefits" className="hover:text-[#1d1d1f] transition-colors">
              Enterprise
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-[13px] font-medium text-slate-500 hover:text-[#1d1d1f] transition-colors hidden sm:block">
              Log in
            </Link>
            <Link to="/login">
              <Button className="h-8 rounded-full bg-[#0066cc] text-white hover:bg-[#0055b3] px-5 text-[13px] font-semibold transition-all shadow-sm border-none">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center">
        {/* Hero Section */}
        <section
          id="top"
          className="relative flex min-h-[85vh] w-full max-w-7xl flex-col items-center justify-center px-6 text-center pt-24 pb-32"
        >
          <h1 className="max-w-5xl text-5xl font-bold tracking-tight sm:text-7xl lg:text-[90px] leading-[1.05] text-[#1d1d1f]">
            The operating system <br className="hidden sm:block" /> for heavy logistics.
          </h1>
          
          <p className="mt-8 max-w-2xl text-lg sm:text-xl text-slate-500 leading-relaxed font-medium">
            Centralize your entire transport operation with accountable,
            enterprise-grade control. Manage fleets, dispatch, fuel, and expenses in one multi-tenant workspace.
          </p>
          
          <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
            <Link to="/login">
              <Button size="lg" className="h-12 rounded-full bg-[#1d1d1f] text-white hover:bg-black px-8 text-[15px] font-semibold shadow-lg shadow-black/10 transition-all border-none">
                Start your workspace <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="h-12 rounded-full border-black/[0.1] bg-white text-[#1d1d1f] hover:bg-slate-50 px-8 text-[15px] font-semibold transition-all shadow-sm">
                Explore Features
              </Button>
            </a>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full max-w-7xl px-6 py-32 border-t border-black/[0.05]">
          <div className="mb-20 text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl text-[#1d1d1f]">
              Everything you need to <span className="text-[#0066cc]">scale.</span>
            </h2>
            <p className="mt-6 text-lg text-slate-500">
              Stop stitching together generic tools. Use a platform built meticulously for the realities of logistics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group relative overflow-hidden rounded-[32px] border border-black/[0.05] bg-white p-8 hover:shadow-xl hover:shadow-black/5 transition-all duration-500"
                >
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f5f7] text-[#1d1d1f] mb-8 group-hover:bg-[#0066cc] group-hover:text-white transition-all duration-500 shadow-sm">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-[#1d1d1f]">{feature.title}</h3>
                    <p className="text-slate-500 leading-relaxed text-[15px]">
                      {feature.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.05] py-12 bg-[#f5f5f7]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row text-center sm:text-left">
          <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
            <div className="grid h-6 w-6 place-items-center rounded bg-[#1d1d1f] text-[10px] font-bold text-white">
              F
            </div>
            <span className="text-[13px] font-semibold text-[#1d1d1f]">
              FleetOpsX
            </span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-slate-500 font-medium flex-wrap justify-center">
            <Link to="/pwa/$tenantId" params={{ tenantId: "petroline" }} target="_blank" className="hover:text-[#0066cc] transition-colors">Demo Customer Portal</Link>
            <Link to="/superadmin" className="hover:text-[#1d1d1f] transition-colors">Platform Admin</Link>
            <span>© {new Date().getFullYear()} FleetOpsX. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

