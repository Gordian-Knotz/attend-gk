import { Reveal } from "@/components/motion/reveal";

const CLIENTS = [
  "Nairobi Facilities Ltd",
  "Coastline Logistics",
  "Savannah Security Co",
  "Rift Valley Retail",
  "Mombasa Freight Co",
] as const;

/**
 * Client band, as a paused-on-hover marquee.
 *
 * Two things worth knowing before editing this.
 *
 * **It moved.** This used to sit directly under the hero. It now sits
 * immediately above the footer, because near the top it was asking for trust
 * before the page had made any claim to corroborate.
 *
 * **The names are still set as type, not chips.** DS-01 is a document format
 * and `--radius` is 0.2rem, so the pill chips the earlier landing page used
 * read as foreign. The motion is the change here; the treatment isn't.
 *
 * The scroll itself is `.marquee-track` in globals.css — CSS rather than
 * React Bits' `LogoLoop`, which doc 07 records as pulled and then removed.
 * With only five names a loop is thin, which is the reason it was dropped the
 * first time; duplicating the list is what makes the belt continuous rather
 * than five names sliding past a gap. Adding real names is still the better
 * fix than tuning the duration.
 */
export function TrustBar() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <Reveal className="mx-auto max-w-6xl py-8">
        <p className="font-label px-6 text-center text-muted-foreground">
          Trusted by growing teams across East Africa
        </p>

        <div className="marquee-mask mt-5 overflow-hidden">
          <div className="marquee-track">
            {/* The second pass is presentational: it exists so the belt has no
                seam. Hidden from assistive tech so the names aren't announced
                twice, and removed outright under reduced motion. */}
            {[false, true].map((isClone) => (
              <ul
                key={isClone ? "clone" : "primary"}
                aria-hidden={isClone || undefined}
                data-marquee-clone={isClone || undefined}
                className="flex shrink-0 items-center gap-x-12 px-6"
              >
                {CLIENTS.map((name) => (
                  <li
                    key={name}
                    className="font-display whitespace-nowrap text-sm text-foreground/70 md:text-base"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
