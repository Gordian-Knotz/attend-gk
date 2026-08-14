import { Check } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";

/**
 * What it costs.
 *
 * The site did not say, anywhere, until this section existed. An operations
 * manager comparing options cannot put a nameless price in front of a finance
 * director, so "contact us for pricing" loses the deal before the call.
 *
 * $3 per seat per month is the `seat_price_usd` default from migration 0019, and
 * a billable seat is staff or manager — not the org_admin who bought it. Both
 * are stated below because a buyer who discovers the counting rule on their
 * first invoice trusts the next number less.
 *
 * PAYMENT IS HONEST ABOUT BEING MANUAL. `recordPayment` records an M-Pesa
 * reference and a human confirms it; nothing is charged automatically. A buyer
 * finding that out later is worse than being told now, and it is genuinely fine
 * for the size of customer this sells to.
 */
const INCLUDED = [
  "Every site, with its own geofence",
  "Unlimited admins and supervisors",
  "Leave, balances, accrual and public holidays",
  "Shift rosters per site",
  "CSV export of approved hours",
  "Your own management structure",
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
      <RevealHeading className="font-display text-3xl">
        What it costs
      </RevealHeading>
      <p className="mt-4 max-w-lg text-muted-foreground">
        One price per person. No tiers to compare, and no charge for the sites
        you add.
      </p>
      <Separator className="mt-4 mb-8" />

      <Reveal>
        <div className="grid gap-8 rounded-sm border-2 border-foreground bg-card p-6 md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-5xl">$3</span>
              <span className="text-sm text-muted-foreground">
                per employee, per month
              </span>
            </p>

            <p className="mt-4 text-sm text-muted-foreground">
              Counted at the end of each month. You are billed for staff and
              supervisors, not for the administrator who set the account up.
            </p>

            <p className="mt-4 text-sm text-muted-foreground">
              Start free while you try it on one site. Payment is by M-Pesa: you
              send it, quote the reference, and we confirm it by hand. Nothing
              is ever charged automatically.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Included for everyone</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    strokeWidth={2}
                  />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
