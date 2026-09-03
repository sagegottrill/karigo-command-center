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
            <Link to="/pwa/$tenantId" params={{ tenantId: "petroline" }} target="_blank" className="hover:text-[#0066cc] transition-colors">Demo Customer Portal</Link>
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
    <div className="min-h-screen bg-[#f1f2f4] flex flex-col items-center overflow-x-hidden">
      
      {/* Header - Desktop: 1440x100, Mobile: 390x61 */}
      <header className="w-full max-w-[1440px] md:h-[100px] h-[61px] bg-[#1b2432] border-b-[1px] border-[#e2e5e9] flex flex-row items-center md:pt-[12px] md:pb-[12px] md:px-[32px] pt-[5px] pb-[5px] px-[19px] gap-[10px]">
        <div className="flex flex-row items-center gap-[16px] md:w-[178px] md:h-[75px] w-[89px] h-[50px]">
           <div className="md:w-[178px] md:h-[100px] w-[89px] h-[50px] bg-[#ffffff] flex items-center justify-center font-bold text-[#1b2432]">
             <span className="md:text-[24px] text-[12px] uppercase">{displayName}</span>
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-[1440px] flex flex-col md:gap-[32px] gap-[18px] md:mt-[10px] mt-[18px] items-center md:pb-[100px] pb-[40px]">
        
        {/* Hero Section - Desktop: 1380x800, Mobile: 360x560 */}
        <section className="bg-[#000000] rounded-[10px] md:w-[1380px] md:h-[800px] w-[360px] h-[560px] flex flex-col md:pt-[102px] md:pb-[102px] md:px-[209px] p-[20px] md:gap-[30px] gap-[20px] items-center justify-center text-center mx-auto overflow-hidden relative">
          
          <h1 className="md:text-[90px] text-[36px] md:font-[500] font-[700] md:leading-[90px] leading-[40px] text-[#ffffff] md:w-[1160px] w-[329px] md:h-[180px] h-[120px] flex items-center justify-center">
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

        {/* Portal Capabilities - Desktop: 1440x628, Mobile: 390x546 */}
        <section className="border-t-[1px] border-[#344256] w-full max-w-[1440px] md:h-[628px] h-[546px] flex flex-col md:pt-[100px] md:pb-[100px] md:px-[85px] pt-[75px] pb-[75px] px-[20px] gap-[30px] overflow-hidden">
          
          <div className="bg-[#1b2432] rounded-[4px] pt-[5.61px] pb-[6.39px] px-[12px] md:w-[186px] w-[159px] h-[40px] flex items-center justify-center">
            <span className="md:text-[14px] text-[12px] md:font-[700] font-[400] md:leading-[20px] leading-[16.5px] text-[#ffffff]">PORTAL CAPABILITIES</span>
          </div>
          
          <h2 className="md:text-[36px] text-[24px] md:font-[500] font-[400] md:leading-[40px] leading-[32px] text-[#5c6470] md:w-[1270px] w-[348px] md:h-[40px] h-[64px]">
            Everything you need to manage fleet operations.
          </h2>

          {/* Cards Container - horizontally scrolling on mobile */}
          <div className="flex flex-row gap-[40px] md:w-[1270px] w-full md:h-[286px] h-[230px] mt-[10px] overflow-x-auto pb-4 snap-x hide-scrollbar">
            
            {/* Feature 1 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <MapPin className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Submit a Request</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  Create new load bookings, specify cargo details, and receive instant dispatch confirmations.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <Radar className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Track Active Loads</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  View live freight movements, track vehicle status, and check accurate arrival times.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col md:min-w-[396px] min-w-[300px] md:h-[286px] h-[230px] bg-[#1b2432] rounded-[10px] relative overflow-hidden text-white md:p-[40px] p-[24px] justify-between snap-start">
              <div className="md:w-[100px] w-[75px] md:h-[100px] h-[75px] flex items-center justify-center absolute top-[-10px] right-[-10px] opacity-20">
                <FileCheck2 className="md:w-[141px] w-[106px] md:h-[141px] h-[106px]" />
              </div>
              <div className="flex flex-col gap-[9px] md:w-[345px] w-[253px] z-10 mt-auto">
                <h3 className="md:text-[30px] text-[20px] font-[600] md:leading-[36px] leading-[28px] text-[#ffffff]">Access Records</h3>
                <p className="md:text-[20px] text-[14px] font-[300] md:leading-[32px] leading-[24px] text-[#ffffff]">
                  Review past delivery logs, download compliance documents, and audit completed freight operations.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Secure/Trust Section - Desktop: 1440x500, Mobile: 390x400 */}
        <section className="bg-[#ffffff] flex flex-row md:pt-[100px] md:pb-[100px] md:px-[100px] pt-[40px] pb-[40px] px-[20px] gap-[20px] w-full max-w-[1440px] md:h-[500px] h-[400px] items-center relative overflow-hidden">
          <h2 className="md:text-[62px] text-[30px] font-[700] md:leading-[72px] leading-[34px] text-[#1b2432] md:w-[597px] w-[216px] md:h-[216px] h-[136px] z-10">
            Secure and efficient fleet operation services
          </h2>
          
          <div className="absolute md:right-[100px] right-[-50px] md:w-[576px] w-[300px] md:h-[457px] h-[238px] bg-[#f1f2f4] rounded-[24px] shadow-2xl flex items-center justify-center z-10 border-[4px] border-[#e2e5e9]">
             <div className="md:text-[24px] text-[14px] font-[600] text-[#5c6470]">Platform Preview</div>
          </div>

          {/* Decorative Ellipses */}
          <div className="absolute md:right-[-100px] right-[-50px] md:w-[960px] w-[408px] md:h-[545px] h-[231px] rounded-[100%] border-[1px] border-[#ed351d] opacity-20" />
          <div className="absolute md:right-[-80px] right-[-40px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-40" />
          <div className="absolute md:right-[-60px] right-[-30px] md:w-[960px] w-[407px] md:h-[545px] h-[230px] rounded-[100%] border-[1px] border-[#ed351d] opacity-60" />
          <div className="absolute md:right-[-40px] right-[-20px] md:w-[960px] w-[360px] md:h-[545px] h-[193px] rounded-[100%] bg-[#ed351d] opacity-10" />
        </section>

      </main>

      {/* Footer - Desktop: 1440x100, Mobile: 390x70 */}
      <footer className="w-full max-w-[1440px] md:h-[100px] h-[70px] bg-[#1b2432] flex items-center justify-center">
        <p className="md:text-[12px] text-[11.41px] font-[400] md:leading-[16px] leading-[13.81px] text-[#ffffff] text-center w-[250px] md:w-auto">
          POWERED BY FLEETOPSX | COPYRIGHT {new Date().getFullYear()}
        </p>
      </footer>

    </div>
  );
}
