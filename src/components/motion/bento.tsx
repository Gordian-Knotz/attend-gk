"use client";

import * as React from "react";
import { gsap } from "gsap";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Bento grid, ported from attend-v3's MagicBento.
 *
 * WHY THIS IS A REWRITE AND NOT A VENDORED COMPONENT
 *
 * MagicBento is 919 lines built around fixed `aspect-[4/3] min-h-[200px]`
 * tiles that accept only `title` / `description` / `label` strings, on a
 * hardcoded `#120F17` field with `rgba(132, 0, 255)` glow and a 20px radius.
 * It cannot host the admin overview's real content — a 14-day recharts
 * chart, an exceptions table, two list panels — and it renders only on a
 * dark ground, so it would break under the light/dark toggle. (07's notes
 * record it being evaluated and rejected on exactly those grounds when the
 * candidate was the marketing feature grid.)
 *
 * So the *effects* are ported and the *surface* is v2's: `BentoCard` mirrors
 * `ui/card.tsx`'s shell, which means `CardHeader` / `CardContent` lay out
 * inside it identically and every existing panel drops in unchanged.
 *
 * Effects, and where each is applied:
 *
 *  - **Proximity border glow** (`BentoGrid`, all cards). The signature
 *    MagicBento behaviour: every card's ring lights by its distance to the
 *    pointer, so the grid reads as one surface. Same proximity/fade maths as
 *    the original; colour comes from `--primary` (see globals.css).
 *  - **Particles, magnetism, click ripple** (`BentoCard`, opt-in). Deliberately
 *    NOT default. Twelve drifting dots over a line chart is noise on top of
 *    data, and magnetism shifts a card under the cursor — which makes table
 *    rows harder to hit. They're enabled on the KPI tiles, where there's
 *    nothing to read precisely, and left off on the chart, table and lists.
 *
 * Tilt is dropped entirely rather than made opt-in: a rotated card distorts
 * a chart's axes, and v3's own usage passed `enableTilt={false}` anyway.
 *
 * Everything degrades to plain cards under `prefers-reduced-motion` — none
 * of the React Bits originals honour it.
 */

const PROXIMITY_RADIUS = 288; // px — matches --glow-radius: 18rem
const PARTICLE_COUNT = 10;

/* ── Grid ──────────────────────────────────────────────────────────────── */

