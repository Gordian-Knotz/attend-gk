"use client";

import { useReducedMotion } from "motion/react";

import BlurText from "@/components/reactbits/BlurText";

/**
 * Word-by-word blur reveal for a short plain-string label (the mono
 * eyebrows above section headings). Safe to split per word here because,
 * unlike the headings, these carry no inline markup.
 *
 * BlurText renders a flex-wrap <p>; under reduced motion this falls back to
 * a plain <p> with the same classes so layout doesn't shift.
 */
export function BlurLabel({
  text,
  className,
  delay = 60,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <p className={className}>{text}</p>;
  }

  return (
    <BlurText
      text={text}
      className={className}
      delay={delay}
      animateBy="words"
      direction="bottom"
      stepDuration={0.3}
    />
  );
}
