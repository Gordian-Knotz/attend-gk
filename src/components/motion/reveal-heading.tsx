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
  const Tag = as;

  if (reduceMotion) {
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
