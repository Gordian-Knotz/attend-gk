"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Per-navigation transition for the admin dashboard.
 *
 * This is a `template.tsx` rather than part of `layout.tsx` on purpose:
 * a layout persists across sibling-route navigation, so an animation
 * placed there runs once on first load and never again. A template
 * re-mounts on every navigation, which is exactly when this should fire.
 *
 * Deliberately short (0.28s) — admin is a tool people click through all
 * day, and anything longer starts costing them time on every page.
 */
export default function AdminTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
