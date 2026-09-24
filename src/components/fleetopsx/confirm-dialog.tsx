import { AlertTriangle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An in-app confirmation, because `window.confirm` CANNOT BE TRUSTED.
 *
 * Once a user ticks Chrome's "prevent this page from creating additional
 * dialogs" — or the app runs inside a webview/iframe that suppresses native
 * modals — every `confirm()` silently returns false. The action then just
 * doesn't happen, with no error, no toast and no clue: exactly how "Make
 * Available" appeared broken while "Off Duty" (which never asks) worked.
 *
 * Use this anywhere an action needs a yes/no. It is a real dialog: Escape and
 * a click outside back out, the destructive choice is visually second.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  layout = "row",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red for destructive choices. */
  tone?: "default" | "danger";
  busy?: boolean;
  /**
   * `stacked` is the delete dialog the departments draw: the warning, then the
   * question, then the two answers. The default row layout stays as it is for
   * every confirm already built on it.
   */
  layout?: "row" | "stacked";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  if (layout === "stacked") {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onCancel();
          if (e.key === "Enter" && !busy) onConfirm();
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          className="flex w-[338px] max-w-full flex-col items-center gap-5 rounded-[10px] bg-white px-5 py-6 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]"
        >
          <OctagonAlert
            className={cn("size-11", tone === "danger" ? "text-[#ED351D]" : "text-[#1B2432]")}
            strokeWidth={1.5}
          />
          <p className="text-center text-[14px] leading-5 tracking-[0.4px] text-[#1B2432] whitespace-pre-line">
            {body}
          </p>
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="text-[14px] font-medium tracking-[0.4px] text-[#ED351D] hover:underline disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={onConfirm}
              className="h-9 rounded bg-[#ED351D] px-7 text-[13px] font-medium tracking-[0.4px] text-white hover:bg-[#d62e19] disabled:opacity-60"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#141A1F]/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
        if (e.key === "Enter" && !busy) onConfirm();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-[420px] max-w-full flex-col gap-4 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_18px_50px_rgba(12,12,13,0.28)]"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
              tone === "danger" ? "bg-[#FDECEA] text-[#ED351D]" : "bg-[#F1F2F4] text-[#1B2432]",
            )}
          >
            <AlertTriangle className="size-4" strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold leading-6 text-[#1B2432]">{title}</h3>
            <p className="text-[13px] leading-5 whitespace-pre-line text-[#5C6470]">{body}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-10 rounded-lg px-4 text-[14px] font-semibold text-[#5C6470] hover:bg-[#F1F2F4] disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
            className={cn(
              "h-10 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-60",
              tone === "danger"
                ? "bg-[#ED351D] hover:bg-[#d62e19]"
                : "bg-[#1B2432] hover:bg-[#2a3547]",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
