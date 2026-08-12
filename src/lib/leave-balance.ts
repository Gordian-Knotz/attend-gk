/**
 * Leave balances, computed in one place.
 *
 * Imports nothing, for the same reason `tenant-summary.ts` imports nothing: the
 * `@/` alias does not resolve under `node --test`, and these figures are what
 * somebody plans a holiday around, so they are worth testing without a
 * database.
 *
 * Two rules are deliberate and stated on screen next to the numbers:
 *
 *  - **Calendar days, inclusive.** 12–16 August is five days. Weekends and
 *    public holidays are deducted, because this product's tenants are security
 *    firms, logistics and retail where weekend work is normal — a weekend
 *    inside a leave period genuinely is leave. Working-days counting would let
 *    a guard rostered on Saturdays take leave on a working day for free.
 *  - **Only `approved` reduces a balance.** `pending` is reported separately so
 *    nobody books the same days twice, and so a manager sitting on a request
 *    does not silently consume someone's allowance.
 *
 * Half-day requests are out of scope: `leave_requests` has no such column.
 */

/**
 * The counting rule, in the words shown next to a balance — on the staff
 * page and, once a policy exists to set, on the admin settings card too.
 * Kept here rather than duplicated at each call site: this sentence
 * describes exactly what `countLeaveDays` does below, and prose describing
 * behaviour that lives somewhere else is exactly the kind of thing that
 * drifts out of sync with the code the moment either one changes alone.
 */
export const LEAVE_COUNTING_RULE =
  "Leave is counted in calendar days, including weekends but excluding public " +
  "holidays. Only approved requests reduce your balance; pending ones are " +
  "shown separately.";

/**
 * Formats a day count for display, to at most one decimal place.
 *
 * `days_granted` and `days_carried` are `numeric(5,1)`, and a tenth is not
 * exactly representable in binary floating point — so summing them across an
 * organization can surface artifacts like `20.999999999`. Halves are exact and
 * were never the hazard; tenths are, and `upsertLeavePolicy` accepts them.
 *
 * `Number(...)` after `toFixed` so a whole number renders as `21`, not `21.0`.
 * Shared rather than written per surface: the staff page and the admin report
 * print the same figures, and two formatters would eventually disagree on the
 * same number in the same way two balance implementations would.
 */
export function formatLeaveDays(days: number): string {
  return String(Number(days.toFixed(1)));
}

export type EntitlementRow = {
  leave_type: string;
  days_granted: number;
  days_carried: number;
};

export type LeaveRequestRow = {
  leave_type: string;
  /** `YYYY-MM-DD` — a Postgres `date`, no time component. */
  start_date: string;
  end_date: string;
  status: string;
};

/**
 * How an entitlement becomes available over the year.
 *
 * `annual` — the whole allowance exists from 1 January. Today's behaviour and
 * the default, so an org that never opts in sees no change.
 *
 * `monthly` — one twelfth per COMPLETED month. The current month is not yet
 * earned: crediting it on the 1st would let someone take the leave and leave
 * the company owing it.
 */
export type AccrualMode = "annual" | "monthly";

/**
 * Fraction of an annual entitlement earned by a given point in the year.
 *
 * `asOfMonth` is 1-12 and comes from the org's timezone, never the host clock.
 * Returns whole days rounded to one decimal, matching `numeric(5,1)` — an
 * accrued figure with fourteen decimal places is not a number anyone can check
 * against a payslip.
 *
 * A mid-year joiner should accrue from their start month rather than January.
 * That needs `employees.employment_start_date`, which is HR suite piece 1 and
 * DOES NOT EXIST YET. Until it does, everyone accrues from January, and the UI
 * says so rather than implying a precision that is not there.
 */
export function accruedDays(
  annualDays: number,
  mode: AccrualMode,
  asOfMonth: number
): number {
  if (mode !== "monthly") return annualDays;

  // Clamped rather than trusted: a month outside 1-12 means the caller derived
  // it wrongly, and silently crediting a negative or a thirteenth month would
  // be worse than pinning it.
  const completed = Math.min(12, Math.max(0, Math.floor(asOfMonth) - 1));
  return Math.round(((annualDays * completed) / 12) * 10) / 10;
}

export type LeaveBalance = {
  leaveType: string;
  granted: number;
  carried: number;
  taken: number;
  pending: number;
  /** null means tracked but not budgeted — no entitlement exists for this type. */
  remaining: number | null;
};

/**
 * An explicit order for these four types — annual first, since it's the one
 * people plan around — with any other type falling back to alphabetical
 * order after them. See `compareLeaveTypes` below, which is what actually
 * applies this.
 */
const TYPE_ORDER = ["annual", "sick", "compassionate", "unpaid"];

/**
 * Orders leave types the way every screen that lists more than one of them
 * should — exported so the admin utilization table and the staff balance
 * card can't drift into disagreeing about which type comes first, the same
 * way `buildLeaveBalances` itself is shared so their numbers can't drift.
 */
