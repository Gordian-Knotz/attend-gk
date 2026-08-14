import { Reveal } from "@/components/motion/reveal";

/**
 * The hero: a deployment board.
 *
 * ── Why this, and not an ambient field ───────────────────────────────────
 *
 * An operations manager's morning question is not "did people clock in" but
 * "is every post manned". The board is the thing they actually stare at, so it
 * is the product's value rendered as the hero rather than decoration behind it.
 *
 * It replaces HeroThreads, which was WebGL. The README records that costing
 * **35,970 ms of blocking time** under software rendering — what a
 * GPU-blocklisted visitor or PageSpeed actually gets — and the fix at the time
 * was to skip the hero entirely for those visitors. Swapping an expensive
 * ambient effect for a content-bearing one is a design win and a performance
 * win at once, and it needs no renderer sniffing.
 *
 * ── STATIC AND ILLUSTRATIVE. Do not wire this to data. ───────────────────
 *
 * Every name below is invented. `/` is public and unauthenticated, so a real
 * board would either publish tenant staffing levels to anyone who loads the
 * homepage, or — since RLS has no session to scope by — return nothing and
 * render empty for every visitor. Both are worse than a mockup. The caption
 * says it is an example so nobody mistakes it for live data.
 */

type PostState = "on" | "late" | "empty";

const BOARD: readonly {
  site: string;
  posts: readonly { post: string; state: PostState; who: string; at: string }[];
}[] = [
  {
    site: "Westlands Plaza",
    posts: [
      { post: "Main gate", state: "on", who: "J. Mwangi", at: "05:52" },
      { post: "Loading bay", state: "on", who: "A. Otieno", at: "05:58" },
    ],
  },
  {
    site: "Mombasa Road Depot",
    posts: [
      { post: "Gate 1", state: "late", who: "P. Njoroge", at: "06:41" },
      { post: "Yard patrol", state: "on", who: "S. Kamau", at: "05:47" },
    ],
  },
  {
    site: "Karen Office Park",
    posts: [
      { post: "Reception", state: "on", who: "M. Wanjiru", at: "06:02" },
      { post: "Night post", state: "empty", who: "Nobody clocked in", at: "—" },
    ],
  },
];

const STATE_LABEL: Record<PostState, string> = {
  on: "On post",
  late: "Late",
  empty: "Unmanned",
};

/** Colour carries meaning, so it is never the only carrier — each row also
 *  states its status in words, for colour-blind readers and screen readers. */
const STATE_DOT: Record<PostState, string> = {
  on: "bg-primary",
  late: "bg-transparent border-2 border-primary",
  empty: "bg-transparent border-2 border-dashed border-muted-foreground",
};

export function DeploymentBoard() {
  return (
    <Reveal className="mt-14" distance={16} duration={0.5}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-sm border-2 border-foreground bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-foreground px-4 py-3 sm:px-5">
          <p className="text-sm font-medium">Who is on post</p>
          {/* A fixed string, not a live clock: a rendered timestamp that never
              advances looks broken, and hydrating one to the visitor's clock
              would be motion for its own sake. */}
          <p className="font-mono text-xs text-muted-foreground">
            Example board · 06:45
          </p>
        </div>

        <div>
          {BOARD.map((group) => (
            <div key={group.site} className="border-b border-border last:border-0">
              <p className="bg-secondary/40 px-4 py-1.5 text-xs font-medium text-muted-foreground sm:px-5">
                {group.site}
              </p>

              {group.posts.map((row) => (
                <div
                  key={`${group.site}-${row.post}`}
                  className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${STATE_DOT[row.state]}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {row.post}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                    {row.who}
                  </span>
                  <span
                    className={
                      "shrink-0 text-xs " +
                      (row.state === "empty"
                        ? "text-muted-foreground"
                        : row.state === "late"
                          ? "text-primary"
                          : "text-muted-foreground")
                    }
                  >
                    {STATE_LABEL[row.state]}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {row.at}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
