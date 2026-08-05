import { Reveal } from "@/components/motion/reveal";

const CLIENTS = [
  "Nairobi Facilities Ltd",
  "Coastline Logistics",
  "Savannah Security Co",
  "Rift Valley Retail",
  "Mombasa Freight Co",
] as const;

/**
 * Masthead-style client band. DS-01 is a document format, so these are set
 * as mono rules-and-labels rather than the pill chips the earlier landing
 * page used — pills fight the 0.2rem corner radius the rest of the app uses.
 */
export function TrustBar() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <Reveal className="mx-auto max-w-6xl px-6 py-8">
        <p className="font-label text-center text-muted-foreground">
          Trusted by growing teams across East Africa
        </p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {CLIENTS.map((name) => (
            <li
              key={name}
              className="font-serif text-sm text-foreground/70 md:text-base"
            >
              {name}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