export function compareLeaveTypes(a: string, b: string): number {
  const rank = (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99);
  return rank !== 0 ? rank : a.localeCompare(b);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared empty set, so the default argument allocates nothing per call. */
const EMPTY_HOLIDAYS: ReadonlySet<string> = new Set<string>();

/**
 * Parses `YYYY-MM-DD` to a UTC midnight timestamp.
 *
 * Deliberately not `new Date(str)` with a local-time fallback: differencing two
 * UTC midnights is immune to DST and to the server's timezone, which is exactly
 * the class of bug `src/lib/timezone.ts` exists to prevent. Returns NaN on
 * anything that is not three integers.
 */
function utcMidnight(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return Number.NaN;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

/**
 * Calendar days between two dates inclusive, minus any public holiday falling
 * inside the range.
 *
 * `holidays` is a set of `YYYY-MM-DD` strings and is **passed in, never fetched
 * here**. Keeping this module free of I/O is what lets the whole balance be
 * tested under `node --test` with no database, which is the property it exists
 * for. An empty set reproduces the original behaviour exactly.
 *
 * Weekends are still counted. Only holidays were excluded — the original
 * reasoning for weekends (guards and logistics staff work them, so a weekend
 * inside a leave period genuinely is leave) was never reversed.
 *
 * Exclusion is unconditional and does not consult the roster. A leave request
 * spanning a holiday is not charged for it whether or not the person would have
 * been rostered, because roster-matched counting would make the same request
 * count differently depending on when you looked — `shifts` is only populated
 * about a fortnight ahead. A balance that moves on its own is worse than a
 * simple rule stated plainly.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  holidays: ReadonlySet<string> = EMPTY_HOLIDAYS
): number {
  const start = utcMidnight(startDate);
  const end = utcMidnight(endDate);

  // Zero rather than NaN or a negative: a NaN would propagate through the whole
  // balance and render as "NaN days remaining", which is worse than a request
  // that appears to cost nothing and can be spotted.
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;

  const total = Math.round((end - start) / DAY_MS) + 1;
  if (holidays.size === 0) return total;

  // Walk the range rather than filtering the holiday set: the set is every
  // holiday the org knows about across all years, and a request is a handful of
  // days. Iterating the shorter side also means a holiday outside the range
  // cannot subtract anything, which is its own easy bug.
  let holidayCount = 0;
  for (let t = start; t <= end; t += DAY_MS) {
    if (holidays.has(new Date(t).toISOString().slice(0, 10))) holidayCount += 1;
  }

  return total - holidayCount;
}

export function buildLeaveBalances(input: {
  year: number;
  entitlements: EntitlementRow[];
  requests: LeaveRequestRow[];
  /**
   * `YYYY-MM-DD` public holidays, national plus this org's own. Optional so
   * every existing caller keeps its current behaviour until it passes them.
   *
   * Note that supplying these **retroactively changes historical balances** —
   * there is no stored `days_taken` to freeze, by design. Movement is always in
   * the employee's favour: days come back, never get taken away.
   */
  holidays?: ReadonlySet<string>;
  /**
   * Per leave type, how the entitlement accrues. Types absent from the map keep
   * the default `annual`, so an org with no accrual policy behaves exactly as
   * before.
   */
  accrual?: ReadonlyMap<string, AccrualMode>;
  /**
   * Month 1-12 in the ORG's timezone, for accrual only. Required for `monthly`
   * to mean anything; ignored entirely under `annual`.
   */
  asOfMonth?: number;
}): LeaveBalance[] {
  const {
    year,
    entitlements,
    requests,
    holidays = EMPTY_HOLIDAYS,
    accrual,
    asOfMonth = 12,
  } = input;

  const byType = new Map<string, LeaveBalance>();

  const ensure = (leaveType: string): LeaveBalance => {
    let balance = byType.get(leaveType);
    if (!balance) {
      balance = {
        leaveType,
        granted: 0,
        carried: 0,
        taken: 0,
        pending: 0,
        remaining: null,
      };
      byType.set(leaveType, balance);
    }
    return balance;
  };

  for (const entitlement of entitlements) {
    const balance = ensure(entitlement.leave_type);

    // Carried days are NOT accrued. They were earned in a previous year and are
    // available in full on 1 January; accruing them would take back days
    // somebody had already worked for.
    balance.granted = accruedDays(
      Number(entitlement.days_granted) || 0,
      accrual?.get(entitlement.leave_type) ?? "annual",
      asOfMonth
    );
    balance.carried = Number(entitlement.days_carried) || 0;
  }

  for (const request of requests) {
    // `countLeaveDays` already returns 0 for an unparseable or reversed range,
    // so this one check screens out both bad data and empty ranges before the
    // year is read. Do NOT guard with `utcMidnight(x) !== Number.NaN` — that
    // comparison is always true, because NaN is not equal to itself.
    const days = countLeaveDays(request.start_date, request.end_date, holidays);
    if (days === 0) continue;

    // Attributed to the year its start date falls in. A request spanning New
    // Year therefore belongs wholly to the year it began — simple, and stated
    // rather than split silently.
    if (Number(request.start_date.slice(0, 4)) !== year) continue;

    const balance = ensure(request.leave_type);
    if (request.status === "approved") balance.taken += days;
    else if (request.status === "pending") balance.pending += days;
    // rejected and cancelled count for nothing, deliberately.
  }

  // `remaining` stays null for a type with no entitlement — tracked, not
  // budgeted. That is how sick leave behaves unless an org adds a policy row.
  for (const balance of byType.values()) {
    const hasEntitlement = entitlements.some(
      (e) => e.leave_type === balance.leaveType
    );
    balance.remaining = hasEntitlement
      ? balance.granted + balance.carried - balance.taken
      : null;
  }

  return [...byType.values()].sort((a, b) => compareLeaveTypes(a.leaveType, b.leaveType));
}
