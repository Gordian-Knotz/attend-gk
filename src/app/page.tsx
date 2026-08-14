import Link from "next/link";
import { Smartphone, MapPin, QrCode, ArrowRight } from "lucide-react";

import { SUPPORT_EMAIL } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PixelCard } from "@/components/ui/pixel-card";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";
import { BlurLabel } from "@/components/motion/blur-label";
import { DeploymentBoard } from "@/components/site/deployment-board";
import { CtaTexture } from "@/components/site/cta-texture";
import { SiteHeader } from "@/components/site/site-header";
import { ContactForm } from "@/components/site/contact-form";
import { TrustBar } from "@/components/site/trust-bar";
import { FeatureClusters } from "@/components/site/feature-clusters";
import { IndustryTabs } from "@/components/site/industry-tabs";
import { Pricing } from "@/components/site/pricing";
import { ComingNext } from "@/components/site/coming-next";
import { FAQ } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Setup to month end, in the order it actually happens.
 *
 * These were three cards comparing capture methods, sitting directly below the
 * "Clock-in & verification" feature cluster and restating it. They are now a
 * sequence, and numbered — which is worth being deliberate about, because
 * numbered markers are decoration unless the order carries information the
 * reader needs. Here it does: you cannot clock in before a boundary exists, and
 * the board cannot fill before anyone clocks in. The capture methods fold into
 * step two, where they belong.
 *
 * Step two carries the strongest true claim this product has and the one that
 * appeared nowhere on the page: the geofence is enforced by a database trigger,
 * not by the client, so it holds for punches replayed later from a phone that
 * was offline.
 */
