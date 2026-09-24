import { AlertTriangle } from "lucide-react";
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
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
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
