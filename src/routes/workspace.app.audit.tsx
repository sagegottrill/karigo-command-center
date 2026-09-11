import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo audit log UI — not shipped in current portals. */
export const Route = createFileRoute("/workspace/app/audit")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
