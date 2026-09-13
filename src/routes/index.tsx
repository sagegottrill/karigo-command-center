import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Fuel,
  Radar,
  Truck,
  Users,
  Wrench,
  ChevronRight,
  MapPin,
  FileCheck2,
  Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Route as RootRoute } from "./__root";

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
  component: UnifiedLandingPage,
});

function UnifiedLandingPage() {
  const { tenantSlug } = RootRoute.useRouteContext();
  
  if (tenantSlug) {
    return <TenantLandingPage />;
  }
  return <MainLandingPage />;
}

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

function MainLandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] font-sans selection:bg-[#ed351d]/20 overflow-x-hidden">
      
      {/* HEADER - Black */}
      <div className="w-full bg-[#000000] border-b border-white/10 flex justify-center">
        <header className="w-full max-w-[1440px] h-[80px] flex items-center justify-between px-[20px] md:px-[60px]">
          <div className="flex items-center gap-2 group">
            <div className="grid h-8 w-8 place-items-center rounded bg-[#ed351d] text-[13px] font-bold text-white shadow-sm">
              F
            </div>
            <span className="text-[20px] font-bold tracking-tight text-white font-space-grotesk">
              FleetOpsX
            </span>
          </div>
          <nav className="hidden items-center gap-10 text-[14px] font-medium text-white/70 md:flex">
            <a href="#home" onClick={(e) => { e.preventDefault(); document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Home</a>
            <a href="#platform" onClick={(e) => { e.preventDefault(); document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Platform</a>
            <a href="#services" onClick={(e) => { e.preventDefault(); document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Services</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Contact</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link 
              to="/superadmin" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-white text-black hover:bg-gray-200 h-[40px] px-6 font-semibold transition-colors"
            >
              Access Portal
            </Link>
          </div>
        </header>
      </div>

      {/* HERO SECTION - Black */}
      <section id="home" className="bg-[#000000] text-white pt-[60px] pb-[100px] md:pt-[120px] md:pb-[160px] px-[20px] md:px-[60px] flex justify-center rounded-b-[40px]">
        <div className="w-full max-w-[1440px] flex flex-col">
          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-6">
            <div className="w-2 h-2 bg-[#ed351d]" />
            Next-Gen Logistics OS
          </div>
          <h1 className="text-[50px] md:text-[90px] font-bold leading-[1.05] tracking-tight max-w-[1000px] font-space-grotesk mb-10">
            Next-Gen Fleet Management for Growing Enterprises.
          </h1>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end w-full gap-10">
            <div className="flex gap-10 text-white/50 text-sm font-medium uppercase tracking-widest">
              <span>+ Fleet</span>
              <span>+ Dispatch</span>
              <span>+ Finance</span>
            </div>
            <div className="max-w-[400px]">
              <p className="text-[20px] md:text-[24px] font-light leading-relaxed mb-8">
                Enterprise-grade logistics,<br />dispatch, and financial control for startups and giants.
              </p>
              <div className="flex gap-4">
                <Link 
                  to="/workspace/login" 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[#ed351d] hover:bg-[#d62e19] text-white h-[48px] px-8 text-base transition-colors"
                >
                  View Modules ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOGOS & MISSION - White */}
      <section id="platform" className="bg-white pt-[60px] pb-[80px] px-[20px] md:px-[60px] flex justify-center border-b border-gray-100">
        <div className="w-full max-w-[1440px]">
          <div className="flex flex-col md:flex-row items-center justify-between border-b border-gray-200 pb-[60px] mb-[100px] gap-10">
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-gray-400 max-w-[200px]">
              <Pin className="w-6 h-6 text-gray-300" />
              We've managed 500+ enterprise logistics operations.
            </div>
            <div className="flex flex-wrap justify-center gap-10 md:gap-20 opacity-40 grayscale">
              <span className="font-bold text-xl">Dangote</span>
              <span className="font-bold text-xl">BUA Group</span>
              <span className="font-bold text-xl">Flour Mills</span>
              <span className="font-bold text-xl">Olam</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-8">
            <div className="w-2 h-2 bg-[#ed351d]" />
            Who we are
          </div>
          <div className="flex flex-col lg:flex-row justify-between items-end gap-10 mb-[60px]">
            <h2 className="text-[40px] md:text-[60px] font-medium leading-[1.1] tracking-tight max-w-[900px]">
              We build data-first logistics systems to help transport <span className="text-gray-400">leaders lead their industries.</span>
            </h2>
            <Link to="/workspace/app" className="text-sm font-bold uppercase tracking-widest border-b border-black pb-1 hover:text-[#ed351d] hover:border-[#ed351d] transition-colors whitespace-nowrap">
              → Enter Workspace
            </Link>
          </div>

          {/* Image Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-[120px]">
            <div className="aspect-[3/4] bg-gray-900 rounded-[20px] overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
              <img src="/hero.jpeg" alt="Logistics 1" className="w-full h-full object-cover object-center brightness-75" />
            </div>
            <div className="aspect-[3/4] bg-gray-200 rounded-[20px] overflow-hidden relative">
               <img src="/hero.jpeg" alt="Logistics 2" className="w-full h-full object-cover object-right sepia-[.3] hue-rotate-180" />
            </div>
            <div className="aspect-[3/4] bg-gray-100 rounded-[20px] overflow-hidden relative">
               <img src="/hero.jpeg" alt="Logistics 3" className="w-full h-full object-cover object-left grayscale-[0.5]" />
            </div>
            <div className="aspect-[3/4] bg-[#ed351d] rounded-[20px] overflow-hidden flex items-center justify-center p-8">
               <h3 className="text-white text-3xl font-bold font-space-grotesk leading-tight text-center">Seamless Operations</h3>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-12">
            <div className="w-2 h-2 bg-[#ed351d]" />
            By the numbers
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-16 border-b border-gray-200 pb-[100px]">
            <div className="flex flex-col gap-4">
              <div className="text-[50px] md:text-[70px] font-medium leading-none">99.9%</div>
              <div className="w-full h-[1px] border-b border-dashed border-gray-300" />
              <div className="font-bold text-sm">System Uptime</div>
              <div className="text-xs text-gray-500">Uninterrupted tracking, routing and management for live fleets.</div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[50px] md:text-[70px] font-medium leading-none">50+</div>
              <div className="w-full h-[1px] border-b border-dashed border-gray-300" />
              <div className="font-bold text-sm">Enterprise Clients</div>
              <div className="text-xs text-gray-500">From emerging carriers to industrial giants—each treated as our only one.</div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[50px] md:text-[70px] font-medium leading-none">10k+</div>
              <div className="w-full h-[1px] border-b border-dashed border-gray-300" />
              <div className="font-bold text-sm">Trips Managed</div>
              <div className="text-xs text-gray-500">Zero compromises on manifest accuracy and payload tracking.</div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[50px] md:text-[70px] font-medium leading-none">8+</div>
              <div className="w-full h-[1px] border-b border-dashed border-gray-300" />
              <div className="font-bold text-sm">Years Expertise</div>
              <div className="text-xs text-gray-500">Deep experience in supply chain, vehicle telemetry and logistics workflow.</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER / SERVICES - Black */}
      <section id="services" className="bg-[#0b0f14] text-white pt-[100px] pb-[40px] px-[20px] md:px-[60px] flex justify-center">
        <div className="w-full max-w-[1440px] flex flex-col">
          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-12">
            <div className="w-2 h-2 bg-[#ed351d]" />
            Services
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-[100px]">
            <h2 className="text-[40px] md:text-[70px] font-medium leading-none flex items-center gap-4">
              Our <div className="w-[60px] h-[60px] bg-[#ed351d] rounded-lg rotate-12 flex items-center justify-center shadow-lg"><Truck className="w-8 h-8 text-white -rotate-12" /></div> Platform
            </h2>
            <p className="text-white/50 text-sm max-w-[300px] leading-relaxed">
              Fleet operations software that keeps trucks moving — from transport requests and dispatch to live tracking and secure records.
            </p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10 text-xs text-white/40">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <Link to="/superadmin" className="hover:text-white transition-colors">Platform Admin</Link>
            </div>
            <span>© {new Date().getFullYear()} FleetOpsX. All rights reserved.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function TenantLandingPage() {
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const displayName = tenantName || "Petroline Transport Ltd";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] font-sans selection:bg-[#ed351d]/20 overflow-x-hidden">
      
      {/* HEADER - Black */}
      <div className="w-full bg-[#000000] border-b border-white/10 flex justify-center">
        <header className="w-full max-w-[1440px] h-[80px] flex items-center justify-between px-[20px] md:px-[60px]">
          <div className="flex flex-row items-center gap-[16px]">
             <img src={logoSrc} alt={displayName} className="h-[40px] md:h-[50px] object-contain" />
          </div>
          <div className="flex items-center gap-4">
            <Link 
              to="/workspace/account-type" 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-white text-black hover:bg-gray-200 h-[40px] px-6 font-semibold transition-colors"
            >
              Access Portal
            </Link>
          </div>
        </header>
      </div>

      {/* HERO SECTION - Background Image */}
      <section 
        className="relative flex flex-col items-center justify-center overflow-hidden bg-[#000000] bg-cover bg-center bg-no-repeat pt-[60px] pb-[100px] md:pt-[120px] md:pb-[160px] px-[20px] md:px-[60px] flex justify-center rounded-b-[40px]"
        style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('/HH.jpeg')" }}
      >
        <div className="w-full max-w-[1440px] flex flex-col relative z-10 text-white">
          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-6">
            <div className="w-2 h-2 bg-[#ed351d]" />
            Enterprise Fleet Portal
          </div>
          
          <h1 className="text-[50px] md:text-[90px] font-bold leading-[1.05] tracking-tight max-w-[1000px] font-space-grotesk mb-10 text-white">
            Total visibility for your enterprise fleet operations.
          </h1>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end w-full gap-10">
            <div className="flex flex-wrap gap-10 text-white/50 text-sm font-medium uppercase tracking-widest">
              <span>Truck Requests</span>
              <span>+ Real-Time Tracking</span>
              <span>+ Secure Access</span>
            </div>
            <div className="max-w-[400px]">
              <p className="text-[20px] md:text-[24px] font-light leading-relaxed mb-8 text-white/80">
                Digitize your supply chain. Submit exact truck configurations, monitor assigned drivers via live map telemetry, and secure your delivery paperwork from one multi-tenant dashboard.
              </p>
              <div className="flex gap-4">
                <Link 
                  to="/workspace/account-type" 
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[#ed351d] hover:bg-[#d62e19] text-white h-[48px] px-8 text-base transition-colors"
                >
                  Access Portal ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITIES SECTION - Wow Upgrade */}
      <section className="bg-[#fafbfc] pt-[100px] pb-[120px] px-[20px] md:px-[60px] flex justify-center border-b border-gray-100 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-b from-gray-100 to-transparent rounded-full translate-x-1/3 -translate-y-1/4 pointer-events-none" />
        
        <div className="w-full max-w-[1440px] relative z-10">
          
          <div className="flex flex-col lg:flex-row justify-between items-end gap-10 mb-[80px]">
            <div>
              <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-6">
                <div className="w-2 h-2 bg-[#ed351d]" />
                PORTAL CAPABILITIES
              </div>
              <h2 className="text-[40px] md:text-[60px] font-medium leading-[1.1] tracking-tight max-w-[800px] text-[#1d1d1f]">
                Everything you need to <span className="text-gray-400">manage fleet operations.</span>
              </h2>
            </div>
            <Link to="/workspace/account-type" className="text-sm font-bold uppercase tracking-widest border-b-2 border-black pb-1 hover:text-[#ed351d] hover:border-[#ed351d] transition-colors whitespace-nowrap mb-2">
              → Access Portal
            </Link>
          </div>

          {/* Staggered Wow Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-[30px] p-[40px] flex flex-col justify-between min-h-[380px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 group hover:-translate-y-2 transition-all duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-[#ed351d] group-hover:text-white transition-colors duration-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/></svg>
              </div>
              <div className="flex flex-col gap-4 mt-12">
                <h3 className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">Submit a Request</h3>
                <p className="text-[18px] font-light text-gray-500 leading-relaxed">
                  Create new load bookings, specify cargo details, and receive instant dispatch confirmations.
                </p>
              </div>
            </div>
            
            <div className="bg-[#1b2432] rounded-[30px] p-[40px] flex flex-col justify-between min-h-[380px] shadow-[0_20px_50px_rgba(27,36,50,0.3)] md:translate-y-[40px] group hover:-translate-y-2 transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#ed351d] blur-[80px] opacity-30 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:bg-[#ed351d] transition-colors duration-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div className="flex flex-col gap-4 mt-12 relative z-10">
                <h3 className="text-[32px] font-bold text-white tracking-tight">Track Active Loads</h3>
                <p className="text-[18px] font-light text-white/70 leading-relaxed">
                  View live freight movements, track vehicle status, and check accurate arrival times.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-[30px] p-[40px] flex flex-col justify-between min-h-[380px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 group hover:-translate-y-2 transition-all duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-[#ed351d] group-hover:text-white transition-colors duration-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div className="flex flex-col gap-4 mt-12">
                <h3 className="text-[32px] font-bold text-[#1d1d1f] tracking-tight">Access Records</h3>
                <p className="text-[18px] font-light text-gray-500 leading-relaxed">
                  Review past delivery logs, download compliance documents, and audit completed freight operations.
                </p>
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* SECURE SECTION - Original Design Preserved */}
      <div className="w-full bg-[#ffffff] flex justify-center overflow-hidden border-b border-black/5 pb-[60px]">
        <section className="relative flex flex-col md:flex-row md:pt-[100px] md:pb-[100px] md:px-[100px] pt-[40px] pb-[40px] px-[20px] gap-[20px] w-full max-w-[1440px] md:h-[500px] h-[400px] items-start md:items-center">
          
          {/* Top-Left stroke ellipses */}
          <div className="absolute md:top-[-140px] top-[0px] md:left-[-200px] left-[-200px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] border-[1px] border-[#ed351d] opacity-30 pointer-events-none" />
          <div className="absolute md:top-[-190px] top-[-30px] md:left-[-150px] left-[-180px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20 pointer-events-none" />
          
          {/* Bottom-Right solid red ellipse */}
          <div className="absolute md:bottom-[-200px] bottom-[-100px] md:right-[-100px] right-[-50px] md:w-[960px] w-[331px] md:h-[545px] h-[221px] rounded-[100%] bg-[#ed351d] pointer-events-none" />
          
          {/* Bottom-Right stroke ellipses */}
          <div className="absolute md:bottom-[-180px] bottom-[-80px] md:right-[-80px] right-[-40px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-40 pointer-events-none" />
          <div className="absolute md:bottom-[-160px] bottom-[-60px] md:right-[-60px] right-[-20px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20 pointer-events-none" />

          {/* White ellipses over red */}
          <div className="absolute md:right-[0px] right-[-100px] md:bottom-[-100px] bottom-[-100px] md:w-[960px] w-[408px] md:h-[545px] h-[231px] rounded-[100%] border-[1px] border-white/20 pointer-events-none" />
          <div className="absolute md:right-[20px] right-[-80px] md:bottom-[-80px] bottom-[-80px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-white/40 pointer-events-none" />
          <div className="absolute md:right-[40px] right-[-60px] md:bottom-[-60px] bottom-[-60px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-white/60 pointer-events-none" />

          {/* Text Content */}
          <h2 className="md:text-[62px] text-[30px] font-bold md:leading-[72px] leading-[34px] text-[#1b2432] md:w-[597px] w-full max-w-[280px] shrink-0 font-space-grotesk text-left relative z-10 tracking-tight">
            Secure and efficient fleet operation services
          </h2>
          
          {/* Tablet mockup */}
          <div className="absolute md:right-[45px] md:-bottom-[45px] right-[-20px] -bottom-[20px] md:w-[700px] w-[350px] flex items-end justify-center z-20">
             <img src="/Galaxy Tab S8 Ultra-Mockup.png" alt="Platform Preview" className="w-full h-auto object-contain drop-shadow-2xl" />
          </div>
          
        </section>
      </div>

      {/* FOOTER / SERVICES - Black */}
      <section id="services" className="bg-[#0b0f14] text-white pt-[100px] pb-[40px] px-[20px] md:px-[60px] flex justify-center">
        <div className="w-full max-w-[1440px] flex flex-col">
          <div className="flex items-center gap-2 text-[#ed351d] text-sm font-bold tracking-widest uppercase mb-12">
            <div className="w-2 h-2 bg-[#ed351d]" />
            What we do
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-[100px]">
            <h2 className="text-[40px] md:text-[70px] font-medium leading-none flex items-center gap-4">
              Our <div className="w-[60px] h-[60px] bg-[#ed351d] rounded-lg rotate-12 flex items-center justify-center shadow-lg"><Truck className="w-8 h-8 text-white -rotate-12" /></div> Services
            </h2>
            <p className="text-white/50 text-sm max-w-[300px] leading-relaxed">
              {displayName} hauls your cargo across Nigeria — request a truck, follow it live on the map, and keep every delivery record secure in one portal.
            </p>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10 text-xs text-white/40">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <Link to="/superadmin" className="hover:text-white transition-colors">Platform Admin</Link>
            </div>
            <span>© {new Date().getFullYear()} {displayName}. All rights reserved.</span>
          </div>
        </div>
      </section>

    </div>
  );
}

