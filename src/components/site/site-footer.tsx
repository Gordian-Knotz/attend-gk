import Link from "next/link";

/**
 * Columned footer carried over from the earlier landing page. The original
 * had a newsletter form with nothing behind it and links to a Help Center,
 * blog and API docs that don't exist — those are dropped rather than shipped
 * as dead ends. Every link here resolves.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How staff clock in", href: "/#how-it-works" },
      { label: "Roles & access", href: "/#access" },
      { label: "FAQs", href: "/#faq" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "Field services", href: "/#field-services" },
      { label: "Security & guarding", href: "/#security" },
      { label: "Retail & warehousing", href: "/#retail" },
      { label: "Logistics", href: "/#logistics" },
      { label: "Manufacturing", href: "/#manufacturing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Request a pilot", href: "/#contact" },
      { label: "Log in", href: "/login" },
      { label: "Create an organization", href: "/login?mode=sign-up" },
      { label: "hello@pac.africa", href: "mailto:hello@pac.africa" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-primary bg-pac-ink text-pac-paper">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-xl">Attend</span>
              <span className="font-serif text-xl italic text-primary">Pac</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-pac-paper/60">
              Attendance software for teams that work on-site and in the field.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="font-label text-primary">{column.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-pac-paper/70 transition-colors hover:text-pac-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col justify-between gap-2 border-t border-pac-paper/15 pt-6 sm:flex-row">
          <span className="font-label text-pac-paper/50">
            PAC Africa · Gordian Knotz Technovation · Confidential
          </span>
          <span className="font-label text-pac-paper/50">Made in Nairobi</span>
        </div>
      </div>
    </footer>
  );
}
