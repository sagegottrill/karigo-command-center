import { PortalOverlay } from "@/components/fleetopsx/portal-overlay";

/** Figma Import CVS — endpoint not wired yet; show centered unavailable modal instead of a toast stub. */
export function ImportCvsUnavailableModal({
  open,
  onClose,
  entityLabel = "records",
}: {
  open: boolean;
  onClose: () => void;
  entityLabel?: string;
}) {
  if (!open) return null;
  return (
    <PortalOverlay onBackdropClick={onClose}>
      <div
        className="relative flex w-full max-w-[420px] flex-col rounded-[10px] bg-white px-6 py-6 shadow-[0px_20px_60px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-cvs-title"
      >
        <h3 id="import-cvs-title" className="text-[20px] font-semibold tracking-[0.4px] text-[#141A1F]">
          Import CVS
        </h3>
        <div className="my-4 h-px w-full bg-[#F1F2F4]" />
        <p className="text-[14px] leading-5 tracking-[0.4px] text-[#5C6470]">
          Bulk import for {entityLabel} is not available yet. Use Create to add one account at a time until the CSV
          endpoint is connected.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 flex h-9 w-full items-center justify-center rounded bg-[#1B2432] text-[14px] font-medium tracking-[0.4px] text-white"
        >
          Got it
        </button>
      </div>
    </PortalOverlay>
  );
}
