import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Boxes, ClipboardCheck, Fuel, Gauge, Radar, ShieldCheck, Truck, Users, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FleetOpsX — Digital Command Center for Transport Operations" },
      { name: "description", content: "Enterprise Transport Management System for fleet, dispatch, fuel, engineering, accounts and gate security." },
      { property: "og:title", content: "FleetOpsX — Digital Command Center for Transport Operations" },
      { property: "og:description", content: "Centralize heavy transport operations with accountable, enterprise-grade control." },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: Truck, title: "Fleet Management", body: "Live availability, assignment state and yard visibility across the entire heavy fleet." },
  { icon: Radar, title: "Dispatch", body: "Guided trip creation with vehicle, driver, route and compliance checks before release." },
  { icon: Fuel, title: "Fuel Control", body: "Efficiency-locked requisitions that stop operational leakage at the pump." },
  { icon: Wrench, title: "Engineering", body: "Defect intake, workshop queues and maintenance cost accountability." },
  { icon: Users, title: "HR & Drivers", body: "Licence compliance, availability and assignment history in one register." },
  { icon: ClipboardCheck, title: "Accounts", body: "Multi-level expense approvals with variance and disbursement control." },
  { icon: ShieldCheck, title: "Gate Security", body: "Digital yard logbook with server timestamps and attributable officers." },
  { icon: Gauge, title: "Executive Intelligence", body: "God View analytics for utilisation, cost, bottlenecks and trip performance." },
];

const BENEFITS = [
  "Eliminate manual processes",
  "Improve accountability",
  "Reduce operational leakage",
  "Improve fleet utilization",
  "Centralize operations",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass sticky top-0 z-40">
        <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between px-4">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-[13px] font-semibold text-primary-foreground">K</span>
            <span className="text-[15px] font-semibold tracking-[-0.02em]">FleetOpsX</span>
          </a>
          <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#benefits" className="hover:text-foreground">Enterprise</a>
            <a href="#preview" className="hover:text-foreground">Product</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-9 rounded-full text-[13px]">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="h-9 rounded-full px-4 text-[13px]">
              <a href="#demo">Request a Demo</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_10%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:py-28">
            <div>
              <p className="text-[13px] font-medium text-primary">FleetOpsX TMS · Forah Technology</p>
              <h1 className="mt-3 max-w-xl text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[56px]">
                The digital command center for modern transport operations
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
                FleetOpsX centralizes fleet, dispatch, fuel, engineering, inventory, accounts and gate security into one accountable enterprise environment.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 gap-2 rounded-full px-6 text-[15px]">
                  <a href="#demo">Request a Demo <ArrowRight className="h-4 w-4" /></a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-[15px]">
                  <Link to="/login">Explore Platform</Link>
                </Button>
              </div>
              <p className="num mt-6 text-[12px] text-muted-foreground">Multi-tenant SaaS · Prototype v1.0</p>
            </div>

            <div id="preview" className="relative">
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-[10px] font-semibold text-primary-foreground">K</span>
                    <span className="text-[13px] font-semibold tracking-[-0.01em]">Command Center</span>
                  </div>
                  <span className="num text-[11px] font-medium text-success">Online · PTL-001</span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-b border-border/70 bg-muted/40 p-3">
                  {[
                    ["42", "Active Trips"],
                    ["68", "Trucks"],
                    ["18", "Approvals"],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-xl border border-border/70 bg-surface px-2.5 py-2">
                      <p className="num text-lg font-semibold tracking-[-0.02em] text-foreground">{v}</p>
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="relative h-48 bg-[radial-gradient(circle_at_40%_45%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),linear-gradient(160deg,#f8fafc,#e8eef6)]">
                  <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(color-mix(in_oklab,var(--border)_90%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_90%,transparent)_1px,transparent_1px)] [background-size:28px_28px]" />
                  {[
                    ["12%", "28%", "En Route"],
                    ["48%", "52%", "Loaded"],
                    ["72%", "34%", "Delayed"],
                    ["34%", "68%", "Returning"],
                  ].map(([l, t, s]) => (
                    <span
                      key={s + l}
                      className="absolute flex items-center gap-1.5 rounded-full border border-border/80 bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-[0.01em] shadow-sm backdrop-blur"
                      style={{ left: l, top: t }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-border/70 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <p className="text-[13px] font-medium text-primary">Platform capabilities</p>
              <h2 className="mt-2 text-[36px] font-semibold tracking-[-0.03em]">Built for operational control</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Every module reinforces the same operating loop: See → Understand → Decide → Act → Track → Audit.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-transform duration-200 hover:-translate-y-0.5">
                  <f.icon className="h-4 w-4 text-primary" />
                  <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="benefits" className="border-b border-border/70 bg-muted/40 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-[13px] font-medium text-primary">Enterprise benefits</p>
              <h2 className="mt-2 text-[36px] font-semibold tracking-[-0.03em]">Bring transport operations under control</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Replace fragmented spreadsheets, WhatsApp threads and paper approvals with one accountable command environment.
              </p>
              <ul className="mt-6 space-y-2.5">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-[15px] text-foreground">
                    <Boxes className="h-3.5 w-3.5 text-primary" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Audit trail", "Every action attributed"],
                ["Role-based access", "11 enterprise roles"],
                ["Fuel variance", "Efficiency lock"],
                ["Gate timestamps", "Server locked"],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-border/80 bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <p className="text-[15px] font-semibold tracking-[-0.01em]">{t}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_55%)]" />
              <div className="relative">
                <h2 className="text-[36px] font-semibold tracking-[-0.03em]">Bring your transport operations under control</h2>
                <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  Request a guided walkthrough of the FleetOpsX Command Center prototype for Petroline Transport and future SaaS tenants.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild size="lg" className="h-12 rounded-full px-6 text-[15px]">
                    <Link to="/login">Open Command Center</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-[15px]">
                    <a href="mailto:demo@forah.tech">Contact Forah Technology</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-border/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-[10px] font-semibold text-primary-foreground">K</span>
            FleetOpsX by Forah Technology
          </span>
          <span className="num">Prototype · Frontend only · Pre-backend integration</span>
        </div>
      </footer>
    </div>
  );
}
