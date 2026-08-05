"use client";

import { useReducedMotion } from "motion/react";

import CountUp from "@/components/reactbits/CountUp";

/**
 * Client boundary for a single stat tile's value, so `StatTiles` itself can
 * stay a server component.
 *
 * Only plain numbers animate. Tiles also carry things like "24/7", which
 * would either break the parse or count up nonsensically — those render
 * straight through. Reduced-motion users get the final figure immediately.
 */
export function StatValue({ value, unit }: { value: string; unit?: string }) {
  const reduceMotion = useReducedMotion();

  const trimmed = value.trim();
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(trimmed);
  const animate = isPlainNumber && !reduceMotion;

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
