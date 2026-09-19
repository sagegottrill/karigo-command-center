import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo trips list — retired; use Fleet Dispatch / Tracking Operations. */
export const Route = createFileRoute("/workspace/app/trips/")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
