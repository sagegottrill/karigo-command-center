import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo driver detail — retired. */
export const Route = createFileRoute("/workspace/app/drivers/$driverId")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
