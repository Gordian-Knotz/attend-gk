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
  "Leave is counted in calendar days, including weekends and public holidays. " +
  "Only approved requests reduce your balance; pending ones are shown separately.";

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

export function countLeaveDays(startDate: string, endDate: string): number {
  const start = utcMidnight(startDate);
  const end = utcMidnight(endDate);

  // Zero rather than NaN or a negative: a NaN would propagate through the whole
  // balance and render as "NaN days remaining", which is worse than a request
  // that appears to cost nothing and can be spotted.
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;

  return Math.round((end - start) / DAY_MS) + 1;
}

export function buildLeaveBalances(input: {
  year: number;
  entitlements: EntitlementRow[];
  requests: LeaveRequestRow[];
}): LeaveBalance[] {
  const { year, entitlements, requests } = input;

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
    balance.granted = Number(entitlement.days_granted) || 0;
    balance.carried = Number(entitlement.days_carried) || 0;
  }

  for (const request of requests) {
    // `countLeaveDays` already returns 0 for an unparseable or reversed range,
    // so this one check screens out both bad data and empty ranges before the
    // year is read. Do NOT guard with `utcMidnight(x) !== Number.NaN` — that
    // comparison is always true, because NaN is not equal to itself.
    const days = countLeaveDays(request.start_date, request.end_date);
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