export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid || reduceMotion) return;

    // Proximity bands, as MagicBento derives them from its spotlight radius:
    // full intensity inside `proximity`, linear ramp out to `fadeDistance`.
    const proximity = PROXIMITY_RADIUS * 0.5;
    const fadeDistance = PROXIMITY_RADIUS * 0.75;

    function paint(clientX: number, clientY: number) {
      const cards = grid!.querySelectorAll<HTMLElement>(".bento-card");

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const centreX = rect.left + rect.width / 2;
        const centreY = rect.top + rect.height / 2;

        // Distance from the pointer to the card's edge, not its centre —
        // otherwise a large card (the chart) never lights, because its
        // centre is always far away even with the pointer inside it.
        const edgeDistance = Math.max(
          0,
          Math.hypot(clientX - centreX, clientY - centreY) -
            Math.max(rect.width, rect.height) / 2
        );

        let intensity = 0;
        if (edgeDistance <= proximity) {
          intensity = 1;
        } else if (edgeDistance <= fadeDistance) {
          intensity =
            (fadeDistance - edgeDistance) / (fadeDistance - proximity);
        }

        // Percentages relative to the card, so the gradient origin tracks the
        // pointer even on the card the pointer isn't over.
        card.style.setProperty(
          "--glow-x",
          `${((clientX - rect.left) / rect.width) * 100}%`
        );
        card.style.setProperty(
          "--glow-y",
          `${((clientY - rect.top) / rect.height) * 100}%`
        );
        card.style.setProperty("--glow-intensity", intensity.toString());
      });
    }

    function clear() {
      grid!
        .querySelectorAll<HTMLElement>(".bento-card")
        .forEach((card) => card.style.setProperty("--glow-intensity", "0"));
    }

    // Scoped to the grid rather than `document` (which is what MagicBento
    // does): the admin <main> is its own scroll container and the grid fills
    // it, so a document listener would fire constantly for no extra effect.
    // clientX/clientY are viewport-relative, so scrolling needs no handling.
    function handleMove(e: PointerEvent) {
      paint(e.clientX, e.clientY);
    }

    grid.addEventListener("pointermove", handleMove);
    grid.addEventListener("pointerleave", clear);

    return () => {
      grid.removeEventListener("pointermove", handleMove);
      grid.removeEventListener("pointerleave", clear);
      clear();
    };
  }, [reduceMotion]);

  return (
    <div
      ref={gridRef}
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────── */

export function BentoCard({
  children,
  className,
  particles = false,
  magnetism = false,
  ripple = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Drifting dots on hover. Leave off over charts and tables. */
  particles?: boolean;
  /** Card drifts toward the pointer. Leave off where precise clicks matter. */
  magnetism?: boolean;
  /** Radial pulse from the click point. */
  ripple?: boolean;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const wantsEffects = !reduceMotion && (particles || magnetism || ripple);

  React.useEffect(() => {
    const card = cardRef.current;
    if (!card || !wantsEffects) return;

    const live: HTMLDivElement[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let hovered = false;

    function spawnParticles() {
      const { width, height } = card!.getBoundingClientRect();

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const timer = setTimeout(() => {
          if (!hovered) return;

          const dot = document.createElement("div");
          dot.className = "bento-particle";
          dot.style.cssText = `
            position: absolute;
            width: 3px;
            height: 3px;
            border-radius: 50%;
            background: var(--primary);
            pointer-events: none;
            z-index: 2;
            left: ${Math.random() * width}px;
            top: ${Math.random() * height}px;
          `;
          card!.appendChild(dot);
          live.push(dot);

          gsap.fromTo(
            dot,
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 0.9, duration: 0.3, ease: "back.out(1.7)" }
          );
          gsap.to(dot, {
            x: (Math.random() - 0.5) * 80,
            y: (Math.random() - 0.5) * 80,
            duration: 2 + Math.random() * 2,
            ease: "none",
            repeat: -1,
            yoyo: true,
          });
          gsap.to(dot, {
            opacity: 0.25,
            duration: 1.5,
            ease: "power2.inOut",
            repeat: -1,
            yoyo: true,
          });
        }, i * 90);

        timers.push(timer);
      }
    }

    function clearParticles() {
      timers.forEach(clearTimeout);
      timers.length = 0;

      live.forEach((dot) => {
        gsap.killTweensOf(dot);
        gsap.to(dot, {
          scale: 0,
          opacity: 0,
          duration: 0.3,
          ease: "back.in(1.7)",
          onComplete: () => dot.remove(),
        });
      });
      live.length = 0;
    }

    function handleEnter() {
      hovered = true;
      if (particles) spawnParticles();
    }

    function handleLeave() {
      hovered = false;
      if (particles) clearParticles();
      if (magnetism) {
        gsap.to(card, { x: 0, y: 0, duration: 0.3, ease: "power2.out" });
      }
    }

    function handleMove(e: PointerEvent) {
      if (!magnetism) return;
      const rect = card!.getBoundingClientRect();
      gsap.to(card, {
        x: (e.clientX - rect.left - rect.width / 2) * 0.04,
        y: (e.clientY - rect.top - rect.height / 2) * 0.04,
        duration: 0.3,
        ease: "power2.out",
      });
    }

    function handleClick(e: PointerEvent) {
      if (!ripple) return;
      const rect = card!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Reach the furthest corner, so the pulse always covers the card.
      const radius = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      );

      const pulse = document.createElement("div");
      pulse.style.cssText = `
        position: absolute;
        width: ${radius * 2}px;
        height: ${radius * 2}px;
        left: ${x - radius}px;
        top: ${y - radius}px;
        border-radius: 50%;
        background: radial-gradient(circle,
          color-mix(in srgb, var(--primary) 26%, transparent) 0%,
          color-mix(in srgb, var(--primary) 12%, transparent) 30%,
          transparent 70%);
        pointer-events: none;
        z-index: 2;
      `;
      card!.appendChild(pulse);

      gsap.fromTo(
        pulse,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => pulse.remove(),
        }
      );
    }

    card.addEventListener("pointerenter", handleEnter);
    card.addEventListener("pointerleave", handleLeave);
    card.addEventListener("pointermove", handleMove);
    card.addEventListener("click", handleClick);

    return () => {
      hovered = false;
      card.removeEventListener("pointerenter", handleEnter);
      card.removeEventListener("pointerleave", handleLeave);
      card.removeEventListener("pointermove", handleMove);
      card.removeEventListener("click", handleClick);
      clearParticles();
      gsap.killTweensOf(card);
    };
  }, [wantsEffects, particles, magnetism, ripple]);

  return (
    <div
      ref={cardRef}
      className={cn(
        // Mirrors ui/card.tsx's shell so CardHeader / CardContent lay out
        // identically inside either one.
        "bg-card text-card-foreground border border-border rounded-sm flex flex-col gap-4 py-5",
        "bento-card relative overflow-hidden transition-colors duration-300",
        className
      )}
    >
      {children}
    </div>
  );
}
