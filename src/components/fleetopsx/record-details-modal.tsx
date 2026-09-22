import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The read-only record dialog behind the Transport Manager's row menu.
 *
 * Every department board the TM reads gives him a 3-dots that opens this: the
 * whole record, every field, with no field he can type in and no Save button.
 * A department writes its own records; the TM still has to be able to open one
 * and read it before he asks a question about it, and until now the glimpse
 * boards offered him a grey "View only" label where the menu should be — sight
 * of the row without sight of the record.
 *
 * Deliberately one component for HR's staff, licence and duty records and
 * Engineering's jobs and trucks: the TM should not have to learn a different
 * dialog per department, and a fact added to one board shows up the same way on
 * the next.
 */
export type DetailFact = {
  label: string;
  value: ReactNode;
};

export function RecordDetailsModal({
  open,
  onClose,
  title,
  subtitle,
  badge,
  facts,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Optional status pill under the heading. */
  badge?: ReactNode;
  facts: DetailFact[];
  /** Closing line: what this record is, and who owns it. */
  note?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[560px] max-w-full flex-col gap-4 overflow-y-auto rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-[20px] font-semibold leading-6 tracking-[0.4px] text-[#1B2432]">
              {title}
            </h3>
            {subtitle ? (
              <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="grid size-7 shrink-0 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
          >
            <X className="size-4" />
          </button>
        </div>

        {badge ? <div className="flex flex-wrap items-center gap-2">{badge}</div> : null}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#8E95A1]">
                {fact.label}
              </dt>
              <dd className="min-w-0 break-words text-[14px] leading-5 text-[#1B2432]">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        {note ? (
          <p className="border-t border-[#E2E5E9] pt-3 text-[12px] leading-5 text-[#5C6470]">{note}</p>
        ) : null}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded bg-[#1B2432] px-4 text-[14px] font-medium tracking-[0.4px] text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
