/**
 * Per-seat billing, computed in one place.
 *
 * Imports nothing, for the same reason `leave-balance.ts` and
 * `tenant-summary.ts` do not: the `@/` alias does not resolve under
 * `node --test`, and these are the figures an invoice gets printed from.
 *
 * The one rule worth restating here rather than trusting to memory: a seat
 * count is an OVERLAP test against a period, not a snapshot at the period's
 * end. `employment_end_date` only has to be on or after `periodStart` — an
 * employee who leaves mid-period is billed in full for that period and
 * excluded from the next one. There is no proration in either direction.
 */

export type BillableEmployee = {
  role: string;
  /** `YYYY-MM-DD`, or null meaning "employed since before this window." */
  employment_start_date: string | null;
  /** `YYYY-MM-DD`, or null meaning "still employed." */
  employment_end_date: string | null;
};

export type BillingPeriod = {
  /** `YYYY-MM-DD`, inclusive. */
  periodStart: string;
  periodEnd: string;
};

const BILLABLE_ROLES = new Set(["staff", "manager"]);

export const BILLING_COUNTING_RULE =
  "A seat is any staff member or manager who overlapped this period at all — never an organization admin or the vendor. Seats are counted once per period; there is no proration, so joining or leaving mid-period still bills the whole period.";

export function isBillableSeat(
  employee: BillableEmployee,
  period: BillingPeriod
): boolean {
  if (!BILLABLE_ROLES.has(employee.role)) return false;

  // String comparison is safe here: both sides are YYYY-MM-DD, which sorts
  // identically as text and as a date.
  if (employee.employment_start_date && employee.employment_start_date > period.periodEnd) {
    return false;
  }
  if (employee.employment_end_date && employee.employment_end_date < period.periodStart) {
    return false;
  }
  return true;
}

export function countBillableSeats(
  employees: BillableEmployee[],
  period: BillingPeriod
): number {
  return employees.filter((e) => isBillableSeat(e, period)).length;
}

/**
 * Rounds to the nearest cent via integer-cent arithmetic, rather than
 * trusting `seats * unitPriceUsd` to land exactly on two decimal places —
 * IEEE 754 does not guarantee that, and an invoice is the wrong place to
 * find out.
 *
 * The `+ Number.EPSILON` is load-bearing, not decorative: `1 * 1.005 * 100`
 * evaluates to `100.49999999999999` in IEEE 754, one ULP short of the
 * `100.5` the decimal math implies, so a plain `Math.round` truncates it to
 * `$1.00` instead of `$1.01`. Adding `Number.EPSILON` before rounding nudges
 * only that class of near-miss back across the boundary without moving any
 * value that wasn't already sitting on it.
 */
export function invoiceAmount(seats: number, unitPriceUsd: number): number {
  return Math.round((seats * unitPriceUsd + Number.EPSILON) * 100) / 100;
}

export function formatUsd(amountUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountUsd);
}

/**
 * The calendar month containing `todayKey`, as a billing period.
 *
 * Takes a `YYYY-MM-DD` string rather than a `Date`, so the caller resolves
 * "today" through the org timezone (`localDateKey(new Date())`, as the
 * leave and settings pages already do) before this function ever runs —
 * exactly the boundary `tenant-summary.ts` draws for the same reason.
 *
 * Internally uses `Date.UTC` purely for "how many days are in this month"
 * arithmetic, which is calendar math, not a timezone conversion — safe
 * regardless of the runtime's local timezone.
 */
export function currentBillingPeriod(todayKey: string): BillingPeriod {
  const [year, month] = todayKey.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    periodStart: `${year}-${pad(month)}-01`,
    periodEnd: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
