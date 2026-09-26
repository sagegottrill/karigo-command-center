import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared tone tokens for the Live Operations dashboard.
 *
 * The Figma drives every tile and every popover row from one of six tones: the
 * tile's border, the hairline under its number, the icon chip and the status
 * pills all take the SAME tone, which is how a red ACCIDENT card reads as one
 * object instead of four separately-coloured pieces.
 */
export type TileTone = "grey" | "amber" | "purple" | "green" | "blue" | "red" | "teal";

export type ToneStyle = {
  /** The hairline under a tile's big number, and the split divider. */
  line: string;
  /** The tile border (same hue, low alpha). */
  border: string;
  /** Icon chip background. */
  chipBg: string;
  /** Foreground for the tone — icon glyph, numbers, pill text. */
  text: string;
};

export const TONE: Record<TileTone, ToneStyle> = {
  grey: { line: "#B7BDC7", border: "rgba(92,100,112,0.35)", chipBg: "#F1F2F4", text: "#5C6470" },
  amber: { line: "#F99E1F", border: "rgba(249,158,31,0.55)", chipBg: "#FFF3E2", text: "#E8880C" },
  purple: { line: "#A855F7", border: "rgba(168,85,247,0.45)", chipBg: "#F4EAFF", text: "#8B33E0" },
  green: { line: "#2FBF5A", border: "rgba(47,191,90,0.55)", chipBg: "#E6F9EC", text: "#17A34A" },
  blue: { line: "#4C8DF6", border: "rgba(76,141,246,0.45)", chipBg: "#E8F1FE", text: "#2F6FE0" },
  red: { line: "#EF4343", border: "rgba(239,67,67,0.5)", chipBg: "#FFE9EA", text: "#D22B2B" },
  teal: { line: "#14B8A6", border: "rgba(20,184,166,0.45)", chipBg: "#E4F7F5", text: "#0E9E8F" },
};

/**
 * Fleet / driver status → tone. One table, read by the tiles, the popover rows
 * and the audit cards, so the same word can never be green in one place and
 * amber in another.
 */
export const STATUS_TONE: Record<string, TileTone> = {
  // Fleet assets
  "On Trip": "grey",
  "Out of Yard": "grey",
  Assigned: "grey",
  Available: "green",
  "Check Up": "blue",
  Maintenance: "amber",
  Accident: "red",
  // Requests
  "Pending Approval": "amber",
  Dispatched: "purple",
  Declined: "red",
  // Drivers
  "On Active Trips": "grey",
  "Off Duty": "amber",
};

export function toneOf(status: string | null | undefined): TileTone {
  return STATUS_TONE[String(status ?? "").trim()] ?? "grey";
}

/** Solid pill — `Pending Approval`, `Dispatched`, `Declined`, `ON TRIP`. */
export function StatusPill({
  label,
  tone = "grey",
  variant = "solid",
  className,
}: {
  label: string;
  tone?: TileTone;
  /** `solid` = filled (request rows), `soft` = tinted (audit cards). */
  variant?: "solid" | "soft";
  className?: string;
}) {
  const t = TONE[tone];
  if (variant === "solid") {
    return (
      <span
        className={cn(
          "shrink-0 rounded-[4px] px-2 py-[3px] text-[10px] font-semibold leading-none tracking-[0.2px] text-white",
          className,
        )}
        style={{ backgroundColor: t.line }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-[4px] px-2 py-[4px] text-[10px] font-semibold uppercase leading-none tracking-[0.4px]",
        className,
      )}
      style={{ backgroundColor: t.chipBg, color: t.text }}
    >
      {label}
    </span>
  );
}

/**
 * A row inside a drill popover. Three shapes, all from the Figma:
 *  - `plain`  — reference + note, with an optional pill on the right
 *  - `status` — reference + a coloured status word on the right
 *  - `boxed`  — a bordered card: reference + a coloured inspection line
 */
