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
            <Link to="/workspace/account-type" className="text-[13px] font-medium text-slate-500 hover:text-[#1d1d1f] transition-colors hidden sm:block">
              Log in
            </Link>
            <Link to="/workspace/account-type">
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
          className="relative flex w-full max-w-7xl flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center pt-24 pb-16 sm:pt-32 sm:pb-24"
        >
          <h1 className="max-w-5xl text-[44px] font-bold tracking-tight sm:text-6xl lg:text-[80px] leading-[1.05] text-[#1d1d1f] font-space-grotesk">
            Manage your fleet operation <br className="hidden sm:block" /> with confidence.
          </h1>
          
          <p className="mt-6 sm:mt-8 max-w-2xl text-[17px] sm:text-[19px] lg:text-[21px] text-slate-500 leading-relaxed font-medium px-2">
            Streamline your logistics. Request trucks, track shipments in real time, and manage all your delivery paperwork from one secure dashboard.
          </p>
          
          <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto px-4 sm:px-0">
            <Link to="/workspace/account-type" className="w-full sm:w-auto">
              <Button size="lg" className="h-14 w-full sm:w-auto rounded-full bg-[#1d1d1f] text-white hover:bg-black px-8 text-[16px] font-semibold shadow-lg shadow-black/10 transition-all border-none">
                Start your workspace <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </Link>
            <a href="#features" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="h-14 w-full sm:w-auto rounded-full border-black/[0.1] bg-white text-[#1d1d1f] hover:bg-slate-50 px-8 text-[16px] font-semibold transition-all shadow-sm">
                Explore Features
              </Button>
            </a>
          </div>

          <div className="mt-20 sm:mt-24 w-full max-w-6xl relative px-4 sm:px-0">
            <div className="relative w-full aspect-[16/9] sm:aspect-[2/1] rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-2xl shadow-black/10 ring-1 ring-black/5 bg-[#ebebeb]">
              <img 
                src="https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&q=80&w=2800" 
                alt="Delivery Trucks" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent mix-blend-multiply" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full max-w-7xl px-6 py-32 border-t border-black/[0.05]">
          <div className="mb-20 text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl text-[#1d1d1f] font-space-grotesk">
              Everything you need to <span className="text-[#0066cc]">manage fleet operations.</span>
            </h2>
            <p className="mt-6 text-lg text-slate-500">
              Secure and efficient fleet operation services.
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
            <Link to="/superadmin" className="hover:text-[#1d1d1f] transition-colors">Platform Admin</Link>
            <span>© {new Date().getFullYear()} FleetOpsX. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TenantLandingPage() {
  const { tenantName } = RootRoute.useRouteContext();
  const displayName = tenantName || "FLEETOPSX";

  return (
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col items-center overflow-x-hidden w-full font-['Inter',sans-serif]">
      
      {/* HEADER — 1440x100 desktop / 390x61 mobile, bg=#1b2432 */}
      <div className="w-full bg-[#1b2432] border-b border-[#e2e5e9] flex justify-center">
        <header className="w-full max-w-[1440px] md:h-[100px] h-[61px] flex flex-row items-center md:py-[12px] md:px-[32px] py-[5px] px-[19px] gap-[10px]">
          <div className="flex flex-row items-center gap-[16px]">
             <img src="/petroline-transparent.png" alt="Petroline Transport Ltd" className="h-[40px] md:h-[60px] object-contain" />
          </div>
        </header>
      </div>

      {/* MAIN CONTENT — gap 32px desktop / 18px mobile */}
      <main className="w-full flex flex-col md:gap-[32px] gap-[18px] md:mt-[10px] mt-[18px] items-center md:pb-0 pb-0">
        
        {/* HERO — 1380x800 desktop / calc(100%-30px)x560 mobile */}
        <section 
          className="bg-[#000000] rounded-[10px] md:w-[1380px] md:h-[800px] w-[calc(100%-30px)] h-[560px] flex flex-col md:pt-[102px] md:pb-[102px] md:px-[209px] p-[20px] md:gap-[30px] gap-[20px] items-center justify-center text-center mx-auto overflow-hidden relative bg-center bg-cover bg-no-repeat"
          style={{ backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url('/hero.jpeg')" }}
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
        <div className="w-full bg-[#ffffff] flex justify-center relative overflow-hidden">
          {/* Top-Left stroke ellipses */}
          <div className="absolute md:top-[-140px] top-[0px] md:left-[-406px] left-[-200px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] border-[1px] border-[#ed351d] opacity-30 pointer-events-none" />
          <div className="absolute md:top-[-190px] top-[-30px] md:left-[-355px] left-[-180px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20 pointer-events-none" />
          {/* Bottom-Right solid red ellipse */}
          <div className="absolute md:bottom-[-210px] bottom-[-100px] md:right-[-193px] right-[-50px] md:w-[960px] w-[331px] md:h-[545px] h-[221px] rounded-[100%] bg-[#ed351d] pointer-events-none" />
          {/* Bottom-Right stroke ellipses */}
          <div className="absolute md:bottom-[-200px] bottom-[-80px] md:right-[-176px] right-[-40px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-40 pointer-events-none" />
          <div className="absolute md:bottom-[-150px] bottom-[-60px] md:right-[-125px] right-[-20px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20 pointer-events-none" />

          <section className="flex flex-col md:flex-row md:pt-[100px] md:pb-[100px] md:px-[100px] pt-[40px] pb-[40px] px-[20px] gap-[20px] w-full max-w-[1440px] md:h-[500px] h-[400px] items-start md:items-center relative z-10">
            <h2 className="md:text-[62px] text-[30px] font-[700] md:leading-[72px] leading-[34px] text-[#1b2432] md:w-[597px] w-[216px] md:h-[216px] h-[136px] shrink-0 font-['Space_Grotesk',sans-serif] text-left">
              Secure and efficient fleet operation services
            </h2>
            {/* Tablet mockup */}
            <div className="md:absolute md:right-[45px] md:top-1/2 md:-translate-y-1/2 absolute right-0 bottom-0 md:w-[576px] w-[300px] md:h-[457px] h-[238px] flex items-center justify-center translate-y-[20px] md:translate-y-0 translate-x-[20px] md:translate-x-0">
               <img src="/Galaxy Tab S8 Ultra-Mockup.png" alt="Platform Preview" className="w-full h-full object-contain drop-shadow-2xl" />
            </div>
            {/* White ellipses over red */}
            <div className="absolute md:right-[-100px] right-[-100px] md:bottom-[-100px] bottom-[-100px] md:w-[960px] w-[408px] md:h-[545px] h-[231px] rounded-[100%] border-[1px] border-white/20 pointer-events-none" />
            <div className="absolute md:right-[-80px] right-[-80px] md:bottom-[-80px] bottom-[-80px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-white/40 pointer-events-none" />
            <div className="absolute md:right-[-60px] right-[-60px] md:bottom-[-60px] bottom-[-60px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-white/60 pointer-events-none" />
          </section>
        </div>

      </main>

      {/* FOOTER — 1440x100 desktop / 390x70 mobile, bg=#1b2432 */}
      <div className="w-full bg-[#1b2432] flex justify-center">
        <footer className="w-full max-w-[1440px] md:h-[100px] h-[70px] flex items-center justify-center">
          <p className="md:text-[12px] text-[11.41px] font-[400] md:leading-[16px] leading-[13.81px] text-[#ffffff] text-center w-[250px] md:w-auto">
            POWERED BY FLEETOPSX | COPYRIGHT {new Date().getFullYear()}
          </p>
        </footer>
      </div>

    </div>
  );
}

