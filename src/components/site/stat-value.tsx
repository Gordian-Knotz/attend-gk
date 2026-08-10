"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import CountUp from "@/components/reactbits/CountUp";

/**
 * Client boundary for a single stat tile's value, so `StatTiles` itself can
 * stay a server component.
 *
 * Only plain numbers animate. Tiles also carry things like "24/7", which
 * would either break the parse or count up nonsensically — those render
 * straight through. Reduced-motion users get the final figure immediately.
 *
 * The reduced-motion branch is gated on mount for the same reason as
 * `motion/blur-label.tsx`: swapping `<CountUp>` for a bare string changes the
 * rendered **text**, so deciding it during render from a browser-only value is
 * a hydration mismatch (React #418). Server and first client render always take
 * the same branch; the swap happens a tick later.
 */
export function StatValue({ value, unit }: { value: string; unit?: string }) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const trimmed = value.trim();
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(trimmed);
  const animate = isPlainNumber && !(mounted && reduceMotion);

  return (
    <>
      {animate ? (
        <CountUp to={Number(trimmed)} duration={1.2} separator="," />
      ) : (
        value
      )}
      {unit && <span className="text-primary">{unit}</span>}
    </>
  );
}
