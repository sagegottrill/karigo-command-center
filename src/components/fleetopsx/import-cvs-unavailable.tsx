import { PortalOverlay } from "@/components/fleetopsx/portal-overlay";
import { useState, useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Functional Import CVS — parses CSV locally and passes rows to the provided onImport handler. */
export function ImportCvsUnavailableModal({
  open,
  onClose,
  onImport,
  entityLabel = "records",
}: {
  open: boolean;
  onClose: () => void;
  onImport?: (rows: Record<string, string>[]) => Promise<void>;
  entityLabel?: string;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Invalid file format. Please upload a .csv file.");
      return;
    }

    if (!onImport) {
      toast.error("Import logic is not wired for this entity yet.");
      onClose();
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        if (!text) throw new Error("Empty file");
        
        // Simple CSV parser
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length < 2) throw new Error("File must contain a header row and at least one data row");
        
        // Split by comma, respecting quotes
        const parseLine = (line: string) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') {
              current += '"';
              i++; // skip escaped quote
            } else if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current);
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current);
          return result.map(s => s.trim());
        };

        const headers = parseLine(lines[0]!).map(h => h.trim().toLowerCase());
        const dataRows = lines.slice(1).map(line => {
          const values = parseLine(line);
          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });
          return row;
        });

        await onImport(dataRows);
        toast.success(`Successfully imported ${dataRows.length} ${entityLabel}`);
        onClose();
      } catch (err) {
        toast.error(`Import failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read the file.");
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <PortalOverlay onBackdropClick={isProcessing ? undefined : onClose}>
      <div
        className="relative flex w-full max-w-[420px] flex-col rounded-[10px] bg-white px-6 py-6 shadow-[0px_20px_60px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-cvs-title"
      >
        <h3 id="import-cvs-title" className="text-[20px] font-semibold tracking-[0.4px] text-[#141A1F]">
          Import {entityLabel} via CSV
        </h3>
        <div className="my-4 h-px w-full bg-[#F1F2F4]" />
        
        <p className="text-[14px] leading-5 tracking-[0.4px] text-[#5C6470] mb-6">
          Upload a .csv file to bulk import {entityLabel}. The first row must contain the column headers.
        </p>

        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          disabled={isProcessing}
        />

        <div 
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors ${isProcessing ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed' : 'border-[#e2e5e9] bg-[#fafafa] hover:bg-gray-50 hover:border-gray-300 cursor-pointer'}`}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 text-[#1B2432] animate-spin mb-3" />
          ) : (
            <UploadCloud className="w-10 h-10 text-[#8e95a1] mb-3" />
          )}
          <span className="text-[14px] font-medium text-[#141a1f]">
            {isProcessing ? "Processing import..." : "Click to select a CSV file"}
          </span>
          {!isProcessing && (
             <span className="text-[12px] text-[#8e95a1] mt-1">Maximum file size: 5MB</span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="mt-6 flex h-9 w-full items-center justify-center rounded bg-gray-100 text-[14px] font-medium tracking-[0.4px] text-[#141A1F] hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </PortalOverlay>
  );
}
