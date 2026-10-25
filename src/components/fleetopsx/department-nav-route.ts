/**
 * The department rail's route-matching rules — pure logic, no DOM, no React.
 *
 * Kept out of the component file so it can be regression-tested headlessly
 * (`npm run test:unit`). The "two lights at once" bug that reached the reader
 * was exactly a rule like `isPathActive` applied in isolation, and rules this
 * central deserve their own tests instead of only a manual click-through.
 */

/** A path is "on" a nav destination when it is the destination or below it. */
export function isPathActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Which ONE nav destination owns this path.
 *
 * The rule the reader always assumed: exactly one item lights up. When two
 * destinations both match (`/workspace/app/store/parts-request` matches itself
 * AND the shorter `/workspace/app/store`), the MOST SPECIFIC one wins — the
 * longer prefix takes the highlight and the shallower ancestor stands down.
 * Ties keep the first (duplicates are a config mistake the unit check guards).
 *
 * Returns null when nothing matches: no item should be lit.
 */
export function resolveActiveTo(pathname: string, candidates: readonly string[]): string | null {
  let winner: string | null = null;
  let winnerLength = -1;
  const seen = new Set<string>();
  for (const to of candidates) {
    if (!isPathActive(pathname, to) || seen.has(to)) continue;
    seen.add(to);
    if (winner === null || to.length > winnerLength) {
      winner = to;
      winnerLength = (to ?? "").length;
    }
  }
  return winner;
}

/**
 * Is this specific destination the one that owns the current path?
 *
 * Aliasing-safe: querying a `to` that is not even in the candidate list
 * resolves to false, so a stale link can never keep an inherited highlight.
 */
export function isActiveRoute(
  pathname: string,
  to: string,
  candidates: readonly string[],
): boolean {
  return resolveActiveTo(pathname, candidates) === to;
}
