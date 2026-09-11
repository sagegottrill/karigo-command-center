import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo admin/settings — retired; use Figma account management screens. */
export const Route = createFileRoute("/workspace/app/admin")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