export function DrillRow({
  title,
  meta,
  right,
  variant = "plain",
  tone = "grey",
  className,
}: {
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  variant?: "plain" | "status" | "boxed";
  tone?: TileTone;
  className?: string;
}) {
  const t = TONE[tone];

  if (variant === "boxed") {
    return (
      <div
        className={cn("rounded-[4px] border px-2.5 py-2", className)}
        style={{ borderColor: "rgba(255,255,255,0.18)" }}
      >
        <p className="truncate text-[12px] font-semibold leading-5 text-white">{title}</p>
        {meta ? (
          <p className="truncate text-[10px] font-medium leading-4" style={{ color: t.line }}>
            {meta}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-start justify-between gap-3 py-1.5", className)}>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium leading-5 text-white">{title}</p>
        {meta ? (
          <p className="truncate text-[10px] font-normal leading-4 text-white/55">{meta}</p>
        ) : null}
      </div>
      {variant === "status" ? (
        <span
          className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.3px]"
          style={{ color: t.line }}
        >
          {right}
        </span>
      ) : (
        right
      )}
    </div>
  );
}

/**
 * The dark popover that opens under a tile. Absolutely positioned inside the
 * tile's relative wrapper, so it overlaps the section below exactly as the
 * design shows — and, unlike the old row menus, it is never clipped because
 * nothing on this page establishes an overflow clip.
 */
export function DrillPopover({
  open,
  onClose,
  title,
  children,
  footer,
  footerAlign = "between",
  width = 360,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  footerAlign?: "between" | "end";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      className="absolute left-0 top-[calc(100%+10px)] z-40 overflow-hidden rounded-[10px] bg-[#1B2432] shadow-[0_18px_40px_-12px_rgba(12,12,13,0.55)]"
      style={{ width }}
    >
      <div className="px-4 pb-2.5 pt-3.5">
        <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.5px] text-white">
          {title}
        </p>
      </div>
      <div className="max-h-[340px] overflow-y-auto px-4 pb-2">{children}</div>
      {footer ? (
        <div
          className={cn(
            "flex items-center border-t border-white/12 px-4 py-2.5 text-[11px] font-medium text-white/80",
            footerAlign === "end" ? "justify-end" : "justify-center",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** Segmented tab strip shared by the audit dialogs and the fleet registry. */
export function ToneTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  variant = "segment",
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  variant?: "segment" | "pill";
}) {
  /**
   * Two looks, both from the design:
   *  - `segment` — the board's control: light track, the active chip filled navy.
   *  - `pill` — the audit dialog's control: the track itself is navy and the
   *    active chip is WHITE. The two are inverses; using one for both would put a
   *    dark chip on a light strip inside a dark dialog.
   */
  const pill = variant === "pill";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[7px] p-[3px]",
        pill ? "bg-[#1B2432]" : "bg-[#F1F2F4]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-[5px] px-3 py-[7px] text-[12px] leading-none tracking-[0.2px] transition-colors",
              pill
                ? on
                  ? "bg-white font-semibold text-[#1B2432]"
                  : "font-medium text-white/75 hover:text-white"
                : on
                  ? "bg-[#1B2432] font-medium text-white"
                  : "font-medium text-[#5C6470] hover:text-[#1B2432]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The audit modal: dark title band, grey uppercase subtitle, optional tab strip,
 * a scrolling body and the Close / Print Audit footer. Both audit dialogs (the
 * partner requests breakdown and the fleet registry) are this same shell.
 */
export function AuditDialog({
  open,
  onClose,
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  children,
  onPrint,
  printLabel = "Print Audit",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
  onPrint?: () => void;
  printLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 md:p-6">
      {/* 750px — the design's audit modal is a narrow sheet, not a wide one. */}
      <div className="flex max-h-[90vh] w-full max-w-[750px] flex-col overflow-hidden rounded-[10px] bg-white shadow-[0_24px_60px_-16px_rgba(12,12,13,0.45)]">
        <div className="flex items-start justify-between gap-4 bg-[#1B2432] px-6 py-4">
          <h2 className="text-[18px] font-semibold leading-6 tracking-[0.2px] text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#E2E5E9] px-6 pb-3.5 pt-3.5">
          <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.6px] text-[#5C6470]">
            {subtitle}
          </p>
          {tabs && activeTab && onTabChange ? (
            <ToneTabs
              tabs={tabs as { id: string; label: string }[]}
              active={activeTab}
              onChange={onTabChange}
              variant="pill"
            />
          ) : null}
        </div>

        <div className="sleek-scrollbar flex-1 overflow-y-auto bg-white p-6">{children}</div>

        <div className="flex items-center justify-end gap-3 border-t border-[#E2E5E9] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border border-[#D3D7DE] bg-white px-4 py-2 text-[13px] font-medium text-[#5C6470] transition-colors hover:bg-[#F7F8FA]"
          >
            Close
          </button>
          {onPrint ? (
            <button
              type="button"
              onClick={onPrint}
              className="rounded-[6px] bg-[#1B2432] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#243043]"
            >
              {printLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * HTML-escape for anything the print sheet interpolates. Every value in a
 * print row comes from a database field someone typed — a cargo description,
 * a partner name, a driver — so a `<script>` or an `<img onerror>` typed into
 * any of them must print as text, never run. Title and subtitle are escaped
 * inside printSheet itself; row builders call `escHtml` on each value.
 */
export function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allowlist-sanitize a print body before it is written into the print window.
 *
 * The row HTML arrives with database text interpolated into it — partner
 * names, cargo descriptions, vendor notes — so a `<script>` or an
 * `<img onerror>` typed into any of those fields must never survive into the
 * about:blank window (which shares this app's origin). DOMParser does not
 * execute anything during the parse; walking the tree keeps only the report
 * markup and drops every other element (unwrapping its text) and every
 * attribute except inline styles.
 */
function sanitizePrintBody(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const ALLOWED = new Set([
    "TABLE",
    "THEAD",
    "TBODY",
    "TFOOT",
    "TR",
    "TD",
    "TH",
    "CAPTION",
    "COLGROUP",
    "COL",
    "P",
    "STRONG",
    "EM",
    "B",
    "I",
    "U",
    "H1",
    "H2",
    "H3",
    "H4",
    "BR",
    "HR",
    "DIV",
    "SPAN",
    "UL",
    "OL",
    "LI",
  ]);
  const stripAttributes = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase() !== "style") el.removeAttribute(attr.name);
    }
  };
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED.has(child.tagName)) {
        // Unwrap: keep the text, drop the element and its attributes.
        const frag = doc.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        child.replaceWith(frag);
        walk(el); // the inserted children need the same treatment
        return;
      }
      stripAttributes(child);
      walk(child);
    }
  };
  walk(root);
  root
    .querySelectorAll("script,style,iframe,object,embed,link,meta,base,form")
    .forEach((el) => el.remove());
  return root.innerHTML;
}

/** Opens a clean print sheet — same pattern the dispatch details page uses. */
export function printSheet(rawTitle: string, rawSubtitle: string, bodyHtml: string) {
  const title = escHtml(rawTitle);
  const subtitle = escHtml(rawSubtitle);
  const body = sanitizePrintBody(bodyHtml);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 28px; color: #1B2432; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #5C6470; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; margin-bottom: 18px; }
    h2 { font-size: 14px; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 7px 6px; font-size: 12px; border-bottom: 1px solid #E2E5E9; text-align: left; vertical-align: top; }
    th { color: #5C6470; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .total { font-weight: bold; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
    <h1>${title}</h1>
    <div class="meta">${subtitle} &nbsp;|&nbsp; Printed ${escHtml(new Date().toLocaleString("en-NG"))}</div>
    ${body}
    <script>window.onload = function () { window.print(); };</script>
  </body></html>`);
  w.document.close();
  w.focus();
  return true;
}

/**
 * Click-to-open state for a set of drill popovers, keyed by tile id — only one
 * popover is ever open, which is what the design shows.
 */
export function useDrill() {
  const [openId, setOpenId] = useState<string | null>(null);
  return {
    openId,
    isOpen: (id: string) => openId === id,
    toggle: (id: string) => setOpenId((cur) => (cur === id ? null : id)),
    close: () => setOpenId(null),
  };
}
