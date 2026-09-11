import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo depreciation — not shipped in current portals. */
export const Route = createFileRoute("/workspace/app/depreciation")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
