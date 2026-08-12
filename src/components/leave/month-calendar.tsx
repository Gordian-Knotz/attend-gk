import { cn } from "@/lib/utils";
import { buildMonthGrid } from "@/lib/leave-calendar";
import type { LeaveRequestRow } from "@/lib/leave-balance";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A month of leave, read-only.
 *
 * No drag-to-request and no editing from the grid: a calendar that can create
 * requests needs its own validation, its own conflict rules and its own
 * permission model, none of which this feature has. Requests are still raised
 * from the leave form.
 *
 * A server component. It takes `today` as a prop rather than reading the clock,
 * so the highlighted day is the org's day and not the host's — the same reason
 * `localDateKey` exists.
 */
export function MonthCalendar({
  year,
  month,
  requests,
  holidays,
  today,
  showCounts = false,
  className,
}: {
  year: number;
  /** 1-12. */
  month: number;
  requests: LeaveRequestRow[];
  holidays: Map<string, string>;
  today: string;
  /** Team view shows how many people are off; a personal view does not. */
  showCounts?: boolean;
  className?: string;
}) {
  const weeks = buildMonthGrid({ year, month, requests, holidays, today });

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">
          {MONTHS[month - 1]} {year}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--pac-orange)]" />
            Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-[var(--pac-orange)]" />
            Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            Holiday
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-sm border border-border bg-border">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-secondary/40 px-1 py-1.5 text-center text-[0.65rem] uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}

        {weeks.flat().map((day) => {
          const hasApproved = day.approved.length > 0;
          const hasPending = day.pending.length > 0;

          return (
            <div
              key={day.date}
              // The holiday name is the title so it is reachable without colour
              // alone carrying the meaning.
              title={day.holidayName ?? undefined}
              className={cn(
                "min-h-[3.25rem] bg-background px-1.5 py-1 text-xs",
                !day.inMonth && "bg-secondary/20 text-muted-foreground/50",
                day.isToday && "ring-1 ring-inset ring-[var(--pac-orange)]"
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className={cn(day.isToday && "font-semibold")}>
                  {Number(day.date.slice(8, 10))}
                </span>
                {day.holidayName && (
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </div>

              {day.inMonth && (hasApproved || hasPending) && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {hasApproved && (
                    <span
                      className="inline-flex items-center gap-1 rounded-sm bg-[var(--pac-orange)]/15 px-1 text-[0.65rem] text-foreground"
                      title={`${day.approved.length} on approved leave`}
                    >
                      <span className="size-1.5 rounded-full bg-[var(--pac-orange)]" />
                      {showCounts ? day.approved.length : "Off"}
                    </span>
                  )}
                  {hasPending && (
                    <span
                      className="inline-flex items-center gap-1 rounded-sm border border-[var(--pac-orange)]/40 px-1 text-[0.65rem] text-muted-foreground"
                      title={`${day.pending.length} awaiting approval`}
                    >
                      {showCounts ? day.pending.length : "Req"}
                    </span>
                  )}
                </div>
              )}

              {day.inMonth && day.holidayName && !hasApproved && !hasPending && (
                <p className="mt-1 truncate text-[0.65rem] text-muted-foreground">
                  {day.holidayName}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
