"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

const MOTION_TAG = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
} as const;

/**
 * Blur-to-crisp heading reveal.
 *
 * React Bits ships BlurText and SplitText for this, but both take a plain
 * string and split it into per-word spans — which would destroy the
 * `<span className="italic text-primary">` accent that every heading on
 * this site is built around. This keeps the children as authored and
 * animates the heading as one block instead, so the effect reads the same
 * without costing the brand's signature device.
 *
 * The reduced-motion branch is gated on mount. A plain `<h2>` and a
 * `motion.h2` carrying `initial` styles differ in their emitted attributes, so
 * choosing between them during render from a browser-only value is a hydration
 * mismatch — React #418, reported against HTML rather than text. Same fix as
 * `blur-label.tsx` and `site/stat-value.tsx`; see doc 13.
 */
export function RevealHeading({
  children,
  className,
  as = "h2",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: keyof typeof MOTION_TAG;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const Tag = as;

  if (mounted && reduceMotion) {
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = MOTION_TAG[as];

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}
