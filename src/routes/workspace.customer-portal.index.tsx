import { createFileRoute, redirect } from "@tanstack/react-router";

// The customer portal index redirects straight to login.
// workspace.account-type.tsx already funnels partner users here.
export const Route = createFileRoute("/workspace/customer-portal/")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/customer-portal/login", replace: true });
  },
  component: () => null,
});
