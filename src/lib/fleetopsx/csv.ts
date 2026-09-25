/**
 * One CSV cell, safe everywhere — the single writer every export uses.
 *
 * Two classes of bug this kills:
 *
 *  - **Nigerian phone numbers mangle themselves.** A leading `+` (every driver
 *    phone is `+234…`) makes Excel read the cell as a formula: it throws a
 *    dialog or silently drops the number. Numeric-shaped values are wrapped in
 *    an explicit text formula (`=" +234 803 111 2222"`) that every spreadsheet
 *    app renders clean and unmangled.
 *  - **CSV formula injection.** A partner-typed value like `=HYPERLINK(...)`
 *    or `+1+cmd|' /c calc'!A0` executes when staff open the export in Excel.
 *    Anything formula-shaped that is NOT a plain number is neutralised with a
 *    leading space — inert everywhere, visually invisible in the cell.
 *
 * Quoting otherwise follows RFC 4180: wrap when the value carries a quote,
 * comma or newline; double the quotes inside.
 */

/** Leading characters Excel evaluates as a formula (= + - @ tab CR). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Plain numbers — the only formula-prefixed values safe to render as text. */
const ONLY_NUMERIC_CHARS = /^[\d\s(),.\-+]+$/;

export function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? "");
  if (FORMULA_PREFIX.test(raw)) {
    // Phones, long digit IDs and the like: an explicit text formula renders
    // the value exactly, never evaluated, never mangled.
    if (ONLY_NUMERIC_CHARS.test(raw)) {
      return `="${raw.replace(/"/g, '""')}"`;
    }
    // Anything else formula-shaped is hostile or noise — a leading space
    // defeats evaluation in Excel, Sheets and LibreOffice alike.
    return csvCell(` ${raw}`);
  }
  const s = raw.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

/** One full CSV line — cells joined with commas. */
export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}
