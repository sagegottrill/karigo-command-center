import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo trips list — retired; use Fleet Dispatch / Active Dispatch. */
export const Route = createFileRoute("/workspace/app/trips/")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
