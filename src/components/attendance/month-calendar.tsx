import { cn } from "@/lib/utils";
import {
  buildAttendanceMonthGrid,
  type AttendanceCheckIn,
  type AttendanceLeaveRow,
} from "@/lib/attendance-calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Small dot indicators, not full-cell color fills — the same visual
 * language `leave/month-calendar.tsx` uses for "approved"/"pending". A
 * present day is unremarkable and carries no badge at all; only the
 * exceptions (late, absent, leave) draw the eye.
 */
const STATUS_DOT: Record<string, string> = {
  late: "bg-[var(--pac-orange)]",
  absent: "bg-destructive",
  on_leave: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  on_leave: "On leave",
};

/**
 * A month of one employee's attendance, read-only.
 *
 * A server component, like its leave counterpart — `today` is a prop, not
 * `new Date()`, so the highlighted day and the absent/blank line are the
 * org's day, not the host's.
 */
export function AttendanceMonthCalendar({
  year,
  month,
  checkIns,
  leave,
  today,
  todaySettled,
  className,
}: {
  year: number;
  /** 1-12. */
  month: number;
  checkIns: AttendanceCheckIn[];
  leave: AttendanceLeaveRow[];
  today: string;
  todaySettled: boolean;
  className?: string;
}) {
  const weeks = buildAttendanceMonthGrid({
    year,
    month,
    checkIns,
    leave,
    today,
    todaySettled,
  });

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">
          {MONTHS[month - 1]} {year}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--pac-orange)]" />
            Late
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" />
            Absent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            On leave
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

        {weeks.flat().map((day) => (
          <div
            key={day.date}
            title={day.status ? STATUS_LABEL[day.status] : undefined}
            className={cn(
              "flex min-h-[2.75rem] flex-col items-center justify-center gap-1 bg-background px-1 py-1 text-xs",
              !day.inMonth && "bg-secondary/20 text-muted-foreground/50",
              day.isToday && "ring-1 ring-inset ring-[var(--pac-orange)]"
            )}
          >
            <span className={cn(day.isToday && "font-semibold")}>
              {Number(day.date.slice(8, 10))}
            </span>
            {day.status && day.status !== "present" && (
              <>
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", STATUS_DOT[day.status])}
                />
                {/* The dot and its `title` attribute both fail on a touch
                    device with no hover — a screen reader needs the status
                    as text, not just color plus a tooltip. */}
                <span className="sr-only">{STATUS_LABEL[day.status]}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
