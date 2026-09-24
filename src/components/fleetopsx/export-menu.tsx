import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  downloadCsvBlob,
  downloadTableImage,
  downloadTablePdf,
  findExportCard,
} from "@/lib/fleetopsx/table-export";
import { cn } from "@/lib/utils";

/**
 * The one export control every table uses: CSV, Image and PDF.
 *
 * Fortune's rule — "always put image and pdf options" — applied in one place
 * instead of seventeen copies. The button opens a small menu; each option runs
 * against the data the page already filtered (the export honours the search
 * and the filters, exactly like the old CSV-only button did).
 */
export function ExportMenu({
  csv,
  rows,
  title,
  fileNameBase,
  className,
  mobile = false,
}: {
  /** The CSV string builder — the page's own export code, run on demand. */
  csv: () => string;
  /** Row count of the filtered table; 0 means "nothing to export". */
  rows: number;
  title: string;
  fileNameBase: string;
  className?: string;
  /** Mobile variant renders full-width like the old Export CSV button. */
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const guard = () => {
    if (rows === 0) {
      toast.message("Nothing to export");
      return false;
    }
    return true;
  };

  const runCsv = () => {
    if (!guard()) return;
    downloadCsvBlob(csv(), fileNameBase);
    setOpen(false);
    toast.success("CSV downloaded.");
  };

  const runImage = async () => {
    if (!guard()) return;
    setBusy(true);
    try {
      const card = findExportCard(btnRef.current);
      if (!card) throw new Error("Could not find the table to capture.");
      await downloadTableImage(card, title, fileNameBase);
      toast.success("Image downloaded.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The image could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const runPdf = async () => {
    if (!guard()) return;
    setBusy(true);
    try {
      const card = findExportCard(btnRef.current);
      if (!card) throw new Error("Could not find the table to capture.");
      await downloadTablePdf(card, title, fileNameBase);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The PDF could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { label: "Export CSV", icon: FileText, action: runCsv, hint: "Spreadsheet data" },
    { label: "Export Image", icon: ImageIcon, action: runImage, hint: ".png for sharing" },
    { label: "Export PDF", icon: Printer, action: runPdf, hint: "Print-ready sheet" },
  ];

  return (
    <div ref={wrapRef} className={cn("relative", mobile ? "w-full" : "shrink-0", className)}>
      <button
        ref={btnRef}
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded bg-[#1B2432] text-[14px] tracking-[0.4px] text-white disabled:opacity-60",
          mobile ? "h-8 w-full justify-center px-[7px] font-medium" : "h-9 px-3",
        )}
      >
        <Download className={mobile ? "size-[18px]" : "size-4"} strokeWidth={1.75} />
        {busy ? "Exporting…" : "Export"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-[210px] overflow-hidden rounded-lg border border-[#E2E5E9] bg-white py-1 shadow-[0px_8px_24px_rgba(12,12,13,0.14)]"
        >
          {items.map(({ label, icon: Icon, action, hint }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => void action()}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#F1F2F4]"
            >
              <Icon className="size-4 shrink-0 text-[#ED351D]" strokeWidth={1.75} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[13.5px] font-medium leading-4 text-[#141A1F]">{label}</span>
                <span className="text-[11px] leading-3.5 text-[#627084]">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
