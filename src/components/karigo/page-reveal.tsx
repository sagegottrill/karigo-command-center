import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { appleSpring } from "@/lib/karigo/apple-motion";

/** Critically damped page enter — opacity + subtle Y, interruptible by next navigation. */
export function PageReveal({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reduce = useReducedMotion();

  if (reduce) {
    return <div key={pathname}>{children}</div>;
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={appleSpring.page}
      className="flex flex-col gap-6"
    >
      {children}
    </motion.div>
  );
}

export function SoftPress({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={appleSpring.press}
    >
      {children}
    </motion.div>
  );
}
