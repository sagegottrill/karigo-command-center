import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Fuel,
  Gauge,
  Radar,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
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
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-primary/20">
      {/* Soft Ambient Background Glows for Light Mode */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-100/50 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[50%] rounded-full bg-slate-200/50 blur-[150px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-[13px] font-bold text-white shadow-sm">
              F
            </div>
            <span className="text-[15px] font-bold tracking-tight text-slate-900">
              FleetOpsX
            </span>
          </a>
          <nav className="hidden items-center gap-8 text-[13px] font-medium text-slate-500 md:flex">
            <a href="#features" className="hover:text-slate-900 transition-colors">
              Features
            </a>
            <a href="#benefits" className="hover:text-slate-900 transition-colors">
              Enterprise
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors hidden sm:block">
              Log in
            </Link>
            <Link to="/login">
              <Button className="h-8 rounded-full bg-slate-900 text-white hover:bg-slate-800 px-4 text-[13px] font-semibold transition-all shadow-md">
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
          className="relative flex min-h-[90vh] w-full max-w-7xl flex-col items-center justify-center px-6 text-center pt-20 pb-32"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 mb-8 hover:bg-slate-100 transition-colors shadow-sm cursor-pointer">
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Introducing the Multi-Tenant Platform <ArrowRight className="h-3 w-3 text-slate-400" />
          </div>
          
          <h1 className="max-w-5xl text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-[80px] leading-[1.1] text-slate-900">
            The operating system <br className="hidden sm:block" /> for heavy logistics.
          </h1>
          
          <p className="mt-8 max-w-2xl text-lg text-slate-500 leading-relaxed font-medium">
            Centralize your entire transport operation with accountable,
            enterprise-grade control. Manage fleets, dispatch, fuel, and expenses in one multi-tenant workspace.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Link to="/login">
              <Button size="lg" className="h-12 rounded-full bg-slate-900 text-white hover:bg-slate-800 px-8 text-sm font-bold shadow-xl transition-all">
                Start your workspace <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50 px-8 text-sm font-bold shadow-sm transition-all">
                Explore Features
              </Button>
            </a>
          </div>

          {/* Abstract Dashboard Mockup */}
          <div className="mt-20 w-full max-w-5xl rounded-[24px] border border-slate-200/60 bg-white/40 p-2 shadow-2xl backdrop-blur-3xl overflow-hidden relative group">
             <div className="absolute inset-0 bg-gradient-to-t from-slate-50/80 to-transparent z-10 pointer-events-none" />
             <div className="w-full aspect-[16/9] rounded-[18px] bg-white border border-slate-100 relative overflow-hidden flex flex-col shadow-inner">
                {/* Mock Header */}
                <div className="h-12 border-b border-slate-100 flex items-center px-4 gap-4 bg-slate-50/50">
                   <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                   </div>
                   <div className="h-6 w-48 rounded bg-slate-200/60 ml-4" />
                </div>
                {/* Mock Content */}
                <div className="flex-1 p-6 flex gap-6 bg-slate-50/30">
                   <div className="w-64 flex flex-col gap-3">
                     {[...Array(6)].map((_, i) => (
                       <div key={i} className="h-10 rounded-lg bg-slate-100/80 w-full" />
                     ))}
                   </div>
                   <div className="flex-1 flex flex-col gap-6">
                      <div className="flex gap-4">
                         {[...Array(3)].map((_, i) => (
                           <div key={i} className="flex-1 h-32 rounded-xl bg-white border border-slate-100 shadow-sm" />
                         ))}
                      </div>
                      <div className="flex-1 rounded-xl bg-white border border-slate-100 shadow-sm" />
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* Bento Box Features */}
        <section id="features" className="w-full max-w-7xl px-6 py-32 border-t border-slate-200/60">
          <div className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-slate-900">
              Everything you need to <span className="text-slate-400">scale.</span>
            </h2>
            <p className="mt-4 text-lg text-slate-500">
              Stop stitching together generic tools. Use a platform built for logistics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 hover:shadow-xl transition-all duration-300 shadow-sm"
                >
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 mb-6 group-hover:scale-110 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-slate-900">{feature.title}</h3>
                    <p className="text-slate-500 leading-relaxed">
                      {feature.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/60 py-12 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row text-center sm:text-left">
          <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
            <div className="grid h-6 w-6 place-items-center rounded bg-slate-900 text-[10px] font-bold text-white">
              F
            </div>
            <span className="text-[13px] font-semibold text-slate-900">
              FleetOpsX
            </span>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-slate-500 font-medium flex-wrap justify-center">
            <Link to="/pwa/petroline" target="_blank" className="hover:text-slate-900 transition-colors text-blue-600">Demo Customer Portal</Link>
            <Link to="/superadmin" className="hover:text-slate-900 transition-colors">Platform Admin</Link>
            <span>© {new Date().getFullYear()} FleetOpsX. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
