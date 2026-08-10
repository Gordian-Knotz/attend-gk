import { Plus } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/motion/reveal";
import { RevealHeading } from "@/components/motion/reveal-heading";

const FAQS = [
  [
    "Is AttendPAC free to try?",
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
    "Yes. Approved hours export as CSV, or pull them directly via the AttendPAC API.",
  ],
  [
    "What devices can my team use to clock in?",
    "A phone browser with GPS, or a shared kiosk with QR scan. Native mobile apps and integration with fingerprint and face terminals are on the roadmap, not available today.",
  ],
  [
    "Can staff request shift swaps?",
    "Yes. Staff request a swap from the schedule screen, and their manager approves or denies it before it takes effect.",
  ],
  [
    "Is there a limit on how many sites or staff I can add?",
    "No. AttendPAC scales from a single site to a multi-site organization, with role-based access for every level of your team.",
  ],
] as const;

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
      <RevealHeading className="font-serif text-3xl">
        Got questions? <span className="italic text-primary">We&apos;ve got answers</span>
      </RevealHeading>
      <p className="mt-4 text-muted-foreground">
        Everything worth knowing before you get started.
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
