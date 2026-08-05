"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import AnimatedContent from "@/components/reactbits/AnimatedContent";

/**
 * Scroll-entry reveal. Thin wrapper over React Bits' AnimatedContent that
 * adds the two things it doesn't do:
 *
 *  - honours `prefers-reduced-motion` by rendering children untouched
 *  - defaults to a short, small movement, so a page of these reads as one
 *    system rather than a sequence of separate effects
 *
 * Wrap sections and cards, not individual words.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 24,
  duration = 0.6,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatedContent
      distance={distance}
      duration={duration}
      delay={delay}
      ease="power3.out"
      initialOpacity={0}
      animateOpacity
      threshold={0.15}
      className={className}
    >
      {children}
    </AnimatedContent>
  );
}
