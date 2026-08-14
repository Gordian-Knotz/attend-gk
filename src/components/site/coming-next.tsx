import { ROADMAP } from "@/lib/roadmap";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";

/**
 * What is being built next.
 *
 * ── The point of this section ────────────────────────────────────────────
 *
 * Five of these were advertised on this page as though they already existed:
 * a native mobile app, support for "the fingerprint or face scanners you
 * already have", selfie verification, shift swaps and overtime rules. They came
 * out, and this is where they go instead. A buyer choosing a young vendor wants
 * to know the direction; they do not want to discover on the first sales call
 * that a headline feature is imaginary.
 *
 * ── Why it reads from src/lib/roadmap.ts ─────────────────────────────────
 *
 * The same array renders on the admin and staff dashboards. One list means the
 * marketing page and the product physically cannot disagree about what is
 * coming — and when something ships it leaves ROADMAP, disappears from here, and
 * moves into the feature list in the same commit. That is the mechanism that
 * stops the site drifting ahead of the product a second time.
 *
 * No audience filter: a prospect is neither an admin nor staff, so they see all
 * of it.
 *
 * NO DATES. Every one of these is specced and unstarted, and a date nobody can
 * hold would be the same mistake in a new costume.
 */
export function ComingNext() {
  if (ROADMAP.length === 0) return null;

  return (
    <section id="coming-next" className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-center gap-3">
        <RevealHeading className="font-display text-3xl">
          Being built next
        </RevealHeading>
        <Badge variant="proposed">Not available yet</Badge>
      </div>
      <p className="mt-4 max-w-lg text-muted-foreground">
        Specced and in progress. Nothing here works today, and we would rather
        say so than let you find out later.
      </p>
      <Separator className="mt-4 mb-8" />

      <Reveal>
        <dl className="border-t-2 border-foreground/80">
          {ROADMAP.map((item) => (
            <div
              key={item.title}
              className="border-b border-border py-3.5 last:border-0 sm:grid sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6"
            >
              <dt className="text-sm font-medium">{item.title}</dt>
              <dd className="mt-1 text-sm text-muted-foreground sm:mt-0">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <p className="mt-6 text-sm text-muted-foreground">
        If one of these decides whether Activ-HR works for you, say so in the
        form below and it moves up the list.
      </p>
    </section>
  );
}
