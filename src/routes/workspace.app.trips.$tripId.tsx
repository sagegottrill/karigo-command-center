import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo trip detail — retired. */
export const Route = createFileRoute("/workspace/app/trips/$tripId")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
