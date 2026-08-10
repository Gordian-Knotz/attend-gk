"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Pixel-reveal card.
 *
 * A **rewrite** of React Bits' `PixelCard`, not a wrapper — the same call
 * `ui/spotlight-card.tsx` and `motion/bento.tsx` already made, and for the
 * same reason. The registry component's root element is
 *
 *   h-[400px] w-[300px] aspect-[4/5] rounded-[25px] border-[#27272a]
 *
 * which is a fixed-size, dark-only card with a 25px radius in a system whose
 * radius is 0.2rem and which has to work on paper as well as ink. It also
 * concatenates the caller's `className` onto that string rather than merging
 * it, so the conflicting utilities both land in the class attribute and CSS
 * source order decides the winner — you cannot reliably override it from
 * outside. Fetch the original with:
 *
 *   curl https://reactbits.dev/r/PixelCard-TS-TW.json
 *
 * What was kept: the `Pixel` particle model and its appear/disappear/shimmer
 * state machine, and the 60fps rAF throttle. What changed:
 *
 *  - the surface is `ui/card.tsx`'s shell verbatim, so `CardHeader` /
 *    `CardContent` lay out inside it exactly as they do in a plain `Card`
 *  - the canvas is an absolutely-positioned, `aria-hidden` background layer
 *    rather than a grid sibling of the content, so the card lays out normally
 *  - colours are read from the DS-01 custom properties at init instead of
 *    being hardcoded. The brand ramp is theme-independent (only the surfaces
 *    flip between paper and ink), so one read is enough and there is no
 *    duplicated hex literal to keep in sync — the wart doc 09 records for
 *    `hero-threads.tsx`, avoided here because canvas fill styles, unlike
 *    WebGL uniforms, can be strings read from computed style
 *  - `prefers-reduced-motion` renders a plain card with no canvas and no
 *    listeners at all. The original still ran the rAF loop with speed 0.
 */

/** One drifting square. Ported from the registry component unchanged. */
class Pixel {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly x: number;
  private readonly y: number;
  private readonly color: string;
  private readonly speed: number;
  private readonly delay: number;
  private readonly sizeStep: number;
  private readonly maxSize: number;
  private readonly counterStep: number;

  private size = 0;
  private counter = 0;
  private isReverse = false;
  private isShimmer = false;

  private static readonly MIN_SIZE = 0.5;
  private static readonly MAX_SIZE_INTEGER = 2;

  isIdle = false;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    speed: number,
    delay: number
  ) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = random(0.1, 0.9) * speed;
    this.delay = delay;
    this.sizeStep = Math.random() * 0.4;
    this.maxSize = random(Pixel.MIN_SIZE, Pixel.MAX_SIZE_INTEGER);
    this.counterStep =
      Math.random() * 4 + (canvas.width + canvas.height) * 0.01;
  }

  private draw() {
    const offset = Pixel.MAX_SIZE_INTEGER * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(this.x + offset, this.y + offset, this.size, this.size);
  }

  appear() {
    this.isIdle = false;

    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }

    if (this.size >= this.maxSize) this.isShimmer = true;

    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size += this.sizeStep;
    }

    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;

    if (this.size <= 0) {
      this.isIdle = true;
      return;
    }

    this.size -= 0.1;
    this.draw();
  }

  private shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= Pixel.MIN_SIZE) {
      this.isReverse = false;
    }

    this.size += this.isReverse ? -this.speed : this.speed;
  }
}

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

/** The DS-01 primary ramp, read from CSS so the tokens stay single-sourced. */
const RAMP_TOKENS = ["--pac-orange-light", "--pac-orange", "--pac-ember"];

function readRamp(el: HTMLElement): string[] {
  const styles = getComputedStyle(el);
  const ramp = RAMP_TOKENS.map((token) =>
    styles.getPropertyValue(token).trim()
  ).filter(Boolean);

  // If the custom properties can't be resolved for any reason, fall back to
  // the resolved primary rather than drawing nothing.
  return ramp.length > 0 ? ramp : [styles.getPropertyValue("color").trim()];
}

/** Pixel gap in device px. Smaller is denser and costs more per frame. */
const GAP = 6;
const SPEED = 0.035;

export function PixelCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const reduceMotion = useReducedMotion();

  /**
   * The canvas is added **after** hydration, never in the server output.
   *
   * `useReducedMotion()` can only know the user's preference in the browser, so
   * a component that branches on it renders one tree on the server and possibly
   * a different one on the first client render — which React 19 reports as
   * hydration error #418. The browser pass caught exactly that under
   * `prefers-reduced-motion: reduce`.
   *
   * Mount-gating makes the first client render identical to the server's for
   * every user, and the canvas appears a tick later only where it's wanted.
   * `site/hero-backdrop.tsx` already does this, for the adjacent reason that a
   * WebGL context shouldn't block first paint.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const animated = mounted && !reduceMotion;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pixelsRef = React.useRef<Pixel[]>([]);
  const frameRef = React.useRef<number | null>(null);
  const lastFrameRef = React.useRef(0);

  const shell =
    "bg-card text-card-foreground border border-border rounded-sm flex flex-col gap-4 py-5";

  React.useEffect(() => {
    if (!animated) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const build = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      const ctx = canvas.getContext("2d");
      if (!ctx || width === 0 || height === 0) return;

      canvas.width = width;
      canvas.height = height;

      const ramp = readRamp(container);
      const pixels: Pixel[] = [];

      for (let x = 0; x < width; x += GAP) {
        for (let y = 0; y < height; y += GAP) {
          const dx = x - width / 2;
          const dy = y - height / 2;
          pixels.push(
            new Pixel(
              canvas,
              ctx,
              x,
              y,
              ramp[Math.floor(Math.random() * ramp.length)],
              SPEED,
              // Delay by distance from centre, so the fill radiates outward
              // rather than appearing all at once.
              Math.sqrt(dx * dx + dy * dy)
            )
          );
        }
      }

      pixelsRef.current = pixels;
    };

    build();

    const observer = new ResizeObserver(build);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [animated]);

  const animate = React.useCallback((mode: "appear" | "disappear") => {
    const step = () => {
      frameRef.current = requestAnimationFrame(step);

      const now = performance.now();
      const interval = 1000 / 60;
      if (now - lastFrameRef.current < interval) return;
      lastFrameRef.current = now - ((now - lastFrameRef.current) % interval);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let allIdle = true;
      for (const pixel of pixelsRef.current) {
        pixel[mode]();
        if (!pixel.isIdle) allIdle = false;
      }

      // Stop burning frames once every pixel has settled.
      if (allIdle && frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(shell, "relative isolate overflow-hidden", className)}
      onMouseEnter={animated ? () => animate("appear") : undefined}
      onMouseLeave={animated ? () => animate("disappear") : undefined}
      // Keyboard parity: the card itself isn't focusable, so the reveal is
      // driven by focus moving to anything inside it. `relatedTarget` guards
      // against re-triggering when focus moves between two children.
      onFocus={(e) => {
        if (!animated) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        animate("appear");
      }}
      onBlur={(e) => {
        if (!animated) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        animate("disappear");
      }}
      {...props}
    >
      {animated && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 size-full opacity-70"
        />
      )}
      {children}
    </div>
  );
}
