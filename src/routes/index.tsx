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
              We craft high-impact digital experiences through strategic design, seamless coding, and creative thinking.
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
  const displayName = tenantName || "FLEETOPSX";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  return (
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col items-center overflow-x-hidden w-full font-['Inter',sans-serif]">
      
      {/* HEADER — 1440x100 desktop / 390x61 mobile, bg=#1b2432 */}
      <div className="w-full bg-[#1b2432] border-b border-[#e2e5e9] flex justify-center">
        <header className="w-full max-w-[1440px] md:h-[100px] h-[61px] flex flex-row items-center md:py-[12px] md:px-[32px] py-[5px] px-[19px] gap-[10px]">
          <div className="flex flex-row items-center gap-[16px]">
             <img src={logoSrc} alt={tenantName || "Petroline Transport Ltd"} className="h-[40px] md:h-[60px] object-contain" />
          </div>
        </header>
      </div>

      {/* MAIN CONTENT — gap 32px desktop / 18px mobile */}
      <main className="w-full flex flex-col md:gap-[32px] gap-[18px] md:mt-0 mt-0 items-center md:pb-0 pb-0">
        
        {/* HERO — full-bleed edge-to-edge (not inset/centered card) */}
        <section 
          className="relative flex h-[560px] w-full flex-col items-center justify-center overflow-hidden bg-[#000000] bg-cover bg-center bg-no-repeat p-5 text-center md:h-[800px] md:gap-[30px] md:px-[209px] md:py-[102px] gap-5"
          style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('/figma/landing-hero.jpg')" }}
        >
          <h1 className="md:text-[90px] text-[36px] md:font-[500] font-[700] md:leading-[90px] leading-[40px] text-[#ffffff] md:w-[1160px] w-[329px] md:h-[180px] h-[120px] flex items-center justify-center font-['Space_Grotesk',sans-serif]">
            Manage your fleet operation with confidence
          </h1>
          <p className="md:text-[24px] text-[14px] md:font-[600] font-[500] md:leading-[32px] leading-[17.5px] text-[#ffffff] md:w-[668px] w-[293px] md:h-[96px] h-[70px] mx-auto">
            Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
          </p>
          <Link to="/workspace/account-type" className="mt-auto md:mt-0">
            <button className="bg-[#ed351d] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] md:w-[149px] md:h-[40px] w-[134px] h-[36px] flex items-center justify-center hover:bg-[#d62e19] transition-colors">
              <span className="md:text-[16px] text-[14px] font-[500] md:leading-[24px] leading-[20px] text-[#ffffff]">Access Portal</span>
            </button>
          </Link>
        </section>

        {/* PORTAL CAPABILITIES — 1440x628 desktop / auto mobile */}
        <div className="w-full border-t border-[#344256] flex justify-center">
          <section className="w-full max-w-[1440px] md:h-[628px] h-auto flex flex-col md:items-start items-center md:pt-[100px] md:pb-[100px] md:px-[85px] pt-[75px] pb-[75px] px-[0px] gap-[30px]">
            <div className="bg-[#1b2432] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] md:w-[186px] w-[159px] h-[40px] flex items-center justify-center">
              <span className="md:text-[14px] text-[12px] md:font-[700] font-[400] md:leading-[20px] leading-[16.5px] text-[#ffffff] whitespace-nowrap">PORTAL CAPABILITIES</span>
            </div>
            <h2 className="md:text-[36px] text-[24px] md:font-[500] font-[400] md:leading-[40px] leading-[32px] text-[#5c6470] md:w-[1270px] w-full max-w-[348px] md:max-w-none md:text-left text-center px-[20px] md:px-0">
              Everything you need to manage fleet operations.
            </h2>
            {/* Cards — 1270x286 desktop, itemSpacing=40 */}
            <div className="flex flex-row md:gap-[40px] gap-[20px] md:w-[1270px] w-full h-auto overflow-x-auto snap-x snap-mandatory px-[20px] md:px-0 pb-4 scrollbar-hide">
              {/* Card 1 */}
              <div className="flex flex-col flex-none md:flex-1 w-[320px] md:w-[396px] md:h-[286px] h-auto min-h-[200px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-end snap-start">
                <div className="absolute top-[10px] right-[10px] opacity-20">
                  <Pin className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] rotate-45" />
                </div>
                <div className="flex flex-col gap-[9px] md:w-[345px] w-full z-10">
                  <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Submit a Request</h3>
                  <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                    Create new load bookings, specify cargo details, and receive instant dispatch confirmations.
                  </p>
                </div>
              </div>
              {/* Card 2 */}
              <div className="flex flex-col flex-none md:flex-1 w-[320px] md:w-[396px] md:h-[286px] h-auto min-h-[200px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-end snap-start">
                <div className="absolute top-[10px] right-[10px] opacity-20">
                  <Pin className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] rotate-45" />
                </div>
                <div className="flex flex-col gap-[9px] md:w-[345px] w-full z-10">
                  <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Track Active Loads</h3>
                  <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                    View live freight movements, track vehicle status, and check accurate arrival times.
                  </p>
                </div>
              </div>
              {/* Card 3 */}
              <div className="flex flex-col flex-none md:flex-1 w-[320px] md:w-[396px] md:h-[286px] h-auto min-h-[200px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-end snap-start">
                <div className="absolute top-[10px] right-[10px] opacity-20">
                  <Pin className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] rotate-45" />
                </div>
                <div className="flex flex-col gap-[9px] md:w-[345px] w-full z-10">
                  <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Access Records</h3>
                  <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                    Review past delivery logs, download compliance documents, and audit completed freight operations.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* SECURE SECTION — 1440x500 desktop, bg=white */}
        <div className="w-full bg-[#ffffff] flex justify-center overflow-hidden border-b border-black/5">
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
            <h2 className="md:text-[62px] text-[30px] font-[700] md:leading-[72px] leading-[34px] text-[#1b2432] md:w-[597px] w-[216px] shrink-0 font-['Space_Grotesk',sans-serif] text-left relative z-10">
              Secure and efficient fleet operation services
            </h2>
            
            {/* Tablet mockup */}
            <div className="absolute md:right-[45px] md:-bottom-[45px] right-[-20px] -bottom-[20px] md:w-[700px] w-[350px] flex items-end justify-center z-20">
               <img src="/Galaxy Tab S8 Ultra-Mockup.png" alt="Platform Preview" className="w-full h-auto object-contain drop-shadow-2xl" />
            </div>
            
          </section>
        </div>

      </main>

      {/* FOOTER — 1440x100 desktop / 390x70 mobile, bg=#1b2432 */}
      <div className="w-full bg-[#1b2432] flex justify-center">
        <footer className="w-full max-w-[1440px] md:h-[100px] h-[70px] flex items-center md:justify-start justify-center md:px-[38px] px-4">
          <p className="md:text-[12px] text-[11.41px] font-[400] md:leading-[16px] leading-[13.81px] text-[#ffffff] uppercase tracking-[0.4px]">
            POWERED BY FLEETOPSX | COPYRIGHT {new Date().getFullYear()}
          </p>
        </footer>
      </div>

    </div>
  );
}

