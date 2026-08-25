import type { Paystub } from './types'
import { addDays, todayNY } from './dates'

// NY DBL + PFL employer coverage trigger for a household employer.
//
// The controlling text is Workers' Compensation Law § 202(2):
//
//   "an employer shall become a covered employer from and after the expiration
//    of four weeks following the employment of one or more personal or domestic
//    employees who work for a minimum of twenty hours per week for such
//    employer and are employed on each of at least thirty days in any calendar
//    year."
//
// So coverage attaches when BOTH conditions hold, four weeks later:
//   (a) 20+ hours in a week, and
//   (b) 30+ days worked in a calendar year.
//
// Two figures that look like coverage triggers are NOT:
//   - "26 consecutive weeks" (WCL § 203, 12 NYCRR 380-2.5) is the waiting
//     period before an *employee* may claim benefits from an already-covered
//     employer.
//   - "175 days in 52 weeks" is a condition on the PFL-Waiver form, i.e. part
//     of the employee-eligibility / waiver question, not employer coverage.
// Both are surfaced below as context, never as the trigger.
//
// § 202(2) is written per-week with no averaging window. The only averaging
// method NY publishes is 8 weeks (Form PFL-Waiver, p.2), so we evaluate the
// worst-case single week AND the 8-week average and act on whichever fires
// first. Averaging over a longer window would produce false negatives in the
// direction where penalties live: eight summer weeks at 40 hrs followed by
// eighteen weeks at 4 hrs averages 15.1 hrs/wk over 26 weeks, but coverage
// legally attached four weeks into the 40-hour stretch.
//
// Sources:
//   https://law.justia.com/codes/new-york/wkc/article-9/202/
//   https://www.wcb.ny.gov/content/main/coverage-requirements-db/db-coverage-required.jsp
//   https://www.wcb.ny.gov/content/main/forms/PFLDocs/PFLWaiver.pdf

const HRS_THRESHOLD = 20
const HRS_WARN_THRESHOLD = 18       // start warning a couple hours under the cliff
const DAYS_IN_YEAR_THRESHOLD = 30   // § 202(2) second condition
const AVG_WINDOW_WEEKS = 8          // NY's published averaging window
const WAIVER_DAYS_THRESHOLD = 175   // PFL-Waiver condition, informational only

export type CoverageStatus = 'ok' | 'approaching' | 'exceeded'

// Exactly the columns this module reads. Narrower than Paystub on purpose: the
// caller's `select()` previously omitted daily_hours and an `as Paystub[]` cast
// hid it, so every day count silently fell back to the one-per-stub proxy.
export type CoverageStub = Pick<Paystub, 'pay_date' | 'hours_worked' | 'daily_hours'>

export interface CoverageWatch {
  status: CoverageStatus
  /** Highest single-week hours in the averaging window — the § 202(2) test. */
  peak_weekly_hours: number
  /** Average hours per week over the last 8 weeks, divided by weeks with data. */
  avg_hrs_last_8_weeks: number
  /** Distinct days worked in the current calendar year — § 202(2) condition (b). */
  days_worked_this_year: number
  /** Distinct days worked in the trailing 52 weeks — PFL-Waiver context. */
  days_worked_last_52_weeks: number
  /** True when the day count is a stub-count proxy because daily_hours is absent. */
  days_are_approximate: boolean
  message: string
}

/** Sunday-anchored week key for a YYYY-MM-DD date, as a YYYY-MM-DD string. */
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(dateStr, -dow)
}

/**
 * Expands stubs into per-day hours worked. Uses daily_hours when present
 * (populated since the daily-entry feature); otherwise attributes the stub's
 * total to its pay_date as a single day. The fallback undercounts days, which
 * errs toward "not covered" — so `days_are_approximate` is reported alongside
 * so callers can say so rather than implying precision.
 */
function expandToDays(stubs: CoverageStub[]): { days: Map<string, number>; approximate: boolean } {
  const days = new Map<string, number>()
  let approximate = false

  for (const stub of stubs) {
    const daily = stub.daily_hours as Record<string, number> | null | undefined
    if (daily && Object.keys(daily).length > 0) {
      for (const [date, hrs] of Object.entries(daily)) {
        const h = Number(hrs)
        if (h > 0) days.set(date, (days.get(date) ?? 0) + h)
      }
    } else {
      const h = Number(stub.hours_worked)
      if (h > 0) {
        approximate = true
        days.set(stub.pay_date, (days.get(stub.pay_date) ?? 0) + h)
      }
    }
  }

  return { days, approximate }
}

