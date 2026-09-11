import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo God View charts — retired; use Central Dashboard. */
export const Route = createFileRoute("/workspace/app/god-view")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
