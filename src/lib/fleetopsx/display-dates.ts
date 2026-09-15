/** Figma-style table date label ("14 Sept 2026") — shared by the TM tables. */
export function formatTableDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Two-line table cell: date on top, time underneath — so long stamps never truncate. */
export function formatDateLines(value?: string | null): { date: string; time: string } {
  if (!value) return { date: "—", time: "" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Machine-sortable audit stamp: "2026-09-15 08:45" (YYYY-MM-DD HH:MM). */
export function formatDateTimeStamp(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
