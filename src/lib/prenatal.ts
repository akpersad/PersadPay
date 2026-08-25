import { addDays, todayNY } from './dates'

// NY Paid Prenatal Leave — Labor Law § 196-b(4-a), effective 2025-01-01.
//
// 20 hours of PAID leave at the regular rate. Confirmed applicable to a
// part-time household employee: NY DOL Form P695 (rev. 12-10-24) states, under
// the heading "NO MINIMUM WORK REQUIREMENT", that "You do not need to work a
// minimum number of hours to earn access to Paid Prenatal Leave ... Newly hired
// employees are entitled to 20 hours of paid prenatal leave as soon as they are
// hired." The statute says "every employer", with no size tier and no domestic
// worker exclusion.
//
// The tricky part is the period. It is NOT the calendar year and it is NOT a
// trailing window from today. It is a fixed 52-week period that STARTS on the
// employee's first use, and a fresh period starts on the first use occurring
// after the previous one has expired. P695's own example:
//
//   "if you use your first hour of Paid Prenatal Leave on June 1st, 2025, you
//    have 20 hours available through May 31st, 2026. If after May 31st, you
//    next need to use Paid Prenatal Leave on August 2nd, 2026, that date would
//    trigger the start of another 52-week period."
//
// Unused hours do not carry over, and there is no payout on separation.
//
// Sources:
//   https://dol.ny.gov/system/files/documents/2024/12/p695-paid-prenatal-leave-law-employee-12-10-24.pdf
//   https://www.ny.gov/new-york-state-paid-prenatal-leave/frequently-asked-questions
//   https://www.nysenate.gov/legislation/laws/LAB/196-B

export const PRENATAL_LEAVE_HOURS_PER_PERIOD = 20
// Last day of the window = first use + 364 days, which reproduces P695's own
// example exactly: 2025-06-01 + 364 = 2026-05-31.
const PERIOD_LENGTH_DAYS = 52 * 7

/** One stub's worth of prenatal-leave input. Ordered by the caller or by us. */
export interface PrenatalLeaveUse {
  /** Date the leave is attributed to. Pay date, matching the rest of the app. */
  date: string
  hours: number
}

export interface PrenatalLeavePeriod {
  /** First use that opened this period. */
  start: string
  /** Last day of the 52-week entitlement window. */
  end: string
  hours_used: number
  hours_remaining: number
  /** True if this period covers the as-of date. */
  is_current: boolean
}

export interface PrenatalLeaveBalance {
  /** Every 52-week period opened so far, oldest first. */
  periods: PrenatalLeavePeriod[]
  /** The period containing the as-of date, if one is open. */
  current: PrenatalLeavePeriod | null
  /**
   * Hours still available on the as-of date. Equals the full entitlement when
   * no period is open, because the next use opens a fresh one.
   */
  hours_available: number
  /** True once any leave has ever been recorded. */
  has_history: boolean
}

/**
 * Reconstructs the rolling 52-week periods from a full history of prenatal
 * leave use and reports what is available on `asOf`.
 *
 * Pass every stub with prenatal_leave_hours > 0, in any order.
 */
export function computePrenatalLeaveBalance(
  uses: PrenatalLeaveUse[],
  asOf: string = todayNY(),
): PrenatalLeaveBalance {
  const relevant = uses
    .filter(u => Number(u.hours) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  const periods: PrenatalLeavePeriod[] = []

  for (const use of relevant) {
    const open = periods[periods.length - 1]
    // A use inside the open period draws it down; otherwise it opens a new one.
    if (open && use.date <= open.end) {
      open.hours_used += Number(use.hours)
    } else {
      periods.push({
        start: use.date,
        end: addDays(use.date, PERIOD_LENGTH_DAYS),
        hours_used: Number(use.hours),
        hours_remaining: 0,
        is_current: false,
      })
    }
  }

  for (const p of periods) {
    p.hours_used = Math.round(p.hours_used * 100) / 100
    p.hours_remaining = Math.max(
      0,
      Math.round((PRENATAL_LEAVE_HOURS_PER_PERIOD - p.hours_used) * 100) / 100,
    )
    p.is_current = p.start <= asOf && asOf <= p.end
  }

  const current = periods.find(p => p.is_current) ?? null

  return {
    periods,
    current,
    // With no open period, the next hour taken starts a fresh entitlement.
    hours_available: current ? current.hours_remaining : PRENATAL_LEAVE_HOURS_PER_PERIOD,
    has_history: periods.length > 0,
  }
}

/**
 * Hours available on `asOf` if `excludeDate`'s own use is set aside. Used by the
 * stub form so editing a stub that already records prenatal leave doesn't count
 * that stub against its own remaining balance.
 */
export function availableExcluding(
  uses: PrenatalLeaveUse[],
  excludeDate: string,
  asOf: string = todayNY(),
): number {
  const filtered = uses.filter(u => u.date !== excludeDate)
  return computePrenatalLeaveBalance(filtered, asOf).hours_available
}
