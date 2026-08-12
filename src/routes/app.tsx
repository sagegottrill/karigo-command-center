import { useEffect, useState } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppSidebar } from "@/components/karigo/app-sidebar";
import { AppHeader } from "@/components/karigo/app-header";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
