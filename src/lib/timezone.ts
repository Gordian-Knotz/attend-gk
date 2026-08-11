/**
 * The organization's operating timezone.
 *
 * Everything that turns a wall-clock time into an instant — the 7:15 late
 * cutoff, the 9 AM absent cutoff, day bucketing, shift start/end — used to
 * run on whatever timezone the *server process* happened to be in. That is
 * fine on a laptop in Nairobi and wrong the moment this deploys to a host
 * in another region: the same data would classify differently depending on
 * where it was rendered.
 *
 * This is deliberately one app-wide value rather than a per-site column.
 * Adding `sites.timezone` is the real fix for an org operating across
 * zones, and it needs a migration plus UI — see doc 06. This closes the
 * "depends on server locale" defect now, without pretending to solve
 * multi-zone scheduling.
 */
const DEFAULT_TIME_ZONE = "Africa/Nairobi";

/**
 * `Intl.DateTimeFormat` throws on an unrecognised IANA name, and it would
 * throw at render time on every page that formats a date — so an operator
 * typo in this env var shouldn't reach it unvalidated. Checked once, here,
 * rather than on every call to `partsInZone`.
 */
function resolveTimeZone(candidate: string | undefined): string {
  const value = candidate?.trim();
  if (!value) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return value;
  } catch {
    console.warn(
      `Unknown NEXT_PUBLIC_ORG_TIME_ZONE "${value}"; falling back to ${DEFAULT_TIME_ZONE}.`
    );
    return DEFAULT_TIME_ZONE;
  }
}

export const ORG_TIME_ZONE = resolveTimeZone(
  process.env.NEXT_PUBLIC_ORG_TIME_ZONE
);

/** Locale used for every user-facing date, so output is deterministic. */
export const DISPLAY_LOCALE = "en-GB";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInZone(instant: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some ICU builds render midnight as "24" under hour12: false.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Milliseconds that `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * Wall-clock time in `timeZone` → the UTC instant it refers to.
 *
 * Applied twice because the offset itself depends on the instant: the first
 * pass can land on the wrong side of a DST transition. Nairobi has no DST,
 * but this helper should not quietly break if the timezone is reconfigured.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = ORG_TIME_ZONE
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Hour and minute of `instant` as read in `timeZone`. */
export function wallClockIn(
  instant: Date,
  timeZone: string = ORG_TIME_ZONE
): { hour: number; minute: number } {
  const p = partsInZone(instant, timeZone);
  return { hour: p.hour, minute: p.minute };
}

/** `YYYY-MM-DD` for `instant` as read in `timeZone`. */
export function zonedDateKey(
  instant: Date,
  timeZone: string = ORG_TIME_ZONE
): string {
  const p = partsInZone(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Deterministic short date, e.g. "10 Aug 2026". */
export function formatDate(
  value: Date | string,
  timeZone: string = ORG_TIME_ZONE
): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}

/** Deterministic 24-hour time, e.g. "07:04". */
export function formatTime(
  value: Date | string,
  timeZone: string = ORG_TIME_ZONE
): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(DISPLAY_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}
