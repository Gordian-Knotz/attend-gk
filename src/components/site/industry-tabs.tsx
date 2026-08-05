"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { RevealHeading } from "@/components/motion/reveal-heading";

/**
 * Each industry carries a short spec sheet rather than a screenshot slot —
 * the earlier landing page reserved a grey box per tab for an image that was
 * never produced, and an empty frame reads worse than no frame.
 */
const INDUSTRIES = [
  {
    id: "field-services",
    label: "Field services",
    title: "Built for teams in the field",
    features: [
      "GPS-verified clock-in for every worker",
      "Geofences scoped to each job site",
      "Offline mode — syncs when back online",
      "Real-time visibility across every site",
    ],
    spec: [
      ["Primary capture", "Mobile app"],
      ["Typical site", "Client premises, rotating"],
      ["Common exception", "Out-of-geofence check-in"],
    ],
  },
  {
    id: "security",
    label: "Security & guarding",
    title: "Built for security teams",
    features: [
      "GPS-verified clock-in at every post",
      "Geofences scoped to each site",
      "Offline mode — syncs when back online",
      "Real-time visibility across every post",
    ],
    spec: [
      ["Primary capture", "Mobile app + kiosk"],
      ["Typical site", "Fixed post, 12-hour shifts"],
      ["Common exception", "No-show at shift handover"],
    ],
  },
  {
    id: "retail",
    label: "Retail & warehousing",
    title: "Built for retail & warehouse teams",
    features: [
      "Kiosk clock-in for shared terminals",
      "Shift rosters per store or warehouse",
      "Overtime flagging by policy",
      "Live dashboards across locations",
    ],
    spec: [
      ["Primary capture", "Shared kiosk / QR"],
      ["Typical site", "Store floor, split shifts"],
      ["Common exception", "Unapproved overtime"],
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    title: "Built for logistics teams",
    features: [
      "GPS-verified clock-in for depots and routes",
      "Offline mode for low-signal areas",
      "Exception alerts for no-shows",
      "Payroll export to your provider",
    ],
    spec: [
      ["Primary capture", "Mobile app"],
      ["Typical site", "Depot start, route end"],
      ["Common exception", "Late depot departure"],
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    title: "Built for manufacturing teams",
    features: [
      "Biometric clock-in on the shop floor",
      "Shift builder per line or site",
      "Overtime rules by policy",
      "Custom reports by site or role",
    ],
    spec: [
      ["Primary capture", "Biometric terminal"],
      ["Typical site", "Plant floor, continuous lines"],
      ["Common exception", "Line handover gaps"],
    ],
  },
] as const;

const IDS = INDUSTRIES.map((i) => i.id) as readonly string[];

export function IndustryTabs() {
  const [active, setActive] = React.useState<string>(INDUSTRIES[0].id);
  const reduceMotion = useReducedMotion();

  // Footer links deep-link straight to an industry (e.g. /#logistics). The
  // hash also matches the trigger's element id, so the browser handles the
  // scroll and this only has to select the tab.
  React.useEffect(() => {
    const syncFromHash = () => {
      const id = window.location.hash.slice(1);
      if (IDS.includes(id)) setActive(id);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <section id="industries" className="mx-auto max-w-6xl px-6 py-16">
      <RevealHeading className="font-serif text-3xl">
        Built for how your industry{" "}
        <span className="italic text-primary">actually works</span>
      </RevealHeading>
      <p className="mt-4 max-w-lg text-muted-foreground">
        One platform, tuned for every kind of team.
      </p>
      <Separator className="mt-4 mb-8" />

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="h-auto flex-wrap">
          {INDUSTRIES.map((industry) => (
            <TabsTrigger
              key={industry.id}
              id={industry.id}
              value={industry.id}
              // The shared Tabs primitive draws the active state as a static
              // bottom border. Suppressed here so a single shared underline
              // can slide between triggers instead of jumping.
              className="relative data-[state=active]:border-transparent"
            >
              {industry.label}
              {industry.id === active &&
                (reduceMotion ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
                ) : (
                  <motion.span
                    layoutId="industry-tab-underline"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ))}
            </TabsTrigger>
          ))}
        </TabsList>

        {INDUSTRIES.map((industry) => (
          <TabsContent key={industry.id} value={industry.id} className="pt-6">
            <div className="grid gap-10 md:grid-cols-[1.2fr_1fr]">
              <div>
                <h3 className="font-serif text-2xl">{industry.title}</h3>
                <ul className="mt-5 flex flex-col gap-3">
                  {industry.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        strokeWidth={2}
                      />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="self-start rounded-sm border border-border bg-card">
                {industry.spec.map(([key, value], i) => (
                  <div
                    key={key}
                    className={
                      "flex items-baseline justify-between gap-4 px-5 py-3" +
                      (i > 0 ? " border-t border-border" : "")
                    }
                  >
                    <dt className="font-label text-muted-foreground">{key}</dt>
                    <dd className="text-right text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
