/**
 * Money typed into naira fields (Trip Allowance, Motor Boy, Ticket, …).
 *
 * Fortune's field note, 15/10/2026: "02000" was accepted on Motor Boy and
 * showed no commas. Two rules now live here so every naira field behaves
 * the same:
 *
 *  1. No leading zeros — "02000" is a typo, not 20,000. The input refuses
 *     to record it (typing "0" first does nothing; typing "0" then
 *     "2" becomes "2"), so the value saved can never start with a zero.
 *  2. The field itself carries the commas — "9,000", "237,900" — and a
 *     comma the user types is kept as a thousands separator: "20,000"
 *     saves 20000 via `parseMoneyInput`.
 *
 * `sanitizeMoneyInput` is applied on every keystroke; `parseMoneyInput` at
 * save time (and numeric save paths elsewhere read Number() off the raw
 * string, which strips commas naturally).
 */

/**
 * "02000" → "02,000" is refused; the field shows "20,000". Runs on every
 * keystroke: digits only, the leading zero never survives a second digit,
 * and the digits are regrouped with commas so the naira figure reads
 * "9,000" / "237,900" IN THE FIELD itself — not only in the breakdown.
 * A lone "0" stays while it is all the user has typed (0 is a valid cost).
 */
export function sanitizeMoneyInput(raw: string): string {
  const digits = raw.replace(/,/g, "");
  // Non-digits never enter the field…
  if (!/^\d*$/.test(digits)) return "";
  if (digits === "") return "";
  // …and a number may not start with a leading zero (0 itself is valid).
  const clean = digits.replace(/^0+(?=\d)/, "");
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "20,000" → 20000. Blank or unparsable input reads as NaN. */
export function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/,/g, "");
  if (!/^\d+$/.test(digits)) return NaN;
  return Number(digits);
}
