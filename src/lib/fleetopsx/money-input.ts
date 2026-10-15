/**
 * Money typed into naira fields (Trip Allowance, Motor Boy, Ticket, …).
 *
 * Fortune's field note, 15/10/2026: "02000" was accepted on Motor Boy and
 * showed no commas. Two rules now live here so every naira field behaves
 * the same:
 *
 *  1. No leading zeros — "02000" is a typo, not 20,000. The input markup
 *     refuses to record it (typing "0" first does nothing; typing "0" then
 *     "2" becomes "2"), so the value stored on the dispatch can never even
 *     start with a zero.
 *  2. A typed comma IS a valid thousands separator — the saved number is
 *     computed from the comma-stripped value, so "20,000" saves 20000.
 *
 * `sanitizeMoneyInput` is applied on every keystroke; `parseMoneyInput` at
 * save time (and numeric save paths elsewhere read Number() off the raw
 * string, which strips commas naturally).
 */

/** "0200" → "200". Refuses "0"-only input and keeps "" empty. */
export function sanitizeMoneyInput(raw: string): string {
  const withCommas = raw.replace(/,/g, "");
  // Non-digits never enter the field…
  if (!/^\d*$/.test(withCommas)) return "";
  if (withCommas === "") return "";
  // …and a number may not start with a leading zero (0 itself is valid).
  return withCommas.replace(/^0+(?=\d)/, "");
}

/** "20,000" → 20000. Blank or unparsable input reads as NaN. */
export function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/,/g, "");
  if (!/^\d+$/.test(digits)) return NaN;
  return Number(digits);
}
