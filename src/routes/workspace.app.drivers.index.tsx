import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo drivers list — use Fleet Registry / HR instead. */
export const Route = createFileRoute("/workspace/app/drivers/")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
