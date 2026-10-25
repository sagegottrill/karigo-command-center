import { ChevronLeft, ChevronRight, Search, ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { downloadCsvBlob } from "@/lib/fleetopsx/table-export";
import { DepartmentTabs } from "@/components/fleetopsx/department-sidebar";
import { cn } from "@/lib/utils";

/**
 * The store portal's shared kit — the pieces every page of the approved Store
 * and Parts Inventory design reads (Figma · Store Module, 25 Oct 2026).
 *
 * One look, five pages: white cards on the soft grey canvas, the red family
 * tabs with the underline, the custom dropdown menus (red header row, plain
 * options below), the count badge, the "1 - 12 of 20" pager and the black
 * Export CVS button. Kept here ONCE so a tweak lands on all five pages, the
 * way the design intends.
 */

/* ------------------------------------------------------------ page shell */

/**
 * The ONE page frame every store page mounts into.
 *
 * Before this shell existed, each of the four pages hand-rolled the same
 * wrapper (grey canvas, the department tab strip, headline, subtitle, action
 * row) — and hand-rolled copies are exactly how a page ends up "using half the
 * page" while its neighbours use all of it. The shell is the single place the
 * frame is defined: pass the headline words and the right-hand actions, mount
 * the content, and every page lands on the same full-width skeleton.
 *
 * It renders no sidebar and no header of its own — the app shell
 * ([workspace.app.tsx]) owns those; this is the page CONTENT frame only.
 */
export function StorePageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  /** The h1 headline — exactly as the approved frame words it. */
  title: string;
  /** The uppercase one-liner under the headline. */
  subtitle: string;
  /** Right-hand action buttons; omitted when the page is report-only. */
  actions?: ReactNode;
  /** The page's cards/tables, mounted under the headline block. */
  children: ReactNode;
}) {
  return (
    <div className="w-full bg-[#F7F8FA] pb-4">
      <DepartmentTabs department="parts" />
      <div className="w-full px-4 pt-6 pb-2 md:px-[30px]">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-[280px]">
            <h1 className="text-[26px] font-semibold tracking-[0.4px] text-[#1B2432]">{title}</h1>
            <p className="mt-1 max-w-[520px] text-[12.5px] font-medium uppercase leading-[18px] tracking-[0.4px] text-[#9AA2AC]">
              {subtitle}
            </p>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center justify-end gap-3">{actions}</div>
          ) : null}
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ classification */

/** The three families the design's tabs name. */
export type StoreTab = "parts" | "lubricants" | "tyres";

export const STORE_TABS: StoreTab[] = ["parts", "lubricants", "tyres"];

export const STORE_TAB_LABEL: Record<StoreTab, string> = {
  parts: "Spare Parts",
  lubricants: "Lubricants",
  tyres: "Tyres & Rims",
};

/** The details-table caption inside one request card, per tab. */
export const STORE_TAB_DETAILS: Record<StoreTab, string> = {
  parts: "Parts details",
  lubricants: "Lubricant details",
  tyres: "Tyre & Rims details",
};

const TYRE_RX = /tyre|tire|\brim/i;
const LUBE_SKU_RX = /^(oil|grs|grease|lub|lube|hyd|coolant|atf|ep ?2|2t|4t|sae)/i;
const LUBE_TEXT_RX =
  /lubricant|grease|coolant|hydraulic fluid|engine oil|gear oil|transmission|brake fluid|diesel|petrol/i;

/** The family a shelf line belongs to — it decides which tab shows the card. */
export function classOfItem(item: { sku: string; name: string; category: string }): StoreTab {
  const hay = `${item.category} ${item.name} ${item.sku}`;
  if (TYRE_RX.test(hay)) return "tyres";
  if (LUBE_SKU_RX.test(item.sku) || LUBE_TEXT_RX.test(`${item.category} ${item.name}`))
    return "lubricants";
  return "parts";
}

/** The store line a PO names — exact SKU, exact name, then containment. */
function itemOfPo(
  po: { partName?: string | null; kind?: string | null },
  items: Array<{ sku: string; name: string; category: string }>,
) {
  const name = (po.partName ?? "").trim().toLowerCase();
  if (!name) return undefined;
  return (
    items.find((i) => i.sku && i.sku.toLowerCase() === name) ??
    items.find((i) => i.name.trim().toLowerCase() === name) ??
    items.find((i) => i.sku && name.includes(i.sku.toLowerCase())) ??
    items.find((i) => {
      const n = i.name.trim().toLowerCase();
      return n.length > 3 && (name.includes(n) || n.includes(name));
    })
  );
}

/** The family a PO bills under — the shelf line it names decides it. */
export function classOfPo(
  po: { partName?: string | null; kind?: string | null },
  items: Array<{ sku: string; name: string; category: string }>,
): StoreTab {
  if (po.kind === "Fuel") return "lubricants";
  const item = itemOfPo(po, items);
  return item ? classOfItem(item) : "parts";
}

/* --------------------------------------------------------------------- pills */

/** The stock chip an inventory card carries — outlined, not filled. */
export function StockChip({ status }: { status: string }) {
  if (status === "Out of Stock")
    return (
      <span className="inline-flex items-center rounded-[6px] border border-[#ED351D] bg-[#FDF2F1] px-2 py-[3px] text-[12px] font-medium leading-none text-[#ED351D]">
        Out of Stock
      </span>
    );
  if (status === "Low Stock")
    return (
      <span className="inline-flex items-center rounded-[6px] border border-[#F99E1F] bg-[#FDF6EC] px-2 py-[3px] text-[12px] font-medium leading-none text-[#F99E1F]">
        Low Stock
      </span>
    );
  return null;
}

