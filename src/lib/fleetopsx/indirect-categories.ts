/**
 * The Indirect Expense ledger's categories (Accounts > Indirect Expense) —
 * what makes up indirect cost, in the Transport Manager's own words: the
 * consumables the store buys and issues (Spare Parts, Tyres, Lubricant,
 * Battery, Rim) plus the labour that fits them (External Labour, read from
 * the workshop's work orders).
 *
 * "Other Expenses" stays as the ledger's tail for the non-trip rows that are
 * neither of the six (police claims, insurance, medical) — removing it would
 * delete real money from the ledger's total.
 */
export const INDIRECT_CATEGORIES = [
  "Spare Parts",
  "Tyres",
  "Lubricant",
  "Battery",
  "Rim",
  "External Labour",
  "Other Expenses",
] as const;

export type IndirectCategory = (typeof INDIRECT_CATEGORIES)[number];

export type StoreLineCategory = "Spare Parts" | "Tyres" | "Lubricant" | "Battery" | "Rim";

/**
 * Classify a store-ledger line (a purchase or an issue) by what it bought,
 * from the item's own operating name — the same words the store floor uses.
 * Tyres are checked first so a tyre size that mentions rims ("1100R20 rim")
 * still reads as a Tyres line.
 */
export function classifyStoreLine(text: string): StoreLineCategory {
  if (/tyre|tire/i.test(text)) return "Tyres";
  if (/\brim/i.test(text)) return "Rim";
  if (/batter/i.test(text)) return "Battery";
  if (/lubr|oil|grease|hydraulic/i.test(text)) return "Lubricant";
  return "Spare Parts";
}
