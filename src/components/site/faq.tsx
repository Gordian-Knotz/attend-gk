import { Plus } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";

const FAQS = [
  [
    "Is Activ-HR free to try?",
    "Yes. Start a free trial for your organization, no credit card required, and upgrade as your team grows.",
  ],
  [
    "Does it work without an internet connection?",
    "Yes. Clock-ins are queued on the device and synced automatically once a connection is available. The timestamp kept is when the person actually clocked in, not when the phone reconnected.",
  ],
  [
    "How is my organization's data kept separate from others?",
    "Every record is scoped to your organization at the database level with row-level security, so no other organization can see or query your data.",
  ],
  [
    "Can I export attendance data to my payroll provider?",
    "Yes. Approved hours export as CSV, filtered by site, role or date range.",
  ],
  [
    "What devices can my team use to clock in?",
    "Any phone with a browser and GPS, or a shared tablet at the gate. Android and iOS apps, and support for fingerprint and face terminals, are being built.",
  ],
  [
    "Can I set up my own management structure?",
    "Yes. Name your own levels: CEO, head of department, supervisor, whatever you actually use. For each one you set how far it can see, from only themselves up to the entire organization.",
  ],
  [
    "Is there a limit on how many sites or staff I can add?",
    "No limit on sites. You pay $3 per employee per month, so the cost follows your headcount rather than a plan tier.",
  ],
] as const;

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
      <RevealHeading className="font-display text-3xl">
        Questions we get asked
      </RevealHeading>
      <p className="mt-4 text-muted-foreground">
        If yours isn&apos;t here, the form below reaches a person.
      </p>
      <Separator className="mt-4 mb-2" />

      <Reveal>
        {FAQS.map(([question, answer]) => (
          <details key={question} className="group border-b border-border py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {question}
              <Plus
                className="size-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                strokeWidth={2}
              />
            </summary>
            <p className="mt-3 pr-8 text-sm leading-relaxed text-muted-foreground">
              {answer}
            </p>
          </details>
        ))}
      </Reveal>
    </section>
  );
}