export function computeCoverageWatch(stubs: CoverageStub[], todayStr: string = todayNY()): CoverageWatch {
  const { days, approximate } = expandToDays(stubs)

  // § 202(2)(b): days worked in the current calendar year.
  const yearStart = `${todayStr.substring(0, 4)}-01-01`
  const daysThisYear = [...days.keys()].filter(d => d >= yearStart && d <= todayStr).length

  // PFL-Waiver context: days worked in the trailing 52 weeks.
  const cutoff52 = addDays(todayStr, -52 * 7)
  const days52 = [...days.keys()].filter(d => d > cutoff52 && d <= todayStr).length

  // § 202(2)(a): hours per calendar week over the averaging window.
  const cutoff8 = addDays(todayStr, -AVG_WINDOW_WEEKS * 7)
  const byWeek = new Map<string, number>()
  for (const [date, hrs] of days) {
    if (date <= cutoff8 || date > todayStr) continue
    const wk = weekStart(date)
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + hrs)
  }

  const weekTotals = [...byWeek.values()]
  const peakWeekly = weekTotals.length > 0 ? Math.max(...weekTotals) : 0
  // Divide by weeks that actually have data, not a fixed constant — a fixed
  // divisor understates the average for any tenure shorter than the window.
  const avgHrs = weekTotals.length > 0
    ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length
    : 0

  const round1 = (n: number) => Math.round(n * 10) / 10
  const daysNote = approximate
    ? ' Note: the day count is approximate, because some stubs have no per-day breakdown.'
    : ''

  let status: CoverageStatus = 'ok'
  let message = ''

  const hoursTriggered = peakWeekly >= HRS_THRESHOLD || avgHrs >= HRS_THRESHOLD
  const daysTriggered = daysThisYear >= DAYS_IN_YEAR_THRESHOLD

  if (hoursTriggered && daysTriggered) {
    status = 'exceeded'
    message =
      `She hit ${round1(peakWeekly)} hrs in a single week (${round1(avgHrs)} hrs/wk average over the last ` +
      `${AVG_WINDOW_WEEKS} weeks) and has worked ${daysThisYear} days this calendar year. Both WCL § 202(2) ` +
      `conditions are met (20+ hrs/wk and 30+ days/yr), so NY DBL + PFL coverage becomes mandatory four weeks ` +
      `after the qualifying week. Quote a policy through NYSIF or a private carrier and start withholding PFL.${daysNote}`
  } else if (hoursTriggered) {
    status = 'approaching'
    message =
      `She hit ${round1(peakWeekly)} hrs in a single week (limit 20), but has worked only ${daysThisYear} days ` +
      `this calendar year (30 needed). WCL § 202(2) requires both, so coverage is not yet mandatory. It becomes ` +
      `mandatory on day 30 if the 20+ hr weeks continue.${daysNote}`
  } else if (peakWeekly >= HRS_WARN_THRESHOLD || avgHrs >= HRS_WARN_THRESHOLD) {
    status = 'approaching'
    message =
      `Coverage threshold approaching: peak ${round1(peakWeekly)} hrs in a week and ${round1(avgHrs)} hrs/wk ` +
      `average over the last ${AVG_WINDOW_WEEKS} weeks (limit 20), ${daysThisYear} days worked this calendar ` +
      `year (limit 30). If she crosses both, NY DBL + PFL coverage becomes mandatory.${daysNote}`
  } else if (days52 >= WAIVER_DAYS_THRESHOLD) {
    // Not a coverage trigger, but it voids the PFL waiver, so it is worth saying.
    status = 'approaching'
    message =
      `She has worked ${days52} days in the last 52 weeks, past the 175-day condition on the PFL waiver form. ` +
      `This is not itself an employer coverage trigger (WCL § 202(2) needs 20+ hrs/wk as well, and she is at ` +
      `${round1(peakWeekly)} hrs peak), but any signed PFL waiver no longer holds. Re-check her eligibility.${daysNote}`
  }

  return {
    status,
    peak_weekly_hours: round1(peakWeekly),
    avg_hrs_last_8_weeks: round1(avgHrs),
    days_worked_this_year: daysThisYear,
    days_worked_last_52_weeks: days52,
    days_are_approximate: approximate,
    message,
  }
}
