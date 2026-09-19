/**
 * What a truck IS, in the operator's words.
 *
 * The body (Full Sided, Semi Sided, Flatbed Tail…) belongs to the TAIL and the
 * operating category (UPCOUNTRY, LOCAL…) to the HEAD — and until Fleet Ops could
 * record them, every tail in production was stored as "Flatbed Tail" and every
 * assignment screen had to show that single word. These are the same words the
 * partner uses when raising a request, so what a partner asks for can be matched
 * against what is actually being hitched up.
 */
export const TAIL_BODY_OPTIONS = [
  "Flatbed Tail",
  "Full Sided",
  "Semi Sided",
  "Flat",
  "Side Guide",
  "Low Bed",
  "6 Meter Truck",
  "8 Meter Truck",
  "Pick Up",
  "Trailer",
] as const;

/** A head's operating category, as the fleet roster records it. */
export const HEAD_CATEGORY_OPTIONS = [
  "UPCOUNTRY",
  "LOCAL",
  "Pickup",
  "Short Body",
  "Factory",
] as const;

/**
 * A dropdown list that ALWAYS contains the asset's current value — so opening the
 * cell on a legacy value never silently rewrites it to the first option.
 */
function withCurrent(options: readonly string[], current?: string | null): string[] {
  const list = [...options] as string[];
  const value = (current ?? "").trim();
  if (value && !list.some((o) => o.toLowerCase() === value.toLowerCase())) list.unshift(value);
  return list;
}

export function tailBodyOptions(current?: string | null): string[] {
  return withCurrent(TAIL_BODY_OPTIONS, current);
}

export function headCategoryOptions(current?: string | null): string[] {
  return withCurrent(HEAD_CATEGORY_OPTIONS, current);
}
