/**
 * Apple fluid interface spring presets (WWDC Designing Fluid Interfaces).
 * Default UI: critically damped (bounce 0). Momentum gestures may use bounce ~0.2.
 */
export const appleSpring = {
  /** Move / reposition — damping 1.0, response ~0.4 */
  settle: { type: "spring" as const, bounce: 0, duration: 0.4 },
  /** Snappier chrome / sidebar — response ~0.3 */
  chrome: { type: "spring" as const, bounce: 0, duration: 0.32 },
  /** Press feedback settle */
  press: { type: "spring" as const, bounce: 0, duration: 0.22 },
  /** Page content materialize */
  page: { type: "spring" as const, bounce: 0, duration: 0.45 },
  /** Only for momentum/flick releases */
  momentum: { type: "spring" as const, bounce: 0.2, duration: 0.4 },
};

export const appleEase = {
  /** Critically-damped-ish CSS fallback */
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Mirror for reversible transitions */
  in: "cubic-bezier(0.64, 0, 0.78, 0)",
  press: "ease-out",
};
