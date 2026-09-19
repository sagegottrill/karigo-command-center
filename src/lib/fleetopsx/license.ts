/**
 * Licence expiry — the one thing Staff Records has to be able to say about a
 * driver's licence: not just "P018", but "and it runs out on 12 Mar 2027".
 *
 * The live Driver row carries only the date string, so the state (valid /
 * expiring / expired) is derived here from that date rather than trusted from a
 * `compliance` field nobody ever writes — a licence that lapsed last month must
 * never read as Valid.
 */

export type LicenseTone = "valid" | "soon" | "expired" | "missing";

export interface LicenseExpiry {
  tone: LicenseTone;
  /** One line for the table cell / phone card. */
  text: string;
  /** Whole days until expiry (negative once past). null = no usable date. */
  days: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** How close a licence has to be to expiry before it is flagged. */
export const LICENSE_WARNING_DAYS = 60;

/**
 * Parse a licence date without timezone drift: "2027-03-12" is the 12th even
 * when the browser sits behind UTC (where `new Date("2027-03-12")` renders as
 * the 11th). Also accepts a full timestamp, so an import that wrote one still
 * lands on the right day.
 */
function parseExpiryDay(value?: string | null): { y: number; m: number; d: number } | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]) - 1, d: Number(iso[3]) };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { y: parsed.getFullYear(), m: parsed.getMonth(), d: parsed.getDate() };
}

/** "12 Mar 2027" — the licence date as written on the card. */
export function formatLicenseDate(value?: string | null): string {
  const day = parseExpiryDay(value);
  if (!day) return "—";
  return `${day.d} ${MONTHS[day.m]} ${day.y}`;
}

/**
 * What the Staff Records licence column should say, and how it should read:
 *  - no date recorded  → amber "Expiry not recorded" (a gap to fill, not a pass)
 *  - already lapsed    → red   "Expired 12 Mar 2026"
 *  - within 60 days    → amber "Expires 12 Mar 2027"
 *  - otherwise         → grey  "Expires 12 Mar 2027"
 */
export function licenseExpiry(value?: string | null, today: Date = new Date()): LicenseExpiry {
  const day = parseExpiryDay(value);
  if (!day) return { tone: "missing", text: "Expiry not recorded", days: null };

  const from = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const to = Date.UTC(day.y, day.m, day.d);
  const days = Math.round((to - from) / 86_400_000);
  const label = formatLicenseDate(value);

  if (days < 0) return { tone: "expired", text: `Expired ${label}`, days };
  if (days <= LICENSE_WARNING_DAYS) return { tone: "soon", text: `Expires ${label}`, days };
  return { tone: "valid", text: `Expires ${label}`, days };
}

/** Text colour per state — red lapsed, amber soon/unrecorded, grey in date. */
export function licenseToneClass(tone: LicenseTone): string {
  switch (tone) {
    case "expired":
      return "text-[#ED351D]";
    case "soon":
    case "missing":
      return "text-[#B26A00]";
    case "valid":
      return "text-[#5C6470]";
  }
}
