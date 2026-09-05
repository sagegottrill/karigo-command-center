import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Light page enter — CSS only, no blur/layout thrash. */
export function PageReveal({ children }: { children: ReactNode }) {
  // Removing key={pathname} to prevent massive DOM thrashing and 15-20 second unmount delays.
  return (
    <div className="page-enter flex flex-col gap-6">
      {children}
    </div>
  );
}
