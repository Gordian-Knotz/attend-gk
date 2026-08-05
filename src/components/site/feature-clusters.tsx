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
    group: "Clock-in & verification",
    lead: "How the hours get captured in the first place.",
    features: [
      ["GPS geofencing", "Restrict clock-ins to approved site locations"],
      ["Biometric & kiosk", "Shared terminal clock-in with fingerprint or QR"],
      ["Offline mode", "Clock in without signal; syncs when back online"],
      ["Selfie verification", "Optional photo capture at every clock-in"],
    ],
  },
  {
    group: "Scheduling & leave",
    lead: "Who is meant to be where, and who asked not to be.",
    features: [
      ["Shift builder", "Create and publish rosters per site"],
      ["Shift swaps", "Staff request and managers approve swaps"],
      ["Leave management", "Track types, balances, and approvals"],
      ["Overtime rules", "Automatic overtime flagging by policy"],
    ],
  },
  {
    group: "Management",
    lead: "What supervisors and admins do with it day to day.",
    features: [
      ["Multi-site oversight", "See every location from one dashboard"],
      ["Role-based access", "Staff, manager, org admin, super admin"],
      ["Device management", "Register and monitor biometric terminals"],
      ["Exception alerts", "Instant flags for late, absent, no-show"],
    ],
  },
  {
    group: "Reporting & payroll",
    lead: "What comes out the other end, at month close.",
    features: [
      ["Live dashboards", "Real-time attendance across your org"],
      ["Payroll export", "CSV and API export to your payroll provider"],
      ["Audit trail", "Org-isolated, tamper-evident records"],
      ["Custom reports", "Filter by site, role, or date range"],
    ],
  },
] as const;

export function FeatureClusters() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-16">
      <RevealHeading className="font-serif text-3xl">
        Everything you need to manage{" "}
        <span className="italic text-primary">attendance</span>
      </RevealHeading>
      <p className="mt-4 max-w-lg text-muted-foreground">
        From clock-in to payroll export, built for teams that work on-site and
        in the field.
      </p>
      <Separator className="mt-4 mb-10" />

      <div className="grid gap-4 md:grid-cols-2">
        {CLUSTERS.map((cluster, i) => (
          <Reveal key={cluster.group} delay={(i % 2) * 0.1} className="h-full">
            <FeatureCard className="h-full">
              <h3 className="font-label text-primary">{cluster.group}</h3>
              <p className="mt-2 font-serif text-lg">{cluster.lead}</p>

              <dl className="mt-5 border-t border-border">
                {cluster.features.map(([name, description]) => (
                  <div
                    key={name}
                    className="border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-4"
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
