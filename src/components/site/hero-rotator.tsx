"use client";

import { useReducedMotion } from "motion/react";

import RotatingText from "@/components/reactbits/RotatingText";

/**
 * "Built for ___" — cycles the audiences the hero paragraph already names,
 * so the motion carries real copy rather than decoration.
 *
 * Fixed-width container: the phrases differ in length, and letting the box
 * resize on every rotation would shove the CTA row around.
 */
const AUDIENCES = [
  "security guards",
  "drivers",
  "site crews",
  "cleaning teams",
  "field technicians",
];

export function HeroRotator() {
  const reduceMotion = useReducedMotion();

  return (
    <p className="mt-6 flex flex-wrap items-baseline gap-x-2 font-display text-2xl">
      <span>Built for</span>
      {reduceMotion ? (
        <span className="italic text-primary">{AUDIENCES[0]}</span>
      ) : (
        <RotatingText
          texts={AUDIENCES}
          rotationInterval={2600}
          staggerFrom="first"
          staggerDuration={0.02}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-110%", opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          mainClassName="overflow-hidden italic text-primary"
          splitLevelClassName="overflow-hidden"
        />
      )}
    </p>
  );
}
