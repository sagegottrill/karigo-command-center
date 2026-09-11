import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo approvals hub — use Partner Requests / Fleet Dispatch. */
export const Route = createFileRoute("/workspace/app/approvals")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
