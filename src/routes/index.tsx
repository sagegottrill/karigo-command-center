import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Boxes, ClipboardCheck, Fuel, Gauge, Radar, ShieldCheck, Truck, Users, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Karigo — Digital Command Center for Transport Operations" },
      { name: "description", content: "Enterprise Transport Management System for fleet, dispatch, fuel, engineering, accounts and gate security." },
      { property: "og:title", content: "Karigo — Digital Command Center for Transport Operations" },
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
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">K</span>
            <span className="text-sm font-semibold tracking-[0.2em] uppercase">Karigo</span>
          </a>
          <nav className="hidden items-center gap-6 text-xs text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#benefits" className="hover:text-foreground">Enterprise</a>
            <a href="#preview" className="hover:text-foreground">Product</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="h-8 text-xs">
              <a href="#demo">Request a Demo</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden border-b border-border">
          <div className="grid-backdrop absolute inset-0 opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%)]" />
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(120deg,transparent,color-mix(in_oklab,var(--surface)_80%,transparent))] lg:block" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:py-28">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Karigo TMS · Forah Technology</p>
              <h1 className="mt-4 max-w-xl text-4xl leading-[1.05] font-semibold tracking-tight uppercase sm:text-5xl lg:text-6xl">
                The Digital Command Center for Modern Transport Operations
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                Karigo centralizes fleet, dispatch, fuel, engineering, inventory, accounts and gate security into one accountable enterprise environment — built for heavy transport operators like Petroline.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 gap-2 text-sm">
                  <a href="#demo">Request a Demo <ArrowRight className="h-4 w-4" /></a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 text-sm">
                  <Link to="/login">Explore Platform</Link>
                </Button>
              </div>
              <p className="num mt-6 text-[11px] text-muted-foreground">Multi-tenant SaaS architecture · Prototype v1.0</p>
            </div>

            <div id="preview" className="relative">
              <div className="panel overflow-hidden shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_20%,transparent)]">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">K</span>
                    <span className="text-xs font-semibold tracking-wider uppercase">Command Center</span>
                  </div>
                  <span className="num text-[10px] text-success">ONLINE · PTL-001</span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-b border-border bg-surface-raised/40 p-3">
                  {[
                    ["42", "Active Trips"],
                    ["68", "Trucks"],
                    ["18", "Approvals"],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-md border border-border bg-surface px-2.5 py-2">
                      <p className="num text-lg font-semibold text-foreground">{v}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="relative h-48 bg-[radial-gradient(circle_at_40%_45%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_50%),linear-gradient(160deg,oklch(0.18_0.02_258),oklch(0.22_0.025_258))]">
                  <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(color-mix(in_oklab,var(--border)_80%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_80%,transparent)_1px,transparent_1px)] [background-size:28px_28px]" />
                  {[
                    ["12%", "28%", "EN ROUTE"],
                    ["48%", "52%", "LOADED"],
                    ["72%", "34%", "DELAYED"],
                    ["34%", "68%", "RETURNING"],
                  ].map(([l, t, s]) => (
                    <span
                      key={s + l}
                      className="absolute flex items-center gap-1.5 rounded border border-primary/40 bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase backdrop-blur"
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

        <section id="features" className="border-b border-border py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Platform capabilities</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight uppercase">Built for operational control</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Every module reinforces the same operating loop: See → Understand → Decide → Act → Track → Audit.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/35">
                  <f.icon className="h-4 w-4 text-primary" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="benefits" className="border-b border-border bg-surface/40 py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">Enterprise benefits</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight uppercase">Bring transport operations under control</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Replace fragmented spreadsheets, WhatsApp threads and paper approvals with one accountable command environment.
              </p>
              <ul className="mt-6 space-y-2">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-foreground">
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
                <div key={t} className="rounded-lg border border-border bg-background p-4">
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="panel relative overflow-hidden px-6 py-12 text-center sm:px-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_55%)]" />
              <div className="relative">
                <h2 className="text-3xl font-semibold tracking-tight uppercase">Bring Your Transport Operations Under Control</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                  Request a guided walkthrough of the Karigo Command Center prototype for Petroline Transport and future SaaS tenants.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild size="lg" className="h-11 text-sm">
                    <Link to="/login">Open Command Center</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 text-sm">
                    <a href="mailto:demo@forah.tech">Contact Forah Technology</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">K</span>
            Karigo by Forah Technology
          </span>
          <span className="num">Prototype · Frontend only · Pre-backend integration</span>
        </div>
      </footer>
    </div>
  );
}
