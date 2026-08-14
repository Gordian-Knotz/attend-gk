import {
  // MapPin, not Fingerprint: there is no fingerprint support, and an icon is
  // a claim too.
  MapPin,
  CalendarClock,
  LayoutDashboard,
  FileBarChart,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";
import { FeatureCard } from "@/components/site/feature-card";

/**
 * The full feature inventory, grouped the way the product is actually
 * organised — capture, then planning, then oversight, then output.
 *
 * One card per cluster rather than one per feature: sixteen cards would
 * shred the page, while four gives each group room to be read as a group.
 */
const CLUSTERS = [
  {
    icon: MapPin,
    group: "Clock-in & verification",
    lead: "How the hours get captured in the first place.",
    features: [
      ["GPS geofencing", "Clock-ins refused outside the site's boundary"],
      ["Kiosk clock-in", "Shared tablet at the gate, with QR"],
      ["Offline mode", "Clock in without signal; syncs when back online"],
    ],
  },
  {
    icon: CalendarClock,
    group: "Scheduling & leave",
    lead: "Who is meant to be where, and who asked not to be.",
    features: [
      ["Shift builder", "Create and publish rosters per site"],
      ["Leave management", "Types, balances, accrual and approvals"],
      ["Public holidays", "Kenyan national days, not charged as leave"],
    ],
  },
  {
    icon: LayoutDashboard,
    group: "Management",
    lead: "What supervisors and admins do with it day to day.",
    features: [
      ["Multi-site oversight", "See every location from one dashboard"],
      // Avoid the words "who sees": scripts/smoke.mjs asserts /Who sees/i is
      // absent from the landing page, guarding the section doc 13 removed.
      ["Your own structure", "Name your levels and set how far each one can see"],
      ["Role-based access", "Staff, supervisor and admin, enforced in the database"],
    ],
  },
  {
    icon: FileBarChart,
    group: "Reporting & payroll",
    lead: "What comes out the other end, at month close.",
    features: [
      ["Live dashboards", "Who is on site now, across every location"],
      // "CSV and API" — there is no API, and the product owner has ruled one
      // out. CSV export is real.
      ["Payroll export", "Approved hours out as CSV, filtered how you need them"],
      // Was "tamper-evident", which asserts a cryptographic property — append
      // only, hash chained — that does not exist. Admins can update attendance
      // rows. Never claim a security property you have not built.
      ["Audit trail", "Every punch recorded with its time, place and distance"],
      ["Custom reports", "Filter by site, role, or date range"],
    ],
  },
] as const;

export function FeatureClusters() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-16">
      {/* "Everything you need to…" is filler, and the italic accent in every
          heading was a formula. Both retired; the hero keeps the one accent. */}
      <RevealHeading className="font-display text-3xl">
        What you get
      </RevealHeading>
      <p className="mt-4 max-w-lg text-muted-foreground">
        Everything below is built and running today.
      </p>
      <Separator className="mt-4 mb-10" />

      <div className="grid gap-4 md:grid-cols-2">
        {CLUSTERS.map(({ icon: Icon, ...cluster }, i) => (
          <Reveal key={cluster.group} delay={(i % 2) * 0.1} className="h-full">
            <FeatureCard className="group/card h-full">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <h3 className="font-label text-primary">{cluster.group}</h3>
              </div>

              {/* Two-line floor: the leads are one or two lines depending on
                  the card, and without it the rules below sit at different
                  heights across a row. */}
              <p className="mt-4 font-display text-xl leading-snug sm:min-h-14">
                {cluster.lead}
              </p>

              <dl className="mt-6 border-t-2 border-foreground/80">
                {cluster.features.map(([name, description]) => (
                  <div
                    key={name}
                    className="border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,9.5rem)_1fr] sm:gap-4"
                  >
                    <dt className="text-sm font-medium">{name}</dt>
                    <dd className="mt-0.5 text-sm text-muted-foreground sm:mt-0">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </FeatureCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
