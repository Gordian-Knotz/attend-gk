"use client";

import { MapPin } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import GlareHover from "@/components/reactbits/GlareHover";

const CHECK_INS = [
  { name: "Wanjiku M.", role: "Site guard · Gate 2", status: "Present", time: "6:58 AM" },
  { name: "Otieno K.", role: "Site guard · Gate 4", status: "Late", time: "7:14 AM" },
  { name: "Njoroge P.", role: "Supervisor · Site 3", status: "Present", time: "6:52 AM" },
  { name: "Achieng D.", role: "Site guard · Gate 1", status: "On leave", time: "—" },
] as const;

const STATUS_VARIANT = {
  Present: "outline",
  Late: "attention",
  "On leave": "proposed",
} as const;

export function HeroPreview() {
  const reduceMotion = useReducedMotion();

  // Same light-across-paper sweep as the feature cards, so the hero mock
  // and the cards below read as one system. Pure decoration over a static
  // mock, so it's dropped wholesale under reduced motion.
  const Shell = reduceMotion
    ? ({ children }: { children: React.ReactNode }) => (
        <div className="w-full max-w-sm rounded-sm border border-border bg-card shadow-xl">
          {children}
        </div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <GlareHover
          width="100%"
          height="100%"
          background="var(--card)"
          borderColor="var(--border)"
          borderRadius="0.2rem"
          glareColor="#E8532E"
          glareOpacity={0.16}
          glareAngle={-30}
          glareSize={320}
          transitionDuration={1600}
          className="!place-items-stretch w-full max-w-sm shadow-xl"
          style={{ cursor: "default" }}
        >
          {children}
        </GlareHover>
      );

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-full bg-primary/25 blur-3xl"
      />

      <Shell>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-display text-base leading-none">
              Coastal Guard Services
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              4 sites · Nairobi
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              {/* animate-ping runs forever; the one indefinite animation on
                the page is exactly what prefers-reduced-motion is for. */}
            {!reduceMotion && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
            )}
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="font-label text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="flex flex-col">
          {CHECK_INS.map((c, i) => (
            <div key={c.name}>
              <div className="flex items-center gap-3 px-5 py-3">
                <Avatar>
                  <AvatarFallback>
                    {c.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.role}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {c.time}
                  </span>
                </div>
              </div>
              {i < CHECK_INS.length - 1 && <Separator />}
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-label text-muted-foreground">
              Checked in
            </span>
            <span className="font-mono">26/28</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-[93%] rounded-full bg-primary" />
          </div>
        </div>
      </Shell>
    </div>
  );
}
