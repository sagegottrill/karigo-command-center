import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo reports — not shipped in current portals. */
export const Route = createFileRoute("/workspace/app/reports")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
