import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/customer-portal")({
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";
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
