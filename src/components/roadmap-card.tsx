import { Sparkles } from "lucide-react";

import { roadmapFor } from "@/lib/roadmap";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * "Coming soon" — what is being built next, shown to the people who will use
 * it.
 *
 * Server-rendered and static: the list is a constant, so there is nothing to
 * fetch and no reason to ship this to the client. Content comes from
 * `src/lib/roadmap.ts`, which both dashboards share.
 *
 * Deliberately last on each page. It is the least urgent thing on a screen
 * whose job is telling somebody who is on site right now.
 */
export function RoadmapCard({ audience }: { audience: "admin" | "staff" }) {
  const items = roadmapFor(audience);

  // An empty roadmap means everything shipped. Render nothing rather than an
  // empty card announcing that there are no plans.
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Sparkles className="size-4" strokeWidth={1.75} />
          </span>
          <CardTitle className="font-display text-xl">Coming soon</CardTitle>
          {/* `proposed` is the dashed, muted variant — the design system
              already had a token meaning "not real yet", which is exactly
              what a roadmap entry is. */}
          <Badge variant="proposed" className="ml-auto">
            In development
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <dl className="border-t-2 border-foreground/80">
          {items.map((item) => (
            <div
              key={item.title}
              className="border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
            >
              <dt className="text-sm font-medium">{item.title}</dt>
              <dd className="mt-0.5 text-sm text-muted-foreground sm:mt-0">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          Dates aren&apos;t fixed yet. Tell us which of these matters most and
          it moves up the list.
        </p>
      </CardContent>
    </Card>
  );
}