const STEPS = [
  {
    icon: MapPin,
    title: "Mark out each site",
    detail:
      "Drop a pin at the gate and set how far the boundary reaches. Once per site, and you can move it whenever a contract changes.",
  },
  {
    icon: Smartphone,
    title: "Staff clock in on their phone",
    detail:
      "Any phone browser, or a shared tablet at the gate for sites where nobody carries a work phone. A punch from outside the boundary is refused by the database, so it stays refused even when the phone was offline at the time.",
  },
  {
    icon: QrCode,
    title: "Watch the shift fill up",
    detail:
      "See who is on post while the shift is still running, rather than reconciling a paper register at month end. Approved hours leave as CSV.",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Everything between the header and the footer is one landmark. Without
          it a screen-reader user has no "skip to content" target — the one
          accessibility failure the 10 Aug Lighthouse run found. */}
      <main>

      {/* Hero.
          HeroThreads is gone: the WebGL field cost 35,970 ms of blocking time
          under software rendering (README), and the workaround was to skip it
          for GPU-blocklisted visitors. A deployment board says more and costs
          nothing — see components/site/deployment-board.tsx. The file is kept
          on disk with the other three orphans doc 09 lists. */}
      <div className="relative overflow-hidden">
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <BlurLabel
            text="Attendance for teams spread across sites"
            className="font-label text-primary"
          />
          <RevealHeading
            as="h1"
            delay={0.15}
            className="mt-5 font-display text-5xl leading-[1.05] md:text-6xl"
          >
            Know which posts are{" "}
            {/* The one italic accent left on the page. nowrap keeps the phrase
                whole: centred and narrow, the break otherwise landed
                mid-phrase, which reads as two fragments. */}
            <span className="whitespace-nowrap italic text-primary">
              manned right now
            </span>
          </RevealHeading>

          <p className="mt-6 max-w-xl text-muted-foreground">
            Your people work across sites you can&apos;t see from the office.
            They clock in from their own phone, inside the site&apos;s boundary
            or not at all, and you see who is actually on post while the shift
            is still running.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login?mode=sign-up">
              <Button size="lg">
                Start free <ArrowRight />
              </Button>
            </Link>
            <a href="#contact">
              <Button size="lg" variant="outline">
                Request a pilot
              </Button>
            </a>
          </div>

          {/* The price, in the hero, in one line. It was nowhere on the site
              before today. The stat tiles that used to sit here were feature
              counts and an unverifiable promise; the board below says more
              than four numbers could, and §pricing has the detail. */}
          <p className="mt-5 text-sm text-muted-foreground">
            $3 per employee per month. No limit on sites.
          </p>
        </div>

        <DeploymentBoard />
        </section>
      </div>

      {/* The problem, before any feature name.
          An operations manager's morning question is not "did people clock in"
          but "is every post manned". This section exists to say that back to
          them in their own words, and it deliberately names no feature. */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <RevealHeading className="font-display text-3xl">
            Roll call happens by phone
          </RevealHeading>
          <p className="mt-5 text-muted-foreground">
            A supervisor rings each site, writes names on a sheet, and by the
            time it reaches you the shift has changed. Nobody is sure whether
            post 4 was covered at 6am.
          </p>
          <p className="mt-4 text-muted-foreground">
            At month end the register and the payroll disagree, and there is no
            way to settle which one is right. So the argument gets split, and it
            happens again the next month.
          </p>
        </div>
      </section>

      {/* How it works — a real sequence, so the numbers carry information */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
        <RevealHeading className="font-display text-3xl">
          How it works
        </RevealHeading>
        <Separator className="mt-4 mb-8" />

        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, detail }, i) => (
            <Reveal key={title} delay={i * 0.08} className="h-full">
              <PixelCard className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-sm border border-border bg-background/70 backdrop-blur-sm">
                      <Icon className="size-5 text-primary" strokeWidth={1.5} />
                    </span>
                    {/* Mono, and used for a figure rather than an eyebrow —
                        which is the whole point of keeping IBM Plex Mono. */}
                    <span className="font-mono text-sm text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <CardTitle className="mt-3 font-display text-xl">
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{detail}</CardDescription>
                </CardContent>
              </PixelCard>
            </Reveal>
          ))}
        </div>
      </section>

      <FeatureClusters />

      <IndustryTabs />

      <Pricing />

      <ComingNext />

      <FAQ />

      {/* CTA band — an ink field against paper, per the DS-01 section-opener
          convention. In dark mode the page is already ink, so the band had
          zero contrast and the whole CTA vanished into the page; it lifts to
          graphite with hairline rules there instead. */}
      <section className="relative isolate overflow-hidden border-y border-transparent bg-pac-ink text-pac-paper dark:border-border dark:bg-pac-graphite">
        <CtaTexture />
        {/* Content keeps normal pointer events — making it inert so the grid
            could catch hover underneath would cost text selection, which
            isn't worth it. The grid still lights up across the band's empty
            right-hand side, which is where it's visible anyway. */}
        <div className="relative mx-auto max-w-6xl px-6 py-16">
          {/* "Ready when you are" + "Ready to see…" was the same word twice
              and said nothing either time. The paragraph carried the third
              "X — not Y" antithesis on the page and a rule-of-three list that
              was one audience described three ways. */}
          <BlurLabel text="Start with one site" className="font-label text-primary" />
          <RevealHeading className="mt-4 max-w-xl font-display text-4xl">
            Set up one site tonight
          </RevealHeading>
          <p className="mt-4 max-w-lg text-pac-paper/70">
            Mark out its boundary, add the guards on that post, and tomorrow
            morning you will know who turned up without ringing anyone. No card
            needed to start.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login?mode=sign-up">
              <Button size="lg">
                Start free <ArrowRight />
              </Button>
            </Link>
            <a href="#contact">
              <Button
                size="lg"
                variant="outline"
                className="border-pac-paper/30 bg-transparent text-pac-paper hover:bg-pac-paper/10 hover:text-pac-paper"
              >
                Request a pilot
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <BlurLabel text="Get in touch" className="font-label text-primary" />
            <RevealHeading className="mt-4 font-display text-3xl">
              Tell us about your sites
            </RevealHeading>
            <p className="mt-4 max-w-sm text-muted-foreground">
              Tell us how many sites you run and how your shifts work. We will
              set up a pilot on your own posts. There is no hardware to buy.
            </p>
            <Separator className="my-6" />
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="font-label text-muted-foreground">Response time</dt>
                <dd>Within 1 business day</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-label text-muted-foreground">Coverage</dt>
                <dd>Nairobi &amp; nationwide</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-label text-muted-foreground">Email</dt>
                <dd>{SUPPORT_EMAIL}</dd>
              </div>
            </dl>
          </div>

          <ContactForm />
        </div>
      </section>

      {/* Client band sits down here now, immediately above the footer. It used
          to run directly under the hero, where it asked for trust before the
          page had said what the product does. Near the bottom it reads as
          corroboration of an argument already made. */}
      <TrustBar />
      </main>

      <SiteFooter />
    </div>
  );
}
