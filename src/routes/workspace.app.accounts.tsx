import { createFileRoute } from "@tanstack/react-router";
import { redirectLegacyKarigoRoute } from "@/lib/fleetopsx/legacy-redirect";

/** Legacy Karigo accounts/finance — not shipped in current portals. */
export const Route = createFileRoute("/workspace/app/accounts")({
  beforeLoad: () => redirectLegacyKarigoRoute(),
});
