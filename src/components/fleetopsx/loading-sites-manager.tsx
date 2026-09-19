import { useState } from "react";
import { Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { partnerSiteService } from "@/lib/fleetopsx/services";
import { cn } from "@/lib/utils";

/**
 * The partner's own loading-site list, editable.
 *
 * A site can only be removed by the company that owns it — the same list the
 * request form offers, so a yard that closed (or was typed wrong) can be taken
 * out instead of sitting in the dropdown forever. New sites are still added by
 * raising a request with a typed-in one, which is the moment a partner actually
 * knows the name.
 */
export function LoadingSitesManager({
  sites,
  onChange,
  className,
}: {
  sites: string[];
  onChange: (sites: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (name: string) => {
    setRemoving(name);
    try {
      const next = await partnerSiteService.remove(name);
      onChange(next);
      toast.success(`${name} removed from your loading sites.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that loading site.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start text-[12px] font-medium tracking-[0.4px] text-[#5C6470] hover:text-[#1B2432]"
      >
        <Settings2 className="size-3.5" />
        {open ? "Hide my loading sites" : `Manage my loading sites (${sites.length})`}
      </button>

      {open ? (
        sites.length === 0 ? (
          <p className="text-[11px] tracking-[0.4px] text-[#5C6470]">
            You have no saved sites yet — add your first one with “Add your loading site” above.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#E2E5E9] rounded border border-[#E2E5E9] bg-white">
            {sites.map((site) => (
              <li key={site} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-[13px] tracking-[0.4px] text-[#1B2432]">{site}</span>
                <button
                  type="button"
                  disabled={removing === site}
                  onClick={() => void remove(site)}
                  aria-label={`Remove ${site}`}
                  title={`Remove ${site}`}
                  className="shrink-0 rounded p-1 text-[#ED351D] hover:bg-[#ED351D]/10 disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
