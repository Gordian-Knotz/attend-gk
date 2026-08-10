import Link from "next/link";
import { Smartphone, Fingerprint, QrCode, ArrowRight } from "lucide-react";

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
import { HeroThreads } from "@/components/site/hero-threads";
import { CtaTexture } from "@/components/site/cta-texture";
import { SiteHeader } from "@/components/site/site-header";
import { StatTiles } from "@/components/site/stat-tiles";
import { ContactForm } from "@/components/site/contact-form";
import { TrustBar } from "@/components/site/trust-bar";
import { FeatureClusters } from "@/components/site/feature-clusters";
import { IndustryTabs } from "@/components/site/industry-tabs";
import { FAQ } from "@/components/site/faq";
import { SiteFooter } from "@/components/site/site-footer";

const CAPTURE_LAYER = [
  {
    icon: Smartphone,
    title: "Mobile app",
    detail:
      "Staff clock in from their own phone. Works offline and syncs automatically once they're back online.",
  },
  {
    icon: Fingerprint,
    title: "Biometric terminal",
    detail: "Keep using the fingerprint or face scanners you already have on site.",
  },
  {
    icon: QrCode,
    title: "Web kiosk / QR",
    detail: "A shared tablet at the entrance, for sites where staff don't carry a work phone.",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero. Centred composition ported from attend-v3.
          The backdrop sits on this full-bleed wrapper, not on the max-w
          container below — inside it, the field would end in two hard
          vertical edges at the container bounds. */}
      <div className="relative overflow-hidden">
        <HeroThreads />
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <BlurLabel
            text="Workforce attendance & time management"
            className="font-label text-primary"
          />
          <RevealHeading
            as="h1"
            delay={0.15}
            className="mt-5 font-serif text-5xl leading-[1.05] md:text-6xl"
          >
            Clock in from the field.{" "}
            {/* nowrap keeps the italic accent phrase intact. Centred and
                narrower than the old two-column hero, the line break landed
                mid-phrase ("…field. See / it live from…"), which reads as two
                fragments rather than the one accent DS-01 builds every
                heading around. */}
            <span className="whitespace-nowrap italic text-primary">
              See it live
            </span>{" "}
            from the office.
          </RevealHeading>

          <p className="mt-6 max-w-xl text-muted-foreground">
            For teams whose people aren&apos;t at a desk. Staff clock in
            from their own phone or a fingerprint scanner you already have,
            and managers see who&apos;s actually on site, in real time —
            not a stack of timesheets to reconcile at month end.
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
        </div>

        <StatTiles
          className="mt-16"
          tiles={[
            { value: "3", label: "Ways to clock in" },
            { value: "2", label: "Weeks to launch" },
            { value: "24/7", label: "Live visibility" },
            { value: "1", label: "Dashboard for every site" },
          ]}
        />
        </section>
      </div>

      <FeatureClusters />

      {/* How it works / capture layer */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
        <RevealHeading className="font-serif text-3xl">
          How staff <span className="italic text-primary">clock in</span>
        </RevealHeading>
        <Separator className="mt-4 mb-8" />

        {/* The three capture methods are a comparison, so they stay side by
            side and equal-height rather than becoming a stack or a carousel.
            PixelCard replaces SpotlightCard here: the pixel fill radiates from
            the centre on hover, which reads as the card responding rather than
            a light passing over it. */}
        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {CAPTURE_LAYER.map(({ icon: Icon, title, detail }, i) => (
            <Reveal key={title} delay={i * 0.08} className="h-full">
              <PixelCard className="h-full">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-sm border border-border bg-background/70 backdrop-blur-sm">
                    <Icon className="size-5 text-primary" strokeWidth={1.5} />
                  </span>
                  <CardTitle className="mt-3 font-serif text-xl">
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

      <IndustryTabs />

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
          <BlurLabel
            text="Ready when you are"
            className="font-label text-primary"
          />
          <RevealHeading className="mt-4 max-w-xl font-serif text-4xl">
            Ready to see where your team really is?
          </RevealHeading>
          <p className="mt-4 max-w-lg text-pac-paper/70">
            One geofenced check-in flow for guards, field staff, and site
            teams — with a live dashboard that tells you who&apos;s on site
            right now, not who clocked in yesterday. Set up your first site
            in minutes; no credit card required.
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
            <RevealHeading className="mt-4 font-serif text-3xl">
              Tell us about your <span className="italic text-primary">sites</span>.
            </RevealHeading>
            <p className="mt-4 max-w-sm text-muted-foreground">
              Share a bit about your team and we&apos;ll set up a pilot on
              your own sites — no long procurement process, no hardware
              purchase required to start.
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

      <SiteFooter />
    </div>
  );
}
