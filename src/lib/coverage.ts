import type { Paystub } from './types'

// NY DBL + PFL coverage threshold per WCB rule
// (https://www.wcb.ny.gov/content/main/coverage-requirements-db/household-employers.jsp):
//
//   "Disability and Paid Family Leave benefits coverage is not required if the
//   only people who work for the household are domestic workers in a private
//   household who individually work less than 20 hours per week for that
//   household and do not live on premises."
//
// In practice this resolves to two triggers — coverage becomes mandatory if
// EITHER hits:
//   (a) 20+ hrs/wk averaged over 26 consecutive weeks (per PFL eligibility
//       rules — paidfamilyleave.ny.gov/eligibility), OR
//   (b) 175+ days worked in any 52-week window
//
// The second is harder to evaluate without daily-hours persistence; this
// helper uses stub count in the last 52 weeks as a coarse proxy
// (each stub ≈ at least 1 day worked).

const HRS_THRESHOLD = 20
const HRS_WARN_THRESHOLD = 18  // start warning a couple hours under the cliff
const DAYS_THRESHOLD = 175
const DAYS_WARN_THRESHOLD = 150

export type CoverageStatus = 'ok' | 'approaching' | 'exceeded'

export interface CoverageWatch {
  status: CoverageStatus
  avg_hrs_last_26_weeks: number
  approx_days_last_52_weeks: number
  message: string
}

export function computeCoverageWatch(stubs: Paystub[], today: Date = new Date()): CoverageWatch {
  // Window 1: last 26 weeks for hours-per-week average.
  const week26Cutoff = new Date(today)
  week26Cutoff.setDate(week26Cutoff.getDate() - 26 * 7)
  const cutoff26 = week26Cutoff.toISOString().slice(0, 10)
  const last26 = stubs.filter(s => s.pay_date >= cutoff26)
  const totalHrs = last26.reduce((sum, s) => sum + Number(s.hours_worked), 0)
  const avgHrs = last26.length > 0 ? totalHrs / 26 : 0

  // Window 2: last 52 weeks for days worked. Each stub with > 0 hours counts
  // as ≥ 1 day worked — undercounts when the babysitter works multiple days a
  // week, but errs on the safe side for the threshold check (if proxy reaches
  // 175 stubs, real days-worked is definitely ≥ 175).
  const week52Cutoff = new Date(today)
  week52Cutoff.setDate(week52Cutoff.getDate() - 52 * 7)
  const cutoff52 = week52Cutoff.toISOString().slice(0, 10)
  const last52WithHours = stubs.filter(s => s.pay_date >= cutoff52 && Number(s.hours_worked) > 0)
  const approxDays = last52WithHours.length

  let status: CoverageStatus = 'ok'
  let message = ''

  if (avgHrs >= HRS_THRESHOLD || approxDays >= DAYS_THRESHOLD) {
    status = 'exceeded'
    if (avgHrs >= HRS_THRESHOLD) {
      message = `She's averaging ${avgHrs.toFixed(1)} hrs/wk over the last 26 weeks (≥ 20 hrs threshold). NY DBL + PFL coverage is now required. Quote a policy through NYSIF or a private carrier and start withholding PFL.`
    } else {
      message = `She's worked ≥ ${approxDays} days in the last 52 weeks (175-day threshold). NY DBL + PFL coverage is now required. Quote a policy through NYSIF or a private carrier and start withholding PFL.`
    }
  } else if (avgHrs >= HRS_WARN_THRESHOLD || approxDays >= DAYS_WARN_THRESHOLD) {
    status = 'approaching'
    message = `Coverage threshold approaching: ${avgHrs.toFixed(1)} hrs/wk avg over 26 weeks (limit 20), ~${approxDays} days/52 weeks (limit 175). If she crosses either, NY DBL + PFL coverage becomes mandatory.`
  }

  return {
    status,
    avg_hrs_last_26_weeks: Math.round(avgHrs * 10) / 10,
    approx_days_last_52_weeks: approxDays,
    message,
  }
}
