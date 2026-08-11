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

/** Annual first, then the rest alphabetically. Annual is the one people plan around. */
const TYPE_ORDER = ["annual", "sick", "compassionate", "unpaid"];

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

  return [...byType.values()].sort((a, b) => {
    const rank =
      (TYPE_ORDER.indexOf(a.leaveType) + 1 || 99) -
      (TYPE_ORDER.indexOf(b.leaveType) + 1 || 99);
    return rank !== 0 ? rank : a.leaveType.localeCompare(b.leaveType);
  });
}
