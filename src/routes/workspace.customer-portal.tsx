import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/customer-portal")({
  head: (args: any) => {
    const ctx = args.routeContext || args.context;
    const tenantName = ctx?.tenantName || "Workspace";
    return {
      meta: [
        { title: `Partner Portal | ${tenantName}` },
        { name: "description", content: `Partner portal for ${tenantName}` },
      ],
    };
  },
  component: CustomerPortalShell,
});

function CustomerPortalShell() {
  return <Outlet />;
}