/** The filled status pill a request/PO card header carries. */
export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "green" | "red" | "blue";
}) {
  const tones = {
    amber: "bg-[#F99E1F] text-white",
    green: "bg-[#34C759] text-white",
    red: "bg-[#ED351D] text-white",
    blue: "bg-[#2F6BD8] text-white",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2.5 py-1 text-[12px] font-medium leading-4",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------- card + badge */

export function CountBadge({ value }: { value: number | string }) {
  return (
    <span className="inline-grid min-w-6 place-items-center rounded-[6px] bg-[#ED351D] px-1.5 py-[3px] text-[13px] font-semibold leading-none text-white">
      {value}
    </span>
  );
}

export function CardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-[#E2E5E9] bg-white shadow-[0px_1px_2px_rgba(27,36,50,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- family tabs */

export function FamilyTabs({
  active,
  onSelect,
  className,
}: {
  active: StoreTab;
  onSelect: (tab: StoreTab) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-[10px] border border-[#E2E5E9] bg-[#F7F8FA] p-1",
        className,
      )}
    >
      {STORE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={cn(
            "h-[34px] rounded bg-transparent px-3.5 text-[13.5px] leading-none transition-colors",
            active === tab
              ? "bg-white font-medium text-[#ED351D] shadow-[0px_1px_2px_rgba(27,36,50,0.08)]"
              : "text-[#5C6470] hover:text-[#1B2432]",
          )}
        >
          {STORE_TAB_LABEL[tab]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ dropdown */

export function Dropdown({
  value,
  options,
  onChange,
  className,
  align = "left",
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] w-full items-center justify-between gap-3 rounded-[8px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432]"
      >
        <span className="truncate">{value || (options[0] ?? "")}</span>
        <ChevronDown className="size-4 shrink-0 text-[#5C6470]" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-[44px] z-30 w-max min-w-full max-w-[260px] overflow-hidden rounded-[8px] border border-[#E2E5E9] bg-white shadow-[0px_8px_24px_rgba(27,36,50,0.18)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <button
            type="button"
            onClick={() => {
              onChange(options[0] ?? value);
              setOpen(false);
            }}
            className="block w-full bg-[#ED351D] px-3.5 py-2.5 text-left text-[13.5px] font-medium text-white"
          >
            {options[0]}
          </button>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {options.slice(1).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="block w-full px-3.5 py-2.5 text-left text-[13.5px] text-[#1B2432] hover:bg-[#FDF2F1] hover:text-[#ED351D]"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative h-[38px] w-[240px]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6470]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full rounded-[8px] border border-[#E2E5E9] bg-white pl-9 pr-3 text-[13.5px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#ED351D]"
      />
    </div>
  );
}

/* ----------------------------------------------------------- pager + export */

export function PagerFooter({
  shownFrom,
  shownTo,
  total,
  page,
  pageCount,
  onPage,
  onExport,
  exportLabel = "Export CVS",
}: {
  shownFrom: number;
  shownTo: number;
  total: number;
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  onExport: () => void;
  exportLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#E2E5E9] px-5 py-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
      <p className="text-[14px] text-[#1B2432]">
        <span className="font-semibold">
          {shownFrom}&nbsp;-&nbsp;{shownTo}
        </span>
        &nbsp;&nbsp;of&nbsp;&nbsp;{total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="grid size-[38px] place-items-center rounded-[8px] border border-[#E2E5E9] bg-white text-[#1B2432] disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="grid size-[38px] place-items-center rounded-[8px] border border-[#E2E5E9] bg-white text-[#1B2432] disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={onExport}
          className="ml-2 flex h-[38px] items-center gap-2 rounded-[8px] bg-[#1B2432] px-4 text-[13.5px] font-medium text-white hover:bg-[#2A3849]"
        >
          <Download className="size-4" />
          {exportLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- modal shell */

/** The dark-header modal the design uses for every store dialog. */
export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  width = "max-w-[560px]",
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B1220]/55 p-4">
      <div className={cn("w-full overflow-hidden rounded-[10px] bg-white shadow-2xl", width)}>
        <div className="flex items-start justify-between bg-[#1B2432] px-5 py-4">
          <div>
            <h3 className="text-[16px] font-semibold text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-white/70">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-between border-t border-[#E2E5E9] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- form primitives */

export function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13.5px] font-medium text-[#1B2432]">
        {label}
        {required && <span className="text-[#ED351D]"> *</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "h-[42px] w-full rounded-[8px] border border-[#E2E5E9] bg-white px-3 text-[13.5px] text-[#1B2432] outline-none placeholder:text-[#9AA2AC] focus:border-[#ED351D]";

export function ModalActions({
  onCancel,
  cancel = "Cancel",
  submitLabel,
  busy,
  onAction,
}: {
  onCancel: () => void;
  cancel?: string;
  submitLabel: string;
  busy?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-[#E2E5E9] px-5 py-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-[14px] text-[#5C6470] hover:text-[#1B2432]"
      >
        {cancel}
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className="h-[38px] rounded-[8px] bg-[#ED351D] px-4 text-[13.5px] font-medium text-white hover:bg-[#d92f18] disabled:opacity-60"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- CSV */

export function csvOf(rows: string[][]) {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function dateOf(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}
