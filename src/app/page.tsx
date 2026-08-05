import {
  Smartphone,
  Fingerprint,
  QrCode,
  ArrowRight,
  Check,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site/site-header";
import { StatTiles } from "@/components/site/stat-tiles";
import { HeroPreview } from "@/components/site/hero-preview";
import { ContactForm } from "@/components/site/contact-form";

const FEATURES = [
  {
    name: "Mobile clock in/out",
    description:
      "Staff check in and out from their own phone. Location is confirmed automatically, and it keeps working without signal.",
  },
  {
    name: "Fingerprint & face terminals",
    description:
      "Connects to the biometric machines you already run on site — nothing to rip out and replace.",
  },
  {
    name: "Shift scheduling",
    description:
      "Build rosters for every site and handle shift-swap requests without a spreadsheet.",
  },
  {
    name: "Admin dashboard",
    description:
      "See who's present, late, or absent at every site, as it happens — not the next morning.",
  },
  {
    name: "Reports & payroll export",
    description:
      "One-click timesheets, ready to hand to whatever payroll process you already use.",
  },
  {
    name: "Leave management",
    description:
      "Leave requests, approvals, and balances — all in one place instead of scattered across chats.",
  },
  {
    name: "Overtime & attendance rules",
    description:
      "Configurable late/early rules and overtime thresholds, set per site.",
  },
] as const;

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

const ROLES = [
  {
    role: "Staff",
    can: "Clock in/out, see their own attendance and schedule, request leave",
    cannot: "See other staff's records, edit schedules, or open the admin dashboard",
  },
  {
    role: "Manager",
    can: "Everything Staff can do, plus build shifts and approve leave — for their own site",
    cannot: "See or manage other sites, change billing, or add devices",
  },
  {
    role: "Admin",
    can: "Full access across every site: staff, schedules, devices, billing, and reports",
    cannot: "—",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-10">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="font-label text-primary">
              Workforce attendance &amp; time management
            </span>
            <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.05] md:text-6xl">
              Clock in from the field.{" "}
              <span className="italic text-primary">See it live</span> from
              the office.
            </h1>
            <p className="mt-6 max-w-lg text-muted-foreground">
              Built for teams whose people aren&apos;t at a desk — security
              guards, drivers, site crews. Staff clock in from their own
              phone or a fingerprint scanner you already have, and managers
              see who&apos;s actually on site, in real time — not a stack of
              timesheets to reconcile at month end.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#contact">
                <Button size="lg">
                  Request a pilot <ArrowRight />
                </Button>
              </a>
              <a href="#features">
                <Button size="lg" variant="outline">
                  See what&apos;s included
                </Button>
              </a>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <HeroPreview />
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

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-serif text-3xl">
          What&apos;s <span className="italic text-primary">included</span>
        </h2>
        <Separator className="mt-4 mb-8" />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.name}>
              <CardHeader>
                <CardTitle>{f.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works / capture layer */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-serif text-3xl">
          How staff <span className="italic text-primary">clock in</span>
        </h2>
        <Separator className="mt-4 mb-8" />

        <div className="grid gap-4 md:grid-cols-3">
          {CAPTURE_LAYER.map(({ icon: Icon, title, detail }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="size-6 text-primary" strokeWidth={1.5} />
                <CardTitle className="mt-2">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{detail}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Access */}
      <section id="access" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-serif text-3xl">
          Who sees <span className="italic text-primary">what</span>
        </h2>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Every account only sees what it needs to. Access is set by role,
          not by who remembered to ask.
        </p>
        <Separator className="mt-4 mb-8" />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Can do</TableHead>
              <TableHead>Cannot do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLES.map((r) => (
              <TableRow key={r.role}>
                <TableCell className="font-medium">{r.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {r.can}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.cannot !== "—" && (
                    <span className="inline-flex items-start gap-2">
                      <X className="mt-0.5 size-3.5 shrink-0" />
                      {r.cannot}
                    </span>
                  )}
                  {r.cannot === "—" && r.cannot}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* CTA band — two-thirds ink field, per DS-01 section-opener convention */}
      <section className="bg-pac-ink text-pac-paper">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <span className="font-label text-primary">Ready when you are</span>
          <h2 className="mt-4 max-w-xl font-serif text-4xl">
            Bring AttendPAC to your sites.
          </h2>
          <p className="mt-4 max-w-lg text-pac-paper/70">
            One geofenced check-in flow for guards, field staff, and site
            teams — with a live dashboard that tells you who&apos;s on site
            right now, not who clocked in yesterday.
          </p>
          <a href="#contact">
            <Button size="lg" className="mt-8">
              Request a pilot <ArrowRight />
            </Button>
          </a>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <span className="font-label text-primary">Get in touch</span>
            <h2 className="mt-4 font-serif text-3xl">
              Tell us about your <span className="italic text-primary">sites</span>.
            </h2>
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
                <dd>hello@pac.africa</dd>
              </div>
            </dl>
          </div>

          <ContactForm />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-muted-foreground">
          <span className="font-label">
            PAC Africa · Gordian Knotz Technovation · Confidential
          </span>
        </div>
      </footer>
    </div>
  );
}
