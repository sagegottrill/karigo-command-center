import { createFileRoute } from "@tanstack/react-router";
import { CustomerPortal } from "@/components/fleetopsx/customer-portal";

export const Route = createFileRoute("/pwa/$tenantId")({
  component: CustomerPortalWrapper,
});

function CustomerPortalWrapper() {
  const { tenantId } = Route.useParams();

  return <CustomerPortal tenantId={tenantId} />;
}
