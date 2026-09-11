import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo messages — not in production Figma portals. */
export const Route = createFileRoute("/workspace/app/messages")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
