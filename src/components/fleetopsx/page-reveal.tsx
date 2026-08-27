import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Light page enter — CSS only, no blur/layout thrash. */
export function PageReveal({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div key={pathname} className="page-enter flex flex-col gap-6">
      {children}
    </div>
  );
}
