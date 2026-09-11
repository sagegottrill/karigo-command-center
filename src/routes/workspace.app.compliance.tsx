import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo compliance — not shipped in current portals. */
export const Route = createFileRoute("/workspace/app/compliance")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
