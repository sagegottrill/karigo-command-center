import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/fleetopsx/export-menu";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, fleetService } from "@/lib/fleetopsx/services";
import { csvRow } from "@/lib/fleetopsx/csv";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import { matchesQuery } from "@/lib/fleetopsx/search-match";
import type { TruckHead, TruckTail } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

/**
 * RETURNING FLEET — the field desk's inspection queue.
 *
 * A truck the gate stamped back into the yard lands on Check Up; this board is
 * the yard's own answer to it: every head and tail sitting on Check Up, oldest
 * stamp first, so nobody comes home and stands uninspected. The officer works
 * the row here — pass it (back to Available) or fail it (file the maintenance
 * report, which moves the row to Maintenance and hands the verdict to
 * Engineering).
 */

export const Route = createFileRoute("/workspace/app/field-returning")({
  component: FieldReturningPage,
});

const FIELD_OPS_ROLES = ["Fleet Field Ops", "Fleet Field Operations", "Transport Manager", "Platform Admin"];

type Row = {
  key: string;
  kind: "head" | "tail";
  id: string;
  label: string;
  detail: string;
  model: string;
};

function FieldReturningPage() {
  const navigate = useNavigate();
  const [heads, setHeads] = useState<TruckHead[]>([]);
  const [tails, setTails] = useState<TruckTail[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authService.getRoles().some((r: string) => FIELD_OPS_ROLES.includes(r))) {
      navigate({ to: "/workspace/app/unauthorized", replace: true });
      return;
    }
  }, [navigate]);

  const refresh = useCallback(() => {
    void Promise.all([fleetService.listHeads(), fleetService.listTails()])
      .then(([h, t]) => {
        setHeads(h);
        setTails(t);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load the registry"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const h of heads) {
      if (h.status !== "Check Up") continue;
      out.push({
        key: `head:${h.id}`,
        kind: "head",
        id: h.id,
        label: h.capNumber || h.number,
        detail: h.registration,
        model: h.make,
      });
    }
    for (const t of tails) {
      if (t.status !== "Check Up") continue;
      out.push({
        key: `tail:${t.id}`,
        kind: "tail",
        id: t.id,
        label: t.number,
        detail: t.registration || t.type,
        model: t.type,
      });
    }
    return out;
  }, [heads, tails]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => matchesQuery(`${r.label} ${r.detail} ${r.model}`, q));
  }, [rows, query]);

  const pass = async (row: Row) => {
    setBusy(row.key);
    try {
      if (row.kind === "head") {
        await fleetService.updateHeadStatus(row.id, "Available", row.detail);
      } else {
        await fleetService.updateTailStatus(row.id, "Available", row.detail);
      }
      toast.success(`${row.label} passed inspection — back to Available.`);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the asset");
    } finally {
      setBusy(null);
    }
  };

  const fail = async (row: Row) => {
    const defect = window.prompt(`What defect did the inspection find on ${row.label}?`);
    if (!defect || !defect.trim()) return;
    setBusy(row.key);
    try {
      await fleetService.updateHeadStatus(row.id, "Maintenance", row.detail);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      toast.success(`${row.label} sent to Maintenance — file the report from Report History.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the asset");
    } finally {
      setBusy(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-4 pb-28 md:gap-[30px] md:p-[30px] md:pb-[30px]">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F] md:text-[24px] md:font-medium md:leading-8 md:text-[#1B2432]">
          Returning Fleet
        </h2>
        <p className="text-[12px] text-[#5C6470] md:text-[11.4px] md:uppercase md:tracking-[0.4px] md:text-[rgba(92,100,112,0.6)]">
          trucks back from trip waiting on the yard's physical inspection
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-[320px]">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5C6470]" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cap, plate or model"
            className="h-10 w-full rounded border border-[#E2E5E9] bg-white pl-9 pr-3 text-[14px] text-[#1B2432] outline-none placeholder:text-[#5C6470] focus:border-[#1B2432]"
          />
        </div>
        <ExportMenu
          csv={() => {
            const header = "Kind,Cap/Number,Plate/Detail,Model,Status";
            const body = filtered
              .map((r) => csvRow([r.kind === "head" ? "Truck Head" : "Truck Tail", r.label, r.detail, r.model, "Check Up"]))
              .join("\n");
            return `${header}\n${body}`;
          }}
          rows={filtered.length}
          title="Returning Fleet"
          fileNameBase="returning_fleet"
        />
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <FigmaLoadingState label="Loading the inspection queue…" />
        ) : slice.length === 0 ? (
          <FigmaEmptyState
            title="Nothing is waiting on inspection"
            body="Every truck the gate stamped returned has been inspected. The moment a head or tail lands on Check Up, it appears here."
          />
        ) : (
          slice.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-medium tracking-[0.4px] text-[#1B2432]">
                  {row.kind === "head" ? "Truck Head" : "Truck Tail"} · {row.label}
                </p>
                <p className="text-[12.5px] text-[#5C6470]">
                  {row.detail}
                  {row.model ? ` · ${row.model}` : ""}
                </p>
                <span className="mt-1 inline-flex w-fit items-center rounded-full bg-[#2F6BD8] px-2 py-0.5 text-[11px] font-medium text-white">
                  Check Up
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === row.key}
                  onClick={() => void pass(row)}
                  className="h-10 rounded border border-[#137A3D] bg-[#E7F6EC] px-4 text-[13px] font-medium text-[#137A3D] hover:bg-[#d5efdd] disabled:opacity-40"
                >
                  Passed — to Available
                </button>
                <button
                  type="button"
                  disabled={busy === row.key}
                  onClick={() => void fail(row)}
                  className={cn(
                    "h-10 rounded border border-[#ED351D] bg-[#FDECEA] px-4 text-[13px] font-medium text-[#C0392B] hover:bg-[#f9dcd9]",
                    "disabled:opacity-40",
                  )}
                >
                  Failed — to Maintenance
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-[13px] text-[#5C6470]">
          <span>
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-9 rounded border border-[#E2E5E9] bg-white px-3 disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="h-9 rounded border border-[#E2E5E9] bg-white px-3 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
