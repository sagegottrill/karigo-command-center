import { DIRECT_COST_CATEGORIES, money, type CostSheet } from "@/lib/fleetopsx/direct-costs";

/**
 * The navy banner both sides of the money open with: what the six commitments
 * add up to, by category, over whichever dispatches the screen is looking at.
 *
 * One component because it is one sum. The Transport Manager reads it for the
 * day he is authorising; the Accounts desk reads it for everything it has to
 * pay. Same figures, same arithmetic — a second copy of this block is how the
 * two desks would end up disagreeing about the same truck.
 */
export function DirectCostBanner({
  subtitle,
  sheets,
}: {
  /** One line saying which dispatches are being totalled. */
  subtitle: string;
  sheets: CostSheet[];
}) {
  const byCategory = DIRECT_COST_CATEGORIES.map((category) => ({
    ...category,
    total: sheets.reduce((sum, sheet) => sum + Number(sheet[category.key] ?? 0), 0),
  }));
  const total = byCategory.reduce((sum, category) => sum + category.total, 0);

  return (
    <div className="rounded-[10px] bg-[#1B2432] p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[17px] font-semibold tracking-[0.4px] text-white">
            Daily Direct Disbursal Cost Breakdown by Category
          </h3>
          <p className="text-[12px] text-[#9CA3AF]">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
            Total Direct Commitments
          </span>
          <span className="text-[20px] font-semibold tabular-nums text-[#2BB673]">
            {money(total)}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {byCategory.map((category, index) => (
          <div key={category.key} className="rounded-[6px] border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#9CA3AF]">
              {index + 1}. {category.label}
            </p>
            <p className="mt-1 text-[19px] font-semibold tabular-nums text-white">
              {money(category.total)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The breakdown cell both boards draw: three categories down each column. */
export function CostBreakdownCell({
  sheet,
  columns,
}: {
  sheet: CostSheet;
  columns: { label: string; key: import("@/lib/fleetopsx/direct-costs").DirectCostKey }[][];
}) {
  const extras = Array.isArray(sheet.extras) ? sheet.extras : [];
  return (
    <span className="grid grid-cols-2 gap-x-4 text-[10.5px] leading-[15px]">
      {columns.map((column, index) => (
        <span key={index} className="flex flex-col gap-0.5">
          {column.map((item) => (
            <span key={item.key} className="flex items-baseline justify-between gap-2">
              <span className="text-[#9CA3AF]">{item.label}:</span>
              <span className="whitespace-nowrap font-medium tabular-nums text-[#344256]">
                {money(sheet[item.key])}
              </span>
            </span>
          ))}
          {/* A line the desk added is part of what the dispatch costs, so it is
              read here with the rest of the sheet rather than hidden in a total. */}
          {index === 0
            ? extras.map((line, position) => (
                <span key={`${line.label}-${position}`} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[#9CA3AF]">{line.label}:</span>
                  <span className="whitespace-nowrap font-medium tabular-nums text-[#344256]">
                    {money(line.amount)}
                  </span>
                </span>
              ))
            : null}
        </span>
      ))}
    </span>
  );
}
